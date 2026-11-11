/* Stage 3 · Compliance assessment tests (client specification "Stage 3 Inputs and Outputs", steps 10–16). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s3-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { derive } = await import('../src/engine/rulepack.js');
const { applicableControls } = await import('../src/engine/controls.js');
const A = await import('../src/engine/assurance.js');
const { scanFile, analyseDocument } = await import('../src/compliance/evidenceChecks.js');
const { EXAMPLE, positiveAnswer } = await import('./fixtures.js');
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

/* Emails are printed to the console in tests: keep them so the invitation link can be read. */
const mail = [];
const log = console.log;
console.log = (...args) => {
  if (String(args[0]).startsWith('[DEV EMAIL]')) mail.push(args.join(' '));
  else log(...args);
};
const lastInvite = () =>
  [...mail]
    .reverse()
    .join('\n')
    .match(/invite=([A-Za-z0-9_-]+)/)?.[1];

let admin, buyer, vendor, other, ref, vendorId, start;
const choice = async body => ({
  selectionSource: 'DIRECTORY',
  decision: 'SELECT_WITH_CONDITIONS',
  confirmedAt: new Date().toISOString(),
  approverId: (await pool.query(`SELECT id FROM users WHERE email = 'sarah@ukcompany.example'`)).rows[0].id,
  ...body,
});

/* A readable text document that names the vendor (more than 200 characters, so it can be read). */
const doc = (title, extra = '', company = 'Krakow IT') =>
  Buffer.from(
    `${title}\n${company} sp. z o.o.${company === 'Krakow IT' ? ', registered in Poland (KRS 1)' : ''}.\n${extra}\n` +
      'This document describes how the company manages the subject above, who is responsible and how often it is reviewed. '.repeat(
        3,
      ),
  );
const up = (c, q, data, type = 'text/plain') =>
  c('POST', `/vendor/compliance/${ref}/evidence?${new URLSearchParams(q)}`, null, { type, data });

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
  other = await signUp('raj@pune.example', 'vendor');
  await other('PUT', '/me/profile', {
    fullName: 'Raj',
    jobRole: 'Delivery Manager',
    organisationName: 'Pune Help',
    registrationNumber: 'P1',
    country: 'IN',
    services: ['IT Support'],
    deliveryCountries: ['IN'],
  });
});
after(async () => {
  console.log = log;
  server.close();
  await pool.end();
});

/* ---------------- Engine ---------------- */
const VENDOR = {
  id: 'v1',
  name: 'Krakow IT',
  source: 'self_registered',
  verification_status: 'approved',
  registration_number: 'KRS 1',
  country: 'PL',
  delivery_countries: ['PL', 'IN', 'BR', 'PH'],
};
function controlSet(d = EXAMPLE, vendor = VENDOR, start = {}) {
  const derived = derive(d);
  const x = A.buildContext({
    d,
    derived,
    controls: applicableControls(d, derived),
    vendor,
    start: { ...A.startDefaults(d, vendor), ...start },
  });
  return A.generateControlSet(x);
}
/* Answers as the API saves them (cleaned, with the answer filled in for countries, hours and amounts). */
const clean = (qn, id, raw) =>
  A.cleanAnswer(
    qn.controls.find(c => c.id === id),
    raw,
  ).value;
const allPositive = qn =>
  Object.fromEntries(qn.controls.map(c => [c.id, clean(qn, c.id, positiveAnswer(c))]));
const evidenceFor = (qn, extra = {}) =>
  qn.controls.flatMap(c =>
    c.evidence
      .filter(t => t !== 'OTHER')
      .slice(0, 1)
      .map(t => ({
        id: 'e-' + c.id,
        controlId: c.id,
        docType: t,
        fileName: c.id + '.pdf',
        expiresOn: A.DOCUMENT_TYPES[t].expires ? '2029-01-01' : null,
        issuedOn: t === 'PENTEST' ? new Date().toISOString().slice(0, 10) : null,
        processingStatus: 'ACCEPTED',
        facts: { readable: true, entityMatch: true, scopeWords: ['support'] },
        ...extra[c.id],
      })),
  );

test('engine step 11: each control has the 10 fields; directory vendor vs buyer-added vendor (fuller questionnaire)', () => {
  const qn = controlSet();
  assert.equal(qn.libraryCount, A.CONTROL_LIBRARY.length);
  assert.equal(qn.controls.length + qn.notApplicable.length, qn.libraryCount);
  for (const c of qn.controls) {
    for (const k of [
      'id',
      'family',
      'question',
      'answerType',
      'applicability',
      'mandatory',
      'evidence',
      'weight',
    ])
      assert.ok(c[k] !== undefined, `${c.id} has ${k}`);
    assert.ok(c.legalRef && c.ruleVersion === A.RULE_VERSION);
    assert.ok(A.FAMILIES[c.family] && A.ANSWER_TYPES[c.answerType]);
    assert.ok(A.LEVELS[c.level], `${c.id} level`);
  }
  assert.deepEqual(
    qn.notApplicable.map(c => c.id),
    ['CORP-02', 'CORP-03', 'SEC-03'],
    'a verified directory vendor does not get the extra identity questions',
  );
  const mfa = qn.controls.find(c => c.id === 'ACC-01');
  assert.equal(mfa.level, 'BUYER', 'MFA was requested by the buyer');
  assert.equal(mfa.critical, true, 'privileged access');
  assert.equal(qn.controls.find(c => c.id === 'PRV-01').legalRef, 'UK GDPR Art. 28(3)(a)');
  assert.equal(
    qn.controls.find(c => c.id === 'SEC-02').level,
    'BUYER',
    'ISO 27001 is buyer-required, not legal',
  );
  // A buyer-added vendor has no previously verified evidence: fuller questionnaire.
  const fuller = controlSet(EXAMPLE, {
    ...VENDOR,
    source: 'buyer_provided',
    verification_status: 'unverified',
  });
  assert.equal(fuller.controls.length, qn.controls.length + 3);
  // A controller does not get the Article 28 processor questions.
  const controller = controlSet(EXAMPLE, VENDOR, { processingRole: 'controller' });
  assert.ok(controller.notApplicable.some(c => c.id === 'PRV-01'));
  // The evidence checklist (step 12).
  assert.ok(qn.documents.some(d => d.type === 'SUBPROCESSOR_REGISTER' && d.controls.includes('SUB-01')));
  assert.ok(qn.documents.find(d => d.type === 'CERTIFICATION').expires);
});

test('engine step 14: weighted score, NOT APPLICABLE left out, UNKNOWN kept visible, never "compliant"', () => {
  const qn = controlSet();
  let r = A.scoreCompliance(qn, allPositive(qn), evidenceFor(qn));
  assert.equal(r.overall, 100);
  assert.equal(r.counts.pass, qn.controls.length);
  assert.equal(r.counts.notApplicable, 3);
  assert.equal(r.rating.code, 'SATISFACTORY');
  assert.equal(r.rating.label, 'Satisfactory (provisional)');
  assert.equal(r.results.filter(x => x.status === 'NOT_APPLICABLE').length, 3);
  // 12 fields per control result (step 15).
  for (const k of [
    'assessmentId',
    'vendorId',
    'controlId',
    'answer',
    'evidenceIds',
    'evidenceVersions',
    'ruleId',
    'status',
    'provisionalScore',
    'confidence',
    'gapReason',
    'timestamp',
  ])
    assert.ok(k in r.results[0], k);
  assert.equal(r.results[0].confidence, 'Medium', 'automatic checks only: not independently verified');

  // No documents: claims stay PARTIAL, and the missing evidence is listed.
  r = A.scoreCompliance(qn, allPositive(qn), []);
  assert.ok(r.counts.partial > 10 && r.overall < 100);
  assert.ok(r.missingEvidence.some(m => m.controlId === 'SUB-01'));
  assert.equal(r.rating.code, 'CONDITIONAL');

  // An unanswered optional question is UNKNOWN, not NOT APPLICABLE.
  const answers = allPositive(qn);
  delete answers['SVC-01'];
  r = A.scoreCompliance(qn, answers, evidenceFor(qn));
  assert.equal(r.results.find(x => x.controlId === 'SVC-01').status, 'UNKNOWN');
  assert.ok(r.gaps.some(g => g.questionId === 'SVC-01' && g.kind === 'missing'));
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(r)));
});

test('engine step 14: a critical failure is never hidden by a high score; escalate or block by policy', () => {
  const qn = controlSet();
  const answers = { ...allPositive(qn), 'PRV-01': { answer: 'No' } };
  let r = A.scoreCompliance(qn, answers, evidenceFor(qn));
  assert.ok(r.overall >= 90, 'the score is still high');
  assert.equal(r.rating.code, 'ESCALATE');
  assert.equal(r.rating.label, 'Escalation required');
  assert.deepEqual(
    r.criticalGaps.map(g => g.controlId),
    ['PRV-01'],
  );
  assert.ok(r.gaps.find(g => g.questionId === 'PRV-01').critical);
  assert.match(r.nextActions[0], /Escalate/);
  const blocked = { ...qn, context: { ...qn.context, policy: 'block' } };
  r = A.scoreCompliance(blocked, answers, evidenceFor(qn));
  assert.equal(r.rating.code, 'BLOCKED');
});

test('engine step 14: the example checks (contradiction, subprocessors, data location, continuity, insurance, scope, entity)', () => {
  const qn = controlSet();
  const status = (r, id) => r.results.find(x => x.controlId === id).status;
  const kinds = (r, id) => r.gaps.filter(g => g.questionId === id).map(g => g.kind);
  // MFA claimed, but the policy excludes privileged accounts.
  let r = A.scoreCompliance(
    qn,
    allPositive(qn),
    evidenceFor(qn, {
      'ACC-01': { facts: { readable: true, entityMatch: true, mfaExcludesPrivileged: true } },
    }),
  );
  assert.equal(status(r, 'ACC-01'), 'REVIEW_REQUIRED');
  assert.deepEqual(kinds(r, 'ACC-01'), ['contradiction']);
  assert.equal(r.rating.code, 'ESCALATE', 'ACC-01 is critical for privileged access');
  assert.ok(r.nextActions.some(a => /clarification/.test(a) && /ACC-01/.test(a)));
  // "No subprocessors" while cloud services are used.
  r = A.scoreCompliance(qn, { ...allPositive(qn), 'SUB-01': { answer: 'No' } }, evidenceFor(qn));
  assert.deepEqual(kinds(r, 'SUB-01'), ['contradiction']);
  // A subprocessor that is not in the register.
  r = A.scoreCompliance(
    qn,
    allPositive(qn),
    evidenceFor(qn, {
      'SUB-01': { facts: { readable: true, entityMatch: true, words: [A.hashWord('other')] } },
    }),
  );
  assert.deepEqual(kinds(r, 'SUB-01'), ['contradiction']);
  // Staff access from a country that is not in the requirement.
  r = A.scoreCompliance(
    qn,
    { ...allPositive(qn), 'TRF-01': clean(qn, 'TRF-01', { countries: ['PL', 'VN'] }) },
    evidenceFor(qn),
  );
  assert.equal(status(r, 'TRF-01'), 'REVIEW_REQUIRED');
  assert.match(r.gaps.find(g => g.questionId === 'TRF-01').text, /Vietnam/);
  // RTO/RPO above the provisional High target (8 h / 4 h).
  r = A.scoreCompliance(
    qn,
    { ...allPositive(qn), 'BCP-01': clean(qn, 'BCP-01', { rto: 24, rpo: 4 }) },
    evidenceFor(qn),
  );
  assert.equal(status(r, 'BCP-01'), 'FAIL');
  // Insurance expired.
  r = A.scoreCompliance(
    qn,
    { ...allPositive(qn), 'INS-01': clean(qn, 'INS-01', { amount: 1000000, expiresOn: '2020-01-01' }) },
    evidenceFor(qn),
  );
  assert.equal(status(r, 'INS-01'), 'FAIL');
  assert.deepEqual(kinds(r, 'INS-01'), ['expired']);
  // Certificate that does not mention the service; expired certificate.
  r = A.scoreCompliance(
    qn,
    allPositive(qn),
    evidenceFor(qn, { 'SEC-02': { facts: { readable: true, entityMatch: true, scopeWords: [] } } }),
  );
  assert.deepEqual(kinds(r, 'SEC-02'), ['scope']);
  r = A.scoreCompliance(qn, allPositive(qn), evidenceFor(qn, { 'SEC-02': { expiresOn: '2020-01-01' } }));
  assert.equal(status(r, 'SEC-02'), 'FAIL');
  // Registration number that differs from the vendor profile; a document that does not name the vendor.
  r = A.scoreCompliance(
    qn,
    { ...allPositive(qn), 'CORP-01': { answer: 'Yes', registrationNumber: 'KRS 999' } },
    evidenceFor(qn),
  );
  assert.deepEqual(kinds(r, 'CORP-01'), ['mismatch']);
  r = A.scoreCompliance(qn, allPositive(qn), evidenceFor(qn, { 'PER-01': { processingStatus: 'MISMATCH' } }));
  assert.equal(status(r, 'PER-01'), 'REVIEW_REQUIRED');
  // Only a human review makes evidence "verified" (High confidence).
  r = A.scoreCompliance(
    qn,
    allPositive(qn),
    evidenceFor(qn, { 'PER-01': { processingStatus: 'MISMATCH', reviewStatus: 'VERIFIED' } }),
  );
  assert.equal(status(r, 'PER-01'), 'PASS');
  assert.equal(r.results.find(x => x.controlId === 'PER-01').confidence, 'High');
});

test('engine step 13: answer types are checked; completeness counts mandatory questions', () => {
  const qn = controlSet();
  const c = id => qn.controls.find(x => x.id === id);
  assert.ok(A.cleanAnswer(c('ACC-01'), { answer: 'Maybe' }).error);
  assert.ok(A.cleanAnswer(c('TRF-01'), { countries: ['Poland'] }).error);
  assert.ok(A.cleanAnswer(c('BCP-01'), { rto: -1 }).error);
  assert.equal(A.cleanAnswer(c('ACC-01'), {}).value, null, 'empty answer is removed');
  const reg = A.cleanAnswer(c('CORP-01'), { answer: 'Yes' }).value;
  assert.equal(A.isAnswered(c('CORP-01'), reg), false, '"Yes" needs the registration number');
  assert.equal(A.cleanAnswer(c('BCP-01'), { rto: 4, rpo: 1 }).value.answer, 'Provided');
  const done = A.completeness(qn, { 'ACC-01': { answer: 'Yes' } });
  assert.equal(done.answered, 1);
  assert.equal(done.missing.length, qn.controls.length - 1);
});

test('step 13 checks: malware scan, file type, readable text, entity name, MFA exclusion', async () => {
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  assert.match(scanFile(Buffer.from(eicar), 'txt'), /virus/);
  assert.match(scanFile(Buffer.from('MZ\x90\x00binary'), 'pdf'), /program/);
  assert.match(scanFile(Buffer.from('hello'), 'pdf'), /not a real \.pdf/);
  assert.equal(scanFile(Buffer.from('%PDF-1.4'), 'pdf'), null);
  const ctx = { vendorName: 'Krakow IT', registrationNumber: 'KRS 1', serviceKeywords: ['support'] };
  let f = await analyseDocument(doc('Access Control Policy'), 'txt', 'ACCESS_POLICY', ctx);
  assert.equal(f.readable, true);
  assert.equal(f.entityMatch, true);
  assert.equal(f.mfaExcludesPrivileged, false);
  f = await analyseDocument(
    doc(
      'Access Control Policy',
      'MFA is required for all users. Privileged administrator accounts are exempt from MFA.',
    ),
    'txt',
    'ACCESS_POLICY',
    ctx,
  );
  assert.equal(f.mfaExcludesPrivileged, true);
  f = await analyseDocument(doc('Policy', '', 'Another Company'), 'txt', 'HR_POLICY', ctx);
  assert.equal(f.entityMatch, false);
  f = await analyseDocument(Buffer.from('%PDF-1.4 short'), 'pdf', 'HR_POLICY', ctx);
  assert.equal(f.readable, false);
  f = await analyseDocument(
    doc('Data flow', 'Data is hosted in the United States and accessed from Poland and India.'),
    'txt',
    'DATA_FLOW',
    ctx,
  );
  assert.deepEqual(f.countries.sort(), ['IN', 'PL', 'US']);
});

/* ---------------- API ---------------- */
test('step 10: blocked before a vendor is selected; the 8 start fields are checked; output IN PROGRESS + invitation readiness', async () => {
  let r = await buyer('GET', `/assessments/${ref}/compliance`);
  assert.equal(r.body.blocked, 'Select a vendor first (Stage 2).');
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  assert.equal(
    (
      await buyer(
        'POST',
        `/assessments/${ref}/selection`,
        await choice({ vendorId, rationale: 'Best match on service and all delivery countries.' }),
      )
    ).status,
    201,
  );
  r = await buyer('GET', `/assessments/${ref}/compliance`);
  const st = r.body;
  assert.equal(st.start.identity.ok, true);
  assert.equal(st.start.invitation.ready, true);
  assert.equal(st.start.invitation.channel, 'VENDOR_USERS');
  assert.equal(st.start.defaults.processingRole, 'processor');
  assert.deepEqual(st.start.defaults.jurisdictions, ['GB', 'US', 'PL', 'IN', 'BR', 'PH']);
  start = {
    assessmentId: st.assessment.id,
    vendorId: st.vendor.id,
    ...st.start.defaults,
    reviewerId: st.start.reviewers[0].id,
    targetCompletionOn: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  };
  r = await buyer('POST', `/assessments/${ref}/compliance`, { ...start, reviewerId: undefined });
  assert.equal(r.status, 400);
  assert.equal(r.body.field, 'reviewerId');
  r = await buyer('POST', `/assessments/${ref}/compliance`, { ...start, assessmentType: 'annual' });
  assert.equal(r.body.field, 'assessmentType');
  r = await buyer('POST', `/assessments/${ref}/compliance`, { ...start, vendorId: st.assessment.id });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'invalid_vendor', 'invalid vendor reference blocks initiation');
  r = await buyer('POST', `/assessments/${ref}/compliance`, { ...start, reviewerId: vendorId });
  assert.equal(r.status, 400, 'the reviewer must be a buyer member');

  r = await buyer('POST', `/assessments/${ref}/compliance`, start);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.session.status, 'IN_PROGRESS');
  assert.equal(r.body.session.invitation.ready, true);
  const c = r.body.compliance;
  assert.equal(c.status, 'in_progress');
  assert.equal(c.assessmentType, 'initial');
  assert.equal(c.reviewer.name, 'Sarah Williams');
  assert.equal(c.questionnaire.controls.length, 30);
  assert.ok(!c.questionnaire.context, 'the engine context is not sent to the browser');
  // Step 12: the request with deadline, documents and a delivery record.
  const q = r.body.request;
  assert.equal(q.kind, 'initial');
  assert.equal(q.controlIds.length, 30);
  assert.ok(q.requestedDocuments.length >= 10);
  assert.equal(q.access, 'open');
  assert.equal(q.deliveries[0].status, 'SENT');
  assert.ok(lastInvite(), 'the invitation email has a secure link');
  assert.equal((await buyer('POST', `/assessments/${ref}/compliance`, start)).status, 409, 'only once');
  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  for (const s of [10, 11, 12])
    assert.ok(
      tl.some(t => t.stage === 3 && t.step === s),
      'timeline step ' + s,
    );
  assert.ok(tl.some(t => t.step === 11 && /30 of 33 controls apply, 3 not applicable/.test(t.title)));
  const second = (await pool.query(`SELECT id FROM organisations WHERE name = 'Pune Help'`)).rows[0].id;
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId: second });
  assert.equal(
    (
      await buyer(
        'POST',
        `/assessments/${ref}/selection`,
        await choice({ vendorId: second, rationale: 'Trying to change after start.', changeReason: 'test' }),
      )
    ).body.error,
    'compliance_started',
    'vendor locked once started',
  );
});

test('step 12: only the selected vendor has access; the invitation link; revoke and reissue', async () => {
  assert.equal((await other('GET', `/vendor/compliance/${ref}`)).status, 404, 'other vendor');
  assert.equal(
    (await buyer('GET', `/vendor/compliance/${ref}`)).status,
    403,
    'buyer cannot use the vendor API',
  );
  const token = lastInvite();
  assert.equal(
    (await other('GET', `/vendor/compliance/invite/${token}`)).status,
    404,
    'link is for one company',
  );
  assert.equal((await vendor('GET', `/vendor/compliance/invite/${token}`)).body.reference, ref);
  const d = (await vendor('GET', `/vendor/compliance/${ref}`)).body;
  assert.equal(d.mode, 'answering');
  assert.equal(d.buyerName, 'UK Company Ltd');
  assert.equal(d.compliance.progress.percent, 0);
  assert.ok(d.request.dueOn && d.request.instructions.length >= 3);
  assert.ok(d.compliance.questionnaire.controls.every(c => c.familyLabel));
  // Withdraw access: the vendor cannot open it; issue it again: a new link works, the old one does not.
  assert.equal((await buyer('POST', `/assessments/${ref}/compliance/request/revoke`)).status, 200);
  assert.equal((await vendor('GET', `/vendor/compliance/${ref}`)).status, 403);
  assert.equal((await vendor('GET', '/vendor/compliance')).body.questionnaires[0].access, 'revoked');
  const r = await buyer('POST', `/assessments/${ref}/compliance/request/reissue`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.request.kind, 'reissue');
  assert.equal((await vendor('GET', `/vendor/compliance/invite/${token}`)).status, 403, 'old link withdrawn');
  assert.equal((await vendor('GET', `/vendor/compliance/invite/${lastInvite()}`)).status, 200);
  assert.equal((await vendor('GET', `/vendor/compliance/${ref}`)).status, 200);
});

test('step 13: answers and evidence with the automatic checks', async () => {
  let r = await vendor('PUT', `/vendor/compliance/${ref}/answers`, {
    answers: { 'ACC-01': { answer: 'Maybe' } },
  });
  assert.equal(r.status, 400);
  r = await vendor('PUT', `/vendor/compliance/${ref}/answers`, {
    answers: {
      'CORP-01': { answer: 'Yes', registrationNumber: 'KRS 1', explanation: 'Registered in Kraków.' },
      'TRF-01': { countries: ['PL', 'IN', 'BR', 'PH'] },
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.compliance.progress.answered, 2);
  assert.equal(r.body.compliance.answers['CORP-01'].explanation, 'Registered in Kraków.');
  // Malware scan: the EICAR test file is blocked and not saved.
  r = await up(
    vendor,
    { control: 'SEC-01', type: 'INFOSEC_POLICY', name: 'policy.txt' },
    Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'file_blocked');
  // Type, expiry and control rules.
  r = await up(vendor, { control: 'SEC-02', type: 'CERTIFICATION', name: 'iso.txt' }, doc('ISO 27001'));
  assert.match(r.body.message, /expiry/);
  r = await up(vendor, { control: 'SEC-02', type: 'HR_POLICY', name: 'x.txt' }, doc('x'));
  assert.equal(r.status, 400, 'the document type must fit the question');
  r = await up(vendor, { control: 'XYZ-01', type: 'OTHER', name: 'x.txt' }, doc('x'));
  assert.equal(r.status, 400);
  // A readable certificate naming the vendor and the service.
  const iso = () => doc('ISO 27001 certificate', 'Scope: IT support and service desk.');
  r = await up(
    vendor,
    {
      control: 'SEC-02',
      type: 'CERTIFICATION',
      name: 'iso27001.txt',
      issuer: 'BSI',
      issued: '2025-03-01',
      expires: '2028-03-31',
    },
    iso(),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const cert = r.body.evidence;
  assert.equal(cert.processingStatus, 'ACCEPTED');
  assert.equal(cert.issuer, 'BSI');
  assert.equal(cert.expiresOn, '2028-03-31');
  assert.ok(cert.checks.some(c => c.check === 'Entity name' && c.outcome === 'Match'));
  // The same file again for the same question is refused; for another question it is flagged.
  r = await up(
    vendor,
    { control: 'SEC-02', type: 'CERTIFICATION', name: 'again.txt', expires: '2028-03-31' },
    iso(),
  );
  assert.equal(r.status, 409);
  r = await up(
    vendor,
    { control: 'SEC-01', type: 'CERTIFICATION', name: 'iso-copy.txt', expires: '2028-03-31' },
    iso(),
  );
  assert.equal(r.status, 201);
  assert.equal(r.body.evidence.duplicateOf, cert.id);
  // A document that does not name the vendor; an unreadable PDF; both are kept.
  r = await up(
    vendor,
    { control: 'PER-01', type: 'HR_POLICY', name: 'hr.txt' },
    doc('HR policy', '', 'Some Other Firm'),
  );
  assert.equal(r.body.evidence.processingStatus, 'MISMATCH');
  r = await up(
    vendor,
    { control: 'INC-01', type: 'INCIDENT_PLAN', name: 'irp.pdf' },
    Buffer.from('%PDF-1.4 scan'),
    'application/pdf',
  );
  assert.equal(r.body.evidence.processingStatus, 'UNREADABLE');
  // The access policy excludes privileged accounts from MFA (the specification's example).
  r = await up(
    vendor,
    { control: 'ACC-01', type: 'ACCESS_POLICY', name: 'access.txt' },
    doc(
      'Access Control and MFA Policy',
      'MFA applies to all staff. Privileged administrator accounts are exempt from MFA.',
    ),
  );
  assert.equal(r.body.evidence.facts.mfaExcludesPrivileged, true);
  // A draft document can be removed before submission.
  const tmp = await up(vendor, { control: 'SEC-01', type: 'OTHER', name: 'draft.txt' }, doc('Draft'));
  assert.equal(
    (await vendor('DELETE', `/vendor/compliance/${ref}/evidence/${tmp.body.evidence.id}`)).status,
    200,
  );
  const dl = await vendor('GET', `/vendor/compliance/${ref}/evidence/${cert.id}`);
  assert.ok(dl.body.toString().startsWith('ISO 27001 certificate'));
  const st = await buyer('GET', `/assessments/${ref}/compliance`);
  assert.equal(st.body.compliance.progress.answered, 2);
  assert.ok(!st.body.compliance.answers, 'buyer sees progress only before submission');
});

test('steps 13–16: submit → receipt, provisional score with statuses, snapshot v1.0, results for the buyer', async () => {
  let r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 422);
  assert.ok(r.body.missing.length > 20);
  const d = (await vendor('GET', `/vendor/compliance/${ref}`)).body;
  const answers = {};
  for (const c of d.compliance.questionnaire.controls) answers[c.id] = positiveAnswer(c);
  answers['TRF-03'] = { answer: 'Unknown' };
  answers['SVC-01'] = {};
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 422, 'every mandatory question must be answered');
  assert.deepEqual(r.body.missing, ['SVC-01']);
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers: { 'SVC-01': { answer: 'Partial' } } });
  r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const receipt = r.body.receipt;
  assert.equal(receipt.completeness, 100);
  assert.equal(receipt.snapshotVersion, '1.0');
  assert.ok(receipt.evidence.some(e => e.status === 'UNREADABLE'));
  assert.equal(r.body.rating.code, 'ESCALATE', 'TRF-03 Unknown and the MFA contradiction are critical');

  assert.equal(
    (await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers: { 'ACC-01': { answer: 'No' } } }))
      .status,
    409,
    'locked after submit',
  );
  const certId = d.compliance.evidence.find(e => e.fileName === 'iso27001.txt').id;
  assert.equal((await vendor('DELETE', `/vendor/compliance/${ref}/evidence/${certId}`)).status, 409);

  const st = (await buyer('GET', `/assessments/${ref}/compliance`)).body;
  const res = st.result;
  assert.equal(st.compliance.status, 'submitted');
  assert.equal(res.snapshotVersion, '1.0');
  assert.equal(res.snapshotName, 'ComplianceAssessmentSnapshot');
  assert.match(res.snapshotSha256, /^[0-9a-f]{64}$/);
  // The 10 dashboard fields (step 16).
  assert.equal(st.vendor.name, 'Krakow IT');
  assert.equal(res.counts.applicable, 30);
  assert.ok(res.counts.pass > 0 && res.counts.partial > 0);
  assert.equal(res.counts.informationRequired, res.counts.unknown + res.counts.review);
  assert.ok(res.overall > 0 && res.overall < 100);
  assert.deepEqual(
    res.criticalGaps.map(g => g.controlId).sort(),
    ['ACC-01', 'INC-01', 'PER-01', 'TRF-03'],
    'critical controls that are UNKNOWN or need review stay open',
  );
  assert.ok(res.nextActions.length >= 3);
  const row = id => res.results.find(x => x.controlId === id);
  assert.equal(row('ACC-01').status, 'REVIEW_REQUIRED');
  assert.equal(row('TRF-03').status, 'UNKNOWN');
  assert.equal(row('INC-01').status, 'REVIEW_REQUIRED', 'unreadable evidence needs review');
  assert.equal(row('PER-01').status, 'REVIEW_REQUIRED', 'entity mismatch');
  assert.equal(row('SEC-02').status, 'PASS');
  assert.deepEqual(row('SEC-02').evidenceIds, [certId], 'response → evidence → control link');
  assert.equal(row('CORP-02').status, 'NOT_APPLICABLE');
  assert.ok(res.gaps.every(g => /^GAP-\d{3}$/.test(g.id)));
  assert.ok(res.missingEvidence.some(m => m.controlId === 'SUB-01'));
  assert.match(res.note, /not a final legal approval/);
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(res)));
  assert.equal(res.areas.find(a => a.id === 'TRANSFER').label, 'International transfer');
  assert.ok(
    res.controls.find(c => c.id === 'ASS-005'),
    'Stage 1 control scores for the later stages',
  );
  assert.ok(st.compliance.answers['CORP-01'], 'buyer sees the answers after submission');
  assert.ok((await buyer('GET', `/assessments/${ref}/compliance/evidence/${certId}`)).body.length > 100);
  await assert.rejects(
    pool.query(`UPDATE compliance_results SET overall_score = 100 WHERE id = $1`, [res.id]),
    /append-only/,
  );
  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  for (const s of [13, 14, 15, 16])
    assert.ok(
      tl.some(t => t.stage === 3 && t.step === s),
      'step ' + s,
    );
  assert.ok(tl.some(t => t.step === 15 && /ComplianceAssessmentSnapshot v1\.0/.test(t.title)));
  assert.equal(tl.find(t => t.status === 'next').stage, 4);
  const ad = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(ad.body.compliance.result.overall, res.overall);
});

test('reviewer: human review (v1.1) and clarification → vendor resubmits → new version (v2.0); earlier versions kept', async () => {
  const st = (await buyer('GET', `/assessments/${ref}/compliance`)).body;
  assert.equal(st.canReview, true);
  const hr = st.compliance.evidence.find(e => e.fileName === 'hr.txt');
  let r = await buyer('PUT', `/assessments/${ref}/compliance/evidence/${hr.id}/review`, {
    decision: 'REJECTED',
  });
  assert.equal(r.status, 400, 'a reason is needed');
  r = await buyer('PUT', `/assessments/${ref}/compliance/evidence/${hr.id}/review`, {
    decision: 'VERIFIED',
    note: 'Group HR policy; the vendor is a subsidiary.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.result.snapshotVersion, '1.1');
  const per = r.body.result.results.find(x => x.controlId === 'PER-01');
  assert.equal(per.status, 'PASS');
  assert.equal(per.confidence, 'High');

  // Ask for clarification on the MFA contradiction.
  r = await buyer('POST', `/assessments/${ref}/compliance/clarification`, {
    controlIds: ['ACC-01'],
    message: 'Your policy exempts privileged accounts from MFA. Please confirm and send the current policy.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.compliance.status, 'clarification');
  assert.equal(r.body.request.kind, 'clarification');
  let d = (await vendor('GET', `/vendor/compliance/${ref}`)).body;
  assert.equal(d.mode, 'clarification');
  assert.deepEqual(d.editable, ['ACC-01']);
  assert.equal(
    (await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers: { 'CORP-01': { answer: 'No' } } }))
      .status,
    409,
    'only the controls under clarification',
  );
  r = await up(
    vendor,
    { control: 'ACC-01', type: 'ACCESS_POLICY', name: 'access-v2.txt' },
    doc(
      'Access Control and MFA Policy v2',
      'MFA is mandatory for every account, including privileged administrator accounts.',
    ),
  );
  assert.equal(r.status, 201);
  assert.equal(r.body.evidence.version, 2, 'a new evidence version; the old one is kept');
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, {
    answers: { 'ACC-01': { answer: 'Yes', explanation: 'Policy updated in version 2.' } },
  });
  r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.receipt.snapshotVersion, '2.0');
  const after = (await buyer('GET', `/assessments/${ref}/compliance`)).body;
  assert.equal(after.compliance.status, 'submitted');
  assert.deepEqual(
    after.versions.map(v => v.snapshotVersion),
    ['1.0', '1.1', '2.0'],
  );
  assert.equal(
    after.result.results.find(x => x.controlId === 'ACC-01').status,
    'REVIEW_REQUIRED',
    'the earlier policy still shows the exclusion, so the reviewer checks it',
  );
  const v1 = (await buyer('GET', `/assessments/${ref}/compliance/results/1`)).body.result;
  assert.equal(v1.snapshotVersion, '1.0');
  assert.equal(v1.answers['ACC-01'].answer, 'Yes');
  assert.ok(
    after.compliance.evidence.some(e => e.fileName === 'access.txt'),
    'old evidence kept',
  );
  // The old policy is marked not acceptable: the contradiction is resolved.
  const old = after.compliance.evidence.find(e => e.fileName === 'access.txt');
  r = await buyer('PUT', `/assessments/${ref}/compliance/evidence/${old.id}/review`, {
    decision: 'REJECTED',
    note: 'Replaced by version 2.',
  });
  assert.equal(r.body.result.snapshotVersion, '2.1');
  assert.equal(r.body.result.results.find(x => x.controlId === 'ACC-01').status, 'PASS');
  assert.ok(
    (
      await pool.query(
        `SELECT 1 FROM audit_events WHERE event = 'compliance.clarification_requested' AND ref = $1`,
        [ref],
      )
    ).rows.length,
  );
  d = (await vendor('GET', `/vendor/compliance/${ref}`)).body;
  assert.equal(d.mode, 'submitted');
});
