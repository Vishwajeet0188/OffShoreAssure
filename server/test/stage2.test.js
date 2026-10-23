/* Stage 2 · Vendor selection API tests (steps 5–9). */
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
const { matchVendor } = await import('../src/engine/matching.js');
const { EXAMPLE } = await import('./fixtures.js');
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
  await c('POST', '/auth/verify', { email, code: r.body.devCode });
  return c;
}
const vendorProfile = (name, services, deliveryCountries) => ({ fullName: 'Vendor ' + name, jobRole: 'Delivery Manager', organisationName: name, registrationNumber: 'REG-' + name.length,
  country: deliveryCountries[0], services, deliveryCountries });
let admin, buyer, ref, ids = {};

async function vendor(email, name, services, countries, approve = true) {
  const c = await signUp(email, 'vendor');
  const r = await c('PUT', '/me/profile', vendorProfile(name, services, countries));
  const id = (await pool.query(`SELECT id FROM organisations WHERE kind = 'vendor' AND name = $1`, [name])).rows[0].id;
  if (approve) assert.equal((await admin('PATCH', '/admin/vendors/' + id, { status: 'approved' })).status, 200);
  return { c, id };
}

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
  await pool.query(`INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@oa.example', $1, 'active', true, 'admin', now())`, [await bcrypt.hash('Admin12345', 4)]);
  admin = client(); await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  buyer = await signUp('sarah@ukcompany.example');
  await buyer('PUT', '/me/profile', { fullName: 'Sarah Williams', organisationName: 'UK Company Ltd', sector: 'Financial Services', jobRole: 'Compliance Manager' });
  const id = (await buyer('POST', '/requirements', { data: { ...EXAMPLE, restrictedCountries: ['RU'] } })).body.requirement.id;
  ref = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  ids.good = (await vendor('anna@krakow.example', 'Krakow IT Services', ['IT Support'], ['PL', 'IN', 'BR', 'PH'])).id;
  ids.partial = (await vendor('raj@pune.example', 'Pune Helpdesk', ['IT Support'], ['IN'])).id;
  ids.wrong = (await vendor('li@payroll.example', 'Payroll Partners', ['Payroll'], ['PL'])).id;
  ids.restricted = (await vendor('ivan@moscow.example', 'Moscow Support', ['IT Support'], ['RU', 'PL'])).id;
  ids.pending = (await vendor('new@pending.example', 'Pending Support Co', ['IT Support'], ['PL'], false)).id;
});
after(async () => { server.close(); await pool.end(); });

test('step 6: matching engine explains service, location, restricted countries and scope', () => {
  const d = { ...EXAMPLE, restrictedCountries: ['RU'] };
  const v = (services, deliveryCountries, verificationStatus = 'approved') => matchVendor(d, { services, deliveryCountries, verificationStatus });
  assert.equal(v(['IT Support'], ['PL', 'IN', 'BR', 'PH']).result, 'GOOD');
  const partial = v(['IT Support'], ['IN']);
  assert.equal(partial.result, 'PARTIAL'); assert.deepEqual(partial.flags.sort(), ['location', 'scope']);
  assert.equal(v(['Payroll'], ['PL']).result, 'NO_MATCH');
  const r = v(['IT Support'], ['RU', 'PL']); assert.equal(r.result, 'NO_MATCH'); assert.ok(r.flags.includes('restricted'));
  assert.equal(v(['IT Support'], ['PL', 'IN', 'BR', 'PH'], 'pending').selectable, false);
});

test('step 5: search lists verified vendors only, best matches first, with filters', async () => {
  let r = await buyer('GET', `/assessments/${ref}/vendors`);
  assert.equal(r.status, 200);
  const names = r.body.vendors.map(v => v.name);
  assert.ok(!names.includes('Pending Support Co'), 'unverified vendors are not searchable');
  assert.equal(names[0], 'Krakow IT Services'); assert.equal(r.body.vendors[0].match.result, 'GOOD');
  assert.equal(r.body.vendors.at(-1).match.result, 'NO_MATCH');
  assert.deepEqual(r.body.criteria.restrictedCountries, ['RU']);
  r = await buyer('GET', `/assessments/${ref}/vendors?service=Payroll`); assert.deepEqual(r.body.vendors.map(v => v.name), ['Payroll Partners']);
  r = await buyer('GET', `/assessments/${ref}/vendors?country=IN`); assert.deepEqual(r.body.vendors.map(v => v.name).sort(), ['Krakow IT Services', 'Pune Helpdesk']);
  r = await buyer('GET', `/assessments/${ref}/vendors?search=pune`); assert.equal(r.body.vendors.length, 1);
  const vend = client(); await vend('POST', '/auth/login', { email: 'anna@krakow.example', password: 'Secure1234' });
  assert.equal((await vend('GET', `/assessments/${ref}/vendors`)).status, 403, 'vendors cannot search');
  const other = await signUp('other@elsewhere.example');
  await other('PUT', '/me/profile', { fullName: 'Other', organisationName: 'Elsewhere Ltd', sector: 'Retail', jobRole: 'Other' });
  assert.equal((await other('GET', `/assessments/${ref}/vendors`)).status, 404, 'other buyers cannot see the assessment');
});

test('step 7: shortlist (add, compare, remove) — unverified vendors cannot be added from search', async () => {
  for (const k of ['good', 'partial', 'restricted']) assert.equal((await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId: ids[k] })).status, 200);
  assert.equal((await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId: ids.pending })).status, 404);
  let r = await buyer('GET', `/assessments/${ref}/selection`);
  assert.equal(r.body.shortlist.length, 3);
  assert.ok(r.body.shortlist.every(v => v.match && v.match.checks.length === 5));
  r = await buyer('DELETE', `/assessments/${ref}/shortlist/${ids.restricted}`);
  assert.equal(r.body.shortlist.length, 2);
  assert.ok((await pool.query(`SELECT 1 FROM audit_events WHERE event = 'vendor_selection.shortlisted' AND ref = $1`, [ref])).rows.length);
});

test('step 5: invite by email — new vendors are linked when they register, buyers cannot be invited', async () => {
  let r = await buyer('POST', `/assessments/${ref}/invitations`, { email: 'bad', companyName: '' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.email && r.body.fields.companyName);
  r = await buyer('POST', `/assessments/${ref}/invitations`, { email: 'other@elsewhere.example', companyName: 'Elsewhere' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'not_a_vendor');
  r = await buyer('POST', `/assessments/${ref}/invitations`, { email: 'Maria@Manila.example', companyName: 'Manila Service Desk', message: 'Please register.' });
  assert.equal(r.status, 201); assert.equal(r.body.invitations[0].status, 'sent');
  assert.equal((await buyer('POST', `/assessments/${ref}/invitations`, { email: 'maria@manila.example', companyName: 'Manila' })).status, 409, 'once per assessment');
  const { c, id } = await vendor('maria@manila.example', 'Manila Service Desk', ['IT Support'], ['PH'], false);
  r = await buyer('GET', `/assessments/${ref}/selection`);
  assert.equal(r.body.invitations[0].status, 'joined');
  const inv = r.body.shortlist.find(v => v.id === id);
  assert.ok(inv, 'invited vendor appears on the shortlist'); assert.equal(inv.source, 'invitation'); assert.equal(inv.match.selectable, false);
  const v = await c('GET', '/vendor/assessments');
  assert.equal(v.body.invitations[0].reference, ref); assert.equal(v.body.invitations[0].buyerName, 'UK Company Ltd');
  // an existing vendor is linked at once
  r = await buyer('POST', `/assessments/${ref}/invitations`, { email: 'li@payroll.example', companyName: 'Payroll Partners' });
  assert.equal(r.status, 201); assert.ok(r.body.shortlist.some(x => x.id === ids.wrong));
});

test('step 8: confirm needs a shortlisted, verified vendor, a reason, and accepted flags for weak matches', async () => {
  let r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.good, rationale: 'short' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.rationale);
  r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.restricted, rationale: 'Cheapest offer and fastest onboarding.' });
  assert.equal(r.body.error, 'not_shortlisted');
  const manila = (await buyer('GET', `/assessments/${ref}/selection`)).body.shortlist.find(v => v.name === 'Manila Service Desk');
  r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: manila.id, rationale: 'Local presence in the Philippines.' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'not_verified');
  r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.partial, rationale: 'Strong references from a sister company.' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'accept_flags'); assert.deepEqual(r.body.flags.sort(), ['location', 'scope']);
});

test('step 9: selection saved as v1 (immutable), timeline Stage 2 done and Stage 3 next; vendor sees it', async () => {
  const r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.good, rationale: 'Best match on service and all four delivery countries; verified.' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = r.body.current;
  assert.equal(s.version, 1); assert.equal(s.vendor.name, 'Krakow IT Services'); assert.equal(s.match.result, 'GOOD');
  assert.ok(s.candidates.length >= 3); assert.match(s.snapshotSha256, /^[0-9a-f]{64}$/);
  await assert.rejects(pool.query(`UPDATE vendor_selections SET rationale = 'x' WHERE id = $1`, [s.id]), /append-only/);
  await assert.rejects(pool.query(`DELETE FROM vendor_selections WHERE id = $1`, [s.id]), /append-only/);
  const a = await buyer('GET', `/assessments/${ref}`);
  const tl = a.body.timeline;
  assert.ok(tl.some(t => t.stage === 2 && t.step === 8 && /Krakow/.test(t.title)));
  assert.ok(tl.some(t => t.stage === 2 && t.step === 9 && t.status === 'done'));
  assert.equal(tl.find(t => t.status === 'next').stage, 3);
  assert.equal(a.body.summary.currentStatus.code, 'VENDOR_SELECTED', 'Step 4 status follows the selection');
  assert.ok(a.body.summary.requiredNextActions.find(x => x.stage === 2).done);
  const order = tl.filter(t => t.status === 'done').map(t => t.stage * 100 + (t.step || 0));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'timeline in diagram order');
  const list = await buyer('GET', '/assessments');
  assert.equal(list.body.assessments[0].selectedVendor, 'Krakow IT Services');
  const vend = client(); await vend('POST', '/auth/login', { email: 'anna@krakow.example', password: 'Secure1234' });
  const v = await vend('GET', '/vendor/assessments');
  assert.equal(v.body.selected[0].reference, ref); assert.equal(v.body.selected[0].selectionVersion, 1);
  const other = client(); await other('POST', '/auth/login', { email: 'raj@pune.example', password: 'Secure1234' });
  assert.equal((await other('GET', '/vendor/assessments')).body.selected.length, 0, 'other vendors do not see it');
  assert.equal((await buyer('DELETE', `/assessments/${ref}/shortlist/${ids.good}`)).status, 409, 'selected vendor stays on the shortlist');
  assert.ok((await pool.query(`SELECT 1 FROM audit_events WHERE event = 'vendor_selection.confirmed' AND ref = $1`, [ref])).rows.length);
});

test('step 9: changing vendor creates v2 linked to v1 and needs a reason; admin sees the selection', async () => {
  let r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.good, rationale: 'Same vendor again, nothing new here.' });
  assert.equal(r.body.error, 'no_changes');
  r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.partial, rationale: 'Strong references from a sister company.', acceptFlags: true });
  assert.equal(r.status, 400); assert.ok(r.body.fields.changeReason);
  r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.partial, rationale: 'Strong references from a sister company.', acceptFlags: true, changeReason: 'Krakow withdrew its offer.' });
  assert.equal(r.status, 201);
  assert.equal(r.body.current.version, 2); assert.equal(r.body.versions[0].vendor.name, 'Krakow IT Services');
  assert.equal(r.body.current.previousId, r.body.versions[0].id); assert.deepEqual(r.body.current.acceptedFlags.sort(), ['location', 'scope']);
  const d = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(d.body.selection.current.vendor.name, 'Pune Helpdesk');
  const vd = await admin('GET', `/admin/vendors/${ids.partial}`);
  assert.ok(vd.body.assessments.some(x => x.reference === ref && x.selected));
});

test('selection is blocked while the requirement has contradictory answers', async () => {
  const id = (await buyer('POST', '/requirements', { data: { ...EXAMPLE, assessmentTitle: 'Contradiction', privilegedAccess: 'No' } })).body.requirement.id;
  const ref2 = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  await buyer('POST', `/assessments/${ref2}/shortlist`, { vendorId: ids.good });
  const st = await buyer('GET', `/assessments/${ref2}/selection`);
  assert.ok(st.body.blocked);
  const r = await buyer('POST', `/assessments/${ref2}/selection`, { vendorId: ids.good, rationale: 'Best match on service and countries.' });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'information_required');
});
