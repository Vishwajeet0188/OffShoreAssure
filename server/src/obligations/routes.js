/*
 * Stage 5 – Obligation extraction (sequence diagram steps 21–24).
 * Client specification: "Offshore Assure – Input / Output Stage 4, 5, 6".
 *
 * Buyer:
 *   GET  /api/assessments/:ref/obligations              latest register (or ?version=N)
 *   POST /api/assessments/:ref/obligations              steps 21–24 from the latest contract analysis (v1.0, v2.0 …)
 *   POST /api/assessments/:ref/obligations/review       a reviewer verifies, rejects or edits an obligation,
 *                                                       or confirms / rejects a mapping (v1.1, v1.2 …)
 *   POST /api/assessments/:ref/obligations/:id/missed   report a monitored obligation as missed → a Stage 8 action
 * Vendor:
 *   GET  /api/vendor/obligations                        assessments with a register for this vendor
 *   GET  /api/vendor/obligations/:ref                   the vendor's own obligations, stated plainly
 *
 * The extraction and the rules live in engine/obligations.js (rule pack RP-2026.11-S5).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import {
  buildRegister,
  storedRecords,
  PARTIES,
  RULES,
  S5_RULE_PACK,
  REGISTER_NOTE,
  OBLIGATION_STATUS,
  TRIGGER_TYPES,
  DEADLINE_TYPES,
  FREQUENCIES,
  MAPPING_REVIEW,
} from '../engine/obligations.js';
import { TOPICS, CATEGORIES } from '../engine/clauses.js';
import { ACTION_STATUS } from '../engine/remediation.js';
import { notifyVendor } from '../remediation/routes.js';

const AUDIT_STAGE = 'stage-5';

// Registers made before the client's specification. They are shown, but extracting again replaces them.
const isLegacy = register => register && register.rule_pack_version !== S5_RULE_PACK;

/* ================================================================== */
/*  Buyer                                                             */
/* ================================================================== */

export const obligationsBuyerRouter = Router();
obligationsBuyerRouter.use('/:ref/obligations', requireRole('buyer'), requireActiveMembership);

obligationsBuyerRouter.get('/:ref/obligations', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const requestedVersion = req.query.version ? Number(req.query.version) : null;
  res.json(await obligationsState(query, assessment, requestedVersion));
});

/* ------------------------------------------------------------------ */
/*  Steps 21–24: extract, map, save and return the register           */
/* ------------------------------------------------------------------ */

obligationsBuyerRouter.post('/:ref/obligations', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const analysis = await latestAnalysis(query, assessment.id);
  if (!analysis) {
    return res
      .status(409)
      .json({ error: 'not_ready', message: 'Upload and analyse the contract first (Stage 4).' });
  }

  // Only extract again when the contract analysis has changed (or the last register used older rules).
  const latest = await latestRegister(query, assessment.id);
  if (latest && latest.contract_version === analysis.version && !isLegacy(latest)) {
    return res.status(409).json({
      error: 'up_to_date',
      message: `The obligations for contract analysis v${analysis.version} have already been extracted. Upload or correct the contract (Stage 4) to run it again.`,
    });
  }

  // Reviewer edits carry over to the new contract version when the same clause is still there.
  const edits = latest && !isLegacy(latest) ? latest.edits : [];
  const major =
    latest && !isLegacy(latest)
      ? Number(String(latest.label).split('.')[0]) + 1
      : latest
        ? latest.version + 1
        : 1;

  const saved = await tx(async db => {
    const context = await registerContext(db.query.bind(db), assessment, analysis);
    const register = buildRegister(analysis, { ...context, edits });

    return saveRegister(db, req, assessment, analysis, register, {
      label: `${major}.0`,
      trigger: 'extract',
      edits,
      edit: null,
    });
  });

  res.status(201).json(await obligationsState(query, assessment, saved.version));
});

/* ------------------------------------------------------------------ */
/*  Reviewer edits (step 24 boundary)                                 */
/* ------------------------------------------------------------------ */

const partyCodes = Object.keys(PARTIES);
const reviewSchema = z.object({
  obligationId: z.string().regex(/^OBL-\d{3,}$/, 'Choose an obligation.'),
  action: z.enum(['VERIFY', 'REJECT', 'EDIT', 'CONFIRM_MAPPING', 'REJECT_MAPPING']),
  ruleId: z.string().max(20).optional(),
  note: z.string().trim().max(1000).optional().default(''),
  changes: z
    .object({
      description: z.string().trim().min(5).max(300).optional(),
      party: z.enum(partyCodes).optional(),
      trigger: z
        .object({ type: z.enum(Object.keys(TRIGGER_TYPES)), text: z.string().trim().min(2).max(200) })
        .optional(),
      deadline: z
        .object({ type: z.enum(Object.keys(DEADLINE_TYPES)), text: z.string().trim().max(200).optional() })
        .optional(),
      frequency: z.enum(Object.keys(FREQUENCIES)).optional(),
      requiredEvidence: z.array(z.string().trim().min(2).max(150)).max(10).optional(),
    })
    .optional(),
});

obligationsBuyerRouter.post('/:ref/obligations/review', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: parsed.error.issues[0].message });
  }
  const input = parsed.data;

  // A rejection or an edit must say why; verifying can be silent.
  if (['REJECT', 'EDIT', 'REJECT_MAPPING'].includes(input.action) && input.note.length < 5) {
    return res.status(400).json({ error: 'validation', message: 'Say why (at least 5 characters).' });
  }
  if (input.action === 'EDIT' && !Object.keys(input.changes || {}).length) {
    return res.status(400).json({ error: 'validation', message: 'Change at least one field.' });
  }
  if (input.action.endsWith('_MAPPING') && !input.ruleId) {
    return res.status(400).json({ error: 'validation', message: 'Choose the rule of the mapping.' });
  }

  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const out = await tx(async db => {
    // One reviewer at a time per assessment.
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);

    const latest = await latestRegister(db.query.bind(db), assessment.id, true);
    if (!latest || isLegacy(latest)) {
      return [409, { error: 'not_ready', message: 'Extract the obligations first.' }];
    }

    const obligation = latest.obligations.find(o => o.id === input.obligationId);
    if (!obligation) return [404, { error: 'not_found', message: 'Obligation not found.' }];

    if (
      input.action.endsWith('_MAPPING') &&
      !latest.mappings.some(m => m.obligationId === obligation.id && m.ruleId === input.ruleId)
    ) {
      return [404, { error: 'not_found', message: `${obligation.id} is not mapped to ${input.ruleId}.` }];
    }

    // An UNSPECIFIED deadline has no text of its own.
    const changes = input.changes ? { ...input.changes } : undefined;
    if (changes?.deadline) {
      changes.deadline =
        changes.deadline.type === 'UNSPECIFIED'
          ? { type: 'UNSPECIFIED', text: 'UNSPECIFIED' }
          : { type: changes.deadline.type, text: changes.deadline.text || '' };
      if (changes.deadline.type !== 'UNSPECIFIED' && changes.deadline.text.length < 2) {
        return [400, { error: 'validation', message: 'Write the deadline as the contract states it.' }];
      }
    }

    // The edit is attributed to the reviewer and kept for every later version.
    const edit = {
      obligationKey: obligation.key,
      obligationId: obligation.id,
      action: input.action,
      ruleId: input.ruleId || null,
      changes: input.action === 'EDIT' ? changes : undefined,
      note: input.note || null,
      by: req.user.email,
      byId: req.user.id,
      at: new Date().toISOString(),
    };
    const edits = [...latest.edits, edit];

    // Rebuild from the same contract analysis, so only the reviewer's change differs.
    const analysis = await analysisVersion(db.query.bind(db), assessment.id, latest.contract_version);
    const context = await registerContext(db.query.bind(db), assessment, analysis);
    const register = buildRegister(analysis, { ...context, edits });

    const [major, minor] = String(latest.label).split('.').map(Number);
    const saved = await saveRegister(db, req, assessment, analysis, register, {
      label: `${major}.${minor + 1}`,
      trigger: 'review',
      edits,
      edit,
    });
    return [201, saved];
  });

  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  res.status(201).json(await obligationsState(query, assessment, out[1].version));
});

/* ------------------------------------------------------------------ */
/*  A monitored obligation was missed → a Stage 8 action              */
/* ------------------------------------------------------------------ */

const missedSchema = z.object({
  note: z.string().trim().min(10, 'Say what was missed and when (at least 10 characters).').max(1000),
});
const MISSED_DUE_DAYS = 14;

obligationsBuyerRouter.post('/:ref/obligations/:id/missed', async (req, res) => {
  const parsed = missedSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: parsed.error.issues[0].message });
  }

  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const out = await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);

    const register = await latestRegister(db.query.bind(db), assessment.id, true);
    const obligation = register?.obligations.find(o => o.id === req.params.id);
    if (!obligation) return [404, { error: 'not_found', message: 'Obligation not found.' }];
    if (obligation.type === 'Right')
      return [409, { error: 'not_monitored', message: 'A right cannot be missed.' }];

    // Step 23 boundary: nothing is escalated until a low-confidence obligation is verified.
    const monitor = (register.monitors || []).find(m => m.obligationId === obligation.id);
    if (!isLegacy(register)) {
      if (!monitor) {
        return [
          409,
          {
            error: 'not_monitored',
            message: `${obligation.id} has no deadline, repeat or event to monitor.`,
          },
        ];
      }
      if (monitor.state !== 'ACTIVE') {
        return [
          409,
          {
            error: 'needs_verification',
            message: `${obligation.id} must be verified by a reviewer before it can be escalated.`,
          },
        ];
      }
    }

    const owner = obligation.party === 'buyer' ? 'buyer' : 'vendor';
    if (owner === 'vendor' && !assessment.selected_vendor_id) {
      return [409, { error: 'no_vendor', message: 'There is no selected vendor to ask.' }];
    }

    // Do not open a second action while one is still open.
    const open = (
      await db.query(
        `SELECT number FROM remediation_actions
          WHERE assessment_id = $1 AND theme = 'obligation' AND risk_id = $2 AND status IN ('OPEN', 'RETURNED', 'SUBMITTED')`,
        [assessment.id, obligation.id],
      )
    ).rows[0];
    if (open) {
      return [
        409,
        {
          error: 'already_open',
          message: `${obligation.id} already has an open action (${actionCode(open.number)}).`,
        },
      ];
    }

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

    const clause = clauseOf(obligation);
    const consequence = consequenceText(obligation);
    const requests =
      owner === 'vendor'
        ? [
            `Explain why ${obligation.id} (${clause}) was not met and what you have done to put it right.`,
            `Upload evidence of the fix${obligation.requiredEvidence?.length ? ': ' + obligation.requiredEvidence.join(', ') : ''}.`,
            consequence,
          ]
        : [`Record what you did about ${obligation.id} (${clause}).`, consequence];

    const { rows } = await db.query(
      `INSERT INTO remediation_actions (assessment_id, number, register_version, risk_id, theme, title, owner, requests, needs_document, source_stages,
                                        rating, score, status, due_on, suggested_due_on, buyer_note)
       VALUES ($1, $2, $3, $4, 'obligation', $5, $6, $7, $8, '[5]', 'HIGH', 0, 'OPEN', $9, $9, $10) RETURNING id`,
      [
        assessment.id,
        number,
        riskRegister?.version || 0,
        obligation.id,
        `Missed obligation ${obligation.id}: ${clause}`,
        owner,
        JSON.stringify(requests),
        owner === 'vendor',
        due,
        parsed.data.note,
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
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
       VALUES ($1, 'event', 8, 33, $2, 'done', now(), $3)`,
      [
        assessment.id,
        `Missed obligation ${obligation.id} reported; action ${actionCode(number)} assigned to the ${owner}`,
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
        clause,
        owner,
        action: number,
        note: parsed.data.note,
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
        `${assessment.buyer_name} says obligation ${obligation.id} (${clauseOf(obligation)}) in "${assessment.title}" (${assessment.reference}) was not met.`,
        `${actionCode(number)} · respond by ${due}.`,
      ],
      'OBLIGATION MISSED',
      'An obligation was missed',
    );
  }

  res.status(201).json(await obligationsState(query, assessment));
});

/* ================================================================== */
/*  Vendor                                                            */
/* ================================================================== */

export const obligationsVendorRouter = Router();
obligationsVendorRouter.use('/obligations', requireRole('vendor'));

obligationsVendorRouter.get('/obligations', async (req, res) => {
  const vendorId = await vendorOrganisation(req.user.id);
  if (!vendorId) return res.json({ registers: [] });

  const { rows } = await query(
    `SELECT DISTINCT ON (a.id) a.reference, r.title, o.name AS buyer_name, g.version, g.label, g.contract_version, g.totals, g.created_at
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
      label: row.label || `${row.version}.0`,
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

  // The vendor sees only what applies to it: its own obligations and the shared ones. Rejected ones are left out.
  const own = register.obligations.filter(
    o => (o.party === 'vendor' || o.party === 'both') && o.status !== 'REJECTED',
  );

  res.json({
    reference: register.reference,
    title: register.title,
    buyerName: register.buyer_name,
    version: register.version,
    label: register.label || `${register.version}.0`,
    contractVersion: register.contract_version,
    createdAt: register.created_at,
    legacy: isLegacy(register),
    obligations: own.map(o => ({
      id: o.id,
      type: o.type,
      party: o.party,
      description: o.description || o.text,
      text: o.text,
      trigger: o.trigger ?? null,
      deadline: o.deadline,
      frequency: o.frequency,
      requiredEvidence: o.requiredEvidence || [],
      consequence: o.consequence ?? null,
      status: o.status || null,
      sourceDocument: o.sourceDocument || null,
      sourceClause: o.sourceClause || null,
      source: o.source || null, // registers saved before the specification
      topics: o.topics || [],
    })),
    statuses: OBLIGATION_STATUS,
    frequencies: FREQUENCIES,
    topics: TOPICS.map(({ id, name }) => ({ id, name })),
    note: REGISTER_NOTE,
  });
});

/* ================================================================== */
/*  Shared                                                            */
/* ================================================================== */

export async function obligationsState(run, assessment, requestedVersion = null) {
  const { rows: registers } = await run(
    `SELECT g.*, u.email AS created_by_email
       FROM obligation_registers g JOIN users u ON u.id = g.created_by
      WHERE g.assessment_id = $1 ORDER BY g.version DESC`,
    [assessment.id],
  );
  const shown = requestedVersion ? registers.find(r => r.version === requestedVersion) : registers[0];
  const analysis = await latestAnalysis(run, assessment.id);
  const latest = registers[0];

  // A newer contract analysis, or a register made with the older rules, can be processed again.
  const canExtract =
    Boolean(analysis) && (!latest || latest.contract_version !== analysis.version || isLegacy(latest));

  return {
    assessment: {
      reference: assessment.reference,
      title: assessment.title,
      buyerName: assessment.buyer_name,
    },
    vendor: assessment.selected_vendor_id
      ? { id: assessment.selected_vendor_id, name: assessment.vendor_name }
      : null,
    blocked: analysis ? null : 'Upload and analyse the contract first (Stage 4).',
    contract: analysis
      ? {
          version: analysis.version,
          status: analysis.status,
          documents: analysis.document_count,
          clauses: analysis.clauses.length,
        }
      : null,
    canExtract,
    versions: registers.map(r => ({
      version: r.version,
      label: r.label || `${r.version}.0`,
      trigger: r.trigger || 'extract',
      contractVersion: r.contract_version,
      createdAt: r.created_at,
      createdBy: r.created_by_email,
      totals: r.totals,
    })),
    register: shown ? shapeRegister(shown) : null,
    latest: shown ? shown.version === latest.version : true,

    // Lists the page uses for labels and filters.
    parties: PARTIES,
    statuses: OBLIGATION_STATUS,
    triggerTypes: TRIGGER_TYPES,
    deadlineTypes: DEADLINE_TYPES,
    frequencies: FREQUENCIES,
    mappingReview: MAPPING_REVIEW,
    categories: CATEGORIES.map(({ id, name }) => ({ id, name })),
    topics: TOPICS.map(({ id, name }) => ({ id, name })),
    rules: RULES.map(({ id, text, kind, categories }) => ({ id, text, kind, categories })),

    // Missed obligations already reported (Stage 8 actions with theme "obligation").
    missed: (
      await run(
        `SELECT number, risk_id, status, due_on FROM remediation_actions WHERE assessment_id = $1 AND theme = 'obligation' ORDER BY number`,
        [assessment.id],
      )
    ).rows.map(a => ({
      obligationId: a.risk_id,
      code: actionCode(a.number),
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
    label: row.label || `${row.version}.0`,
    trigger: row.trigger || 'extract',
    legacy: isLegacy(row),
    contractVersion: row.contract_version,
    rulePackVersion: row.rule_pack_version,
    totals: row.totals,
    obligations: row.obligations,
    mappings: row.mappings || [],
    ruleTrace: row.rule_trace,
    checks: row.checks || [],
    gaps: row.gaps,
    monitors: row.monitors || [],
    records: row.records || [],
    edits: (row.edits || []).map(({ byId, ...edit }) => edit), // eslint-disable-line no-unused-vars
    edit: row.edit ? (({ byId, ...edit }) => edit)(row.edit) : null, // eslint-disable-line no-unused-vars
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
    createdBy: row.created_by_email,
    note: REGISTER_NOTE,
  };
}

/*
 * Saves one register version (step 24): the obligations, the mappings, the checks, the
 * monitoring triggers and the 10 stored fields per obligation. The row is locked.
 */
async function saveRegister(db, req, assessment, analysis, register, { label, trigger, edits, edit }) {
  const latest = await latestRegister(db.query.bind(db), assessment.id);
  const version = (latest?.version || 0) + 1;
  const at = new Date().toISOString();
  const records = storedRecords(register.obligations, {
    assessmentId: assessment.reference,
    version: label,
    at,
  });

  const snapshot = {
    reference: assessment.reference,
    version: label,
    contractVersion: analysis.version,
    rulePackVersion: S5_RULE_PACK,
    obligations: register.obligations,
    mappings: register.mappings,
    ruleTrace: register.ruleTrace,
    edits,
  };

  const { rows } = await db.query(
    `INSERT INTO obligation_registers
       (assessment_id, contract_id, contract_version, version, label, trigger, rule_pack_version, totals, obligations,
        rule_trace, gaps, mappings, checks, monitors, records, edits, edit, snapshot_sha256, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING id, version, snapshot_sha256`,
    [
      assessment.id,
      analysis.contract_id,
      analysis.version,
      version,
      label,
      trigger,
      S5_RULE_PACK,
      JSON.stringify(register.totals),
      JSON.stringify(register.obligations),
      JSON.stringify(register.ruleTrace),
      JSON.stringify(register.gaps),
      JSON.stringify(register.mappings),
      JSON.stringify(register.checks),
      JSON.stringify(register.monitors),
      JSON.stringify(records),
      JSON.stringify(edits),
      edit ? JSON.stringify(edit) : null,
      sha256(JSON.stringify(snapshot)),
      req.user.id,
    ],
  );

  if (trigger === 'extract') {
    await recordOnTimeline(db, assessment, {
      version,
      label,
      contractVersion: analysis.version,
      totals: register.totals,
      registerId: rows[0].id,
    });
  } else {
    await db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
       VALUES ($1, 'event', 5, 24, $2, 'done', now(), $3)`,
      [
        assessment.id,
        `Obligation register v${label} saved after a reviewer ${reviewWords(edit)} ${edit.obligationId}`,
        JSON.stringify({ version, label }),
      ],
    );
  }

  await audit(req, trigger === 'extract' ? 'obligations.extracted' : 'obligations.reviewed', {
    db,
    stage: AUDIT_STAGE,
    ref: assessment.reference,
    detail: {
      reference: assessment.reference,
      version: label,
      contractVersion: analysis.version,
      ...(edit
        ? { obligation: edit.obligationId, action: edit.action, ruleId: edit.ruleId, note: edit.note }
        : {}),
      ...register.totals,
      rulePackVersion: S5_RULE_PACK,
      snapshotSha256: rows[0].snapshot_sha256,
    },
  });

  return rows[0];
}

/* What the engine needs besides the clauses: names, documents, controls, the law, sub-processors. */
async function registerContext(run, assessment, analysis) {
  // The documents of the contract set, by their number (DOC-001 …).
  const { rows: documents } = await run(
    `SELECT id, document_no, document_type, title, file_name, execution_status
       FROM contract_documents WHERE assessment_id = $1 ORDER BY document_no, version DESC`,
    [assessment.id],
  );
  const documentMap = {};
  for (const d of documents) {
    const key = `DOC-${String(d.document_no || 1).padStart(3, '0')}`;
    if (documentMap[key]) continue; // the latest version of each document comes first
    documentMap[key] = {
      uuid: d.id,
      type: d.document_type || null,
      title: d.title || d.file_name,
      executionStatus: d.execution_status || null,
    };
  }

  const profile = (
    await run(
      'SELECT original_submission, control_ids FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [assessment.id],
    )
  ).rows[0];
  const requirement = profile?.original_submission || {};

  // Sub-processors are in play when the requirement allows them or the vendor said "Yes" in Stage 3 (SUB-01).
  const stage3 = (
    await run(
      `SELECT r.answers FROM compliance_results r JOIN compliance_assessments c ON c.id = r.compliance_id
        WHERE c.assessment_id = $1 ORDER BY r.version DESC LIMIT 1`,
      [assessment.id],
    )
  ).rows[0];
  const vendorSaysSubprocessors = stage3?.answers?.['SUB-01']?.answer === 'Yes';

  return {
    buyerName: assessment.buyer_name,
    vendorName: assessment.vendor_name,
    documents: documentMap,
    applicableControls: profile?.control_ids || [],
    law: (requirement.buyerCountry || 'GB') === 'GB' ? 'UK GDPR' : 'GDPR',
    subprocessorsUsed:
      ['Allowed', 'Approval required'].includes(requirement.subprocessors) || vendorSaysSubprocessors,
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

/* The latest analysis of the contract set (Stage 4) that has clauses. Its version is the "contract version". */
async function latestAnalysis(run, assessmentId) {
  const { rows } = await run(
    `SELECT contract_id, version, status, clauses, coalesce(findings, '[]'::jsonb) AS findings,
            jsonb_array_length(document_ids) AS document_count
       FROM contract_analyses
      WHERE assessment_id = $1 AND jsonb_array_length(clauses) > 0
      ORDER BY version DESC LIMIT 1`,
    [assessmentId],
  );
  return rows[0] || null;
}

async function analysisVersion(run, assessmentId, version) {
  const { rows } = await run(
    `SELECT contract_id, version, status, clauses, coalesce(findings, '[]'::jsonb) AS findings
       FROM contract_analyses WHERE assessment_id = $1 AND version = $2`,
    [assessmentId, version],
  );
  return rows[0];
}

async function latestRegister(run, assessmentId, full = false) {
  const { rows } = await run(
    `SELECT version, label, contract_version, rule_pack_version, edits${full ? ', obligations, mappings, monitors' : ''}
       FROM obligation_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1`,
    [assessmentId],
  );
  return rows[0] || null;
}

async function recordOnTimeline(db, assessment, { version, label, contractVersion, totals, registerId }) {
  const addEvent = (step, title, detail = {}) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
       VALUES ($1, 'event', 5, $2, $3, 'done', now(), $4)`,
      [assessment.id, step, title, JSON.stringify(detail)],
    );

  const found = totals.obligations + totals.prohibitions + totals.rights;
  await addEvent(21, `Draft obligation register from contract analysis v${contractVersion}: ${found} found`, {
    version,
  });
  await addEvent(
    22,
    `Clause-to-rule-to-obligation trace: ${totals.rulesCovered} of ${totals.rulesTotal} rules covered, ${plural(totals.gaps, 'gap')}, ${plural(totals.issues, 'issue')}`,
    { version },
  );
  await addEvent(
    23,
    `Obligations, sources and confidence shared with the buyer (${totals.requiresVerification} to verify)`,
    { version },
  );
  await addEvent(
    24,
    `Obligation register v${label} and rule trace saved; ${plural(totals.monitored, 'monitoring trigger')} active`,
    {
      version,
      registerId,
    },
  );

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

/* ---------- Small helpers ---------- */

const actionCode = number => `ACT-${String(number).padStart(2, '0')}`;

/* "DOC-002 §9.4" for new registers, "clause 9.4" for older ones. */
function clauseOf(obligation) {
  if (obligation.sourceClause) {
    return `${obligation.sourceDocument?.id || 'contract'} §${obligation.sourceClause.section}`;
  }
  return `clause ${obligation.source?.clauseNumber}`;
}

function consequenceText(obligation) {
  const c = obligation.consequence;
  if (!c || c.type === 'NOT_STATED')
    return 'The contract does not state a consequence; this is escalated to the buyer.';
  return `Under clause ${c.clauseRef || c.clauseNumber}: ${c.text}`;
}

function reviewWords(edit) {
  return (
    {
      VERIFY: 'verified',
      REJECT: 'rejected',
      EDIT: 'edited',
      CONFIRM_MAPPING: `confirmed the ${edit.ruleId} mapping of`,
      REJECT_MAPPING: `rejected the ${edit.ruleId} mapping of`,
    }[edit.action] || 'changed'
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function notFound(res, message) {
  return res.status(404).json({ error: 'not_found', message });
}
