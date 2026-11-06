/* Stage 1 · Step 1: buyer submits an outsourcing requirement.
   Draft: saved whenever the buyer wants (invalid values are rejected, missing ones are allowed).
   Submit: accepted only when every mandatory and conditional field is complete; otherwise it stays a draft. */
import express, { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { query } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth } from '../auth/session.js';
import { COUNTRIES, CURRENCIES } from '../reference/countries.js';
import { GROUPS, FIELD_COUNT, DOC_TYPES, DOC_RULES, UNKNOWN, validateRequirement } from './fields.js';
import { submitRequirement } from '../assessments/routes.js';
import { saveFile, readFile, removeFile } from '../storage.js';
import { shapeAssessment, requireActiveMembership } from '../assessments/service.js';
import { ensureProfile, loadProfiles } from '../assessments/profile.js';
import { tx } from '../db.js';

export const requirementsRouter = Router();
requirementsRouter.use(requireAuth);
// Buyers only: the OffshoreAssure team sees requirements through the admin console.
requirementsRouter.use((req, res, next) =>
  req.user.role !== 'buyer'
    ? res
        .status(403)
        .json({
          error: 'buyers_only',
          message: req.user.is_admin
            ? 'Requirements are submitted by buyers. Use the admin console.'
            : 'This area is for buyers. Vendors use the vendor portal.',
        })
    : next(),
);
requirementsRouter.use(requireActiveMembership);

const STAGE = 'stage-1';
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const shape = (r, check) => ({
  id: r.id,
  status: r.status,
  title: r.title,
  data: r.data,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  submittedAt: r.submitted_at,
  ...(check ? { check: { missing: check.missing, flags: check.flags, completion: check.completion } } : {}),
});
const docShape = d => ({
  id: d.id,
  type: d.doc_type,
  fileName: d.file_name,
  mimeType: d.mime_type,
  size: d.size_bytes,
  sha256: d.sha256,
  uploadedAt: d.uploaded_at,
});

async function own(req, res) {
  if (!isUuid(req.params.id)) {
    res.status(404).json({ error: 'not_found', message: 'Requirement not found.' });
    return null;
  }
  const r = (
    await query('SELECT * FROM requirements WHERE id = $1 AND created_by = $2', [req.params.id, req.user.id])
  ).rows[0];
  if (!r) {
    res.status(404).json({ error: 'not_found', message: 'Requirement not found.' });
    return null;
  }
  return r;
}
const locked = res =>
  res
    .status(409)
    .json({
      error: 'submitted',
      message:
        'This requirement has been submitted and can no longer be edited here. Corrections will create a new version (Step 3).',
    });
const invalid = (res, check) =>
  res
    .status(400)
    .json({
      error: 'validation',
      message: 'Some answers are not valid. Correct the highlighted fields.',
      fields: check.errors,
    });

/* Form definition: groups, fields, options and prefill from the buyer's profile. */
requirementsRouter.get('/form', async (req, res) => {
  const p =
    (await query('SELECT organisation_name, sector FROM user_profiles WHERE user_id = $1', [req.user.id]))
      .rows[0] || {};
  res.json({
    fieldCount: FIELD_COUNT,
    groups: GROUPS,
    unknown: UNKNOWN,
    countries: COUNTRIES,
    currencies: CURRENCIES,
    documents: {
      types: DOC_TYPES.map(([id, label]) => ({ id, label })),
      maxBytes: DOC_RULES.maxBytes,
      extensions: Object.keys(DOC_RULES.extensions),
    },
    prefill: {
      buyerLegalName: p.organisation_name || '',
      buyerSector: p.sector || '',
      buyerContactEmail: req.user.email,
      buyerCountry: 'GB',
      currency: 'GBP',
    },
  });
});

requirementsRouter.get('/', async (req, res) => {
  const rows = (
    await query(
      `SELECT r.*, a.reference, a.risk_tier, a.validation_status FROM requirements r LEFT JOIN assessments a ON a.requirement_id = r.id
     WHERE r.created_by = $1 ORDER BY r.updated_at DESC`,
      [req.user.id],
    )
  ).rows;
  res.json({
    requirements: rows.map(r => {
      const c = validateRequirement(r.data);
      return {
        ...shape(r),
        data: undefined,
        missingCount: c.missing.length,
        completion: c.completion,
        assessment: r.reference
          ? { reference: r.reference, riskTier: r.risk_tier, validationStatus: r.validation_status }
          : null,
      };
    }),
  });
});

requirementsRouter.post('/', async (req, res) => {
  const check = validateRequirement(req.body?.data);
  if (Object.keys(check.errors).length) return invalid(res, check);
  const r = (
    await query('INSERT INTO requirements (created_by, data, title) VALUES ($1, $2, $3) RETURNING *', [
      req.user.id,
      JSON.stringify(check.values),
      check.values.assessmentTitle || null,
    ])
  ).rows[0];
  await audit(req, 'requirement.draft_created', {
    stage: STAGE,
    ref: r.id,
    detail: { requirementId: r.id, title: r.title },
  });
  res.status(201).json({ requirement: shape(r, check), documents: [] });
});

requirementsRouter.get('/:id', async (req, res) => {
  const r = await own(req, res);
  if (!r) return;
  const docs = (
    await query('SELECT * FROM requirement_documents WHERE requirement_id = $1 ORDER BY uploaded_at', [r.id])
  ).rows;
  const a = (await query('SELECT * FROM assessments WHERE requirement_id = $1', [r.id])).rows[0];
  if (a) await tx(db => ensureProfile(db, req, a.id));
  res.json({
    requirement: shape(r, validateRequirement(r.data)),
    documents: docs.map(docShape),
    assessment: a ? shapeAssessment(a) : null,
    ...(a ? await loadProfiles({ query }, a.id) : {}),
  });
});

requirementsRouter.put('/:id', async (req, res) => {
  const r = await own(req, res);
  if (!r) return;
  if (r.status !== 'draft') return locked(res);
  const check = validateRequirement(req.body?.data);
  if (Object.keys(check.errors).length) return invalid(res, check);
  const u = (
    await query(
      'UPDATE requirements SET data = $2, title = $3, updated_at = now() WHERE id = $1 RETURNING *',
      [r.id, JSON.stringify(check.values), check.values.assessmentTitle || null],
    )
  ).rows[0];
  await audit(req, 'requirement.draft_saved', {
    stage: STAGE,
    ref: r.id,
    detail: { requirementId: r.id, title: u.title, missing: check.missing.length },
  });
  res.json({ requirement: shape(u, check) });
});

/* Submit (Step 1) → validate and create the Assessment ID (Step 2). Rejected submissions stay as drafts. */
requirementsRouter.post('/:id/submit', async (req, res) => {
  const r = await own(req, res);
  if (!r) return;
  if (r.status !== 'draft') return locked(res);
  const out = await submitRequirement(req, r.id, req.body?.data, req.get('Idempotency-Key'));
  if (out.status < 300) {
    const u = (await query('SELECT * FROM requirements WHERE id = $1', [r.id])).rows[0];
    out.body.requirement = shape(u, validateRequirement(u.data));
    Object.assign(out.body, await loadProfiles({ query }, out.body.assessment.id));
  }
  res.status(out.status === 201 ? 200 : out.status).json(out.body);
});

requirementsRouter.delete('/:id', async (req, res) => {
  const r = await own(req, res);
  if (!r) return;
  if (r.status !== 'draft') return locked(res);
  const docs = (
    await query('SELECT storage_key FROM requirement_documents WHERE requirement_id = $1', [r.id])
  ).rows;
  await query('DELETE FROM requirements WHERE id = $1', [r.id]);
  for (const d of docs) await removeFile(d.storage_key);
  await audit(req, 'requirement.draft_deleted', {
    stage: STAGE,
    ref: r.id,
    detail: { requirementId: r.id, title: r.title },
  });
  res.json({ status: 'deleted' });
});

/* ---------------- Supporting documents (optional) ---------------- */
const TYPES = new Set(DOC_TYPES.map(([id]) => id));
requirementsRouter.post(
  '/:id/documents',
  express.raw({ type: () => true, limit: DOC_RULES.maxBytes + 1 }),
  async (req, res) => {
    const r = await own(req, res);
    if (!r) return;
    if (r.status !== 'draft') return locked(res);
    const type = String(req.query.type || '');
    const name = String(req.query.name || '')
      .replace(/[\\/\0]/g, '_')
      .trim()
      .slice(0, 200);
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const reject = async (message, reason) => {
      await audit(req, 'requirement.document_rejected', {
        stage: STAGE,
        ref: r.id,
        detail: { requirementId: r.id, fileName: name, reason },
      });
      res.status(400).json({ error: 'file_rejected', message });
    };
    if (!TYPES.has(type)) return reject('Choose which document this is.', 'unknown_type');
    if (!name || !DOC_RULES.extensions[ext])
      return reject(
        `This file type is not supported. Use: ${Object.keys(DOC_RULES.extensions).join(', ')}.`,
        'unsupported_type',
      );
    if (!body.length) return reject('The file is empty.', 'empty');
    if (body.length > DOC_RULES.maxBytes) return reject('The file is larger than 10 MB.', 'too_large');
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const id = crypto.randomUUID();
    const key = path.join('requirements', r.id, id);
    await saveFile(key, body);
    const d = (
      await query(
        `INSERT INTO requirement_documents (id, requirement_id, doc_type, file_name, mime_type, size_bytes, sha256, storage_key, uploaded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id, r.id, type, name, DOC_RULES.extensions[ext], body.length, sha256, key, req.user.id],
      )
    ).rows[0];
    await audit(req, 'requirement.document_uploaded', {
      stage: STAGE,
      ref: r.id,
      detail: { requirementId: r.id, type, fileName: name, size: body.length, sha256 },
    });
    res.status(201).json({ document: docShape(d) });
  },
);
// A file larger than the limit is refused by express.raw before the handler runs.
requirementsRouter.use((err, _req, res, next) =>
  err.type === 'entity.too.large'
    ? res.status(400).json({ error: 'file_rejected', message: 'The file is larger than 10 MB.' })
    : next(err),
);

requirementsRouter.get('/:id/documents/:docId', async (req, res) => {
  const r = await own(req, res);
  if (!r) return;
  const d =
    isUuid(req.params.docId) &&
    (
      await query('SELECT * FROM requirement_documents WHERE id = $1 AND requirement_id = $2', [
        req.params.docId,
        r.id,
      ])
    ).rows[0];
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  res.set('Content-Type', d.mime_type);
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(d.file_name)}"`);
  res.send(await readFile(d.storage_key, d.encrypted));
});

requirementsRouter.delete('/:id/documents/:docId', async (req, res) => {
  const r = await own(req, res);
  if (!r) return;
  if (r.status !== 'draft') return locked(res);
  const d =
    isUuid(req.params.docId) &&
    (
      await query('DELETE FROM requirement_documents WHERE id = $1 AND requirement_id = $2 RETURNING *', [
        req.params.docId,
        r.id,
      ])
    ).rows[0];
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  await removeFile(d.storage_key);
  await audit(req, 'requirement.document_removed', {
    stage: STAGE,
    ref: r.id,
    detail: { requirementId: r.id, type: d.doc_type, fileName: d.file_name },
  });
  res.json({ status: 'removed' });
});
