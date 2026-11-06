/*
 * Stage 4 – Contract analysis (sequence diagram steps 17–20).
 *
 *   GET  /api/assessments/:ref/contract                  contract versions and the latest analysis
 *   GET  /api/assessments/:ref/contract?version=2        a specific version
 *   POST /api/assessments/:ref/contract?name=…           step 17: upload the contract (raw file body)
 *                                                        steps 18–19 run straight away
 *   GET  /api/assessments/:ref/contract/:version/file    download the original file
 *
 * The clause rules live in engine/clauses.js (provisional, RP-2026.10-S4-draft).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import express, { Router } from 'express';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { saveFile, readFile } from '../storage.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { analyseContract, ANALYSIS_NOTE, S4_RULE_PACK, TOPICS } from '../engine/clauses.js';
import {
  extractContractText,
  CONTRACT_FORMATS,
  MAX_CONTRACT_BYTES,
  UnreadableContractError,
} from './extract.js';

const AUDIT_STAGE = 'stage-4';

export const contractRouter = Router();
contractRouter.use('/:ref/contract', requireRole('buyer'), requireActiveMembership);

/* ---------- Reading ---------- */

contractRouter.get('/:ref/contract', async (req, res) => {
  const assessment = await findBuyerAssessment(query, req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const requestedVersion = req.query.version ? Number(req.query.version) : null;
  res.json(await contractState(query, assessment, requestedVersion));
});

contractRouter.get('/:ref/contract/:version/file', async (req, res) => {
  const assessment = await findBuyerAssessment(query, req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const { rows } = await query('SELECT * FROM contract_documents WHERE assessment_id = $1 AND version = $2', [
    assessment.id,
    Number(req.params.version) || 0,
  ]);
  const contract = rows[0];
  if (!contract) return notFound(res, 'Contract not found.');

  res.set('Content-Type', contract.mime_type);
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(contract.file_name)}"`);
  res.send(await readFile(contract.storage_key, contract.encrypted));
});

/* ---------- Step 17: upload, then steps 18–19 ---------- */

const rawFile = express.raw({ type: () => true, limit: MAX_CONTRACT_BYTES + 1 });

contractRouter.post('/:ref/contract', rawFile, async (req, res) => {
  const assessment = await findBuyerAssessment(query, req);
  if (!assessment) return notFound(res, 'Assessment not found.');

  const reasonNotReady = await whyNotReady(query, assessment);
  if (reasonNotReady) return res.status(409).json({ error: 'not_ready', message: reasonNotReady });

  const upload = readUpload(req);
  if (upload.error) return res.status(400).json({ error: 'file_rejected', message: upload.error });

  const previous = await latestContract(query, assessment.id);
  if (previous && upload.changeReason.length < 10) {
    return res.status(400).json({
      error: 'reason_required',
      message:
        'Say why you are uploading a new version (at least 10 characters), for example "Signed copy received".',
    });
  }

  // Step 18: extract the text and identify the clauses.
  let extracted;
  try {
    extracted = await extractContractText(upload.file, upload.extension);
  } catch (error) {
    if (error instanceof UnreadableContractError) {
      return res.status(422).json({ error: 'unreadable', message: error.message });
    }
    throw error;
  }

  const applicableControls = await controlsForAssessment(query, assessment.id);
  const analysis = analyseContract(extracted.pages, { applicableControls });

  // Step 19: save the original file (encrypted) and the analysis.
  const contractId = crypto.randomUUID();
  const storageKey = path.join('contracts', assessment.id, contractId);
  await saveFile(storageKey, upload.file);

  const version = (previous?.version || 0) + 1;
  const fileSha256 = sha256(upload.file);
  const textSha256 = sha256(extracted.pages.join('\n'));

  await tx(async db => {
    await db.query(
      `INSERT INTO contract_documents
         (id, assessment_id, vendor_id, version, label, change_reason, file_name, mime_type, size_bytes,
          sha256, storage_key, page_count, word_count, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        contractId,
        assessment.id,
        assessment.selected_vendor_id,
        version,
        upload.label || null,
        upload.changeReason || null,
        upload.fileName,
        CONTRACT_FORMATS[upload.extension],
        upload.file.length,
        fileSha256,
        storageKey,
        extracted.pageCount,
        extracted.wordCount,
        req.user.id,
      ],
    );

    const snapshot = {
      contractId,
      version,
      fileSha256,
      textSha256,
      rulePackVersion: S4_RULE_PACK,
      clauses: analysis.clauses,
      topics: analysis.topics,
    };
    await db.query(
      `INSERT INTO contract_analyses
         (contract_id, assessment_id, rule_pack_version, totals, clauses, topics, not_found, text_sha256, snapshot_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        contractId,
        assessment.id,
        S4_RULE_PACK,
        JSON.stringify(analysis.totals),
        JSON.stringify(analysis.clauses),
        JSON.stringify(analysis.topics),
        JSON.stringify(analysis.notFound),
        textSha256,
        sha256(JSON.stringify(snapshot)),
      ],
    );

    await recordOnTimeline(db, assessment, { version, fileName: upload.fileName, totals: analysis.totals });

    await audit(req, version === 1 ? 'contract.uploaded' : 'contract.version_uploaded', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: {
        reference: assessment.reference,
        version,
        fileName: upload.fileName,
        sha256: fileSha256,
        changeReason: upload.changeReason || null,
      },
    });
    await audit(req, 'contract.analysed', {
      db,
      stage: AUDIT_STAGE,
      ref: assessment.reference,
      detail: { reference: assessment.reference, version, ...analysis.totals, rulePackVersion: S4_RULE_PACK },
    });
  });

  // Step 20: return the analysis to the buyer.
  res.status(201).json(await contractState(query, assessment, version));
});

// A file larger than the limit is rejected by express.raw before our handler runs.
contractRouter.use((error, _req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(400).json({ error: 'file_rejected', message: 'The file is larger than 15 MB.' });
  }
  next(error);
});

/* ---------- Helpers ---------- */

async function findBuyerAssessment(run, req) {
  const buyerId = await buyerOrganisation({ query: run }, req.user.id);
  if (!buyerId) return null;

  const { rows } = await run(
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

/* The contract can be analysed once a vendor is selected (Stage 2) and has
   submitted its compliance answers (Stage 3), following the diagram order. */
async function whyNotReady(run, assessment) {
  if (!assessment.selected_vendor_id) {
    return 'Select a vendor first (Stage 2).';
  }
  const { rows } = await run('SELECT status FROM compliance_assessments WHERE assessment_id = $1', [
    assessment.id,
  ]);
  const compliance = rows[0];
  if (!compliance) {
    return 'Start the compliance assessment first (Stage 3).';
  }
  if (compliance.status !== 'submitted') {
    return 'The vendor has not submitted its compliance answers yet (Stage 3).';
  }
  return null;
}

function readUpload(req) {
  const fileName = String(req.query.name || '')
    .replace(/[\\/\0]/g, '_')
    .trim()
    .slice(0, 200);
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  const file = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const label = String(req.query.label || '')
    .trim()
    .slice(0, 80);
  const changeReason = String(req.query.reason || '')
    .trim()
    .slice(0, 500);

  if (!fileName || !CONTRACT_FORMATS[extension]) {
    return { error: 'Upload the contract as a PDF, Word (.docx) or text file.' };
  }
  if (file.length === 0) return { error: 'The file is empty.' };
  if (file.length > MAX_CONTRACT_BYTES) return { error: 'The file is larger than 15 MB.' };

  return { fileName, extension, file, label, changeReason };
}

async function latestContract(run, assessmentId) {
  const { rows } = await run(
    'SELECT * FROM contract_documents WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1',
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

async function recordOnTimeline(db, assessment, { version, fileName, totals }) {
  const addEvent = (step, title, detail = {}) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail)
     VALUES ($1, 'event', 4, $2, $3, 'done', now(), $4)`,
      [assessment.id, step, title, JSON.stringify(detail)],
    );

  const v = `v${version}`;
  await addEvent(17, `Contract uploaded (${v}): ${fileName}`, { version });
  await addEvent(18, `Text extracted: ${totals.clauses} clauses identified, ${totals.relevant} relevant`, {
    version,
    ...totals,
  });
  await addEvent(19, `Contract ${v} and its analysis saved to the evidence record`, { version });
  await addEvent(20, 'Contract analysis and clause list shared with the buyer', { version });

  if (version === 1) {
    // Stage 4 is now done; Stage 5 (obligation extraction) is next.
    await db.query(
      `DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 4 AND step IS NULL AND kind = 'milestone'`,
      [assessment.id],
    );
    await db.query(
      `UPDATE assessment_timeline SET status = 'next'
        WHERE assessment_id = $1 AND stage = 5 AND step IS NULL AND status = 'pending'`,
      [assessment.id],
    );
  }
}

export async function contractState(run, assessment, requestedVersion = null) {
  const { rows: versions } = await run(
    `SELECT d.*, u.email AS uploaded_by_email
       FROM contract_documents d JOIN users u ON u.id = d.uploaded_by
      WHERE d.assessment_id = $1 ORDER BY d.version DESC`,
    [assessment.id],
  );

  const shown = requestedVersion ? versions.find(row => row.version === requestedVersion) : versions[0];

  let analysis = null;
  if (shown) {
    const { rows } = await run('SELECT * FROM contract_analyses WHERE contract_id = $1', [shown.id]);
    if (rows[0]) analysis = shapeAnalysis(rows[0]);
  }

  return {
    assessment: {
      reference: assessment.reference,
      title: assessment.title,
      buyerName: assessment.buyer_name,
    },
    vendor: assessment.selected_vendor_id
      ? { id: assessment.selected_vendor_id, name: assessment.vendor_name }
      : null,
    blocked: await whyNotReady(run, assessment),
    versions: versions.map(shapeContract),
    shownVersion: shown ? shown.version : null,
    analysis,
    topics: TOPICS.map(({ id, name, controls }) => ({ id, name, controls })),
    rules: {
      formats: Object.keys(CONTRACT_FORMATS),
      maxBytes: MAX_CONTRACT_BYTES,
      rulePackVersion: S4_RULE_PACK,
    },
  };
}

function shapeContract(row) {
  return {
    id: row.id,
    version: row.version,
    label: row.label,
    changeReason: row.change_reason,
    fileName: row.file_name,
    size: row.size_bytes,
    sha256: row.sha256,
    pages: row.page_count,
    words: row.word_count,
    uploadedBy: row.uploaded_by_email,
    uploadedAt: row.uploaded_at,
  };
}

function shapeAnalysis(row) {
  return {
    id: row.id,
    rulePackVersion: row.rule_pack_version,
    totals: row.totals,
    clauses: row.clauses,
    topics: row.topics,
    notFound: row.not_found,
    note: ANALYSIS_NOTE,
    textSha256: row.text_sha256,
    snapshotSha256: row.snapshot_sha256,
    createdAt: row.created_at,
  };
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function notFound(res, message) {
  return res.status(404).json({ error: 'not_found', message });
}
