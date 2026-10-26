/* Stage 4 · Contract analysis API tests (steps 17–20). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s4-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { analyseContract, splitIntoClauses, findKeyTerms } = await import('../src/engine/clauses.js');
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

test('engine: numbered clauses are split, classified and key terms found', () => {
  const pages = [fixture('contract.txt').toString('utf8')];
  const clauses = splitIntoClauses(pages);
  assert.equal(clauses.length, 15);
  assert.deepEqual(clauses.map(c => c.number).slice(0, 3), ['1.1', '2.1', '3.1']);
  assert.equal(clauses.find(c => c.number === '6.1').heading, 'Personal Data Breach');

  const analysis = analyseContract(pages, { applicableControls: ['ASS-004', 'ASS-005'] });
  const breach = analysis.clauses.find(c => c.number === '6.1');
  assert.equal(breach.topics[0].topicId, 'breach_notification');
  assert.ok(breach.keyTerms.some(t => t.value === 'within 24 hours'));
  assert.equal(analysis.notFound.length, 0, 'the example contract covers every expected topic');
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(analysis)));

  assert.deepEqual(
    findKeyTerms('availability of 99.5% and a cap of £250,000').map(t => t.value),
    ['99.5%', '£250,000'],
  );
});

test('engine: an expected topic with no clause is reported as not found', () => {
  const pages = [
    '1. Services\n1.1 The Supplier shall provide IT support services to the Customer.\n2. Fees\n2.1 The Customer shall pay the fees within 30 days of invoice.',
  ];
  const analysis = analyseContract(pages);
  const missing = analysis.notFound.map(item => item.topicId);
  for (const topic of ['data_protection', 'breach_notification', 'audit_rights', 'international_transfer']) {
    assert.ok(missing.includes(topic), topic + ' should be reported');
  }
});

test('step 17: blocked until a vendor is selected and the compliance answers are submitted', async () => {
  let r = await uploadContract(buyer, { name: 'contract.pdf' }, fixture('contract.pdf'));
  assert.equal(r.status, 409);
  assert.match(r.body.message, /Select a vendor/);

  await selectVendorAndStartCompliance();
  r = await uploadContract(buyer, { name: 'contract.pdf' }, fixture('contract.pdf'));
  assert.equal(r.status, 409);
  assert.match(r.body.message, /not submitted/);

  await vendorSubmitsCompliance();
  const state = await buyer('GET', `/assessments/${ref}/contract`);
  assert.equal(state.body.blocked, null);
  assert.equal(state.body.versions.length, 0);
});

test('steps 17–20: a PDF is uploaded, analysed, saved and shown; timeline moves to Stage 5', async () => {
  const bad = await uploadContract(buyer, { name: 'contract.exe' }, Buffer.from('x'));
  assert.equal(bad.status, 400);

  const scanned = await uploadContract(buyer, { name: 'scan.txt' }, Buffer.from('page 1'), 'text/plain');
  assert.equal(scanned.status, 422, 'too little text is refused');

  const r = await uploadContract(
    buyer,
    { name: 'contract.pdf', label: 'Draft from vendor' },
    fixture('contract.pdf'),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.shownVersion, 1);
  assert.equal(r.body.versions[0].pages, 2);
  assert.equal(r.body.analysis.totals.clauses, 15);
  assert.ok(r.body.analysis.totals.relevant >= 12);
  assert.match(r.body.analysis.snapshotSha256, /^[0-9a-f]{64}$/);

  const assessment = await buyer('GET', `/assessments/${ref}`);
  for (const step of [17, 18, 19, 20]) {
    assert.ok(
      assessment.body.timeline.some(t => t.stage === 4 && t.step === step),
      'timeline step ' + step,
    );
  }
  assert.ok(
    assessment.body.timeline.some(t => t.stage === 5 && t.status === 'next'),
    'Stage 5 is next',
  );

  const download = await buyer('GET', `/assessments/${ref}/contract/1/file`);
  assert.equal(download.status, 200);
  assert.ok(download.body.equals(fixture('contract.pdf')), 'the original file comes back unchanged');

  const list = await buyer('GET', '/assessments');
  assert.equal(list.body.assessments[0].contract.version, 1);
});

test('a new version needs a reason; earlier versions are kept and cannot be changed', async () => {
  let r = await uploadContract(
    buyer,
    { name: 'contract.docx' },
    fixture('contract.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'reason_required');

  r = await uploadContract(
    buyer,
    { name: 'contract.docx', reason: 'Signed copy received from the vendor' },
    fixture('contract.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.shownVersion, 2);
  assert.equal(r.body.versions.length, 2);

  const first = await buyer('GET', `/assessments/${ref}/contract?version=1`);
  assert.equal(first.body.shownVersion, 1);
  assert.equal(first.body.versions.find(v => v.version === 1).fileName, 'contract.pdf');

  await assert.rejects(
    pool.query('UPDATE contract_documents SET file_name = $1', ['changed.pdf']),
    /append-only/,
  );
  await assert.rejects(pool.query('DELETE FROM contract_analyses'), /append-only/);

  const events = (
    await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-4' ORDER BY id`)
  ).rows.map(e => e.event);
  assert.deepEqual(events, [
    'contract.uploaded',
    'contract.analysed',
    'contract.version_uploaded',
    'contract.analysed',
  ]);
});

test('another buyer cannot see or upload; admin sees the contract on the assessment', async () => {
  assert.equal((await other('GET', `/assessments/${ref}/contract`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/contract`)).status, 403);

  const detail = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(detail.body.contract.versions.length, 2);
  assert.equal(detail.body.contract.analysis.totals.clauses, 15);
});
