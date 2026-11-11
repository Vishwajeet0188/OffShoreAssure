/*
 * Stage 4 – Contract analysis (client specification "Input / Output Stage 4, 5, 6", steps 17–20).
 *
 *   GET  /api/assessments/:ref/contract                 the contract set, the latest analysis and its history
 *   GET  /api/assessments/:ref/contract?version=2       an earlier analysis
 *   POST /api/assessments/:ref/contract?name=…&…        step 17: upload one document (raw file body, 11 fields
 *                                                       in the query string); steps 18–19 run straight away
 *   POST /api/assessments/:ref/contract/review          a reviewer's correction (saved as a new analysis version)
 *   GET  /api/assessments/:ref/contract/file/:id        download an original file
 *
 * A contract set can hold several documents (MSA, DPA, SLA, schedules). "replaces=DOC-001" uploads a new
 * version of an existing document; without it the file is a new document in the set.
 * The clause rules live in engine/clauses.js (RP-2026.11-S4).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import express, { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { saveFile, readFile } from '../storage.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { COUNTRIES, isCountry } from '../reference/countries.js';
import { scanFile } from '../compliance/evidenceChecks.js';
import {
  ANALYSIS_NOTE,
  S4_RULE_PACK,
  EXTRACTION_MODEL_VERSION,
  CATEGORIES,
  DOCUMENT_TYPES,
  EXECUTION_STATUSES,
  SUPPORTED_LANGUAGES,
  FINDING_STATUSES,
  REVIEW_STATUSES,
  TOPICS,
  readDocument,
  reviewContext,
  analyseSet,
} from '../engine/clauses.js';
import { extractContractText, MAX_CONTRACT_BYTES, UnreadableContractError } from './extract.js';

const AUDIT_STAGE = 'stage-4';
const FORMATS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const UK_LAWS = [
  ['GB-EAW', 'England and Wales'],
  ['GB-SCT', 'Scotland'],
  ['GB-NIR', 'Northern Ireland'],
];
const DOC_TYPE_LABELS = {
  MSA: 'Master services agreement (MSA)',
  SOW: 'Statement of work (SOW)',
  SLA: 'Service level agreement (SLA)',
  DPA: 'Data processing agreement (DPA)',
  NDA: 'Non-disclosure agreement (NDA)',
  SCC: 'Transfer instrument (SCC / IDTA / Addendum)',
  OTHER: 'Other (e.g. security or subprocessor schedule)',
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const languageName = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const lawName = code =>
  UK_LAWS.find(([c]) => c === code)?.[1] || COUNTRIES.find(c => c.code === code)?.name || code;
const docNo = n => `DOC-${String(n).padStart(3, '0')}`;
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const day = v => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const notFound = (res, message) => res.status(404).json({ error: 'not_found', message });

export const contractRouter = Router();
contractRouter.use('/:ref/contract', requireRole('buyer'), requireActiveMembership);

/* ---------- Reading ---------- */

contractRouter.get('/:ref/contract', async (req, res) => {
  const assessment = await findBuyerAssessment(query, req);
  if (!assessment) return notFound(res, 'Assessment not found.');
  const version = req.query.version ? Number(req.query.version) : null;
  res.json(await contractState(query, assessment, version));
});

contractRouter.get('/:ref/contract/file/:id', async (req, res) => {
  const assessment = await findBuyerAssessment(query, req);
  if (!assessment || !/^[0-9a-f-]{36}$/i.test(req.params.id)) return notFound(res, 'Contract not found.');
  const { rows } = await query('SELECT * FROM contract_documents WHERE assessment_id = $1 AND id = $2', [
    assessment.id,
    req.params.id,
  ]);
  const contract = rows[0];
  if (!contract) return notFound(res, 'Contract not found.');
  res.set('Content-Type', contract.mime_type);
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(contract.file_name)}"`);
  res.send(await readFile(contract.storage_key, contract.encrypted));
});

/* ---------- Step 17: upload, then steps 18–19 ---------- */

const rawFile = express.raw({ type: () => true, limit: MAX_CONTRACT_BYTES + 1 });

/* Checks the 11 input fields. Returns { meta } or { error, field }. */
function readMeta(req, assessment) {
  const q = k => String(req.query[k] ?? '').trim();
  const fail = (field, error) => ({ field, error });
  const fileName = q('name')
    .replace(/[\\/\0]/g, '_')
    .slice(0, 200);
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  const meta = {
    fileName,
    extension,
    assessmentId: q('assessmentId'),
    documentType: q('documentType').toUpperCase(),
    title: q('title'),
    buyerEntity: q('buyerEntity'),
    supplierEntity: q('supplierEntity'),
    governingLaw: q('governingLaw'),
    effectiveOn: q('effectiveOn') || null,
    expiresOn: q('expiresOn') || null,
    expiryExplanation: q('expiryExplanation').slice(0, 500) || null,
    executionStatus: q('executionStatus').toUpperCase(),
    language: q('language').toLowerCase(),
    replaces: q('replaces').toUpperCase() || null,
    reason: q('reason').slice(0, 500),
  };
  if (meta.assessmentId !== assessment.id)
    return fail('assessmentId', 'The assessment ID does not match this assessment.');
  if (!DOCUMENT_TYPES.includes(meta.documentType)) return fail('documentType', 'Choose the document type.');
  if (!meta.title) return fail('title', 'Enter the contract title.');
  if (meta.title.length > 200) return fail('title', 'The contract title can be up to 200 characters.');
  if (meta.buyerEntity !== assessment.buyer_id)
    return fail('buyerEntity', 'Party A must be your organisation as registered on OffshoreAssure.');
  if (meta.supplierEntity !== assessment.selected_vendor_id)
    return fail('supplierEntity', 'Party B must be the vendor selected for this assessment.');
  if (!UK_LAWS.some(([c]) => c === meta.governingLaw) && !isCountry(meta.governingLaw))
    return fail('governingLaw', 'Choose the governing law.');
  if (!EXECUTION_STATUSES.includes(meta.executionStatus))
    return fail('executionStatus', 'Choose the execution status.');
  for (const k of ['effectiveOn', 'expiresOn'])
    if (meta[k] && (!DATE.test(meta[k]) || isNaN(new Date(meta[k])))) return fail(k, 'Enter a valid date.');
  if (meta.executionStatus !== 'DRAFT' && !meta.effectiveOn)
    return fail('effectiveOn', 'A signed, expired or terminated contract needs its effective date.');
  if (meta.executionStatus === 'EXPIRED' && !meta.expiresOn)
    return fail('expiresOn', 'An expired contract needs its expiry date.');
  if (meta.effectiveOn && meta.expiresOn && meta.expiresOn <= meta.effectiveOn && !meta.expiryExplanation)
    return fail(
      'expiryExplanation',
      'The expiry date is not after the effective date. Explain why, or correct the dates.',
    );
  if (!/^[a-z]{2}$/.test(meta.language) || !languageName.of(meta.language))
    return fail('language', 'Choose the language of the contract.');
  if (!fileName || !FORMATS[extension])
    return fail('file', 'Upload the contract as a PDF or Word (.docx) file.');
  if (meta.replaces && !/^DOC-\d{3}$/.test(meta.replaces))
    return fail('replaces', 'Choose the document this replaces.');
  if (meta.replaces && meta.reason.length < 10)
    return fail(
      'reason',
      'Say why you are uploading a new version (at least 10 characters), for example "Signed copy received".',
    );
  return { meta };
}

contractRouter.post('/:ref/contract', rawFile, async (req, res) => {
  const assessment = await findBuyerAssessment(query, req);
  if (!assessment) return notFound(res, 'Assessment not found.');
  const reasonNotReady = await whyNotReady(query, assessment);
  if (reasonNotReady) return res.status(409).json({ error: 'not_ready', message: reasonNotReady });

  const { meta, error, field } = readMeta(req, assessment);
  if (error)
    return res
      .status(400)
      .json({ error: field === 'file' ? 'file_rejected' : 'validation', message: error, field });
  const file = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!file.length)
    return res.status(400).json({ error: 'file_rejected', message: 'The file is empty.', field: 'file' });
  if (file.length > MAX_CONTRACT_BYTES)
    return res
      .status(400)
      .json({ error: 'file_rejected', message: 'The file is larger than 15 MB.', field: 'file' });
  const blocked = scanFile(file, meta.extension);
  if (blocked) {
    await audit(req, 'contract.file_blocked', {
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: { reference: assessment.reference, fileName: meta.fileName, reason: blocked },
    });
    return res.status(400).json({ error: 'file_blocked', message: blocked, field: 'file' });
  }

  // Which document this is: a new one in the set, or a new version of one already there.
  const docs = (
    await query(
      'SELECT document_no, max(version) AS version FROM contract_documents WHERE assessment_id = $1 GROUP BY document_no',
      [assessment.id],
    )
  ).rows;
  let documentNumber, version;
  if (meta.replaces) {
    documentNumber = Number(meta.replaces.slice(4));
    const existing = docs.find(d => d.document_no === documentNumber);
    if (!existing)
      return res
        .status(400)
        .json({
          error: 'validation',
          message: `${meta.replaces} is not in this contract set.`,
          field: 'replaces',
        });
    version = existing.version + 1;
  } else {
    documentNumber = Math.max(0, ...docs.map(d => d.document_no)) + 1;
    version = 1;
  }

  // Step 18: extract the text and read the clauses. Unreadable files and other languages are kept for manual review.
  const contractId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  let pages = [],
    extractionStatus = 'EXTRACTED',
    extractionNote = null,
    pageCount = 0,
    wordCount = 0;
  try {
    const extracted = await extractContractText(file, meta.extension);
    pages = extracted.pages;
    pageCount = extracted.pageCount;
    wordCount = extracted.wordCount;
  } catch (e) {
    if (!(e instanceof UnreadableContractError)) throw e;
    extractionStatus = 'UNREADABLE';
    extractionNote = e.message + ' Upload a readable copy, or review the document by hand.';
  }
  if (extractionStatus === 'EXTRACTED' && !SUPPORTED_LANGUAGES.includes(meta.language)) {
    extractionStatus = 'LANGUAGE';
    extractionNote = `Clause extraction supports English only; this ${languageName.of(meta.language)} document needs manual review.`;
  }
  const text = pages.join('\n');
  const read =
    extractionStatus === 'EXTRACTED'
      ? readDocument(pages, {
          documentId: contractId,
          documentNo: docNo(documentNumber),
          version,
          buyerName: assessment.buyer_name,
          vendorName: assessment.vendor_name,
        })
      : { clauses: [], paragraphs: false };
  const core = name =>
    String(name || '')
      .replace(/\b(ltd|limited|plc|llp|llc|inc|pvt|private|sp\. z o\.o\.|gmbh)\b\.?/gi, '')
      .trim()
      .toLowerCase();
  const partiesMissing =
    extractionStatus === 'EXTRACTED'
      ? [
          [assessment.buyer_name, 'Party A'],
          [assessment.vendor_name, 'Party B'],
        ]
          .filter(([n]) => core(n).length > 2 && !text.toLowerCase().includes(core(n)))
          .map(([n, label]) => `${label} (${n})`)
      : [];

  // Step 19: save the original file and the extracted text (both encrypted), then the analysis of the set.
  const storageKey = path.join('contracts', assessment.id, contractId);
  await saveFile(storageKey, file);
  const textKey = text ? storageKey + '.txt' : null;
  if (textKey) await saveFile(textKey, Buffer.from(text, 'utf8'));

  const out = await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);
    await db.query(
      `INSERT INTO contract_documents
         (id, assessment_id, vendor_id, version, document_no, label, change_reason, file_name, mime_type, size_bytes, sha256, storage_key,
          page_count, word_count, uploaded_by, document_type, title, buyer_entity_id, governing_law, effective_on, expires_on, expiry_explanation,
          execution_status, language, extraction_status, extraction_note, extraction_job_id, text_storage_key, text_sha256, extraction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
      [
        contractId,
        assessment.id,
        assessment.selected_vendor_id,
        version,
        documentNumber,
        meta.title,
        meta.reason || null,
        meta.fileName,
        FORMATS[meta.extension],
        file.length,
        sha256(file),
        storageKey,
        pageCount,
        wordCount,
        req.user.id,
        meta.documentType,
        meta.title,
        meta.buyerEntity,
        meta.governingLaw,
        meta.effectiveOn,
        meta.expiresOn,
        meta.expiryExplanation,
        meta.executionStatus,
        meta.language,
        extractionStatus,
        extractionNote,
        jobId,
        textKey,
        text ? sha256(text) : null,
        JSON.stringify({ clauses: read.clauses, paragraphs: read.paragraphs, partiesMissing }),
      ],
    );
    const previous = await latestAnalysisRow(db, assessment.id);
    const analysis = await saveAnalysis(db, assessment, {
      contractId,
      jobId,
      trigger: 'upload',
      corrections: previous?.corrections || [],
      userId: req.user.id,
      textSha256: text ? sha256(text) : sha256(file),
    });
    const t = analysis.totals;
    const label = `${docNo(documentNumber)} v${version}`;
    const ev = (step, title, detail = {}) =>
      db.query(
        `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',4,$2,$3,'done',now(),$4)`,
        [assessment.id, step, title, JSON.stringify({ document: label, ...detail })],
      );
    await ev(
      17,
      `Contract uploaded: ${label} · ${meta.documentType} “${meta.title}” (${meta.executionStatus.toLowerCase()})`,
    );
    await ev(
      18,
      extractionStatus === 'EXTRACTED'
        ? `Text extracted: ${read.clauses.length} clauses; findings ${t.found} found, ${t.partial} partial, ${t.missing} missing, ${t.humanReview} for human review`
        : `${label} needs manual review: ${extractionNote}`,
      t,
    );
    await ev(19, `Contract Source Record and extraction saved (analysis v${analysis.version})`, {
      version: analysis.version,
    });
    await ev(20, 'Contract analysis and clause list shared with the buyer', { version: analysis.version });
    if (analysis.version === 1) {
      await db.query(
        `DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 4 AND step IS NULL AND kind = 'milestone'`,
        [assessment.id],
      );
      await db.query(
        `UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 5 AND step IS NULL AND status = 'pending'`,
        [assessment.id],
      );
    }
    await audit(req, meta.replaces ? 'contract.version_uploaded' : 'contract.uploaded', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        document: label,
        documentType: meta.documentType,
        title: meta.title,
        executionStatus: meta.executionStatus,
        fileName: meta.fileName,
        sha256: sha256(file),
        extractionStatus,
        changeReason: meta.reason || null,
      },
    });
    await audit(req, 'contract.analysed', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        version: analysis.version,
        status: analysis.status,
        ...t,
        rulePackVersion: S4_RULE_PACK,
      },
    });
    return analysis;
  });

  // Step 20: the analysis goes back to the buyer. Output: document ID, version and analysis status.
  const state = await contractState(query, assessment, out.version);
  res.status(201).json({
    ...state,
    upload: {
      documentId: docNo(documentNumber),
      id: contractId,
      version,
      extractionStatus,
      analysisStatus: out.status,
      analysisVersion: out.version,
    },
  });
});

contractRouter.use((error, _req, res, next) => {
  if (error.type === 'entity.too.large')
    return res
      .status(400)
      .json({ error: 'file_rejected', message: 'The file is larger than 15 MB.', field: 'file' });
  next(error);
});

/* ---------- Reviewer corrections (step 19 boundary: attributed, never change the original) ---------- */

const reviewSchema = z.object({
  action: z.enum(['VERIFY', 'RECATEGORISE', 'SET_PARTY', 'SET_FINDING']),
  clauseKey: z.string().max(80).optional(),
  categoryId: z.string().max(10).optional().nullable(),
  status: z.enum(Object.keys(FINDING_STATUSES)).optional(),
  party: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

contractRouter.post('/:ref/contract/review', async (req, res) => {
  const p = reviewSchema.safeParse(req.body || {});
  if (!p.success)
    return res.status(400).json({ error: 'validation', message: 'The correction is not valid.' });
  const k = p.data;
  const category = id => CATEGORIES.some(c => c.id === id);
  if (k.action !== 'SET_FINDING' && !k.clauseKey)
    return res.status(400).json({ error: 'validation', message: 'Choose a clause.' });
  if (k.action === 'RECATEGORISE' && k.categoryId && !category(k.categoryId))
    return res.status(400).json({ error: 'validation', message: 'Choose a clause category.' });
  if (k.action === 'SET_PARTY' && !k.party)
    return res.status(400).json({ error: 'validation', message: 'Enter the responsible party.' });
  if (k.action === 'SET_FINDING' && (!category(k.categoryId) || !k.status))
    return res.status(400).json({ error: 'validation', message: 'Choose the category and its status.' });
  if (['RECATEGORISE', 'SET_FINDING'].includes(k.action) && (k.note || '').length < 3)
    return res
      .status(400)
      .json({ error: 'validation', message: 'Say why (a short note is kept with the correction).' });

  const assessment = await findBuyerAssessment(query, req);
  if (!assessment) return notFound(res, 'Assessment not found.');
  const out = await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [assessment.id]);
    const previous = await latestAnalysisRow(db, assessment.id);
    if (!previous || previous.findings == null)
      return [
        409,
        {
          error: 'not_ready',
          message: 'Upload the contract first (or upload it again: this analysis used the earlier rules).',
        },
      ];
    if (k.clauseKey && !previous.clauses.some(c => c.key === k.clauseKey))
      return [404, { error: 'not_found', message: 'Clause not found in the current analysis.' }];
    const who = (await db.query('SELECT email FROM users WHERE id = $1', [req.user.id])).rows[0].email;
    const correction = {
      action: k.action,
      clauseKey: k.clauseKey || null,
      categoryId: k.categoryId ?? null,
      status: k.status || null,
      party: k.party || null,
      note: k.note || null,
      by: who,
      byId: req.user.id,
      at: new Date().toISOString(),
    };
    const analysis = await saveAnalysis(db, assessment, {
      contractId: previous.contract_id,
      jobId: previous.extraction_job_id,
      trigger: 'review',
      corrections: [...(previous.corrections || []), correction],
      userId: req.user.id,
      textSha256: previous.text_sha256,
    });
    const clause = previous.clauses.find(c => c.key === k.clauseKey);
    const what =
      k.action === 'VERIFY'
        ? `${clause.id} verified`
        : k.action === 'RECATEGORISE'
          ? `${clause.id} moved to ${k.categoryId || 'no category'}`
          : k.action === 'SET_PARTY'
            ? `${clause.id} responsible party set to ${k.party}`
            : `${k.categoryId} set to ${FINDING_STATUSES[k.status].toLowerCase()}`;
    await db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',4,19,$2,'done',now(),$3)`,
      [
        assessment.id,
        `Reviewer correction by ${who}: ${what} (analysis v${analysis.version})`,
        JSON.stringify({ version: analysis.version }),
      ],
    );
    await audit(req, 'contract.corrected', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: { reference: assessment.reference, version: analysis.version, ...correction },
    });
    return [201, analysis];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  res.status(201).json(await contractState(query, assessment, out[1].version));
});

/* ---------- Helpers ---------- */

async function findBuyerAssessment(run, req) {
  const buyerId = await buyerOrganisation({ query: run }, req.user.id);
  if (!buyerId) return null;
  const { rows } = await run(
    `SELECT a.*, r.title, r.data, o.name AS buyer_name, v.name AS vendor_name
       FROM assessments a
       JOIN requirements r ON r.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.reference = $1 AND a.buyer_id = $2`,
    [req.params.ref, buyerId],
  );
  return rows[0] || null;
}

/* The contract can be analysed once a vendor is selected (Stage 2) and has submitted Stage 3. */
async function whyNotReady(run, assessment) {
  if (!assessment.selected_vendor_id) return 'Select a vendor first (Stage 2).';
  const { rows } = await run('SELECT status FROM compliance_assessments WHERE assessment_id = $1', [
    assessment.id,
  ]);
  if (!rows[0]) return 'Start the compliance assessment first (Stage 3).';
  // A clarification under way still has a saved result, so Stage 4 can go ahead.
  if (!['submitted', 'clarification'].includes(rows[0].status))
    return 'The vendor has not submitted its compliance answers yet (Stage 3).';
  return null;
}

const latestAnalysisRow = async (db, assessmentId) =>
  (
    await db.query('SELECT * FROM contract_analyses WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [
      assessmentId,
    ])
  ).rows[0] || null;

/* The latest version of each document in the set. */
async function currentDocuments(db, assessmentId) {
  return (
    await db.query(
      `SELECT DISTINCT ON (document_no) * FROM contract_documents WHERE assessment_id = $1 ORDER BY document_no, version DESC`,
      [assessmentId],
    )
  ).rows;
}

/* What the checks need from Stage 1 and Stage 3. */
async function reviewInputs(db, assessment) {
  const p = (
    await db.query(
      'SELECT original_submission, control_ids FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [assessment.id],
    )
  ).rows[0];
  const c = (
    await db.query('SELECT processing_role FROM compliance_assessments WHERE assessment_id = $1', [
      assessment.id,
    ])
  ).rows[0];
  const controls = p?.control_ids || [];
  return reviewContext({
    data: p?.original_submission || assessment.data || {},
    controls,
    processingRole: c?.processing_role || null,
    transferReview: controls.includes('ASS-005'),
  });
}

/* Builds and saves the analysis of the current contract set as the next version (locked). */
async function saveAnalysis(db, assessment, { contractId, jobId, trigger, corrections, userId, textSha256 }) {
  const docs = await currentDocuments(db, assessment.id);
  const x = await reviewInputs(db, assessment);
  const documents = docs.map(d => ({
    documentNo: docNo(d.document_no),
    title: d.title || d.file_name,
    executionStatus: d.execution_status,
    extractionStatus: d.extraction_status || 'EXTRACTED',
    clauses: d.extraction?.clauses || [],
    paragraphs: !!d.extraction?.paragraphs,
    partiesMissing: d.extraction?.partiesMissing || [],
  }));
  const keys = new Set(documents.flatMap(d => d.clauses.map(c => c.key)));
  const kept = corrections.filter(k => !k.clauseKey || keys.has(k.clauseKey)); // a replaced document starts fresh
  const a = analyseSet(documents, x, { corrections: kept });
  const version = ((await latestAnalysisRow(db, assessment.id))?.version || 0) + 1;
  const snapshot = {
    version,
    documents: docs.map(d => ({
      id: d.id,
      document: docNo(d.document_no),
      version: d.version,
      sha256: d.sha256,
    })),
    rulePackVersion: S4_RULE_PACK,
    clauses: a.clauses,
    findings: a.findings,
    corrections: kept,
  };
  await db.query(
    `INSERT INTO contract_analyses
       (contract_id, assessment_id, rule_pack_version, totals, clauses, topics, not_found, text_sha256, snapshot_sha256,
        version, status, trigger, document_ids, findings, preliminary, quality, corrections, extraction_job_id, extraction_model_version, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      contractId,
      assessment.id,
      S4_RULE_PACK,
      JSON.stringify(a.totals),
      JSON.stringify(a.clauses),
      JSON.stringify(a.topics),
      JSON.stringify(a.notFound),
      textSha256,
      sha256(JSON.stringify(snapshot)),
      version,
      a.status,
      trigger,
      JSON.stringify(docs.map(d => d.id)),
      JSON.stringify(a.findings),
      JSON.stringify(a.preliminary),
      JSON.stringify(a.quality),
      JSON.stringify(kept),
      jobId,
      EXTRACTION_MODEL_VERSION,
      userId,
    ],
  );
  return { version, status: a.status, totals: a.totals };
}

export async function contractState(run, assessment, requestedVersion = null) {
  const db = { query: run.query ? run.query.bind(run) : run };
  const q = (sql, p) => db.query(sql, p);
  const { rows: documents } = await q(
    `SELECT d.*, u.email AS uploaded_by_email FROM contract_documents d JOIN users u ON u.id = d.uploaded_by
      WHERE d.assessment_id = $1 ORDER BY d.document_no, d.version DESC`,
    [assessment.id],
  );
  const { rows: analyses } = await q(
    `SELECT ca.version, ca.trigger, ca.status, ca.created_at, ca.rule_pack_version, ca.totals, u.email AS by_email
       FROM contract_analyses ca LEFT JOIN users u ON u.id = ca.created_by WHERE ca.assessment_id = $1 ORDER BY ca.version DESC`,
    [assessment.id],
  );
  const shownVersion =
    requestedVersion && analyses.some(a => a.version === requestedVersion)
      ? requestedVersion
      : analyses[0]?.version;
  const row = shownVersion
    ? (
        await q('SELECT * FROM contract_analyses WHERE assessment_id = $1 AND version = $2', [
          assessment.id,
          shownVersion,
        ])
      ).rows[0]
    : null;
  const latest = {};
  for (const d of documents) if (!latest[d.document_no]) latest[d.document_no] = d.id;
  const x = await reviewInputs(db, assessment);
  return {
    assessment: {
      id: assessment.id,
      reference: assessment.reference,
      title: assessment.title,
      buyerName: assessment.buyer_name,
    },
    vendor: assessment.selected_vendor_id
      ? { id: assessment.selected_vendor_id, name: assessment.vendor_name }
      : null,
    blocked: await whyNotReady(q, assessment),
    form: {
      defaults: {
        assessmentId: assessment.id,
        buyerEntity: assessment.buyer_id,
        buyerName: assessment.buyer_name,
        supplierEntity: assessment.selected_vendor_id,
        supplierName: assessment.vendor_name,
        governingLaw: 'GB-EAW',
        language: 'en',
        executionStatus: 'SIGNED',
        documentType: 'MSA',
      },
      documentTypes: DOCUMENT_TYPES.map(t => ({ code: t, label: DOC_TYPE_LABELS[t] })),
      executionStatuses: EXECUTION_STATUSES,
      governingLaws: [
        ...UK_LAWS.map(([code, name]) => ({ code, name })),
        ...COUNTRIES.filter(c => c.code !== 'GB'),
      ],
      languages: ['en', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'pt', 'hi', 'zh', 'ja', 'ar'].map(code => ({
        code,
        name: languageName.of(code),
        supported: SUPPORTED_LANGUAGES.includes(code),
      })),
    },
    relationship: {
      processor: x.processorRelationship,
      transferReview: x.transferReview,
      text: x.processorRelationship
        ? 'Controller–processor relationship: the Article 28 processing terms are checked as legal requirements.'
        : 'No controller–processor relationship: Article 28 terms are not treated as legal requirements.',
    },
    documents: documents.map(d => shapeDocument(d, latest[d.document_no] === d.id)),
    versions: analyses.map(a => ({
      version: a.version,
      trigger: a.trigger,
      status: a.status,
      by: a.by_email,
      createdAt: a.created_at,
      rulePackVersion: a.rule_pack_version,
      totals: a.totals,
    })),
    shownVersion: shownVersion || null,
    analysis: row ? shapeAnalysis(row) : null,
    categories: CATEGORIES.map(({ id, name, check, group }) => ({ id, name, check, group })),
    findingStatuses: FINDING_STATUSES,
    reviewStatuses: REVIEW_STATUSES,
    rules: { formats: Object.keys(FORMATS), maxBytes: MAX_CONTRACT_BYTES, rulePackVersion: S4_RULE_PACK },
  };
}

function shapeDocument(row, current) {
  return {
    id: row.id,
    documentId: docNo(row.document_no),
    version: row.version,
    current,
    documentType: row.document_type || 'OTHER',
    title: row.title || row.label || row.file_name,
    governingLaw: row.governing_law ? { code: row.governing_law, name: lawName(row.governing_law) } : null,
    effectiveOn: day(row.effective_on),
    expiresOn: day(row.expires_on),
    expiryExplanation: row.expiry_explanation,
    executionStatus: row.execution_status || null,
    executed: row.execution_status ? row.execution_status !== 'DRAFT' : null,
    language: row.language ? { code: row.language, name: languageName.of(row.language) } : null,
    changeReason: row.change_reason,
    fileName: row.file_name,
    size: row.size_bytes,
    sha256: row.sha256,
    pages: row.page_count,
    words: row.word_count,
    extractionStatus: row.extraction_status || 'EXTRACTED',
    extractionNote: row.extraction_note,
    extractionJobId: row.extraction_job_id,
    textSha256: row.text_sha256,
    clauses: row.extraction?.clauses?.length ?? null,
    uploadedBy: row.uploaded_by_email,
    uploadedAt: row.uploaded_at,
  };
}

/* Analyses saved before the specification only have topics: they are shown as found / missing per topic. */
function shapeAnalysis(row) {
  const legacy = row.findings == null;
  return {
    id: row.id,
    version: row.version,
    legacy,
    status: row.status || 'ANALYSED',
    trigger: row.trigger,
    rulePackVersion: row.rule_pack_version,
    extractionModelVersion: row.extraction_model_version,
    extractionJobId: row.extraction_job_id,
    totals: row.totals,
    clauses: row.clauses,
    findings: legacy
      ? row.topics.map(t => ({
          categoryId: t.id,
          name: t.name,
          status: t.status === 'FOUND' ? 'FOUND' : t.expected ? 'MISSING' : 'NOT_APPLICABLE',
          clauseIds: t.clauseIds,
          sourceRef: (t.clauseNumbers || []).map(n => '§' + n).join('; ') || null,
          explanation:
            t.status === 'FOUND' ? 'Topic found (earlier rules).' : 'Topic not found (earlier rules).',
          rule: '—',
          confidence: null,
          recommendedAction:
            t.status === 'FOUND' ? 'None.' : 'Upload the contract again to check it with the current rules.',
        }))
      : row.findings,
    preliminary: row.preliminary || [],
    quality: row.quality || { ok: true, reasons: [] },
    corrections: row.corrections || [],
    topics: row.topics,
    notFound: row.not_found,
    note: ANALYSIS_NOTE,
    textSha256: row.text_sha256,
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
  };
}

export { TOPICS };
