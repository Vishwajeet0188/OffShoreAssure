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
const { buildRegister, splitSentences, findPartyNames, findDeadline, RULES } = await import(
  '../src/engine/obligations.js'
);
const { EXAMPLE, startStage3, completeStage3, uploadSpecContract } = await import('./fixtures.js');
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
// A new upload with a reason is a new version of the main contract (DOC-001).
const uploadContract = (c, query, data, type = 'application/pdf') =>
  uploadSpecContract(c, ref, data, { type, ...query, ...(query.reason ? { replaces: 'DOC-001' } : {}) });

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
  assert.equal((await startStage3(buyer, ref)).status, 201);
}

async function vendorSubmitsCompliance() {
  const r = await completeStage3(vendor, ref);
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

const CONTROLS = ['ASS-004', 'ASS-005', 'ASS-006', 'ASS-007', 'ASS-012', 'ASS-013', 'ASS-014'];
// The Stage 4 analysis of the example contract (clauses + the 20 category findings).
const exampleAnalysis = (controls = CONTROLS) =>
  analyseContract([fixture('contract.txt').toString('utf8')], { applicableControls: controls });

const CONTEXT = {
  buyerName: 'UK Company Ltd',
  vendorName: 'Vendor A Test Ltd',
  applicableControls: CONTROLS,
  documents: {
    'DOC-001': { type: 'MSA', title: 'IT Support Services Agreement', executionStatus: 'SIGNED' },
  },
};

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
  assert.equal((await startStage3(buyer, ref)).status, 201);
  assert.equal((await completeStage3(vendor, ref)).status, 201);
  const r = await uploadContract(buyer, { name: 'contract.pdf' }, fixture('contract.pdf'));
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

/* ------------------------------------------------------------------ */
/*  Engine                                                            */
/* ------------------------------------------------------------------ */

test('engine: sentences and party names', () => {
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
});

test('step 21: the 12 fields per obligation, from the example contract', () => {
  const register = buildRegister(exampleAnalysis(), CONTEXT);
  const bySection = section => register.obligations.find(o => o.sourceClause.section === section);

  // The breach notice: OBL id, source document and clause, parties, trigger, deadline, frequency, evidence.
  const breach = bySection('6.1');
  assert.match(breach.id, /^OBL-\d{3}$/);
  assert.equal(breach.sourceDocument.id, 'DOC-001');
  assert.equal(breach.sourceDocument.type, 'MSA');
  assert.match(breach.sourceClause.clauseId, /^CLA-\d{3}$/);
  assert.equal(breach.responsibleParty.party, 'vendor');
  assert.equal(breach.responsibleParty.name, 'Vendor A Test Ltd');
  assert.equal(breach.beneficiary.name, 'UK Company Ltd');
  assert.match(breach.description, /^Notify the Customer/);
  assert.equal(breach.trigger.type, 'EVENT');
  assert.match(breach.trigger.text, /aware/i);
  assert.deepEqual(breach.deadline, { type: 'DURATION', text: 'within 24 hours' });
  assert.equal(breach.frequency, 'EVENT_DRIVEN');
  assert.ok(breach.requiredEvidence.includes('Incident notification record'));
  assert.ok(breach.consequence, 'a consequence is always recorded, even "not stated"');
  assert.ok(['UNVERIFIED', 'REQUIRES_VERIFICATION'].includes(breach.status));
  assert.ok(breach.confidence > 0 && breach.confidence <= 1);

  // Types and parties.
  assert.equal(bySection('7.1').type, 'Prohibition');
  assert.equal(bySection('9.1').type, 'Right');
  assert.equal(bySection('9.1').party, 'buyer');
  assert.equal(bySection('9.1').frequency, 'PERIODIC');
  assert.equal(bySection('10.1').party, 'both');
  assert.equal(bySection('10.2').trigger.type, 'ON_TERMINATION');
  assert.equal(bySection('10.2').frequency, 'ONE_OFF');
  assert.equal(bySection('3.2').frequency, 'MONTHLY');
  assert.equal(
    bySection('3.2').consequence.type,
    'CONTRACTUAL_REMEDY',
    'service credits in the same section',
  );

  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(register)));
});

test('step 21 boundary: no deadline in the contract is stored as UNSPECIFIED, never invented', () => {
  assert.deepEqual(findDeadline('The Supplier shall keep the data secure.'), {
    type: 'UNSPECIFIED',
    text: 'UNSPECIFIED',
  });
  assert.deepEqual(findDeadline('The Supplier shall notify the Customer without undue delay.'), {
    type: 'QUALITATIVE',
    text: 'Without undue delay',
  });
  assert.equal(findDeadline('The Supplier shall deliver the plan by 31 March 2027.').type, 'DATE');

  const register = buildRegister(exampleAnalysis(), CONTEXT);
  const security = register.obligations.find(o => o.sourceClause.section === '5.1');
  assert.equal(security.deadline.type, 'UNSPECIFIED');
  assert.ok(register.totals.unspecifiedDeadline > 0);
});

test('step 22: the 8 mapping fields, legal versus contractual basis, and the rule trace', () => {
  const register = buildRegister(exampleAnalysis(), CONTEXT);
  const breach = register.obligations.find(o => o.sourceClause.section === '6.1');

  const mapping = register.mappings.find(m => m.obligationId === breach.id);
  for (const field of [
    'obligationId',
    'clauseId',
    'requirementId',
    'ruleId',
    'ruleVersion',
    'applicabilityStatus',
    'mappingConfidence',
    'reviewerStatus',
  ]) {
    assert.ok(field in mapping, 'mapping field ' + field);
  }
  assert.equal(mapping.ruleId, 'R-CON-01');
  assert.equal(mapping.reviewerStatus, 'UNREVIEWED');

  // Article 28 terms are legal for a controller–processor relationship; incident notice is a contract term.
  const trace = id => register.ruleTrace.find(rule => rule.id === id);
  assert.equal(trace('R-A28-04').basis, 'LEGAL');
  assert.equal(trace('R-A28-04').status, 'COVERED');
  assert.equal(trace('R-CON-01').basis, 'CONTRACTUAL');

  // One rule may need several clauses: sub-processor authorisation AND change notice.
  assert.deepEqual(trace('R-A28-05').categories, ['CL-07', 'CL-08']);
  assert.ok(['PARTIAL', 'COVERED'].includes(trace('R-A28-05').status));
  assert.ok(register.checks.some(check => check.kind === 'BASIS'));
  assert.equal(RULES.length, register.ruleTrace.length);
});

test('step 22: a controller relationship turns Article 28 terms off; missing rules become gaps', () => {
  const controller = analyseContract([fixture('contract.txt').toString('utf8')], {
    applicableControls: CONTROLS,
    processingRole: 'controller',
  });
  const register = buildRegister(controller, CONTEXT);
  assert.equal(register.ruleTrace.find(rule => rule.id === 'R-A28-07').status, 'NOT_APPLICABLE');
  assert.ok(!register.gaps.some(gap => gap.ruleId.startsWith('R-A28')));

  const thin = analyseContract(
    [
      '1. Services\n1.1 The Supplier shall provide IT support services to the Customer during business hours.',
    ],
    { applicableControls: ['ASS-005'] },
  );
  const withGaps = buildRegister(thin, { applicableControls: ['ASS-005'] });
  assert.ok(withGaps.gaps.some(gap => gap.ruleId === 'R-A28-04' && gap.kind === 'MISSING'));
});

test('step 22 checks: wrong party, conflicting deadlines and downstream duties', () => {
  const analysis = analyseContract([
    [
      '1. Security',
      '1.1 The Customer shall implement appropriate technical and organisational security measures to protect Personal Data.',
      '2. Incident notification',
      '2.1 The Supplier shall notify the Customer of any security incident within 24 hours.',
      '3. Incident reporting',
      '3.1 The Supplier shall notify the Customer of any security incident within 72 hours of the incident.',
    ].join('\n'),
  ]);
  const register = buildRegister(analysis, { ...CONTEXT, subprocessorsUsed: true });
  const kinds = register.checks.map(check => check.kind);

  assert.ok(kinds.includes('PARTY'), 'security duty put on the buyer');
  assert.ok(kinds.includes('CONFLICT'), '24 hours against 72 hours');
  assert.ok(
    register.checks.some(check => check.kind === 'DOWNSTREAM' && check.severity === 'issue'),
    'no flow-down while sub-processors are used',
  );
});

test('step 23 boundary: a low-confidence obligation needs verification and is not monitored', () => {
  const analysis = analyseContract(['The service will be delivered by the team as agreed between them.']);
  const register = buildRegister(analysis, CONTEXT);
  const unclear = register.obligations[0];
  assert.equal(unclear.status, 'REQUIRES_VERIFICATION');
  assert.ok(unclear.confidence < 0.6);
  assert.ok(!register.monitors.some(m => m.obligationId === unclear.id && m.state === 'ACTIVE'));
});

test('engine: the audit rule is covered whichever party the sentence starts with', () => {
  // Found in practice: "the Customer may audit … and the Supplier shall provide the evidence".
  const analysis = analyseContract([
    "1. Audit\n1.1 The Customer, or an auditor appointed by it, may audit the Supplier's compliance with this " +
      "Agreement on 30 days' written notice, and the Supplier shall provide the supporting evidence requested.",
  ]);
  const register = buildRegister(analysis, { ...CONTEXT, applicableControls: ['ASS-013'] });
  assert.equal(register.ruleTrace.find(rule => rule.id === 'R-A28-10').status, 'COVERED');
});

/* ------------------------------------------------------------------ */
/*  API                                                               */
/* ------------------------------------------------------------------ */

test('step 21: blocked until the contract has been analysed (Stage 4)', async () => {
  const r = await buyer('POST', `/assessments/${ref}/obligations`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /contract first/);
  assert.equal((await buyer('GET', `/assessments/${ref}/obligations`)).body.canExtract, false);
});

let firstObligation;

test('steps 21–24: Obligation Register v1.0 saved with the 10 stored fields; Stage 6 next', async () => {
  await uploadContractAfterStage3();
  let state = await buyer('GET', `/assessments/${ref}/obligations`);
  assert.equal(state.body.canExtract, true);
  assert.equal(state.body.register, null);

  const r = await buyer('POST', `/assessments/${ref}/obligations`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const register = r.body.register;
  assert.equal(register.label, '1.0');
  assert.equal(register.contractVersion, 1);
  assert.ok(register.obligations.length >= 10);
  assert.ok(register.mappings.length > 0);
  assert.ok(register.monitors.length > 0, 'monitoring triggers created');
  assert.match(register.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.body.canExtract, false);

  // The 10 stored fields.
  const record = register.records[0];
  for (const field of [
    'obligationId',
    'assessmentId',
    'contractId',
    'clauseId',
    'ruleIds',
    'responsibleParty',
    'deadlineRule',
    'status',
    'version',
    'timestamp',
  ]) {
    assert.ok(field in record, 'stored field ' + field);
  }
  assert.equal(record.assessmentId, ref);
  assert.equal(record.version, '1.0');

  firstObligation = register.obligations.find(o => o.sourceClause.section === '6.1');
  assert.ok(firstObligation);

  assert.equal((await buyer('POST', `/assessments/${ref}/obligations`)).body.error, 'up_to_date');

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

test('step 24 boundary: a reviewer edit makes v1.1, attributed, keeping the original source', async () => {
  // An edit must say why.
  const noReason = await buyer('POST', `/assessments/${ref}/obligations/review`, {
    obligationId: firstObligation.id,
    action: 'EDIT',
    changes: { deadline: { type: 'DURATION', text: 'within 12 hours' } },
  });
  assert.equal(noReason.status, 400);

  const r = await buyer('POST', `/assessments/${ref}/obligations/review`, {
    obligationId: firstObligation.id,
    action: 'EDIT',
    changes: { deadline: { type: 'DURATION', text: 'within 12 hours' } },
    note: 'Schedule 2 shortens the notice period to 12 hours.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.register.label, '1.1');

  const edited = r.body.register.obligations.find(o => o.id === firstObligation.id);
  assert.equal(edited.deadline.text, 'within 12 hours');
  assert.equal(edited.original.deadline.text, 'within 24 hours', 'the extracted value is kept');
  assert.equal(edited.text, firstObligation.text, 'the contract text never changes');
  assert.deepEqual(edited.sourceClause, firstObligation.sourceClause);
  assert.equal(edited.status, 'VERIFIED');
  assert.equal(edited.version, 2);
  assert.equal(r.body.register.edit.by, 'sarah@ukcompany.example');

  // A mapping review is also a new version.
  const m = await buyer('POST', `/assessments/${ref}/obligations/review`, {
    obligationId: firstObligation.id,
    action: 'CONFIRM_MAPPING',
    ruleId: 'R-CON-01',
  });
  assert.equal(m.status, 201);
  assert.equal(m.body.register.label, '1.2');
  assert.equal(
    m.body.register.mappings.find(x => x.obligationId === firstObligation.id && x.ruleId === 'R-CON-01')
      .reviewerStatus,
    'CONFIRMED',
  );

  // v1.0 is still there and unchanged.
  const v1 = await buyer('GET', `/assessments/${ref}/obligations?version=1`);
  assert.equal(
    v1.body.register.obligations.find(o => o.id === firstObligation.id).deadline.text,
    'within 24 hours',
  );
});

test('a new contract version gives v2.0; reviewer edits carry over; earlier versions are locked', async () => {
  await uploadContract(
    buyer,
    { name: 'contract.docx', reason: 'Signed copy received from the vendor' },
    fixture('contract.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const r = await buyer('POST', `/assessments/${ref}/obligations`);
  assert.equal(r.status, 201);
  assert.equal(r.body.register.label, '2.0');
  assert.equal(r.body.versions.length, 4);

  await assert.rejects(pool.query('UPDATE obligation_registers SET totals = $1', ['{}']), /append-only/);
  const events = (
    await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-5' ORDER BY at`)
  ).rows.map(e => e.event);
  assert.deepEqual(events, [
    'obligations.extracted',
    'obligations.reviewed',
    'obligations.reviewed',
    'obligations.extracted',
  ]);
});

test('missed obligations: only monitored and verified ones can be escalated', async () => {
  const state = (await buyer('GET', `/assessments/${ref}/obligations`)).body.register;
  const waiting = state.monitors.find(m => m.state === 'AWAITING_VERIFICATION');
  if (waiting) {
    const refused = await buyer('POST', `/assessments/${ref}/obligations/${waiting.obligationId}/missed`, {
      note: 'Not done on time last month.',
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'needs_verification');
  }

  const active = state.monitors.find(m => m.state === 'ACTIVE' && m.owner === 'vendor');
  const r = await buyer('POST', `/assessments/${ref}/obligations/${active.obligationId}/missed`, {
    note: 'The breach on 3 Nov was reported after two days.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.missed.some(m => m.obligationId === active.obligationId));
});

test('vendor sees only its own obligations; other buyers and admins', async () => {
  const list = await vendor('GET', '/vendor/obligations');
  assert.equal(list.body.registers.length, 1);
  assert.equal(list.body.registers[0].label, '2.0');
  assert.ok(list.body.registers[0].yourObligations > 5);

  const own = await vendor('GET', `/vendor/obligations/${ref}`);
  assert.equal(own.status, 200);
  assert.ok(own.body.obligations.every(o => o.party === 'vendor' || o.party === 'both'));
  assert.ok(
    !own.body.obligations.some(o => o.sourceClause.section === '9.1'),
    'the buyer’s audit right is not listed as a vendor obligation',
  );

  assert.equal((await other('GET', `/assessments/${ref}/obligations`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/obligations`)).status, 403);

  const detail = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(detail.body.obligations.versions.length, 4);
});
