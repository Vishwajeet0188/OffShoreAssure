/* Stage 8 · Remediation API tests (steps 33–38). */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-s8-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { proposeActions, residualRisks, checkSubmission } = await import('../src/engine/remediation.js');
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

/* Stages 2–5: select the vendor, the vendor answers (two "No"s), the contract is analysed and the obligations extracted. */
async function runStagesTwoToFive() {
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
  answers['006-1'] = { answer: 'No' }; // no up-to-date sub-processor list
  answers['008-2'] = { answer: 'No' }; // continuity plan not tested
  await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  assert.equal((await vendor('POST', `/vendor/compliance/${ref}/submit`)).status, 201);
  const up = await buyer('POST', `/assessments/${ref}/contract?name=contract.pdf`, null, {
    type: 'application/pdf',
    data: fixture('contract.pdf'),
  });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal((await buyer('POST', `/assessments/${ref}/obligations`)).status, 201);
}

/* ---------------- Engine ---------------- */
const RISKS = [
  {
    id: 'RSK-01',
    theme: 'subprocessors',
    title: 'Sub-processors',
    likelihood: 5,
    impact: 3,
    score: 15,
    rating: 'HIGH',
    findings: [
      { stage: 3, owner: 'Vendor', severity: 'fail', text: 'No sub-processor list.' },
      { stage: 4, owner: 'Buyer', severity: 'fail', text: 'No clause about sub-processors.' },
    ],
  },
  {
    id: 'RSK-02',
    theme: 'audit',
    title: 'Audit and oversight',
    likelihood: 3,
    impact: 2,
    score: 6,
    rating: 'MEDIUM',
    findings: [{ stage: 5, owner: 'Buyer', severity: 'fail', text: 'No audit obligation.' }],
  },
];

test('engine step 33: a risk becomes one action per side, with requests, due date from the rating', () => {
  const today = new Date('2026-10-26T00:00:00Z');
  const actions = proposeActions(RISKS, today);
  assert.equal(actions.length, 3, 'sub-processors → vendor + buyer; audit → buyer');
  const vendor = actions.find(a => a.theme === 'subprocessors' && a.owner === 'vendor');
  assert.equal(vendor.suggestedDueOn, '2026-11-09', 'High → 14 days');
  assert.equal(vendor.needsDocument, true);
  assert.match(vendor.requests[0], /upload evidence/i);
  assert.equal(actions.find(a => a.theme === 'audit').suggestedDueOn, '2026-11-25', 'Medium → 30 days');
  assert.equal(
    proposeActions(RISKS, today, new Set(['subprocessors:vendor', 'subprocessors:buyer', 'audit:buyer']))
      .length,
    0,
    'nothing new to plan',
  );
});

test('engine step 36: closed actions lower the remaining risk; accepted risks stay; checks to re-run listed', () => {
  const base = [
    { theme: 'subprocessors', status: 'CLOSED', sourceStages: [3] },
    { theme: 'subprocessors', status: 'OPEN', dueOn: '2020-01-01', sourceStages: [4] },
    { theme: 'audit', status: 'RISK_ACCEPTED', sourceStages: [5] },
  ];
  let r = residualRisks(RISKS, base, new Date('2026-10-26'));
  const subs = r.risks.find(x => x.theme === 'subprocessors');
  assert.equal(subs.status, 'PART_MITIGATED');
  assert.equal(subs.likelihood, 4);
  assert.equal(subs.score, 12);
  assert.equal(r.risks.find(x => x.theme === 'audit').status, 'ACCEPTED');
  assert.equal(r.totals.overdue, 1);
  assert.deepEqual(
    r.recheck.map(x => x.stage),
    [3],
  );
  r = residualRisks(
    RISKS,
    base.map(a => ({ ...a, status: a.theme === 'subprocessors' ? 'CLOSED' : a.status })),
  );
  assert.equal(r.risks.find(x => x.theme === 'subprocessors').status, 'MITIGATED');
  assert.equal(r.totals.mitigatedRisks, 1);
  assert.deepEqual(checkSubmission({ needs_document: true }, 'short', 0).length, 2);
  assert.ok(!/\bcompliant\b/i.test(JSON.stringify(r)));
});

/* ---------------- API ---------------- */
let state;
const actionOf = (owner, theme) =>
  state.actions.find(a => a.owner === owner && (!theme || a.theme === theme));

test('step 33: blocked until the risk register is saved; then actions are proposed', async () => {
  let r = await buyer('POST', `/assessments/${ref}/remediation/plan`);
  assert.equal(r.status, 409, 'no risk register yet');
  await runStagesTwoToFive();
  assert.equal((await buyer('POST', `/assessments/${ref}/transfers`)).status, 201);
  r = await buyer('POST', `/assessments/${ref}/remediation/plan`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /risk register first/);
  assert.equal((await buyer('POST', `/assessments/${ref}/risks`)).status, 201);
  r = await buyer('GET', `/assessments/${ref}/remediation`);
  assert.equal(r.body.canPlan, true);
  assert.ok(r.body.newProposals > 0);
  r = await buyer('POST', `/assessments/${ref}/remediation/plan`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  state = r.body;
  assert.ok(state.actions.length >= 3);
  assert.ok(state.actions.every(a => a.status === 'PROPOSED' && a.code.startsWith('ACT-')));
  assert.ok(actionOf('vendor', 'subprocessors'), 'the vendor is asked about sub-processors');
  assert.equal((await buyer('POST', `/assessments/${ref}/remediation/plan`)).body.error, 'up_to_date');
  assert.equal(
    (await vendor('GET', `/vendor/actions/${ref}`)).body.actions.length,
    0,
    'the vendor does not see proposals',
  );
});

test('step 33–34: approve and assign (vendor emailed), accept a risk with a reason; vendor sees only its actions', async () => {
  const subs = actionOf('vendor', 'subprocessors');
  const own = state.actions.find(a => a.owner === 'buyer');
  const other = state.actions.find(a => a !== subs && a !== own);
  let r = await buyer('POST', `/assessments/${ref}/remediation/decisions`, {
    decisions: [{ number: other.number, decision: 'accept', note: 'short' }],
  });
  assert.equal(r.status, 400);
  r = await buyer('POST', `/assessments/${ref}/remediation/decisions`, {
    decisions: [{ number: subs.number, decision: 'assign', dueOn: '2020-01-01' }],
  });
  assert.equal(r.status, 400, 'no due date in the past');
  r = await buyer('POST', `/assessments/${ref}/remediation/decisions`, {
    decisions: [
      { number: subs.number, decision: 'assign', note: 'Please send the full list with countries.' },
      { number: own.number, decision: 'assign' },
      {
        number: other.number,
        decision: 'accept',
        note: 'Low impact for this service; accepted by the board.',
      },
    ],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  state = r.body;
  assert.equal(actionOf('vendor', 'subprocessors').status, 'OPEN');
  assert.ok(actionOf('vendor', 'subprocessors').dueOn);
  assert.equal(state.actions.find(a => a.number === other.number).status, 'RISK_ACCEPTED');
  assert.equal(state.snapshots.length, 1, 'accepting a risk re-runs the checks');
  assert.equal(
    (
      await buyer('POST', `/assessments/${ref}/remediation/decisions`, {
        decisions: [{ number: subs.number, decision: 'assign' }],
      })
    ).body.error,
    'decided',
  );
  const v = await vendor('GET', `/vendor/actions/${ref}`);
  assert.ok(
    v.body.actions.length >= 1 && v.body.actions.every(a => a.owner === 'vendor' && a.status !== 'PROPOSED'),
  );
  assert.equal(v.body.actions[0].score, undefined, 'internal scores are not shown to the vendor');
  const list = await vendor('GET', '/vendor/actions');
  assert.equal(list.body.assessments[0].reference, ref);
  assert.ok(list.body.assessments[0].toDo >= 1);
});

test('step 35: vendor uploads proof and submits; the engine checks it first', async () => {
  const subs = actionOf('vendor', 'subprocessors');
  let r = await vendor('POST', `/vendor/actions/${ref}/${subs.number}/submit`, { response: 'Done.' });
  assert.equal(r.status, 400);
  assert.equal(r.body.problems.length, 2, 'too short and no document');
  r = await vendor('POST', `/vendor/actions/${ref}/${subs.number}/evidence?name=subprocessors.exe`, null, {
    type: 'application/octet-stream',
    data: Buffer.from('x'),
  });
  assert.equal(r.status, 400);
  r = await vendor('POST', `/vendor/actions/${ref}/${subs.number}/evidence?name=subprocessors.pdf`, null, {
    type: 'application/pdf',
    data: Buffer.from('%PDF-1.4 list'),
  });
  assert.equal(r.status, 201);
  r = await vendor('POST', `/vendor/actions/${ref}/${subs.number}/submit`, {
    response: 'Attached is our full sub-processor list with countries.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.actions.find(a => a.number === subs.number).status, 'SUBMITTED');
  const ev = r.body.actions.find(a => a.number === subs.number).evidence[0];
  assert.equal(
    (await vendor('DELETE', `/vendor/actions/${ref}/${subs.number}/evidence/${ev.id}`)).status,
    409,
    'submitted documents stay',
  );
  assert.equal((await other('GET', `/vendor/actions/${ref}`)).status, 403);
});

test('step 36: buyer returns, vendor resubmits, buyer closes; remaining risk drops; buyer completes its own action', async () => {
  const subs = actionOf('vendor', 'subprocessors');
  let r = await buyer('POST', `/assessments/${ref}/remediation/actions/${subs.number}/review`, {
    outcome: 'return',
    note: 'x',
  });
  assert.equal(r.status, 400);
  r = await buyer('POST', `/assessments/${ref}/remediation/actions/${subs.number}/review`, {
    outcome: 'return',
    note: 'Please add the hosting provider too.',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.actions.find(a => a.number === subs.number).status, 'RETURNED');
  r = await vendor('POST', `/vendor/actions/${ref}/${subs.number}/submit`, {
    response: 'Added the hosting provider (AWS, Ireland) to the list.',
  });
  assert.equal(r.status, 200);
  const before = (await buyer('GET', `/assessments/${ref}/remediation`)).body.residual.risks.find(
    x => x.theme === 'subprocessors',
  );
  r = await buyer('POST', `/assessments/${ref}/remediation/actions/${subs.number}/review`, {
    outcome: 'close',
  });
  assert.equal(r.status, 200);
  state = r.body;
  const after = state.residual.risks.find(x => x.theme === 'subprocessors');
  assert.ok(after.score < before.score, `remaining risk drops (${before.score} → ${after.score})`);
  assert.ok(
    state.residual.recheck.some(x => x.stage === 3),
    'the compliance answers should be re-scored',
  );
  assert.equal(state.snapshots.length, 2);

  const own = state.actions.find(a => a.owner === 'buyer' && a.status === 'OPEN');
  r = await buyer('POST', `/assessments/${ref}/remediation/actions/${own.number}/done`, { response: 'ok' });
  assert.equal(r.status, 400);
  if (own.needsDocument) {
    r = await buyer(
      'POST',
      `/assessments/${ref}/remediation/actions/${own.number}/evidence?name=amendment.pdf`,
      null,
      { type: 'application/pdf', data: Buffer.from('%PDF-1.4 amendment') },
    );
    assert.equal(r.status, 201);
  }
  r = await buyer('POST', `/assessments/${ref}/remediation/actions/${own.number}/done`, {
    response: 'Signed contract amendment adds the missing clauses.',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.actions.find(a => a.number === own.number).status, 'CLOSED');
  const history = r.body.actions.find(a => a.number === subs.number).history.map(h => h.event);
  assert.deepEqual(
    history.filter(e => e !== 'evidence_uploaded'),
    ['proposed', 'assigned', 'submitted', 'returned', 'submitted', 'closed'],
  );
});

test('step 37–38: history and snapshots are locked; timeline; access rules; Stage 9 next when all are done', async () => {
  await assert.rejects(pool.query('UPDATE remediation_events SET event = $1', ['x']), /append-only/);
  await assert.rejects(pool.query('DELETE FROM remediation_snapshots'), /append-only/);
  const a = await buyer('GET', `/assessments/${ref}`);
  for (const step of [33, 34, 35, 36, 37, 38])
    assert.ok(
      a.body.timeline.some(t => t.stage === 8 && t.step === step),
      'timeline step ' + step,
    );
  assert.equal((await other('GET', `/assessments/${ref}/remediation`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/remediation`)).status, 403);
  assert.ok((await admin('GET', `/admin/assessments/${ref}`)).body.remediation.actions.length >= 3);
  // Finish the rest: assign anything still proposed, then close or accept everything.
  state = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  const left = state.actions.filter(x => x.status === 'PROPOSED' || x.status === 'OPEN');
  for (const x of left) {
    if (x.status === 'PROPOSED')
      await buyer('POST', `/assessments/${ref}/remediation/decisions`, {
        decisions: [{ number: x.number, decision: 'accept', note: 'Accepted for the pilot period only.' }],
      });
    else if (x.owner === 'buyer') {
      if (x.needsDocument)
        await buyer(
          'POST',
          `/assessments/${ref}/remediation/actions/${x.number}/evidence?name=note.pdf`,
          null,
          { type: 'application/pdf', data: Buffer.from('%PDF-1.4') },
        );
      await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/done`, {
        response: 'Handled in the contract amendment.',
      });
    } else {
      if (x.needsDocument)
        await vendor('POST', `/vendor/actions/${ref}/${x.number}/evidence?name=proof.pdf`, null, {
          type: 'application/pdf',
          data: Buffer.from('%PDF-1.4'),
        });
      await vendor('POST', `/vendor/actions/${ref}/${x.number}/submit`, {
        response: 'Evidence attached for this action.',
      });
      await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/review`, { outcome: 'close' });
    }
  }
  state = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  assert.equal(
    state.residual.totals.open + state.residual.totals.awaitingReview + state.residual.totals.proposed,
    0,
  );
  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  assert.ok(
    tl.some(t => t.stage === 9 && t.status === 'next'),
    'Stage 9 is next',
  );
  assert.ok((await buyer('GET', '/assessments')).body.assessments[0].remediation.closed >= 3);
});
