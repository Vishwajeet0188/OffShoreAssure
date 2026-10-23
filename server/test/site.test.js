/* Public website: feedback form → saved → visible to admins only. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.RATE_LIMIT = 'false';
process.env.NODE_ENV = 'test';
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0); base = `http://localhost:${server.address().port}/api`;
  await pool.query(`INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@oa.example', $1, 'active', true, 'admin', now())`, [await bcrypt.hash('Admin12345', 4)]);
});
after(async () => { server.close(); await pool.end(); });

test('feedback: validation, honeypot, saved, admin-only list, mark as read', async () => {
  const anon = client();
  let r = await anon('POST', '/feedback', { kind: 'other', message: 'short' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.kind && r.body.fields.message);
  r = await anon('POST', '/feedback', { kind: 'idea', message: 'This is spam from a bot.', website: 'http://spam' });
  assert.equal(r.status, 400, 'honeypot filled → rejected');
  r = await anon('POST', '/feedback', { kind: 'feedback', rating: 5, message: 'Clear and simple to use. Thank you!', name: 'Priya', email: 'Priya@Example.com', page: 'home' });
  assert.equal(r.status, 201);
  assert.equal((await anon('GET', '/admin/feedback')).status, 401);
  const admin = client(); await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  r = await admin('GET', '/admin/feedback');
  assert.equal(r.body.feedback.length, 1); assert.equal(r.body.unread, 1);
  assert.equal(r.body.feedback[0].email, 'priya@example.com'); assert.equal(r.body.feedback[0].rating, 5);
  assert.equal((await admin('PATCH', '/admin/feedback/' + r.body.feedback[0].id, { status: 'read' })).status, 200);
  assert.equal((await admin('GET', '/admin/feedback')).body.unread, 0);
});

test('reviews: only shown when the sender agreed AND an admin published it; name as typed, never the email', async () => {
  const anon = client();
  await anon('POST', '/feedback', { kind: 'feedback', rating: 4, message: 'Very easy to compare vendors.', name: 'Tom Hughes', email: 'tom@x.example', publicConsent: true });
  await anon('POST', '/feedback', { kind: 'feedback', rating: 5, message: 'Great, but keep this private please.', name: 'Ann Lee' });
  const admin = client(); await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  const list = (await admin('GET', '/admin/feedback')).body.feedback;
  const yes = list.find(f => f.name === 'Tom Hughes'), no = list.find(f => f.name === 'Ann Lee');
  assert.equal((await anon('GET', '/feedback/public')).body.reviews.length, 0, 'nothing public before publishing');
  assert.equal((await admin('PATCH', '/admin/feedback/' + no.id, { published: true })).status, 409, 'no consent → cannot publish');
  assert.equal((await admin('PATCH', '/admin/feedback/' + yes.id, { published: true })).status, 200);
  let pub = (await anon('GET', '/feedback/public')).body.reviews;
  assert.equal(pub.length, 1); assert.equal(pub[0].name, 'Tom Hughes'); assert.equal(pub[0].rating, 4); assert.equal(pub[0].role, 'Visitor');
  assert.ok(!JSON.stringify(pub).includes('tom@x.example'), 'email never public');
  await admin('PATCH', '/admin/feedback/' + yes.id, { published: false });
  assert.equal((await anon('GET', '/feedback/public')).body.reviews.length, 0, 'unpublished → hidden');
  await assert.rejects(pool.query(`UPDATE feedback SET published = true WHERE id = $1`, [no.id]), /feedback_publish_needs_consent/);
});
