/* Stage 3 · Compliance assessment API tests (steps 10–16). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s3-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { scoreAssessment, buildQuestionnaire, CONTROL_QUESTIONS } = await import('../src/engine/questionnaire.js');
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
const pdf = Buffer.from('%PDF-1.4 evidence');
const up = (c, q) => c('POST', `/vendor/compliance/${ref}/evidence?${new URLSearchParams(q)}`, null, { type: 'application/pdf', data: pdf });

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
  other = await signUp('raj@pune.example', 'vendor');
  await other('PUT', '/me/profile', { fullName: 'Raj', jobRole: 'Delivery Manager', organisationName: 'Pune Help', registrationNumber: 'P1', country: 'IN', services: ['IT Support'], deliveryCountries: ['IN'] });
});
after(async () => { server.close(); await pool.end(); });

test('engine: questionnaire from controls; Yes without evidence = 50; expired certificate is a gap; bands never say compliant', () => {
  const q = buildQuestionnaire([{ id: 'ASS-002', name: 'Information Security Governance' }, { id: 'ASS-010', name: 'Personnel Security' }]);
  assert.equal(q.length, 2); assert.equal(q[0].area, 'security'); assert.equal(q[0].questions.length, CONTROL_QUESTIONS['ASS-002'].length);
  const all = a => Object.fromEntries(q.flatMap(c => c.questions.map(x => [x.id, { answer: a }])));
  let r = scoreAssessment(q, all('Yes'), []);
  assert.equal(r.controls.find(c => c.id === 'ASS-010').score, 100, 'no evidence needed');
  assert.ok(r.controls.find(c => c.id === 'ASS-002').score < 100, 'evidence missing lowers the score');
  const ev = [{ controlId: 'ASS-002', type: 'certificate', fileName: 'iso.pdf', expiresOn: '2020-01-01' }, { controlId: 'ASS-002', type: 'policy', fileName: 'sec.pdf' }];
  r = scoreAssessment(q, all('Yes'), ev);
  assert.ok(r.gaps.some(g => g.kind === 'expired'));
  r = scoreAssessment(q, all('No'), []);
  assert.equal(r.overall, 0); assert.equal(r.rating.code, 'INSUFFICIENT');
  assert.ok(!/compliant/i.test(JSON.stringify(r).replace(/not a compliance/gi, '')));
});

test('step 10: cannot start before a vendor is selected; then starts with the applicable controls (steps 11–12)', async () => {
  let r = await buyer('POST', `/assessments/${ref}/compliance`);
  assert.equal(r.status, 409); assert.equal(r.body.error, 'not_ready');
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  assert.equal((await buyer('POST', `/assessments/${ref}/selection`, { vendorId, rationale: 'Best match on service and all delivery countries.' })).status, 201);
  r = await buyer('POST', `/assessments/${ref}/compliance`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.compliance.status, 'requested');
  assert.equal(r.body.compliance.questionnaire.length, 15, 'worked example: all 15 controls apply');
  assert.ok(r.body.compliance.progress.total > 30);
  assert.equal((await buyer('POST', `/assessments/${ref}/compliance`)).status, 409, 'only once');
  const a = await buyer('GET', `/assessments/${ref}`);
  for (const s of [10, 11, 12]) assert.ok(a.body.timeline.some(t => t.stage === 3 && t.step === s), 'timeline step ' + s);
  assert.equal((await buyer('POST', `/assessments/${ref}/selection`, { vendorId, rationale: 'Trying to change after start.', changeReason: 'test' })).body.error, 'compliance_started', 'vendor locked once started');
});

test('step 13: only the selected vendor sees it; answers saved as draft; evidence rules', async () => {
  assert.equal((await other('GET', `/vendor/compliance/${ref}`)).status, 404, 'other vendor');
  assert.equal((await buyer('GET', `/vendor/compliance/${ref}`)).status, 403, 'buyer cannot use the vendor API');
  const list = await vendor('GET', '/vendor/compliance');
  assert.equal(list.body.questionnaires[0].reference, ref); assert.equal(list.body.questionnaires[0].status, 'requested');
  const d = await vendor('GET', `/vendor/compliance/${ref}`);
  assert.equal(d.body.buyerName, 'UK Company Ltd');
  assert.equal((await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers: { '002-1': { answer: 'Maybe' } } })).status, 400);
  let r = await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers: { '002-1': { answer: 'Yes', comment: 'ISO 27001 since 2021' }, '001-1': { answer: 'Yes' } } });
  assert.equal(r.status, 200); assert.equal(r.body.compliance.status, 'in_progress'); assert.equal(r.body.compliance.progress.answered, 2);
  r = await up(vendor, { control: 'ASS-002', type: 'certificate', name: 'iso27001.pdf' });
  assert.equal(r.status, 400); assert.match(r.body.message, /expiry/);
  r = await up(vendor, { control: 'ASS-099', type: 'policy', name: 'x.pdf' }); assert.equal(r.status, 400);
  r = await up(vendor, { control: 'ASS-002', type: 'certificate', name: 'iso27001.pdf', expires: '2028-03-31' });
  assert.equal(r.status, 201); assert.equal(r.body.evidence.expiresOn, '2028-03-31');
  const dl = await vendor('GET', `/vendor/compliance/${ref}/evidence/${r.body.evidence.id}`); assert.ok(dl.body.equals(pdf));
  const tmp = await up(vendor, { control: 'ASS-001', type: 'other', name: 'wrong.pdf' });
  assert.equal((await vendor('DELETE', `/vendor/compliance/${ref}/evidence/${tmp.body.evidence.id}`)).status, 200);
  const st = await buyer('GET', `/assessments/${ref}/compliance`);
  assert.equal(st.body.compliance.progress.answered, 2); assert.ok(!st.body.compliance.answers, 'buyer sees progress only before submission');
});

test('steps 14–16: submit needs every answer; score + gaps saved (immutable); buyer sees results; timeline Stage 4 next', async () => {
  let r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 422); assert.ok(r.body.missing.length > 20);
  const d = (await vendor('GET', `/vendor/compliance/${ref}`)).body.compliance;
  const answers = {};
  for (const c of d.questionnaire) for (const q of c.questions) answers[q.id] = { answer: c.id === 'ASS-005' ? 'No' : c.id === 'ASS-009' ? 'Partly' : 'Yes' };
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  await up(vendor, { control: 'ASS-002', type: 'policy', name: 'security-policy.pdf' });
  r = await vendor('POST', `/vendor/compliance/${ref}/submit`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.overall > 0 && r.body.overall < 100); assert.ok(r.body.gaps > 0);
  assert.equal((await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers: { '002-1': { answer: 'No' } } })).status, 409, 'locked after submit');
  assert.equal((await up(vendor, { control: 'ASS-002', type: 'policy', name: 'late.pdf' })).status, 409);
  const st = await buyer('GET', `/assessments/${ref}/compliance`);
  const res = st.body.result;
  assert.equal(st.body.compliance.status, 'submitted');
  assert.equal(res.version, 1); assert.match(res.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(res.areas.find(x => x.id === 'transfer').score, 0, 'ASS-005 answered No');
  assert.equal(res.controls.find(x => x.id === 'ASS-002').score, 100, 'Yes + certificate + policy');
  assert.ok(res.gaps.some(g => g.controlId === 'ASS-005' && g.kind === 'answer'));
  assert.ok(res.gaps.some(g => g.kind === 'evidence'), 'Yes without evidence elsewhere');
  assert.ok(res.observations.some(o => /Data transfer/.test(o.text)));
  assert.ok(st.body.compliance.answers['002-1'], 'buyer sees the answers after submission');
  const evId = st.body.compliance.evidence[0].id;
  assert.ok((await buyer('GET', `/assessments/${ref}/compliance/evidence/${evId}`)).body.equals(pdf));
  await assert.rejects(pool.query(`UPDATE compliance_results SET overall_score = 100 WHERE id = $1`, [res.id]), /append-only/);
  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  for (const s of [13, 14, 15, 16]) assert.ok(tl.some(t => t.stage === 3 && t.step === s), 'step ' + s);
  assert.equal(tl.find(t => t.status === 'next').stage, 4);
  const sel = await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId: (await pool.query(`SELECT id FROM organisations WHERE name = 'Pune Help'`)).rows[0].id });
  assert.ok([200, 404].includes(sel.status));
  const ad = await admin('GET', `/admin/assessments/${ref}`);
  assert.equal(ad.body.compliance.result.overall, res.overall);
  assert.ok((await pool.query(`SELECT 1 FROM audit_events WHERE event = 'compliance.submitted' AND ref = $1`, [ref])).rows.length);
});
