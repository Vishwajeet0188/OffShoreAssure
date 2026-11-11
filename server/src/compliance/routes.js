/* Stage 3 · Compliance assessment (client specification "Stage 3 Inputs and Outputs", steps 10–16).

   Buyer  /api/assessments/:ref/compliance
     GET                          state, start form (step 10), request (step 12), results (step 16)
     POST                         step 10 start (8 fields) → step 11 control set → step 12 request
     POST  /request/revoke        withdraw the vendor's access
     POST  /request/reissue       a new request with a new token and due date
     PUT   /evidence/:id/review   the assigned reviewer marks evidence verified or not acceptable (new version)
     POST  /clarification         ask the vendor to look again at some controls
     GET   /results/:version      an earlier saved version
     GET   /evidence/:id          download a document
     POST  /restart               only for an unsubmitted questionnaire from the earlier draft rule pack

   Vendor /api/vendor/compliance
     GET   /                      the vendor's questionnaires
     GET   /invite/:token         open the invitation link
     GET   /:ref                  questionnaire, answers, evidence, completion and due date (step 12 output)
     PUT   /:ref/answers          step 13 answers (draft)
     POST  /:ref/evidence         step 13 evidence (9 fields) with the automatic checks
     POST  /:ref/submit           step 13 receipt → step 14 validate and score → step 15 snapshot → step 16

   Rules live in engine/assurance.js. Assessments started before the specification keep the earlier draft
   engine (engine/questionnaire.js, RP-2026.10-S3-draft) so their saved results do not change. */
import crypto from 'node:crypto';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { requireRole } from '../auth/session.js';
import { sendNotice } from '../mailer.js';
import { saveFile, readFile, removeFile } from '../storage.js';
import { DOC_RULES } from '../requirements/fields.js';
import { isCountry, COUNTRIES } from '../reference/countries.js';
import { derive } from '../engine/rulepack.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { buildSummary } from '../assessments/profile.js';
import { S3_RULE_PACK as LEGACY_RULE_PACK } from '../engine/questionnaire.js';
import {
  ASSESSMENT_TYPES,
  PROCESSING_ROLES,
  DOCUMENT_TYPES,
  ANSWER_TYPES,
  STATUSES,
  LEVELS,
  FAMILIES,
  RULE_VERSION,
  startDefaults,
  buildContext,
  generateControlSet,
  cleanAnswer,
  completeness,
  scoreCompliance,
} from '../engine/assurance.js';
import { scanFile, analyseDocument, processingStatus, checkList, PROCESSING } from './evidenceChecks.js';

const STAGE = 'stage-3';
const DUE_DAYS = 14;
const GRACE_DAYS = 14; // the access token stays valid this long after the due date
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const appLink = p => config.frontendOrigin.split(',')[0].trim() + p;
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
const day = v => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const addDays = (n, from = new Date()) => day(new Date(from.getTime() + n * 86400000));
const isLegacy = c => c.rule_pack_version === LEGACY_RULE_PACK;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const stable = v =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, stable(v[k])]),
        )
      : v;
const sha = o =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(o)))
    .digest('hex');
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

const ev = (db, assessmentId, step, title, detail = {}) =>
  db.query(
    `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',3,$2,$3,'done',now(),$4)`,
    [assessmentId, step, title, JSON.stringify(detail)],
  );

/* ---------- Shapes ---------- */
const evShape = e => ({
  id: e.id,
  controlId: e.control_id,
  docType: e.doc_type,
  type: e.doc_type,
  fileName: e.file_name,
  size: e.size_bytes,
  sha256: e.sha256,
  issuer: e.issuer || null,
  issuedOn: day(e.issued_on),
  expiresOn: day(e.expires_on),
  version: e.version,
  submitterId: e.uploaded_by,
  uploadedAt: e.uploaded_at,
  processingStatus: e.processing_status,
  processingLabel: PROCESSING[e.processing_status] || null,
  checks: e.checks || [],
  facts: e.facts || {},
  duplicateOf: e.duplicate_of || null,
  locked: !!e.locked,
  reviewStatus: e.review_status || null,
  reviewNote: e.review_note || null,
  reviewedAt: e.reviewed_at || null,
});
/* What is saved with each result version (no word hashes for the browser, but kept for re-scoring). */
const evSnapshot = e => ({
  id: e.id,
  controlId: e.controlId,
  docType: e.docType,
  type: e.docType,
  fileName: e.fileName,
  sha256: e.sha256,
  issuer: e.issuer,
  issuedOn: e.issuedOn,
  expiresOn: e.expiresOn,
  version: e.version,
  processingStatus: e.processingStatus,
  reviewStatus: e.reviewStatus,
  facts: e.facts,
});
const forBrowser = e => {
  const { words, ...facts } = e.facts || {};
  return { ...e, facts };
};

const resultShape = r =>
  r && {
    id: r.id,
    version: r.version,
    snapshotVersion: r.snapshot_version || String(r.version),
    snapshotName: 'ComplianceAssessmentSnapshot',
    legacy: r.rule_pack_version === LEGACY_RULE_PACK,
    overall: r.overall_score,
    rating: r.result.rating,
    counts: r.result.counts || null,
    criticalGaps: r.result.criticalGaps || [],
    areas: r.result.areas,
    controls: r.result.controls,
    results: r.result.results || null,
    gaps: r.result.gaps,
    missingEvidence: r.result.missingEvidence || [],
    nextActions: r.result.nextActions || [],
    observations: r.result.observations || [],
    policy: r.result.policy || null,
    note: r.result.note,
    answers: r.answers,
    evidence: (r.evidence || []).map(forBrowser),
    reason: r.result.reason || null,
    rulePackVersion: r.rule_pack_version,
    controlSetVersion: r.result.controlSetVersion || null,
    snapshotSha256: r.snapshot_sha256,
    automatic: !r.created_by,
    createdAt: r.created_at,
  };

const requestShape = r =>
  r && {
    id: r.id,
    kind: r.kind,
    contactEmail: r.contact_email,
    questionnaireVersion: r.questionnaire_version,
    controlIds: r.control_ids,
    requestedDocuments: r.requested_documents,
    dueOn: day(r.due_on),
    message: r.message,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    deliveries: r.deliveries,
    createdAt: r.created_at,
    access: accessOf(r),
  };
function accessOf(r) {
  if (!r) return 'open';
  if (r.revoked_at) return 'revoked';
  if (new Date(r.expires_at) < new Date()) return 'expired';
  return 'open';
}

async function answersOf(db, c) {
  const rows = (
    await db.query(
      'SELECT question_id, answer, comment, value, updated_at FROM compliance_answers WHERE compliance_id = $1',
      [c.id],
    )
  ).rows;
  if (isLegacy(c))
    return Object.fromEntries(
      rows.map(r => [r.question_id, { answer: r.answer, comment: r.comment, updatedAt: r.updated_at }]),
    );
  return Object.fromEntries(rows.map(r => [r.question_id, { ...(r.value || {}), updatedAt: r.updated_at }]));
}
const evidenceOf = async (db, cid) =>
  (
    await db.query('SELECT * FROM compliance_evidence WHERE compliance_id = $1 ORDER BY uploaded_at', [cid])
  ).rows.map(evShape);
const latestResult = async (db, cid) =>
  (
    await db.query(
      'SELECT * FROM compliance_results WHERE compliance_id = $1 ORDER BY version DESC LIMIT 1',
      [cid],
    )
  ).rows[0] || null;
const latestRequest = async (db, cid) =>
  (
    await db.query(
      'SELECT * FROM compliance_requests WHERE compliance_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [cid],
    )
  ).rows[0] || null;

/* Answers without the bookkeeping fields, as the engine reads them. */
const plainAnswers = answers =>
  Object.fromEntries(
    Object.entries(answers).map(([k, { updatedAt, ...v }]) => [k, v]), // eslint-disable-line no-unused-vars
  );

function progress(c, answers, evidence) {
  if (isLegacy(c)) {
    const total = c.questionnaire.reduce((n, x) => n + x.questions.length, 0);
    return {
      total,
      answered: Object.values(answers).filter(a => ['Yes', 'Partly', 'No'].includes(a.answer)).length,
      evidence: evidence.length,
      controls: c.questionnaire.length,
    };
  }
  const done = completeness(c.questionnaire, answers);
  return {
    total: done.total,
    answered: done.answered,
    percent: done.percent,
    missing: done.missing,
    evidence: evidence.length,
    controls: done.total,
  };
}

/* The questionnaire as the vendor sees it (without the engine's context). */
const publicQuestionnaire = qn => {
  if (Array.isArray(qn)) return qn;
  const { context, ...rest } = qn; // eslint-disable-line no-unused-vars
  return rest;
};

async function userName(db, id) {
  if (!id) return null;
  const u = (
    await db.query(
      'SELECT u.id, u.email, p.full_name FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1',
      [id],
    )
  ).rows[0];
  return u ? { id: u.id, name: u.full_name || u.email, email: u.email } : null;
}

async function shapeCompliance(db, c, answers, evidence, extra = {}) {
  return {
    id: c.id,
    legacy: isLegacy(c),
    status: c.status,
    dueOn: day(c.due_on),
    startedAt: c.started_at,
    submittedAt: c.submitted_at,
    selectionVersion: c.selection_version,
    requirementVersion: c.requirement_version,
    rulePackVersion: c.rule_pack_version,
    assessmentType: c.assessment_type || null,
    serviceScope: c.service_scope || null,
    processingRole: c.processing_role || null,
    jurisdictions: c.jurisdictions || [],
    targetCompletionOn: day(c.target_completion_on),
    reviewer: await userName(db, c.reviewer_id),
    questionnaire: publicQuestionnaire(c.questionnaire),
    progress: progress(c, answers, evidence),
    ...extra,
  };
}

/* Labels the pages need. */
const VOCABULARY = {
  documentTypes: Object.fromEntries(Object.entries(DOCUMENT_TYPES).map(([k, v]) => [k, v.label])),
  expiringTypes: Object.keys(DOCUMENT_TYPES).filter(k => DOCUMENT_TYPES[k].expires),
  answerTypes: Object.fromEntries(Object.entries(ANSWER_TYPES).map(([k, v]) => [k, v])),
  statuses: Object.fromEntries(Object.entries(STATUSES).map(([k, v]) => [k, v.label])),
  levels: LEVELS,
  families: FAMILIES,
  processing: PROCESSING,
  countries: COUNTRIES,
};

/* ================= Buyer ================= */
export const complianceBuyerRouter = Router();
const buyerOnly = [requireRole('buyer'), requireActiveMembership];

async function buyerAssessment(db, req, lock = false) {
  const buyerId = await buyerOrganisation(db, req.user.id);
  if (!buyerId) return null;
  return (
    (
      await db.query(
        `SELECT a.*, r.title, r.data, o.name AS buyer_name, v.name AS vendor_name FROM assessments a JOIN requirements r ON r.id = a.requirement_id
      JOIN organisations o ON o.id = a.buyer_id LEFT JOIN organisations v ON v.id = a.selected_vendor_id WHERE a.reference = $1 AND a.buyer_id = $2${lock ? ' FOR UPDATE OF a' : ''}`,
        [req.params.ref, buyerId],
      )
    ).rows[0] || null
  );
}

/* Step 10 boundary: the vendor must be a valid reference with enough identity, and reachable. */
async function vendorReadiness(db, vendorId) {
  const v = (await db.query(`SELECT * FROM organisations WHERE id = $1 AND kind = 'vendor'`, [vendorId]))
    .rows[0];
  if (!v) return { vendor: null, identity: { ok: false, problems: ['The vendor reference is not valid.'] } };
  const problems = [];
  if (v.verification_status === 'rejected')
    problems.push('OffshoreAssure rejected this vendor’s registration.');
  if (!v.name?.trim()) problems.push('The vendor has no legal name.');
  if (!v.country) problems.push('The vendor’s country of registration is missing.');
  const people = (
    await db.query(
      `SELECT u.id, u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND u.status = 'active'`,
      [v.id],
    )
  ).rows;
  const invitation = people.length
    ? {
        ready: true,
        channel: 'VENDOR_USERS',
        contacts: people.length,
        contactEmail: people[0].email,
        text: `${plural(people.length, 'person')} at ${v.name} will be invited.`,
      }
    : v.contact_email
      ? {
          ready: true,
          channel: 'CONTACT_EMAIL',
          contacts: 1,
          contactEmail: v.contact_email,
          text: `${v.contact_email} will be asked to register on OffshoreAssure and answer.`,
        }
      : {
          ready: false,
          channel: null,
          contacts: 0,
          contactEmail: null,
          text: 'Nobody at this vendor can be invited: it has no users and no contact email.',
        };
  if (!invitation.ready) problems.push(invitation.text);
  return {
    vendor: v,
    people,
    invitation,
    identity: { ok: !problems.length, problems },
  };
}

async function buyerReviewers(db, buyerId) {
  return (
    await db.query(
      `SELECT u.id, u.email, p.full_name, p.membership FROM user_profiles p JOIN users u ON u.id = p.user_id
        WHERE p.organisation_id = $1 AND p.membership IN ('owner','member') AND u.status = 'active' ORDER BY p.full_name NULLS LAST, u.email`,
      [buyerId],
    )
  ).rows.map(r => ({ id: r.id, name: r.full_name || r.email, email: r.email, membership: r.membership }));
}

export async function complianceState(db, a, { full = true, user = null } = {}) {
  const c = (await db.query('SELECT * FROM compliance_assessments WHERE assessment_id = $1', [a.id])).rows[0];
  const summary = await buildSummary(db, a.id);
  const blocked = !a.selected_vendor_id
    ? 'Select a vendor first (Stage 2).'
    : summary?.currentStatus.code === 'INFORMATION_REQUIRED'
      ? 'Some requirement answers contradict each other. Correct them (Stage 1) first.'
      : null;
  const vr = a.selected_vendor_id ? await vendorReadiness(db, a.selected_vendor_id) : null;
  const v = vr?.vendor;
  const base = {
    assessment: {
      id: a.id,
      reference: a.reference,
      title: a.title,
      buyerName: a.buyer_name,
      requirementVersion: a.requirement_version,
    },
    vendor: v
      ? {
          id: v.id,
          name: v.name,
          source: v.source === 'buyer_provided' ? 'BUYER_PROVIDED' : 'DIRECTORY',
          verified: v.verification_status === 'approved',
          country: v.country,
          registrationNumber: v.registration_number,
        }
      : null,
    blocked,
    controls: (summary?.assuranceControls || []).length,
    rulePackVersion: RULE_VERSION,
    ...VOCABULARY,
  };
  if (!c) {
    const d = a.data || {};
    return {
      ...base,
      compliance: null,
      result: null,
      start: v
        ? {
            defaults: startDefaults(d, v),
            reviewers: await buyerReviewers(db, a.buyer_id),
            assessmentTypes: ASSESSMENT_TYPES,
            processingRoles: PROCESSING_ROLES,
            identity: vr.identity,
            invitation: vr.invitation,
            fuller: v.source === 'buyer_provided' || v.verification_status !== 'approved',
            criticality: d.serviceCriticality || null,
            riskTier: derive(d).riskTier,
          }
        : null,
    };
  }
  const answers = await answersOf(db, c),
    evidence = await evidenceOf(db, c.id);
  const shared = c.status === 'submitted' || c.status === 'clarification';
  const versions = (
    await db.query(
      `SELECT version, snapshot_version, overall_score, rating, created_by, created_at FROM compliance_results WHERE compliance_id = $1 ORDER BY version`,
      [c.id],
    )
  ).rows.map(r => ({
    version: r.version,
    snapshotVersion: r.snapshot_version || String(r.version),
    overall: r.overall_score,
    rating: r.rating,
    automatic: !r.created_by,
    createdAt: r.created_at,
  }));
  const owner = user
    ? (
        await db.query(`SELECT membership FROM user_profiles WHERE user_id = $1 AND organisation_id = $2`, [
          user,
          a.buyer_id,
        ])
      ).rows[0]?.membership === 'owner'
    : false;
  return {
    ...base,
    compliance: await shapeCompliance(
      db,
      c,
      answers,
      evidence,
      full && shared ? { answers, evidence: evidence.map(forBrowser) } : {},
    ),
    request: requestShape(await latestRequest(db, c.id)),
    result: resultShape(await latestResult(db, c.id)),
    versions,
    canReview: !!user && !isLegacy(c) && (user === c.reviewer_id || owner),
  };
}

complianceBuyerRouter.get('/:ref/compliance', ...buyerOnly, async (req, res) => {
  const a = await buyerAssessment({ query }, req);
  if (!a) return res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });
  res.json(await complianceState({ query }, a, { user: req.user.id }));
});

const startSchema = z.object({
  assessmentId: z.string().uuid(),
  vendorId: z.string().uuid(),
  assessmentType: z.enum(ASSESSMENT_TYPES),
  serviceScope: z.string().trim().min(3).max(2000),
  processingRole: z.enum(PROCESSING_ROLES),
  jurisdictions: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .min(1)
    .max(60),
  reviewerId: z.string().uuid(),
  targetCompletionOn: z.string().regex(DATE).optional().nullable().or(z.literal('')),
});
const FIELD_MESSAGES = {
  assessmentId: 'The assessment ID is missing.',
  vendorId: 'The vendor ID is missing.',
  assessmentType: 'Choose the assessment type.',
  serviceScope: 'Describe the service scope.',
  processingRole: 'Choose the vendor’s processing role.',
  jurisdictions: 'Choose at least one relevant jurisdiction.',
  reviewerId: 'Choose the assigned reviewer.',
  targetCompletionOn: 'Enter a valid target completion date.',
};

/* Creates a request (step 12): a new token, the controls, documents and due date. Returns { request, token }. */
async function createRequest(db, c, { kind, controlIds, dueOn, message = null, contactEmail, userId }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const qn = c.questionnaire;
  const docs = qn.documents
    .filter(d => d.controls.some(id => controlIds.includes(id)))
    .map(d => ({ ...d, controls: d.controls.filter(id => controlIds.includes(id)) }));
  const request = (
    await db.query(
      `INSERT INTO compliance_requests (compliance_id, kind, contact_email, questionnaire_version, control_ids, requested_documents, due_on, message, token_hash, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ($7::date + interval '${GRACE_DAYS} days' + interval '1 day'), $10) RETURNING *`,
      [
        c.id,
        kind,
        contactEmail || null,
        qn.questionnaireVersion,
        controlIds,
        JSON.stringify(docs),
        dueOn,
        message,
        tokenHash(token),
        userId,
      ],
    )
  ).rows[0];
  return { request, token };
}

/* Sends the request and records each notification delivery on it. */
async function deliverRequest({ a, request, token, people, contact, vendorName, lines, title }) {
  const link = appLink(`/vendor/assessments/${a.reference}?invite=${token}`);
  const deliveries = [];
  const send = async (to, greeting, action) => {
    try {
      await sendNotice(to, title, [greeting, ...lines], {
        kicker: 'COMPLIANCE ASSESSMENT',
        title: 'Questionnaire waiting for you',
        action,
      });
      deliveries.push({ to, status: 'SENT', at: new Date().toISOString() });
    } catch (e) {
      console.error('[EMAIL] compliance request failed:', e.message);
      deliveries.push({ to, status: 'FAILED', at: new Date().toISOString(), error: e.message });
    }
  };
  for (const p of people)
    await send(p.email, `Hello ${p.full_name || ''},`.replace(' ,', ','), {
      label: 'Open the questionnaire',
      url: link,
    });
  if (!people.length && contact)
    await send(contact, 'Hello,', {
      label: 'Register on OffshoreAssure',
      url: appLink('/signup?role=vendor&email=' + encodeURIComponent(contact)),
    });
  await query('UPDATE compliance_requests SET deliveries = deliveries || $2::jsonb WHERE id = $1', [
    request.id,
    JSON.stringify(deliveries),
  ]);
  if (!deliveries.length) console.warn(`[EMAIL] nobody to notify at ${vendorName}`);
  return deliveries;
}

/* Steps 10–12: start, generate the control set and questionnaire, send the request to the vendor. */
complianceBuyerRouter.post('/:ref/compliance', ...buyerOnly, async (req, res) => {
  const parsed = startSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return res.status(400).json({
      error: 'validation',
      message: FIELD_MESSAGES[field] || 'Some start fields are not valid.',
      field,
    });
  }
  const f = parsed.data;
  const out = await tx(async db => {
    const a = await buyerAssessment(db, req, true);
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const st = await complianceState(db, a);
    if (st.blocked) return [409, { error: 'not_ready', message: st.blocked }];
    if (st.compliance)
      return [
        409,
        { error: 'already_started', message: 'The compliance assessment has already been started.' },
      ];
    if (f.assessmentId !== a.id)
      return [
        422,
        { error: 'invalid_assessment', message: 'The assessment ID does not match this assessment.' },
      ];
    if (f.vendorId !== a.selected_vendor_id)
      return [
        422,
        { error: 'invalid_vendor', message: 'The vendor reference does not match the selected vendor.' },
      ];
    const vr = await vendorReadiness(db, f.vendorId);
    if (!vr.identity.ok)
      return [
        422,
        {
          error: 'vendor_identity',
          message: 'The assessment cannot start: ' + vr.identity.problems.join(' '),
          problems: vr.identity.problems,
        },
      ];
    if (f.jurisdictions.some(j => !isCountry(j)))
      return [400, { error: 'validation', message: FIELD_MESSAGES.jurisdictions, field: 'jurisdictions' }];
    const reviewers = await buyerReviewers(db, a.buyer_id);
    const reviewer = reviewers.find(r => r.id === f.reviewerId);
    if (!reviewer)
      return [
        400,
        {
          error: 'validation',
          message: 'The assigned reviewer must be an active member of your organisation.',
          field: 'reviewerId',
        },
      ];
    const target = f.targetCompletionOn || null;
    if (target && target < day(new Date()))
      return [
        400,
        {
          error: 'validation',
          message: 'The target completion date cannot be in the past.',
          field: 'targetCompletionOn',
        },
      ];
    const p = (
      await db.query(
        'SELECT * FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
        [a.id],
      )
    ).rows[0];
    const d = p?.original_submission || a.data;
    const controls = p?.validation_findings?.controls || [];
    if (!controls.length)
      return [
        409,
        {
          error: 'no_controls',
          message: 'No assurance controls apply to this requirement, so there is nothing to assess.',
        },
      ];
    const context = buildContext({ d, derived: derive(d), controls, vendor: vr.vendor, start: f });
    const qn = generateControlSet(context);
    let dueOn = addDays(DUE_DAYS);
    if (target && target < dueOn) dueOn = target;
    const c = (
      await db.query(
        `INSERT INTO compliance_assessments (assessment_id, vendor_id, selection_version, requirement_version, questionnaire, rule_pack_version, status, due_on, started_by,
           assessment_type, service_scope, processing_role, jurisdictions, reviewer_id, target_completion_on)
         VALUES ($1,$2,$3,$4,$5,$6,'in_progress',$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          a.id,
          a.selected_vendor_id,
          a.selection_version,
          a.requirement_version,
          JSON.stringify(qn),
          RULE_VERSION,
          dueOn,
          req.user.id,
          f.assessmentType,
          f.serviceScope,
          f.processingRole,
          [...new Set(f.jurisdictions)],
          f.reviewerId,
          target,
        ],
      )
    ).rows[0];
    const { request, token } = await createRequest(db, c, {
      kind: 'initial',
      controlIds: qn.controls.map(x => x.id),
      dueOn,
      contactEmail: vr.invitation.contactEmail,
      userId: req.user.id,
    });
    await ev(db, a.id, 10, `Compliance assessment started with ${a.vendor_name} (${f.assessmentType})`, {
      complianceId: c.id,
      reviewerId: f.reviewerId,
    });
    await ev(
      db,
      a.id,
      11,
      `Control set generated: ${qn.controls.length} of ${qn.libraryCount} controls apply, ${qn.notApplicable.length} not applicable; ${plural(qn.documents.length, 'document')} on the checklist`,
      { controls: qn.controls.map(x => x.id), controlSetVersion: qn.controlSetVersion },
    );
    await ev(db, a.id, 12, `Answers and evidence requested from ${a.vendor_name} (due ${dueOn})`, {
      requestId: request.id,
    });
    await audit(req, 'compliance.started', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: {
        reference: a.reference,
        vendorId: a.selected_vendor_id,
        vendorName: a.vendor_name,
        assessmentType: f.assessmentType,
        processingRole: f.processingRole,
        jurisdictions: f.jurisdictions,
        reviewerId: f.reviewerId,
        controls: qn.controls.length,
        notApplicable: qn.notApplicable.length,
        fuller: context.fuller,
        rulePackVersion: RULE_VERSION,
        requestId: request.id,
      },
    });
    return [201, { a, c, qn, request, token, vr }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { a, c, qn, request, token, vr } = out[1];
  await deliverRequest({
    a,
    request,
    token,
    people: vr.people,
    contact: vr.invitation.channel === 'CONTACT_EMAIL' ? vr.invitation.contactEmail : null,
    vendorName: a.vendor_name,
    title: `${a.buyer_name} has sent ${a.vendor_name} a compliance questionnaire`,
    lines: [
      `${a.buyer_name} has started the compliance assessment for "${a.title}" (${a.reference}).`,
      `Please answer ${plural(qn.controls.length, 'question')} and upload the ${plural(qn.documents.length, 'document')} on the checklist by ${day(c.due_on)}.`,
      'The link in this email is personal to your company and expires after the due date.',
    ],
  });
  const state = await complianceState({ query }, a, { user: req.user.id });
  res.status(201).json({
    ...state,
    session: { id: c.id, status: 'IN_PROGRESS', invitation: vr.invitation },
  });
});

/* Reviewer actions: the assigned reviewer or an owner of the buyer organisation. */
async function reviewerOf(db, req, lock = false) {
  const a = await buyerAssessment(db, req, lock);
  if (!a) return { error: [404, { error: 'not_found', message: 'Assessment not found.' }] };
  const c = (
    await db.query(
      `SELECT * FROM compliance_assessments WHERE assessment_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [a.id],
    )
  ).rows[0];
  if (!c)
    return { error: [409, { error: 'not_started', message: 'Start the compliance assessment first.' }] };
  if (isLegacy(c))
    return {
      error: [
        409,
        {
          error: 'legacy',
          message: 'This assessment uses the earlier draft questionnaire and cannot be changed.',
        },
      ],
    };
  const owner =
    (
      await db.query(`SELECT membership FROM user_profiles WHERE user_id = $1 AND organisation_id = $2`, [
        req.user.id,
        a.buyer_id,
      ])
    ).rows[0]?.membership === 'owner';
  if (req.user.id !== c.reviewer_id && !owner)
    return {
      error: [
        403,
        { error: 'not_reviewer', message: 'Only the assigned reviewer (or an owner) can do this.' },
      ],
    };
  return { a, c };
}

complianceBuyerRouter.post('/:ref/compliance/request/revoke', ...buyerOnly, async (req, res) => {
  const out = await tx(async db => {
    const { a, c, error } = await reviewerOf(db, req, true);
    if (error) return error;
    const r = await latestRequest(db, c.id);
    if (!r || r.revoked_at)
      return [409, { error: 'no_request', message: 'There is no open request to withdraw.' }];
    await db.query('UPDATE compliance_requests SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [
      r.id,
      req.user.id,
    ]);
    await ev(db, a.id, 12, `Vendor access withdrawn (request ${r.id.slice(0, 8)})`, { requestId: r.id });
    await audit(req, 'compliance.request_revoked', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference, requestId: r.id },
    });
    return [200, a];
  });
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);
  res.json(await complianceState({ query }, out[1], { user: req.user.id }));
});

const reissueSchema = z.object({ dueOn: z.string().regex(DATE).optional().nullable().or(z.literal('')) });
complianceBuyerRouter.post('/:ref/compliance/request/reissue', ...buyerOnly, async (req, res) => {
  const p = reissueSchema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'validation', message: 'Enter a valid due date.' });
  const dueOn = p.data.dueOn || addDays(DUE_DAYS);
  if (dueOn < day(new Date()))
    return res.status(400).json({ error: 'validation', message: 'The due date cannot be in the past.' });
  const out = await tx(async db => {
    const { a, c, error } = await reviewerOf(db, req, true);
    if (error) return error;
    if (c.status === 'submitted')
      return [
        409,
        { error: 'submitted', message: 'The vendor has already submitted. Ask for clarification instead.' },
      ];
    const last = await latestRequest(db, c.id);
    if (last && !last.revoked_at)
      await db.query('UPDATE compliance_requests SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [
        last.id,
        req.user.id,
      ]);
    const vr = await vendorReadiness(db, c.vendor_id);
    const { request, token } = await createRequest(db, c, {
      kind: 'reissue',
      controlIds: last?.control_ids || c.questionnaire.controls.map(x => x.id),
      dueOn,
      message: last?.message || null,
      contactEmail: vr.invitation.contactEmail,
      userId: req.user.id,
    });
    await db.query('UPDATE compliance_assessments SET due_on = $2 WHERE id = $1', [c.id, dueOn]);
    await ev(db, a.id, 12, `Request issued again to ${a.vendor_name} (due ${dueOn})`, {
      requestId: request.id,
    });
    await audit(req, 'compliance.request_reissued', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference, requestId: request.id, dueOn },
    });
    return [200, { a, request, token, vr }];
  });
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);
  const { a, request, token, vr } = out[1];
  await deliverRequest({
    a,
    request,
    token,
    people: vr.people,
    contact: vr.invitation.channel === 'CONTACT_EMAIL' ? vr.invitation.contactEmail : null,
    vendorName: a.vendor_name,
    title: `New link for the ${a.buyer_name} compliance questionnaire`,
    lines: [
      `${a.buyer_name} has issued a new link for the compliance questionnaire for "${a.title}" (${a.reference}).`,
      `The new due date is ${dueOn}. Earlier links no longer work.`,
    ],
  });
  res.json(await complianceState({ query }, a, { user: req.user.id }));
});

/* Saves a new result version for the current answers and evidence (inside the caller's transaction). */
async function saveVersion(db, c, { answers, evidence, userId, major, reason }) {
  const last = await latestResult(db, c.id);
  const [M, m] = String(last?.snapshot_version || '0.0')
    .split('.')
    .map(Number);
  const snapshotVersion = !last ? '1.0' : major ? `${M + 1}.0` : `${M}.${(m || 0) + 1}`;
  const version = (last?.version || 0) + 1;
  const at = new Date().toISOString();
  const scored = scoreCompliance(c.questionnaire, answers, evidence, new Date(), {
    assessmentId: c.assessment_id,
    at,
  });
  scored.snapshot = {
    name: 'ComplianceAssessmentSnapshot',
    version: snapshotVersion,
    assessmentId: c.assessment_id,
    vendorId: c.vendor_id,
    controlSetVersion: c.questionnaire.controlSetVersion,
    questionnaireVersion: c.questionnaire.questionnaireVersion,
    rulePackVersion: RULE_VERSION,
    previousVersion: last?.snapshot_version || null,
    createdAt: at,
  };
  if (reason) scored.reason = reason;
  const evidenceSnap = evidence.map(evSnapshot);
  const record = { complianceId: c.id, version, scored, answers, evidence: evidenceSnap };
  const r = (
    await db.query(
      `INSERT INTO compliance_results (compliance_id, version, snapshot_version, overall_score, rating, result, answers, evidence, rule_pack_version, snapshot_sha256, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        c.id,
        version,
        snapshotVersion,
        scored.overall,
        scored.rating.code,
        JSON.stringify(scored),
        JSON.stringify(answers),
        JSON.stringify(evidenceSnap),
        RULE_VERSION,
        sha(record),
        userId,
      ],
    )
  ).rows[0];
  return { r, scored, snapshotVersion };
}

const reviewSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});
/* The assigned reviewer checks a document by hand. Only a human review makes evidence "verified". */
complianceBuyerRouter.put('/:ref/compliance/evidence/:id/review', ...buyerOnly, async (req, res) => {
  const p = reviewSchema.safeParse(req.body || {});
  if (!p.success)
    return res.status(400).json({ error: 'validation', message: 'Choose verified or not acceptable.' });
  if (!isUuid(req.params.id))
    return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  if (p.data.decision === 'REJECTED' && !p.data.note)
    return res.status(400).json({ error: 'validation', message: 'Say why the document is not acceptable.' });
  const out = await tx(async db => {
    const { a, c, error } = await reviewerOf(db, req, true);
    if (error) return error;
    if (c.status !== 'submitted')
      return [
        409,
        { error: 'not_submitted', message: 'Evidence can be reviewed once the vendor has submitted.' },
      ];
    const last = await latestResult(db, c.id);
    const ids = (last?.evidence || []).map(e => e.id);
    if (!ids.includes(req.params.id))
      return [404, { error: 'not_found', message: 'Document not found in the submitted evidence.' }];
    const e = (
      await db.query(
        `UPDATE compliance_evidence SET review_status = $3, review_note = $4, reviewed_by = $5, reviewed_at = now()
          WHERE id = $1 AND compliance_id = $2 RETURNING *`,
        [req.params.id, c.id, p.data.decision, p.data.note || null, req.user.id],
      )
    ).rows[0];
    const evidence = (await evidenceOf(db, c.id)).filter(x => ids.includes(x.id));
    const { scored, snapshotVersion } = await saveVersion(db, c, {
      answers: last.answers,
      evidence,
      userId: req.user.id,
      major: false,
      reason: `Evidence review: “${e.file_name}” ${p.data.decision === 'VERIFIED' ? 'verified' : 'not acceptable'}.`,
    });
    await ev(
      db,
      a.id,
      14,
      `Evidence reviewed: “${e.file_name}” ${p.data.decision === 'VERIFIED' ? 'verified' : 'not acceptable'}; provisional score ${scored.overall}/100 (v${snapshotVersion})`,
      { evidenceId: e.id, snapshotVersion },
    );
    await audit(req, 'compliance.evidence_reviewed', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: {
        reference: a.reference,
        evidenceId: e.id,
        fileName: e.file_name,
        decision: p.data.decision,
        snapshotVersion,
        overall: scored.overall,
      },
    });
    return [200, a];
  });
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);
  res.json(await complianceState({ query }, out[1], { user: req.user.id }));
});

const clarifySchema = z.object({
  controlIds: z.array(z.string().max(20)).min(1).max(100),
  message: z.string().trim().min(3).max(2000),
  dueOn: z.string().regex(DATE).optional().nullable().or(z.literal('')),
});
/* Ask the vendor to look again at some controls. The vendor's changes create new evidence and a new version. */
complianceBuyerRouter.post('/:ref/compliance/clarification', ...buyerOnly, async (req, res) => {
  const p = clarifySchema.safeParse(req.body || {});
  if (!p.success)
    return res.status(400).json({
      error: 'validation',
      message: 'Choose at least one control and say what needs clarifying.',
    });
  const dueOn = p.data.dueOn || addDays(7);
  if (dueOn < day(new Date()))
    return res.status(400).json({ error: 'validation', message: 'The due date cannot be in the past.' });
  const out = await tx(async db => {
    const { a, c, error } = await reviewerOf(db, req, true);
    if (error) return error;
    if (c.status !== 'submitted')
      return [
        409,
        { error: 'not_submitted', message: 'Clarification can be asked once the vendor has submitted.' },
      ];
    const valid = new Set(c.questionnaire.controls.map(x => x.id));
    const ids = [...new Set(p.data.controlIds)];
    if (ids.some(id => !valid.has(id)))
      return [400, { error: 'validation', message: 'Choose controls from this questionnaire.' }];
    const vr = await vendorReadiness(db, c.vendor_id);
    const last = await latestRequest(db, c.id);
    if (last && !last.revoked_at)
      await db.query('UPDATE compliance_requests SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [
        last.id,
        req.user.id,
      ]);
    const { request, token } = await createRequest(db, c, {
      kind: 'clarification',
      controlIds: ids,
      dueOn,
      message: p.data.message,
      contactEmail: vr.invitation.contactEmail,
      userId: req.user.id,
    });
    await db.query(`UPDATE compliance_assessments SET status = 'clarification', due_on = $2 WHERE id = $1`, [
      c.id,
      dueOn,
    ]);
    await ev(
      db,
      a.id,
      12,
      `Clarification requested from ${a.vendor_name} on ${ids.join(', ')} (due ${dueOn})`,
      {
        requestId: request.id,
        controlIds: ids,
      },
    );
    await audit(req, 'compliance.clarification_requested', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference, requestId: request.id, controlIds: ids, dueOn },
    });
    return [200, { a, request, token, vr, ids }];
  });
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);
  const { a, request, token, vr, ids } = out[1];
  await deliverRequest({
    a,
    request,
    token,
    people: vr.people,
    contact: vr.invitation.channel === 'CONTACT_EMAIL' ? vr.invitation.contactEmail : null,
    vendorName: a.vendor_name,
    title: `${a.buyer_name} has asked for clarification (${a.reference})`,
    lines: [
      `${a.buyer_name} has asked ${a.vendor_name} to look again at ${plural(ids.length, 'question')} for "${a.title}" (${a.reference}): ${ids.join(', ')}.`,
      `Message from the reviewer: ${p.data.message}`,
      `Please answer and resubmit by ${dueOn}. Your earlier answers and documents are kept.`,
    ],
  });
  res.json(await complianceState({ query }, a, { user: req.user.id }));
});

complianceBuyerRouter.get('/:ref/compliance/results/:version', ...buyerOnly, async (req, res) => {
  const a = await buyerAssessment({ query }, req);
  const v = Number(req.params.version);
  if (!a || !Number.isInteger(v))
    return res.status(404).json({ error: 'not_found', message: 'Result not found.' });
  const r = (
    await query(
      `SELECT r.* FROM compliance_results r JOIN compliance_assessments c ON c.id = r.compliance_id WHERE c.assessment_id = $1 AND r.version = $2`,
      [a.id, v],
    )
  ).rows[0];
  if (!r) return res.status(404).json({ error: 'not_found', message: 'Result not found.' });
  res.json({ result: resultShape(r) });
});

complianceBuyerRouter.get('/:ref/compliance/evidence/:id', ...buyerOnly, async (req, res) => {
  const a = await buyerAssessment({ query }, req);
  if (!a || !isUuid(req.params.id))
    return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  const e = (
    await query(
      `SELECT e.* FROM compliance_evidence e JOIN compliance_assessments c ON c.id = e.compliance_id
        WHERE e.id = $1 AND c.assessment_id = $2 AND c.status IN ('submitted','clarification') AND (e.locked OR c.rule_pack_version = $3)`,
      [req.params.id, a.id, LEGACY_RULE_PACK],
    )
  ).rows[0];
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  res.set('Content-Type', e.mime_type);
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(e.file_name)}"`);
  res.send(await readFile(e.storage_key, e.encrypted));
});

/* An unsubmitted questionnaire from the earlier draft rule pack can be started again with the current control set. */
complianceBuyerRouter.post('/:ref/compliance/restart', ...buyerOnly, async (req, res) => {
  const out = await tx(async db => {
    const a = await buyerAssessment(db, req, true);
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const c = (await db.query('SELECT * FROM compliance_assessments WHERE assessment_id = $1', [a.id]))
      .rows[0];
    if (!c || !isLegacy(c) || c.status === 'submitted')
      return [
        409,
        {
          error: 'not_restartable',
          message: 'Only an unsubmitted questionnaire from the earlier draft can be restarted.',
        },
      ];
    const files = (
      await db.query('SELECT storage_key FROM compliance_evidence WHERE compliance_id = $1', [c.id])
    ).rows;
    await db.query('DELETE FROM compliance_assessments WHERE id = $1', [c.id]);
    await ev(db, a.id, 10, 'Earlier draft questionnaire withdrawn so the assessment can start again', {});
    await audit(req, 'compliance.restarted', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference },
    });
    return [200, { a, files }];
  });
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);
  for (const f of out[1].files) await removeFile(f.storage_key).catch(() => {});
  res.json(await complianceState({ query }, out[1].a, { user: req.user.id }));
});

/* ================= Vendor ================= */
export const complianceVendorRouter = Router();
complianceVendorRouter.use(requireRole('vendor'));

const vendorOrg = async (db, userId) =>
  (await db.query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [userId])).rows[0]
    ?.organisation_id;

async function vendorCompliance(db, req, lock = false) {
  const org = await vendorOrg(db, req.user.id);
  if (!org) return null;
  const c =
    (
      await db.query(
        `SELECT c.*, a.reference, a.id AS a_id, r.title, r.data->>'serviceCategory' AS service_category, o.name AS buyer_name, a.buyer_id, v.name AS vendor_name
      FROM compliance_assessments c JOIN assessments a ON a.id = c.assessment_id JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
      JOIN organisations v ON v.id = c.vendor_id
     WHERE a.reference = $1 AND c.vendor_id = $2 AND a.selected_vendor_id = $2${lock ? ' FOR UPDATE OF c' : ''}`,
        [req.params.ref, org],
      )
    ).rows[0] || null;
  if (c) c.request = isLegacy(c) ? null : await latestRequest(db, c.id);
  return c;
}
const nf = res => res.status(404).json({ error: 'not_found', message: 'Questionnaire not found.' });

/* Access limits (step 12 boundary). Returns [status, body] when the action is not allowed. */
function gate(c, write) {
  if (isLegacy(c) && write)
    return [
      409,
      {
        error: 'legacy',
        message: 'This questionnaire is from an earlier version. Ask the buyer to restart it.',
      },
    ];
  const access = accessOf(c.request);
  if (access === 'revoked')
    return [
      403,
      { error: 'access_revoked', message: 'The buyer has withdrawn access to this questionnaire.' },
    ];
  if (!write) return null;
  if (c.status === 'submitted')
    return [
      409,
      { error: 'submitted', message: 'This questionnaire has been submitted and can no longer be changed.' },
    ];
  if (access === 'expired')
    return [
      409,
      {
        error: 'request_expired',
        message: 'The request has expired. Ask the buyer to issue it again.',
      },
    ];
  return null;
}
/* The controls the vendor may change now: all of them, or only those under clarification. */
const editable = c =>
  c.status === 'clarification' ? c.request?.control_ids || [] : c.questionnaire.controls.map(x => x.id);

complianceVendorRouter.get('/compliance', async (req, res) => {
  const org = await vendorOrg({ query }, req.user.id);
  if (!org) return res.json({ questionnaires: [] });
  const rows = (
    await query(
      `SELECT c.*, a.reference, r.title, o.name AS buyer_name FROM compliance_assessments c JOIN assessments a ON a.id = c.assessment_id
      JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id WHERE c.vendor_id = $1 AND a.selected_vendor_id = $1 ORDER BY c.started_at DESC`,
      [org],
    )
  ).rows;
  const list = [];
  for (const c of rows) {
    const request = isLegacy(c) ? null : await latestRequest({ query }, c.id);
    list.push({
      reference: c.reference,
      title: c.title,
      buyerName: c.buyer_name,
      status: c.status,
      dueOn: day(c.due_on),
      access: accessOf(request),
      progress: progress(c, await answersOf({ query }, c), await evidenceOf({ query }, c.id)),
    });
  }
  res.json({ questionnaires: list });
});

/* The invitation link: proves the email reached the vendor and opens the questionnaire. */
complianceVendorRouter.get('/compliance/invite/:token', async (req, res) => {
  const org = await vendorOrg({ query }, req.user.id);
  const r = (
    await query(
      `SELECT q.*, a.reference FROM compliance_requests q JOIN compliance_assessments c ON c.id = q.compliance_id JOIN assessments a ON a.id = c.assessment_id
        WHERE q.token_hash = $1 AND c.vendor_id = $2`,
      [tokenHash(req.params.token), org],
    )
  ).rows[0];
  if (!r)
    return res
      .status(404)
      .json({ error: 'not_found', message: 'This invitation link is not valid for your company.' });
  const access = accessOf(r);
  if (access === 'revoked')
    return res
      .status(403)
      .json({ error: 'access_revoked', message: 'This invitation link has been withdrawn or replaced.' });
  if (access === 'expired')
    return res.status(410).json({
      error: 'request_expired',
      message: 'This invitation link has expired.',
      reference: r.reference,
    });
  res.json({ reference: r.reference });
});

complianceVendorRouter.get('/compliance/:ref', async (req, res) => {
  const c = await vendorCompliance({ query }, req);
  if (!c) return nf(res);
  const stop = gate(c, false);
  if (stop) return res.status(stop[0]).json(stop[1]);
  const answers = await answersOf({ query }, c),
    evidence = await evidenceOf({ query }, c.id);
  const r = await latestResult({ query }, c.id);
  const legacy = isLegacy(c);
  const access = accessOf(c.request);
  const mode = legacy
    ? 'legacy'
    : c.status === 'submitted'
      ? 'submitted'
      : access === 'expired'
        ? 'expired'
        : c.status === 'clarification'
          ? 'clarification'
          : 'answering';
  res.json({
    reference: c.reference,
    title: c.title,
    buyerName: c.buyer_name,
    vendorName: c.vendor_name,
    serviceCategory: c.service_category,
    mode,
    editable: legacy ? [] : editable(c),
    compliance: await shapeCompliance({ query }, c, answers, evidence, {
      answers,
      evidence: evidence.map(forBrowser),
    }),
    request: legacy
      ? null
      : {
          ...requestShape(c.request),
          instructions: [
            'Answer every required question. Use the explanation box to add detail.',
            'Upload the documents on the checklist. Each file must be a PDF, Word, Excel, CSV, text or image file of up to 10 MB.',
            'Give the issuer and dates shown on each document. Certificates and insurance need an expiry date.',
            'Files are checked automatically (malware scan, file type, expiry date, company name and duplicates). Expired or unreadable files are kept but do not count as current evidence.',
            'Your answers save as you go. Submit when you are ready; the buyer is told straight away.',
          ],
        },
    result: r
      ? {
          version: r.version,
          snapshotVersion: r.snapshot_version || String(r.version),
          overall: r.overall_score,
          rating: r.result.rating,
          counts: r.result.counts || null,
          gaps: r.result.gaps,
          missingEvidence: r.result.missingEvidence || [],
          areas: r.result.areas,
          createdAt: r.created_at,
        }
      : null,
    ...VOCABULARY,
    fileRules: { maxBytes: DOC_RULES.maxBytes, extensions: Object.keys(DOC_RULES.extensions) },
  });
});

/* Step 13: save answers (draft, any number of times before submitting). */
complianceVendorRouter.put('/compliance/:ref/answers', async (req, res) => {
  const body = req.body || {};
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers))
    return res.status(400).json({ error: 'validation', message: 'Some answers are not valid.' });
  const out = await tx(async db => {
    const c = await vendorCompliance(db, req, true);
    if (!c) return [404];
    const stop = gate(c, true);
    if (stop) return stop;
    const controls = new Map(c.questionnaire.controls.map(x => [x.id, x]));
    const allowed = new Set(editable(c));
    let n = 0;
    for (const [id, raw] of Object.entries(body.answers)) {
      const control = controls.get(id);
      if (!control) continue;
      if (!allowed.has(id))
        return [409, { error: 'not_editable', message: `${id} is not part of the clarification request.` }];
      const { value, error } = cleanAnswer(control, raw || {});
      if (error) return [400, { error: 'validation', message: error, controlId: id }];
      if (!value) {
        await db.query('DELETE FROM compliance_answers WHERE compliance_id = $1 AND question_id = $2', [
          c.id,
          id,
        ]);
        continue;
      }
      await db.query(
        `INSERT INTO compliance_answers (compliance_id, question_id, answer, comment, value, updated_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (compliance_id, question_id) DO UPDATE SET answer = EXCLUDED.answer, comment = EXCLUDED.comment, value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [c.id, id, value.answer || '', value.explanation, JSON.stringify(value), req.user.id],
      );
      n++;
    }
    if (c.status === 'requested')
      await db.query(`UPDATE compliance_assessments SET status = 'in_progress' WHERE id = $1`, [c.id]);
    await audit(req, 'compliance.answers_saved', {
      db,
      stage: STAGE,
      ref: c.reference,
      detail: { reference: c.reference, saved: n },
    });
    const answers = await answersOf(db, c),
      evidence = await evidenceOf(db, c.id);
    return [
      200,
      {
        compliance: await shapeCompliance(
          db,
          { ...c, status: c.status === 'requested' ? 'in_progress' : c.status },
          answers,
          evidence,
          { answers, evidence: evidence.map(forBrowser) },
        ),
      },
    ];
  });
  if (out[0] === 404) return nf(res);
  res.status(out[0]).json(out[1]);
});

/* Step 13: upload one evidence item.
   Query: control, type, name, issuer, issued (YYYY-MM-DD), expires (YYYY-MM-DD; required for certificates and insurance). */
complianceVendorRouter.post(
  '/compliance/:ref/evidence',
  express.raw({ type: () => true, limit: DOC_RULES.maxBytes + 1 }),
  async (req, res) => {
    const c = await vendorCompliance({ query }, req);
    if (!c) return nf(res);
    const stop = gate(c, true);
    if (stop) return res.status(stop[0]).json(stop[1]);
    const q = k => String(req.query[k] || '').trim();
    const controlId = q('control'),
      type = q('type'),
      issued = q('issued'),
      expires = q('expires');
    const issuer = q('issuer').slice(0, 200);
    const name = q('name')
      .replace(/[\\/\0]/g, '_')
      .slice(0, 200);
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const bad = (m, status = 400, error = 'file_rejected') => res.status(status).json({ error, message: m });
    const control = c.questionnaire.controls.find(x => x.id === controlId);
    if (!control) return bad('Choose the question this document supports.');
    if (!editable(c).includes(controlId))
      return bad(`${controlId} is not part of the clarification request.`, 409, 'not_editable');
    if (!DOCUMENT_TYPES[type] || !(control.evidence.includes(type) || type === 'OTHER'))
      return bad('Choose what kind of document this is.');
    if (!name || !DOC_RULES.extensions[ext])
      return bad(`This file type is not supported. Use: ${Object.keys(DOC_RULES.extensions).join(', ')}.`);
    if (!body.length) return bad('The file is empty.');
    if (body.length > DOC_RULES.maxBytes) return bad('The file is larger than 10 MB.');
    const validDate = s => DATE.test(s) && !isNaN(new Date(s));
    if (issued && !validDate(issued)) return bad('Enter a valid issue date.');
    if (issued && issued > day(new Date())) return bad('The issue date cannot be in the future.');
    if (DOCUMENT_TYPES[type].expires && !expires) return bad('Enter the expiry date shown on the document.');
    if (expires && !validDate(expires)) return bad('Enter a valid expiry date.');
    if (issued && expires && expires <= issued) return bad('The expiry date must be after the issue date.');
    if (DOCUMENT_TYPES[type].maxAgeMonths && !issued) return bad('Enter the date of the test or report.');

    const blocked = scanFile(body, ext);
    if (blocked) {
      await audit(req, 'compliance.evidence_blocked', {
        stage: STAGE,
        ref: c.reference,
        detail: { reference: c.reference, controlId, fileName: name, reason: blocked },
      });
      return bad(blocked, 400, 'file_blocked');
    }
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const same = (
      await query(
        'SELECT id, control_id, file_name FROM compliance_evidence WHERE compliance_id = $1 AND sha256 = $2',
        [c.id, sha256],
      )
    ).rows;
    if (same.some(s => s.control_id === controlId))
      return bad(
        `This file is already uploaded for ${controlId} (“${same.find(s => s.control_id === controlId).file_name}”).`,
        409,
        'duplicate',
      );
    const x = c.questionnaire.context;
    const facts = await analyseDocument(body, ext, type, {
      vendorName: x.vendor.name || c.vendor_name,
      registrationNumber: x.vendor.registrationNumber,
      serviceKeywords: x.serviceKeywords,
    });
    const status = processingStatus({ facts, docType: type, expiresOn: expires || null });
    const checks = checkList({
      facts,
      docType: type,
      expiresOn: expires || null,
      issuedOn: issued || null,
      duplicateOf: same[0]?.id || null,
      status,
      size: body.length,
      maxBytes: DOC_RULES.maxBytes,
    });
    const version =
      Number(
        (
          await query(
            'SELECT count(*) AS n FROM compliance_evidence WHERE compliance_id = $1 AND control_id = $2 AND doc_type = $3',
            [c.id, controlId, type],
          )
        ).rows[0].n,
      ) + 1;
    const id = crypto.randomUUID(),
      key = path.join('compliance', c.id, id);
    await saveFile(key, body);
    const e = (
      await query(
        `INSERT INTO compliance_evidence (id, compliance_id, control_id, doc_type, file_name, mime_type, size_bytes, sha256, storage_key, issuer, issued_on, expires_on,
           version, processing_status, checks, facts, duplicate_of, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [
          id,
          c.id,
          controlId,
          type,
          name,
          DOC_RULES.extensions[ext],
          body.length,
          sha256,
          key,
          issuer || null,
          issued || null,
          expires || null,
          version,
          status,
          JSON.stringify(checks),
          JSON.stringify(facts),
          same[0]?.id || null,
          req.user.id,
        ],
      )
    ).rows[0];
    if (c.status === 'requested')
      await query(`UPDATE compliance_assessments SET status = 'in_progress' WHERE id = $1`, [c.id]);
    await audit(req, 'compliance.evidence_uploaded', {
      stage: STAGE,
      ref: c.reference,
      detail: {
        reference: c.reference,
        controlId,
        type,
        fileName: name,
        sha256,
        issuer: issuer || null,
        issuedOn: issued || null,
        expiresOn: expires || null,
        version,
        processingStatus: status,
        duplicateOf: same[0]?.id || null,
      },
    });
    res.status(201).json({ evidence: forBrowser(evShape(e)) });
  },
);
complianceVendorRouter.use((err, _req, res, next) =>
  err.type === 'entity.too.large'
    ? res.status(400).json({ error: 'file_rejected', message: 'The file is larger than 10 MB.' })
    : next(err),
);

/* A draft document can be removed until it has been submitted. Submitted evidence is kept. */
complianceVendorRouter.delete('/compliance/:ref/evidence/:id', async (req, res) => {
  const c = await vendorCompliance({ query }, req);
  if (!c) return nf(res);
  const stop = gate(c, true);
  if (stop) return res.status(stop[0]).json(stop[1]);
  if (!isUuid(req.params.id))
    return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  const found = (
    await query('SELECT * FROM compliance_evidence WHERE id = $1 AND compliance_id = $2', [
      req.params.id,
      c.id,
    ])
  ).rows[0];
  if (!found) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  if (found.locked)
    return res.status(409).json({
      error: 'evidence_kept',
      message: 'This document was part of a submission and is kept. Upload a new version instead.',
    });
  await query('DELETE FROM compliance_evidence WHERE id = $1', [found.id]);
  await removeFile(found.storage_key);
  await audit(req, 'compliance.evidence_removed', {
    stage: STAGE,
    ref: c.reference,
    detail: { reference: c.reference, controlId: found.control_id, fileName: found.file_name },
  });
  res.json({ status: 'removed' });
});

complianceVendorRouter.get('/compliance/:ref/evidence/:id', async (req, res) => {
  const c = await vendorCompliance({ query }, req);
  if (!c || !isUuid(req.params.id)) return nf(res);
  const stop = gate(c, false);
  if (stop) return res.status(stop[0]).json(stop[1]);
  const e = (
    await query('SELECT * FROM compliance_evidence WHERE id = $1 AND compliance_id = $2', [
      req.params.id,
      c.id,
    ])
  ).rows[0];
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  res.set('Content-Type', e.mime_type);
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(e.file_name)}"`);
  res.send(await readFile(e.storage_key, e.encrypted));
});

/* Steps 13→16: submit; validate and score (14), save the snapshot (15), share the results with the buyer (16). */
complianceVendorRouter.post('/compliance/:ref/submit', async (req, res) => {
  const out = await tx(async db => {
    const c = await vendorCompliance(db, req, true);
    if (!c) return [404];
    const stop = gate(c, true);
    if (stop) return stop;
    const answers = await answersOf(db, c),
      evidence = await evidenceOf(db, c.id);
    const done = completeness(c.questionnaire, answers);
    if (!done.complete)
      return [
        422,
        {
          error: 'incomplete',
          message: `${plural(done.missing.length, 'required question')} ${done.missing.length === 1 ? 'is' : 'are'} not answered yet.`,
          missing: done.missing,
        },
      ];
    const clarification = c.status === 'clarification';
    const { r, scored, snapshotVersion } = await saveVersion(db, c, {
      answers: plainAnswers(answers),
      evidence,
      userId: req.user.id,
      major: clarification,
      reason: clarification ? `Vendor resubmitted after clarification on ${editable(c).join(', ')}.` : null,
    });
    await db.query('UPDATE compliance_evidence SET locked = true WHERE compliance_id = $1', [c.id]);
    await db.query(
      `UPDATE compliance_assessments SET status = 'submitted', submitted_by = $2, submitted_at = now() WHERE id = $1`,
      [c.id, req.user.id],
    );
    const counts = scored.counts;
    await ev(
      db,
      c.a_id,
      13,
      `${clarification ? 'Clarification' : 'Answers and evidence'} submitted by the vendor: ${done.percent}% complete, ${plural(evidence.length, 'document')}`,
      { completeness: done.percent, documents: evidence.length },
    );
    await ev(
      db,
      c.a_id,
      14,
      `Validated: provisional score ${scored.overall}/100 · ${scored.rating.label} · ${counts.pass} pass, ${counts.partial} partial, ${counts.fail} fail, ${counts.informationRequired} information required`,
      { overall: scored.overall, position: scored.rating.code },
    );
    await ev(
      db,
      c.a_id,
      15,
      `Responses, evidence and ${plural(scored.gaps.length, 'gap')} saved (ComplianceAssessmentSnapshot v${snapshotVersion})`,
      { resultId: r.id, snapshotVersion },
    );
    await ev(db, c.a_id, 16, 'Assessment results and missing items shared with the buyer', {});
    if (!clarification) {
      await db.query(
        `DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 3 AND step IS NULL AND kind = 'milestone'`,
        [c.a_id],
      );
      await db.query(
        `UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 4 AND step IS NULL AND status = 'pending'`,
        [c.a_id],
      );
    }
    await audit(req, 'compliance.submitted', {
      db,
      stage: STAGE,
      ref: c.reference,
      detail: {
        reference: c.reference,
        overall: scored.overall,
        rating: scored.rating.code,
        gaps: scored.gaps.length,
        evidence: evidence.length,
        snapshotVersion,
        snapshotSha256: r.snapshot_sha256,
      },
    });
    return [201, { c, scored, r, done, evidence, snapshotVersion }];
  });
  if (out[0] === 404) return nf(res);
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { c, scored, r, done, evidence, snapshotVersion } = out[1];
  const buyers = (
    await query(
      `SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND p.membership IN ('owner','member') AND u.status = 'active'`,
      [c.buyer_id],
    )
  ).rows;
  for (const b of buyers) {
    try {
      await sendNotice(
        b.email,
        `Compliance answers received for ${c.reference}`,
        [
          `Hello ${b.full_name || ''},`.replace(' ,', ','),
          `${c.vendor_name} has submitted its answers and evidence for "${c.title}" (${c.reference}).`,
          `Provisional assurance score: ${scored.overall}/100 (${scored.rating.label}). ${plural(scored.gaps.length, 'item')} need attention. This is a provisional finding, not a final legal approval.`,
        ],
        {
          kicker: 'COMPLIANCE ASSESSMENT',
          title: 'Results are ready',
          action: { label: 'View the results', url: appLink('/compliance/' + c.reference) },
        },
      );
    } catch (e) {
      console.error('[EMAIL] compliance results notice failed:', e.message);
    }
  }
  // Step 13 output: submission receipt, completeness and evidence processing status.
  res.status(201).json({
    status: 'submitted',
    receipt: {
      id: r.id,
      reference: c.reference,
      submittedAt: r.created_at,
      snapshotVersion,
      completeness: done.percent,
      answered: done.answered,
      total: done.total,
      evidence: evidence.map(e => ({
        fileName: e.fileName,
        controlId: e.controlId,
        status: e.processingStatus,
        label: PROCESSING[e.processingStatus] || null,
      })),
    },
    overall: scored.overall,
    rating: scored.rating,
    gaps: scored.gaps.length,
  });
});
