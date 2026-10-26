/* Stage 5 · Obligation extraction API tests (steps 21–24). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.DEV_SHOW_CODES = 'true';
process.env.RATE_LIMIT = 'false';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s5-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { analyseContract } = await import('../src/engine/clauses.js');
const { buildRegister, splitSentences, findPartyNames } = await import('../src/engine/obligations.js');
const { EXAMPLE } = await import('./fixtures.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body, raw) => {
    const headers = {
      ...(cookie ? { cookie } : {}),
      ...(raw ? { 'content-type': raw.type } : { 'content-type': 'application/json' }),
    };
    const r = await fetch(base + p, {
      method,
      headers,
      body: raw ? raw.data : body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return {
      status: r.status,
      body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()),
    };
  };
}
async function signUp(email, role) {
  const c = client();
  const r = await c('POST', '/auth/register', { email, password: 'Secure1234', role });
  await c('POST', '/auth/verify', { email, code: r.body.devCode });
  return c;
}
let admin, buyer, vendor, other, ref, vendorId;
const fixture = name => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url));
const uploadContract = (c, query, data, type = 'application/pdf') =>
  c('POST', `/assessments/${ref}/contract?${new URLSearchParams(query)}`, null, { type, data });

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
  await pool.query(
    `INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@oa.example', $1, 'active', true, 'admin', now())`,
    [await bcrypt.hash('Admin12345', 4)],
  );
  admin = client();
  await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  buyer = await signUp('sarah@ukcompany.example', 'buyer');
  await buyer('PUT', '/me/profile', {
    fullName: 'Sarah Williams',
    organisationName: 'UK Company Ltd',
    sector: 'Financial Services',
    jobRole: 'Compliance Manager',
  });
  const id = (await buyer('POST', '/requirements', { data: EXAMPLE })).body.requirement.id;
  ref = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  vendor = await signUp('anna@krakow.example', 'vendor');
  await vendor('PUT', '/me/profile', {
    fullName: 'Anna K',
    jobRole: 'Delivery Manager',
    organisationName: 'Krakow IT',
    registrationNumber: 'KRS 1',
    country: 'PL',
    services: ['IT Support'],
    deliveryCountries: ['PL', 'IN', 'BR', 'PH'],
  });
  vendorId = (await pool.query(`SELECT id FROM organisations WHERE name = 'Krakow IT'`)).rows[0].id;
  await admin('PATCH', '/admin/vendors/' + vendorId, { status: 'approved' });
  other = await signUp('tom@otherbuyer.example', 'buyer');
  await other('PUT', '/me/profile', {
    fullName: 'Tom',
    organisationName: 'Other Buyer Ltd',
    sector: 'Retail',
    jobRole: 'Compliance Manager',
  });
});
after(async () => {
  server.close();
  await pool.end();
});

async function selectVendorAndStartCompliance() {
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  await buyer('POST', `/assessments/${ref}/selection`, {
    vendorId,
    rationale: 'Best match on service and all delivery countries.',
    selectionSource: 'DIRECTORY',
    decision: 'SELECT_WITH_CONDITIONS',
    approverId: (await buyer('GET', '/me')).body.user.id,
    confirmedAt: new Date().toISOString(),
  });
  await buyer('POST', `/assessments/${ref}/compliance`);
}

async function vendorSubmitsCompliance() {
  const questionnaire = (await vendor('GET', `/vendor/compliance/${ref}`)).body.compliance.questionnaire;
  const answers = {};
  for (const control of questionnaire)
    for (const question of control.questions) answers[question.id] = { answer: 'Yes' };
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  const r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

const CONTROLS = ['ASS-004', 'ASS-005', 'ASS-006', 'ASS-007', 'ASS-012', 'ASS-013', 'ASS-014'];
const exampleClauses = () => analyseContract([fixture('contract.txt').toString('utf8')]).clauses;

async function uploadContractAfterStage3() {
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  await buyer('POST', `/assessments/${ref}/selection`, {
    vendorId,
    rationale: 'Best match on service and all delivery countries.',
    selectionSource: 'DIRECTORY',
    decision: 'SELECT_WITH_CONDITIONS',
    approverId: (await buyer('GET', '/me')).body.user.id,
    confirmedAt: new Date().toISOString(),
  });
  await buyer('POST', `/assessments/${ref}/compliance`);
  const questionnaire = (await vendor('GET', `/vendor/compliance/${ref}`)).body.compliance.questionnaire;
  const answers = {};
  for (const control of questionnaire)
    for (const question of control.questions) answers[question.id] = { answer: 'Yes' };
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  await vendor('POST', `/vendor/compliance/${ref}/submit`);
  const r = await uploadContract(buyer, { name: 'contract.pdf' }, fixture('contract.pdf'));
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

test('engine: sentences, party names and obligation types', () => {
  assert.deepEqual(
    splitSentences('The Supplier shall respond within 4 hours. Availability is 99.5% each month.'),
    ['The Supplier shall respond within 4 hours.', 'Availability is 99.5% each month.'],
  );

  const names = findPartyNames(
    [{ text: 'Between UK Company Ltd (the "Client") and Vendor A Test Ltd (the "Provider").' }],
    { buyerName: 'UK Company Ltd', vendorName: 'Vendor A Test Ltd' },
  );
  assert.equal(names.client, 'buyer');
  assert.equal(names.provider, 'vendor');

  const register = buildRegister(exampleClauses(), {
    buyerName: 'UK Company Ltd',
    vendorName: 'Vendor A Test Ltd',
    applicableControls: CONTROLS,
  });
  const byClause = number => register.obligations.find(o => o.source.clauseNumber === number);

  assert.equal(byClause('6.1').party, 'vendor');
  assert.equal(byClause('6.1').type, 'Obligation');
  assert.ok(byClause('6.1').deadline.includes('within 24 hours'));
  assert.ok(byClause('6.1').rules.includes('R-BRE-01'));
  assert.equal(byClause('7.1').type, 'Prohibition');
  assert.equal(byClause('9.1').type, 'Right');
  assert.equal(byClause('9.1').party, 'buyer');
  assert.equal(byClause('9.1').frequency, 'once in any 12 month period');
  assert.equal(byClause('10.1').party, 'both');
  assert.equal(byClause('10.2').condition, 'On termination');
  assert.equal(register.totals.gaps, 0, 'the example contract covers every rule');
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(register)));
});

test('engine: a rule with no obligation is a gap only when it applies to the requirement', () => {
  const clauses = analyseContract([
    '1. Services\n1.1 The Supplier shall provide IT support services to the Customer during business hours.',
  ]).clauses;
  const withTransfer = buildRegister(clauses, { applicableControls: ['ASS-005'] });
  assert.ok(withTransfer.gaps.some(gap => gap.ruleId === 'R-TRF-01'));
  const withoutTransfer = buildRegister(clauses, { applicableControls: [] });
  assert.ok(!withoutTransfer.gaps.some(gap => gap.ruleId === 'R-TRF-01'));
});

test('engine: an audit clause covers the audit rule whichever party the sentence starts with', () => {
  // Found in practice: "the Customer may audit … and the Supplier shall provide the evidence" is read as a
  // vendor obligation ("shall"); the audit rule must still count as covered.
  const clauses = analyseContract([
    "1. Audit\n1.1 The Customer, or an auditor appointed by it, may audit the Supplier's compliance with this " +
      "Agreement on 30 days' written notice, and the Supplier shall provide the supporting evidence requested.",
  ]).clauses;
  const register = buildRegister(clauses, {
    buyerName: 'UK Company Ltd',
    vendorName: 'ABC',
    applicableControls: ['ASS-013'],
  });

  const audit = register.ruleTrace.find(rule => rule.id === 'R-AUD-01');
  assert.equal(audit.status, 'COVERED');
  assert.ok(!register.gaps.some(gap => gap.ruleId === 'R-AUD-01'), 'no false "no obligation" gap');
});

test('step 21: blocked until the contract has been analysed (Stage 4)', async () => {
  const r = await buyer('POST', `/assessments/${ref}/obligations`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /contract first/);
  assert.equal((await buyer('GET', `/assessments/${ref}/obligations`)).body.canExtract, false);
});

test('steps 21–24: register extracted, saved, on the timeline; Stage 6 next', async () => {
  await uploadContractAfterStage3();
  let state = await buyer('GET', `/assessments/${ref}/obligations`);
  assert.equal(state.body.canExtract, true);
  assert.equal(state.body.register, null);

  const r = await buyer('POST', `/assessments/${ref}/obligations`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.register.version, 1);
  assert.equal(r.body.register.contractVersion, 1);
  assert.ok(r.body.register.obligations.length >= 10);
  assert.match(r.body.register.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.body.canExtract, false);

  assert.equal(
    (await buyer('POST', `/assessments/${ref}/obligations`)).body.error,
    'up_to_date',
    'same contract → not again',
  );

  const assessment = await buyer('GET', `/assessments/${ref}`);
  for (const step of [21, 22, 23, 24]) {
    assert.ok(
      assessment.body.timeline.some(t => t.stage === 5 && t.step === step),
      'timeline step ' + step,
    );
  }
  assert.ok(
    assessment.body.timeline.some(t => t.stage === 6 && t.status === 'next'),
    'Stage 6 is next',
  );

  const list = await buyer('GET', '/assessments');
  assert.equal(list.body.assessments[0].obligations.version, 1);
});

test('a new contract version allows register v2; v1 is kept and locked', async () => {
  await uploadContract(
    buyer,
    { name: 'contract.docx', reason: 'Signed copy received from the vendor' },
    fixture('contract.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const r = await buyer('POST', `/assessments/${ref}/obligations`);
  assert.equal(r.status, 201);
  assert.equal(r.body.register.version, 2);
  assert.equal(r.body.register.contractVersion, 2);
  assert.equal(r.body.versions.length, 2);
  assert.equal((await buyer('GET', `/assessments/${ref}/obligations?version=1`)).body.register.version, 1);

  await assert.rejects(pool.query('UPDATE obligation_registers SET totals = $1', ['{}']), /append-only/);
  const events = (await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-5'`)).rows.map(
    e => e.event,
  );
  assert.deepEqual(events, ['obligations.extracted', 'obligations.extracted']);
});

test('vendor sees only its own obligations; other buyers and admins', async () => {
  const list = await vendor('GET', '/vendor/obligations');
  assert.equal(list.body.registers.length, 1);
  assert.ok(list.body.registers[0].yourObligations > 5);

  const own = await vendor('GET', `/vendor/obligations/${ref}`);
  assert.equal(own.status, 200);
  assert.ok(own.body.obligations.every(o => o.party === 'vendor' || o.party === 'both'));
  assert.ok(
    !own.body.obligations.some(o => o.source.clauseNumber === '9.1'),
    'the buyer’s audit right is not listed as a vendor obligation',
  );

  assert.equal((await other('GET', `/assessments/${ref}/obligations`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/obligations`)).status, 403);

  const detail = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(detail.body.obligations.versions.length, 2);
});
