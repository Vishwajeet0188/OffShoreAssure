/* Stage 4 · Contract analysis tests (client specification "Input / Output Stage 4, 5, 6", steps 17–20). */
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
const { analyseContract, splitIntoClauses, findKeyTerms, CATEGORIES } = await import(
  '../src/engine/clauses.js'
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
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const upload = (data, meta = {}) => uploadSpecContract(buyer, ref, data, meta);
const ALL = [
  'ASS-002',
  'ASS-004',
  'ASS-005',
  'ASS-006',
  'ASS-007',
  'ASS-008',
  'ASS-012',
  'ASS-013',
  'ASS-014',
];
const status = (analysis, id) => analysis.findings.find(f => f.categoryId === id).status;

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

test('engine step 18: clauses with the 10 fields, categories CL-01 to CL-20, key terms', () => {
  const pages = [fixture('contract.txt').toString('utf8')];
  const clauses = splitIntoClauses(pages);
  assert.equal(clauses.length, 15);
  assert.deepEqual(clauses.map(c => c.number).slice(0, 3), ['1.1', '2.1', '3.1']);
  assert.equal(CATEGORIES.length, 20);

  const analysis = analyseContract(pages, { applicableControls: ALL });
  const breach = analysis.clauses.find(c => c.number === '6.1');
  for (const k of [
    'id',
    'documentId',
    'page',
    'number',
    'heading',
    'text',
    'category',
    'responsibleParty',
    'confidence',
    'reviewStatus',
  ])
    assert.ok(k in breach, k);
  assert.match(breach.id, /^CLA-\d{3}$/);
  assert.equal(breach.documentId, 'DOC-001');
  assert.equal(breach.category, 'CL-15');
  assert.equal(breach.responsibleParty, 'Supplier');
  assert.ok(breach.confidence > 0.5 && breach.confidence <= 1);
  assert.equal(
    breach.topics[0].topicId,
    'breach_notification',
    'older topic tags are kept for Stages 5 and 6',
  );
  assert.ok(breach.keyTerms.some(t => t.value === 'within 24 hours'));
  assert.deepEqual(
    findKeyTerms('availability of 99.5% and a cap of £250,000').map(t => t.value),
    ['99.5%', '£250,000'],
  );
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(analysis)));
});

test('engine step 20: FOUND, PARTIAL, MISSING, NOT APPLICABLE, HUMAN REVIEW with the 9 finding fields', () => {
  const pages = [fixture('contract.txt').toString('utf8')];
  let a = analyseContract(pages, { applicableControls: ALL });
  for (const k of [
    'clauseId',
    'heading',
    'page',
    'sourceRef',
    'rule',
    'status',
    'explanation',
    'confidence',
    'recommendedAction',
  ])
    assert.ok(k in a.findings[0], k);
  assert.equal(status(a, 'CL-05'), 'FOUND', 'confidentiality, section 4.2');
  assert.match(a.findings.find(f => f.categoryId === 'CL-05').sourceRef, /§4\.2/);
  assert.equal(status(a, 'CL-06'), 'FOUND');
  assert.equal(status(a, 'CL-14'), 'FOUND', 'transfers with the IDTA');
  assert.equal(status(a, 'CL-08'), 'MISSING', 'no notice-and-objection clause for subprocessor changes');
  assert.equal(status(a, 'CL-13'), 'PARTIAL', 'audit right without information rights');
  assert.equal(a.findings.find(f => f.categoryId === 'CL-04').rule, 'UK GDPR Art. 28(3)(a)');
  assert.equal(a.findings.find(f => f.categoryId === 'CL-19').rule, 'Contract term (not statutory)');
  assert.ok(a.notFound.some(n => n.categoryId === 'CL-08' && n.topicId === 'subprocessors'));

  // The specification's example: notice is given but the objection procedure is unclear.
  a = analyseContract(
    [
      '1. Sub-processors\n1.1 The Supplier shall notify the Customer of any new sub-processor 30 days in advance.',
    ],
    { applicableControls: ALL },
  );
  assert.equal(status(a, 'CL-08'), 'PARTIAL');
  assert.match(a.findings.find(f => f.categoryId === 'CL-08').explanation, /a way to object .*unclear/);

  // A heading alone is not proof.
  a = analyseContract(['1. Audit\n1.1 To be agreed.'], { applicableControls: ALL });
  assert.equal(status(a, 'CL-13'), 'PARTIAL');
  assert.match(a.findings.find(f => f.categoryId === 'CL-13').explanation, /heading alone is not proof/);

  // No controller–processor relationship: Article 28 terms are not required; commercial ones still are.
  a = analyseContract(pages, { applicableControls: ['ASS-012'], data: { personalData: 'No' } });
  assert.equal(status(a, 'CL-04'), 'NOT_APPLICABLE');
  assert.equal(status(a, 'CL-14'), 'NOT_APPLICABLE');
  assert.equal(status(a, 'CL-16'), 'FOUND');

  // Text with no clause numbering is read as paragraphs: nothing is reported as missing.
  a = analyseContract(
    ['This agreement covers IT support for the customer and its staff in the United Kingdom.'],
    {
      applicableControls: ALL,
    },
  );
  assert.equal(a.status, 'HUMAN_REVIEW');
  assert.equal(status(a, 'CL-08'), 'HUMAN_REVIEW');
  assert.equal(a.notFound.length, 0);
});

test('step 17: blocked until a vendor is selected and the compliance answers are submitted', async () => {
  let r = await upload(fixture('contract.pdf'));
  assert.equal(r.status, 409);
  assert.match(r.body.message, /Select a vendor/);
  await selectVendorAndStartCompliance();
  r = await upload(fixture('contract.pdf'));
  assert.equal(r.status, 409);
  assert.match(r.body.message, /not submitted/);
  await vendorSubmitsCompliance();
  const state = await buyer('GET', `/assessments/${ref}/contract`);
  assert.equal(state.body.blocked, null);
  assert.equal(state.body.documents.length, 0);
  assert.equal(state.body.relationship.processor, true);
});

test('step 17: the 11 fields are checked; unsafe and unsupported files are refused', async () => {
  const field = async (meta, expected) => {
    const r = await upload(fixture('contract.pdf'), meta);
    assert.equal(r.status, 400, JSON.stringify(meta));
    assert.equal(r.body.field, expected);
  };
  await field({ assessmentId: '00000000-0000-0000-0000-000000000000' }, 'assessmentId');
  await field({ documentType: 'LETTER' }, 'documentType');
  await field({ title: '' }, 'title');
  await field({ title: 'x'.repeat(201) }, 'title');
  await field({ buyerEntity: vendorId }, 'buyerEntity');
  await field(
    {
      supplierEntity: (await pool.query(`SELECT id FROM organisations WHERE name = 'UK Company Ltd'`)).rows[0]
        .id,
    },
    'supplierEntity',
  );
  await field({ governingLaw: 'Narnia' }, 'governingLaw');
  await field({ executionStatus: 'FINAL' }, 'executionStatus');
  await field({ effectiveOn: '' }, 'effectiveOn');
  await field({ effectiveOn: '2027-01-01', expiresOn: '2026-01-01' }, 'expiryExplanation');
  await field({ language: 'xx' }, 'language');
  await field({ name: 'contract.txt' }, 'file');
  // Malware and file-type checks.
  let r = await upload(Buffer.from('MZ\x90\x00 program'), { name: 'contract.pdf' });
  assert.equal(r.body.error, 'file_blocked');
  r = await upload(Buffer.from('hello'), { name: 'contract.pdf' });
  assert.equal(r.body.error, 'file_blocked', 'content does not match the extension');
});

test('steps 17–20: a signed MSA is uploaded, analysed and saved; the clause table and timeline', async () => {
  const r = await upload(fixture('contract.pdf'));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(
    { id: r.body.upload.documentId, v: r.body.upload.version, s: r.body.upload.analysisStatus },
    { id: 'DOC-001', v: 1, s: 'ANALYSED' },
  );
  const a = r.body.analysis;
  assert.equal(a.version, 1);
  assert.equal(a.totals.clauses, 15);
  assert.equal(a.findings.length, 20);
  assert.ok(a.totals.found >= 8 && a.totals.missing >= 3);
  assert.equal(status(a, 'CL-05'), 'FOUND');
  assert.match(a.snapshotSha256, /^[0-9a-f]{64}$/);
  const doc = r.body.documents[0];
  assert.equal(doc.documentType, 'MSA');
  assert.equal(doc.executed, true);
  assert.equal(doc.governingLaw.name, 'England and Wales');
  assert.match(doc.textSha256, /^[0-9a-f]{64}$/);
  assert.ok(doc.extractionJobId);
  assert.ok(r.body.versions[0].trigger === 'upload');

  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  for (const step of [17, 18, 19, 20])
    assert.ok(
      tl.some(t => t.stage === 4 && t.step === step),
      'timeline step ' + step,
    );
  assert.ok(tl.some(t => t.stage === 5 && t.status === 'next'));
  const download = await buyer('GET', `/assessments/${ref}/contract/file/${doc.id}`);
  assert.ok(download.body.equals(fixture('contract.pdf')), 'the original file comes back unchanged');
  assert.equal((await buyer('GET', '/assessments')).body.assessments[0].contract.version, 1);
});

test('a draft DPA joins the set; an unsigned draft is not treated as executed; new versions need a reason', async () => {
  let r = await upload(fixture('contract.docx'), {
    name: 'dpa-draft.docx',
    type: DOCX,
    documentType: 'DPA',
    title: 'Data Processing Agreement',
    executionStatus: 'DRAFT',
    effectiveOn: '',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.upload.documentId, 'DOC-002');
  assert.equal(r.body.analysis.version, 2);
  assert.equal(r.body.analysis.totals.documents, 2);
  assert.ok(r.body.analysis.preliminary.some(p => /DOC-002 .*unsigned draft/.test(p)));
  assert.equal(r.body.documents.find(d => d.documentId === 'DOC-002').executed, false);

  r = await upload(fixture('contract.docx'), {
    name: 'dpa.docx',
    type: DOCX,
    documentType: 'DPA',
    replaces: 'DOC-002',
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.field, 'reason');
  r = await upload(fixture('contract.docx'), {
    name: 'dpa-signed.docx',
    type: DOCX,
    documentType: 'DPA',
    title: 'Data Processing Agreement',
    replaces: 'DOC-002',
    reason: 'Signed copy received from the vendor',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.upload.documentId, 'DOC-002');
  assert.equal(r.body.upload.version, 2);
  assert.equal(r.body.analysis.totals.documents, 2, 'the set still has two documents');
  assert.ok(!r.body.analysis.preliminary.some(p => /unsigned draft/.test(p)));
  assert.equal(r.body.documents.length, 3, 'the earlier version is kept');
});

test('an unreadable file is kept for manual review; nothing is reported missing from it', async () => {
  const r = await upload(Buffer.from('%PDF-1.4 scanned image only'), {
    name: 'schedule.pdf',
    documentType: 'OTHER',
    title: 'Security Schedule',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.upload.extractionStatus, 'UNREADABLE');
  assert.equal(r.body.analysis.status, 'HUMAN_REVIEW');
  assert.ok(r.body.analysis.quality.reasons.some(x => /DOC-003 could not be read/.test(x)));
  assert.equal(
    r.body.analysis.notFound.length,
    0,
    'a missing clause cannot be reported while a document is unreadable',
  );
  assert.ok(r.body.analysis.findings.some(f => f.status === 'HUMAN_REVIEW'));
});

test('step 19: reviewer corrections are attributed, saved as a new version and never change the original', async () => {
  const before = (await buyer('GET', `/assessments/${ref}/contract`)).body;
  const audit = before.analysis.clauses.find(c => c.number === '9.1');
  let r = await buyer('POST', `/assessments/${ref}/contract/review`, {
    action: 'SET_FINDING',
    categoryId: 'CL-13',
    status: 'FOUND',
  });
  assert.equal(r.status, 400, 'a note is needed');
  r = await buyer('POST', `/assessments/${ref}/contract/review`, {
    action: 'SET_FINDING',
    categoryId: 'CL-13',
    status: 'FOUND',
    note: 'Information rights are in Schedule 4, checked by hand.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.analysis.version, before.analysis.version + 1);
  assert.equal(r.body.analysis.trigger, 'review');
  const f = r.body.analysis.findings.find(x => x.categoryId === 'CL-13');
  assert.equal(f.status, 'FOUND');
  assert.equal(f.reviewed.by, 'sarah@ukcompany.example');
  r = await buyer('POST', `/assessments/${ref}/contract/review`, { action: 'VERIFY', clauseKey: audit.key });
  const verified = r.body.analysis.clauses.find(c => c.key === audit.key);
  assert.equal(verified.reviewStatus, 'VERIFIED');
  assert.equal(verified.text, audit.text, 'the extracted text is not changed');
  assert.equal(r.body.analysis.corrections.length, 2);
  const earlier = await buyer('GET', `/assessments/${ref}/contract?version=${before.analysis.version}`);
  assert.equal(
    earlier.body.analysis.findings.find(x => x.categoryId === 'CL-13').status,
    before.analysis.findings.find(x => x.categoryId === 'CL-13').status,
    'history kept',
  );
  await assert.rejects(
    pool.query('UPDATE contract_documents SET file_name = $1', ['changed.pdf']),
    /append-only/,
  );
  await assert.rejects(pool.query('DELETE FROM contract_analyses'), /append-only/);
  const events = (
    await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-4' ORDER BY id`)
  ).rows.map(e => e.event);
  assert.ok(
    events.includes('contract.corrected') &&
      events.includes('contract.version_uploaded') &&
      events.includes('contract.file_blocked'),
  );
});

test('another buyer cannot see or upload; admin sees the contract set on the assessment', async () => {
  assert.equal((await other('GET', `/assessments/${ref}/contract`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/contract`)).status, 403);
  const detail = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(detail.body.contract.documents.length, 4);
  assert.equal(detail.body.contract.analysis.findings.length, 20);
});
