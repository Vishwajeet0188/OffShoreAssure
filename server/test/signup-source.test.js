/* Sign-up source: UTM tags on the first link are saved with the new account and shown to admins. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.RATE_LIMIT = 'false';
process.env.DEV_SHOW_CODES = 'true';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
  await pool.query(
    `INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@oa.example', $1, 'active', true, 'admin', now())`,
    [await bcrypt.hash('Admin12345', 4)],
  );
});
after(async () => {
  server.close();
  await pool.end();
});

test('UTM tags sent at sign-up are saved and shown to admins; bad values are ignored', async () => {
  const visitor = client();
  const source = {
    utm_source: 'linkedin',
    utm_medium: 'social',
    utm_campaign: 'launch-2026',
    landingPage: '/how-it-works',
  };
  let r = await visitor('POST', '/auth/register', {
    email: 'utm@buyer.example',
    password: 'Secure1234',
    role: 'buyer',
    source,
  });
  assert.equal(r.status, 201);

  r = await client()('POST', '/auth/register', {
    email: 'plain@buyer.example',
    password: 'Secure1234',
    role: 'buyer',
    source: { utm_source: 'x'.repeat(500) },
  });
  assert.equal(r.status, 201, 'an invalid source never blocks sign-up');

  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  const { rows } = await pool.query(
    `SELECT id, email, signup_source FROM users WHERE email IN ('utm@buyer.example', 'plain@buyer.example') ORDER BY email`,
  );
  assert.equal(rows[0].signup_source, null);
  assert.deepEqual(rows[1].signup_source, source);

  const detail = await admin('GET', '/admin/users/' + rows[1].id);
  assert.equal(detail.body.user.signupSource.utm_campaign, 'launch-2026');
});
