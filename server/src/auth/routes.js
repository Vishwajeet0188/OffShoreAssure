import { linkInvitationsForVendor } from '../selection/routes.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { sendCode } from '../mailer.js';
import { issueCode, checkCode, cooldownLeft } from './codes.js';
import { startSession, endSession, requireAuth } from './session.js';
import { schemas, parse } from '../validation.js';
import { ensureOrganisation, membershipFor } from '../assessments/service.js';
import { notifyJoinRequest } from '../organisation/routes.js';

export const authRouter = Router();
export const meRouter = Router();

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);
const findUser = (db, email) => db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]).then(r => r.rows[0]);

const CODE_MESSAGES = {
  no_code: 'No active code. Request a new code.',
  expired: 'This code has expired. Request a new code.',
  wrong_code: 'That code is not correct.',
  too_many_attempts: 'Too many incorrect attempts. Request a new code.'
};

/* Sends a code by email; returns fields the client needs for the popup. */
async function deliver(email, code, purpose) {
  try { await sendCode(email, code, purpose); }
  catch (e) {
    console.error('[EMAIL] could not send', purpose, 'code to', email, '-', e.message);
    throw Object.assign(new Error('email_failed'), { status: 502 });
  }
  return {
    email, expiresInMinutes: config.codeTtlMinutes, resendInSeconds: config.resendCooldownSeconds,
    ...(config.devShowCodes ? { devCode: code } : {})
  };
}

export async function userPayload(db, userId) {
  const r = await db.query(
    `SELECT u.id, u.email, u.status, u.is_admin, u.role, u.created_at, u.last_login_at,
            p.full_name, p.organisation_name, p.sector, p.job_role, p.phone,
            o.id AS org_id, o.registration_number, o.country, o.website, o.description, o.services, o.delivery_countries,
            o.verification_status, o.verification_note, o.verified_at, p.membership
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id LEFT JOIN organisations o ON o.id = p.organisation_id
      WHERE u.id = $1`, [userId]);
  const u = r.rows[0];
  if (!u) return null;
  const role = u.is_admin ? 'admin' : u.role;
  const profile = { fullName: u.full_name || '', organisationName: u.organisation_name || '', sector: u.sector || '', jobRole: u.job_role || '', phone: u.phone || '' };
  let profileComplete = Boolean(profile.fullName && profile.organisationName && profile.sector && profile.jobRole);
  let vendor = null;
  if (role === 'vendor') {
    profileComplete = Boolean(profile.fullName && profile.jobRole && u.org_id);
    vendor = u.org_id ? {
      organisationId: u.org_id, registrationNumber: u.registration_number, country: u.country, website: u.website || '', description: u.description || '',
      services: u.services || [], deliveryCountries: u.delivery_countries || [],
      verificationStatus: u.verification_status, verificationNote: u.verification_note, verifiedAt: u.verified_at
    } : null;
  }
  return {
    user: { id: u.id, email: u.email, status: u.status, isAdmin: u.is_admin, role, createdAt: u.created_at, lastLoginAt: u.last_login_at },
    profile, profileComplete, vendor,
    membership: role === 'buyer' && u.org_id ? u.membership : null
  };
}

/* ---------------- Register: email + password → code by email ---------------- */
authRouter.post('/register', async (req, res) => {
  const body = parse(schemas.register, req, res); if (!body) return;
  const hash = await bcrypt.hash(body.password, 12);
  const out = await tx(async db => {
    const existing = await findUser(db, body.email);
    if (existing && existing.status !== 'unverified') return { conflict: true };
    let user = existing;
    if (user) {
      await db.query('UPDATE users SET password_hash = $2, role = $3, updated_at = now() WHERE id = $1', [user.id, hash, body.role]);
      const wait = await cooldownLeft(db, user.id, 'register');
      if (wait > 0) return { user, wait };
    } else {
      user = (await db.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *', [body.email, hash, body.role])).rows[0];
      await audit(req, 'user.registered', { actor: user, detail: { status: 'unverified', role: body.role }, db });
    }
    const code = await issueCode(db, user.id, 'register');
    await audit(req, 'verification_code.sent', { actor: user, detail: { purpose: 'register' }, db });
    return { user, code };
  });
  if (out.conflict) return res.status(409).json({ error: 'email_taken', message: 'An account with this email already exists. Please sign in instead.' });
  if (out.wait) return res.json({ status: 'code_sent', email: body.email, expiresInMinutes: config.codeTtlMinutes, resendInSeconds: out.wait, message: 'A code was sent recently. Check your inbox.' });
  res.status(201).json({ status: 'code_sent', ...(await deliver(body.email, out.code, 'register')) });
});

/* ---------------- Verify the registration code ---------------- */
authRouter.post('/verify', async (req, res) => {
  const body = parse(schemas.verify, req, res); if (!body) return;
  const out = await tx(async db => {
    const user = await findUser(db, body.email);
    if (!user || user.status !== 'unverified') return { error: 'no_code' };
    const r = await checkCode(db, user.id, 'register', body.code);
    if (!r.ok) {
      await audit(req, 'verification_code.failed', { actor: user, detail: { purpose: 'register', reason: r.reason }, db });
      return { error: r.reason, attemptsLeft: r.attemptsLeft };
    }
    const status = config.requireAdminApproval ? 'pending' : 'active';
    await db.query('UPDATE users SET status = $2, email_verified_at = now(), updated_at = now() WHERE id = $1', [user.id, status]);
    await audit(req, 'user.email_verified', { actor: user, detail: { status }, db });
    return { user: { ...user, status } };
  });
  if (out.error) return res.status(400).json({ error: out.error, message: CODE_MESSAGES[out.error], attemptsLeft: out.attemptsLeft });
  if (out.user.status === 'pending') return res.json({ status: 'pending_approval', message: 'Email verified. Your account is waiting for approval by the OffshoreAssure team.' });
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [out.user.id]);
  startSession(res, out.user);
  await audit(req, 'user.signed_in', { actor: out.user, detail: { via: 'registration' } });
  res.json({ status: 'registered', ...(await userPayload({ query }, out.user.id)) });
});

/* ---------------- Resend a code (registration or password reset) ---------------- */
authRouter.post('/resend-code', async (req, res) => {
  const body = parse(schemas.resend, req, res); if (!body) return;
  const out = await tx(async db => {
    const user = await findUser(db, body.email);
    const eligible = user && (body.purpose === 'register' ? user.status === 'unverified' : user.status !== 'unverified');
    if (!eligible) return { generic: true };
    const wait = await cooldownLeft(db, user.id, body.purpose);
    if (wait > 0) return { wait };
    const code = await issueCode(db, user.id, body.purpose);
    await audit(req, 'verification_code.sent', { actor: user, detail: { purpose: body.purpose, resend: true }, db });
    return { code };
  });
  if (out.wait) return res.status(429).json({ error: 'cooldown', message: `Please wait ${out.wait} seconds before requesting a new code.`, resendInSeconds: out.wait });
  if (out.generic) return res.json({ status: 'code_sent', email: body.email, expiresInMinutes: config.codeTtlMinutes, resendInSeconds: config.resendCooldownSeconds });
  res.json({ status: 'code_sent', ...(await deliver(body.email, out.code, body.purpose)) });
});

/* ---------------- Login ---------------- */
authRouter.post('/login', async (req, res) => {
  const body = parse(schemas.login, req, res); if (!body) return;
  const user = await findUser({ query }, body.email);
  const bad = () => res.status(401).json({ error: 'invalid_credentials', message: 'Incorrect email or password.' });
  if (!user) { await bcrypt.compare(body.password, DUMMY_HASH); await audit(req, 'user.sign_in_failed', { detail: { email: body.email, reason: 'unknown_email' } }); return bad(); }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return res.status(423).json({ error: 'locked', message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'} or reset your password.` });
  }
  const ok = await bcrypt.compare(body.password, user.password_hash);
  if (!ok) {
    const failed = user.failed_logins + 1;
    const lock = failed >= config.maxFailedLogins;
    await query(`UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END WHERE id = $1`,
      [user.id, lock ? 0 : failed, lock, config.lockMinutes]);
    await audit(req, 'user.sign_in_failed', { actor: user, detail: { reason: 'wrong_password', locked: lock } });
    return bad();
  }
  if (user.status === 'unverified') {
    const extra = await tx(async db => {
      const wait = await cooldownLeft(db, user.id, 'register');
      if (wait > 0) return { resendInSeconds: wait, email: user.email, expiresInMinutes: config.codeTtlMinutes };
      const code = await issueCode(db, user.id, 'register');
      return { code };
    });
    const payload = extra.code ? await deliver(user.email, extra.code, 'register') : extra;
    return res.status(403).json({ error: 'not_verified', message: 'Please verify your email address. We have sent you a code.', ...payload });
  }
  if (user.status === 'pending') return res.status(403).json({ error: 'pending_approval', message: 'Your account is waiting for approval by the OffshoreAssure team.' });
  if (user.status === 'inactive') return res.status(403).json({ error: 'account_inactive', message: 'This account has been deactivated. Please contact the OffshoreAssure team.' });
  await query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
  startSession(res, user);
  await audit(req, 'user.signed_in', { actor: user });
  res.json({ status: 'signed_in', ...(await userPayload({ query }, user.id)) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.user) await audit(req, 'user.signed_out');
  endSession(res);
  res.json({ status: 'signed_out' });
});

/* ---------------- Forgot / reset password (same code popup) ---------------- */
authRouter.post('/forgot-password', async (req, res) => {
  const body = parse(schemas.forgot, req, res); if (!body) return;
  const generic = { status: 'code_sent', email: body.email, expiresInMinutes: config.codeTtlMinutes, resendInSeconds: config.resendCooldownSeconds, message: 'If an account exists for this email, a reset code has been sent.' };
  const out = await tx(async db => {
    const user = await findUser(db, body.email);
    if (!user || user.status === 'unverified') return null;
    const wait = await cooldownLeft(db, user.id, 'reset');
    if (wait > 0) return null;
    const code = await issueCode(db, user.id, 'reset');
    await audit(req, 'password_reset.requested', { actor: user, db });
    return { code };
  });
  if (!out) return res.json(generic);
  res.json({ ...generic, ...(await deliver(body.email, out.code, 'reset')) });
});

authRouter.post('/reset-password', async (req, res) => {
  const body = parse(schemas.reset, req, res); if (!body) return;
  const hash = await bcrypt.hash(body.newPassword, 12);
  const out = await tx(async db => {
    const user = await findUser(db, body.email);
    if (!user || user.status === 'unverified') return { error: 'no_code' };
    const r = await checkCode(db, user.id, 'reset', body.code);
    if (!r.ok) return { error: r.reason, attemptsLeft: r.attemptsLeft };
    await db.query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [user.id, hash]);
    await audit(req, 'password_reset.completed', { actor: user, db });
    return { ok: true };
  });
  if (out.error) return res.status(400).json({ error: out.error, message: CODE_MESSAGES[out.error], attemptsLeft: out.attemptsLeft });
  res.json({ status: 'password_reset', message: 'Your password has been reset. Please sign in.' });
});

/* ---------------- Current user and profile ---------------- */
meRouter.get('/', requireAuth, async (req, res) => {
  res.json(await userPayload({ query }, req.user.id));
});

meRouter.put('/profile', requireAuth, async (req, res) => {
  if (req.user.role === 'vendor') return saveVendorProfile(req, res);
  const body = parse(schemas.profile, req, res); if (!body) return;
  await query(
    `INSERT INTO user_profiles (user_id, full_name, organisation_name, sector, job_role, phone, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, organisation_name = EXCLUDED.organisation_name,
       sector = EXCLUDED.sector, job_role = EXCLUDED.job_role, phone = EXCLUDED.phone, updated_at = now()`,
    [req.user.id, body.fullName, body.organisationName, body.sector, body.jobRole, body.phone || null]
  );
  if (!req.user.is_admin) {
    // Joining an organisation that already has members needs an owner's approval.
    const before = (await query('SELECT organisation_id, membership FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0];
    const o = await ensureOrganisation({ query }, body.organisationName, body.sector, 'buyer', { withCreated: true });
    if (!before?.organisation_id || before.organisation_id !== o.id) {
      const m = await membershipFor({ query }, o.id, o.created, req.user.id);
      await query('UPDATE user_profiles SET organisation_id = $2, membership = $3, membership_decided_by = NULL, membership_decided_at = NULL WHERE user_id = $1', [req.user.id, o.id, m]);
      if (m === 'pending') {
        await audit(req, 'organisation.join_requested', { detail: { organisationId: o.id, organisationName: body.organisationName, userId: req.user.id, email: req.user.email } });
        await notifyJoinRequest(o.id, body.organisationName, req.user.email, body.fullName);
      }
    }
  }
  await audit(req, 'user.profile_updated', { detail: { organisationName: body.organisationName, sector: body.sector, jobRole: body.jobRole } });
  res.json(await userPayload({ query }, req.user.id));
});

/* Vendor (supplier) profile: the person plus the company's reusable profile. A new company starts as "pending"
   until the OffshoreAssure team verifies it (ASS-001 Legal Entity Verification). A company name already registered
   by another vendor cannot be claimed: colleagues will join through an invitation (later stage). */
async function saveVendorProfile(req, res) {
  const body = parse(schemas.vendorProfile, req, res); if (!body) return;
  const out = await tx(async db => {
    const mine = (await db.query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [req.user.id])).rows[0]?.organisation_id || null;
    const clash = (await db.query(`SELECT id FROM organisations WHERE kind = 'vendor' AND lower(name) = lower($1) AND id IS DISTINCT FROM $2`, [body.organisationName, mine])).rows[0];
    if (clash) return { error: 'company_taken' };
    let orgId = mine, created = false, reverify = false;
    const vals = [body.organisationName, body.registrationNumber, body.country, body.website || null, body.description || null, body.services, body.deliveryCountries];
    if (!orgId) {
      orgId = (await db.query(`INSERT INTO organisations (kind, name, registration_number, country, website, description, services, delivery_countries, verification_status)
        VALUES ('vendor', $1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`, vals)).rows[0].id;
      created = true;
    } else {
      const o = (await db.query('SELECT name, registration_number, country, verification_status FROM organisations WHERE id = $1', [orgId])).rows[0];
      // Changing the legal identity of a verified company sends it back for verification.
      reverify = o.verification_status !== 'pending' && (o.name.toLowerCase() !== body.organisationName.toLowerCase() || o.registration_number !== body.registrationNumber || o.country !== body.country);
      await db.query(`UPDATE organisations SET name = $1, registration_number = $2, country = $3, website = $4, description = $5, services = $6, delivery_countries = $7,
          verification_status = CASE WHEN $9 THEN 'pending' ELSE verification_status END, verification_note = CASE WHEN $9 THEN NULL ELSE verification_note END,
          updated_at = now() WHERE id = $8`, [...vals, orgId, reverify]);
    }
    await db.query(
      `INSERT INTO user_profiles (user_id, full_name, organisation_name, job_role, phone, organisation_id, updated_at) VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, organisation_name = EXCLUDED.organisation_name, job_role = EXCLUDED.job_role,
         phone = EXCLUDED.phone, organisation_id = EXCLUDED.organisation_id, updated_at = now()`,
      [req.user.id, body.fullName, body.organisationName, body.jobRole, body.phone || null, orgId]);
    if (created) await db.query(`UPDATE user_profiles SET membership = 'owner' WHERE user_id = $1`, [req.user.id]);
    await linkInvitationsForVendor(db, req, req.user.email, orgId);   // Stage 2: buyer invitations sent to this email
    await audit(req, created ? 'vendor.company_registered' : 'vendor.profile_updated', { db, stage: 'stage-0',
      detail: { organisationId: orgId, organisationName: body.organisationName, country: body.country, services: body.services, reverify } });
    return { ok: true };
  });
  if (out.error) return res.status(409).json({ error: 'company_taken', message: 'A vendor company with this name is already registered on OffshoreAssure. Ask your colleague to invite you, or contact the OffshoreAssure team.', fields: { organisationName: 'This company is already registered.' } });
  res.json(await userPayload({ query }, req.user.id));
}
