import { Router } from 'express';
import { query } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { requireAdmin } from '../auth/session.js';
import { schemas, parse } from '../validation.js';
import { sendNotice } from '../mailer.js';
import { shapeAssessment } from '../assessments/service.js';
import { decideMembership } from '../organisation/routes.js';
import { ensureProfile, loadProfiles } from '../assessments/profile.js';
import { selectionState } from '../selection/routes.js';
import { complianceState } from '../compliance/routes.js';
import { tx } from '../db.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

/* Registered Users: visible only to the OffshoreAssure admin team. */
export const adminRouter = Router();
adminRouter.use(requireAdmin);

const STATUSES = ['unverified', 'pending', 'active', 'inactive'];

adminRouter.get('/users', async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || 25));
  const where = ["u.role = 'buyer' AND NOT u.is_admin"]; const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(u.email ILIKE $${params.length} OR p.full_name ILIKE $${params.length} OR p.organisation_name ILIKE $${params.length})`); }
  if (status) { params.push(status); where.push(`u.status = $${params.length}`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query(`SELECT count(*) FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id ${w}`, params)).rows[0].count);
  params.push(size, (page - 1) * size);
  const rows = (await query(
    `SELECT u.id, u.email, u.status, u.is_admin, u.created_at, u.email_verified_at, u.last_login_at,
            p.full_name, p.organisation_name, p.sector, p.job_role
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id ${w}
      ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
  const counts = Object.fromEntries((await query("SELECT status, count(*)::int AS n FROM users WHERE role = 'buyer' AND NOT is_admin GROUP BY status")).rows.map(r => [r.status, r.n]));
  res.json({
    total, page, pageSize: size,
    counts: { all: Object.values(counts).reduce((a, b) => a + b, 0), ...Object.fromEntries(STATUSES.map(s => [s, counts[s] || 0])) },
    users: rows.map(r => ({
      id: r.id, email: r.email, status: r.status, isAdmin: r.is_admin, createdAt: r.created_at,
      emailVerifiedAt: r.email_verified_at, lastLoginAt: r.last_login_at,
      fullName: r.full_name, organisationName: r.organisation_name, sector: r.sector, jobRole: r.job_role
    }))
  });
});

/* Activate or deactivate an account (delete is pending confirmation from Mukesh). */
adminRouter.patch('/users/:id', async (req, res) => {
  const body = parse(schemas.adminStatus, req, res); if (!body) return;
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'self', message: 'You cannot change your own account status.' });
  const r = await query('SELECT id, email, status, is_admin FROM users WHERE id = $1', [req.params.id]).catch(() => ({ rows: [] }));
  const target = r.rows[0];
  if (!target) return res.status(404).json({ error: 'not_found', message: 'User not found.' });
  if (target.is_admin) return res.status(400).json({ error: 'admin_account', message: 'Manage admin accounts on the Admin team page.' });
  if (target.status === 'unverified') return res.status(400).json({ error: 'unverified', message: 'This user has not verified their email yet.' });
  await query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [target.id, body.status]);
  await audit(req, body.status === 'active' ? 'admin.user_activated' : 'admin.user_deactivated', { detail: { userId: target.id, email: target.email, from: target.status, to: body.status } });
  res.json({ id: target.id, status: body.status });
});

/* Overview for the admin console: user counts, sign-in activity, registrations per day, latest events. */
adminRouter.get('/overview', async (_req, res) => {
  const one = async (sql, p = []) => (await query(sql, p)).rows[0];
  const counts = Object.fromEntries((await query("SELECT status, count(*)::int AS n FROM users WHERE role = 'buyer' AND NOT is_admin GROUP BY status")).rows.map(r => [r.status, r.n]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const k = await one(`SELECT
      (SELECT count(*)::int FROM users WHERE role = 'buyer' AND NOT is_admin AND created_at > now() - interval '7 days') AS new_7d,
      (SELECT count(*)::int FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.role = 'buyer' AND NOT u.is_admin AND p.organisation_name IS NOT NULL) AS profiles_done,
      (SELECT count(DISTINCT lower(p.organisation_name))::int FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.role = 'buyer' AND NOT u.is_admin AND p.organisation_name IS NOT NULL) AS organisations,
      (SELECT count(*)::int FROM audit_events WHERE event = 'user.signed_in' AND at > now() - interval '24 hours') AS signins_24h,
      (SELECT count(*)::int FROM audit_events WHERE event = 'user.sign_in_failed' AND at > now() - interval '24 hours') AS failed_24h,
      (SELECT count(*)::int FROM audit_events WHERE event = 'verification_code.sent' AND at > now() - interval '24 hours') AS codes_24h`);
  const days = (await query(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
        (SELECT count(*)::int FROM users u WHERE u.role = 'buyer' AND NOT u.is_admin AND u.created_at >= d AND u.created_at < d + interval '1 day') AS n
      FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS d ORDER BY d`)).rows;
  const sectors = (await query(`SELECT COALESCE(p.sector, 'Profile not completed') AS sector, count(*)::int AS n
      FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.role = 'buyer' AND NOT u.is_admin GROUP BY 1 ORDER BY n DESC`)).rows;
  const recent = (await query('SELECT at, actor_email, event, detail FROM audit_events ORDER BY id DESC LIMIT 8')).rows;
  const vendorCounts = Object.fromEntries((await query(`SELECT verification_status, count(*)::int AS n FROM organisations WHERE kind = 'vendor' GROUP BY 1`)).rows.map(r => [r.verification_status, r.n]));
  res.json({
    users: { total, active: counts.active || 0, unverified: counts.unverified || 0, pending: counts.pending || 0, inactive: counts.inactive || 0, new7d: k.new_7d, profilesCompleted: k.profiles_done },
    organisations: k.organisations,
    activity: { signIns24h: k.signins_24h, failedSignIns24h: k.failed_24h, codesSent24h: k.codes_24h },
    vendors: { pending: vendorCounts.pending || 0, approved: vendorCounts.approved || 0, rejected: vendorCounts.rejected || 0 },
    registrationsByDay: days, sectors, recent
  });
});

/* One user: profile, status and their audit history. */
adminRouter.get('/users/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'not_found', message: 'User not found.' });
  const u = (await query(
    `SELECT u.id, u.email, u.status, u.is_admin, u.role, u.created_at, u.email_verified_at, u.last_login_at, u.failed_logins, u.locked_until, u.signup_source,
            p.full_name, p.organisation_name, p.sector, p.job_role, p.phone, p.updated_at AS profile_updated_at
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`, [req.params.id])).rows[0];
  if (!u) return res.status(404).json({ error: 'not_found', message: 'User not found.' });
  const events = (await query(
    `SELECT at, actor_email, event, detail, ip FROM audit_events
      WHERE actor_id = $1 OR detail->>'userId' = $2 ORDER BY id DESC LIMIT 100`, [u.id, u.id])).rows;
  res.json({
    user: {
      id: u.id, email: u.email, status: u.status, isAdmin: u.is_admin, role: u.role, createdAt: u.created_at, emailVerifiedAt: u.email_verified_at, signupSource: u.signup_source,
      lastLoginAt: u.last_login_at, failedLogins: u.failed_logins, lockedUntil: u.locked_until,
      fullName: u.full_name, organisationName: u.organisation_name, sector: u.sector, jobRole: u.job_role, phone: u.phone, profileUpdatedAt: u.profile_updated_at
    },
    events
  });
});

/* Audit log (Evidence Record) with search, event filter and paging. */
adminRouter.get('/audit', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(200, Math.max(10, parseInt(req.query.pageSize || req.query.limit, 10) || 50));
  const where = []; const params = [];
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (search) { params.push(`%${search}%`); where.push(`(actor_email ILIKE $${params.length} OR detail::text ILIKE $${params.length})`); }
  if (req.query.event) { params.push(String(req.query.event).slice(0, 60) + '%'); where.push(`event LIKE $${params.length}`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await query(`SELECT count(*) FROM audit_events ${w}`, params)).rows[0].count);
  params.push(size, (page - 1) * size);
  const rows = (await query(`SELECT id, at, actor_email, event, detail, ip, stage FROM audit_events ${w} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
  const eventTypes = (await query('SELECT DISTINCT event FROM audit_events ORDER BY event')).rows.map(r => r.event);
  res.json({ total, page, pageSize: size, events: rows, eventTypes });
});

/* Platform settings (read-only; secrets are never returned). */
adminRouter.get('/settings', (_req, res) => {
  res.json({
    registration: { requireAdminApproval: config.requireAdminApproval, codeLength: config.codeLength, codeTtlMinutes: config.codeTtlMinutes, codeMaxAttempts: config.codeMaxAttempts, resendCooldownSeconds: config.resendCooldownSeconds },
    security: { maxFailedLogins: config.maxFailedLogins, lockMinutes: config.lockMinutes, sessionHours: config.sessionHours, rateLimit: config.rateLimit },
    email: { configured: Boolean(config.smtp.host), host: config.smtp.host || null, from: config.smtp.from, devShowCodes: config.devShowCodes },
    environment: config.isProd ? 'production' : 'development'
  });
});

/* Buyer organisations: customers grouped by the organisation named in their profile. */
adminRouter.get('/buyers', async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  const params = []; let w = '';
  if (search) { params.push(`%${search}%`); w = `AND (p.organisation_name ILIKE $1 OR u.email ILIKE $1 OR p.full_name ILIKE $1)`; }
  const rows = (await query(
    `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, p.full_name, p.organisation_name, p.sector, p.job_role, p.membership, p.organisation_id
       FROM users u JOIN user_profiles p ON p.user_id = u.id
      WHERE u.role = 'buyer' AND NOT u.is_admin AND p.organisation_name IS NOT NULL ${w} ORDER BY u.created_at`, params)).rows;
  const orgs = new Map();
  for (const r of rows) {
    const key = r.organisation_name.trim().toLowerCase();
    if (!orgs.has(key)) orgs.set(key, { key, id: r.organisation_id, name: r.organisation_name.trim(), sectors: new Set(), users: [], firstRegistered: r.created_at, lastSignIn: null });
    const o = orgs.get(key);
    o.sectors.add(r.sector);
    o.users.push({ id: r.id, email: r.email, status: r.status, fullName: r.full_name, jobRole: r.job_role, membership: r.membership, createdAt: r.created_at, lastLoginAt: r.last_login_at });
    if (r.last_login_at && (!o.lastSignIn || r.last_login_at > o.lastSignIn)) o.lastSignIn = r.last_login_at;
  }
  const noProfile = Number((await query(`SELECT count(*) FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.role = 'buyer' AND NOT u.is_admin AND p.organisation_name IS NULL`)).rows[0].count);
  const organisations = [...orgs.values()].map(o => ({ ...o, sectors: [...o.sectors], active: o.users.filter(u => u.status === 'active').length, pending: o.users.filter(u => u.membership === 'pending').length }))
    .sort((a, b) => b.users.length - a.users.length || a.name.localeCompare(b.name));
  res.json({ organisations, totals: { organisations: organisations.length, users: rows.length, withoutProfile: noProfile } });
});

/* ---------------- Admin team (OffshoreAssure staff) ---------------- */
const teamRow = r => ({ id: r.id, email: r.email, status: r.status, fullName: r.full_name, createdAt: r.created_at, lastLoginAt: r.last_login_at, passwordSet: Boolean(r.email_verified_at) });

adminRouter.get('/team', async (_req, res) => {
  const rows = (await query(
    `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, u.email_verified_at, p.full_name
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.is_admin ORDER BY u.created_at`)).rows;
  res.json({ admins: rows.map(teamRow) });
});

/* Add an admin. They set their own password through "Forgot password" (the emailed code proves the address). */
adminRouter.post('/team', async (req, res) => {
  const body = parse(schemas.adminInvite, req, res); if (!body) return;
  const existing = (await query('SELECT id, is_admin FROM users WHERE lower(email) = lower($1)', [body.email])).rows[0];
  if (existing) return res.status(409).json({ error: existing.is_admin ? 'already_admin' : 'customer_account',
    message: existing.is_admin ? 'This person is already an admin.' : 'This email belongs to a buyer or vendor account. Use a separate email for admin access.' });
  const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const id = (await query(`INSERT INTO users (email, password_hash, status, is_admin, role) VALUES ($1, $2, 'active', true, 'admin') RETURNING id`, [body.email, unusable])).rows[0].id;
  await query(`INSERT INTO user_profiles (user_id, full_name, organisation_name, sector, job_role) VALUES ($1, $2, 'OffshoreAssure', 'Other', 'Other')`, [id, body.fullName]);
  await audit(req, 'admin.admin_added', { detail: { userId: id, email: body.email, fullName: body.fullName } });
  const link = config.frontendOrigin.split(',')[0].trim() + '/forgot-password';
  let emailed = true;
  try {
    await sendNotice(body.email, 'You have been added to the OffshoreAssure admin team', [
      `Hello ${body.fullName},`, `${req.user.email} has added you as an OffshoreAssure admin.`,
      'To set your password, open the link below, enter this email address and use the code we send you.'],
    { kicker: 'ADMIN ACCESS', title: 'Welcome to the admin team', action: { label: 'Set your password', url: link } });
  } catch (e) { emailed = false; console.error('[EMAIL] admin notice failed:', e.message); }
  res.status(201).json({ id, email: body.email, emailed, setPasswordUrl: link });
});

/* Deactivate or reactivate an admin. You cannot change yourself or remove the last active admin. */
adminRouter.patch('/team/:id', async (req, res) => {
  const body = parse(schemas.adminStatus, req, res); if (!body) return;
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'self', message: 'You cannot change your own admin access.' });
  const t = (await query('SELECT id, email, status FROM users WHERE id = $1 AND is_admin', [req.params.id]).catch(() => ({ rows: [] }))).rows[0];
  if (!t) return res.status(404).json({ error: 'not_found', message: 'Admin not found.' });
  if (body.status === 'inactive') {
    const n = Number((await query(`SELECT count(*) FROM users WHERE is_admin AND status = 'active'`)).rows[0].count);
    if (n <= 1) return res.status(400).json({ error: 'last_admin', message: 'At least one active admin is required.' });
  }
  await query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [t.id, body.status]);
  await audit(req, body.status === 'active' ? 'admin.admin_reactivated' : 'admin.admin_deactivated', { detail: { userId: t.id, email: t.email, from: t.status, to: body.status } });
  res.json({ id: t.id, status: body.status });
});

/* ---------------- Assessments (Stage 1 onwards), all buyer organisations ---------------- */
adminRouter.get('/assessments', async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 100);
  const params = []; let w = '';
  if (search) { params.push(`%${search}%`); w = 'WHERE a.reference ILIKE $1 OR r.title ILIKE $1 OR o.name ILIKE $1'; }
  const rows = (await query(
    `SELECT a.*, r.title, o.name AS buyer_name, u.email AS created_by_email, sv.name AS selected_vendor
       FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id JOIN users u ON u.id = a.created_by
       LEFT JOIN organisations sv ON sv.id = a.selected_vendor_id
       ${w} ORDER BY a.created_at DESC LIMIT 200`, params)).rows;
  const counts = (await query(`SELECT risk_tier, count(*)::int AS n FROM assessments GROUP BY risk_tier`)).rows;
  res.json({ assessments: rows.map(a => shapeAssessment(a, { title: a.title, buyerName: a.buyer_name, createdByEmail: a.created_by_email, selectedVendor: a.selected_vendor })),
    byRiskTier: Object.fromEntries(counts.map(c => [c.risk_tier, c.n])) });
});

adminRouter.get('/assessments/:ref', async (req, res) => {
  const a = (await query(
    `SELECT a.*, r.title, r.data, o.name AS buyer_name, u.email AS created_by_email, v.name AS vendor_name
       FROM assessments a JOIN requirements r ON r.id = a.requirement_id JOIN organisations o ON o.id = a.buyer_id JOIN users u ON u.id = a.created_by
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.reference = $1`, [req.params.ref])).rows[0];
  if (!a) return res.status(404).json({ error: 'not_found', message: 'Assessment not found.' });
  await tx(db => ensureProfile(db, req, a.id));
  res.json({ assessment: shapeAssessment(a, { title: a.title, buyerName: a.buyer_name, createdByEmail: a.created_by_email }), requirement: { id: a.requirement_id, data: a.data },
    ...(await loadProfiles({ query }, a.id)), selection: await selectionState({ query }, a), compliance: await complianceState({ query }, a) });
});

/* ---------------- Vendors (suppliers): companies and their verification (ASS-001) ---------------- */
const vendorShape = o => ({
  id: o.id, name: o.name, registrationNumber: o.registration_number, country: o.country, website: o.website, description: o.description,
  services: o.services, deliveryCountries: o.delivery_countries, verificationStatus: o.verification_status, verificationNote: o.verification_note,
  verifiedAt: o.verified_at, verifiedByEmail: o.verified_by_email || null, createdAt: o.created_at, updatedAt: o.updated_at, users: o.users ?? undefined
});

adminRouter.get('/vendors', async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const search = String(req.query.search || '').trim().slice(0, 100);
  const params = []; const where = ["o.kind = 'vendor'"];
  if (status) { params.push(status); where.push(`o.verification_status = $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`(o.name ILIKE $${params.length} OR o.registration_number ILIKE $${params.length})`); }
  const rows = (await query(`SELECT o.*, (SELECT count(*)::int FROM user_profiles p WHERE p.organisation_id = o.id) AS users
      FROM organisations o WHERE ${where.join(' AND ')} ORDER BY (o.verification_status = 'pending') DESC, o.created_at DESC`, params)).rows;
  const counts = Object.fromEntries((await query(`SELECT verification_status, count(*)::int AS n FROM organisations WHERE kind = 'vendor' GROUP BY 1`)).rows.map(r => [r.verification_status, r.n]));
  res.json({ vendors: rows.map(vendorShape), counts: { pending: counts.pending || 0, approved: counts.approved || 0, rejected: counts.rejected || 0 } });
});

adminRouter.get('/vendors/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'not_found', message: 'Vendor not found.' });
  const o = (await query(`SELECT o.*, v.email AS verified_by_email FROM organisations o LEFT JOIN users v ON v.id = o.verified_by WHERE o.id = $1 AND o.kind = 'vendor'`, [req.params.id])).rows[0];
  if (!o) return res.status(404).json({ error: 'not_found', message: 'Vendor not found.' });
  const users = (await query(`SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, p.full_name, p.job_role, p.phone
      FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 ORDER BY u.created_at`, [o.id])).rows;
  const events = (await query(`SELECT at, actor_email, event, detail FROM audit_events WHERE detail->>'organisationId' = $1 ORDER BY id DESC LIMIT 100`, [o.id])).rows;
  const assessments = (await query(
    `SELECT a.reference, r.title, b.name AS buyer_name, (a.selected_vendor_id = $1) AS selected, s.added_at, s.source
       FROM vendor_shortlist s JOIN assessments a ON a.id = s.assessment_id JOIN requirements r ON r.id = a.requirement_id JOIN organisations b ON b.id = a.buyer_id
      WHERE s.vendor_id = $1 ORDER BY s.added_at DESC`, [o.id])).rows.map(x => ({ reference: x.reference, title: x.title, buyerName: x.buyer_name, selected: x.selected, addedAt: x.added_at, source: x.source }));
  res.json({ vendor: vendorShape(o), users: users.map(u => ({ id: u.id, email: u.email, status: u.status, createdAt: u.created_at, lastLoginAt: u.last_login_at, fullName: u.full_name, jobRole: u.job_role, phone: u.phone })), events, assessments });
});

/* Approve or reject a vendor company. A rejection needs a reason, which the vendor sees. The vendor's users are emailed. */
adminRouter.patch('/vendors/:id', async (req, res) => {
  const body = parse(schemas.vendorDecision, req, res); if (!body) return;
  if (body.status === 'rejected' && (body.note || '').length < 5) return res.status(400).json({ error: 'validation', message: 'Give the reason for rejecting (the vendor will see it).', fields: { note: 'Give the reason (at least 5 characters).' } });
  const o = /^[0-9a-f-]{36}$/i.test(req.params.id) && (await query(`SELECT * FROM organisations WHERE id = $1 AND kind = 'vendor'`, [req.params.id])).rows[0];
  if (!o) return res.status(404).json({ error: 'not_found', message: 'Vendor not found.' });
  await query(`UPDATE organisations SET verification_status = $2, verification_note = $3, verified_at = now(), verified_by = $4, updated_at = now() WHERE id = $1`,
    [o.id, body.status, body.note || null, req.user.id]);
  await audit(req, body.status === 'approved' ? 'admin.vendor_approved' : 'admin.vendor_rejected', { detail: { organisationId: o.id, organisationName: o.name, from: o.verification_status, to: body.status, note: body.note || null } });
  const recipients = (await query(`SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND u.status = 'active'`, [o.id])).rows;
  const link = config.frontendOrigin.split(',')[0].trim() + '/vendor';
  for (const r of recipients) {
    try {
      await sendNotice(r.email, body.status === 'approved' ? `${o.name} is verified on OffshoreAssure` : `Update on ${o.name}'s verification`,
        body.status === 'approved'
          ? [`Hello ${r.full_name || ''},`.replace(' ,', ','), `The OffshoreAssure team has verified ${o.name}. Your company profile can now be presented to UK buyers on the platform.`]
          : [`Hello ${r.full_name || ''},`.replace(' ,', ','), `The OffshoreAssure team could not verify ${o.name} yet.`, `Reason: ${body.note}`, 'Update your company details in the vendor portal and we will review them again.'],
        { kicker: 'VENDOR VERIFICATION', title: body.status === 'approved' ? 'Your company is verified' : 'Verification needs attention', action: { label: 'Open the vendor portal', url: link } });
    } catch (e) { console.error('[EMAIL] vendor notice failed:', e.message); }
  }
  res.json({ id: o.id, verificationStatus: body.status });
});

/* Admin decision on a pending buyer-organisation member (e.g. when the owner is unavailable). */
adminRouter.patch('/buyers/members/:userId', async (req, res) => {
  const action = req.body?.action;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'validation', message: 'Choose approve or reject.' });
  const p = (await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.params.userId]).catch(() => ({ rows: [] }))).rows[0];
  if (!p?.organisation_id) return res.status(404).json({ error: 'not_found', message: 'Person not found.' });
  const [status, body] = await decideMembership(req, p.organisation_id, req.params.userId, action);
  res.status(status).json(body);
});

/* ---------------- Website feedback ---------------- */
adminRouter.get('/feedback', async (req, res) => {
  const rows = (await query(`SELECT f.*, u.role FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC LIMIT 300`)).rows;
  res.json({ feedback: rows.map(f => ({ id: f.id, kind: f.kind, rating: f.rating, message: f.message, name: f.name, email: f.email, role: f.role || null, page: f.page, status: f.status, createdAt: f.created_at,
    publicConsent: f.public_consent, published: f.published, publishedAt: f.published_at })), published: rows.filter(f => f.published).length,
    unread: rows.filter(f => f.status === 'new').length });
});
/* Body: { status: 'new'|'read' } and/or { published: true|false }. Publishing needs the sender's consent. */
adminRouter.patch('/feedback/:id', async (req, res) => {
  const { status, published } = req.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || (status === undefined && published === undefined)
    || (status !== undefined && !['new', 'read'].includes(status)) || (published !== undefined && typeof published !== 'boolean'))
    return res.status(400).json({ error: 'validation', message: 'Invalid request.' });
  const f = (await query('SELECT * FROM feedback WHERE id = $1', [req.params.id])).rows[0];
  if (!f) return res.status(404).json({ error: 'not_found', message: 'Message not found.' });
  if (published && !f.public_consent) return res.status(409).json({ error: 'no_consent', message: 'The sender did not agree to show this on the website, so it cannot be published.' });
  if (status !== undefined) await query('UPDATE feedback SET status = $2 WHERE id = $1', [f.id, status]);
  if (published !== undefined && published !== f.published) {
    await query(`UPDATE feedback SET published = $2, published_at = CASE WHEN $2 THEN now() ELSE NULL END, published_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
        status = 'read' WHERE id = $1`, [f.id, published, req.user.id]);
    await audit(req, published ? 'feedback.published' : 'feedback.unpublished', { detail: { feedbackId: f.id, rating: f.rating } });
  }
  res.json({ ok: true });
});
