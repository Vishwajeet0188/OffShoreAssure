/* Roles: buyer and vendor sign-up, vendor company profile and verification, role-based access. */
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
function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
async function signUp(email, role) {
  const c = client();
  const r = await c('POST', '/auth/register', { email, password: 'Secure1234', ...(role ? { role } : {}) });
  const v = await c('POST', '/auth/verify', { email, code: r.body.devCode });
  return { c, me: v.body };
}
const VENDOR = { fullName: 'Anna Kowalska', jobRole: 'Delivery Manager', organisationName: 'Krakow IT Services Sp. z o.o.', registrationNumber: 'KRS 0000123456',
  country: 'PL', services: ['IT Support', 'Cloud / infrastructure operations'], deliveryCountries: ['PL', 'IN'], website: 'krakow-it.example', description: '24/7 service desk.' };

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
  await pool.query(`INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@offshoreassure.example', $1, 'active', true, 'admin', now())`, [await bcrypt.hash('Admin12345', 4)]);
});
after(async () => { server.close(); await pool.end(); });

test('sign-up defaults to buyer; vendor role is stored by the server; admin cannot be chosen', async () => {
  const b = await signUp('buyer@uk.example');
  assert.equal(b.me.user.role, 'buyer');
  const v = await signUp('anna@krakow-it.example', 'vendor');
  assert.equal(v.me.user.role, 'vendor'); assert.equal(v.me.profileComplete, false); assert.equal(v.me.vendor, null);
  const r = await client()('POST', '/auth/register', { email: 'sneaky@x.example', password: 'Secure1234', role: 'admin' });
  assert.equal(r.status, 400);
});

test('vendor profile: validation, company created as pending, cannot claim an existing vendor company', async () => {
  const { c } = await signUp('piotr@krakow-it.example', 'vendor');
  let r = await c('PUT', '/me/profile', { ...VENDOR, services: [], country: 'XX' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.services && r.body.fields.country);
  r = await c('PUT', '/me/profile', VENDOR);
  assert.equal(r.status, 200); assert.equal(r.body.profileComplete, true);
  assert.equal(r.body.vendor.verificationStatus, 'pending'); assert.deepEqual(r.body.vendor.deliveryCountries, ['PL', 'IN']);
  const other = await signUp('mallory@x.example', 'vendor');
  r = await other.c('PUT', '/me/profile', { ...VENDOR, organisationName: 'krakow it services sp. z o.o.' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'company_taken');
  // a buyer with the same company name is a different organisation (kind = buyer)
  const b = await signUp('buyer2@x.example');
  r = await b.c('PUT', '/me/profile', { fullName: 'Tom Buyer', organisationName: VENDOR.organisationName, sector: 'Retail', jobRole: 'Vendor Manager' });
  assert.equal(r.status, 200);
});

test('role guards: vendors cannot use buyer APIs; buyers cannot use admin APIs', async () => {
  const v = client(); await v('POST', '/auth/login', { email: 'piotr@krakow-it.example', password: 'Secure1234' });
  assert.equal((await v('GET', '/requirements')).status, 403);
  assert.equal((await v('POST', '/assessments/validate', { data: {} })).status, 403);
  assert.equal((await v('GET', '/admin/vendors')).status, 403);
  const b = client(); await b('POST', '/auth/login', { email: 'buyer@uk.example', password: 'Secure1234' });
  assert.equal((await b('GET', '/admin/vendors')).status, 403);
  assert.equal((await b('GET', '/reference')).status, 200);
});

test('admin: vendors list, approve, reject needs a reason, identity change sends it back to pending', async () => {
  const a = client(); await a('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  let r = await a('GET', '/admin/vendors?status=pending');
  assert.equal(r.status, 200); assert.equal(r.body.counts.pending, 1);
  const id = r.body.vendors[0].id;
  r = await a('GET', `/admin/vendors/${id}`); assert.equal(r.body.users.length, 1); assert.ok(r.body.events.some(e => e.event === 'vendor.company_registered'));
  r = await a('PATCH', `/admin/vendors/${id}`, { status: 'rejected', note: '' }); assert.equal(r.status, 400);
  r = await a('PATCH', `/admin/vendors/${id}`, { status: 'approved' }); assert.equal(r.status, 200);
  const v = client(); await v('POST', '/auth/login', { email: 'piotr@krakow-it.example', password: 'Secure1234' });
  let me = await v('GET', '/me'); assert.equal(me.body.vendor.verificationStatus, 'approved');
  // description change keeps approval; registration number change → pending again
  r = await v('PUT', '/me/profile', { ...VENDOR, description: 'Updated description' }); assert.equal(r.body.vendor.verificationStatus, 'approved');
  r = await v('PUT', '/me/profile', { ...VENDOR, registrationNumber: 'KRS 0000999999' }); assert.equal(r.body.vendor.verificationStatus, 'pending');
  r = await a('PATCH', `/admin/vendors/${id}`, { status: 'rejected', note: 'Registration number not found in KRS' });
  me = await v('GET', '/me'); assert.equal(me.body.vendor.verificationStatus, 'rejected'); assert.match(me.body.vendor.verificationNote, /KRS/);
  // buyer user list excludes vendors; overview counts vendors separately
  r = await a('GET', '/admin/users'); assert.ok(r.body.users.every(u => !/krakow-it|mallory/.test(u.email)));
  r = await a('GET', '/admin/overview'); assert.equal(r.body.vendors.rejected, 1);
  const ev = (await pool.query(`SELECT event FROM audit_events`)).rows.map(x => x.event);
  for (const e of ['vendor.company_registered', 'vendor.profile_updated', 'admin.vendor_approved', 'admin.vendor_rejected']) assert.ok(ev.includes(e), e);
});

test('buyer organisation: first registrant owns it; others are pending until the owner approves; strangers see nothing', async () => {
  const owner = await signUp('owner@acme.example');
  let r = await owner.c('PUT', '/me/profile', { fullName: 'Olivia Owner', organisationName: 'Acme Insurance Ltd', sector: 'Financial Services', jobRole: 'Compliance Manager' });
  assert.equal(r.body.membership, 'owner');
  const d = await owner.c('POST', '/requirements', { data: { assessmentTitle: 'Acme private requirement' } });
  assert.equal(d.status, 201);
  const stranger = await signUp('stranger@x.example');
  r = await stranger.c('PUT', '/me/profile', { fullName: 'Sam Stranger', organisationName: 'acme insurance ltd', sector: 'Retail', jobRole: 'Other' });
  assert.equal(r.body.membership, 'pending');
  r = await stranger.c('GET', '/assessments'); assert.equal(r.status, 403); assert.equal(r.body.error, 'membership_pending');
  r = await stranger.c('GET', '/requirements'); assert.equal(r.status, 403);
  r = await stranger.c('GET', '/organisation'); assert.equal(r.body.membership, 'pending'); assert.deepEqual(r.body.members, [], 'pending cannot list members');
  // owner sees the request; a non-owner cannot decide
  r = await owner.c('GET', '/organisation');
  const req = r.body.members.find(m => m.email === 'stranger@x.example'); assert.equal(req.membership, 'pending');
  r = await stranger.c('PATCH', `/organisation/members/${req.userId}`, { action: 'approve' }); assert.equal(r.status, 403);
  r = await owner.c('PATCH', `/organisation/members/${req.userId}`, { action: 'reject' }); assert.equal(r.status, 200);
  r = await stranger.c('GET', '/assessments'); assert.equal(r.body.error, 'membership_rejected');
  // another joiner approved by an admin
  const colleague = await signUp('colleague@acme.example');
  await colleague.c('PUT', '/me/profile', { fullName: 'Carl Colleague', organisationName: 'Acme Insurance Ltd', sector: 'Financial Services', jobRole: 'Vendor Manager' });
  const a = client(); await a('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  const buyers = (await a('GET', '/admin/buyers')).body.organisations;
  const acme = buyers.find(o => o.name === 'Acme Insurance Ltd'); assert.equal(acme.pending, 1);
  const cid = acme.users.find(u => u.email === 'colleague@acme.example').id;
  r = await a('PATCH', `/admin/buyers/members/${cid}`, { action: 'approve' }); assert.equal(r.status, 200);
  r = await colleague.c('GET', '/requirements'); assert.equal(r.status, 200);
  assert.equal(r.body.requirements.length, 0, 'drafts stay private to their author');
  const ev = (await pool.query(`SELECT event FROM audit_events`)).rows.map(x => x.event);
  for (const e of ['organisation.join_requested', 'organisation.member_approved', 'organisation.member_rejected']) assert.ok(ev.includes(e), e);
});
