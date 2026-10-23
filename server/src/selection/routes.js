/* Stage 2 — Vendor selection (sequence diagram steps 5–9).
   Step 5  Search or select vendor ............ GET  /api/assessments/:ref/vendors, POST /:ref/invitations
   Step 6  Match service, location and scope .. engine/matching.js (every vendor result carries its match)
   Step 7  Candidate list and comparison ....... GET  /:ref/selection, POST/DELETE /:ref/shortlist
   Step 8  Confirm selected vendor ............. POST /:ref/selection
   Step 9  Save selection and decision rationale  vendor_selections (append-only), timeline, audit
   Buyers only (approved members of the buyer organisation). Vendors see their invitations and selections at /api/vendor. */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { requireRole } from '../auth/session.js';
import { sendNotice } from '../mailer.js';
import { email as emailSchema } from '../validation.js';
import { buyerOrganisation, requireActiveMembership } from '../assessments/service.js';
import { buildSummary } from '../assessments/profile.js';
import { matchVendor, MATCH_ORDER, MATCH_RULE_PACK } from '../engine/matching.js';
import { countryName } from '../reference/countries.js';

export const selectionRouter = Router();
const buyerOnly = [requireRole('buyer'), requireActiveMembership];

const appLink = path => config.frontendOrigin.split(',')[0].trim() + path;
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const sha256 = o => crypto.createHash('sha256').update(JSON.stringify(stable(o))).digest('hex');
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));

export const vendorCard = o => ({
  id: o.id, name: o.name, country: o.country, registrationNumber: o.registration_number, website: o.website, description: o.description,
  services: o.services || [], deliveryCountries: o.delivery_countries || [], verificationStatus: o.verification_status, verifiedAt: o.verified_at
});
const withMatch = (d, o) => { const v = vendorCard(o); return { ...v, match: matchVendor(d, v) }; };

/* The assessment of the signed-in buyer's organisation, with the current requirement answers. */
async function ownAssessment(db, req, { lock = false } = {}) {
  const buyerId = await buyerOrganisation(db, req.user.id);
  if (!buyerId) return null;
  return (await db.query(
    `SELECT a.*, r.data, r.title, o.name AS buyer_name FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
      WHERE a.reference = $1 AND a.buyer_id = $2${lock ? ' FOR UPDATE OF a' : ''}`, [req.params.ref, buyerId])).rows[0] || null;
}
const notFound = res => res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });

/* What the matching uses from the requirement (shown to the buyer above the results). */
const criteria = d => ({
  serviceCategory: d.serviceCategory, buyerCountry: d.buyerCountry,
  preferredCountries: d.preferredCountries || [], restrictedCountries: d.restrictedCountries || [], remoteAccessCountries: d.remoteAccessCountries || [],
  names: Object.fromEntries([d.buyerCountry, ...(d.preferredCountries || []), ...(d.restrictedCountries || []), ...(d.remoteAccessCountries || [])].filter(Boolean).map(c => [c, countryName(c)]))
});

/* ---------- Step 5: search verified vendors ---------- */
selectionRouter.get('/:ref/vendors', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req); if (!a) return notFound(res);
  const search = String(req.query.search || '').trim().slice(0, 100);
  const service = String(req.query.service || '').trim();
  const country = String(req.query.country || '').trim().toUpperCase();
  const params = []; const where = [`o.kind = 'vendor'`, `o.verification_status = 'approved'`];
  if (search) { params.push(`%${search}%`); where.push(`(o.name ILIKE $${params.length} OR o.description ILIKE $${params.length})`); }
  if (service) { params.push(service); where.push(`$${params.length} = ANY(o.services)`); }
  if (/^[A-Z]{2}$/.test(country)) { params.push(country); where.push(`$${params.length} = ANY(o.delivery_countries)`); }
  const rows = (await query(`SELECT o.* FROM organisations o WHERE ${where.join(' AND ')} ORDER BY lower(o.name) LIMIT 200`, params)).rows;
  const listed = new Set((await query('SELECT vendor_id FROM vendor_shortlist WHERE assessment_id = $1', [a.id])).rows.map(r => r.vendor_id));
  const vendors = rows.map(o => ({ ...withMatch(a.data, o), shortlisted: listed.has(o.id) }))
    .sort((x, y) => MATCH_ORDER[x.match.result] - MATCH_ORDER[y.match.result] || x.name.localeCompare(y.name));
  res.json({ vendors, criteria: criteria(a.data), total: vendors.length });
});

/* ---------- Step 7: candidate list, invitations and the saved selection ---------- */
export async function selectionState(db, a) {
  const shortlist = (await db.query(
    `SELECT o.*, s.added_at, s.source, u.email AS added_by_email FROM vendor_shortlist s JOIN organisations o ON o.id = s.vendor_id JOIN users u ON u.id = s.added_by
      WHERE s.assessment_id = $1 ORDER BY s.added_at`, [a.id])).rows
    .map(o => ({ ...withMatch(a.data, o), addedAt: o.added_at, addedByEmail: o.added_by_email, source: o.source }));
  const invitations = (await db.query(
    `SELECT i.*, u.email AS invited_by_email, o.name AS vendor_name, o.verification_status FROM vendor_invitations i JOIN users u ON u.id = i.invited_by
       LEFT JOIN organisations o ON o.id = i.vendor_id WHERE i.assessment_id = $1 AND i.status <> 'cancelled' ORDER BY i.created_at DESC`, [a.id])).rows
    .map(i => ({ id: i.id, email: i.email, companyName: i.company_name, status: i.status, createdAt: i.created_at, invitedByEmail: i.invited_by_email,
      vendorId: i.vendor_id, vendorName: i.vendor_name, verificationStatus: i.verification_status, linkedAt: i.linked_at }));
  const versions = (await db.query(
    `SELECT s.*, u.email AS selected_by_email FROM vendor_selections s JOIN users u ON u.id = s.selected_by WHERE s.assessment_id = $1 ORDER BY s.version`, [a.id])).rows
    .map(s => ({ id: s.id, version: s.version, vendorId: s.vendor_id, vendor: s.vendor_snapshot, match: s.match, candidates: s.candidates, rationale: s.rationale,
      acceptedFlags: s.accepted_flags, requirementVersion: s.requirement_version, rulePackVersion: s.rule_pack_version, selectedAt: s.selected_at,
      selectedByEmail: s.selected_by_email, previousId: s.previous_id, changeReason: s.change_reason, snapshotSha256: s.snapshot_sha256 }));
  const summary = await buildSummary(db, a.id);
  const stage1 = summary?.currentStatus || null;
  return {
    assessment: { reference: a.reference, title: a.title, serviceCode: a.service_code, riskTier: a.risk_tier, requirementVersion: a.requirement_version, buyerName: a.buyer_name },
    criteria: criteria(a.data), stage1Status: stage1,
    blocked: stage1?.code === 'INFORMATION_REQUIRED' ? 'Some requirement answers contradict each other. Correct them (Stage 1) before confirming a vendor.' : null,
    shortlist, invitations, current: versions[versions.length - 1] || null, versions, rulePackVersion: MATCH_RULE_PACK
  };
}

selectionRouter.get('/:ref/selection', ...buyerOnly, async (req, res) => {
  const a = await ownAssessment({ query }, req); if (!a) return notFound(res);
  res.json(await selectionState({ query }, a));
});

selectionRouter.post('/:ref/shortlist', ...buyerOnly, async (req, res) => {
  const vendorId = req.body?.vendorId;
  const out = await tx(async db => {
    const a = await ownAssessment(db, req); if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    if (!isUuid(vendorId)) return [400, { error: 'validation', message: 'Choose a vendor.' }];
    const o = (await db.query(`SELECT * FROM organisations WHERE id = $1 AND kind = 'vendor'`, [vendorId])).rows[0];
    const invited = o && (await db.query(`SELECT 1 FROM vendor_invitations WHERE assessment_id = $1 AND vendor_id = $2 AND status = 'joined'`, [a.id, o.id])).rows[0];
    if (!o || (o.verification_status !== 'approved' && !invited)) return [404, { error: 'not_found', message: 'Vendor not found.' }];
    const ins = await db.query(`INSERT INTO vendor_shortlist (assessment_id, vendor_id, added_by, source) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [a.id, o.id, req.user.id, invited ? 'invitation' : 'search']);
    if (ins.rowCount) {
      const m = matchVendor(a.data, vendorCard(o));
      await audit(req, 'vendor_selection.shortlisted', { db, stage: 'stage-2', ref: a.reference, detail: { reference: a.reference, vendorId: o.id, vendorName: o.name, match: m.result } });
    }
    return [200, await selectionState(db, a)];
  });
  res.status(out[0]).json(out[1]);
});

selectionRouter.delete('/:ref/shortlist/:vendorId', ...buyerOnly, async (req, res) => {
  const out = await tx(async db => {
    const a = await ownAssessment(db, req); if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    if (!isUuid(req.params.vendorId)) return [404, { error: 'not_found', message: 'Vendor not on the shortlist.' }];
    if (a.selected_vendor_id === req.params.vendorId) return [409, { error: 'selected', message: 'This is the selected vendor. Select a different vendor first.' }];
    const del = (await db.query('DELETE FROM vendor_shortlist WHERE assessment_id = $1 AND vendor_id = $2 RETURNING vendor_id', [a.id, req.params.vendorId])).rows[0];
    if (!del) return [404, { error: 'not_found', message: 'Vendor not on the shortlist.' }];
    const name = (await db.query('SELECT name FROM organisations WHERE id = $1', [del.vendor_id])).rows[0]?.name;
    await audit(req, 'vendor_selection.removed_from_shortlist', { db, stage: 'stage-2', ref: a.reference, detail: { reference: a.reference, vendorId: del.vendor_id, vendorName: name } });
    return [200, await selectionState(db, a)];
  });
  res.status(out[0]).json(out[1]);
});

/* ---------- Step 5 (alternative): invite a vendor by email ---------- */
const inviteSchema = z.object({
  email: emailSchema,
  companyName: z.string().trim().min(2, 'Enter the company name.').max(200),
  message: z.string().trim().max(500, 'Use at most 500 characters.').optional().or(z.literal(''))
});

selectionRouter.post('/:ref/invitations', ...buyerOnly, async (req, res) => {
  const p = inviteSchema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'validation', message: 'Check the highlighted fields.', fields: Object.fromEntries(p.error.issues.map(i => [i.path[0], i.message])) });
  const body = p.data;
  const out = await tx(async db => {
    const a = await ownAssessment(db, req); if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const user = (await db.query(`SELECT u.id, u.role, u.is_admin, p.organisation_id FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE lower(u.email) = $1`, [body.email])).rows[0];
    if (user && (user.role !== 'vendor' || user.is_admin)) return [409, { error: 'not_a_vendor', message: 'This email belongs to an account that is not a vendor.', fields: { email: 'This person is not registered as a vendor.' } }];
    const dup = (await db.query(`SELECT 1 FROM vendor_invitations WHERE assessment_id = $1 AND lower(email) = $2 AND status <> 'cancelled'`, [a.id, body.email])).rows[0];
    if (dup) return [409, { error: 'already_invited', message: 'This vendor has already been invited to this assessment.', fields: { email: 'Already invited.' } }];
    const inv = (await db.query(`INSERT INTO vendor_invitations (assessment_id, email, company_name, message, invited_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [a.id, body.email, body.companyName, body.message || null, req.user.id])).rows[0];
    await audit(req, 'vendor_selection.invited', { db, stage: 'stage-2', ref: a.reference, detail: { reference: a.reference, email: body.email, companyName: body.companyName, existingVendor: !!user?.organisation_id } });
    if (user?.organisation_id) await linkInvitation(db, req, inv, user.organisation_id);
    return [201, { invitation: { id: inv.id }, onPlatform: !!user?.organisation_id, state: await selectionState(db, a), a }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { a, onPlatform } = out[1];
  try {
    await sendNotice(body.email, `${a.buyer_name} invites ${body.companyName} to an OffshoreAssure assessment`,
      [`Hello,`, `${a.buyer_name} is selecting a vendor for "${a.title}" (${a.data.serviceCategory}) and has invited ${body.companyName} to take part.`,
        ...(body.message ? [`Their message: “${body.message}”`] : []),
        onPlatform ? 'Your company is already on OffshoreAssure. Sign in to see the invitation under Assessments.'
          : 'Register your company on OffshoreAssure with this email address. Once the OffshoreAssure team verifies your company, the buyer can select you.'],
      { kicker: 'VENDOR INVITATION', title: 'You have been invited to an assessment',
        action: onPlatform ? { label: 'Sign in to OffshoreAssure', url: appLink('/login') } : { label: 'Register your company', url: appLink('/signup?role=vendor&email=' + encodeURIComponent(body.email)) } });
  } catch (e) { console.error('[EMAIL] vendor invitation failed:', e.message); }
  res.status(201).json(out[1].state);
});

/* Connects an invitation to a vendor company and puts the vendor on the buyer's shortlist. */
async function linkInvitation(db, req, inv, vendorId) {
  await db.query(`UPDATE vendor_invitations SET vendor_id = $2, status = 'joined', linked_at = now() WHERE id = $1`, [inv.id, vendorId]);
  await db.query(`INSERT INTO vendor_shortlist (assessment_id, vendor_id, added_by, source) VALUES ($1,$2,$3,'invitation') ON CONFLICT DO NOTHING`, [inv.assessment_id, vendorId, inv.invited_by]);
  const a = (await db.query('SELECT reference FROM assessments WHERE id = $1', [inv.assessment_id])).rows[0];
  await audit(req, 'vendor_selection.invitation_joined', { db, stage: 'stage-2', ref: a.reference, detail: { reference: a.reference, email: inv.email, vendorId } });
}

/* Called when a vendor completes or updates their company profile: open invitations sent to their email are linked. */
export async function linkInvitationsForVendor(db, req, userEmail, vendorId) {
  const open = (await db.query(`SELECT * FROM vendor_invitations WHERE lower(email) = lower($1) AND status = 'sent'`, [userEmail])).rows;
  for (const inv of open) await linkInvitation(db, req, inv, vendorId);
  return open.length;
}

/* ---------- Steps 8–9: confirm the vendor and save the decision ---------- */
const confirmSchema = z.object({
  vendorId: z.string().uuid('Choose a vendor from the shortlist.'),
  rationale: z.string().trim().min(20, 'Explain the decision in at least 20 characters.').max(2000, 'Use at most 2,000 characters.'),
  acceptFlags: z.boolean().optional().default(false),
  changeReason: z.string().trim().max(500).optional().or(z.literal(''))
});

selectionRouter.post('/:ref/selection', ...buyerOnly, async (req, res) => {
  const p = confirmSchema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'validation', message: 'Check the highlighted fields.', fields: Object.fromEntries(p.error.issues.map(i => [i.path[0], i.message])) });
  const body = p.data;
  const out = await tx(async db => {
    const a = await ownAssessment(db, req, { lock: true }); if (!a) return [404, { error: 'not_found', message: 'Assessment not found.' }];
    const state = await selectionState(db, a);
    if (state.blocked) return [409, { error: 'information_required', message: state.blocked }];
    const cand = state.shortlist.find(v => v.id === body.vendorId);
    if (!cand) return [400, { error: 'not_shortlisted', message: 'Add the vendor to the shortlist first.', fields: { vendorId: 'Not on the shortlist.' } }];
    if (!cand.match.selectable) return [409, { error: 'not_verified', message: `${cand.name} is not verified by OffshoreAssure yet, so it cannot be selected.` }];
    if (cand.match.flags.length && !body.acceptFlags)
      return [409, { error: 'accept_flags', message: 'This vendor does not fully match the requirement. Confirm that you accept the issues listed.', flags: cand.match.flags }];
    const prev = state.current;
    if (prev && (await db.query('SELECT 1 FROM compliance_assessments WHERE assessment_id = $1', [a.id])).rows[0])
      return [409, { error: 'compliance_started', message: 'The compliance assessment has already started with the selected vendor, so the vendor cannot be changed here.' }];
    if (prev) {
      if (prev.vendorId === body.vendorId) return [409, { error: 'no_changes', message: `${cand.name} is already the selected vendor.` }];
      if ((body.changeReason || '').length < 5) return [400, { error: 'validation', message: 'Say why the vendor is changing.', fields: { changeReason: 'Say why the vendor is changing (at least 5 characters).' } }];
    }
    const version = (prev?.version || 0) + 1;
    const { match, ...vendor } = cand;
    const candidates = state.shortlist.map(v => ({ id: v.id, name: v.name, result: v.match.result, flags: v.match.flags }));
    const record = { assessment: a.reference, version, vendor, match, candidates, rationale: body.rationale, acceptedFlags: body.acceptFlags ? match.flags : [], requirementVersion: a.requirement_version };
    const s = (await db.query(
      `INSERT INTO vendor_selections (assessment_id, version, vendor_id, vendor_snapshot, match, candidates, rationale, accepted_flags, requirement_version, rule_pack_version, selected_by, previous_id, change_reason, snapshot_sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [a.id, version, cand.id, JSON.stringify(vendor), JSON.stringify(match), JSON.stringify(candidates), body.rationale, JSON.stringify(record.acceptedFlags),
        a.requirement_version, MATCH_RULE_PACK, req.user.id, prev?.id || null, prev ? body.changeReason : null, sha256(record)])).rows[0];
    await db.query('UPDATE assessments SET selected_vendor_id = $2, selection_version = $3 WHERE id = $1', [a.id, cand.id, version]);
    // Timeline: Steps 8–9 done, Stage 2 complete, Stage 3 next.
    const ev = (step, title, detail) => db.query(`INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',2,$2,$3,'done',now(),$4)`, [a.id, step, title, JSON.stringify(detail)]);
    if (!prev) {
      await ev(8, `Vendor selected: ${cand.name}`, { vendorId: cand.id, match: match.result });
      await ev(9, `Selection and decision rationale saved (v${version})`, { selectionId: s.id });
      await db.query(`DELETE FROM assessment_timeline WHERE assessment_id = $1 AND stage = 2 AND step IS NULL AND kind = 'milestone'`, [a.id]);
      await db.query(`UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 3 AND step IS NULL AND status = 'pending'`, [a.id]);
    } else {
      await ev(9, `Vendor changed to ${cand.name} (selection v${version})`, { selectionId: s.id, previous: prev.vendor.name, reason: body.changeReason });
    }
    await audit(req, prev ? 'vendor_selection.changed' : 'vendor_selection.confirmed', { db, stage: 'stage-2', ref: a.reference,
      detail: { reference: a.reference, version, vendorId: cand.id, vendorName: cand.name, match: match.result, acceptedFlags: record.acceptedFlags, previousVendor: prev?.vendor.name || null, snapshotSha256: s.snapshot_sha256 } });
    return [201, { state: await selectionState(db, a), a, vendorName: cand.name, vendorId: cand.id, previous: prev }];
  });
  if (out[0] !== 201) return res.status(out[0]).json(out[1]);
  const { a, vendorName, vendorId } = out[1];
  const people = (await query(`SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND u.status = 'active'`, [vendorId])).rows;
  for (const v of people) {
    try {
      await sendNotice(v.email, `${a.buyer_name} selected ${vendorName} on OffshoreAssure`,
        [`Hello ${v.full_name || ''},`.replace(' ,', ','), `${a.buyer_name} has selected ${vendorName} for "${a.title}" (${a.data.serviceCategory}), assessment ${a.reference}.`,
          'The next stage is the compliance assessment: you will receive a questionnaire and a request for supporting evidence.'],
        { kicker: 'VENDOR SELECTION', title: 'Your company has been selected', action: { label: 'Open your assessments', url: appLink('/vendor/assessments') } });
    } catch (e) { console.error('[EMAIL] selection notice failed:', e.message); }
  }
  res.status(201).json(out[1].state);
});

/* ---------- Vendor portal: invitations and selections for the vendor's company ---------- */
export const vendorPortalRouter = Router();
vendorPortalRouter.use(requireRole('vendor'));

vendorPortalRouter.get('/assessments', async (req, res) => {
  const org = (await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0]?.organisation_id;
  if (!org) return res.json({ invitations: [], selected: [] });
  const base = `a.reference, r.title, r.data->>'serviceCategory' AS service_category, r.data->>'serviceCriticality' AS criticality, o.name AS buyer_name, o.sector AS buyer_sector`;
  const invitations = (await query(
    `SELECT i.id, i.created_at, i.message, i.status, ${base}, (a.selected_vendor_id = $1) AS selected FROM vendor_invitations i JOIN assessments a ON a.id = i.assessment_id
       JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id WHERE i.vendor_id = $1 AND i.status = 'joined' ORDER BY i.created_at DESC`, [org])).rows;
  const selected = (await query(
    `SELECT ${base}, s.selected_at, s.version FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id
       JOIN vendor_selections s ON s.assessment_id = a.id AND s.version = a.selection_version WHERE a.selected_vendor_id = $1 ORDER BY s.selected_at DESC`, [org])).rows;
  const shape = r => ({ reference: r.reference, title: r.title, serviceCategory: r.service_category, criticality: r.criticality, buyerName: r.buyer_name, buyerSector: r.buyer_sector });
  res.json({
    invitations: invitations.filter(i => !i.selected).map(i => ({ id: i.id, invitedAt: i.created_at, message: i.message, ...shape(i) })),
    selected: selected.map(s => ({ ...shape(s), selectedAt: s.selected_at, selectionVersion: s.version, next: 'Stage 3 · Compliance assessment: questionnaire and evidence request (not available yet)' }))
  });
});
