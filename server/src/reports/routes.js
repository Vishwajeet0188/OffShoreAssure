/*
 * Stage 9 – Monitoring and audit (sequence diagram steps 39–43).
 *
 * Buyer  /api/assessments/:ref
 *   GET   /report                      the latest report, its versions and what monitoring has found
 *   GET   /report?version=N            an earlier report
 *   POST  /report                      step 39 "generate report" → 40 compile → 41 save → 42 show
 *   GET   /report/:version/pack        step 42: the audit pack (report + audit trail + timeline) as JSON
 *   GET   /report/:version/pdf         step 42: the report as a PDF (buyer and admin only)
 *   POST  /monitoring                  step 39 "continue monitoring" / step 43 run the checks and save them
 *   POST  /monitoring/requests         step 43: ask the vendor for renewed certificates or insurance
 *
 * Vendor /api/vendor/track-record      the vendor's own record across its buyers (step 43)
 * Admin  /api/admin/reports            every report on the platform
 *
 * Rules live in engine/report.js (provisional, RP-2026.10-S9-draft).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireAdmin, requireRole } from '../auth/session.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { remediationState, notifyVendor } from '../remediation/routes.js';
import { renderReportPdf } from './pdf.js';
import { compileReport, monitoringItems, REVIEW_MONTHS, EXPIRY_WARNING_DAYS, S9_RULE_PACK, REPORT_NOTE } from '../engine/report.js';

const AUDIT_STAGE = 'stage-9';
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const day = d => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);
const bad = (res, message) => res.status(400).json({ error: 'validation', message });
const notFound = (res, message = 'Assessment not found.') => res.status(404).json({ error: 'not_found', message });
const actionCode = n => `ACT-${String(n).padStart(2, '0')}`;

/* ================= Gathering the saved records ================= */

/*
 * The latest saved record of each stage, in the shape the report needs, plus
 * the version of each (so we can tell when the report is out of date).
 */
async function gatherSources(db, a) {
  const one = async (sql, params = [a.id]) => (await db.query(sql, params)).rows[0] || null;

  const profile = await one('SELECT * FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1');
  const selection = await one(
    `SELECT s.*, o.name AS vendor_name FROM vendor_selections s JOIN organisations o ON o.id = s.vendor_id
      WHERE s.assessment_id = $1 ORDER BY s.version DESC LIMIT 1`);
  const compliance = await one(
    `SELECT r.* FROM compliance_results r JOIN compliance_assessments c ON c.id = r.compliance_id
      WHERE c.assessment_id = $1 ORDER BY r.version DESC LIMIT 1`);
  const contract = await one(
    `SELECT d.version, d.file_name, ca.totals, ca.not_found, ca.snapshot_sha256 FROM contract_documents d JOIN contract_analyses ca ON ca.contract_id = d.id
      WHERE d.assessment_id = $1 ORDER BY d.version DESC LIMIT 1`);
  const obligations = await one('SELECT version, totals, gaps, snapshot_sha256 FROM obligation_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1');
  const transfers = await one('SELECT version, overall, routes, snapshot_sha256 FROM transfer_assessments WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1');
  const risks = await one('SELECT version, overall, totals, risks, snapshot_sha256 FROM risk_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1');
  const remediation = await remediationState(db, a);
  const lastSnapshot = remediation.snapshots[0] || null;

  const original = profile?.original_submission || {};
  const normalised = profile?.normalised_requirement || {};
  const countries = [...new Set([...(original.storageCountries || []), ...(original.remoteAccessCountries || [])])];

  // Records the report reads; each comes with its fingerprint.
  const actionStates = remediation.actions.map(x => `${x.code}:${x.status}`).join(',');
  return {
    blocked: !risks ? 'Build the risk register first (Stage 7).'
      : !remediation.actions.length ? 'Plan the remediation actions first (Stage 8).'
      : remediation.actions.some(x => x.status === 'PROPOSED') ? 'Decide every proposed action first (Stage 8): assign it or accept the risk.'
      : null,
    requirement: {
      version: profile?.version, title: a.title, service: original.serviceCategory || a.service_code, criticality: original.serviceCriticality || '—',
      riskTier: a.risk_tier, personalData: original.personalData || '—', classification: normalised.personalData?.classification || a.data_classification,
      countries, sha256: profile?.snapshot_sha256,
    },
    selection: selection && {
      version: selection.version, vendor: selection.vendor_name, status: selection.status, source: selection.source,
      rationale: selection.rationale, conditions: (selection.conditions || []).length, sha256: selection.snapshot_sha256,
    },
    compliance: compliance && {
      version: compliance.version, overall: compliance.overall_score, rating: compliance.rating, gaps: (compliance.result.gaps || []).length,
      evidence: (compliance.evidence || []).length, areas: compliance.result.areas || [], sha256: compliance.snapshot_sha256,
    },
    contract: contract && {
      version: contract.version, fileName: contract.file_name, clauses: contract.totals?.clauses ?? 0,
      notFound: (contract.not_found || []).map(t => t.name), sha256: contract.snapshot_sha256,
    },
    obligations: obligations && {
      version: obligations.version, total: (obligations.totals.obligations || 0) + (obligations.totals.prohibitions || 0) + (obligations.totals.rights || 0),
      rulesCovered: obligations.totals.rulesCovered, rulesTotal: obligations.totals.rulesTotal,
      gaps: (obligations.gaps || []).map(g => g.name || g.label || g.text || g.id), sha256: obligations.snapshot_sha256,
    },
    transfers: transfers && {
      version: transfers.version, overall: transfers.overall.label, sha256: transfers.snapshot_sha256,
      routes: transfers.routes.map(r => ({ route: `${r.id} · ${r.fromName || r.from} → ${r.toName || r.to}`, status: r.statusLabel || r.status })),
    },
    risks: risks && {
      version: risks.version, overall: risks.overall.label, totals: risks.totals, sha256: risks.snapshot_sha256,
      top: [...risks.risks].sort((x, y) => y.score - x.score).slice(0, 5),
    },
    remediation: remediation.residual && {
      actions: remediation.actions, residual: remediation.residual, sha256: lastSnapshot?.snapshotSha256 || null,
    },
    versions: {
      requirement: profile?.version || null,
      selection: selection?.version || null,
      compliance: compliance?.version || null,
      contract: contract?.version || null,
      obligations: obligations?.version || null,
      transfers: transfers?.version || null,
      risks: risks?.version || null,
      remediation: actionStates ? sha256(actionStates).slice(0, 12) : null,
    },
  };
}

/* Every document behind the assessment, with its SHA-256, so a reviewer can check the files have not changed. */
async function evidenceIndex(db, a) {
  const { rows } = await db.query(
    `SELECT 1 AS stage, 'Requirement document' AS kind, d.file_name, d.sha256, d.uploaded_at, NULL::date AS expires_on, d.doc_type AS detail
       FROM requirement_documents d WHERE d.requirement_id = $2
     UNION ALL
     SELECT 3, 'Compliance evidence', e.file_name, e.sha256, e.uploaded_at, e.expires_on, e.control_id || ' · ' || e.doc_type
       FROM compliance_evidence e JOIN compliance_assessments c ON c.id = e.compliance_id WHERE c.assessment_id = $1
     UNION ALL
     SELECT 4, 'Contract', d.file_name, d.sha256, d.uploaded_at, NULL, 'v' || d.version
       FROM contract_documents d WHERE d.assessment_id = $1
     UNION ALL
     SELECT 8, 'Remediation evidence', e.file_name, e.sha256, e.uploaded_at, NULL, 'ACT-' || lpad(x.number::text, 2, '0')
       FROM remediation_evidence e JOIN remediation_actions x ON x.id = e.action_id WHERE x.assessment_id = $1 AND e.submitted
     ORDER BY 1, 5`,
    [a.id, a.requirement_id]);
  return rows.map(r => ({ stage: r.stage, kind: r.kind, fileName: r.file_name, sha256: r.sha256, detail: r.detail, uploadedAt: r.uploaded_at, expiresOn: day(r.expires_on) }));
}

const auditTrail = async (db, a) => (await db.query(
  'SELECT at, actor_email, event, stage, detail FROM audit_events WHERE ref = $1 ORDER BY id', [a.reference])).rows
  .map(e => ({ at: e.at, by: e.actor_email, event: e.event, stage: e.stage, detail: e.detail }));

/* The Stage 3 documents that expire (certificates and insurance). */
const expiringEvidence = async (db, a) => (await db.query(
  `SELECT e.* FROM compliance_evidence e JOIN compliance_assessments c ON c.id = e.compliance_id
    WHERE c.assessment_id = $1 AND e.expires_on IS NOT NULL ORDER BY e.expires_on`, [a.id])).rows
  .map(e => ({ id: e.id, controlId: e.control_id, type: e.doc_type, fileName: e.file_name, expiresOn: day(e.expires_on) }));

/* Monitoring requests are Stage 8 actions with theme "monitoring"; risk_id holds the monitoring key. */
async function monitoringRequests(db, a) {
  const { rows } = await db.query(`SELECT number, risk_id, status FROM remediation_actions WHERE assessment_id = $1 AND theme = 'monitoring'`, [a.id]);
  const label = { OPEN: 'To do', RETURNED: 'Returned', SUBMITTED: 'Awaiting review', CLOSED: 'Closed', RISK_ACCEPTED: 'Accepted' };
  return new Map(rows.map(r => [r.risk_id, { code: actionCode(r.number), status: r.status, statusLabel: label[r.status] || r.status }]));
}

const shapeReport = r => r && ({
  version: r.version, reason: r.reason, inputs: r.inputs, rulePackVersion: r.rule_pack_version, position: r.position,
  content: r.content, auditEvents: r.audit_events, snapshotSha256: r.snapshot_sha256, createdAt: r.created_at, createdBy: r.created_by_email,
});

/* ================= The state the buyer sees ================= */

export async function reportState(db, a, requestedVersion = null) {
  const sources = await gatherSources(db, a);
  const { rows: reports } = await db.query(
    `SELECT r.*, u.email AS created_by_email FROM report_versions r JOIN users u ON u.id = r.created_by
      WHERE r.assessment_id = $1 ORDER BY r.version DESC`, [a.id]);
  const latest = reports[0] || null;
  const shown = requestedVersion ? reports.find(r => r.version === requestedVersion) : latest;
  const { rows: checks } = await db.query(
    `SELECT m.*, u.email AS created_by_email FROM monitoring_checks m LEFT JOIN users u ON u.id = m.created_by
      WHERE m.assessment_id = $1 ORDER BY m.created_at DESC LIMIT 20`, [a.id]);

  const items = sources.blocked ? [] : monitoringItems({
    evidence: await expiringEvidence(db, a),
    actions: sources.remediation?.actions || [],
    lastReport: latest && { version: latest.version, createdAt: latest.created_at, inputs: latest.inputs },
    inputs: sources.versions,
    riskTier: a.risk_tier,
    requested: await monitoringRequests(db, a),
  });

  return {
    assessment: { reference: a.reference, title: a.title, buyerName: a.buyer_name, riskTier: a.risk_tier },
    vendor: a.selected_vendor_id ? { id: a.selected_vendor_id, name: a.vendor_name } : null,
    blocked: sources.blocked,
    inputs: sources.blocked ? null : sources.versions,
    upToDate: !!latest && sameInputs(latest.inputs, sources.versions),
    canGenerate: !sources.blocked && !(latest && sameInputs(latest.inputs, sources.versions)),
    versions: reports.map(r => ({ version: r.version, reason: r.reason, position: r.position, createdAt: r.created_at, createdBy: r.created_by_email, snapshotSha256: r.snapshot_sha256 })),
    report: shapeReport(shown),
    monitoring: {
      items,
      checks: checks.map(c => ({ at: c.created_at, by: c.created_by_email || 'OffshoreAssure (automatic)', choice: c.choice, note: c.note, reportVersion: c.report_version,
        found: c.items.length, attention: c.items.filter(i => i.severity !== 'low').length })),
      rules: { reviewMonths: REVIEW_MONTHS, expiryWarningDays: EXPIRY_WARNING_DAYS },
    },
    rulePackVersion: S9_RULE_PACK,
    note: REPORT_NOTE,
  };
}

const sameInputs = (x = {}, y = {}) => Object.keys(y).every(k => x[k] === y[k]);

/* ================= Buyer routes ================= */

export const reportsRouter = Router();
reportsRouter.use(['/:ref/report', '/:ref/monitoring'], requireRole('buyer'), requireActiveMembership);

async function findBuyerAssessment(db, req) {
  const buyerId = await buyerOrganisation(db, req.user.id);
  if (!buyerId) return null;
  return (await db.query(
    `SELECT a.*, r.title, o.name AS buyer_name, v.name AS vendor_name
       FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.reference = $1 AND a.buyer_id = $2`, [req.params.ref, buyerId])).rows[0] || null;
}

const timeline = (db, assessmentId, step, title, detail = {}) => db.query(
  `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1, 'event', 9, $2, $3, 'done', now(), $4)`,
  [assessmentId, step, title, JSON.stringify(detail)]);

reportsRouter.get('/:ref/report', async (req, res) => {
  const a = await findBuyerAssessment({ query }, req); if (!a) return notFound(res);
  res.json(await reportState({ query }, a, req.query.version ? Number(req.query.version) : null));
});

const reportSchema = z.object({ reason: z.string().trim().max(500).optional().or(z.literal('')) });

/* Steps 39–42: the buyer chooses to generate the report; it is compiled, saved and shown. */
reportsRouter.post('/:ref/report', async (req, res) => {
  const p = reportSchema.safeParse(req.body || {});
  if (!p.success) return bad(res, p.error.issues[0].message);

  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [a.id]);
    const sources = await gatherSources(db, a);
    if (sources.blocked) return [409, { error: 'not_ready', message: sources.blocked }];
    const latest = (await db.query('SELECT version, inputs FROM report_versions WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [a.id])).rows[0];
    if (latest && sameInputs(latest.inputs, sources.versions)) {
      return [409, { error: 'up_to_date', message: `Nothing has changed since report v${latest.version}.0. Generate it again after a stage record changes.` }];
    }

    const version = (latest?.version || 0) + 1;
    const reason = p.data.reason || (version === 1 ? 'First report' : 'Records changed since the last report');
    const generatedAt = new Date().toISOString();
    const evidence = await evidenceIndex(db, a);
    const trail = await auditTrail(db, a);

    // Step 40: compile.
    const content = compileReport({
      ...sources, evidence, audit: trail, generatedAt,
      assessment: { reference: a.reference, title: a.title, buyerName: a.buyer_name, vendorName: a.vendor_name, version, generatedAt, reason },
    });
    content.records = Object.entries({
      'Requirement profile': sources.requirement.sha256, 'Vendor Selection Record': sources.selection?.sha256,
      'Compliance result': sources.compliance?.sha256, 'Contract analysis': sources.contract?.sha256,
      'Obligation register': sources.obligations?.sha256, 'Transfer assessment': sources.transfers?.sha256,
      'Risk register': sources.risks?.sha256, 'Remediation snapshot': sources.remediation?.sha256,
    }).filter(([, v]) => v).map(([record, value]) => ({ record, sha256: value }));

    // Step 41: save the version with its fingerprint.
    const snapshotSha256 = sha256(JSON.stringify({ reference: a.reference, version, inputs: sources.versions, content }));
    await db.query(
      `INSERT INTO report_versions (assessment_id, version, reason, inputs, rule_pack_version, position, content, audit_events, snapshot_sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [a.id, version, reason, JSON.stringify(sources.versions), S9_RULE_PACK, JSON.stringify(content.position), JSON.stringify(content),
        trail.length, snapshotSha256, req.user.id]);

    await timeline(db, a.id, 39, version === 1 ? 'Buyer chose to generate the report' : `Buyer chose to generate the report again (${reason})`, { version });
    await timeline(db, a.id, 40, `Report compiled from ${content.sections.length} stage records, ${evidence.length} documents and ${trail.length} audit events`, { version });
    await timeline(db, a.id, 41, `Report v${version}.0 saved with its fingerprint`, { version, snapshotSha256 });
    await timeline(db, a.id, 42, `Report and audit pack shown to the buyer · ${content.position.label}`, { version });
    if (version === 1) {
      // The report is out: the Stage 9 milestone is reached; monitoring (step 43) carries on.
      await db.query(`DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 9 AND step IS NULL AND kind = 'milestone'`, [a.id]);
    }
    await audit(req, 'report.generated', { db, stage: AUDIT_STAGE, ref: a.reference,
      detail: { reference: a.reference, version, reason, position: content.position.code, inputs: sources.versions, rulePackVersion: S9_RULE_PACK, snapshotSha256 } });
    return [201, await reportState(db, a, version)];
  });
  if (out[0] === 404) return notFound(res);
  res.status(out[0]).json(out[1]);
});

/* Step 42: the audit pack – the report with the full audit trail, timeline and evidence index. */
reportsRouter.get('/:ref/report/:version/pack', async (req, res) => {
  const a = await findBuyerAssessment({ query }, req); if (!a) return notFound(res);
  const r = (await query(
    `SELECT r.*, u.email AS created_by_email FROM report_versions r JOIN users u ON u.id = r.created_by WHERE r.assessment_id = $1 AND r.version = $2`,
    [a.id, Number(req.params.version) || 0])).rows[0];
  if (!r) return notFound(res, 'Report not found.');
  // The audit trail and timeline as they were when the report was saved.
  const trail = (await auditTrail({ query }, a)).filter(e => new Date(e.at) <= new Date(r.created_at));
  const { rows: tl } = await query(
    'SELECT stage, step, kind, title, status, at FROM assessment_timeline WHERE assessment_id = $1 AND at <= $2 ORDER BY at, id', [a.id, r.created_at]);
  await audit(req, 'report.pack_downloaded', { stage: AUDIT_STAGE, ref: a.reference, detail: { reference: a.reference, version: r.version } });
  res.setHeader('Content-Disposition', `attachment; filename="${a.reference}-report-v${r.version}-audit-pack.json"`);
  res.json({
    pack: 'OffshoreAssure audit pack', reference: a.reference, reportVersion: r.version, generatedAt: r.created_at, generatedBy: r.created_by_email,
    reportSha256: r.snapshot_sha256, rulePackVersion: r.rule_pack_version, note: REPORT_NOTE,
    report: r.content, inputs: r.inputs, auditTrail: trail, timeline: tl,
  });
});

/* Step 42: the report as a PDF. Built from the saved version only. */
async function sendReportPdf(req, res, a) {
  const { rows } = await query(
    `SELECT r.*, u.email AS created_by_email FROM report_versions r LEFT JOIN users u ON u.id = r.created_by WHERE r.assessment_id = $1 ORDER BY r.version DESC`, [a.id]);
  const r = rows.find(x => x.version === Number(req.params.version));
  if (!r) return notFound(res, 'Report not found.');
  const pdf = await renderReportPdf(shapeReport(r), rows.length);
  await audit(req, 'report.pdf_downloaded', { stage: AUDIT_STAGE, ref: a.reference, detail: { reference: a.reference, version: r.version } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${a.reference}-report-v${r.version}.pdf"`);
  res.send(pdf);
}

reportsRouter.get('/:ref/report/:version/pdf', async (req, res) => {
  const a = await findBuyerAssessment({ query }, req); if (!a) return notFound(res);
  await sendReportPdf(req, res, a);
});

const monitorSchema = z.object({
  choice: z.enum(['monitor', 'check']).default('check'),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

/* Step 39 "continue monitoring" (no report yet), or step 43: run the monitoring checks and save what they found. */
reportsRouter.post('/:ref/monitoring', async (req, res) => {
  const p = monitorSchema.safeParse(req.body || {});
  if (!p.success) return bad(res, p.error.issues[0].message);
  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    const state = await reportState(db, a);
    if (state.blocked) return [409, { error: 'not_ready', message: state.blocked }];
    const items = state.monitoring.items;
    const reportVersion = state.versions[0]?.version || null;
    await db.query(
      `INSERT INTO monitoring_checks (assessment_id, report_version, choice, note, items, rule_pack_version, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [a.id, reportVersion, p.data.choice, p.data.note || null, JSON.stringify(items), S9_RULE_PACK, req.user.id]);
    const attention = items.filter(i => i.severity !== 'low').length;
    if (p.data.choice === 'monitor') await timeline(db, a.id, 39, 'Buyer chose to continue monitoring', {});
    await timeline(db, a.id, 43, `Monitoring check: ${attention ? `${attention} item${attention === 1 ? '' : 's'} need attention` : 'nothing needs attention'}`, { reportVersion });
    await audit(req, 'monitoring.checked', { db, stage: AUDIT_STAGE, ref: a.reference,
      detail: { reference: a.reference, choice: p.data.choice, reportVersion, items: items.map(i => ({ key: i.key, severity: i.severity })) } });
    return [201, await reportState(db, a)];
  });
  if (out[0] === 404) return notFound(res);
  res.status(out[0]).json(out[1]);
});

const requestSchema = z.object({
  keys: z.array(z.string().max(80)).min(1, 'Choose at least one item.').max(50),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

/* Step 43: renewals become actions for the vendor (shown on its Actions page). */
reportsRouter.post('/:ref/monitoring/requests', async (req, res) => {
  const p = requestSchema.safeParse(req.body || {});
  if (!p.success) return bad(res, p.error.issues[0].message);
  const out = await tx(async db => {
    const a = await findBuyerAssessment(db, req); if (!a) return [404];
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [a.id]);
    if (!a.selected_vendor_id) return [409, { error: 'no_vendor', message: 'There is no selected vendor to ask.' }];
    const state = await reportState(db, a);
    if (state.blocked) return [409, { error: 'not_ready', message: state.blocked }];
    const chosen = p.data.keys.map(k => state.monitoring.items.find(i => i.key === k));
    if (chosen.some(i => !i || !i.canRequest)) return [409, { error: 'not_requestable', message: 'One of the items cannot be sent to the vendor, or has already been sent.' }];

    const sent = await createRenewalRequests(db, a, chosen, { userId: req.user.id, role: req.user.role, note: p.data.note || null });
    await timeline(db, a.id, 43, `Renewal requested from ${a.vendor_name} (${sent.map(s => s.code).join(', ')})`, {});
    await audit(req, 'monitoring.requested', { db, stage: AUDIT_STAGE, ref: a.reference, detail: { reference: a.reference, actions: sent.map(s => s.code), keys: p.data.keys } });
    return [201, { state: await reportState(db, a), a, sent }];
  });
  if (out[0] === 404) return notFound(res);
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { a, sent } = out[1];
  await notifyVendor(a, `${a.buyer_name} needs renewed documents`,
    [`${a.buyer_name} is monitoring "${a.title}" (${a.reference}) and needs renewed documents:`, ...sent.map(s => `${s.code} · ${s.title} — due ${s.due}`)],
    'MONITORING', 'Renewed documents needed');
  res.status(201).json(out[1].state);
});

/*
 * Step 43: each renewal becomes a Stage 8 action for the vendor (theme "monitoring";
 * risk_id holds the monitoring key). Used by the buyer and by the automatic checks.
 */
export async function createRenewalRequests(db, a, items, { userId = null, role = 'system', note = null } = {}) {
  const register = (await db.query('SELECT version FROM risk_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [a.id])).rows[0];
  let number = (await db.query('SELECT coalesce(max(number), 0) AS n FROM remediation_actions WHERE assessment_id = $1', [a.id])).rows[0].n;
  const sent = [];
  for (const item of items) {
    number++;
    const requests = [`Upload the renewed document: ${item.title}.`, 'Say in your response what changed (new expiry date, scope).'];
    const { rows } = await db.query(
      `INSERT INTO remediation_actions (assessment_id, number, register_version, risk_id, theme, title, owner, requests, needs_document, source_stages,
                                        rating, score, status, due_on, suggested_due_on, buyer_note)
       VALUES ($1, $2, $3, $4, 'monitoring', $5, 'vendor', $6, true, '[3]', $7, 0, 'OPEN', $8, $8, $9) RETURNING id`,
      [a.id, number, register?.version || 0, item.key, 'Renewal: ' + item.title.replace(/ \(in \d+ days?\)$/, ''), JSON.stringify(requests),
        item.severity === 'high' ? 'HIGH' : 'MEDIUM', item.dueOn, note]);
    for (const event of ['proposed', 'assigned']) {
      await db.query('INSERT INTO remediation_events (action_id, actor_id, actor_role, event, detail) VALUES ($1, $2, $3, $4, $5)',
        [rows[0].id, userId, role, event, JSON.stringify({ monitoring: item.key, dueOn: item.dueOn, ...(userId ? {} : { automatic: true }) })]);
    }
    sent.push({ code: actionCode(number), title: item.title, due: item.dueOn });
  }
  return sent;
}

export { expiringEvidence, monitoringRequests };

/* ================= Vendor: track record ================= */

export const trackRecordRouter = Router();
trackRecordRouter.use('/track-record', requireRole('vendor'));

trackRecordRouter.get('/track-record', async (req, res) => {
  const org = (await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0]?.organisation_id || null;
  if (!org) return res.json({ assessments: [], totals: null });
  const { rows } = await query(
    `SELECT a.id, a.reference, r.title, o.name AS buyer_name, a.selection_status,
            (SELECT row_to_json(x) FROM (SELECT cr.overall_score, cr.rating, cr.created_at FROM compliance_results cr JOIN compliance_assessments c ON c.id = cr.compliance_id
               WHERE c.assessment_id = a.id ORDER BY cr.version DESC LIMIT 1) x) AS compliance,
            (SELECT json_agg(json_build_object('status', x.status, 'due', x.due_on, 'closed', x.closed_at, 'submitted', x.submitted_at, 'theme', x.theme))
               FROM remediation_actions x WHERE x.assessment_id = a.id AND x.owner = 'vendor' AND x.status <> 'PROPOSED') AS actions,
            (SELECT json_build_object('count', count(*), 'last', max(created_at)) FROM report_versions WHERE assessment_id = a.id) AS reports
       FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
      WHERE a.selected_vendor_id = $1 ORDER BY a.created_at DESC`, [org]);
  const { rows: expiring } = await query(
    `SELECT e.file_name, e.doc_type, e.expires_on, a.reference FROM compliance_evidence e JOIN compliance_assessments c ON c.id = e.compliance_id
       JOIN assessments a ON a.id = c.assessment_id
      WHERE a.selected_vendor_id = $1 AND e.expires_on IS NOT NULL AND e.expires_on <= current_date + $2::int ORDER BY e.expires_on`, [org, EXPIRY_WARNING_DAYS]);

  const assessments = rows.map(r => {
    const actions = r.actions || [];
    const closed = actions.filter(x => x.status === 'CLOSED');
    // "On time": sent for review (or closed) on or before the due date.
    const onTime = closed.filter(x => x.due && day(x.submitted || x.closed) <= day(x.due)).length;
    return {
      reference: r.reference, title: r.title, buyerName: r.buyer_name, selectionStatus: r.selection_status,
      compliance: r.compliance ? { score: r.compliance.overall_score, rating: r.compliance.rating, at: r.compliance.created_at } : null,
      actions: { assigned: actions.length, closed: closed.length, onTime, open: actions.filter(x => ['OPEN', 'RETURNED', 'SUBMITTED'].includes(x.status)).length },
      reports: { count: Number(r.reports.count), last: r.reports.last },
    };
  });
  const sum = k => assessments.reduce((n, x) => n + x.actions[k], 0);
  const scored = assessments.filter(x => x.compliance);
  res.json({
    assessments,
    totals: {
      assessments: assessments.length,
      averageScore: scored.length ? Math.round(scored.reduce((n, x) => n + x.compliance.score, 0) / scored.length) : null,
      actionsAssigned: sum('assigned'), actionsClosed: sum('closed'), closedOnTime: sum('onTime'), actionsOpen: sum('open'),
      reports: assessments.reduce((n, x) => n + x.reports.count, 0),
    },
    expiring: expiring.map(e => ({ reference: e.reference, fileName: e.file_name, type: e.doc_type, expiresOn: day(e.expires_on) })),
    note: 'Your record across the buyers that selected your company. Buyers see their own assessment only.',
  });
});

/* ================= Admin: every report ================= */

export const adminReportsRouter = Router();
adminReportsRouter.get('/reports/:ref/:version/pdf', requireAdmin, async (req, res) => {
  const a = (await query(
    `SELECT a.*, r.title, o.name AS buyer_name, v.name AS vendor_name FROM assessments a JOIN requirements r ON r.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id LEFT JOIN organisations v ON v.id = a.selected_vendor_id WHERE a.reference = $1`, [req.params.ref])).rows[0];
  if (!a) return notFound(res);
  await sendReportPdf(req, res, a);
});

adminReportsRouter.get('/reports', requireAdmin, async (_req, res) => {
  const { rows } = await query(
    `SELECT r.version, r.reason, r.position, r.snapshot_sha256, r.created_at, u.email AS created_by, a.reference, q.title, o.name AS buyer_name, v.name AS vendor_name
       FROM report_versions r JOIN assessments a ON a.id = r.assessment_id JOIN requirements q ON q.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id LEFT JOIN organisations v ON v.id = a.selected_vendor_id JOIN users u ON u.id = r.created_by
      ORDER BY r.created_at DESC LIMIT 500`);
  res.json({ reports: rows.map(r => ({ reference: r.reference, title: r.title, buyerName: r.buyer_name, vendorName: r.vendor_name, version: r.version,
    reason: r.reason, position: r.position, snapshotSha256: r.snapshot_sha256, createdAt: r.created_at, createdBy: r.created_by })) });
});
