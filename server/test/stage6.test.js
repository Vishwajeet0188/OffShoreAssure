/* Stage 6 · Transfer assessment API tests (steps 25–28). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s6-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { analyseContract } = await import('../src/engine/clauses.js');
const { assessTransfers, readContractTransferTerms, mapRoutes } = await import('../src/engine/transfers.js');
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
const exampleClauses = () => analyseContract([fixture('contract.txt').toString('utf8')]).clauses;

// The client's example: UK buyer → Poland supplier → India and Philippines support, a Brazil sub-processor, a US cloud host.
const BUYER = { id: 'b-1', name: 'UK Company Ltd', country: 'GB' };
const VENDOR = { id: 'v-1', name: 'Krakow IT', country: 'PL', deliveryCountries: ['PL', 'IN', 'PH'] };
const STAGE3 = {
  answers: {
    'SUB-01': {
      answer: 'Yes',
      rows: [
        { name: 'Rio Helpdesk Ltda', country: 'BR', service: 'Ticket triage' },
        { name: 'Example Cloud Inc', country: 'US', service: 'Cloud hosting' },
      ],
    },
    'TRF-03': { answer: 'Yes' },
  },
  results: [{ controlId: 'SEC-04', status: 'PASS' }],
};
const example = (extra = {}) =>
  assessTransfers({
    requirement: { ...EXAMPLE, remoteAccessCountries: ['IN', 'PH'] },
    buyer: BUYER,
    vendor: VENDOR,
    processingRole: 'processor',
    stage3: STAGE3,
    contract: {
      clauses: exampleClauses(),
      documents: [{ documentNo: 'DOC-001', type: 'MSA', executionStatus: 'SIGNED' }],
    },
    ...extra,
  });

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

test('step 25: routes are between legal entities, with the 18 fields', () => {
  const routes = mapRoutes({
    requirement: { ...EXAMPLE, remoteAccessCountries: ['IN', 'PH'] },
    buyer: BUYER,
    vendor: VENDOR,
    processingRole: 'processor',
    stage3: STAGE3,
  });
  const byKey = key => routes.find(r => r.key === key);

  // Buyer → primary supplier, then supplier → its teams, sub-processor and cloud host.
  assert.equal(byKey('vendor').exporter.name, 'UK Company Ltd');
  assert.equal(byKey('vendor').importer.name, 'Krakow IT');
  assert.equal(byKey('vendor').importerCountry, 'PL');
  assert.equal(byKey('vendor').importerRole, 'PROCESSOR');
  assert.equal(byKey('access:IN').exporter.name, 'Krakow IT');
  assert.equal(byKey('access:IN').parentKey, 'vendor');
  assert.equal(byKey('sub:rio-helpdesk-ltda').importerCountry, 'BR');
  assert.equal(byKey('sub:example-cloud-inc').storageLocation[0], 'US');
  assert.deepEqual(
    byKey('vendor')
      .onwardRecipients.map(r => r.routeKey)
      .sort(),
    ['access:IN', 'access:PH', 'sub:example-cloud-inc', 'sub:rio-helpdesk-ltda'],
  );

  for (const field of [
    'id',
    'exporter',
    'exporterCountry',
    'importer',
    'importerCountry',
    'exporterRole',
    'importerRole',
    'dataSubjectCategories',
    'dataCategories',
    'dataSensitivity',
    'processingPurpose',
    'storageLocation',
    'remoteAccessLocation',
    'onwardRecipients',
    'transferFrequency',
    'encryptionAccessControls',
    'subprocessorRelationship',
  ]) {
    assert.ok(field in byKey('vendor'), 'route field ' + field);
  }
  assert.equal(byKey('vendor').encryptionAccessControls.encryption, 'PASS');
});

test('step 26: the decision sequence gives each route its own finding, never "cleared"', () => {
  const result = example();
  const byKey = key => result.routes.find(r => r.key === key);

  // Poland: adequacy, record the evidence; onward transfers are their own routes.
  assert.equal(byKey('vendor').status, 'ADEQUACY_ROUTE');
  assert.equal(byKey('vendor').decision.adequacyStatus, 'COVERED');
  assert.equal(byKey('vendor').decision.onwardTransferStatus, 'ASSESSED_SEPARATELY');

  // India: the supplier's team abroad; the legal entity is not known, so no final decision.
  assert.equal(byKey('access:IN').status, 'INFORMATION_REQUIRED');
  assert.equal(byKey('access:IN').decision.separateEntityTest, 'UNKNOWN');
  assert.match(byKey('access:IN').output.rationale, /recipient entity is not verified/);

  // Brazil: the contract only allows India, so the IDTA does not cover it → block or escalate.
  assert.equal(byKey('sub:rio-helpdesk-ltda').status, 'LEGAL_REVIEW_REQUIRED');
  assert.equal(byKey('sub:rio-helpdesk-ltda').outcome, 'BLOCK_OR_ESCALATE');

  // USA: adequacy only for certified organisations; not confirmed, so it goes to the safeguard question.
  assert.equal(byKey('sub:example-cloud-inc').decision.adequacyStatus, 'CONDITION_NOT_CONFIRMED');
  assert.ok(byKey('sub:example-cloud-inc').output.missingDocuments.includes('Adequacy eligibility evidence'));

  // Every route has the 12 decision fields and the 10 output fields.
  for (const route of result.routes) {
    assert.equal(Object.keys(route.decision).length, 12, route.key + ' decision fields');
    assert.equal(Object.keys(route.output).length, 10, route.key + ' output fields');
  }
  assert.ok(!/\b(compliant|legally cleared)\b/i.test(JSON.stringify(result.routes.map(r => r.output))));
});

test('step 26 boundaries: a signed IDTA and a completed TRA give conditional clearance; a draft does not', () => {
  const facts = {
    'access:IN': {
      importerName: 'Krakow IT India Pvt Ltd',
      separateEntity: 'YES',
      importerRole: 'SUBPROCESSOR',
      safeguardType: 'IDTA',
      instrumentStatus: 'DRAFT',
      traStatus: 'COMPLETED',
      traReference: 'TRA-IN-2026-01',
    },
  };
  const draft = example({ facts }).routes.find(r => r.key === 'access:IN');
  assert.equal(draft.status, 'SAFEGUARD_REVIEW');
  assert.equal(draft.outcome, 'BLOCK_OR_ESCALATE', 'an unsigned IDTA cannot satisfy the assessment');
  assert.ok(draft.output.missingDocuments.includes('Signed transfer agreement'));

  facts['access:IN'].instrumentStatus = 'EXECUTED';
  const signed = example({ facts }).routes.find(r => r.key === 'access:IN');
  assert.equal(signed.status, 'SAFEGUARD_REVIEW');
  assert.equal(signed.outcome, 'CONDITIONAL_CLEARANCE');
  assert.equal(signed.record.traReference, 'TRA-IN-2026-01');

  // The supplier's own staff abroad: not a further restricted transfer under this test.
  const own = example({ facts: { 'access:PH': { separateEntity: 'NO' } } }).routes.find(
    r => r.key === 'access:PH',
  );
  assert.equal(own.status, 'NO_RESTRICTED_TRANSFER');
});

test('step 26: no personal data, a restricted country, and UK-only data', () => {
  const none = example({ requirement: { ...EXAMPLE, personalData: 'No' } });
  assert.ok(none.routes.every(r => r.decision.applicableRegime === 'NOT_APPLICABLE'));

  const restricted = example({
    requirement: { ...EXAMPLE, remoteAccessCountries: ['IN'], restrictedCountries: ['BR'] },
  });
  assert.equal(restricted.routes.find(r => r.importerCountry === 'BR').status, 'LEGAL_REVIEW_REQUIRED');

  const ukVendor = example({ vendor: { ...VENDOR, country: 'GB', deliveryCountries: ['GB'] } });
  assert.equal(ukVendor.routes.find(r => r.key === 'vendor').status, 'NO_RESTRICTED_TRANSFER');

  assert.equal(readContractTransferTerms([]).safeguard, null);
});

test('step 28: an unchanged route keeps its version; a changed one gets the next', () => {
  const first = example();
  const previousRoutes = Object.fromEntries(
    first.routes.map(r => [r.key, { version: r.routeVersion, fingerprint: r.fingerprint }]),
  );
  const again = example({ previousRoutes, facts: { 'access:IN': { separateEntity: 'NO' } } });

  assert.equal(again.routes.find(r => r.key === 'vendor').routeVersion, 1);
  assert.equal(again.routes.find(r => r.key === 'access:IN').routeVersion, 2);
  assert.equal(again.totals.changedRoutes, 1);
});

/* ------------------------------------------------------------------ */
/*  API                                                               */
/* ------------------------------------------------------------------ */

test('step 25: blocked until the obligations are extracted (Stage 5)', async () => {
  await uploadContractAfterStage3();
  const r = await buyer('POST', `/assessments/${ref}/transfers`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /obligations first/);
});

test('steps 25–28: Transfer Assessment Register v1.0, each route saved; Stage 7 next', async () => {
  await buyer('POST', `/assessments/${ref}/obligations`);
  const state = await buyer('GET', `/assessments/${ref}/transfers`);
  assert.equal(state.body.canRun, true);

  const r = await buyer('POST', `/assessments/${ref}/transfers`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const result = r.body.result;
  assert.equal(result.label, '1.0');
  assert.ok(result.routes.length >= 4);
  assert.ok(result.flowMap.edges.length === result.routes.length, 'the data-flow map has one edge per route');
  assert.match(result.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.body.canRun, false);
  assert.equal((await buyer('POST', `/assessments/${ref}/transfers`)).body.error, 'up_to_date');

  // The 12 stored fields, one row per route.
  const saved = (await pool.query('SELECT record FROM transfer_routes')).rows;
  assert.equal(saved.length, result.routes.length);
  for (const field of [
    'routeId',
    'exporter',
    'importer',
    'countries',
    'processingRoles',
    'restrictedTransferFinding',
    'legalMechanism',
    'documentReferences',
    'traReference',
    'ruleVersion',
    'reviewer',
    'timestamp',
  ]) {
    assert.ok(field in saved[0].record, 'stored field ' + field);
  }

  const assessment = await buyer('GET', `/assessments/${ref}`);
  for (const step of [25, 26, 27, 28]) {
    assert.ok(
      assessment.body.timeline.some(t => t.stage === 6 && t.step === step),
      'timeline step ' + step,
    );
  }
  assert.ok(
    assessment.body.timeline.some(t => t.stage === 7 && t.status === 'next'),
    'Stage 7 is next',
  );
  assert.equal((await buyer('GET', '/assessments')).body.assessments[0].transfers.version, 1);
});

test('route facts from the buyer give a new route version and a reassessment', async () => {
  const before = (await buyer('GET', `/assessments/${ref}/transfers`)).body.result;
  const india = before.routes.find(r => r.key === 'access:IN');
  assert.ok(india, 'India route');

  // A reason is needed.
  const noReason = await buyer('POST', `/assessments/${ref}/transfers/routes/access:IN/facts`, {
    separateEntity: 'YES',
  });
  assert.equal(noReason.status, 400);

  const r = await buyer('POST', `/assessments/${ref}/transfers/routes/access:IN/facts`, {
    importerName: 'Krakow IT India Pvt Ltd',
    separateEntity: 'YES',
    importerRole: 'SUBPROCESSOR',
    safeguardType: 'IDTA',
    instrumentStatus: 'EXECUTED',
    traStatus: 'COMPLETED',
    traReference: 'TRA-IN-2026-01',
    reason: 'Confirmed by the vendor’s subprocessor register dated 1 Nov.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.result.label, '2.0');

  const after = r.body.result.routes.find(r => r.key === 'access:IN');
  assert.equal(after.importer.name, 'Krakow IT India Pvt Ltd');
  assert.equal(after.routeVersion, 2);
  assert.equal(after.status, 'SAFEGUARD_REVIEW');
  assert.equal(after.record.reviewer, 'sarah@ukcompany.example');
  assert.equal(
    r.body.result.routes.find(r => r.key === 'vendor').routeVersion,
    1,
    'other routes keep their version',
  );

  const history = await buyer('GET', `/assessments/${ref}/transfers/routes/access:IN`);
  assert.deepEqual(
    history.body.versions.map(v => v.routeVersion),
    [2, 1],
  );
  assert.equal(history.body.facts.length, 1);

  // A legal reviewer's conclusion is recorded on the route.
  const legal = await buyer('POST', `/assessments/${ref}/transfers/routes/access:IN/facts`, {
    legalReviewNote: 'IDTA tables checked against the subprocessor agreement; acceptable.',
    reason: 'Legal review by the in-house counsel.',
  });
  assert.equal(legal.status, 201);
  assert.equal(
    legal.body.result.routes.find(r => r.key === 'access:IN').decision.legalReviewStatus,
    'COMPLETED',
  );
});

test('a new contract and register allow another version; versions locked; access rules', async () => {
  await uploadContract(
    buyer,
    { name: 'contract.docx', reason: 'Signed copy received from the vendor' },
    fixture('contract.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  await buyer('POST', `/assessments/${ref}/obligations`);
  const r = await buyer('POST', `/assessments/${ref}/transfers`);
  assert.equal(r.status, 201);
  assert.equal(r.body.result.label, '4.0');
  assert.equal((await buyer('GET', `/assessments/${ref}/transfers?version=1`)).body.result.version, 1);

  await assert.rejects(pool.query('UPDATE transfer_assessments SET totals = $1', ['{}']), /append-only/);
  await assert.rejects(pool.query('DELETE FROM transfer_routes'), /append-only/);
  await assert.rejects(pool.query('UPDATE transfer_route_facts SET reason = $1', ['x']), /append-only/);

  const events = (
    await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-6' ORDER BY at`)
  ).rows.map(e => e.event);
  assert.deepEqual(events, [
    'transfers.assessed',
    'transfers.facts_confirmed',
    'transfers.assessed',
    'transfers.facts_confirmed',
    'transfers.assessed',
    'transfers.assessed',
  ]);

  assert.equal((await other('GET', `/assessments/${ref}/transfers`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/transfers`)).status, 403);
  assert.equal((await admin('GET', `/admin/assessments/${ref}`)).body.transfers.versions.length, 4);
});
