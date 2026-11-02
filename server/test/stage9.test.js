/* Stage 9 · Monitoring and audit API tests (steps 39–43). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s9-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { assessmentPosition, monitoringItems } = await import('../src/engine/report.js');
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
  // An ISO certificate that runs out in 30 days, so monitoring has something to find.
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const up = await vendor('POST', `/vendor/compliance/${ref}/evidence?control=${questionnaire[1].id}&type=certificate&name=iso27001.pdf&expires=${soon}`, null, { type: 'application/pdf', data: Buffer.from('%PDF-1.4 iso') });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal((await vendor('POST', `/vendor/compliance/${ref}/submit`)).status, 201);
  const ct = await buyer('POST', `/assessments/${ref}/contract?name=contract.pdf`, null, { type: 'application/pdf', data: fixture('contract.pdf') });
  assert.equal(ct.status, 201, JSON.stringify(ct.body));
  assert.equal((await buyer('POST', `/assessments/${ref}/obligations`)).status, 201);
}


/* Stage 8: plan, then close or accept every action (the vendor answers its own). */
async function finishRemediation({ leaveOneOpen = false } = {}) {
  await buyer('POST', `/assessments/${ref}/remediation/plan`);
  let s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  const vendorOne = s.actions.find(x => x.owner === 'vendor');
  const decisions = s.actions.map(x => x === vendorOne || x.owner === 'buyer'
    ? { number: x.number, decision: 'assign' } : { number: x.number, decision: 'accept', note: 'Accepted for the pilot period only.' });
  assert.equal((await buyer('POST', `/assessments/${ref}/remediation/decisions`, { decisions })).status, 200);
  s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  for (const x of s.actions.filter(x => x.status === 'OPEN')) {
    if (x.owner === 'buyer') {
      if (x.needsDocument) await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/evidence?name=note.pdf`, null, { type: 'application/pdf', data: Buffer.from('%PDF-1.4') });
      assert.equal((await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/done`, { response: 'Handled in the contract amendment.' })).status, 200);
    } else if (!leaveOneOpen) {
      if (x.needsDocument) await vendor('POST', `/vendor/actions/${ref}/${x.number}/evidence?name=proof.pdf`, null, { type: 'application/pdf', data: Buffer.from('%PDF-1.4 proof') });
      assert.equal((await vendor('POST', `/vendor/actions/${ref}/${x.number}/submit`, { response: 'Evidence attached for this action.' })).status, 200);
      assert.equal((await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/review`, { outcome: 'close' })).status, 200);
    }
  }
}

/* ---------------- Engine ---------------- */

test('engine: the stated position never says "compliant" and follows what is still open', () => {
  const residual = r => ({ overall: { rating: r } });
  assert.equal(assessmentPosition({ residual: residual('HIGH'), actions: [{ status: 'OPEN' }] }).code, 'ACTION_REQUIRED');
  assert.equal(assessmentPosition({ residual: residual('MEDIUM'), actions: [{ status: 'SUBMITTED' }] }).code, 'IN_REMEDIATION');
  assert.equal(assessmentPosition({ residual: residual('MEDIUM'), actions: [{ status: 'CLOSED' }, { status: 'RISK_ACCEPTED' }] }).code, 'RISKS_ACCEPTED');
  const closed = assessmentPosition({ residual: residual('LOW'), actions: [{ status: 'CLOSED' }] });
  assert.equal(closed.code, 'ACTIONS_CLOSED');
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(closed)));
});

test('engine step 43: expiries, overdue actions, changed records and the periodic review', () => {
  const today = new Date('2026-10-26T00:00:00Z');
  const evidence = [
    { id: 'e1', controlId: 'ASS-002', type: 'certificate', fileName: 'iso.pdf', expiresOn: '2026-09-30' },
    { id: 'e2', controlId: 'ASS-016', type: 'insurance', fileName: 'cover.pdf', expiresOn: '2026-12-01' },
    { id: 'e3', controlId: 'ASS-003', type: 'certificate', fileName: 'soc2.pdf', expiresOn: '2027-12-01' },
  ];
  const actions = [{ code: 'ACT-01', title: 'x', owner: 'vendor', status: 'OPEN', dueOn: '2026-10-01' }];
  let items = monitoringItems({ evidence, actions, today });
  assert.deepEqual(items.map(i => i.key), ['renew:e1', 'overdue:ACT-01', 'renew:e2'], 'far-off expiry ignored; high first');
  assert.equal(items[0].severity, 'high'); assert.equal(items[2].canRequest, true);
  items = monitoringItems({ evidence, today, riskTier: 'HIGH', requested: new Map([['renew:e1', { code: 'ACT-09', status: 'CLOSED', statusLabel: 'Closed' }]]),
    lastReport: { version: 1, createdAt: '2026-03-01T00:00:00Z', inputs: { risks: 1 } }, inputs: { risks: 2 } });
  const by = k => items.find(i => i.key === k);
  assert.equal(by('renew:e1').severity, 'low'); assert.equal(by('renew:e1').canRequest, false);
  assert.match(by('changed').detail, /risks/);
  assert.equal(by('review').severity, 'high', 'High tier → every 6 months; due 2026-09-01, so overdue');
});

/* ---------------- API ---------------- */
let state;

test('step 39: blocked until Stage 8 is decided; then the buyer can generate the report', async () => {
  let r = await buyer('GET', `/assessments/${ref}/report`);
  assert.ok(r.body.blocked); assert.equal(r.body.canGenerate, false);
  assert.equal((await buyer('POST', `/assessments/${ref}/report`)).status, 409);
  await runStagesTwoToFive();
  assert.equal((await buyer('POST', `/assessments/${ref}/transfers`)).status, 201);
  assert.equal((await buyer('POST', `/assessments/${ref}/risks`)).status, 201);
  await buyer('POST', `/assessments/${ref}/remediation/plan`);
  r = await buyer('POST', `/assessments/${ref}/report`);
  assert.equal(r.status, 409); assert.match(r.body.message, /Decide every proposed action/);
  await finishRemediation({ leaveOneOpen: true });
  r = await buyer('GET', `/assessments/${ref}/report`);
  assert.equal(r.body.blocked, null); assert.equal(r.body.canGenerate, true); assert.equal(r.body.report, null);
});

test('steps 40–42: the report is compiled from every stage, saved with a fingerprint and shown', async () => {
  const r = await buyer('POST', `/assessments/${ref}/report`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  state = r.body;
  const rep = state.report;
  assert.equal(rep.version, 1); assert.match(rep.snapshotSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(rep.content.sections.map(s => s.stage), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(rep.content.position.code, 'ACTION_REQUIRED', 'a vendor action is still open and the remaining risk is high');
  assert.ok(rep.content.openActions.length >= 1); assert.ok(rep.content.acceptedRisks.every(x => x.reason.length >= 10));
  assert.ok(rep.content.evidence.some(e => e.fileName === 'iso27001.pdf' && /^[0-9a-f]{64}$/.test(e.sha256)));
  assert.ok(rep.content.evidence.some(e => e.kind === 'Contract'));
  assert.ok(rep.content.records.length >= 7); assert.ok(rep.content.auditTrail.events > 10);
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(rep.content)), 'never says compliant');
  assert.equal(state.upToDate, true); assert.equal(state.canGenerate, false);
  assert.equal((await buyer('POST', `/assessments/${ref}/report`)).body.error, 'up_to_date');
  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  for (const step of [39, 40, 41, 42]) assert.ok(tl.some(t => t.stage === 9 && t.step === step), 'timeline step ' + step);
  assert.ok(!tl.some(t => t.stage === 9 && t.kind === 'milestone'), 'Stage 9 milestone reached');
  assert.equal((await buyer('GET', '/assessments')).body.assessments[0].report.version, 1);
});

test('step 42: audit pack download with the audit trail; reports are append-only', async () => {
  const r = await buyer('GET', `/assessments/${ref}/report/1/pack`);
  assert.equal(r.status, 200); assert.equal(r.body.reportVersion, 1);
  assert.equal(r.body.reportSha256, state.report.snapshotSha256);
  assert.ok(r.body.auditTrail.some(e => e.event === 'report.generated'));
  assert.ok(r.body.timeline.length > 10);
  assert.equal((await buyer('GET', `/assessments/${ref}/report/9/pack`)).status, 404);
  await assert.rejects(pool.query('UPDATE report_versions SET reason = $1', ['x']), /append-only/);
});

test('step 43: monitoring finds the expiring certificate; the renewal goes to the vendor as an action', async () => {
  const items = state.monitoring.items;
  const renewal = items.find(i => i.kind === 'renewal');
  assert.ok(renewal && renewal.canRequest, JSON.stringify(items));
  assert.ok(items.some(i => i.kind === 'review'), 'periodic review date shown');
  let r = await buyer('POST', `/assessments/${ref}/monitoring`, { choice: 'check' });
  assert.equal(r.status, 201); assert.equal(r.body.monitoring.checks.length, 1);
  await assert.rejects(pool.query('DELETE FROM monitoring_checks'), /append-only/);
  assert.equal((await buyer('POST', `/assessments/${ref}/monitoring/requests`, { keys: ['review'] })).status, 409, 'only renewals can be sent');
  r = await buyer('POST', `/assessments/${ref}/monitoring/requests`, { keys: [renewal.key], note: 'Please send the renewed ISO certificate.' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.monitoring.items.find(i => i.key === renewal.key).canRequest, false);
  assert.equal((await buyer('POST', `/assessments/${ref}/monitoring/requests`, { keys: [renewal.key] })).status, 409, 'not twice');
  const v = (await vendor('GET', `/vendor/actions/${ref}`)).body.actions.find(a => a.theme === 'monitoring');
  assert.ok(v && v.status === 'OPEN' && v.title.startsWith('Renewal:'));
  // The vendor sends the renewed certificate and the buyer closes it.
  await vendor('POST', `/vendor/actions/${ref}/${v.number}/evidence?name=iso27001-2027.pdf`, null, { type: 'application/pdf', data: Buffer.from('%PDF-1.4 renewed') });
  assert.equal((await vendor('POST', `/vendor/actions/${ref}/${v.number}/submit`, { response: 'Renewed certificate, valid to 2029.' })).status, 200);
  assert.equal((await buyer('POST', `/assessments/${ref}/remediation/actions/${v.number}/review`, { outcome: 'close' })).status, 200);
  r = await buyer('GET', `/assessments/${ref}/report`);
  const after = r.body.monitoring.items.find(i => i.key === renewal.key);
  assert.equal(after.severity, 'low'); assert.match(after.detail, /received/);
  assert.ok(r.body.monitoring.items.some(i => i.key === 'changed'), 'records changed since report v1.0');
  assert.equal(r.body.canGenerate, true);
});

test('step 41: a new version when records change; the old one stays; access rules', async () => {
  // Close the vendor action left open, then generate v2.
  await finishRemediationLeftovers();
  const r = await buyer('POST', `/assessments/${ref}/report`, { reason: 'Vendor actions closed' });
  assert.equal(r.status, 201);
  assert.equal(r.body.report.version, 2); assert.equal(r.body.versions.length, 2);
  assert.notEqual(r.body.report.content.position.code, 'ACTION_REQUIRED');
  assert.equal((await buyer('GET', `/assessments/${ref}/report?version=1`)).body.report.content.position.code, 'ACTION_REQUIRED', 'v1 unchanged');
  assert.equal((await other('GET', `/assessments/${ref}/report`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/report`)).status, 403);
  assert.equal((await admin('GET', `/admin/assessments/${ref}`)).body.report.versions.length, 2);
  const list = await admin('GET', '/admin/reports');
  assert.equal(list.status, 200); assert.equal(list.body.reports.length, 2);
  assert.equal((await buyer('GET', '/admin/reports')).status, 403);
});

test('step 43: the vendor sees its own track record', async () => {
  const r = await vendor('GET', '/vendor/track-record');
  assert.equal(r.status, 200);
  const a = r.body.assessments.find(x => x.reference === ref);
  assert.ok(a.compliance.score > 0); assert.equal(a.reports.count, 2);
  assert.ok(a.actions.closed >= 2); assert.equal(a.actions.open, 0);
  assert.ok(r.body.expiring.some(e => e.fileName === 'iso27001.pdf'));
  assert.equal((await buyer('GET', '/vendor/track-record')).status, 403);
});

async function finishRemediationLeftovers() {
  const s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  for (const x of s.actions.filter(x => x.status === 'OPEN' && x.owner === 'vendor')) {
    if (x.needsDocument) await vendor('POST', `/vendor/actions/${ref}/${x.number}/evidence?name=proof.pdf`, null, { type: 'application/pdf', data: Buffer.from('%PDF-1.4 proof') });
    assert.equal((await vendor('POST', `/vendor/actions/${ref}/${x.number}/submit`, { response: 'Evidence attached for this action.' })).status, 200);
    assert.equal((await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/review`, { outcome: 'close' })).status, 200);
  }
}
