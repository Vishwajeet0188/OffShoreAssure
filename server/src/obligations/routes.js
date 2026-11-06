/*
 * Stage 5 – Obligation extraction (sequence diagram steps 21–24).
 *
 * Buyer:
 *   GET  /api/assessments/:ref/obligations              latest register (or ?version=N)
 *   POST /api/assessments/:ref/obligations              steps 21–24 for the latest contract version
 *   POST /api/assessments/:ref/obligations/:id/missed   report a monitored obligation as missed → a Stage 8 action
 * Vendor:
 *   GET  /api/vendor/obligations                        assessments with a register for this vendor
 *   GET  /api/vendor/obligations/:ref                   the vendor's own obligations, stated plainly
 *
 * The extraction rules live in engine/obligations.js (provisional, RP-2026.10-S5-draft).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { buildRegister, PARTIES, RULES, S5_RULE_PACK, REGISTER_NOTE } from '../engine/obligations.js';
import { TOPICS } from '../engine/clauses.js';
import { ACTION_STATUS } from '../engine/remediation.js';
import { notifyVendor } from '../remediation/routes.js';
import { z } from 'zod';

const AUDIT_STAGE = 'stage-5';

/* ================= Buyer ================= */

export const obligationsBuyerRouter = Router();
obligationsBuyerRouter.use('/:ref/obligations', requireRole('buyer'), requireActiveMembership);

obligationsBuyerRouter.get('/:ref/obligations', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const requestedVersion = req.query.version ? Number(req.query.version) : null;
  res.json(await obligationsState(query, assessment, requestedVersion));
});

/* Steps 21–24: extract, map, save, and return the register. */
obligationsBuyerRouter.post('/:ref/obligations', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const contract = await latestAnalysedContract(query, assessment.id);
  if (!contract) {
    return res
      .status(409)
      .json({ error: 'not_ready', message: 'Upload and analyse the contract first (Stage 4).' });
  }

  const latest = await latestRegister(query, assessment.id);
  if (latest && latest.contract_version === contract.version) {
    return res.status(409).json({
      error: 'up_to_date',
      message: `The obligations for contract v${contract.version} have already been extracted. Upload a new contract version to run it again.`,
    });
  }

  const register = buildRegister(contract.clauses, {
    buyerName: assessment.buyer_name,
    vendorName: assessment.vendor_name,
    applicableControls: await controlsForAssessment(query, assessment.id),
  });
  const version = (latest?.version || 0) + 1;

  await tx(async db => {
    const snapshot = {
      reference: assessment.reference,
      version,
      contractId: contract.id,
      contractVersion: contract.version,
      rulePackVersion: S5_RULE_PACK,
      obligations: register.obligations,
      ruleTrace: register.ruleTrace,
    };
    const { rows } = await db.query(
      `INSERT INTO obligation_registers
         (assessment_id, contract_id, contract_version, version, rule_pack_version, totals, obligations, rule_trace, gaps, snapshot_sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, snapshot_sha256`,
      [
        assessment.id,
        contract.id,
        contract.version,
        version,
        S5_RULE_PACK,
        JSON.stringify(register.totals),
        JSON.stringify(register.obligations),
        JSON.stringify(register.ruleTrace),
        JSON.stringify(register.gaps),
        sha256(JSON.stringify(snapshot)),
        req.user.id,
      ],
    );

    await recordOnTimeline(db, assessment, {
      version,
      contractVersion: contract.version,
      totals: register.totals,
      registerId: rows[0].id,
    });

    await audit(req, 'obligations.extracted', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        version,
        contractVersion: contract.version,
        ...register.totals,
        rulePackVersion: S5_RULE_PACK,
        snapshotSha256: rows[0].snapshot_sha256,
      },
    });
  });

  res.status(201).json(await obligationsState(query, assessment, version));
});

/*
 * A monitored obligation was missed (Technical Architecture, Stage 5: each obligation
 * is a monitored rule with an owner, a trigger and a consequence). The buyer reports it;
 * it becomes a Stage 8 action for whoever owns the obligation, due in 14 days.
 */
const missedSchema = z.object({
  note: z.string().trim().min(10, 'Say what was missed and when (at least 10 characters).').max(1000),
});
const MISSED_DUE_DAYS = 14;

obligationsBuyerRouter.post('/:ref/obligations/:id/missed', async (req, res) => {
  const p = missedSchema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'validation', message: p.error.issues[0].message });
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const out = await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);
    const register = await latestRegister(db.query.bind(db), assessment.id, true);
    const obligation = register?.obligations.find(o => o.id === req.params.id);
    if (!obligation) return [404, { error: 'not_found', message: 'Obligation not found.' }];
    if (obligation.type === 'Right')
      return [409, { error: 'not_monitored', message: 'A right cannot be missed.' }];
    const owner = obligation.party === 'buyer' ? 'buyer' : 'vendor';
    if (owner === 'vendor' && !assessment.selected_vendor_id)
      return [409, { error: 'no_vendor', message: 'There is no selected vendor to ask.' }];
    const open = (
      await db.query(
        `SELECT number FROM remediation_actions WHERE assessment_id = $1 AND theme = 'obligation' AND risk_id = $2 AND status IN ('OPEN', 'RETURNED', 'SUBMITTED')`,
        [assessment.id, obligation.id],
      )
    ).rows[0];
    if (open)
      return [
        409,
        {
          error: 'already_open',
          message: `${obligation.id} already has an open action (ACT-${String(open.number).padStart(2, '0')}).`,
        },
      ];

    const riskRegister = (
      await db.query(
        'SELECT version FROM risk_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1',
        [assessment.id],
      )
    ).rows[0];
    const number = (
      await db.query(
        'SELECT coalesce(max(number), 0) + 1 AS n FROM remediation_actions WHERE assessment_id = $1',
        [assessment.id],
      )
    ).rows[0].n;
    const due = new Date(Date.now() + MISSED_DUE_DAYS * 86400000).toISOString().slice(0, 10);
    const consequence = obligation.consequence
      ? `Under clause ${obligation.consequence.clauseNumber}: ${obligation.consequence.text}`
      : 'The contract does not state a consequence.';
    const requests =
      owner === 'vendor'
        ? [
            `Explain why ${obligation.id} (clause ${obligation.source.clauseNumber}) was not met and what you have done to put it right.`,
            'Upload evidence of the fix.',
            consequence,
          ]
        : [
            `Record what you did about ${obligation.id} (clause ${obligation.source.clauseNumber}).`,
            consequence,
          ];
    const { rows } = await db.query(
      `INSERT INTO remediation_actions (assessment_id, number, register_version, risk_id, theme, title, owner, requests, needs_document, source_stages,
                                        rating, score, status, due_on, suggested_due_on, buyer_note)
       VALUES ($1, $2, $3, $4, 'obligation', $5, $6, $7, $8, '[5]', 'HIGH', 0, 'OPEN', $9, $9, $10) RETURNING id`,
      [
        assessment.id,
        number,
        riskRegister?.version || 0,
        obligation.id,
        `Missed obligation ${obligation.id}: clause ${obligation.source.clauseNumber}`,
        owner,
        JSON.stringify(requests),
        owner === 'vendor',
        due,
        p.data.note,
      ],
    );
    for (const event of ['proposed', 'assigned']) {
      await db.query(
        'INSERT INTO remediation_events (action_id, actor_id, actor_role, event, detail) VALUES ($1, $2, $3, $4, $5)',
        [
          rows[0].id,
          req.user.id,
          req.user.role,
          event,
          JSON.stringify({ obligation: obligation.id, dueOn: due }),
        ],
      );
    }
    await db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1, 'event', 8, 33, $2, 'done', now(), $3)`,
      [
        assessment.id,
        `Missed obligation ${obligation.id} reported; action ACT-${String(number).padStart(2, '0')} assigned to the ${owner}`,
        JSON.stringify({ obligation: obligation.id }),
      ],
    );
    await audit(req, 'obligations.missed', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        obligation: obligation.id,
        clause: obligation.source.clauseNumber,
        owner,
        action: number,
        note: p.data.note,
      },
    });
    return [201, { owner, number, obligation, due }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { owner, number, obligation, due } = out[1];
  if (owner === 'vendor') {
    await notifyVendor(
      assessment,
      `${assessment.buyer_name} reported a missed obligation`,
      [
        `${assessment.buyer_name} says obligation ${obligation.id} (clause ${obligation.source.clauseNumber}) in "${assessment.title}" (${assessment.reference}) was not met.`,
        `ACT-${String(number).padStart(2, '0')} · respond by ${due}.`,
      ],
      'OBLIGATION MISSED',
      'An obligation was missed',
    );
  }
  res.status(201).json(await obligationsState(query, assessment));
});

/* ================= Vendor ================= */

export const obligationsVendorRouter = Router();
obligationsVendorRouter.use('/obligations', requireRole('vendor'));

obligationsVendorRouter.get('/obligations', async (req, res) => {
  const vendorId = await vendorOrganisation(req.user.id);
  if (!vendorId) return res.json({ registers: [] });

  const { rows } = await query(
    `SELECT DISTINCT ON (a.id) a.reference, r.title, o.name AS buyer_name, g.version, g.contract_version, g.totals, g.created_at
       FROM obligation_registers g
       JOIN assessments a ON a.id = g.assessment_id
       JOIN requirements r ON r.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id
      WHERE a.selected_vendor_id = $1
      ORDER BY a.id, g.version DESC`,
    [vendorId],
  );

  res.json({
    registers: rows.map(row => ({
      reference: row.reference,
      title: row.title,
      buyerName: row.buyer_name,
      version: row.version,
      contractVersion: row.contract_version,
      yourObligations: row.totals.vendor + row.totals.both,
      createdAt: row.created_at,
    })),
  });
});

obligationsVendorRouter.get('/obligations/:ref', async (req, res) => {
  const vendorId = await vendorOrganisation(req.user.id);
  const { rows } = await query(
    `SELECT g.*, a.reference, r.title, o.name AS buyer_name
       FROM obligation_registers g
       JOIN assessments a ON a.id = g.assessment_id
       JOIN requirements r ON r.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id
      WHERE a.reference = $1 AND a.selected_vendor_id = $2
      ORDER BY g.version DESC LIMIT 1`,
    [req.params.ref, vendorId],
  );
  const register = rows[0];
  if (!register) return notFound(res, 'No obligations have been shared for this assessment yet.');

  // The vendor sees only what applies to it: its own obligations and the shared ones.
  const ownObligations = register.obligations.filter(o => o.party === 'vendor' || o.party === 'both');

  res.json({
    reference: register.reference,
    title: register.title,
    buyerName: register.buyer_name,
    version: register.version,
    contractVersion: register.contract_version,
    createdAt: register.created_at,
    obligations: ownObligations.map(o => ({
      id: o.id,
      type: o.type,
      party: o.party,
      text: o.text,
      deadline: o.deadline,
      frequency: o.frequency,
      condition: o.condition,
      trigger: o.trigger ?? null,
      consequence: o.consequence ?? null,
      monitored: !!o.monitored,
      source: o.source,
      topics: o.topics,
    })),
    topics: TOPICS.map(({ id, name }) => ({ id, name })),
    note: REGISTER_NOTE,
  });
});

/* ================= Shared ================= */

export async function obligationsState(run, assessment, requestedVersion = null) {
  const { rows: registers } = await run(
    `SELECT g.*, u.email AS created_by_email
       FROM obligation_registers g JOIN users u ON u.id = g.created_by
      WHERE g.assessment_id = $1 ORDER BY g.version DESC`,
    [assessment.id],
  );
  const shown = requestedVersion ? registers.find(r => r.version === requestedVersion) : registers[0];
  const contract = await latestAnalysedContract(run, assessment.id);

  let blocked = null;
  if (!contract) blocked = 'Upload and analyse the contract first (Stage 4).';

  return {
    assessment: {
      reference: assessment.reference,
      title: assessment.title,
      buyerName: assessment.buyer_name,
    },
    vendor: assessment.selected_vendor_id
      ? { id: assessment.selected_vendor_id, name: assessment.vendor_name }
      : null,
    blocked,
    contract: contract
      ? { version: contract.version, fileName: contract.file_name, clauses: contract.clauses.length }
      : null,
    // A newer contract than the latest register can be processed again.
    canExtract: Boolean(contract) && (!registers[0] || registers[0].contract_version !== contract.version),
    versions: registers.map(r => ({
      version: r.version,
      contractVersion: r.contract_version,
      createdAt: r.created_at,
      createdBy: r.created_by_email,
      totals: r.totals,
    })),
    register: shown ? shapeRegister(shown) : null,
    parties: PARTIES,
    topics: TOPICS.map(({ id, name }) => ({ id, name })),
    rules: RULES.map(({ id, text, source }) => ({ id, text, source })),
    // Missed obligations already reported (Stage 8 actions with theme "obligation").
    missed: (
      await run(
        `SELECT number, risk_id, status, due_on FROM remediation_actions WHERE assessment_id = $1 AND theme = 'obligation' ORDER BY number`,
        [assessment.id],
      )
    ).rows.map(a => ({
      obligationId: a.risk_id,
      code: `ACT-${String(a.number).padStart(2, '0')}`,
      status: a.status,
      statusLabel: ACTION_STATUS[a.status].label,
      dueOn: a.due_on
        ? String(a.due_on instanceof Date ? a.due_on.toISOString() : a.due_on).slice(0, 10)
        : null,
    })),
  };
}

function shapeRegister(row) {
  return {
    id: row.id,
    version: row.version,
    contractVersion: row.contract_version,
    rulePackVersion: row.rule_pack_version,
    totals: row.totals,
    obligations: row.obligations,
    ruleTrace: row.rule_trace,
    gaps: row.gaps,
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
    note: REGISTER_NOTE,
  };
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

async function vendorOrganisation(userId) {
  const { rows } = await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [userId]);
  return rows[0]?.organisation_id || null;
}

async function latestAnalysedContract(run, assessmentId) {
  const { rows } = await run(
    `SELECT d.id, d.version, d.file_name, ca.clauses
       FROM contract_documents d JOIN contract_analyses ca ON ca.contract_id = d.id
      WHERE d.assessment_id = $1 ORDER BY d.version DESC LIMIT 1`,
    [assessmentId],
  );
  return rows[0] || null;
}

async function latestRegister(run, assessmentId, withObligations = false) {
  const { rows } = await run(
    `SELECT version, contract_version${withObligations ? ', obligations' : ''} FROM obligation_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1`,
    [assessmentId],
  );
  return rows[0] || null;
}

async function controlsForAssessment(run, assessmentId) {
  const { rows } = await run(
    'SELECT control_ids FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [assessmentId],
  );
  return rows[0]?.control_ids || [];
}

async function recordOnTimeline(db, assessment, { version, contractVersion, totals, registerId }) {
  const addEvent = (step, title, detail = {}) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
     VALUES ($1, 'event', 5, $2, $3, 'done', now(), $4)`,
      [assessment.id, step, title, JSON.stringify(detail)],
    );

  const found = totals.obligations + totals.prohibitions + totals.rights;
  await addEvent(21, `Obligations and parties extracted from contract v${contractVersion}: ${found} found`, {
    version,
  });
  await addEvent(
    22,
    `Mapped to controls and rules: ${totals.rulesCovered} of ${totals.rulesTotal} rules covered, ${totals.gaps} gap${totals.gaps === 1 ? '' : 's'}`,
    { version },
  );
  await addEvent(23, 'Obligations, sources and confidence shared with the buyer', { version });
  await addEvent(24, `Obligation register v${version} and rule trace saved`, { version, registerId });

  if (version === 1) {
    // Stage 5 is done; Stage 6 (transfer assessment) is next.
    await db.query(
      `DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 5 AND step IS NULL AND kind = 'milestone'`,
      [assessment.id],
    );
    await db.query(
      `UPDATE assessment_timeline SET status = 'next'
        WHERE assessment_id = $1 AND stage = 6 AND step IS NULL AND status = 'pending'`,
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
