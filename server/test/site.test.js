/* Public website: feedback from signed-in buyers and vendors → saved → visible to admins; reviews published with consent. */
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

async function signUp(email, role, profile) {
  const user = client();
  const registered = await user('POST', '/auth/register', { email, password: 'Secure1234', role });
  await user('POST', '/auth/verify', { email, code: registered.body.devCode });
  await user('PUT', '/me/profile', profile);
  return user;
}

const signUpBuyer = (email, fullName) =>
  signUp(email, 'buyer', {
    fullName,
    organisationName: 'Org ' + fullName,
    sector: 'Retail',
    jobRole: 'Compliance Manager',
  });

test('feedback: only signed-in buyers and vendors can send it; name and email come from the account', async () => {
  const anonymous = client();
  let r = await anonymous('POST', '/feedback', {
    kind: 'feedback',
    message: 'Clear and simple to use. Thank you!',
  });
  assert.equal(r.status, 401, 'not signed in → refused');

  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  r = await admin('POST', '/feedback', { kind: 'feedback', message: 'An admin trying to send feedback.' });
  assert.equal(r.status, 403, 'admins do not send feedback');

  const priya = await signUpBuyer('priya@example.com', 'Priya Sharma');
  r = await priya('POST', '/feedback', { kind: 'other', message: 'short' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.kind && r.body.fields.message);

  r = await priya('POST', '/feedback', {
    kind: 'feedback',
    rating: 5,
    message: 'Clear and simple to use. Thank you!',
    page: 'home',
  });
  assert.equal(r.status, 201);

  assert.equal((await anonymous('GET', '/admin/feedback')).status, 401);
  r = await admin('GET', '/admin/feedback');
  assert.equal(r.body.feedback.length, 1);
  assert.equal(r.body.unread, 1);
  assert.equal(r.body.feedback[0].email, 'priya@example.com');
  assert.equal(r.body.feedback[0].name, 'Priya Sharma');
  assert.equal(r.body.feedback[0].rating, 5);
  assert.equal(
    (await admin('PATCH', '/admin/feedback/' + r.body.feedback[0].id, { status: 'read' })).status,
    200,
  );
  assert.equal((await admin('GET', '/admin/feedback')).body.unread, 0);
});

test('reviews: only shown when the sender agreed AND an admin published it; never the email', async () => {
  const anonymous = client();
  const tom = await signUpBuyer('tom@x.example', 'Tom Hughes');
  const ann = await signUpBuyer('ann@x.example', 'Ann Lee');
  await tom('POST', '/feedback', {
    kind: 'feedback',
    rating: 4,
    message: 'Very easy to compare vendors.',
    publicConsent: true,
  });
  await ann('POST', '/feedback', {
    kind: 'feedback',
    rating: 5,
    message: 'Great, but keep this private please.',
  });

  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  const list = (await admin('GET', '/admin/feedback')).body.feedback;
  const agreed = list.find(f => f.name === 'Tom Hughes');
  const notAgreed = list.find(f => f.name === 'Ann Lee');

  assert.equal(
    (await anonymous('GET', '/feedback/public')).body.reviews.length,
    0,
    'nothing public before publishing',
  );
  assert.equal(
    (await admin('PATCH', '/admin/feedback/' + notAgreed.id, { published: true })).status,
    409,
    'no consent → cannot publish',
  );
  assert.equal((await admin('PATCH', '/admin/feedback/' + agreed.id, { published: true })).status, 200);

  const reviews = (await anonymous('GET', '/feedback/public')).body.reviews;
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].name, 'Tom Hughes');
  assert.equal(reviews[0].rating, 4);
  assert.equal(reviews[0].role, 'Buyer');
  assert.ok(!JSON.stringify(reviews).includes('tom@x.example'), 'email never public');

  await admin('PATCH', '/admin/feedback/' + agreed.id, { published: false });
  assert.equal((await anonymous('GET', '/feedback/public')).body.reviews.length, 0, 'unpublished → hidden');
  await assert.rejects(
    pool.query(`UPDATE feedback SET published = true WHERE id = $1`, [notAgreed.id]),
    /feedback_publish_needs_consent/,
  );
});
