/* Stage 7 · Risk identification API tests (steps 29–32). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s7-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { collectFindings, scoreRisks, buildRiskRegister, ratingFor } = await import('../src/engine/risks.js');
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

/* Stages 2–5: select the vendor, the vendor answers (two "No"s), the contract is analysed and the obligations extracted. */
async function runStagesTwoToFive() {
  await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId });
  await buyer('POST', `/assessments/${ref}/selection`, { vendorId, rationale: 'Best match on service and all delivery countries.',
    selectionSource: 'DIRECTORY', decision: 'SELECT_WITH_CONDITIONS', approverId: (await buyer('GET', '/me')).body.user.id, confirmedAt: new Date().toISOString() });
  await buyer('POST', `/assessments/${ref}/compliance`);
  const questionnaire = (await vendor('GET', `/vendor/compliance/${ref}`)).body.compliance.questionnaire;
  const answers = {};
  for (const control of questionnaire) for (const question of control.questions) answers[question.id] = { answer: 'Yes' };
  answers['006-1'] = { answer: 'No' };      // no up-to-date sub-processor list
  answers['008-2'] = { answer: 'No' };      // continuity plan not tested
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  assert.equal((await vendor('POST', `/vendor/compliance/${ref}/submit`)).status, 201);
  const up = await buyer('POST', `/assessments/${ref}/contract?name=contract.pdf`, null, { type: 'application/pdf', data: fixture('contract.pdf') });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal((await buyer('POST', `/assessments/${ref}/obligations`)).status, 201);
}

/* ---------------- Engine ---------------- */
test('engine step 29: findings from every stage are tagged with a theme, stage and source', () => {
  const findings = collectFindings({
    requirement: { ...EXAMPLE, storageCountries: ['UNKNOWN'] },
    selection: { status: 'CONDITIONALLY_SELECTED', fit: { exceptions: [], missing: [{ id: 'subprocessors', check: 'Subprocessor use', detail: 'Not disclosed.' }] } },
    compliance: { result: { gaps: [{ controlId: 'ASS-006', questionId: '006-1', kind: 'answer', text: 'No sub-processor list.' }], controls: [] } },
    contract: { notFound: [{ topicId: 'subprocessors', name: 'Subcontractors and sub-processors', text: 'No clause about sub-processors.' }] },
    obligations: { gaps: [{ ruleId: 'R-SUB-01', text: 'No obligation found for sub-processors.', source: 'UK GDPR Art. 28(2)' }] },
    transfers: { routes: [{ id: 'RT-05', status: 'INFORMATION_NEEDED', uses: ['Sub-processors'], fromName: 'United Kingdom', toName: 'Not confirmed', statusLabel: 'Information needed' }] },
  });
  const subs = findings.filter(f => f.theme === 'subprocessors');
  assert.deepEqual([...new Set(subs.map(f => f.stage))].sort(), [2, 3, 4, 5, 6], 'five stages point at sub-processors');
  assert.ok(findings.some(f => f.stage === 1 && f.theme === 'transfers'), 'an unknown storage location is a transfer finding');
});

test('engine step 30: one risk per theme, scored likelihood × impact with the reason written out', () => {
  const findings = [
    { theme: 'subprocessors', stage: 3, source: 'Compliance assessment', severity: 'fail', owner: 'Vendor', text: 'a' },
    { theme: 'subprocessors', stage: 4, source: 'Contract analysis', severity: 'fail', owner: 'Buyer', text: 'b' },
    { theme: 'transfers', stage: 6, source: 'Transfer assessment', severity: 'blocker', owner: 'Buyer', text: 'c' },
    { theme: 'security', stage: 3, source: 'Compliance assessment', severity: 'gap', owner: 'Vendor', text: 'd' },
  ];
  const risks = scoreRisks(findings, { serviceCriticality: 'High' }, [{ id: 'ASS-002', score: 100 }, { id: 'ASS-003', score: 90 }, { id: 'ASS-009', score: 80 }]);
  assert.equal(risks.length, 3);
  const transfers = risks.find(r => r.theme === 'transfers');
  assert.equal(transfers.score, 20); assert.equal(transfers.rating, 'CRITICAL'); assert.equal(transfers.id, 'RSK-01', 'highest first');
  const subs = risks.find(r => r.theme === 'subprocessors');
  assert.equal(subs.likelihood, 5, '+1 because two stages agree'); assert.equal(subs.impact, 3); assert.equal(subs.actionBy, 'Both');
  const security = risks.find(r => r.theme === 'security');
  assert.equal(security.evidence, 'Evidence held'); assert.equal(security.likelihood, 2, '−1 for good evidence');
  assert.match(security.rationale, /Score 2 × 4 = 8/);
  assert.equal(ratingFor(4).code, 'LOW'); assert.equal(ratingFor(9).code, 'MEDIUM'); assert.equal(ratingFor(19).code, 'HIGH'); assert.equal(ratingFor(20).code, 'CRITICAL');
  const sensitive = scoreRisks([{ theme: 'data_protection', stage: 4, source: 'x', severity: 'fail', owner: 'Buyer', text: 'e' }], { specialCategory: 'Yes', serviceCriticality: 'Critical' });
  assert.equal(sensitive[0].impact, 5, 'impact capped at 5');
  const empty = buildRiskRegister({ requirement: {} });
  assert.equal(empty.totals.risks, 0); assert.equal(empty.overall.rating, 'NONE');
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(risks)));
});

/* ---------------- API ---------------- */
test('step 29: blocked until the transfer assessment is saved (Stage 6)', async () => {
  let r = await buyer('POST', `/assessments/${ref}/risks`);
  assert.equal(r.status, 409); assert.match(r.body.message, /transfer assessment first/);
  await runStagesTwoToFive();
  r = await buyer('GET', `/assessments/${ref}/risks`);
  assert.equal(r.body.canRun, false); assert.ok(r.body.blocked);
});

test('steps 29–32: register saved with linked sources, on the timeline; Stage 8 next; not repeated without changes', async () => {
  assert.equal((await buyer('POST', `/assessments/${ref}/transfers`)).status, 201);
  const r = await buyer('POST', `/assessments/${ref}/risks`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const g = r.body.register;
  assert.equal(g.version, 1);
  assert.ok(g.totals.risks >= 3);
  assert.deepEqual(Object.keys(g.inputs).sort(), ['compliance', 'contract', 'obligations', 'requirement', 'selection', 'transfers']);
  const subs = g.risks.find(x => x.theme === 'subprocessors');
  assert.ok(subs, 'the "No" on the sub-processor list becomes a risk');
  assert.ok(subs.findings.some(f => f.stage === 3 && f.ref === '006-1'), 'linked to its source question');
  assert.ok(g.risks.some(x => x.theme === 'transfers' && x.findings.some(f => f.stage === 6)), 'transfer routes are linked');
  assert.ok(g.risks.every(x => x.rationale && x.score === x.likelihood * x.impact));
  assert.deepEqual(g.risks.map(x => x.score), [...g.risks.map(x => x.score)].sort((a, b) => b - a), 'highest score first');
  assert.equal(g.grid.flat().reduce((s, n) => s + n, 0), g.totals.risks);
  assert.match(g.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.body.canRun, false);
  assert.equal((await buyer('POST', `/assessments/${ref}/risks`)).body.error, 'up_to_date');

  const a = await buyer('GET', `/assessments/${ref}`);
  for (const step of [29, 30, 31, 32]) assert.ok(a.body.timeline.some(t => t.stage === 7 && t.step === step), 'timeline step ' + step);
  assert.ok(a.body.timeline.some(t => t.stage === 8 && t.status === 'next'), 'Stage 8 is next');
  assert.equal((await buyer('GET', '/assessments')).body.assessments[0].risks.version, 1);
});

test('a change in an earlier stage allows v2; v1 kept and locked; access rules', async () => {
  await buyer('POST', `/assessments/${ref}/contract?name=contract.docx&reason=${encodeURIComponent('Signed copy received from the vendor')}`, null,
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: fixture('contract.docx') });
  const r = await buyer('POST', `/assessments/${ref}/risks`);
  assert.equal(r.status, 201); assert.equal(r.body.register.version, 2); assert.equal(r.body.register.inputs.contract, 2);
  assert.equal((await buyer('GET', `/assessments/${ref}/risks?version=1`)).body.register.version, 1);
  await assert.rejects(pool.query('UPDATE risk_registers SET totals = $1', ['{}']), /append-only/);
  const events = (await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-7'`)).rows.map(e => e.event);
  assert.deepEqual(events, ['risks.registered', 'risks.registered']);
  assert.equal((await other('GET', `/assessments/${ref}/risks`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/risks`)).status, 403);
  assert.equal((await admin('GET', `/admin/assessments/${ref}`)).body.risks.versions.length, 2);
});
