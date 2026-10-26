/* Completion items: monitored obligations, report PDF, automatic checks, buyer dashboard, rule base. */
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
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-done-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { extractObligations } = await import('../src/engine/obligations.js');
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
  // An ISO certificate that runs out in 30 days, so monitoring has something to find.
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const up = await vendor(
    'POST',
    `/vendor/compliance/${ref}/evidence?control=${questionnaire[1].id}&type=certificate&name=iso27001.pdf&expires=${soon}`,
    null,
    { type: 'application/pdf', data: Buffer.from('%PDF-1.4 iso') },
  );
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal((await vendor('POST', `/vendor/compliance/${ref}/submit`)).status, 201);
  const ct = await buyer('POST', `/assessments/${ref}/contract?name=contract.pdf`, null, {
    type: 'application/pdf',
    data: fixture('contract.pdf'),
  });
  assert.equal(ct.status, 201, JSON.stringify(ct.body));
  assert.equal((await buyer('POST', `/assessments/${ref}/obligations`)).status, 201);
}

/* Stage 8: plan, then close or accept every action (the vendor answers its own). */
async function finishRemediation({ leaveOneOpen = false } = {}) {
  await buyer('POST', `/assessments/${ref}/remediation/plan`);
  let s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  const vendorOne = s.actions.find(x => x.owner === 'vendor');
  const decisions = s.actions.map(x =>
    x === vendorOne || x.owner === 'buyer'
      ? { number: x.number, decision: 'assign' }
      : { number: x.number, decision: 'accept', note: 'Accepted for the pilot period only.' },
  );
  assert.equal((await buyer('POST', `/assessments/${ref}/remediation/decisions`, { decisions })).status, 200);
  s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  for (const x of s.actions.filter(x => x.status === 'OPEN')) {
    if (x.owner === 'buyer') {
      if (x.needsDocument)
        await buyer(
          'POST',
          `/assessments/${ref}/remediation/actions/${x.number}/evidence?name=note.pdf`,
          null,
          { type: 'application/pdf', data: Buffer.from('%PDF-1.4') },
        );
      assert.equal(
        (
          await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/done`, {
            response: 'Handled in the contract amendment.',
          })
        ).status,
        200,
      );
    } else if (!leaveOneOpen) {
      if (x.needsDocument)
        await vendor('POST', `/vendor/actions/${ref}/${x.number}/evidence?name=proof.pdf`, null, {
          type: 'application/pdf',
          data: Buffer.from('%PDF-1.4 proof'),
        });
      assert.equal(
        (
          await vendor('POST', `/vendor/actions/${ref}/${x.number}/submit`, {
            response: 'Evidence attached for this action.',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/review`, {
            outcome: 'close',
          })
        ).status,
        200,
      );
    }
  }
}

const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ---------------- 6 · Monitored obligations ---------------- */

test('engine: each obligation gets a trigger, a consequence and whether it is monitored', () => {
  const clauses = [
    {
      id: 'c1',
      number: '3.1',
      heading: 'Service Levels',
      page: 1,
      topics: [],
      text: 'The Supplier shall respond to priority 1 incidents within 30 minutes.',
    },
    {
      id: 'c2',
      number: '3.2',
      heading: 'Service Levels',
      page: 1,
      topics: [],
      text: 'The Supplier shall maintain availability of 99.5% each month. Service credits apply where a service level is missed.',
    },
    {
      id: 'c3',
      number: '4.1',
      heading: 'Data',
      page: 1,
      topics: [],
      text: 'The Supplier shall keep records of processing.',
    },
    {
      id: 'c4',
      number: '9.1',
      heading: 'Audit',
      page: 2,
      topics: [],
      text: 'The Customer may audit the Supplier once in any 12 month period.',
    },
  ];
  const obs = extractObligations(clauses, { buyerName: 'UK Company Ltd', vendorName: 'Vendor A Test Ltd' });
  const by = n => obs.find(o => o.source.clauseNumber === n);
  assert.equal(by('3.1').trigger, 'within 30 minutes');
  assert.equal(by('3.1').monitored, true);
  assert.match(by('3.1').consequence.text, /Service credits/);
  assert.equal(by('3.1').consequence.clauseNumber, '3.2', 'found in the same section');
  assert.equal(by('4.1').consequence, null, 'not stated');
  assert.equal(by('4.1').monitored, false);
  assert.equal(by('9.1').type, 'Right');
  assert.equal(by('9.1').consequence, null);
  assert.equal(by('9.1').monitored, false);
});

test('a missed obligation becomes a Stage 8 action for its owner; not twice; rights cannot be missed', async () => {
  await runStagesTwoToFive();
  let r = await buyer('GET', `/assessments/${ref}/obligations`);
  const monitored = r.body.register.obligations.find(o => o.monitored && o.party === 'vendor');
  const right = r.body.register.obligations.find(o => o.type === 'Right');
  assert.ok(monitored && monitored.trigger && 'consequence' in monitored);
  assert.equal(
    (await buyer('POST', `/assessments/${ref}/obligations/${monitored.id}/missed`, { note: 'x' })).status,
    400,
  );
  r = await buyer('POST', `/assessments/${ref}/obligations/${monitored.id}/missed`, {
    note: 'P1 incident on 3 Nov answered after 2 hours.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const missed = r.body.missed.find(m => m.obligationId === monitored.id);
  assert.equal(missed.status, 'OPEN');
  assert.equal(
    (
      await buyer('POST', `/assessments/${ref}/obligations/${monitored.id}/missed`, {
        note: 'Reported again for the same issue.',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await buyer('POST', `/assessments/${ref}/obligations/${right.id}/missed`, {
        note: 'A right cannot really be missed.',
      })
    ).status,
    409,
  );
  const v = (await vendor('GET', `/vendor/actions/${ref}`)).body.actions.find(a => a.theme === 'obligation');
  assert.ok(v && v.requests.some(x => /was not met/.test(x)));
  assert.equal(
    (
      await vendor('POST', `/assessments/${ref}/obligations/${monitored.id}/missed`, {
        note: 'Vendors cannot report this.',
      })
    ).status,
    403,
  );
  // Close it so it does not hold up the rest.
  await vendor('POST', `/vendor/actions/${ref}/${v.number}/evidence?name=fix.pdf`, null, {
    type: 'application/pdf',
    data: Buffer.from('%PDF-1.4 fix'),
  });
  await vendor('POST', `/vendor/actions/${ref}/${v.number}/submit`, {
    response: 'Root cause fixed; on-call rota changed.',
  });
  assert.equal(
    (await buyer('POST', `/assessments/${ref}/remediation/actions/${v.number}/review`, { outcome: 'close' }))
      .status,
    200,
  );
});

/* ---------------- 9 · Dashboard ---------------- */

test('dashboard: the list carries overdue counts; alerts list expiries and work waiting for the buyer', async () => {
  assert.equal((await buyer('POST', `/assessments/${ref}/transfers`)).status, 201);
  assert.equal((await buyer('POST', `/assessments/${ref}/risks`)).status, 201);
  await buyer('POST', `/assessments/${ref}/remediation/plan`);
  let r = await buyer('GET', '/assessments/alerts');
  assert.equal(r.status, 200);
  assert.ok(
    r.body.alerts.some(a => a.kind === 'expiry' && /iso27001/.test(a.title)),
    'certificate expires within 30 days',
  );
  assert.ok(
    r.body.alerts.some(a => a.kind === 'decide'),
    'proposed actions to decide',
  );
  const list = (await buyer('GET', '/assessments')).body.assessments[0];
  assert.equal(typeof list.remediation.overdue, 'number');
  assert.ok(list.remediation.proposed > 0);
  assert.deepEqual((await other('GET', '/assessments/alerts')).body.alerts, [], 'another buyer sees nothing');
  await decideRemediation();
});

test('dashboard overview: figures, footprint, risks and recent assessments come from the saved records', async () => {
  const r = await buyer('GET', '/assessments/overview');
  assert.equal(r.status, 200);

  const { figures, byService, footprint, openRisks, recentAssessments, activity } = r.body;
  assert.equal(figures.assessments, 1);
  assert.equal(figures.vendors, 1);
  assert.equal(
    figures.onTrack + figures.attention + figures.highRisk + figures.inProgress,
    1,
    'every assessment has exactly one standing',
  );

  assert.equal(byService.length, 1);
  assert.equal(byService[0].count, 1);

  const home = footprint.find(place => place.roles.includes('Head office'));
  assert.ok(home, 'the head office is on the map');
  assert.ok(footprint.every(place => /^[A-Z]{2}$/.test(place.code)));

  assert.equal(recentAssessments[0].reference, ref);
  assert.ok(
    ['Compliant', 'Attention', 'High Risk', 'In Progress'].includes(
      r.body.standingLabels[recentAssessments[0].standing],
    ),
  );
  assert.ok(Array.isArray(openRisks) && openRisks.length <= 5);
  assert.ok(activity.length > 0 && activity.length <= 6);

  const empty = await other('GET', '/assessments/overview');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.figures.assessments, 0, 'another buyer sees nothing');
  assert.equal(empty.body.footprint.length, 1, 'only the head office before the first assessment');
  assert.deepEqual(empty.body.footprint[0].roles, ['Head office']);
  assert.equal(empty.body.openRisks.length, 0);

  // The period picker: an unknown value falls back to all time.
  assert.equal((await buyer('GET', '/assessments/overview?period=30')).body.figures.assessments, 1);
  assert.equal((await buyer('GET', '/assessments/overview?period=nonsense')).body.period, 'all');
});

test('evidence page: contracts and vendor evidence in the demo groups, with their real status', async () => {
  const r = await buyer('GET', '/assessments/evidence');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.groups, ['Contracts', 'Policies', 'Certificates', 'Other']);

  const certificate = r.body.documents.find(doc => /iso27001/.test(doc.name));
  assert.ok(certificate, 'the ISO 27001 certificate is listed');
  assert.equal(certificate.group, 'Certificates');
  assert.equal(certificate.status, 'Expiring', 'it expires within 30 days');
  assert.ok(certificate.to.endsWith('/compliance/' + ref));

  assert.ok(
    r.body.documents.some(doc => doc.group === 'Contracts'),
    'the contract is listed',
  );
  assert.ok(!r.body.documents.some(doc => doc.status === 'Verified'), 'nothing claims to be verified');
  assert.deepEqual(
    (await other('GET', '/assessments/evidence')).body.documents,
    [],
    'another buyer sees nothing',
  );
});

test('top bar search: finds the buyer’s own assessments, vendors and risks, nobody else’s', async () => {
  let r = await buyer('GET', '/assessments/search?q=' + encodeURIComponent(ref));
  assert.equal(r.status, 200);
  const assessments = r.body.groups.find(group => group.key === 'assessments');
  assert.ok(assessments && assessments.items[0].to.endsWith(ref), 'the assessment and the page it opens');

  r = await buyer('GET', '/assessments/search?q=krakow');
  assert.ok(
    r.body.groups.some(group => group.key === 'vendors'),
    'vendor found by name, any case',
  );

  r = await buyer('GET', '/assessments/search?q=' + encodeURIComponent('%'));
  assert.equal(r.body.groups.length, 0, '% is searched as text, not as a wildcard');

  assert.deepEqual(
    (await buyer('GET', '/assessments/search?q=a')).body.groups,
    [],
    'one letter is too short',
  );
  assert.deepEqual(
    (await other('GET', '/assessments/search?q=krakow')).body.groups,
    [],
    'another buyer finds nothing',
  );
});

/* ---------------- 7 · Report PDF ---------------- */

test('report PDF: buyer and admin can download it; others cannot', async () => {
  assert.equal((await buyer('POST', `/assessments/${ref}/report`)).status, 201);
  let r = await buyer('GET', `/assessments/${ref}/report/1/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(r.body.length > 3000);
  r = await admin('GET', `/admin/reports/${ref}/1/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await buyer('GET', `/assessments/${ref}/report/7/pdf`)).status, 404);
  assert.equal((await vendor('GET', `/assessments/${ref}/report/1/pdf`)).status, 403);
  assert.equal((await other('GET', `/assessments/${ref}/report/1/pdf`)).status, 404);
  assert.equal((await buyer('GET', `/admin/reports/${ref}/1/pdf`)).status, 403);
});

/* ---------------- 8 · Automatic checks ---------------- */

test('automatic checks: an expired certificate re-scores, rebuilds the risk register and asks for the renewal', async () => {
  const before = (await buyer('GET', `/assessments/${ref}/compliance`)).body.result;
  const registerBefore = (await buyer('GET', `/assessments/${ref}/risks`)).body.register.version;
  const later = day(40); // the certificate (30 days) has expired by then
  let r = await admin('POST', '/admin/checks/run', { today: later });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const mine = r.body.summary.changed.find(c => c.reference === ref);
  assert.ok(mine, JSON.stringify(r.body.summary));
  const kinds = mine.changes.map(c => c.kind);
  assert.deepEqual(kinds, ['rescored', 'register', 'renewals']);
  const after = (await buyer('GET', `/assessments/${ref}/compliance`)).body.result;
  assert.ok(after.overall < before.overall, `score drops ${before.overall} → ${after.overall}`);
  assert.ok(after.gaps.some(g => g.kind === 'expired'));
  const risks = (await buyer('GET', `/assessments/${ref}/risks`)).body;
  assert.equal(risks.register.version, registerBefore + 1);
  assert.equal(risks.versions[0].createdBy, 'OffshoreAssure (automatic)');
  const renewal = (await vendor('GET', `/vendor/actions/${ref}`)).body.actions.find(
    a => a.theme === 'monitoring',
  );
  assert.ok(renewal && renewal.status === 'OPEN');
  // Running again changes nothing.
  r = await admin('POST', '/admin/checks/run', { today: later });
  assert.ok(!r.body.summary.changed.some(c => c.reference === ref), 'idempotent');
  // The vendor renews; once the buyer closes it the score comes back.
  await vendor('POST', `/vendor/actions/${ref}/${renewal.number}/evidence?name=iso-2029.pdf`, null, {
    type: 'application/pdf',
    data: Buffer.from('%PDF-1.4 renewed'),
  });
  await vendor('POST', `/vendor/actions/${ref}/${renewal.number}/submit`, {
    response: 'Renewed certificate, valid to 2029.',
  });
  assert.equal(
    (
      await buyer('POST', `/assessments/${ref}/remediation/actions/${renewal.number}/review`, {
        outcome: 'close',
      })
    ).status,
    200,
  );
  r = await admin('POST', '/admin/checks/run', { today: later });
  const again = r.body.summary.changed.find(c => c.reference === ref);
  assert.equal(again.changes[0].kind, 'rescored');
  assert.match(again.changes[0].reason, /renewed/);
  assert.equal((await buyer('GET', `/assessments/${ref}/compliance`)).body.result.overall, before.overall);
  const runs = (await admin('GET', '/admin/checks')).body.runs;
  assert.ok(runs.length >= 3 && runs[0].trigger === 'admin');
  const tl = (await buyer('GET', `/assessments/${ref}`)).body.timeline;
  assert.ok(tl.some(t => t.stage === 9 && t.step === 43 && /Automatic check/.test(t.title)));
  assert.equal((await buyer('POST', '/admin/checks/run', {})).status, 403);
});

/* ---------------- 10 · Rule base ---------------- */

test('rule base: admins see every stage’s rule tables with their versions; buyers cannot', async () => {
  const r = await admin('GET', '/admin/rules');
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.packs.map(p => p.stage),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.ok(
    r.body.packs.every(
      p => /^RP-2026/.test(p.version) && p.tables.length && p.tables.every(t => t.rows.length),
    ),
  );
  assert.equal(r.body.packs[0].tables[0].rows.length, 15, 'ASS-001 to ASS-015');
  assert.equal((await buyer('GET', '/admin/rules')).status, 403);
});

/* Stage 8: decide every proposal (one vendor action assigned, the rest accepted) and close what is open. */
async function decideRemediation() {
  let s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  const proposed = s.actions.filter(x => x.status === 'PROPOSED');
  if (proposed.length) {
    const decisions = proposed.map(x =>
      x.owner === 'buyer'
        ? { number: x.number, decision: 'assign' }
        : { number: x.number, decision: 'accept', note: 'Accepted for the pilot period only.' },
    );
    assert.equal(
      (await buyer('POST', `/assessments/${ref}/remediation/decisions`, { decisions })).status,
      200,
    );
  }
  s = (await buyer('GET', `/assessments/${ref}/remediation`)).body;
  for (const x of s.actions.filter(x => x.status === 'OPEN' && x.owner === 'buyer')) {
    if (x.needsDocument)
      await buyer(
        'POST',
        `/assessments/${ref}/remediation/actions/${x.number}/evidence?name=note.pdf`,
        null,
        { type: 'application/pdf', data: Buffer.from('%PDF-1.4') },
      );
    assert.equal(
      (
        await buyer('POST', `/assessments/${ref}/remediation/actions/${x.number}/done`, {
          response: 'Handled in the contract amendment.',
        })
      ).status,
      200,
    );
  }
}
