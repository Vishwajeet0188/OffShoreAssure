/*
 * Stage 6 – Transfer assessment (sequence diagram steps 25–28).
 *
 *   GET  /api/assessments/:ref/transfers               latest assessment (or ?version=N)
 *   POST /api/assessments/:ref/transfers               steps 25–28 with the latest inputs
 *
 * The checks live in engine/transfers.js (provisional, RP-2026.10-S6-draft).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { assessTransfers, ROUTE_STATUS, S6_RULE_PACK, TRANSFER_NOTE } from '../engine/transfers.js';

const AUDIT_STAGE = 'stage-6';

export const transfersRouter = Router();
transfersRouter.use('/:ref/transfers', requireRole('buyer'), requireActiveMembership);

transfersRouter.get('/:ref/transfers', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const requestedVersion = req.query.version ? Number(req.query.version) : null;
  res.json(await transfersState(query, assessment, requestedVersion));
});

/* Steps 25–28: map the routes, check them, save the result and return it. */
transfersRouter.post('/:ref/transfers', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const inputs = await gatherInputs(query, assessment);
  if (inputs.blocked) return res.status(409).json({ error: 'not_ready', message: inputs.blocked });

  const latest = await latestTransferAssessment(query, assessment.id);
  if (latest && sameInputs(latest.inputs, inputs.versions)) {
    return res.status(409).json({
      error: 'up_to_date',
      message:
        'Nothing has changed since the last transfer assessment. Run it again after the requirement, vendor or contract changes.',
    });
  }

  const result = assessTransfers({
    requirement: inputs.requirement,
    vendor: inputs.vendor,
    contractClauses: inputs.contractClauses,
    vendorTransferScore: inputs.vendorTransferScore,
  });
  const version = (latest?.version || 0) + 1;

  await tx(async db => {
    const snapshot = {
      reference: assessment.reference,
      version,
      inputs: inputs.versions,
      rulePackVersion: S6_RULE_PACK,
      routes: result.routes,
    };
    const { rows } = await db.query(
      `INSERT INTO transfer_assessments
         (assessment_id, version, inputs, rule_pack_version, overall, totals, routes, findings, questions, contract_terms, snapshot_sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, snapshot_sha256`,
      [
        assessment.id,
        version,
        JSON.stringify(inputs.versions),
        S6_RULE_PACK,
        JSON.stringify(result.overall),
        JSON.stringify(result.totals),
        JSON.stringify(result.routes),
        JSON.stringify(result.findings),
        JSON.stringify(result.questions),
        JSON.stringify(result.contractTerms),
        sha256(JSON.stringify(snapshot)),
        req.user.id,
      ],
    );

    await recordOnTimeline(db, assessment, { version, result, transferId: rows[0].id });

    await audit(req, 'transfers.assessed', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        version,
        overall: result.overall.status,
        ...result.totals,
        inputs: inputs.versions,
        rulePackVersion: S6_RULE_PACK,
        snapshotSha256: rows[0].snapshot_sha256,
      },
    });
  });

  res.status(201).json(await transfersState(query, assessment, version));
});

/* ---------- Shared ---------- */

export async function transfersState(run, assessment, requestedVersion = null) {
  const { rows: versions } = await run(
    `SELECT t.*, u.email AS created_by_email
       FROM transfer_assessments t JOIN users u ON u.id = t.created_by
      WHERE t.assessment_id = $1 ORDER BY t.version DESC`,
    [assessment.id],
  );
  const shown = requestedVersion ? versions.find(v => v.version === requestedVersion) : versions[0];
  const inputs = await gatherInputs(run, assessment);

  return {
    assessment: {
      reference: assessment.reference,
      title: assessment.title,
      buyerName: assessment.buyer_name,
    },
    vendor: assessment.selected_vendor_id
      ? { id: assessment.selected_vendor_id, name: assessment.vendor_name }
      : null,
    blocked: inputs.blocked,
    inputs: inputs.blocked ? null : inputs.versions,
    canRun: !inputs.blocked && (!versions[0] || !sameInputs(versions[0].inputs, inputs.versions)),
    versions: versions.map(v => ({
      version: v.version,
      overall: v.overall,
      createdAt: v.created_at,
      createdBy: v.created_by_email,
    })),
    result: shown ? shapeResult(shown) : null,
    statuses: ROUTE_STATUS,
  };
}

function shapeResult(row) {
  return {
    id: row.id,
    version: row.version,
    inputs: row.inputs,
    rulePackVersion: row.rule_pack_version,
    overall: row.overall,
    totals: row.totals,
    routes: row.routes,
    findings: row.findings,
    questions: row.questions,
    contractTerms: row.contract_terms,
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
    note: TRANSFER_NOTE,
  };
}

/*
 * Everything the transfer assessment reads, and the version of each, so we know
 * when it needs running again. Stage 6 follows the diagram order: it needs the
 * selected vendor (Stage 2), the contract (Stage 4) and the obligations (Stage 5).
 */
async function gatherInputs(run, assessment) {
  if (!assessment.selected_vendor_id) return { blocked: 'Select a vendor first (Stage 2).' };

  const { rows: contracts } = await run(
    `SELECT d.version, ca.clauses
       FROM contract_documents d JOIN contract_analyses ca ON ca.contract_id = d.id
      WHERE d.assessment_id = $1 ORDER BY d.version DESC LIMIT 1`,
    [assessment.id],
  );
  if (!contracts[0]) return { blocked: 'Upload and analyse the contract first (Stage 4).' };

  const { rows: registers } = await run(
    'SELECT version FROM obligation_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1',
    [assessment.id],
  );
  if (!registers[0]) return { blocked: 'Extract the obligations first (Stage 5).' };

  const { rows: profiles } = await run(
    'SELECT version, original_submission FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [assessment.id],
  );
  const { rows: vendors } = await run(
    'SELECT name, country, delivery_countries FROM organisations WHERE id = $1',
    [assessment.selected_vendor_id],
  );
  const { rows: compliance } = await run(
    `SELECT r.result FROM compliance_results r JOIN compliance_assessments c ON c.id = r.compliance_id
      WHERE c.assessment_id = $1 ORDER BY r.version DESC LIMIT 1`,
    [assessment.id],
  );

  const transferControl = compliance[0]?.result?.controls?.find(control => control.id === 'ASS-005');

  return {
    blocked: null,
    requirement: profiles[0]?.original_submission || {},
    vendor: {
      name: vendors[0].name,
      country: vendors[0].country,
      deliveryCountries: vendors[0].delivery_countries || [],
    },
    contractClauses: contracts[0].clauses,
    vendorTransferScore: transferControl ? transferControl.score : null,
    versions: {
      requirement: profiles[0]?.version || null,
      selection: assessment.selection_version,
      contract: contracts[0].version,
      obligations: registers[0].version,
      compliance: compliance[0] ? 1 : 0,
    },
  };
}

function sameInputs(a = {}, b = {}) {
  return ['requirement', 'selection', 'contract', 'obligations', 'compliance'].every(
    key => a[key] === b[key],
  );
}

async function latestTransferAssessment(run, assessmentId) {
  const { rows } = await run(
    'SELECT version, inputs FROM transfer_assessments WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1',
    [assessmentId],
  );
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
    [req.params.ref, buyerId],
  );
  return rows[0] || null;
}

async function recordOnTimeline(db, assessment, { version, result, transferId }) {
  const addEvent = (step, title, detail = {}) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
     VALUES ($1, 'event', 6, $2, $3, 'done', now(), $4)`,
      [assessment.id, step, title, JSON.stringify(detail)],
    );

  const { totals } = result;
  await addEvent(25, `Data flows mapped: ${totals.routes} route${totals.routes === 1 ? '' : 's'}`, {
    version,
  });
  await addEvent(26, `Recipients, roles and safeguards checked: ${result.overall.label.toLowerCase()}`, {
    version,
    overall: result.overall.status,
  });
  await addEvent(
    27,
    `Transfer findings (${result.findings.length}) and questions (${totals.questions}) shared with the buyer`,
    { version },
  );
  await addEvent(28, `Route-by-route assessment v${version} saved`, { version, transferId });

  if (version === 1) {
    // Stage 6 is done; Stage 7 (risk identification) is next.
    await db.query(
      `DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 6 AND step IS NULL AND kind = 'milestone'`,
      [assessment.id],
    );
    await db.query(
      `UPDATE assessment_timeline SET status = 'next'
        WHERE assessment_id = $1 AND stage = 7 AND step IS NULL AND status = 'pending'`,
      [assessment.id],
    );
  }
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function notFound(res, message) {
  return res.status(404).json({ error: 'not_found', message });
}
