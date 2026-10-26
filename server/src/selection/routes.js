/* Stage 2 — Vendor selection (sequence diagram steps 5–9), client spec "Stage 2 Inputs and Outputs" v2.

   Step 5  Search, select or add a vendor (vendor_selection_mode)
           Route A  DIRECTORY_SEARCH  POST /api/assessments/:ref/vendors/search · POST/DELETE /:ref/shortlist
           Route B  ADD_NEW_VENDOR    POST /:ref/own-vendors · POST /:ref/own-vendors/:id/documents
           Route C  EXISTING_VENDOR   GET/POST /:ref/existing-vendors
   Step 6  Match service, location and scope ... engine/vendorFit.js (every candidate carries a VendorFitAssessment)
   Step 7  Candidate list and comparison ......... GET /:ref/selection (directory candidates ranked; a buyer-added
                                                   or reused vendor gets a single-vendor summary, never a rank)
   Step 8  Confirm selected vendor ................ POST /:ref/selection (8 inputs)
   Step 9  Save selection and decision rationale .. vendor_selections (append-only), timeline, audit → Stage 3

   Buyers only (approved members of the buyer organisation). Vendors see their selections at /api/vendor. */
import express, { Router } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { requireRole } from '../auth/session.js';
import { sendNotice } from '../mailer.js';
import { saveFile, readFile } from '../storage.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { buildSummary } from '../assessments/profile.js';
import { countryName } from '../reference/countries.js';
import {
  assessFit,
  directoryFilter,
  selectionStatus,
  conditionsFor,
  FIT_RULE_PACK,
  WEIGHTS,
  SCORE_NOTE,
} from '../engine/vendorFit.js';
import {
  formDefinitions,
  validateCriteria,
  validateOnboarding,
  validateFields,
  ANY_COUNTRY,
  CONTACT_ROLES,
} from './vendorFields.js';
import {
  vendorView,
  createBuyerVendor,
  possibleDuplicates,
  existingVendors,
  materialChanges,
  profileAtLastSelection,
  latestProfile,
  saveProfileVersion,
  ownProfileOf,
  sha256,
} from './vendors.js';
import { SERVICE_CATEGORIES } from '../validation.js';

export const selectionRouter = Router();
const buyerOnly = [requireRole('buyer'), requireActiveMembership];
const STAGE = 'stage-2';

const appLink = p => config.frontendOrigin.split(',')[0].trim() + p;
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
const fieldErrors = issues => Object.fromEntries(issues.map(i => [i.path[0], i.message]));
const badFields = (res, fields, message = 'Check the highlighted fields.') =>
  res.status(400).json({ error: 'validation', message, fields });

// Where a candidate came from (vendor_shortlist.source) → the source named in the spec.
const SOURCE_OF = {
  search: 'DIRECTORY',
  invitation: 'DIRECTORY',
  buyer_provided: 'BUYER_PROVIDED',
  existing: 'EXISTING',
};
const MODE_OF = {
  DIRECTORY: 'DIRECTORY_SEARCH',
  EXISTING: 'EXISTING_VENDOR',
  BUYER_PROVIDED: 'ADD_NEW_VENDOR',
};

/* The assessment of the signed-in buyer's organisation, with the current requirement answers. */
async function ownAssessment(db, req, { lock = false } = {}) {
  const buyerId = await buyerOrganisation(db, req.user.id);
  if (!buyerId) return null;
  return (
    (
      await db.query(
        `SELECT a.*, r.data, r.title, o.name AS buyer_name FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
      WHERE a.reference = $1 AND a.buyer_id = $2${lock ? ' FOR UPDATE OF a' : ''}`,
        [req.params.ref, buyerId],
      )
    ).rows[0] || null
  );
}
const notFound = res => res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });

/* What the matching uses from the requirement (shown to the buyer above the results). */
const requirementBasis = d => ({
  serviceCategory: d.serviceCategory,
  buyerCountry: d.buyerCountry,
  buyerSector: d.buyerSector,
  serviceCriticality: d.serviceCriticality,
  preferredCountries: d.preferredCountries || [],
  restrictedCountries: d.restrictedCountries || [],
  remoteAccessCountries: d.remoteAccessCountries || [],
  subprocessors: d.subprocessors,
  supportHours: d.supportHours,
  deliveryModel: d.deliveryModel,
  names: Object.fromEntries(
    [
      d.buyerCountry,
      ...(d.preferredCountries || []),
      ...(d.restrictedCountries || []),
      ...(d.remoteAccessCountries || []),
    ]
      .filter(c => c && c.length === 2)
      .map(c => [c, countryName(c)]),
  ),
});

/* Route A defaults: the search starts from the requirement. */
const defaultCriteria = d => ({
  serviceCategory: d.serviceCategory,
  supplierCountries: (d.preferredCountries || []).length ? d.preferredCountries : [ANY_COUNTRY],
  deliveryModel: d.deliveryModel || '',
  supportHours:
    d.supportHours === '24/7' ? '24/7' : d.supportHours === 'Business hours' ? 'Business hours' : '',
  subprocessorRule: d.subprocessors || '',
});

/* People in the buyer organisation who can approve a selection (step 8 "buyer approver"). */
async function approversOf(db, buyerId) {
  return (
    await db.query(
      `SELECT u.id, u.email, p.full_name, p.job_role, p.membership FROM user_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.organisation_id = $1 AND p.membership IN ('owner', 'member') AND u.status = 'active' ORDER BY p.membership = 'owner' DESC, lower(p.full_name)`,
      [buyerId],
    )
  ).rows.map(r => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    jobRole: r.job_role,
    owner: r.membership === 'owner',
  }));
}
const NEEDS_OWNER = ['High', 'Critical'];

/* ---------- Form definitions and defaults ---------- */
selectionRouter.get('/:ref/selection/form', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req);
  if (!a) return notFound(res);
  res.json({
    ...formDefinitions(),
    defaults: defaultCriteria(a.data),
    onboardingDefaults: {
      serviceCategory: a.data.serviceCategory,
      serviceCriticality: a.data.serviceCriticality,
    },
    approvers: await approversOf({ query }, a.buyer_id),
    approverRule: `For ${NEEDS_OWNER.join(' or ')} criticality services the approver must be an organisation owner.`,
  });
});

/* ---------- Step 5 · Route A: search the directory ---------- */
selectionRouter.post('/:ref/vendors/search', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req);
  if (!a) return notFound(res);
  const { values: c, errors } = validateCriteria(req.body || {});
  if (Object.keys(errors).length) return badFields(res, errors);

  const params = [];
  const where = [`o.kind = 'vendor'`, `o.source = 'self_registered'`, `o.verification_status = 'approved'`];
  if (c.search) {
    params.push(`%${c.search}%`);
    where.push(`(o.name ILIKE $${params.length} OR o.description ILIKE $${params.length})`);
  }
  params.push(c.serviceCategory);
  where.push(`$${params.length} = ANY(o.services)`);
  if (!c.supplierCountries.includes(ANY_COUNTRY)) {
    params.push(c.supplierCountries);
    where.push(`o.delivery_countries && $${params.length}::text[]`);
  }
  const rows = (
    await query(
      `SELECT o.* FROM organisations o WHERE ${where.join(' AND ')} ORDER BY lower(o.name) LIMIT 200`,
      params,
    )
  ).rows;

  const listed = new Set(
    (await query('SELECT vendor_id FROM vendor_shortlist WHERE assessment_id = $1', [a.id])).rows.map(
      r => r.vendor_id,
    ),
  );
  let vendors = [];
  let hidden = 0;
  for (const o of rows) {
    const v = await vendorView({ query }, o);
    const fit = assessFit(a.data, v, c);
    const filter = directoryFilter(v, c);
    const belowThreshold =
      c.assuranceThreshold != null && fit.score.total < c.assuranceThreshold && fit.selectable;
    // Hard exclusions stay visible; vendors that clearly fail a filter the buyer chose are left out.
    if (fit.selectable && (filter.failed.length || belowThreshold)) {
      hidden++;
      continue;
    }
    vendors.push({ ...card(v), fit, filter, shortlisted: listed.has(o.id) });
  }
  vendors = rank(vendors);
  await query(
    'INSERT INTO vendor_searches (assessment_id, criteria, results, searched_by) VALUES ($1,$2,$3,$4)',
    [a.id, JSON.stringify(c), vendors.length, req.user.id],
  );
  res.json({ vendors, criteria: c, total: vendors.length, hidden, weights: WEIGHTS, scoreNote: SCORE_NOTE });
});

/* A short public card of a vendor for lists. */
const card = v => ({
  id: v.id,
  name: v.name,
  source: v.source,
  verificationStatus: v.verificationStatus,
  country: v.registeredCountry,
  website: v.website,
  description: v.description,
  services: v.services,
  deliveryCountries: v.deliveryCountries,
  certifications: v.certifications,
  staffCount: v.staffCount,
  foundedYear: v.foundedYear,
  supportHours: v.supportHours,
  languages: v.languages,
  industries: v.industries,
  deliveryModel: v.deliveryModel,
  usesSubprocessors: v.usesSubprocessors,
});

/* Step 7: directory vendors ranked by fit score; excluded vendors last; the reason is written out. */
function rank(list) {
  const sorted = [...list].sort(
    (x, y) =>
      y.fit.selectable - x.fit.selectable ||
      y.fit.score.total - x.fit.score.total ||
      x.name.localeCompare(y.name),
  );
  let n = 0;
  return sorted.map(v => {
    if (!v.fit.selectable)
      return {
        ...v,
        rank: null,
        rankRationale: 'Not ranked: ' + v.fit.hardExclusions.map(h => h.detail).join(' '),
      };
    n++;
    const parts = [...v.fit.score.parts].sort((p, q) => q.value - p.value);
    return {
      ...v,
      rank: n,
      rankRationale: `Fit score ${v.fit.score.total}/100. Strongest: ${parts[0].criterion.toLowerCase()}; weakest: ${parts.at(-1).criterion.toLowerCase()}.`,
    };
  });
}

/* ---------- Step 7: the candidate set and the saved selection ---------- */
export async function selectionState(db, a) {
  const latestSearch = (
    await db.query(
      'SELECT criteria, searched_at FROM vendor_searches WHERE assessment_id = $1 ORDER BY searched_at DESC LIMIT 1',
      [a.id],
    )
  ).rows[0];
  const criteria = latestSearch?.criteria || {};
  const rows = (
    await db.query(
      `SELECT o.*, s.added_at, s.source AS list_source, s.reuse, u.email AS added_by_email FROM vendor_shortlist s JOIN organisations o ON o.id = s.vendor_id
       JOIN users u ON u.id = s.added_by WHERE s.assessment_id = $1 ORDER BY s.added_at`,
      [a.id],
    )
  ).rows;
  const candidates = [];
  for (const o of rows) {
    const v = await vendorView(db, o);
    const source = SOURCE_OF[o.list_source];
    candidates.push({
      ...card(v),
      vendor: v,
      candidateSource: source,
      fit: assessFit(a.data, v, source === 'DIRECTORY' ? criteria : {}),
      addedAt: o.added_at,
      addedByEmail: o.added_by_email,
      reuse: o.reuse || null,
    });
  }
  const directory = rank(candidates.filter(c => c.candidateSource === 'DIRECTORY'));
  const single = candidates
    .filter(c => c.candidateSource !== 'DIRECTORY')
    .map(c => ({ ...c, rank: null, rankRationale: 'Single vendor: not ranked against others.' }));

  const versions = (
    await db.query(
      `SELECT s.*, u.email AS selected_by_email, ap.email AS approver_email, pp.full_name AS approver_name
       FROM vendor_selections s JOIN users u ON u.id = s.selected_by LEFT JOIN users ap ON ap.id = s.approver_id LEFT JOIN user_profiles pp ON pp.user_id = s.approver_id
      WHERE s.assessment_id = $1 ORDER BY s.version`,
      [a.id],
    )
  ).rows.map(recordShape);
  const summary = await buildSummary(db, a.id);
  const stage1 = summary?.currentStatus || null;
  return {
    assessment: {
      reference: a.reference,
      title: a.title,
      serviceCode: a.service_code,
      riskTier: a.risk_tier,
      requirementVersion: a.requirement_version,
      buyerName: a.buyer_name,
    },
    criteria: requirementBasis(a.data),
    lastSearch: latestSearch ? { criteria, searchedAt: latestSearch.searched_at } : null,
    stage1Status: stage1,
    blocked:
      stage1?.code === 'INFORMATION_REQUIRED'
        ? 'Some requirement answers contradict each other. Correct them (Stage 1) before confirming a vendor.'
        : null,
    candidates: [...directory, ...single],
    shortlist: [...directory, ...single], // older name, still read by the admin pages
    current: versions[versions.length - 1] || null,
    versions,
    approvers: await approversOf(db, a.buyer_id),
    weights: WEIGHTS,
    scoreNote: SCORE_NOTE,
    rulePackVersion: FIT_RULE_PACK,
  };
}

/* Step 9 · VendorSelectionRecord: the 12 stored fields plus the decision details. */
const recordShape = s => ({
  id: s.id,
  recordVersion: `${s.version}.0`,
  version: s.version,
  assessmentId: s.assessment_id,
  vendorId: s.vendor_id,
  source: s.source,
  selectionMode: s.selection_mode,
  selectionCriteria: s.selection_criteria,
  comparisonSha256: s.comparison_sha256,
  rationale: s.rationale,
  approver: s.approver_id ? { id: s.approver_id, email: s.approver_email, fullName: s.approver_name } : null,
  exceptions: s.accepted_flags || [],
  exceptionReason: s.exception_reason,
  selectedAt: s.selected_at,
  confirmedAt: s.confirmed_at,
  vendorProfileVersion: s.vendor_profile_version,
  status: s.status,
  decision: s.decision,
  conditions: s.conditions || [],
  vendor: s.vendor_snapshot,
  fit: s.match,
  match: s.match,
  candidates: s.candidates,
  requirementVersion: s.requirement_version,
  rulePackVersion: s.rule_pack_version,
  selectedByEmail: s.selected_by_email,
  previousId: s.previous_id,
  changeReason: s.change_reason,
  snapshotSha256: s.snapshot_sha256,
});

selectionRouter.get('/:ref/selection', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req);
  if (!a) return notFound(res);
  res.json(await selectionState({ query }, a));
});

/* Route A: add a directory vendor to the candidate set. */
selectionRouter.post('/:ref/shortlist', ...buyerOnly, async (req, res) => {
  const vendorId = req.body?.vendorId;
  const out = await tx(async db => {
    const a = await ownAssessment(db, req);
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    if (!isUuid(vendorId)) return [400, { error: 'validation', message: 'Choose a vendor.' }];
    const o = (
      await db.query(
        `SELECT * FROM organisations WHERE id = $1 AND kind = 'vendor' AND source = 'self_registered' AND verification_status = 'approved'`,
        [vendorId],
      )
    ).rows[0];
    if (!o) return [404, { error: 'not_found', message: 'Vendor not found in the directory.' }];
    const ins = await db.query(
      `INSERT INTO vendor_shortlist (assessment_id, vendor_id, added_by, source) VALUES ($1,$2,$3,'search') ON CONFLICT DO NOTHING`,
      [a.id, o.id, req.user.id],
    );
    if (ins.rowCount)
      await audit(req, 'vendor_selection.shortlisted', {
        db,
        stage: STAGE,
        ref: a.reference,
        detail: { reference: a.reference, vendorId: o.id, vendorName: o.name, source: 'DIRECTORY' },
      });
    return [200, await selectionState(db, a)];
  });
  res.status(out[0]).json(out[1]);
});

selectionRouter.delete('/:ref/shortlist/:vendorId', ...buyerOnly, async (req, res) => {
  const out = await tx(async db => {
    const a = await ownAssessment(db, req);
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    if (!isUuid(req.params.vendorId))
      return [404, { error: 'not_found', message: 'Vendor is not a candidate.' }];
    if (a.selected_vendor_id === req.params.vendorId)
      return [
        409,
        { error: 'selected', message: 'This is the selected vendor. Select a different vendor first.' },
      ];
    const del = (
      await db.query(
        'DELETE FROM vendor_shortlist WHERE assessment_id = $1 AND vendor_id = $2 RETURNING vendor_id',
        [a.id, req.params.vendorId],
      )
    ).rows[0];
    if (!del) return [404, { error: 'not_found', message: 'Vendor is not a candidate.' }];
    const name = (await db.query('SELECT name FROM organisations WHERE id = $1', [del.vendor_id])).rows[0]
      ?.name;
    await audit(req, 'vendor_selection.removed_from_shortlist', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference, vendorId: del.vendor_id, vendorName: name },
    });
    return [200, await selectionState(db, a)];
  });
  res.status(out[0]).json(out[1]);
});

/* ---------- Step 5 · Route B: add our own vendor ---------- */
selectionRouter.post('/:ref/own-vendors', ...buyerOnly, async (req, res) => {
  const { values, errors, notes } = validateOnboarding(req.body || {});
  if (Object.keys(errors).length) return badFields(res, errors);
  const out = await tx(async db => {
    const a = await ownAssessment(db, req);
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const dupes = await possibleDuplicates(db, a.buyer_id, values);
    const own = dupes.find(d => d.source === 'BUYER_PROVIDED');
    if (own)
      return [
        409,
        {
          error: 'duplicate',
          message: `Your organisation already added ${own.name}. Use "Select a vendor already added by our organisation" instead.`,
          duplicates: dupes,
          fields: { legalName: 'Already added by your organisation.' },
        },
      ];
    if (dupes.length && req.body?.notDuplicate !== true)
      return [
        409,
        {
          error: 'possible_duplicate',
          message: `${dupes[0].name} is already in the OffshoreAssure directory. Search the directory, or confirm this is a different company.`,
          duplicates: dupes,
        },
      ];
    const o = await createBuyerVendor(db, a.buyer_id, values, req.user.id);
    await db.query(
      `INSERT INTO vendor_shortlist (assessment_id, vendor_id, added_by, source) VALUES ($1,$2,$3,'buyer_provided')`,
      [a.id, o.id, req.user.id],
    );
    const fit = assessFit(a.data, await vendorView(db, o));
    await audit(req, 'vendor_selection.vendor_added', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: {
        reference: a.reference,
        vendorId: o.id,
        vendorName: o.name,
        source: 'BUYER_PROVIDED',
        status: 'UNVERIFIED',
        eligibility: fit.eligibility,
        notDuplicateConfirmed: dupes.length > 0,
      },
    });
    return [201, { vendorId: o.id, notes, state: await selectionState(db, a) }];
  });
  res.status(out[0]).json(out[1]);
});

/* Route B documents: the existing contract and DPA (PDF or DOCX, encrypted on disk). Query: type=contract|dpa, name=file name. */
const CONTRACT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MAX_DOC = 15 * 1024 * 1024;

async function ownVendor(db, a, vendorId) {
  if (!isUuid(vendorId)) return null;
  return (
    (
      await db.query(
        `SELECT * FROM organisations WHERE id = $1 AND source = 'buyer_provided' AND owner_buyer_id = $2`,
        [vendorId, a.buyer_id],
      )
    ).rows[0] || null
  );
}

selectionRouter.post(
  '/:ref/own-vendors/:vendorId/documents',
  ...buyerOnly,
  express.raw({ type: () => true, limit: MAX_DOC + 1 }),
  async (req, res) => {
    const a = await ownAssessment({ query }, req);
    if (!a) return notFound(res);
    const o = await ownVendor({ query }, a, req.params.vendorId);
    if (!o) return res.status(404).json({ error: 'not_found', message: 'Vendor not found.' });
    const type = String(req.query.type || '');
    const name = path.basename(String(req.query.name || '')).slice(0, 200);
    const ext = name.split('.').pop().toLowerCase();
    if (!['contract', 'dpa'].includes(type)) return badFields(res, { type: 'Choose contract or DPA.' });
    if (!CONTRACT_TYPES[ext])
      return badFields(res, { file: 'Upload a PDF or DOCX file.' }, 'Upload a PDF or DOCX file.');
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) return badFields(res, { file: 'The file is empty.' }, 'The file is empty.');
    if (body.length > MAX_DOC)
      return res.status(413).json({ error: 'too_large', message: 'The file is larger than 15 MB.' });
    const id = crypto.randomUUID();
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    const key = `buyer-vendors/${o.id}/${id}`;
    await saveFile(key, body);
    await query(
      `INSERT INTO buyer_vendor_documents (id, vendor_id, doc_type, file_name, mime_type, size_bytes, sha256, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, o.id, type, name, CONTRACT_TYPES[ext], body.length, sha, key, req.user.id],
    );
    await audit(req, 'vendor_selection.vendor_document_uploaded', {
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference, vendorId: o.id, type, fileName: name, sha256: sha },
    });
    res.status(201).json(await selectionState({ query }, a));
  },
);

selectionRouter.get('/:ref/own-vendors/:vendorId/documents/:docId', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req);
  if (!a) return notFound(res);
  const o = await ownVendor({ query }, a, req.params.vendorId);
  const d =
    o &&
    isUuid(req.params.docId) &&
    (
      await query('SELECT * FROM buyer_vendor_documents WHERE id = $1 AND vendor_id = $2', [
        req.params.docId,
        o.id,
      ])
    ).rows[0];
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  res.setHeader('Content-Type', d.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${d.file_name.replace(/"/g, '')}"`);
  res.send(await readFile(d.storage_key));
});

/* ---------- Step 5 · Route C: reuse a vendor our organisation added or selected before ---------- */
selectionRouter.get('/:ref/existing-vendors', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req);
  if (!a) return notFound(res);
  res.json({ vendors: await existingVendors({ query }, a.buyer_id) });
});

const contactFields = [
  { key: 'contactName', label: 'Contact name', type: 'text', min: 2, max: 120 },
  { key: 'contactEmail', label: 'Contact email', type: 'email' },
  { key: 'contactRole', label: 'Contact role', type: 'select', options: CONTACT_ROLES },
  { key: 'contactPhone', label: 'Contact telephone', type: 'phone' },
];
const reuseSchema = z.object({
  vendorId: z.string().uuid('Choose an existing supplier.'),
  serviceCategory: z.enum(SERVICE_CATEGORIES, { message: 'Choose the service.' }),
  scopeDescription: z
    .string()
    .trim()
    .min(10, 'Describe the service scope in at least 10 characters.')
    .max(2000),
  reviewReason: z.string().trim().min(10, 'Give the review reason in at least 10 characters.').max(1000),
  contact: z.record(z.string(), z.any()).optional(),
});

selectionRouter.post('/:ref/existing-vendors', ...buyerOnly, async (req, res) => {
  const p = reuseSchema.safeParse(req.body || {});
  if (!p.success) return badFields(res, fieldErrors(p.error.issues));
  const body = p.data;
  const contact = validateFields(contactFields, body.contact || {});
  if (Object.keys(contact.errors).length)
    return badFields(
      res,
      Object.fromEntries(Object.entries(contact.errors).map(([k, v]) => ['contact.' + k, v])),
    );

  const out = await tx(async db => {
    const a = await ownAssessment(db, req);
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    if (!(await existingVendors(db, a.buyer_id)).some(v => v.id === body.vendorId))
      return [
        404,
        {
          error: 'not_found',
          message: 'This vendor has not been added or selected by your organisation.',
          fields: { vendorId: 'Not one of your vendors.' },
        },
      ];
    let o = (await db.query('SELECT * FROM organisations WHERE id = $1', [body.vendorId])).rows[0];
    const buyerAdded = o.source === 'buyer_provided';

    // Updated contact details make a new profile version (buyer-added vendors only: a directory vendor keeps its own profile).
    const updated = Object.keys(contact.values).length > 0;
    if (updated && buyerAdded) {
      const prev = (await latestProfile(db, o.id))?.profile || {};
      const next = { ...prev, ...contact.values };
      await saveProfileVersion(db, o.id, next, req.user.id, `Contact updated when reused for ${a.reference}`);
      if (contact.values.contactEmail)
        await db.query('UPDATE organisations SET contact_email = $2 WHERE id = $1', [
          o.id,
          contact.values.contactEmail,
        ]);
      o = (await db.query('SELECT * FROM organisations WHERE id = $1', [o.id])).rows[0];
    }
    // Material changes since this buyer last selected the vendor.
    const before = await profileAtLastSelection(db, a.buyer_id, o.id);
    const now = buyerAdded ? (await latestProfile(db, o.id))?.profile : ownProfileOf(o);
    const changes = materialChanges(before?.profile, now);
    const reuse = {
      serviceCategory: body.serviceCategory,
      scopeDescription: body.scopeDescription,
      reviewReason: body.reviewReason,
      contactUpdated: updated && buyerAdded,
      contactIgnored: updated && !buyerAdded,
      materialChanges: changes,
      comparedWith: before?.version || null,
      profileVersion: o.profile_version,
    };
    const ins = await db.query(
      `INSERT INTO vendor_shortlist (assessment_id, vendor_id, added_by, source, reuse) VALUES ($1,$2,$3,'existing',$4)
      ON CONFLICT (assessment_id, vendor_id) DO UPDATE SET reuse = EXCLUDED.reuse, source = 'existing' RETURNING vendor_id`,
      [a.id, o.id, req.user.id, JSON.stringify(reuse)],
    );
    await audit(req, 'vendor_selection.vendor_reused', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: {
        reference: a.reference,
        vendorId: o.id,
        vendorName: o.name,
        source: 'EXISTING',
        reviewReason: body.reviewReason,
        materialChanges: changes.map(c => c.field),
        added: ins.rowCount > 0,
      },
    });
    return [201, { vendorId: o.id, materialChanges: changes, state: await selectionState(db, a) }];
  });
  res.status(out[0]).json(out[1]);
});

/* ---------- Steps 8–9: confirm the vendor and save the decision ---------- */
const confirmSchema = z.object({
  vendorId: z.string().uuid('Choose a vendor from the candidates.'),
  selectionSource: z.enum(['DIRECTORY', 'EXISTING', 'BUYER_PROVIDED'], {
    message: 'The selection source is missing.',
  }),
  decision: z.enum(['SELECT', 'SELECT_WITH_CONDITIONS'], { message: 'Choose your decision.' }),
  rationale: z
    .string()
    .trim()
    .min(20, 'Explain the decision in at least 20 characters.')
    .max(2000, 'Use at most 2,000 characters.'),
  approverId: z.string().uuid('Choose the approver.'),
  exceptionReason: z.string().trim().max(1000, 'Use at most 1,000 characters.').optional().or(z.literal('')),
  confirmedAt: z.string().datetime({ offset: true, message: 'The confirmation time is missing.' }),
  changeReason: z.string().trim().max(500).optional().or(z.literal('')),
});

selectionRouter.post('/:ref/selection', ...buyerOnly, async (req, res) => {
  const p = confirmSchema.safeParse(req.body || {});
  if (!p.success) return badFields(res, fieldErrors(p.error.issues));
  const body = p.data;
  const confirmedAt = new Date(body.confirmedAt);
  if (Math.abs(Date.now() - confirmedAt.getTime()) > 24 * 3600 * 1000)
    return badFields(res, {
      confirmedAt: 'The confirmation time must be today. Reload the page and confirm again.',
    });

  const out = await tx(async db => {
    const a = await ownAssessment(db, req, { lock: true });
    if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const state = await selectionState(db, a);
    if (state.blocked) return [409, { error: 'information_required', message: state.blocked }];
    if (
      state.current &&
      (await db.query('SELECT 1 FROM compliance_assessments WHERE assessment_id = $1', [a.id])).rows[0]
    )
      return [
        409,
        {
          error: 'compliance_started',
          message:
            'The compliance assessment has already started with the selected vendor, so the vendor cannot be changed here.',
        },
      ];

    // The vendor must belong to the displayed candidate set, with the same source.
    const cand = state.candidates.find(v => v.id === body.vendorId);
    if (!cand)
      return [
        400,
        {
          error: 'not_a_candidate',
          message: 'Add the vendor to the candidates first.',
          fields: { vendorId: 'Not one of the candidates.' },
        },
      ];
    if (cand.candidateSource !== body.selectionSource)
      return [
        400,
        {
          error: 'validation',
          message: 'The selection source does not match this candidate. Reload the page.',
          fields: { selectionSource: 'Does not match.' },
        },
      ];

    // Approval authority.
    const approver = state.approvers.find(x => x.id === body.approverId);
    if (!approver)
      return [
        400,
        {
          error: 'validation',
          message: 'The approver must be an active member of your organisation.',
          fields: { approverId: 'Choose a member of your organisation.' },
        },
      ];
    if (NEEDS_OWNER.includes(a.data.serviceCriticality) && !approver.owner)
      return [
        409,
        {
          error: 'approver_not_authorised',
          message: `This is a ${a.data.serviceCriticality.toLowerCase()} criticality service, so an organisation owner must approve the selection.`,
          fields: { approverId: 'Must be an organisation owner.' },
        },
      ];

    // Hard restrictions: the selection is blocked and nothing is saved as the selected vendor.
    const fit = cand.fit;
    const status = selectionStatus(fit);
    if (status === 'SELECTION_BLOCKED') {
      await audit(req, 'vendor_selection.blocked', {
        db,
        stage: STAGE,
        ref: a.reference,
        detail: {
          reference: a.reference,
          vendorId: cand.id,
          vendorName: cand.name,
          reasons: fit.hardExclusions,
        },
      });
      return [
        409,
        {
          error: 'selection_blocked',
          status,
          message: `${cand.name} cannot be selected: ${fit.hardExclusions.map(h => h.detail).join(' ')}`,
          reasons: fit.hardExclusions,
        },
      ];
    }
    if (fit.exceptions.length && (body.exceptionReason || '').length < 10)
      return [
        400,
        {
          error: 'validation',
          message: 'This vendor does not meet part of your requirement. Give the exception reason.',
          fields: { exceptionReason: 'Explain why you accept this (at least 10 characters).' },
          exceptions: fit.exceptions,
        },
      ];
    if (status === 'CONDITIONALLY_SELECTED' && body.decision === 'SELECT')
      return [
        400,
        {
          error: 'validation',
          message: 'This vendor has open conditions. Choose "Select with conditions".',
          fields: { decision: 'Choose "Select with conditions".' },
          conditions: conditionsFor(fit),
        },
      ];

    const prev = state.current;
    if (prev) {
      if (prev.vendorId === body.vendorId)
        return [409, { error: 'no_changes', message: `${cand.name} is already the selected vendor.` }];
      if ((body.changeReason || '').length < 5)
        return [
          400,
          {
            error: 'validation',
            message: 'Say why the vendor is changing.',
            fields: { changeReason: 'Say why the vendor is changing (at least 5 characters).' },
          },
        ];
    }

    const version = (prev?.version || 0) + 1;
    const conditions = status === 'CONDITIONALLY_SELECTED' ? conditionsFor(fit) : [];
    const comparison = state.candidates.map(v => ({
      id: v.id,
      name: v.name,
      source: v.candidateSource,
      rank: v.rank,
      score: v.fit.score.total,
      eligibility: v.fit.eligibility,
    }));
    const criteria =
      cand.candidateSource === 'DIRECTORY'
        ? state.lastSearch?.criteria || {}
        : cand.candidateSource === 'EXISTING'
          ? cand.reuse
          : { mode: 'ADD_NEW_VENDOR' };
    const record = {
      assessment: a.reference,
      version,
      vendorId: cand.id,
      source: cand.candidateSource,
      criteria,
      comparison,
      rationale: body.rationale,
      approver: approver.id,
      exceptions: fit.exceptions,
      exceptionReason: body.exceptionReason || null,
      confirmedAt: confirmedAt.toISOString(),
      vendorProfileVersion: cand.vendor.profileVersion,
      status,
      decision: body.decision,
      conditions,
      requirementVersion: a.requirement_version,
    };
    const s = (
      await db.query(
        `INSERT INTO vendor_selections (assessment_id, version, vendor_id, vendor_snapshot, match, candidates, rationale, accepted_flags, requirement_version, rule_pack_version,
          selected_by, previous_id, change_reason, snapshot_sha256, selection_mode, source, status, decision, approver_id, exception_reason, conditions,
          selection_criteria, comparison_sha256, vendor_profile_version, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
        [
          a.id,
          version,
          cand.id,
          JSON.stringify(cand.vendor),
          JSON.stringify(fit),
          JSON.stringify(comparison),
          body.rationale,
          JSON.stringify(fit.exceptions),
          a.requirement_version,
          FIT_RULE_PACK,
          req.user.id,
          prev?.id || null,
          prev ? body.changeReason : null,
          sha256(record),
          MODE_OF[cand.candidateSource],
          cand.candidateSource,
          status,
          body.decision,
          approver.id,
          body.exceptionReason || null,
          JSON.stringify(conditions),
          JSON.stringify(criteria),
          sha256(comparison),
          cand.vendor.profileVersion,
          confirmedAt,
        ],
      )
    ).rows[0];
    await db.query(
      'UPDATE assessments SET selected_vendor_id = $2, selection_version = $3, selection_status = $4 WHERE id = $1',
      [a.id, cand.id, version, status],
    );

    // Timeline: Steps 8–9 done, Stage 2 complete, Stage 3 next.
    const ev = (step, title, detail) =>
      db.query(
        `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',2,$2,$3,'done',now(),$4)`,
        [a.id, step, title, JSON.stringify(detail)],
      );
    const label =
      status === 'CONDITIONALLY_SELECTED' ? 'conditionally selected' : 'selected, pending assessment';
    if (!prev) {
      await ev(8, `Vendor ${label}: ${cand.name}`, {
        vendorId: cand.id,
        status,
        source: cand.candidateSource,
      });
      await ev(9, `Vendor Selection Record v${version}.0 saved`, { selectionId: s.id });
      await db.query(
        `DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 2 AND step IS NULL AND kind = 'milestone'`,
        [a.id],
      );
      await db.query(
        `UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 3 AND step IS NULL AND status = 'pending'`,
        [a.id],
      );
    } else {
      await ev(9, `Vendor changed to ${cand.name} (Vendor Selection Record v${version}.0)`, {
        selectionId: s.id,
        previous: prev.vendor.name,
        reason: body.changeReason,
      });
    }
    await audit(req, prev ? 'vendor_selection.changed' : 'vendor_selection.confirmed', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: {
        reference: a.reference,
        version,
        vendorId: cand.id,
        vendorName: cand.name,
        source: cand.candidateSource,
        status,
        decision: body.decision,
        approver: approver.email,
        exceptions: fit.exceptions.map(e => e.id),
        conditions: conditions.length,
        previousVendor: prev?.vendor.name || null,
        snapshotSha256: s.snapshot_sha256,
      },
    });
    return [201, { state: await selectionState(db, a), a, cand, status }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  await notifySelectedVendor(out[1].a, out[1].cand, out[1].status);
  res.status(201).json(out[1].state);
});

/* Emails the selected vendor. A buyer-added vendor with nobody on OffshoreAssure yet gets an invitation to register with its contact email. */
async function notifySelectedVendor(a, cand, status) {
  const people = (
    await query(
      `SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND u.status = 'active'`,
      [cand.id],
    )
  ).rows;
  const what = `${a.buyer_name} has selected ${cand.name} for "${a.title}" (${a.data.serviceCategory}), assessment ${a.reference}.`;
  const conditional =
    status === 'CONDITIONALLY_SELECTED'
      ? ['The selection is conditional: some details still need to be verified.']
      : [];
  try {
    if (people.length) {
      for (const v of people)
        await sendNotice(
          v.email,
          `${a.buyer_name} selected ${cand.name} on OffshoreAssure`,
          [
            `Hello ${v.full_name || ''},`.replace(' ,', ','),
            what,
            ...conditional,
            'Next is the compliance assessment: you will receive a questionnaire and a request for supporting evidence.',
          ],
          {
            kicker: 'VENDOR SELECTION',
            title: 'Your company has been selected',
            action: { label: 'Open your assessments', url: appLink('/vendor/assessments') },
          },
        );
    } else if (cand.vendor.contact?.email) {
      const email = cand.vendor.contact.email;
      await sendNotice(
        email,
        `${a.buyer_name} selected ${cand.name} for an OffshoreAssure assessment`,
        [
          `Hello ${cand.vendor.contact.name || ''},`.replace(' ,', ','),
          what,
          ...conditional,
          `To answer the assurance questionnaire, register on OffshoreAssure as a vendor with this email address (${email}). Your company's details are already filled in.`,
        ],
        {
          kicker: 'VENDOR SELECTION',
          title: 'You have been selected for an assessment',
          action: {
            label: 'Register on OffshoreAssure',
            url: appLink('/signup?role=vendor&email=' + encodeURIComponent(email)),
          },
        },
      );
    }
  } catch (e) {
    console.error('[EMAIL] selection notice failed:', e.message);
  }
}

/* Vendor registration: invitations sent to this email (earlier Stage 2 version) are linked to the vendor's company. */
export async function linkInvitationsForVendor(db, req, userEmail, vendorId) {
  const open = (
    await db.query(`SELECT * FROM vendor_invitations WHERE lower(email) = lower($1) AND status = 'sent'`, [
      userEmail,
    ])
  ).rows;
  for (const inv of open) {
    await db.query(
      `UPDATE vendor_invitations SET vendor_id = $2, status = 'joined', linked_at = now() WHERE id = $1`,
      [inv.id, vendorId],
    );
    await db.query(
      `INSERT INTO vendor_shortlist (assessment_id, vendor_id, added_by, source) VALUES ($1,$2,$3,'invitation') ON CONFLICT DO NOTHING`,
      [inv.assessment_id, vendorId, inv.invited_by],
    );
    const a = (await db.query('SELECT reference FROM assessments WHERE id = $1', [inv.assessment_id]))
      .rows[0];
    await audit(req, 'vendor_selection.invitation_joined', {
      db,
      stage: STAGE,
      ref: a.reference,
      detail: { reference: a.reference, email: inv.email, vendorId },
    });
  }
  return open.length;
}

/* ---------- Vendor portal: selections for the vendor's company ---------- */
export const vendorPortalRouter = Router();
vendorPortalRouter.use(requireRole('vendor'));

vendorPortalRouter.get('/assessments', async (req, res) => {
  const org = (await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id]))
    .rows[0]?.organisation_id;
  if (!org) return res.json({ invitations: [], selected: [] });
  const base = `a.reference, r.title, r.data->>'serviceCategory' AS service_category, r.data->>'serviceCriticality' AS criticality, o.name AS buyer_name, o.sector AS buyer_sector`;
  const invitations = (
    await query(
      `SELECT i.id, i.created_at, i.message, i.status, ${base}, (a.selected_vendor_id = $1) AS selected FROM vendor_invitations i JOIN assessments a ON a.id = i.assessment_id
       JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id WHERE i.vendor_id = $1 AND i.status = 'joined' ORDER BY i.created_at DESC`,
      [org],
    )
  ).rows;
  const selected = (
    await query(
      `SELECT ${base}, s.selected_at, s.version, s.status FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
       JOIN vendor_selections s ON s.assessment_id = a.id AND s.version = a.selection_version WHERE a.selected_vendor_id = $1 ORDER BY s.selected_at DESC`,
      [org],
    )
  ).rows;
  const shape = r => ({
    reference: r.reference,
    title: r.title,
    serviceCategory: r.service_category,
    criticality: r.criticality,
    buyerName: r.buyer_name,
    buyerSector: r.buyer_sector,
  });
  res.json({
    invitations: invitations
      .filter(i => !i.selected)
      .map(i => ({ id: i.id, invitedAt: i.created_at, message: i.message, ...shape(i) })),
    selected: selected.map(s => ({
      ...shape(s),
      selectedAt: s.selected_at,
      selectionVersion: s.version,
      selectionStatus: s.status,
      next: 'Stage 3 · Compliance assessment: questionnaire and evidence request',
    })),
  });
});
