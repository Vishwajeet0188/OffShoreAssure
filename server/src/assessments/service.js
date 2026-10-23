/* Stage 1 · Step 2 — Validate fields and create Assessment ID (OffshoreAssure engine, internal processing).
   Input: the 32 Step 1 answers + the authenticated user + submission metadata.
   Output: the assessment record with its 15 system fields. */
import { audit } from '../audit.js';
import { query } from '../db.js';
import { validateRequirement, FIELDS } from '../requirements/fields.js';
import { derive, clarifications, contradictions, RULE_PACK_VERSION } from '../engine/rulepack.js';

const label = Object.fromEntries(FIELDS.map(f => [f.key, f.label]));

/* Buyer organisation (Buyer ID) for a user, created from the profile if needed. */
export async function ensureOrganisation(db, name, sector, kind = 'buyer', { withCreated = false } = {}) {
  const n = String(name || '').trim(); if (!n) return null;
  const r = await db.query(
    `INSERT INTO organisations (name, sector, kind) VALUES ($1, $2, $3) ON CONFLICT (kind, (lower(name))) DO UPDATE SET name = organisations.name
     RETURNING id, (xmax = 0) AS created`, [n, sector || null, kind]);
  return withCreated ? r.rows[0] : r.rows[0].id;
}

/* Membership for a user joining an organisation: owner if they create it (or nobody is active in it), otherwise pending. */
export async function membershipFor(db, orgId, created, userId) {
  if (created) return 'owner';
  const active = (await db.query(`SELECT 1 FROM user_profiles WHERE organisation_id = $1 AND membership IN ('owner', 'member') AND user_id <> $2 LIMIT 1`, [orgId, userId])).rows[0];
  return active ? 'pending' : 'owner';
}

/* Buyer ID for a user: only returned when the user is an approved member (owner or member) of the organisation. */
export async function buyerOrganisation(db, userId) {
  const p = (await db.query('SELECT organisation_id, organisation_name, sector, membership FROM user_profiles WHERE user_id = $1', [userId])).rows[0];
  if (!p) return null;
  if (!p.organisation_id) {
    const o = await ensureOrganisation(db, p.organisation_name, p.sector, 'buyer', { withCreated: true });
    if (!o) return null;
    const m = await membershipFor(db, o.id, o.created, userId);
    await db.query('UPDATE user_profiles SET organisation_id = $2, membership = $3 WHERE user_id = $1', [userId, o.id, m]);
    return ['owner', 'member'].includes(m) ? o.id : null;
  }
  return ['owner', 'member'].includes(p.membership) ? p.organisation_id : null;
}

/* Express middleware for buyer features: the user must be an approved member of their organisation. */
export async function requireActiveMembership(req, res, next) {
  const p = (await query('SELECT membership, organisation_name FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0];
  if (p && ['pending', 'rejected'].includes(p.membership)) {
    return res.status(403).json({ error: 'membership_' + p.membership, message: p.membership === 'pending'
      ? `Your request to join ${p.organisation_name} is waiting for approval by its owner.`
      : `Your request to join ${p.organisation_name} was not approved. Change your organisation in your profile or contact the OffshoreAssure team.` });
  }
  next();
}

/* Engine checks without saving anything. status: VALID | INCOMPLETE | INVALID. */
export async function evaluate(db, data, { buyerId, requirementId } = {}) {
  const v = validateRequirement(data);
  const errors = Object.entries(v.errors).map(([field, reason]) => ({ field, label: label[field] || field, reason }));
  const missing = v.missing.map(m => ({ field: m.field, label: m.label, reason: m.reason }))
    .concat(clarifications(v.values).map(c => ({ ...c, label: label[c.field] })));
  const status = errors.length ? 'INVALID' : missing.length ? 'INCOMPLETE' : 'VALID';
  const derived = errors.length ? null : derive(v.values);
  const conflicts = contradictions(v.values);
  let duplicateOf = null;
  if (buyerId && v.values.assessmentTitle) {
    duplicateOf = (await db.query(
      `SELECT a.reference FROM assessments a JOIN requirements r ON r.id = a.requirement_id
        WHERE a.buyer_id = $1 AND lower(r.title) = lower($2) AND r.data->>'serviceCategory' = $3 AND a.requirement_id <> COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000')
          AND a.created_at > now() - interval '30 days' ORDER BY a.created_at DESC LIMIT 1`,
      [buyerId, v.values.assessmentTitle, v.values.serviceCategory || '', requirementId || null])).rows[0]?.reference || null;
  }
  return { status, values: v.values, errors, missing, requiredMissing: v.missing, derived, contradictions: conflicts, duplicateOf, flags: v.flags };
}

const prefixFor = (country, year) => `OA-${country === 'GB' ? 'UK' : country || 'XX'}-${year}`;

/* Creates the assessment for a requirement (once). A repeated request with the same idempotency key, or for the same
   requirement, returns the existing assessment instead of creating a duplicate. Runs inside the caller's transaction. */
export async function createAssessment(db, req, { requirement, buyerId, evaluation, idempotencyKey }) {
  const key = String(idempotencyKey || 'requirement:' + requirement.id).slice(0, 200);
  const existing = (await db.query('SELECT * FROM assessments WHERE requirement_id = $1 OR idempotency_key = $2 LIMIT 1', [requirement.id, key])).rows[0];
  if (existing) return { assessment: existing, created: false };
  const e = evaluation, d = e.derived;
  const prefix = prefixFor(e.values.buyerCountry, new Date().getUTCFullYear());
  const n = (await db.query(`INSERT INTO assessment_counters (prefix, last) VALUES ($1, 1) ON CONFLICT (prefix) DO UPDATE SET last = assessment_counters.last + 1 RETURNING last`, [prefix])).rows[0].last;
  const reference = `${prefix}-${String(n).padStart(6, '0')}`;
  const findings = { reasons: d.reasons, riskProvisional: d.riskProvisional, legalScreening: d.legalScreening, contradictions: e.contradictions, duplicateOf: e.duplicateOf, flags: e.flags,
    note: 'Applicability screening, not a final legal determination. To be cross-checked by the internal legal team.' };
  const a = (await db.query(
    `INSERT INTO assessments (reference, requirement_id, buyer_id, created_by, service_code, data_classification, risk_tier, jurisdiction_packs, rule_pack_version,
       vendor_assessment_required, contract_review_required, transfer_review_required, validation_status, missing_fields, findings, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [reference, requirement.id, buyerId, req.user.id, d.serviceCode, d.dataClassification, d.riskTier, d.jurisdictionPacks, RULE_PACK_VERSION,
      d.vendorAssessmentRequired, d.contractReviewRequired, d.transferReviewRequired, e.status, JSON.stringify(e.missing), JSON.stringify(findings), key])).rows[0];
  await audit(req, 'assessment.created', { db, stage: 'stage-1', ref: reference, detail: {
    requirementId: requirement.id, reference, title: requirement.title || e.values.assessmentTitle, validationStatus: e.status, riskTier: d.riskTier, rulePackVersion: RULE_PACK_VERSION } });
  return { assessment: a, created: true };
}

/* The 15 system fields (camelCase) plus explanations, for the API and the UI. */
export function shapeAssessment(a, extra = {}) {
  return {
    id: a.id, reference: a.reference, buyerId: a.buyer_id, requirementId: a.requirement_id, requirementVersion: a.requirement_version,
    createdAt: a.created_at, createdBy: a.created_by, serviceCode: a.service_code, dataClassification: a.data_classification,
    riskTier: a.risk_tier, jurisdictionPacks: a.jurisdiction_packs, rulePackVersion: a.rule_pack_version,
    vendorAssessmentRequired: a.vendor_assessment_required, contractReviewRequired: a.contract_review_required, transferReviewRequired: a.transfer_review_required,
    validationStatus: a.validation_status, missingFields: a.missing_fields, findings: a.findings, ...extra
  };
}

/* Output in the format given in the Stage 1 specification (Step 2 example). */
export function specOutput(a, personalData) {
  return {
    assessment_id: a.reference, validation_status: a.validation_status, service: a.service_code,
    personal_data: personalData === 'Yes' ? true : personalData === 'No' ? false : null,
    vendor_assessment_required: a.vendor_assessment_required, contract_review_required: a.contract_review_required,
    transfer_review_required: a.transfer_review_required, missing_fields: a.missing_fields.map(m => m.field)
  };
}
