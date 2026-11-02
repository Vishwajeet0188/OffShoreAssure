/* Stage 6 · Transfer assessment API tests (steps 25–28). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.DEV_SHOW_CODES = 'true';
process.env.RATE_LIMIT = 'false';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s6-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { analyseContract } = await import('../src/engine/clauses.js');
const { assessTransfers, readContractTransferTerms } = await import('../src/engine/transfers.js');
const { EXAMPLE } = await import('./fixtures.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body, raw) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(raw ? { 'content-type': raw.type } : { 'content-type': 'application/json' }) };
    const r = await fetch(base + p, { method, headers, body: raw ? raw.data : body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
}
async function signUp(email, role) {
  const c = client(); const r = await c('POST', '/auth/register', { email, password: 'Secure1234', role });
  await c('POST', '/auth/verify', { email, code: r.body.devCode }); return c;
}
let admin, buyer, vendor, other, ref, vendorId;
const fixture = name => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url));
const uploadContract = (c, query, data, type = 'application/pdf') =>
  c('POST', `/assessments/${ref}/contract?${new URLSearchParams(query)}`, null, { type, data });

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0); base = `http://localhost:${server.address().port}/api`;
  await pool.query(`INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@oa.example', $1, 'active', true, 'admin', now())`, [await bcrypt.hash('Admin12345', 4)]);
  admin = client(); await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  buyer = await signUp('sarah@ukcompany.example', 'buyer');
  await buyer('PUT', '/me/profile', { fullName: 'Sarah Williams', organisationName: 'UK Company Ltd', sector: 'Financial Services', jobRole: 'Compliance Manager' });
  const id = (await buyer('POST', '/requirements', { data: EXAMPLE })).body.requirement.id;
  ref = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  vendor = await signUp('anna@krakow.example', 'vendor');
  await vendor('PUT', '/me/profile', { fullName: 'Anna K', jobRole: 'Delivery Manager', organisationName: 'Krakow IT', registrationNumber: 'KRS 1', country: 'PL', services: ['IT Support'], deliveryCountries: ['PL', 'IN', 'BR', 'PH'] });
  vendorId = (await pool.query(`SELECT id FROM organisations WHERE name = 'Krakow IT'`)).rows[0].id;
  await admin('PATCH', '/admin/vendors/' + vendorId, { status: 'approved' });
  other = await signUp('tom@otherbuyer.example', 'buyer');
  await other('PUT', '/me/profile', { fullName: 'Tom', organisationName: 'Other Buyer Ltd', sector: 'Retail', jobRole: 'Compliance Manager' });
});
after(async () => { server.close(); await pool.end(); });

async function selectVendorAndStartCompliance() {
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  await buyer('POST', `/assessments/${ref}/selection`, { vendorId, rationale: 'Best match on service and all delivery countries.',
    selectionSource: 'DIRECTORY', decision: 'SELECT_WITH_CONDITIONS', approverId: (await buyer('GET', '/me')).body.user.id, confirmedAt: new Date().toISOString() });
  await buyer('POST', `/assessments/${ref}/compliance`);
}

async function vendorSubmitsCompliance() {
  const questionnaire = (await vendor('GET', `/vendor/compliance/${ref}`)).body.compliance.questionnaire;
  const answers = {};
  for (const control of questionnaire) for (const question of control.questions) answers[question.id] = { answer: 'Yes' };
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  const r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

const CONTROLS = ['ASS-004', 'ASS-005', 'ASS-006', 'ASS-007', 'ASS-012', 'ASS-013', 'ASS-014'];
const exampleClauses = () => analyseContract([fixture('contract.txt').toString('utf8')]).clauses;

async function uploadContractAfterStage3() {
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  await buyer('POST', `/assessments/${ref}/selection`, { vendorId, rationale: 'Best match on service and all delivery countries.',
    selectionSource: 'DIRECTORY', decision: 'SELECT_WITH_CONDITIONS', approverId: (await buyer('GET', '/me')).body.user.id, confirmedAt: new Date().toISOString() });
  await buyer('POST', `/assessments/${ref}/compliance`);
  const questionnaire = (await vendor('GET', `/vendor/compliance/${ref}`)).body.compliance.questionnaire;
  const answers = {};
  for (const control of questionnaire) for (const question of control.questions) answers[question.id] = { answer: 'Yes' };
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  await vendor('POST', `/vendor/compliance/${ref}/submit`);
  const r = await uploadContract(buyer, { name: 'contract.pdf' }, fixture('contract.pdf'));
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

test('engine: routes from storage, access and delivery countries; each route checked', () => {
  const result = assessTransfers({
    requirement: EXAMPLE,
    vendor: { name: 'Krakow IT', deliveryCountries: ['PL', 'IN', 'BR', 'PH'] },
    contractClauses: exampleClauses(),
    vendorTransferScore: 50,
  });
  const route = name => result.routes.find(r => r.toName === name);

  assert.equal(route('Poland').status, 'ADEQUATE');
  assert.equal(route('United States').status, 'ADEQUATE_CHECK', 'US adequacy only covers certified organisations');
  assert.equal(route('India').status, 'SAFEGUARD_TRA_NEEDED', 'the contract names the IDTA and allows India');
  assert.equal(route('Brazil').status, 'SAFEGUARD_MISSING', 'the contract only allows India');
  assert.equal(route('Not confirmed').status, 'INFORMATION_NEEDED', 'sub-processor locations are not known');
  assert.equal(result.overall.status, 'SAFEGUARD_MISSING');
  assert.ok(result.questions.some(q => q.text.includes('transfer risk assessment') && q.text.includes('India')));
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(result)));
});

test('engine: restricted country is not permitted; UK-only data is not a restricted transfer', () => {
  const requirement = { ...EXAMPLE, storageCountries: ['GB'], remoteAccessCountries: ['GB', 'IN'], restrictedCountries: ['IN'], subprocessors: 'Prohibited' };
  const result = assessTransfers({ requirement, vendor: { name: 'Vendor', deliveryCountries: [] }, contractClauses: [] });
  assert.equal(result.routes.find(r => r.to === 'GB').status, 'NOT_RESTRICTED');
  assert.equal(result.routes.find(r => r.to === 'IN').status, 'NOT_PERMITTED');

  const terms = readContractTransferTerms([]);
  assert.deepEqual(terms.safeguards, []);
});

test('step 25: blocked until the obligations are extracted (Stage 5)', async () => {
  await uploadContractAfterStage3();
  const r = await buyer('POST', `/assessments/${ref}/transfers`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /obligations first/);
});

test('steps 25–28: assessment saved, on the timeline; Stage 7 next; not repeated without changes', async () => {
  await buyer('POST', `/assessments/${ref}/obligations`);
  let state = await buyer('GET', `/assessments/${ref}/transfers`);
  assert.equal(state.body.canRun, true);

  const r = await buyer('POST', `/assessments/${ref}/transfers`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.result.version, 1);
  assert.ok(r.body.result.routes.length >= 5);
  assert.equal(r.body.result.inputs.contract, 1);
  assert.match(r.body.result.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.body.canRun, false);
  assert.equal((await buyer('POST', `/assessments/${ref}/transfers`)).body.error, 'up_to_date');

  const assessment = await buyer('GET', `/assessments/${ref}`);
  for (const step of [25, 26, 27, 28]) {
    assert.ok(assessment.body.timeline.some(t => t.stage === 6 && t.step === step), 'timeline step ' + step);
  }
  assert.ok(assessment.body.timeline.some(t => t.stage === 7 && t.status === 'next'), 'Stage 7 is next');
  assert.equal((await buyer('GET', '/assessments')).body.assessments[0].transfers.version, 1);
});

test('a new contract and register allow v2; v1 kept and locked; access rules', async () => {
  await uploadContract(buyer, { name: 'contract.docx', reason: 'Signed copy received from the vendor' }, fixture('contract.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await buyer('POST', `/assessments/${ref}/obligations`);
  const r = await buyer('POST', `/assessments/${ref}/transfers`);
  assert.equal(r.status, 201);
  assert.equal(r.body.result.version, 2);
  assert.equal((await buyer('GET', `/assessments/${ref}/transfers?version=1`)).body.result.version, 1);

  await assert.rejects(pool.query('UPDATE transfer_assessments SET totals = $1', ['{}']), /append-only/);
  const events = (await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-6'`)).rows.map(e => e.event);
  assert.deepEqual(events, ['transfers.assessed', 'transfers.assessed']);

  assert.equal((await other('GET', `/assessments/${ref}/transfers`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/transfers`)).status, 403);
  assert.equal((await admin('GET', `/admin/assessments/${ref}`)).body.transfers.versions.length, 2);
});
