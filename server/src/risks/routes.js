/*
 * Stage 7 – Risk identification (sequence diagram steps 29–32).
 *
 *   GET  /api/assessments/:ref/risks       latest risk register (or ?version=N)
 *   POST /api/assessments/:ref/risks       steps 29–32 with the latest sources
 *
 * The rules live in engine/risks.js (provisional, RP-2026.10-S7-draft).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { buildRiskRegister, RATINGS, SEVERITY, THEMES, S7_RULE_PACK, RISK_NOTE } from '../engine/risks.js';

const AUDIT_STAGE = 'stage-7';
const INPUT_KEYS = ['requirement', 'selection', 'compliance', 'contract', 'obligations', 'transfers'];

export const risksRouter = Router();
risksRouter.use('/:ref/risks', requireRole('buyer'), requireActiveMembership);

risksRouter.get('/:ref/risks', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res);

  const requestedVersion = req.query.version ? Number(req.query.version) : null;
  res.json(await risksState(query, assessment, requestedVersion));
});

/* Steps 29–32: gather the findings, score them, save the register and return it. */
risksRouter.post('/:ref/risks', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res);

  const sources = await gatherSources(query, assessment);
  if (sources.blocked) return res.status(409).json({ error: 'not_ready', message: sources.blocked });

  const latest = await latestRegister(query, assessment.id);
  if (latest && sameInputs(latest.inputs, sources.versions)) {
    return res.status(409).json({
      error: 'up_to_date',
      message: 'Nothing has changed since the last risk register. Run it again after an earlier stage changes.',
    });
  }

  const register = buildRiskRegister(sources);
  const version = (latest?.version || 0) + 1;

  await tx(async db => {
    const snapshot = { reference: assessment.reference, version, inputs: sources.versions, rulePackVersion: S7_RULE_PACK, risks: register.risks };
    const { rows } = await db.query(
      `INSERT INTO risk_registers (assessment_id, version, inputs, rule_pack_version, overall, totals, grid, risks, snapshot_sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, snapshot_sha256`,
      [assessment.id, version, JSON.stringify(sources.versions), S7_RULE_PACK, JSON.stringify(register.overall),
        JSON.stringify(register.totals), JSON.stringify(register.grid), JSON.stringify(register.risks),
        sha256(JSON.stringify(snapshot)), req.user.id]
    );

    await recordOnTimeline(db, assessment, { version, register, registerId: rows[0].id });

    await audit(req, 'risks.registered', {
      db, stage: AUDIT_STAGE, ref: assessment.reference,
      detail: {
        reference: assessment.reference, version, overall: register.overall.rating, ...register.totals,
        inputs: sources.versions, rulePackVersion: S7_RULE_PACK, snapshotSha256: rows[0].snapshot_sha256,
      },
    });
  });

  res.status(201).json(await risksState(query, assessment, version));
});

/* ---------- Shared ---------- */

export async function risksState(run, assessment, requestedVersion = null) {
  const { rows: versions } = await run(
    `SELECT g.*, u.email AS created_by_email
       FROM risk_registers g JOIN users u ON u.id = g.created_by
      WHERE g.assessment_id = $1 ORDER BY g.version DESC`,
    [assessment.id]
  );
  const shown = requestedVersion ? versions.find(v => v.version === requestedVersion) : versions[0];
  const sources = await gatherSources(run, assessment);

  return {
    assessment: { reference: assessment.reference, title: assessment.title, buyerName: assessment.buyer_name },
    vendor: assessment.selected_vendor_id ? { id: assessment.selected_vendor_id, name: assessment.vendor_name } : null,
    blocked: sources.blocked,
    inputs: sources.blocked ? null : sources.versions,
    canRun: !sources.blocked && (!versions[0] || !sameInputs(versions[0].inputs, sources.versions)),
    versions: versions.map(v => ({ version: v.version, overall: v.overall, totals: v.totals, createdAt: v.created_at, createdBy: v.created_by_email })),
    register: shown ? shapeRegister(shown) : null,
    scale: { ratings: RATINGS, severity: SEVERITY, themes: THEMES.map(t => ({ id: t.id, name: t.name, impact: t.impact })) },
  };
}

function shapeRegister(row) {
  return {
    id: row.id,
    version: row.version,
    inputs: row.inputs,
    rulePackVersion: row.rule_pack_version,
    overall: row.overall,
    totals: row.totals,
    grid: row.grid,
    risks: row.risks,
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
    note: RISK_NOTE,
  };
}

/*
 * Everything the register reads, with the version of each, so we know when it
 * needs running again. Stage 7 follows the diagram: the transfer assessment
 * (Stage 6) must be saved first, which means Stages 2–5 are done too.
 */
async function gatherSources(run, assessment) {
  const one = async (sql, params) => (await run(sql, params)).rows[0] || null;

  const transfers = await one('SELECT version, routes FROM transfer_assessments WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [assessment.id]);
  if (!transfers) return { blocked: 'Run the transfer assessment first (Stage 6).' };

  const profile = await one('SELECT version, original_submission FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [assessment.id]);
  const selection = await one('SELECT version, status, match FROM vendor_selections WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [assessment.id]);
  const compliance = await one(
    `SELECT r.version, r.result FROM compliance_results r JOIN compliance_assessments c ON c.id = r.compliance_id
      WHERE c.assessment_id = $1 ORDER BY r.version DESC LIMIT 1`, [assessment.id]);
  const contract = await one(
    `SELECT d.version, ca.not_found FROM contract_documents d JOIN contract_analyses ca ON ca.contract_id = d.id
      WHERE d.assessment_id = $1 ORDER BY d.version DESC LIMIT 1`, [assessment.id]);
  const obligations = await one('SELECT version, gaps FROM obligation_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [assessment.id]);

  return {
    blocked: null,
    requirement: profile?.original_submission || {},
    selection: selection ? { version: selection.version, status: selection.status, fit: selection.match } : null,
    compliance: compliance ? { version: compliance.version, result: compliance.result } : null,
    contract: contract ? { version: contract.version, notFound: contract.not_found } : null,
    obligations: obligations ? { version: obligations.version, gaps: obligations.gaps } : null,
    transfers: { version: transfers.version, routes: transfers.routes },
    versions: {
      requirement: profile?.version || null,
      selection: selection?.version || null,
      compliance: compliance?.version || null,
      contract: contract?.version || null,
      obligations: obligations?.version || null,
      transfers: transfers.version,
    },
  };
}

function sameInputs(a = {}, b = {}) {
  return INPUT_KEYS.every(key => a[key] === b[key]);
}

async function latestRegister(run, assessmentId) {
  const { rows } = await run('SELECT version, inputs FROM risk_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [assessmentId]);
  return rows[0] || null;
}

async function findBuyerAssessment(req) {
  const buyerId = await buyerOrganisation({ query }, req.user.id);
  if (!buyerId) return null;

  const { rows } = await query(
    `SELECT a.*, r.title, o.name AS buyer_name, v.name AS vendor_name
       FROM assessments a
       JOIN requirements r ON r.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.reference = $1 AND a.buyer_id = $2`,
    [req.params.ref, buyerId]
  );
  return rows[0] || null;
}

async function recordOnTimeline(db, assessment, { version, register, registerId }) {
  const addEvent = (step, title, detail = {}) => db.query(
    `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
     VALUES ($1, 'event', 7, $2, $3, 'done', now(), $4)`,
    [assessment.id, step, title, JSON.stringify(detail)]
  );

  const { totals } = register;
  await addEvent(29, `Risks and gaps consolidated: ${totals.findings} finding${totals.findings === 1 ? '' : 's'} into ${totals.risks} risk${totals.risks === 1 ? '' : 's'}`, { version });
  await addEvent(30, `Scoring and evidence rules applied: highest rating ${register.overall.label.toLowerCase()}`, { version, overall: register.overall.rating });
  await addEvent(31, `Risk register shared with the buyer (${totals.critical} critical, ${totals.high} high)`, { version });
  await addEvent(32, `Risk snapshot v${version} saved with linked sources`, { version, registerId });

  if (version === 1) {
    // Stage 7 is done; Stage 8 (remediation) is next.
    await db.query(`DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 7 AND step IS NULL AND kind = 'milestone'`, [assessment.id]);
    await db.query(
      `UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 8 AND step IS NULL AND status = 'pending'`,
      [assessment.id]
    );
  }
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function notFound(res) {
  return res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });
}
