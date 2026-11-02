/* Stage 1 · Step 2 APIs (names from the specification): POST /assessments/validate and POST /assessments.
   Buyers only. Assessments are visible to every user of the buyer organisation. */
import { Router } from 'express';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth } from '../auth/session.js';
import { buyerOrganisation, evaluate, createAssessment, shapeAssessment, specOutput, requireActiveMembership } from './service.js';
import { ensureProfile, loadProfiles, correctProfile, issueSummary, buildSummary, stable } from './profile.js';

export const assessmentsRouter = Router();
assessmentsRouter.use(requireAuth);
assessmentsRouter.use((req, res, next) => req.user.role !== 'buyer'
  ? res.status(403).json({ error: 'buyers_only', message: req.user.is_admin ? 'Assessments are created by buyers. Use the admin console.' : 'This area is for buyers. Vendors use the vendor portal.' }) : next());
assessmentsRouter.use(requireActiveMembership);

const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
async function ownRequirement(db, req, id) {
  if (!isUuid(id)) return null;
  return (await db.query('SELECT * FROM requirements WHERE id = $1 AND created_by = $2', [id, req.user.id])).rows[0] || null;
}
const noOrg = res => res.status(403).json({ error: 'no_organisation', message: 'Complete your profile with your organisation before submitting.' });

/* Dry run: the engine checks, nothing is saved. Body: { requirementId } or { data }. */
assessmentsRouter.post('/validate', async (req, res) => {
  const buyerId = await buyerOrganisation({ query }, req.user.id); if (!buyerId) return noOrg(res);
  let data = req.body?.data, requirementId = null;
  if (req.body?.requirementId) {
    const r = await ownRequirement({ query }, req, req.body.requirementId);
    if (!r) return res.status(404).json({ error: 'not_found', message: 'Requirement not found.' });
    data = data ?? r.data; requirementId = r.id;
  }
  const e = await evaluate({ query }, data || {}, { buyerId, requirementId });
  res.json({
    validation_status: e.status, service: e.derived?.serviceCode || null,
    personal_data: e.values.personalData === 'Yes' ? true : e.values.personalData === 'No' ? false : null,
    vendor_assessment_required: e.derived?.vendorAssessmentRequired ?? null, contract_review_required: e.derived?.contractReviewRequired ?? null,
    transfer_review_required: e.derived?.transferReviewRequired ?? null, missing_fields: e.missing.map(m => m.field),
    details: { errors: e.errors, missing: e.missing, derived: e.derived, contradictions: e.contradictions, duplicateOf: e.duplicateOf }
  });
});

/* Submit + create. Body: { requirementId, data? }. Header Idempotency-Key (optional). */
assessmentsRouter.post('/', async (req, res) => {
  const out = await submitRequirement(req, req.body?.requirementId, req.body?.data, req.get('Idempotency-Key'));
  res.status(out.status).json(out.body);
});

/* Shared by POST /assessments and POST /requirements/:id/submit. */
export async function submitRequirement(req, requirementId, data, idempotencyKey) {
  return tx(async db => {
    const r = await ownRequirement(db, req, requirementId);
    if (!r) return { status: 404, body: { error: 'not_found', message: 'Requirement not found.' } };
    const buyerId = await buyerOrganisation(db, req.user.id);
    if (!buyerId) return { status: 403, body: { error: 'no_organisation', message: 'Complete your profile with your organisation before submitting.' } };
    if (r.status === 'submitted') {
      const a = (await db.query('SELECT * FROM assessments WHERE requirement_id = $1', [r.id])).rows[0];
      if (a) return { status: 200, body: { status: 'accepted', duplicate: true, ...specOutput(a, r.data.personalData), assessment: shapeAssessment(a) } };
    }
    const e = await evaluate(db, data ?? r.data, { buyerId, requirementId: r.id });
    if (e.errors.length) return { status: 400, body: { error: 'validation', validation_status: 'INVALID', message: 'Some answers are not valid. Correct the highlighted fields.', fields: Object.fromEntries(e.errors.map(x => [x.field, x.reason])) } };
    await db.query('UPDATE requirements SET data = $2, title = $3, updated_at = now() WHERE id = $1', [r.id, JSON.stringify(e.values), e.values.assessmentTitle || null]);
    if (e.requiredMissing.length) {
      await audit(req, 'requirement.submission_rejected', { db, stage: 'stage-1', ref: r.id, detail: { requirementId: r.id, missing: e.requiredMissing.map(m => m.field) } });
      const n = e.requiredMissing.length;
      return { status: 422, body: { error: 'incomplete', validation_status: 'INCOMPLETE', message: `${n} required answer${n === 1 ? ' is' : 's are'} missing. Your answers were saved as a draft.`, missing: e.requiredMissing, flags: e.flags } };
    }
    const sub = (await db.query(`UPDATE requirements SET status = 'submitted', submitted_at = COALESCE(submitted_at, now()), updated_at = now() WHERE id = $1 RETURNING *`, [r.id])).rows[0];
    await audit(req, 'requirement.submitted', { db, stage: 'stage-1', ref: r.id, detail: { requirementId: r.id, title: sub.title, flags: e.flags.map(f => f.code) } });
    const { assessment, created } = await createAssessment(db, req, { requirement: sub, buyerId, evaluation: e, idempotencyKey });
    await ensureProfile(db, req, assessment.id);   // Step 3: profile v1.0 + timeline
    return { status: created ? 201 : 200, body: { status: 'accepted', duplicate: !created, ...specOutput(assessment, e.values.personalData), assessment: shapeAssessment(assessment), requirementStatus: sub.status } };
  });
}

/* Assessments of the buyer's organisation. */
assessmentsRouter.get('/', async (req, res) => {
  const buyerId = await buyerOrganisation({ query }, req.user.id); if (!buyerId) return res.json({ assessments: [] });
  const rows = (await query(`SELECT a.*, r.title, sv.name AS selected_vendor, (SELECT count(*)::int FROM vendor_shortlist s WHERE s.assessment_id = a.id) AS shortlisted,
        c.status AS compliance_status, (SELECT cr.overall_score FROM compliance_results cr WHERE cr.compliance_id = c.id ORDER BY version DESC LIMIT 1) AS compliance_score,
        (SELECT json_build_object('version', d.version, 'fileName', d.file_name, 'uploadedAt', d.uploaded_at, 'totals', ca.totals)
           FROM contract_documents d JOIN contract_analyses ca ON ca.contract_id = d.id
          WHERE d.assessment_id = a.id ORDER BY d.version DESC LIMIT 1) AS contract,
        (SELECT json_build_object('version', g.version, 'contractVersion', g.contract_version, 'totals', g.totals)
           FROM obligation_registers g WHERE g.assessment_id = a.id ORDER BY g.version DESC LIMIT 1) AS obligations,
        (SELECT json_build_object('version', t.version, 'overall', t.overall, 'totals', t.totals)
           FROM transfer_assessments t WHERE t.assessment_id = a.id ORDER BY t.version DESC LIMIT 1) AS transfers
      FROM assessments a JOIN requirements r ON r.id = a.requirement_id LEFT JOIN organisations sv ON sv.id = a.selected_vendor_id
      LEFT JOIN compliance_assessments c ON c.assessment_id = a.id WHERE a.buyer_id = $1 ORDER BY a.created_at DESC`, [buyerId])).rows;
  res.json({ assessments: rows.map(a => shapeAssessment(a, { title: a.title, selectedVendor: a.selected_vendor, selectionVersion: a.selection_version, selectionStatus: a.selection_status, shortlisted: a.shortlisted,
    compliance: a.compliance_status ? { status: a.compliance_status, overall: a.compliance_score } : null, contract: a.contract || null, obligations: a.obligations || null, transfers: a.transfers || null })) });
});

assessmentsRouter.get('/:ref', async (req, res) => {
  const buyerId = await buyerOrganisation({ query }, req.user.id);
  const a = (await query(`SELECT a.*, r.title, r.data FROM assessments a JOIN requirements r ON r.id = a.requirement_id WHERE a.reference = $1 AND a.buyer_id = $2`, [req.params.ref, buyerId])).rows[0];
  if (!a) return res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });
  await tx(db => ensureProfile(db, req, a.id));
  res.json({ assessment: shapeAssessment(a, { title: a.title }), requirement: { id: a.requirement_id, data: a.data }, ...(await loadProfiles({ query }, a.id)) });
});

/* Step 4 output: the "Information Required" summary (10 fields). */
assessmentsRouter.get('/:ref/summary', async (req, res) => {
  const buyerId = await buyerOrganisation({ query }, req.user.id);
  const a = (await query('SELECT * FROM assessments WHERE reference = $1 AND buyer_id = $2', [req.params.ref, buyerId])).rows[0];
  if (!a) return res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });
  await tx(db => ensureProfile(db, req, a.id));
  const s = await buildSummary({ query }, a.id);
  res.json({
    assessment_id: s.assessmentId, service: s.service, buyer: s.buyer, jurisdictions: s.jurisdictions, data_classification: s.dataClassification,
    assurance_controls: s.assuranceControls, initial_risk_tier: s.initialRiskTier, missing_items: s.missingItems, required_next_actions: s.requiredNextActions,
    current_status: s.currentStatus, profile_version: s.profileVersion, note: s.note
  });
});

/* Step 3 boundary: a saved profile is never overwritten. A correction creates a new version (1.1, 1.2, …). Body: { data, reason }. */
assessmentsRouter.post('/:ref/corrections', async (req, res) => {
  const out = await tx(async db => {
    const buyerId = await buyerOrganisation(db, req.user.id);
    const a = (await db.query('SELECT * FROM assessments WHERE reference = $1 AND buyer_id = $2 FOR UPDATE', [req.params.ref, buyerId])).rows[0];
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) return [400, { error: 'validation', message: 'Say briefly what was corrected and why.', fields: { reason: 'Say briefly what was corrected and why (at least 5 characters).' } }];
    if (reason.length > 500) return [400, { error: 'validation', message: 'Use at most 500 characters for the reason.', fields: { reason: 'Use at most 500 characters.' } }];
    const r = (await db.query('SELECT * FROM requirements WHERE id = $1', [a.requirement_id])).rows[0];
    await ensureProfile(db, req, a.id);
    const e = await evaluate(db, req.body?.data, { buyerId, requirementId: r.id });
    if (e.errors.length) return [400, { error: 'validation', message: 'Some answers are not valid. Correct the highlighted fields.', fields: Object.fromEntries(e.errors.map(x => [x.field, x.reason])) }];
    if (e.requiredMissing.length) return [422, { error: 'incomplete', message: `${e.requiredMissing.length} required answer(s) missing.`, missing: e.requiredMissing }];
    if (JSON.stringify(stable(e.values)) === JSON.stringify(stable(r.data))) return [409, { error: 'no_changes', message: 'Nothing has changed, so no new version was created.' }];
    const p = await correctProfile(db, req, { assessment: a, requirement: r, evaluation: e, reason });
    await audit(req, 'requirement.corrected', { db, stage: 'stage-1', ref: a.reference, detail: { reference: a.reference, version: p.version, reason } });
    await issueSummary(db, req, (await db.query('SELECT * FROM assessments WHERE id = $1', [a.id])).rows[0], { update: true });   // Step 4 follows the new version
    return [201, { status: 'corrected', version: p.version }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const a = (await query(`SELECT a.*, r.title, r.data FROM assessments a JOIN requirements r ON r.id = a.requirement_id WHERE a.reference = $1`, [req.params.ref])).rows[0];
  res.status(201).json({ ...out[1], assessment: shapeAssessment(a, { title: a.title }), requirement: { id: a.requirement_id, data: a.data }, ...(await loadProfiles({ query }, a.id)) });
});
