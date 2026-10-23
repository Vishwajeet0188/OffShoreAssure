/* Stage 3 — Compliance assessment (sequence diagram steps 10–16).
   Buyer  (/api/assessments/:ref/compliance):  step 10 start · step 11 questionnaire · step 12 request · step 16 results
   Vendor (/api/vendor/compliance):            step 13 answers + evidence · submit → step 14 validate/score · step 15 save
   Rules (questions, evidence, scoring) live in engine/questionnaire.js (provisional, RP-2026.10-S3-draft). */
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
import { buildSummary } from '../assessments/profile.js';
import { buildQuestionnaire, checkReadiness, scoreAssessment, S3_RULE_PACK, ANSWERS, EVIDENCE_TYPES, EXPIRING } from '../engine/questionnaire.js';

const STAGE = 'stage-3';
const DUE_DAYS = 14;
const appLink = p => config.frontendOrigin.split(',')[0].trim() + p;
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const sha = o => crypto.createHash('sha256').update(JSON.stringify(stable(o))).digest('hex');
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
const ev = (db, a, step, title, detail = {}) => db.query(`INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',3,$2,$3,'done',now(),$4)`, [a.id, step, title, JSON.stringify(detail)]);

const evShape = e => ({ id: e.id, controlId: e.control_id, type: e.doc_type, fileName: e.file_name, size: e.size_bytes, sha256: e.sha256, expiresOn: e.expires_on || null, uploadedAt: e.uploaded_at });
const resultShape = r => r && ({ id: r.id, version: r.version, overall: r.overall_score, rating: r.result.rating, areas: r.result.areas, controls: r.result.controls, gaps: r.result.gaps,
  observations: r.result.observations, note: r.result.note, answers: r.answers, evidence: r.evidence, rulePackVersion: r.rule_pack_version, snapshotSha256: r.snapshot_sha256, createdAt: r.created_at });

async function answersOf(db, cid) {
  return Object.fromEntries((await db.query('SELECT question_id, answer, comment, updated_at FROM compliance_answers WHERE compliance_id = $1', [cid])).rows
    .map(r => [r.question_id, { answer: r.answer, comment: r.comment, updatedAt: r.updated_at }]));
}
const evidenceOf = async (db, cid) => (await db.query('SELECT * FROM compliance_evidence WHERE compliance_id = $1 ORDER BY uploaded_at', [cid])).rows.map(evShape);
const latestResult = async (db, cid) => (await db.query('SELECT * FROM compliance_results WHERE compliance_id = $1 ORDER BY version DESC LIMIT 1', [cid])).rows[0] || null;

function progress(questionnaire, answers, evidence) {
  const total = questionnaire.reduce((n, c) => n + c.questions.length, 0);
  return { total, answered: Object.values(answers).filter(a => ANSWERS.includes(a.answer)).length, evidence: evidence.length, controls: questionnaire.length };
}
function shapeCompliance(c, answers, evidence, extra = {}) {
  return { id: c.id, status: c.status, dueOn: String(c.due_on).slice(0, 10), startedAt: c.started_at, submittedAt: c.submitted_at,
    selectionVersion: c.selection_version, requirementVersion: c.requirement_version, rulePackVersion: c.rule_pack_version,
    questionnaire: c.questionnaire, progress: progress(c.questionnaire, answers, evidence), ...extra };
}

/* ================= Buyer ================= */
export const complianceBuyerRouter = Router();
const buyerOnly = [requireRole('buyer'), requireActiveMembership];

async function buyerAssessment(db, req, lock = false) {
  const buyerId = await buyerOrganisation(db, req.user.id); if (!buyerId) return null;
  return (await db.query(`SELECT a.*, r.title, r.data, o.name AS buyer_name, v.name AS vendor_name FROM assessments a JOIN requirements r ON r.id = a.requirement_id
      JOIN organisations o ON o.id = a.buyer_id LEFT JOIN organisations v ON v.id = a.selected_vendor_id WHERE a.reference = $1 AND a.buyer_id = $2${lock ? ' FOR UPDATE OF a' : ''}`,
    [req.params.ref, buyerId])).rows[0] || null;
}

export async function complianceState(db, a, { full = true } = {}) {
  const c = (await db.query('SELECT * FROM compliance_assessments WHERE assessment_id = $1', [a.id])).rows[0];
  const summary = await buildSummary(db, a.id);
  const blocked = !a.selected_vendor_id ? 'Select a vendor first (Stage 2).'
    : summary?.currentStatus.code === 'INFORMATION_REQUIRED' ? 'Some requirement answers contradict each other. Correct them (Stage 1) first.' : null;
  const base = { assessment: { reference: a.reference, title: a.title, buyerName: a.buyer_name, requirementVersion: a.requirement_version },
    vendor: a.selected_vendor_id ? { id: a.selected_vendor_id, name: a.vendor_name } : null, blocked,
    controls: (summary?.assuranceControls || []).length, evidenceTypes: EVIDENCE_TYPES, rulePackVersion: S3_RULE_PACK };
  if (!c) return { ...base, compliance: null, result: null };
  const answers = await answersOf(db, c.id), evidence = await evidenceOf(db, c.id);
  const submitted = c.status === 'submitted';
  return { ...base, compliance: shapeCompliance(c, answers, evidence, full && submitted ? { answers, evidence } : {}), result: resultShape(await latestResult(db, c.id)) };
}

complianceBuyerRouter.get('/:ref/compliance', ...buyerOnly, async (req, res) => {
  const a = await buyerAssessment({ query }, req); if (!a) return res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });
  res.json(await complianceState({ query }, a));
});

/* Steps 10–12: start, generate the questionnaire, send the request to the vendor. */
complianceBuyerRouter.post('/:ref/compliance', ...buyerOnly, async (req, res) => {
  const out = await tx(async db => {
    const a = await buyerAssessment(db, req, true); if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const st = await complianceState(db, a);
    if (st.blocked) return [409, { error: 'not_ready', message: st.blocked }];
    if (st.compliance) return [409, { error: 'already_started', message: 'The compliance assessment has already been started.' }];
    const p = (await db.query('SELECT * FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [a.id])).rows[0];
    const questionnaire = buildQuestionnaire(p?.validation_findings?.controls || []);
    if (!questionnaire.length) return [409, { error: 'no_controls', message: 'No assurance controls apply to this requirement, so there is nothing to assess.' }];
    const qn = questionnaire.reduce((n, c) => n + c.questions.length, 0);
    const c = (await db.query(`INSERT INTO compliance_assessments (assessment_id, vendor_id, selection_version, requirement_version, questionnaire, rule_pack_version, due_on, started_by)
      VALUES ($1,$2,$3,$4,$5,$6, (now() + interval '${DUE_DAYS} days')::date, $7) RETURNING *`,
      [a.id, a.selected_vendor_id, a.selection_version, a.requirement_version, JSON.stringify(questionnaire), S3_RULE_PACK, req.user.id])).rows[0];
    await ev(db, a, 10, `Compliance assessment started with ${a.vendor_name}`, { complianceId: c.id });
    await ev(db, a, 11, `Control set and questionnaire generated (${questionnaire.length} controls, ${qn} questions)`, { controls: questionnaire.map(x => x.id) });
    await ev(db, a, 12, `Answers and evidence requested from ${a.vendor_name} (due ${c.due_on})`, {});
    await audit(req, 'compliance.started', { db, stage: STAGE, ref: a.reference, detail: { reference: a.reference, vendorId: a.selected_vendor_id, vendorName: a.vendor_name, controls: questionnaire.length, questions: qn, rulePackVersion: S3_RULE_PACK } });
    return [201, { a, c, qn, n: questionnaire.length }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { a, c, qn, n } = out[1];
  const people = (await query(`SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND u.status = 'active'`, [a.selected_vendor_id])).rows;
  for (const v of people) {
    try {
      await sendNotice(v.email, `${a.buyer_name} has sent you a compliance questionnaire`,
        [`Hello ${v.full_name || ''},`.replace(' ,', ','), `${a.buyer_name} has started the compliance assessment for "${a.title}" (${a.reference}).`,
          `Please answer ${qn} questions across ${n} controls and upload supporting evidence such as certificates and policies by ${c.due_on}.`],
        { kicker: 'COMPLIANCE ASSESSMENT', title: 'Questionnaire waiting for you', action: { label: 'Open the questionnaire', url: appLink('/vendor/assessments/' + a.reference) } });
    } catch (e) { console.error('[EMAIL] compliance request failed:', e.message); }
  }
  res.status(201).json(await complianceState({ query }, a));
});

complianceBuyerRouter.get('/:ref/compliance/evidence/:id', ...buyerOnly, async (req, res) => {
  const a = await buyerAssessment({ query }, req); if (!a || !isUuid(req.params.id)) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  const e = (await query(`SELECT e.* FROM compliance_evidence e JOIN compliance_assessments c ON c.id = e.compliance_id WHERE e.id = $1 AND c.assessment_id = $2 AND c.status = 'submitted'`, [req.params.id, a.id])).rows[0];
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  res.set('Content-Type', e.mime_type); res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(e.file_name)}"`);
  res.send(await readFile(e.storage_key, e.encrypted));
});

/* ================= Vendor ================= */
export const complianceVendorRouter = Router();
complianceVendorRouter.use(requireRole('vendor'));

async function vendorCompliance(db, req, lock = false) {
  const org = (await db.query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0]?.organisation_id;
  if (!org) return null;
  return (await db.query(`SELECT c.*, a.reference, a.id AS a_id, r.title, r.data->>'serviceCategory' AS service_category, o.name AS buyer_name, a.buyer_id
      FROM compliance_assessments c JOIN assessments a ON a.id = c.assessment_id JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
     WHERE a.reference = $1 AND c.vendor_id = $2 AND a.selected_vendor_id = $2${lock ? ' FOR UPDATE OF c' : ''}`, [req.params.ref, org])).rows[0] || null;
}
const nf = res => res.status(404).json({ error: 'not_found', message: 'Questionnaire not found.' });
const locked = res => res.status(409).json({ error: 'submitted', message: 'This questionnaire has been submitted and can no longer be changed.' });

complianceVendorRouter.get('/compliance', async (req, res) => {
  const org = (await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0]?.organisation_id;
  if (!org) return res.json({ questionnaires: [] });
  const rows = (await query(`SELECT c.*, a.reference, r.title, o.name AS buyer_name FROM compliance_assessments c JOIN assessments a ON a.id = c.assessment_id
      JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id WHERE c.vendor_id = $1 AND a.selected_vendor_id = $1 ORDER BY c.started_at DESC`, [org])).rows;
  const list = [];
  for (const c of rows) list.push({ reference: c.reference, title: c.title, buyerName: c.buyer_name, status: c.status, dueOn: String(c.due_on).slice(0, 10),
    progress: progress(c.questionnaire, await answersOf({ query }, c.id), await evidenceOf({ query }, c.id)) });
  res.json({ questionnaires: list });
});

complianceVendorRouter.get('/compliance/:ref', async (req, res) => {
  const c = await vendorCompliance({ query }, req); if (!c) return nf(res);
  const answers = await answersOf({ query }, c.id), evidence = await evidenceOf({ query }, c.id);
  const r = await latestResult({ query }, c.id);
  res.json({ reference: c.reference, title: c.title, buyerName: c.buyer_name, serviceCategory: c.service_category, evidenceTypes: EVIDENCE_TYPES, expiring: EXPIRING,
    compliance: shapeCompliance(c, answers, evidence, { answers, evidence }), result: r ? { overall: r.overall_score, rating: r.result.rating, gaps: r.result.gaps, areas: r.result.areas, createdAt: r.created_at } : null,
    fileRules: { maxBytes: DOC_RULES.maxBytes, extensions: Object.keys(DOC_RULES.extensions) } });
});

const answersSchema = z.object({ answers: z.record(z.string().max(20), z.object({ answer: z.enum(ANSWERS).optional().nullable(), comment: z.string().trim().max(1000).optional().or(z.literal('')) })) });

/* Step 13: save answers (draft, any number of times before submitting). */
complianceVendorRouter.put('/compliance/:ref/answers', async (req, res) => {
  const p = answersSchema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'validation', message: 'Some answers are not valid.' });
  const out = await tx(async db => {
    const c = await vendorCompliance(db, req, true); if (!c) return [404];
    if (c.status === 'submitted') return [409];
    const valid = new Set(c.questionnaire.flatMap(x => x.questions.map(q => q.id)));
    let n = 0;
    for (const [qid, v] of Object.entries(p.data.answers)) {
      if (!valid.has(qid)) continue;
      if (!v.answer) { await db.query('DELETE FROM compliance_answers WHERE compliance_id = $1 AND question_id = $2', [c.id, qid]); continue; }
      await db.query(`INSERT INTO compliance_answers (compliance_id, question_id, answer, comment, updated_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (compliance_id, question_id) DO UPDATE SET answer = EXCLUDED.answer, comment = EXCLUDED.comment, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [c.id, qid, v.answer, v.comment || null, req.user.id]); n++;
    }
    if (c.status === 'requested') await db.query(`UPDATE compliance_assessments SET status = 'in_progress' WHERE id = $1`, [c.id]);
    await audit(req, 'compliance.answers_saved', { db, stage: STAGE, ref: c.reference, detail: { reference: c.reference, saved: n } });
    const answers = await answersOf(db, c.id), evidence = await evidenceOf(db, c.id);
    return [200, { compliance: shapeCompliance({ ...c, status: c.status === 'requested' ? 'in_progress' : c.status }, answers, evidence, { answers, evidence }) }];
  });
  if (out[0] === 404) return nf(res); if (out[0] === 409) return locked(res);
  res.json(out[1]);
});

/* Step 13: upload evidence for a control. Query: control, type, name, expires (YYYY-MM-DD, required for certificates/insurance). */
complianceVendorRouter.post('/compliance/:ref/evidence', express.raw({ type: () => true, limit: DOC_RULES.maxBytes + 1 }), async (req, res) => {
  const c = await vendorCompliance({ query }, req); if (!c) return nf(res);
  if (c.status === 'submitted') return locked(res);
  const control = String(req.query.control || ''), type = String(req.query.type || ''), expires = String(req.query.expires || '');
  const name = String(req.query.name || '').replace(/[\\/\0]/g, '_').trim().slice(0, 200);
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const bad = m => res.status(400).json({ error: 'file_rejected', message: m });
  if (!c.questionnaire.some(x => x.id === control)) return bad('Choose the control this document supports.');
  if (!EVIDENCE_TYPES[type]) return bad('Choose what kind of document this is.');
  if (!name || !DOC_RULES.extensions[ext]) return bad(`This file type is not supported. Use: ${Object.keys(DOC_RULES.extensions).join(', ')}.`);
  if (!body.length) return bad('The file is empty.');
  if (body.length > DOC_RULES.maxBytes) return bad('The file is larger than 10 MB.');
  if (EXPIRING.includes(type) && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return bad('Enter the expiry date shown on the certificate.');
  if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || isNaN(new Date(expires)))) return bad('Enter a valid expiry date.');
  const id = crypto.randomUUID(), key = path.join('compliance', c.id, id);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  await saveFile(key, body);
  const e = (await query(`INSERT INTO compliance_evidence (id, compliance_id, control_id, doc_type, file_name, mime_type, size_bytes, sha256, storage_key, expires_on, uploaded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [id, c.id, control, type, name, DOC_RULES.extensions[ext], body.length, sha256, key, expires || null, req.user.id])).rows[0];
  if (c.status === 'requested') await query(`UPDATE compliance_assessments SET status = 'in_progress' WHERE id = $1`, [c.id]);
  await audit(req, 'compliance.evidence_uploaded', { stage: STAGE, ref: c.reference, detail: { reference: c.reference, controlId: control, type, fileName: name, sha256, expiresOn: expires || null } });
  res.status(201).json({ evidence: evShape(e) });
});
complianceVendorRouter.use((err, _req, res, next) => err.type === 'entity.too.large' ? res.status(400).json({ error: 'file_rejected', message: 'The file is larger than 10 MB.' }) : next(err));

complianceVendorRouter.delete('/compliance/:ref/evidence/:id', async (req, res) => {
  const c = await vendorCompliance({ query }, req); if (!c) return nf(res);
  if (c.status === 'submitted') return locked(res);
  const e = isUuid(req.params.id) && (await query('DELETE FROM compliance_evidence WHERE id = $1 AND compliance_id = $2 RETURNING *', [req.params.id, c.id])).rows[0];
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  await removeFile(e.storage_key);
  await audit(req, 'compliance.evidence_removed', { stage: STAGE, ref: c.reference, detail: { reference: c.reference, controlId: e.control_id, fileName: e.file_name } });
  res.json({ status: 'removed' });
});

complianceVendorRouter.get('/compliance/:ref/evidence/:id', async (req, res) => {
  const c = await vendorCompliance({ query }, req); if (!c || !isUuid(req.params.id)) return nf(res);
  const e = (await query('SELECT * FROM compliance_evidence WHERE id = $1 AND compliance_id = $2', [req.params.id, c.id])).rows[0];
  if (!e) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  res.set('Content-Type', e.mime_type); res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(e.file_name)}"`);
  res.send(await readFile(e.storage_key, e.encrypted));
});

/* Steps 13→16: submit; validate, score, save the result (append-only), share it with the buyer. */
complianceVendorRouter.post('/compliance/:ref/submit', async (req, res) => {
  const out = await tx(async db => {
    const c = await vendorCompliance(db, req, true); if (!c) return [404];
    if (c.status === 'submitted') return [409];
    const answers = await answersOf(db, c.id), evidence = await evidenceOf(db, c.id);
    const ready = checkReadiness(c.questionnaire, answers);
    if (!ready.complete) return [422, { error: 'incomplete', message: `${ready.missing.length} question${ready.missing.length === 1 ? ' is' : 's are'} not answered yet.`, missing: ready.missing }];
    const scored = scoreAssessment(c.questionnaire, answers, evidence);
    const record = { reference: c.reference, version: 1, scored, answers, evidence: evidence.map(({ id, controlId, type, fileName, sha256, expiresOn }) => ({ id, controlId, type, fileName, sha256, expiresOn })) };
    const r = (await db.query(`INSERT INTO compliance_results (compliance_id, version, overall_score, rating, result, answers, evidence, rule_pack_version, snapshot_sha256, created_by)
      VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [c.id, scored.overall, scored.rating.code, JSON.stringify(scored), JSON.stringify(answers), JSON.stringify(record.evidence), S3_RULE_PACK, sha(record), req.user.id])).rows[0];
    await db.query(`UPDATE compliance_assessments SET status = 'submitted', submitted_by = $2, submitted_at = now() WHERE id = $1`, [c.id, req.user.id]);
    const a = { id: c.a_id };
    await ev(db, a, 13, `Answers and evidence submitted by the vendor (${evidence.length} document${evidence.length === 1 ? '' : 's'})`, {});
    await ev(db, a, 14, `Validated: provisional score ${scored.overall}/100 (${scored.rating.label.toLowerCase()})`, { overall: scored.overall });
    await ev(db, a, 15, `Responses, evidence and ${scored.gaps.length} gap${scored.gaps.length === 1 ? '' : 's'} saved (result v1)`, { resultId: r.id });
    await ev(db, a, 16, 'Assessment results and missing items shared with the buyer', {});
    await db.query(`DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 3 AND step IS NULL AND kind = 'milestone'`, [c.a_id]);
    await db.query(`UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 4 AND step IS NULL AND status = 'pending'`, [c.a_id]);
    await audit(req, 'compliance.submitted', { db, stage: STAGE, ref: c.reference, detail: { reference: c.reference, overall: scored.overall, rating: scored.rating.code, gaps: scored.gaps.length, evidence: evidence.length, snapshotSha256: r.snapshot_sha256 } });
    return [201, { c, scored }];
  });
  if (out[0] === 404) return nf(res); if (out[0] === 409) return locked(res);
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { c, scored } = out[1];
  const buyers = (await query(`SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND p.membership IN ('owner','member') AND u.status = 'active'`, [c.buyer_id])).rows;
  for (const b of buyers) {
    try {
      await sendNotice(b.email, `Compliance answers received for ${c.reference}`,
        [`Hello ${b.full_name || ''},`.replace(' ,', ','), `The vendor has submitted its answers and evidence for "${c.title}" (${c.reference}).`,
          `Provisional score: ${scored.overall}/100 (${scored.rating.label}). ${scored.gaps.length} item${scored.gaps.length === 1 ? '' : 's'} need attention. This is a risk indicator, not a compliance conclusion.`],
        { kicker: 'COMPLIANCE ASSESSMENT', title: 'Results are ready', action: { label: 'View the results', url: appLink('/compliance/' + c.reference) } });
    } catch (e) { console.error('[EMAIL] compliance results notice failed:', e.message); }
  }
  res.status(201).json({ status: 'submitted', overall: scored.overall, rating: scored.rating, gaps: scored.gaps.length });
});
