/*
 * Stage 6 – International transfer assessment (sequence diagram steps 25–28).
 * Client specification: "Offshore Assure – Input / Output Stage 4, 5, 6".
 *
 *   GET  /api/assessments/:ref/transfers                     latest register (or ?version=N)
 *   POST /api/assessments/:ref/transfers                     steps 25–28 with the latest inputs
 *   POST /api/assessments/:ref/transfers/routes/:key/facts   the buyer confirms facts for one route
 *                                                            (entity, role, safeguard, TRA, legal review …);
 *                                                            the routes are then assessed again
 *   GET  /api/assessments/:ref/transfers/routes/:key         every saved version of one route
 *
 * The legal decision sequence lives in engine/transfers.js (rule pack RP-2026.11-S6).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { isCountry } from '../reference/countries.js';
import {
  assessTransfers,
  ROUTE_STATUS,
  OUTCOMES,
  ROLES,
  SAFEGUARDS,
  INSTRUMENT_STATUS,
  TRA_STATUS,
  FREQUENCIES,
  S6_RULE_PACK,
  TRANSFER_NOTE,
} from '../engine/transfers.js';

const AUDIT_STAGE = 'stage-6';

// Assessments saved before the client's specification.
const isLegacy = row => row && row.rule_pack_version !== S6_RULE_PACK;

export const transfersRouter = Router();
transfersRouter.use('/:ref/transfers', requireRole('buyer'), requireActiveMembership);

transfersRouter.get('/:ref/transfers', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const requestedVersion = req.query.version ? Number(req.query.version) : null;
  res.json(await transfersState(query, assessment, requestedVersion));
});

/* ------------------------------------------------------------------ */
/*  Steps 25–28: map, decide, save and return                         */
/* ------------------------------------------------------------------ */

transfersRouter.post('/:ref/transfers', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const out = await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);
    const run = db.query.bind(db);

    const inputs = await gatherInputs(run, assessment);
    if (inputs.blocked) return [409, { error: 'not_ready', message: inputs.blocked }];

    const latest = await latestRegister(run, assessment.id);
    if (latest && !isLegacy(latest) && sameInputs(latest.inputs, inputs.versions)) {
      return [
        409,
        {
          error: 'up_to_date',
          message:
            'Nothing has changed since the last transfer assessment. It runs again when the requirement, vendor, Stage 3 answers, contract or route facts change.',
        },
      ];
    }

    const saved = await saveRegister(db, req, assessment, inputs, { reason: null });
    return [201, saved];
  });

  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  res.status(201).json(await transfersState(query, assessment, out[1].version));
});

/* ------------------------------------------------------------------ */
/*  Route facts confirmed by the buyer                                */
/* ------------------------------------------------------------------ */

const optionalText = max => z.string().trim().max(max).optional();
const factsSchema = z.object({
  reason: z.string().trim().min(10, 'Say where the facts come from (at least 10 characters).').max(1000),

  // Who receives the data.
  importerName: z.string().trim().min(2).max(200).optional(),
  importerCountry: z
    .string()
    .refine(code => isCountry(code), 'Choose a country from the list.')
    .optional(),
  importerRole: z.enum(Object.keys(ROLES)).optional(),
  separateEntity: z.enum(['YES', 'NO', 'UNKNOWN']).optional(),
  transferFrequency: z.enum(Object.keys(FREQUENCIES)).optional(),

  // How the transfer is made lawful.
  adequacyEligibility: z.enum(['CONFIRMED', 'NOT_CONFIRMED']).optional(),
  safeguardType: z.enum(Object.keys(SAFEGUARDS)).optional(),
  instrumentStatus: z.enum(['EXECUTED', 'DRAFT', 'NOT_PROVIDED']).optional(),
  traStatus: z.enum(['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED']).optional(),
  traReference: optionalText(200),
  supplementaryMeasures: optionalText(500),
  exceptionBasis: optionalText(1000),
  documentReferences: z.array(z.string().trim().min(2).max(200)).max(10).optional(),

  // A legal reviewer's conclusion (step 26, field 12).
  legalReviewNote: z
    .string()
    .trim()
    .min(10, 'Write the legal review conclusion (at least 10 characters).')
    .max(1000)
    .optional(),
});

transfersRouter.post('/:ref/transfers/routes/:key/facts', async (req, res) => {
  const parsed = factsSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: parsed.error.issues[0].message });
  }
  const { reason, legalReviewNote, ...given } = parsed.data;
  if (!Object.keys(given).length && !legalReviewNote) {
    return res.status(400).json({ error: 'validation', message: 'Confirm at least one fact.' });
  }

  // A completed TRA needs its reference; an exception needs its rationale.
  if (given.traStatus === 'COMPLETED' && !given.traReference) {
    return res.status(400).json({ error: 'validation', message: 'Give the reference of the completed TRA.' });
  }
  if (given.safeguardType === 'EXCEPTION' && !given.exceptionBasis) {
    return res.status(400).json({ error: 'validation', message: 'Explain why the exception applies.' });
  }

  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const out = await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);
    const run = db.query.bind(db);

    // Facts can only be given for a route the latest assessment found.
    const latest = await latestRegister(run, assessment.id, true);
    const route = latest && !isLegacy(latest) ? latest.routes.find(r => r.key === req.params.key) : null;
    if (!route)
      return [404, { error: 'not_found', message: 'Route not found. Run the transfer assessment first.' }];

    // The new facts are added to the facts already in force for this route.
    const previous = (
      await run(
        'SELECT version, facts FROM transfer_route_facts WHERE assessment_id = $1 AND route_key = $2 ORDER BY version DESC LIMIT 1',
        [assessment.id, route.key],
      )
    ).rows[0];
    const facts = {
      ...(previous?.facts || {}),
      ...given,
      confirmedBy: req.user.email,
      confirmedAt: new Date().toISOString(),
    };
    if (legalReviewNote) {
      facts.legalReview = {
        status: 'COMPLETED',
        note: legalReviewNote,
        by: req.user.email,
        at: new Date().toISOString(),
      };
    }

    await run(
      `INSERT INTO transfer_route_facts (assessment_id, route_key, version, facts, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [assessment.id, route.key, (previous?.version || 0) + 1, JSON.stringify(facts), reason, req.user.id],
    );

    await audit(req, 'transfers.facts_confirmed', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        route: route.id,
        key: route.key,
        facts: Object.keys(given),
        legalReview: !!legalReviewNote,
        reason,
      },
    });

    // Reassess straight away (step 28 boundary: new facts → new route version).
    const inputs = await gatherInputs(run, assessment);
    if (inputs.blocked) return [409, { error: 'not_ready', message: inputs.blocked }];
    const saved = await saveRegister(db, req, assessment, inputs, {
      reason: `Facts confirmed for ${route.id}: ${reason}`,
    });
    return [201, saved];
  });

  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  res.status(201).json(await transfersState(query, assessment, out[1].version));
});

/* Every saved version of one route. */
transfersRouter.get('/:ref/transfers/routes/:key', async (req, res) => {
  const assessment = await findBuyerAssessment(req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const { rows } = await query(
    `SELECT route_version, register_version, route_id, status, record, route, content_sha256, created_at
       FROM transfer_routes WHERE assessment_id = $1 AND route_key = $2 ORDER BY route_version DESC`,
    [assessment.id, req.params.key],
  );
  const facts = (
    await query(
      `SELECT f.version, f.facts, f.reason, f.created_at, u.email AS created_by
         FROM transfer_route_facts f JOIN users u ON u.id = f.created_by
        WHERE f.assessment_id = $1 AND f.route_key = $2 ORDER BY f.version DESC`,
      [assessment.id, req.params.key],
    )
  ).rows;
  if (!rows.length) return notFound(res, 'Route not found.');

  res.json({
    key: req.params.key,
    versions: rows.map(row => ({
      routeVersion: row.route_version,
      registerVersion: row.register_version,
      routeId: row.route_id,
      status: row.status,
      statusLabel: ROUTE_STATUS[row.status]?.label || row.status,
      record: row.record,
      rationale: row.route.output?.rationale || null,
      contentSha256: row.content_sha256,
      createdAt: row.created_at,
    })),
    facts: facts.map(f => ({
      version: f.version,
      facts: f.facts,
      reason: f.reason,
      createdAt: f.created_at,
      createdBy: f.created_by,
    })),
  });
});

/* ================================================================== */
/*  Shared                                                            */
/* ================================================================== */

export async function transfersState(run, assessment, requestedVersion = null) {
  const { rows: versions } = await run(
    `SELECT t.*, u.email AS created_by_email
       FROM transfer_assessments t JOIN users u ON u.id = t.created_by
      WHERE t.assessment_id = $1 ORDER BY t.version DESC`,
    [assessment.id],
  );
  const shown = requestedVersion ? versions.find(v => v.version === requestedVersion) : versions[0];
  const inputs = await gatherInputs(run, assessment);
  const latest = versions[0];

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
    canRun: !inputs.blocked && (!latest || isLegacy(latest) || !sameInputs(latest.inputs, inputs.versions)),
    versions: versions.map(v => ({
      version: v.version,
      label: v.label || `${v.version}.0`,
      overall: v.overall,
      createdAt: v.created_at,
      createdBy: v.created_by_email,
    })),
    result: shown ? shapeResult(shown) : null,
    latest: shown ? shown.version === latest.version : true,

    // Lists the page uses for labels and the facts form.
    statuses: ROUTE_STATUS,
    outcomes: OUTCOMES,
    roles: ROLES,
    safeguards: SAFEGUARDS,
    instrumentStatuses: INSTRUMENT_STATUS,
    traStatuses: TRA_STATUS,
    frequencies: FREQUENCIES,
  };
}

function shapeResult(row) {
  return {
    id: row.id,
    version: row.version,
    label: row.label || `${row.version}.0`,
    legacy: isLegacy(row),
    inputs: row.inputs,
    rulePackVersion: row.rule_pack_version,
    overall: row.overall,
    totals: row.totals,
    routes: row.routes,
    findings: row.findings,
    questions: row.questions,
    contractTerms: row.contract_terms,
    flowMap: row.flow_map || { nodes: [], edges: [] },
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
    createdBy: row.created_by_email,
    note: TRANSFER_NOTE,
  };
}

/*
 * Runs the assessment and saves the Transfer Assessment Register (step 28). Each route whose
 * fingerprint changed (or is new) is also saved on its own as the next route version.
 */
async function saveRegister(db, req, assessment, inputs, { reason }) {
  const run = db.query.bind(db);
  const latest = await latestRegister(run, assessment.id);
  const version = (latest?.version || 0) + 1;
  const at = new Date().toISOString();

  // The latest saved version of each route, so unchanged routes keep their version.
  const { rows: previous } = await run(
    `SELECT DISTINCT ON (route_key) route_key, route_version, fingerprint
       FROM transfer_routes WHERE assessment_id = $1 ORDER BY route_key, route_version DESC`,
    [assessment.id],
  );
  const previousRoutes = Object.fromEntries(
    previous.map(p => [p.route_key, { version: p.route_version, fingerprint: p.fingerprint }]),
  );

  const result = assessTransfers({ ...inputs.engine, previousRoutes, at });

  const snapshot = {
    reference: assessment.reference,
    version,
    inputs: inputs.versions,
    rulePackVersion: S6_RULE_PACK,
    routes: result.routes.map(route => ({
      key: route.key,
      version: route.routeVersion,
      fingerprint: route.fingerprint,
    })),
  };

  const { rows } = await run(
    `INSERT INTO transfer_assessments
       (assessment_id, version, label, inputs, rule_pack_version, overall, totals, routes, findings, questions,
        contract_terms, flow_map, snapshot_sha256, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id, version, snapshot_sha256`,
    [
      assessment.id,
      version,
      `${version}.0`,
      JSON.stringify(inputs.versions),
      S6_RULE_PACK,
      JSON.stringify(result.overall),
      JSON.stringify(result.totals),
      JSON.stringify(result.routes),
      JSON.stringify(result.findings),
      JSON.stringify(result.questions),
      JSON.stringify(result.contractTerms),
      JSON.stringify(result.flowMap),
      sha256(JSON.stringify(snapshot)),
      req.user.id,
    ],
  );

  // Each new or changed route is saved independently with its evidence and rationale.
  for (const route of result.routes) {
    const known = previousRoutes[route.key];
    if (known && known.version === route.routeVersion) continue;

    await run(
      `INSERT INTO transfer_routes
         (assessment_id, route_key, route_version, register_version, route_id, status, fingerprint, route, record, content_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        assessment.id,
        route.key,
        route.routeVersion,
        version,
        route.id,
        route.status,
        route.fingerprint,
        JSON.stringify(route),
        JSON.stringify(route.record),
        sha256(JSON.stringify(route)),
      ],
    );
  }

  await recordOnTimeline(db, assessment, { version, result, transferId: rows[0].id, reason });

  await audit(req, 'transfers.assessed', {
    db,
    stage: AUDIT_STAGE,
    ref: assessment.reference,
    detail: {
      reference: assessment.reference,
      version: `${version}.0`,
      overall: result.overall.status,
      ...result.totals,
      inputs: inputs.versions,
      rulePackVersion: S6_RULE_PACK,
      snapshotSha256: rows[0].snapshot_sha256,
      reason,
    },
  });

  return rows[0];
}

/*
 * Everything the transfer assessment reads, and the version of each, so we know when it needs
 * running again. Stage 6 follows the diagram order: the selected vendor (Stage 2), the contract
 * (Stage 4) and the obligations (Stage 5) must be there first.
 */
async function gatherInputs(run, assessment) {
  if (!assessment.selected_vendor_id) return { blocked: 'Select a vendor first (Stage 2).' };

  const analysis = (
    await run(
      `SELECT version, clauses FROM contract_analyses
        WHERE assessment_id = $1 AND jsonb_array_length(clauses) > 0 ORDER BY version DESC LIMIT 1`,
      [assessment.id],
    )
  ).rows[0];
  if (!analysis) return { blocked: 'Upload and analyse the contract first (Stage 4).' };

  const register = (
    await run(
      'SELECT version FROM obligation_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1',
      [assessment.id],
    )
  ).rows[0];
  if (!register) return { blocked: 'Extract the obligations first (Stage 5).' };

  const profile = (
    await run(
      'SELECT version, original_submission FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [assessment.id],
    )
  ).rows[0];

  const buyer = (await run('SELECT id, name FROM organisations WHERE id = $1', [assessment.buyer_id]))
    .rows[0];
  const vendor = (
    await run('SELECT id, name, country, delivery_countries FROM organisations WHERE id = $1', [
      assessment.selected_vendor_id,
    ])
  ).rows[0];

  // Stage 3: the vendor's role, its answers (countries, sub-processors, transfer mechanism) and the control results.
  const compliance = (
    await run(
      `SELECT c.processing_role, r.version, r.answers, r.result
         FROM compliance_assessments c
         LEFT JOIN LATERAL (SELECT version, answers, result FROM compliance_results WHERE compliance_id = c.id ORDER BY version DESC LIMIT 1) r ON true
        WHERE c.assessment_id = $1`,
      [assessment.id],
    )
  ).rows[0];

  // The current version of each contract document (DOC-001 …).
  const documents = (
    await run(
      `SELECT DISTINCT ON (document_no) document_no, document_type, title, file_name, execution_status
         FROM contract_documents WHERE assessment_id = $1 ORDER BY document_no, version DESC`,
      [assessment.id],
    )
  ).rows.map(d => ({
    documentNo: `DOC-${String(d.document_no || 1).padStart(3, '0')}`,
    type: d.document_type,
    title: d.title || d.file_name,
    executionStatus: d.execution_status,
  }));

  // The facts in force for each route.
  const factRows = (
    await run(
      `SELECT DISTINCT ON (route_key) route_key, version, facts
         FROM transfer_route_facts WHERE assessment_id = $1 ORDER BY route_key, version DESC`,
      [assessment.id],
    )
  ).rows;
  const factsCount = (
    await run('SELECT count(*)::int AS n FROM transfer_route_facts WHERE assessment_id = $1', [assessment.id])
  ).rows[0].n;

  const requirement = profile?.original_submission || {};

  return {
    blocked: null,
    engine: {
      requirement,
      buyer: { id: buyer.id, name: buyer.name, country: requirement.buyerCountry || 'GB' },
      vendor: {
        id: vendor.id,
        name: vendor.name,
        country: vendor.country,
        deliveryCountries: vendor.delivery_countries || [],
      },
      processingRole: compliance?.processing_role || null,
      stage3: { answers: compliance?.answers || {}, results: compliance?.result?.results || [] },
      contract: { clauses: analysis.clauses, documents },
      facts: Object.fromEntries(factRows.map(f => [f.route_key, f.facts])),
    },
    versions: {
      requirement: profile?.version || null,
      selection: assessment.selection_version,
      compliance: compliance?.version || 0,
      contract: analysis.version,
      obligations: register.version,
      facts: factsCount,
    },
  };
}

function sameInputs(a = {}, b = {}) {
  return ['requirement', 'selection', 'compliance', 'contract', 'obligations', 'facts'].every(
    key => (a[key] ?? 0) === (b[key] ?? 0),
  );
}

async function latestRegister(run, assessmentId, withRoutes = false) {
  const { rows } = await run(
    `SELECT version, inputs, rule_pack_version${withRoutes ? ', routes' : ''}
       FROM transfer_assessments WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1`,
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

async function recordOnTimeline(db, assessment, { version, result, transferId, reason }) {
  const addEvent = (step, title, detail = {}) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
       VALUES ($1, 'event', 6, $2, $3, 'done', now(), $4)`,
      [assessment.id, step, title, JSON.stringify(detail)],
    );

  const { totals } = result;
  await addEvent(25, `Data flows mapped: ${plural(totals.routes, 'route')} between legal entities`, {
    version,
  });
  await addEvent(
    26,
    `Recipients, roles and safeguards checked: ${totals.restricted} restricted, ${totals.informationRequired} need information, ${totals.legalReviewRequired} need legal review`,
    { version, overall: result.overall.status },
  );
  await addEvent(
    27,
    `Transfer findings (${result.findings.length}) and questions (${totals.questions}) shared with the buyer`,
    { version },
  );
  await addEvent(
    28,
    `Transfer Assessment Register v${version}.0 saved${totals.changedRoutes ? ` (${plural(totals.changedRoutes, 'route')} reassessed)` : ''}${reason ? ' after new route facts' : ''}`,
    { version, transferId },
  );

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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function notFound(res, message) {
  return res.status(404).json({ error: 'not_found', message });
}
