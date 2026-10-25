/*
 * Stage 8 – Remediation (sequence diagram steps 33–38).
 *
 * Buyer  /api/assessments/:ref/remediation
 *   GET                                   the plan, the remaining risk and the history
 *   POST  /plan                           step 33: propose actions from the latest risk register
 *   POST  /decisions                      step 33: approve and assign, or accept the risk; step 34: vendor is asked
 *   POST  /actions/:no/evidence           proof for one of the buyer's own actions (raw body; ?name=)
 *   POST  /actions/:no/done               the buyer completes its own action
 *   POST  /actions/:no/review             step 36: close or return the vendor's response
 *   GET   /actions/:no/evidence/:id       download a document
 *
 * Vendor /api/vendor/actions
 *   GET   /, /:ref                        actions assigned to the vendor's company
 *   POST  /:ref/:no/evidence              step 35: upload proof (raw body; ?name=)
 *   DELETE /:ref/:no/evidence/:id         remove a document before submitting
 *   POST  /:ref/:no/submit                step 35: send the response for review
 *   GET   /:ref/:no/evidence/:id          download its own document
 *
 * Rules (proposals, due dates, remaining risk) live in engine/remediation.js (provisional, RP-2026.10-S8-draft).
 */
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
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { proposeActions, residualRisks, checkSubmission, ACTION_STATUS, DUE_DAYS, S8_RULE_PACK } from '../engine/remediation.js';

const AUDIT_STAGE = 'stage-8';
const appLink = p => config.frontendOrigin.split(',')[0].trim() + p;
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const actionCode = n => `ACT-${String(n).padStart(2, '0')}`;
const bad = (res, message, fields) => res.status(400).json({ error: 'validation', message, ...(fields ? { fields } : {}) });
const notFound = (res, message = 'Assessment not found.') => res.status(404).json({ error: 'not_found', message });

/* ================= Shared ================= */

const shapeAction = (a, evidence = [], events = []) => ({
  id: a.id, number: a.number, code: actionCode(a.number), registerVersion: a.register_version, riskId: a.risk_id, theme: a.theme,
  title: a.title, owner: a.owner, requests: a.requests, needsDocument: a.needs_document, sourceStages: a.source_stages,
  rating: a.rating, score: a.score, status: a.status, statusLabel: ACTION_STATUS[a.status].label,
  dueOn: a.due_on ? String(a.due_on instanceof Date ? a.due_on.toISOString() : a.due_on).slice(0, 10) : null,
  suggestedDueOn: String(a.suggested_due_on instanceof Date ? a.suggested_due_on.toISOString() : a.suggested_due_on).slice(0, 10),
  buyerNote: a.buyer_note, response: a.response, submittedAt: a.submitted_at, closedAt: a.closed_at, updatedAt: a.updated_at,
  evidence: evidence.map(e => ({ id: e.id, fileName: e.file_name, size: e.size_bytes, sha256: e.sha256, uploadedAt: e.uploaded_at, submitted: e.submitted })),
  history: events.map(e => ({ at: e.at, event: e.event, by: e.actor_email || e.actor_role, role: e.actor_role, detail: e.detail })),
});

async function loadActions(db, assessmentId, { owner = null } = {}) {
  const { rows: actions } = await db.query(
    `SELECT * FROM remediation_actions WHERE assessment_id = $1 ${owner ? 'AND owner = $2' : ''} ORDER BY number`,
    owner ? [assessmentId, owner] : [assessmentId]);
  if (!actions.length) return [];
  const ids = actions.map(a => a.id);
  const { rows: evidence } = await db.query('SELECT * FROM remediation_evidence WHERE action_id = ANY($1) ORDER BY uploaded_at', [ids]);
  const { rows: events } = await db.query(
    `SELECT e.*, u.email AS actor_email FROM remediation_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.action_id = ANY($1) ORDER BY e.id`, [ids]);
  return actions.map(a => shapeAction(a, evidence.filter(e => e.action_id === a.id), events.filter(e => e.action_id === a.id)));
}

const engineView = a => ({ theme: a.theme, status: a.status, dueOn: a.dueOn, sourceStages: a.sourceStages });

async function latestRegister(db, assessmentId) {
  return (await db.query('SELECT version, risks FROM risk_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [assessmentId])).rows[0] || null;
}

const logEvent = (db, actionId, req, event, detail = {}) => db.query(
  'INSERT INTO remediation_events (action_id, actor_id, actor_role, event, detail) VALUES ($1, $2, $3, $4, $5)',
  [actionId, req.user.id, req.user.is_admin ? 'admin' : req.user.role, event, JSON.stringify(detail)]);

const timeline = (db, assessmentId, step, title, detail = {}) => db.query(
  `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1, 'event', 8, $2, $3, 'done', now(), $4)`,
  [assessmentId, step, title, JSON.stringify(detail)]);

/*
 * Steps 36–38: work out the remaining risk, save a snapshot, put it on the timeline.
 * Called whenever an action is closed or a risk is accepted.
 */
async function reassess(db, req, assessment, reason) {
  const register = await latestRegister(db, assessment.id);
  const actions = await loadActions(db, assessment.id);
  const residual = residualRisks(register.risks, actions.map(engineView));
  const version = ((await db.query('SELECT max(version) AS v FROM remediation_snapshots WHERE assessment_id = $1', [assessment.id])).rows[0].v || 0) + 1;
  const actionStates = actions.map(a => ({ code: a.code, theme: a.theme, owner: a.owner, status: a.status }));
  const snapshot = { reference: assessment.reference, version, registerVersion: register.version, reason, residual: residual.risks, actions: actionStates };
  await db.query(
    `INSERT INTO remediation_snapshots (assessment_id, version, register_version, reason, rule_pack_version, residual, actions, snapshot_sha256, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [assessment.id, version, register.version, reason, S8_RULE_PACK, JSON.stringify(residual), JSON.stringify(actionStates), sha256(JSON.stringify(snapshot)), req.user.id]);

  const t = residual.totals;
  await timeline(db, assessment.id, 36, `Checks re-run (${reason}): remaining highest risk ${residual.overall.label.toLowerCase()}`, { version });
  await timeline(db, assessment.id, 37, `Action and reassessment history saved (snapshot v${version})`, { version });
  await timeline(db, assessment.id, 38, `Updated status: ${t.open + t.awaitingReview + t.proposed} outstanding, ${t.closed} closed, ${t.accepted} accepted`, { version });

  // Every action closed or accepted: Stage 8 is done and Stage 9 is next.
  if (actions.length && actions.every(a => !ACTION_STATUS[a.status].open)) {
    await db.query(`DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 8 AND step IS NULL AND kind = 'milestone'`, [assessment.id]);
    await db.query(`UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 9 AND step IS NULL AND status = 'pending'`, [assessment.id]);
  }
  await audit(req, 'remediation.reassessed', { db, stage: AUDIT_STAGE, ref: assessment.reference,
    detail: { reference: assessment.reference, version, reason, overall: residual.overall.rating, ...t } });
  return version;
}

async function storeEvidence(req, res, action) {
  const name = String(req.query.name || '').replace(/[\\/\0]/g, '_').trim().slice(0, 200);
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!name || !DOC_RULES.extensions[ext]) return bad(res, `This file type is not supported. Use: ${Object.keys(DOC_RULES.extensions).join(', ')}.`);
  if (!body.length) return bad(res, 'The file is empty.');
  if (body.length > DOC_RULES.maxBytes) return bad(res, 'The file is larger than 10 MB.');
  const id = crypto.randomUUID();
  const key = path.join('remediation', action.id, id);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  await saveFile(key, body);
  await query(
    `INSERT INTO remediation_evidence (id, action_id, file_name, mime_type, size_bytes, sha256, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, action.id, name, DOC_RULES.extensions[ext], body.length, hash, key, req.user.id]);
  await query('INSERT INTO remediation_events (action_id, actor_id, actor_role, event, detail) VALUES ($1, $2, $3, $4, $5)',
    [action.id, req.user.id, req.user.role, 'evidence_uploaded', JSON.stringify({ fileName: name, sha256: hash })]);
  return null;
}

async function sendEvidence(res, actionId, evidenceId) {
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId)) return notFound(res, 'Document not found.');
  const e = (await query('SELECT * FROM remediation_evidence WHERE id = $1 AND action_id = $2', [evidenceId, actionId])).rows[0];
  if (!e) return notFound(res, 'Document not found.');
  res.setHeader('Content-Type', e.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${e.file_name.replace(/"/g, '')}"`);
  res.send(await readFile(e.storage_key));
}

/* ================= Buyer ================= */
export const remediationBuyerRouter = Router();
remediationBuyerRouter.use('/:ref/remediation', requireRole('buyer'), requireActiveMembership);

async function findBuyerAssessment(db, req) {
  const buyerId = await buyerOrganisation(db, req.user.id);
  if (!buyerId) return null;
  return (await db.query(
    `SELECT a.*, r.title, o.name AS buyer_name, v.name AS vendor_name
       FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.reference = $1 AND a.buyer_id = $2`, [req.params.ref, buyerId])).rows[0] || null;
}

export async function remediationState(db, assessment) {
  const register = await latestRegister(db, assessment.id);
  const actions = await loadActions(db, assessment.id);
  const planned = new Set(actions.map(a => `${a.theme}:${a.owner}`));
  const newProposals = register ? proposeActions(register.risks, new Date(), planned) : [];
  const residual = register ? residualRisks(register.risks, actions.map(engineView)) : null;
  const { rows: snapshots } = await db.query(
    `SELECT s.version, s.register_version, s.reason, s.residual, s.snapshot_sha256, s.created_at, u.email AS created_by
       FROM remediation_snapshots s JOIN users u ON u.id = s.created_by WHERE s.assessment_id = $1 ORDER BY s.version DESC`, [assessment.id]);
  return {
    assessment: { reference: assessment.reference, title: assessment.title, buyerName: assessment.buyer_name },
    vendor: assessment.selected_vendor_id ? { id: assessment.selected_vendor_id, name: assessment.vendor_name } : null,
    blocked: register ? null : 'Build the risk register first (Stage 7).',
    registerVersion: register?.version || null,
    planVersion: actions.length ? Math.max(...actions.map(a => a.registerVersion)) : null,
    canPlan: !!register && newProposals.length > 0,
    newProposals: newProposals.length,
    actions,
    residual,
    snapshots: snapshots.map(s => ({ version: s.version, registerVersion: s.register_version, reason: s.reason, overall: s.residual.overall,
      totals: s.residual.totals, snapshotSha256: s.snapshot_sha256, createdAt: s.created_at, createdBy: s.created_by })),
    dueDays: DUE_DAYS,
    rulePackVersion: S8_RULE_PACK,
  };
}

remediationBuyerRouter.get('/:ref/remediation', async (req, res) => {
  const a = await findBuyerAssessment({ query }, req); if (!a) return notFound(res);
  res.json(await remediationState({ query }, a));
});

/* Step 33: propose actions for every risk that has none yet. */
remediationBuyerRouter.post('/:ref/remediation/plan', async (req, res) => {
  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [a.id]);
    const register = await latestRegister(db, a.id);
    if (!register) return [409, { error: 'not_ready', message: 'Build the risk register first (Stage 7).' }];
    const existing = await loadActions(db, a.id);
    const proposals = proposeActions(register.risks, new Date(), new Set(existing.map(x => `${x.theme}:${x.owner}`)));
    if (!proposals.length) return [409, { error: 'up_to_date', message: 'Every risk in the latest register already has an action.' }];
    let number = existing.length ? Math.max(...existing.map(x => x.number)) : 0;
    for (const p of proposals) {
      number++;
      const { rows } = await db.query(
        `INSERT INTO remediation_actions (assessment_id, number, register_version, risk_id, theme, title, owner, requests, needs_document, source_stages, rating, score, suggested_due_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [a.id, number, register.version, p.riskId, p.theme, p.title, p.owner, JSON.stringify(p.requests), p.needsDocument, JSON.stringify(p.sourceStages), p.rating, p.score, p.suggestedDueOn]);
      await logEvent(db, rows[0].id, req, 'proposed', { riskId: p.riskId, registerVersion: register.version });
    }
    await audit(req, 'remediation.planned', { db, stage: AUDIT_STAGE, ref: a.reference,
      detail: { reference: a.reference, registerVersion: register.version, proposed: proposals.length, rulePackVersion: S8_RULE_PACK } });
    return [201, await remediationState(db, a)];
  });
  if (out[0] === 404) return notFound(res);
  res.status(out[0]).json(out[1]);
});

/* Step 33: the buyer approves and assigns proposed actions, or accepts the risk. Step 34: the vendor is asked. */
const decisionSchema = z.object({
  decisions: z.array(z.object({
    number: z.number().int().positive(),
    decision: z.enum(['assign', 'accept']),
    owner: z.enum(['vendor', 'buyer']).optional(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the due date as YYYY-MM-DD.').optional(),
    note: z.string().trim().max(1000).optional().or(z.literal('')),
  })).min(1, 'Choose at least one action.').max(100),
});

remediationBuyerRouter.post('/:ref/remediation/decisions', async (req, res) => {
  const p = decisionSchema.safeParse(req.body || {});
  if (!p.success) return bad(res, p.error.issues[0].message);
  const today = new Date().toISOString().slice(0, 10);
  for (const d of p.data.decisions) {
    if (d.decision === 'accept' && (d.note || '').length < 10) return bad(res, `${actionCode(d.number)}: give the reason for accepting the risk (at least 10 characters).`);
    if (d.dueOn && d.dueOn < today) return bad(res, `${actionCode(d.number)}: the due date cannot be in the past.`);
  }

  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    const vendorAsks = [];
    let assigned = 0, accepted = 0;
    for (const d of p.data.decisions) {
      const action = (await db.query('SELECT * FROM remediation_actions WHERE assessment_id = $1 AND number = $2 FOR UPDATE', [a.id, d.number])).rows[0];
      if (!action) return [404, { error: 'not_found', message: `${actionCode(d.number)} not found.` }];
      if (action.status !== 'PROPOSED') return [409, { error: 'decided', message: `${actionCode(d.number)} has already been decided.` }];
      if (d.decision === 'accept') {
        await db.query(`UPDATE remediation_actions SET status = 'RISK_ACCEPTED', buyer_note = $2, closed_at = now(), updated_at = now() WHERE id = $1`, [action.id, d.note]);
        await logEvent(db, action.id, req, 'risk_accepted', { reason: d.note });
        accepted++;
        continue;
      }
      const owner = d.owner || action.owner;
      if (owner === 'vendor' && !a.selected_vendor_id) return [409, { error: 'no_vendor', message: 'There is no selected vendor to assign this to.' }];
      const due = d.dueOn || String(action.suggested_due_on instanceof Date ? action.suggested_due_on.toISOString() : action.suggested_due_on).slice(0, 10);
      await db.query(`UPDATE remediation_actions SET status = 'OPEN', owner = $2, due_on = $3, buyer_note = $4, updated_at = now() WHERE id = $1`,
        [action.id, owner, due, d.note || null]);
      await logEvent(db, action.id, req, 'assigned', { owner, dueOn: due, note: d.note || null });
      if (owner === 'vendor') vendorAsks.push({ code: actionCode(action.number), title: action.title, due });
      assigned++;
    }
    if (assigned) await timeline(db, a.id, 33, `Actions approved and assigned (${assigned})`, {});
    if (vendorAsks.length) await timeline(db, a.id, 34, `Corrections and documents requested from ${a.vendor_name} (${vendorAsks.length} action${vendorAsks.length === 1 ? '' : 's'})`, {});
    await audit(req, 'remediation.decided', { db, stage: AUDIT_STAGE, ref: a.reference,
      detail: { reference: a.reference, assigned, accepted, toVendor: vendorAsks.map(v => v.code) } });
    if (accepted) await reassess(db, req, a, `${accepted} risk${accepted === 1 ? '' : 's'} accepted`);
    return [200, { state: await remediationState(db, a), a, vendorAsks }];
  });
  if (out[0] === 404) return notFound(res, out[1]?.message);
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);

  const { a, vendorAsks } = out[1];
  if (vendorAsks.length) await notifyVendor(a, `${a.buyer_name} has sent you ${vendorAsks.length} action${vendorAsks.length === 1 ? '' : 's'} to complete`,
    [`${a.buyer_name} needs some corrections or documents for "${a.title}" (${a.reference}):`, ...vendorAsks.map(v => `${v.code} · ${v.title} — due ${v.due}`)],
    'ACTIONS REQUESTED', 'Actions waiting for you');
  res.json(out[1].state);
});

async function notifyVendor(a, subject, lines, kicker, title) {
  const people = (await query(`SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND u.status = 'active'`, [a.selected_vendor_id])).rows;
  for (const v of people) {
    try {
      await sendNotice(v.email, subject, [`Hello ${v.full_name || ''},`.replace(' ,', ','), ...lines],
        { kicker, title, action: { label: 'Open your actions', url: appLink('/vendor/actions/' + a.reference) } });
    } catch (e) { console.error('[EMAIL] remediation notice failed:', e.message); }
  }
}

async function buyerAction(db, req, a, lock = false) {
  const number = Number(req.params.no);
  if (!Number.isInteger(number)) return null;
  return (await db.query(`SELECT * FROM remediation_actions WHERE assessment_id = $1 AND number = $2${lock ? ' FOR UPDATE' : ''}`, [a.id, number])).rows[0] || null;
}

/* The buyer's own actions: upload proof, then mark it done (checked straight away; no review needed). */
remediationBuyerRouter.post('/:ref/remediation/actions/:no/evidence', express.raw({ type: () => true, limit: DOC_RULES.maxBytes + 1 }), async (req, res) => {
  const a = await findBuyerAssessment({ query }, req); if (!a) return notFound(res);
  const action = await buyerAction({ query }, req, a);
  if (!action) return notFound(res, 'Action not found.');
  if (action.owner !== 'buyer' || !['OPEN', 'RETURNED'].includes(action.status)) return res.status(409).json({ error: 'locked', message: 'Documents can only be added to your own open actions.' });
  const failed = await storeEvidence(req, res, action); if (failed !== null) return;
  res.status(201).json(await remediationState({ query }, a));
});

remediationBuyerRouter.post('/:ref/remediation/actions/:no/done', async (req, res) => {
  const response = String(req.body?.response || '').trim().slice(0, 3000);
  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    const action = await buyerAction(db, req, a, true);
    if (!action) return [404, { error: 'not_found', message: 'Action not found.' }];
    if (action.owner !== 'buyer' || !['OPEN', 'RETURNED'].includes(action.status)) return [409, { error: 'locked', message: 'Only your own open actions can be marked done here.' }];
    const evidence = (await db.query('SELECT count(*)::int AS n FROM remediation_evidence WHERE action_id = $1', [action.id])).rows[0].n;
    const problems = checkSubmission(action, response, evidence);
    if (problems.length) return [400, { error: 'validation', message: problems.join(' '), problems }];
    await db.query(`UPDATE remediation_evidence SET submitted = true WHERE action_id = $1`, [action.id]);
    await db.query(`UPDATE remediation_actions SET status = 'CLOSED', response = $2, submitted_at = now(), closed_at = now(), updated_at = now() WHERE id = $1`, [action.id, response]);
    await logEvent(db, action.id, req, 'closed', { by: 'buyer', response, documents: evidence });
    await reassess(db, req, a, `${actionCode(action.number)} done by the buyer`);
    return [200, await remediationState(db, a)];
  });
  if (out[0] === 404) return notFound(res, out[1]?.message);
  res.status(out[0]).json(out[1]);
});

/* Step 36: the buyer checks the vendor's response and closes it, or returns it with what is still missing. */
const reviewSchema = z.object({ outcome: z.enum(['close', 'return']), note: z.string().trim().max(1000).optional().or(z.literal('')) });

remediationBuyerRouter.post('/:ref/remediation/actions/:no/review', async (req, res) => {
  const p = reviewSchema.safeParse(req.body || {});
  if (!p.success) return bad(res, 'Choose close or return.');
  if (p.data.outcome === 'return' && (p.data.note || '').length < 10) return bad(res, 'Say what is still missing (at least 10 characters).', { note: 'Say what is still missing.' });
  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    const action = await buyerAction(db, req, a, true);
    if (!action) return [404, { error: 'not_found', message: 'Action not found.' }];
    if (action.status !== 'SUBMITTED') return [409, { error: 'not_submitted', message: 'Only a submitted response can be reviewed.' }];
    if (p.data.outcome === 'close') {
      await db.query(`UPDATE remediation_actions SET status = 'CLOSED', closed_at = now(), updated_at = now() WHERE id = $1`, [action.id]);
      await logEvent(db, action.id, req, 'closed', { note: p.data.note || null });
      await reassess(db, req, a, `${actionCode(action.number)} closed`);
    } else {
      await db.query(`UPDATE remediation_actions SET status = 'RETURNED', buyer_note = $2, updated_at = now() WHERE id = $1`, [action.id, p.data.note]);
      await logEvent(db, action.id, req, 'returned', { note: p.data.note });
      await timeline(db, a.id, 34, `${actionCode(action.number)} returned to the vendor: more needed`, {});
    }
    await audit(req, p.data.outcome === 'close' ? 'remediation.closed' : 'remediation.returned', { db, stage: AUDIT_STAGE, ref: a.reference,
      detail: { reference: a.reference, action: actionCode(action.number), note: p.data.note || null } });
    return [200, { state: await remediationState(db, a), a, action }];
  });
  if (out[0] === 404) return notFound(res, out[1]?.message);
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);
  const { a, action } = out[1];
  if (p.data.outcome === 'return') await notifyVendor(a, `${actionCode(action.number)} needs more from you`,
    [`${a.buyer_name} has reviewed your response to ${actionCode(action.number)} · ${action.title}.`, `What is still needed: ${p.data.note}`], 'ACTION RETURNED', 'More information needed');
  res.json(out[1].state);
});

remediationBuyerRouter.get('/:ref/remediation/actions/:no/evidence/:id', async (req, res) => {
  const a = await findBuyerAssessment({ query }, req); if (!a) return notFound(res);
  const action = await buyerAction({ query }, req, a);
  if (!action) return notFound(res, 'Action not found.');
  return sendEvidence(res, action.id, req.params.id);
});

/* ================= Vendor ================= */
export const remediationVendorRouter = Router();
remediationVendorRouter.use('/actions', requireRole('vendor'));

const vendorOrg = async req => (await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0]?.organisation_id || null;

async function vendorAssessment(db, req) {
  const org = await vendorOrg(req); if (!org) return null;
  return (await db.query(
    `SELECT a.*, r.title, o.name AS buyer_name FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
      WHERE a.reference = $1 AND a.selected_vendor_id = $2`, [req.params.ref, org])).rows[0] || null;
}

async function vendorAction(db, req, a, lock = false) {
  const number = Number(req.params.no);
  if (!Number.isInteger(number)) return null;
  // PROPOSED actions are the buyer's draft: the vendor only sees what was assigned to it.
  return (await db.query(`SELECT * FROM remediation_actions WHERE assessment_id = $1 AND number = $2 AND owner = 'vendor' AND status <> 'PROPOSED'${lock ? ' FOR UPDATE' : ''}`,
    [a.id, number])).rows[0] || null;
}

const vendorView = action => {
  const { history, ...rest } = action;
  // The vendor sees its own history, without the buyer's internal scores.
  return { ...rest, rating: undefined, score: undefined, history: history.filter(h => h.event !== 'proposed') };
};

remediationVendorRouter.get('/actions', async (req, res) => {
  const org = await vendorOrg(req); if (!org) return res.json({ assessments: [] });
  const { rows } = await query(
    `SELECT a.reference, r.title, o.name AS buyer_name,
            count(*) FILTER (WHERE x.status IN ('OPEN', 'RETURNED'))::int AS to_do,
            count(*) FILTER (WHERE x.status = 'SUBMITTED')::int AS submitted,
            count(*) FILTER (WHERE x.status = 'CLOSED')::int AS closed,
            min(x.due_on) FILTER (WHERE x.status IN ('OPEN', 'RETURNED')) AS next_due
       FROM remediation_actions x JOIN assessments a ON a.id = x.assessment_id JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
      WHERE a.selected_vendor_id = $1 AND x.owner = 'vendor' AND x.status <> 'PROPOSED'
      GROUP BY a.reference, r.title, o.name ORDER BY next_due NULLS LAST`, [org]);
  res.json({ assessments: rows.map(r => ({ reference: r.reference, title: r.title, buyerName: r.buyer_name, toDo: r.to_do, submitted: r.submitted, closed: r.closed,
    nextDue: r.next_due ? new Date(r.next_due).toISOString().slice(0, 10) : null })) });
});

remediationVendorRouter.get('/actions/:ref', async (req, res) => {
  const a = await vendorAssessment({ query }, req); if (!a) return notFound(res);
  const actions = (await loadActions({ query }, a.id, { owner: 'vendor' })).filter(x => x.status !== 'PROPOSED');
  res.json({ reference: a.reference, title: a.title, buyerName: a.buyer_name, actions: actions.map(vendorView),
    fileRules: { maxBytes: DOC_RULES.maxBytes, extensions: Object.keys(DOC_RULES.extensions) } });
});

remediationVendorRouter.post('/actions/:ref/:no/evidence', express.raw({ type: () => true, limit: DOC_RULES.maxBytes + 1 }), async (req, res) => {
  const a = await vendorAssessment({ query }, req); if (!a) return notFound(res);
  const action = await vendorAction({ query }, req, a);
  if (!action) return notFound(res, 'Action not found.');
  if (!['OPEN', 'RETURNED'].includes(action.status)) return res.status(409).json({ error: 'locked', message: 'This action has been submitted and can no longer be changed.' });
  const failed = await storeEvidence(req, res, action); if (failed !== null) return;
  const actions = (await loadActions({ query }, a.id, { owner: 'vendor' })).filter(x => x.status !== 'PROPOSED');
  res.status(201).json({ actions: actions.map(vendorView) });
});

remediationVendorRouter.delete('/actions/:ref/:no/evidence/:id', async (req, res) => {
  const a = await vendorAssessment({ query }, req); if (!a) return notFound(res);
  const action = await vendorAction({ query }, req, a);
  if (!action || !/^[0-9a-f-]{36}$/i.test(req.params.id)) return notFound(res, 'Document not found.');
  const e = (await query('DELETE FROM remediation_evidence WHERE id = $1 AND action_id = $2 AND submitted = false RETURNING *', [req.params.id, action.id])).rows[0];
  if (!e) return res.status(409).json({ error: 'locked', message: 'A document that was already submitted cannot be removed.' });
  await removeFile(e.storage_key);
  await query('INSERT INTO remediation_events (action_id, actor_id, actor_role, event, detail) VALUES ($1, $2, $3, $4, $5)',
    [action.id, req.user.id, 'vendor', 'evidence_removed', JSON.stringify({ fileName: e.file_name })]);
  const actions = (await loadActions({ query }, a.id, { owner: 'vendor' })).filter(x => x.status !== 'PROPOSED');
  res.json({ actions: actions.map(vendorView) });
});

/* Step 35: the vendor sends its response; the engine checks it before it reaches the buyer. */
remediationVendorRouter.post('/actions/:ref/:no/submit', async (req, res) => {
  const response = String(req.body?.response || '').trim().slice(0, 3000);
  const out = await tx(async db => {
    const a = await vendorAssessment(db, req); if (!a) return [404];
    const action = await vendorAction(db, req, a, true);
    if (!action) return [404, { error: 'not_found', message: 'Action not found.' }];
    if (!['OPEN', 'RETURNED'].includes(action.status)) return [409, { error: 'locked', message: 'This action has already been submitted.' }];
    const evidence = (await db.query('SELECT count(*)::int AS n FROM remediation_evidence WHERE action_id = $1', [action.id])).rows[0].n;
    const problems = checkSubmission(action, response, evidence);
    if (problems.length) return [400, { error: 'validation', message: problems.join(' '), problems }];
    await db.query(`UPDATE remediation_evidence SET submitted = true WHERE action_id = $1`, [action.id]);
    await db.query(`UPDATE remediation_actions SET status = 'SUBMITTED', response = $2, submitted_at = now(), updated_at = now() WHERE id = $1`, [action.id, response]);
    await logEvent(db, action.id, req, 'submitted', { response, documents: evidence });
    await timeline(db, a.id, 35, `Evidence and response submitted by the vendor for ${actionCode(action.number)}`, {});
    await audit(req, 'remediation.submitted', { db, stage: AUDIT_STAGE, ref: a.reference, detail: { reference: a.reference, action: actionCode(action.number), documents: evidence } });
    const actions = (await loadActions(db, a.id, { owner: 'vendor' })).filter(x => x.status !== 'PROPOSED');
    return [200, { actions: actions.map(vendorView), a, action }];
  });
  if (out[0] === 404) return notFound(res, out[1]?.message);
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);

  const { a, action } = out[1];
  const buyers = (await query(`SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.organisation_id = $1 AND p.membership IN ('owner', 'member') AND u.status = 'active'`, [a.buyer_id])).rows;
  for (const b of buyers) {
    try {
      await sendNotice(b.email, `${actionCode(action.number)}: the vendor has responded`,
        [`Hello ${b.full_name || ''},`.replace(' ,', ','), `The vendor has sent its response and evidence for ${actionCode(action.number)} · ${action.title} (${a.reference}).`, 'Review it and close the action, or return it with what is still missing.'],
        { kicker: 'REMEDIATION', title: 'A response is waiting for your review', action: { label: 'Review the response', url: appLink('/remediation/' + a.reference) } });
    } catch (e) { console.error('[EMAIL] remediation notice failed:', e.message); }
  }
  res.json({ actions: out[1].actions });
});

remediationVendorRouter.get('/actions/:ref/:no/evidence/:id', async (req, res) => {
  const a = await vendorAssessment({ query }, req); if (!a) return notFound(res);
  const action = await vendorAction({ query }, req, a);
  if (!action) return notFound(res, 'Action not found.');
  return sendEvidence(res, action.id, req.params.id);
});

remediationVendorRouter.use((err, _req, res, next) => err.type === 'entity.too.large' ? res.status(400).json({ error: 'file_rejected', message: 'The file is larger than 10 MB.' }) : next(err));
remediationBuyerRouter.use((err, _req, res, next) => err.type === 'entity.too.large' ? res.status(400).json({ error: 'file_rejected', message: 'The file is larger than 10 MB.' }) : next(err));
