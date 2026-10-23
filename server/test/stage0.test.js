/* Stage 0 API tests. Needs a Postgres test database:
   TEST_DATABASE_URL=postgres://oa:oa@localhost:5432/offshoreassure_test npm test */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.DEV_SHOW_CODES = 'true';
process.env.RATE_LIMIT = 'false';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => { server.close(); await pool.end(); });

/* Tiny client that keeps the session cookie like a browser. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}

test('register → verify with emailed code → signed in', async () => {
  const c = client();
  let r = await c('POST', '/auth/register', { email: 'Buyer@UKCompany.example', password: 'Secure1234' });
  assert.equal(r.status, 201); assert.equal(r.body.status, 'code_sent'); assert.match(r.body.devCode, /^\d{6}$/);
  assert.equal(r.body.expiresInMinutes, 10);
  r = await c('POST', '/auth/verify', { email: 'buyer@ukcompany.example', code: r.body.devCode });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'registered'); assert.equal(r.body.user.email, 'buyer@ukcompany.example');
  assert.equal(r.body.profileComplete, false);
  r = await c('GET', '/me'); assert.equal(r.status, 200); assert.equal(r.body.user.status, 'active');
});

test('validation: bad email, weak password, duplicate account', async () => {
  const c = client();
  let r = await c('POST', '/auth/register', { email: 'not-an-email', password: 'Secure1234' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.email);
  r = await c('POST', '/auth/register', { email: 'weak@x.example', password: 'short' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.password);
  r = await c('POST', '/auth/register', { email: 'weak@x.example', password: 'lettersonly' });
  assert.equal(r.status, 400);
  r = await c('POST', '/auth/register', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'email_taken');
});

test('wrong code counts attempts, then blocks after 5; resend issues a working code', async () => {
  const c = client();
  let r = await c('POST', '/auth/register', { email: 'attempts@x.example', password: 'Secure1234' });
  const real = r.body.devCode; const wrong = real === '000000' ? '111111' : '000000';
  for (let i = 4; i >= 1; i--) {
    r = await c('POST', '/auth/verify', { email: 'attempts@x.example', code: wrong });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'wrong_code'); assert.equal(r.body.attemptsLeft, i);
  }
  r = await c('POST', '/auth/verify', { email: 'attempts@x.example', code: wrong });
  assert.equal(r.body.error, 'too_many_attempts');
  r = await c('POST', '/auth/verify', { email: 'attempts@x.example', code: real });
  assert.equal(r.body.error, 'too_many_attempts', 'correct code no longer accepted after 5 failures');
  r = await c('POST', '/auth/resend-code', { email: 'attempts@x.example' });
  assert.equal(r.status, 200);
  r = await c('POST', '/auth/verify', { email: 'attempts@x.example', code: r.body.devCode });
  assert.equal(r.body.status, 'registered');
});

test('expired code is rejected', async () => {
  const c = client();
  let r = await c('POST', '/auth/register', { email: 'expired@x.example', password: 'Secure1234' });
  await pool.query(`UPDATE verification_codes SET expires_at = now() - interval '1 minute'`);
  r = await c('POST', '/auth/verify', { email: 'expired@x.example', code: r.body.devCode });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'expired');
});

test('codes are stored hashed, never in plain text', async () => {
  const c = client();
  const r = await c('POST', '/auth/register', { email: 'hash@x.example', password: 'Secure1234' });
  const rows = (await pool.query(`SELECT code_hash FROM verification_codes vc JOIN users u ON u.id = vc.user_id WHERE u.email = 'hash@x.example'`)).rows;
  assert.ok(rows.length && rows.every(x => x.code_hash !== r.body.devCode && x.code_hash.length === 64));
  const u = (await pool.query(`SELECT password_hash FROM users WHERE email = 'hash@x.example'`)).rows[0];
  assert.ok(u.password_hash.startsWith('$2') && !u.password_hash.includes('Secure1234'));
});

test('login: wrong password, unverified account, success, logout', async () => {
  const c = client();
  let r = await c('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Wrong1234' });
  assert.equal(r.status, 401); assert.equal(r.body.message, 'Incorrect email or password.');
  r = await c('POST', '/auth/login', { email: 'nobody@x.example', password: 'Wrong1234' });
  assert.equal(r.status, 401); assert.equal(r.body.message, 'Incorrect email or password.', 'same message for unknown email');
  r = await c('POST', '/auth/login', { email: 'hash@x.example', password: 'Secure1234' });
  assert.equal(r.status, 403); assert.equal(r.body.error, 'not_verified'); assert.match(r.body.devCode, /^\d{6}$/);
  r = await c('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'signed_in');
  r = await c('POST', '/auth/logout'); assert.equal(r.status, 200);
  r = await c('GET', '/me'); assert.equal(r.status, 401);
});

test('account locks after 5 wrong passwords', async () => {
  const c = client();
  await c('POST', '/auth/register', { email: 'lock@x.example', password: 'Secure1234' }).then(r => c('POST', '/auth/verify', { email: 'lock@x.example', code: r.body.devCode }));
  for (let i = 0; i < 5; i++) await c('POST', '/auth/login', { email: 'lock@x.example', password: 'Wrong1234' });
  const r = await c('POST', '/auth/login', { email: 'lock@x.example', password: 'Secure1234' });
  assert.equal(r.status, 423); assert.equal(r.body.error, 'locked');
});

test('forgot password → code → new password → sign in', async () => {
  const c = client();
  let r = await c('POST', '/auth/forgot-password', { email: 'nobody@x.example' });
  assert.equal(r.status, 200); assert.equal(r.body.devCode, undefined, 'no code for unknown email, same response');
  r = await c('POST', '/auth/forgot-password', { email: 'lock@x.example' });
  assert.equal(r.status, 200); assert.match(r.body.devCode, /^\d{6}$/);
  r = await c('POST', '/auth/reset-password', { email: 'lock@x.example', code: r.body.devCode, newPassword: 'NewSecure5678' });
  assert.equal(r.status, 200);
  r = await c('POST', '/auth/login', { email: 'lock@x.example', password: 'NewSecure5678' });
  assert.equal(r.status, 200, 'reset also clears the lock');
});

test('complete profile', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  let r = await c('PUT', '/me/profile', { fullName: 'Sarah Williams', organisationName: 'UK Company Ltd', sector: 'Bogus', jobRole: 'Compliance Manager' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.sector);
  r = await c('PUT', '/me/profile', { fullName: 'Sarah Williams', organisationName: 'UK Company Ltd', sector: 'Financial Services', jobRole: 'Compliance Manager', phone: '+44 20 7946 0000' });
  assert.equal(r.status, 200); assert.equal(r.body.profileComplete, true); assert.equal(r.body.profile.organisationName, 'UK Company Ltd');
});

test('admin: only admins see registered users; activate/deactivate', async () => {
  const user = client();
  await user('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  let r = await user('GET', '/admin/users'); assert.equal(r.status, 403);
  r = await client()('GET', '/admin/users'); assert.equal(r.status, 401);

  const hash = await bcrypt.hash('Admin12345', 4);
  await pool.query(`INSERT INTO users (email, password_hash, status, is_admin, email_verified_at) VALUES ('admin@offshoreassure.example', $1, 'active', true, now())`, [hash]);
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  r = await admin('GET', '/admin/users?search=ukcompany');
  assert.equal(r.status, 200); assert.equal(r.body.users.length, 1); assert.equal(r.body.users[0].organisationName, 'UK Company Ltd');
  const id = r.body.users[0].id;
  r = await admin('GET', '/admin/users?status=unverified'); assert.ok(r.body.users.every(u => u.status === 'unverified'));
  r = await admin('PATCH', `/admin/users/${id}`, { status: 'inactive' }); assert.equal(r.status, 200);
  r = await user('GET', '/me'); assert.equal(r.status, 401, 'deactivated user is signed out');
  r = await client()('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  assert.equal(r.body.error, 'account_inactive');
  r = await admin('PATCH', `/admin/users/${id}`, { status: 'active' }); assert.equal(r.status, 200);
});

test('audit trail records each step and cannot be edited', async () => {
  const events = (await pool.query(`SELECT event FROM audit_events`)).rows.map(r => r.event);
  for (const e of ['user.registered', 'verification_code.sent', 'user.email_verified', 'user.signed_in', 'user.sign_in_failed', 'password_reset.completed', 'user.profile_updated', 'admin.user_deactivated', 'admin.user_activated'])
    assert.ok(events.includes(e), 'missing audit event ' + e);
  await assert.rejects(pool.query('UPDATE audit_events SET event = $1', ['tampered']), /append-only/);
  await assert.rejects(pool.query('DELETE FROM audit_events'), /append-only/);
});

test('admin console: overview, user detail, audit log, settings (admin only)', async () => {
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  let r = await admin('GET', '/admin/overview');
  assert.equal(r.status, 200);
  assert.ok(r.body.users.total >= 5 && r.body.users.active >= 1, 'counts exclude admins and include customers');
  assert.equal(r.body.registrationsByDay.length, 14);
  assert.ok(r.body.organisations >= 1 && r.body.recent.length > 0);
  const list = await admin('GET', '/admin/users?search=ukcompany');
  r = await admin('GET', `/admin/users/${list.body.users[0].id}`);
  assert.equal(r.status, 200); assert.equal(r.body.user.organisationName, 'UK Company Ltd');
  assert.ok(r.body.events.some(e => e.event === 'user.registered'));
  assert.ok(r.body.events.some(e => e.event === 'admin.user_deactivated'), 'admin actions on the user are in their history');
  r = await admin('GET', '/admin/users/not-a-uuid'); assert.equal(r.status, 404);
  r = await admin('GET', '/admin/audit?event=user.sign_in_failed&pageSize=10');
  assert.equal(r.status, 200); assert.ok(r.body.total >= 1 && r.body.events.every(e => e.event === 'user.sign_in_failed'));
  assert.ok(r.body.eventTypes.includes('user.registered'));
  r = await admin('GET', '/admin/settings');
  assert.equal(r.status, 200); assert.equal(r.body.registration.codeTtlMinutes, 10); assert.equal(JSON.stringify(r.body).includes('pass'), false, 'no secrets');
  const user = client();
  await user('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  for (const pth of ['/admin/overview', '/admin/audit', '/admin/settings', `/admin/users/${list.body.users[0].id}`]) {
    r = await user('GET', pth); assert.equal(r.status, 403, pth);
  }
});

test('admin console: buyers, admin team (add, password via reset, deactivate, last-admin guard)', async () => {
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  let r = await admin('GET', '/admin/buyers');
  assert.equal(r.status, 200);
  const org = r.body.organisations.find(o => o.name === 'UK Company Ltd');
  assert.ok(org && org.users.length >= 1 && org.sectors.includes('Financial Services'));
  r = await admin('GET', '/admin/users'); assert.ok(r.body.users.every(u => !u.isAdmin), 'users list holds customers only');
  const me = (await admin('GET', '/me')).body.user;
  r = await admin('PATCH', `/admin/users/${me.id}`, { status: 'inactive' }); assert.equal(r.status, 400);

  r = await admin('GET', '/admin/team'); assert.equal(r.status, 200); assert.equal(r.body.admins.length, 1);
  r = await admin('PATCH', `/admin/team/${me.id}`, { status: 'inactive' }); assert.equal(r.body.error, 'self');
  r = await admin('POST', '/admin/team', { email: 'buyer@ukcompany.example', fullName: 'Sarah' }); assert.equal(r.body.error, 'customer_account');
  r = await admin('POST', '/admin/team', { email: 'second.admin@offshoreassure.example', fullName: 'Second Admin' });
  assert.equal(r.status, 201); const id2 = r.body.id;
  r = await client()('POST', '/auth/login', { email: 'second.admin@offshoreassure.example', password: 'Anything123' }); assert.equal(r.status, 401, 'no usable password until reset');
  const anon = client();
  r = await anon('POST', '/auth/forgot-password', { email: 'second.admin@offshoreassure.example' }); assert.ok(r.body.devCode);
  r = await anon('POST', '/auth/reset-password', { email: 'second.admin@offshoreassure.example', code: r.body.devCode, newPassword: 'Second1234' }); assert.equal(r.status, 200);
  const a2 = client();
  r = await a2('POST', '/auth/login', { email: 'second.admin@offshoreassure.example', password: 'Second1234' });
  assert.equal(r.status, 200); assert.equal(r.body.user.isAdmin, true);
  r = await admin('GET', '/admin/team'); assert.ok(r.body.admins.find(a => a.id === id2).passwordSet);
  r = await a2('PATCH', `/admin/team/${me.id}`, { status: 'inactive' }); assert.equal(r.status, 200);
  r = await a2('PATCH', `/admin/team/${me.id}`, { status: 'active' }); assert.equal(r.status, 200);
  r = await admin('PATCH', `/admin/team/${id2}`, { status: 'inactive' }); assert.equal(r.status, 200);
  await pool.query(`UPDATE users SET status = 'inactive' WHERE email = 'admin@offshoreassure.example'`);
  await pool.query(`UPDATE users SET status = 'active' WHERE email = 'admin@offshoreassure.example'`);
  const a3 = client(); await a3('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  r = await a3('PATCH', `/admin/team/${id2}`, { status: 'active' }); assert.equal(r.status, 200);
  r = await a3('PATCH', `/admin/team/${id2}`, { status: 'inactive' }); assert.equal(r.status, 200);
  // only one active admin left now; a customer cannot reach team endpoints
  const user = client(); await user('POST', '/auth/login', { email: 'buyer@ukcompany.example', password: 'Secure1234' });
  for (const pth of ['/admin/buyers', '/admin/team']) { r = await user('GET', pth); assert.equal(r.status, 403, pth); }
  const events = (await pool.query(`SELECT event FROM audit_events`)).rows.map(x => x.event);
  for (const e of ['admin.admin_added', 'admin.admin_deactivated', 'admin.admin_reactivated']) assert.ok(events.includes(e), e);
});
