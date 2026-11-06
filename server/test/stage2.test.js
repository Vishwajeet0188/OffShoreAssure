/* Stage 2 · Vendor selection API tests (steps 5–9), spec v2: three routes that meet at step 8. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.DEV_SHOW_CODES = 'true';
process.env.RATE_LIMIT = 'false';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { assessFit, directoryFilter, selectionStatus, conditionsFor, WEIGHTS } = await import(
  '../src/engine/vendorFit.js'
);
const { DIRECTORY_FILTERS, ONBOARDING_FIELDS, validateOnboarding } = await import(
  '../src/selection/vendorFields.js'
);
const { EXAMPLE } = await import('./fixtures.js');
const bcrypt = (await import('bcryptjs')).default;

// Emails are printed in tests; keep them so we can check who was told.
const emails = [];
const log = console.log;
console.log = (...args) => {
  const s = args.join(' ');
  if (s.startsWith('[DEV EMAIL]')) emails.push(s);
  else log(...args);
};

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body, raw) => {
    const r = await fetch(base + p, {
      method,
      headers: {
        'content-type': raw ? 'application/octet-stream' : 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
async function signUp(email, role) {
  const c = client();
  const r = await c('POST', '/auth/register', { email, password: 'Secure1234', ...(role ? { role } : {}) });
  await c('POST', '/auth/verify', { email, code: r.body.devCode });
  return c;
}
const vendorProfile = (name, services, deliveryCountries, directory) => ({
  fullName: 'Vendor ' + name,
  jobRole: 'Delivery Manager',
  organisationName: name,
  registrationNumber: 'REG-' + name.length,
  country: deliveryCountries[0],
  services,
  deliveryCountries,
  ...(directory ? { directory } : {}),
});
let admin,
  buyer,
  colleague,
  ref,
  ref2,
  ids = {},
  me = {};

async function vendor(email, name, services, countries, directory, approve = true) {
  const c = await signUp(email, 'vendor');
  const r = await c('PUT', '/me/profile', vendorProfile(name, services, countries, directory));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = (await pool.query(`SELECT id FROM organisations WHERE kind = 'vendor' AND name = $1`, [name]))
    .rows[0].id;
  if (approve)
    assert.equal((await admin('PATCH', '/admin/vendors/' + id, { status: 'approved' })).status, 200);
  return { c, id };
}
const confirmBody = (vendorId, source, extra = {}) => ({
  vendorId,
  selectionSource: source,
  decision: 'SELECT_WITH_CONDITIONS',
  approverId: me.buyer,
  rationale: 'Best fit for the service and the delivery countries we need.',
  confirmedAt: new Date().toISOString(),
  ...extra,
});

const OWN_VENDOR = {
  legalName: 'Vistula Remote Admin Sp. z o.o.',
  tradingName: 'Vistula IT',
  registrationNumber: '0000123456',
  registeredCountry: 'PL',
  registeredAddress: { line1: 'ul. Długa 10', city: 'Kraków', postcode: '31-147' },
  website: 'vistula-it.example',
  contactName: 'Ewa Nowak',
  contactEmail: 'ewa@vistula.example',
  contactRole: 'Director',
  contactPhone: '+48 12 345 6789',
  serviceCategory: 'IT Support',
  serviceDescription: 'IT support and remote administration for our UK staff.',
  deliveryCountries: ['PL'],
  remoteAccessCountries: ['PL'],
  hostingCountries: [],
  contractRelationship: 'Direct supplier',
  processingRole: 'Processor',
  personalDataAccess: 'Yes',
  subprocessorsUsed: 'Unknown',
  serviceCriticality: 'High',
  certificationsClaimed: ['ISO 27001'],
  supplierStatus: 'Proposed',
};

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
  buyer = await signUp('sarah@ukcompany.example');
  await buyer('PUT', '/me/profile', {
    fullName: 'Sarah Williams',
    organisationName: 'UK Company Ltd',
    sector: 'Financial Services',
    jobRole: 'Compliance Manager',
  });
  me.buyer = (await pool.query(`SELECT id FROM users WHERE email = 'sarah@ukcompany.example'`)).rows[0].id;
  // A second, non-owner member of the same organisation.
  colleague = await signUp('tom@ukcompany.example');
  await colleague('PUT', '/me/profile', {
    fullName: 'Tom Clark',
    organisationName: 'UK Company Ltd',
    sector: 'Financial Services',
    jobRole: 'Vendor Manager',
  });
  me.colleague = (await pool.query(`SELECT id FROM users WHERE email = 'tom@ukcompany.example'`)).rows[0].id;
  assert.equal(
    (await buyer('PATCH', '/organisation/members/' + me.colleague, { action: 'approve' })).status,
    200,
  );

  const id = (await buyer('POST', '/requirements', { data: { ...EXAMPLE, restrictedCountries: ['RU'] } }))
    .body.requirement.id;
  ref = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  const id2 = (
    await buyer('POST', '/requirements', {
      data: { ...EXAMPLE, assessmentTitle: 'Second IT Support', serviceCriticality: 'Medium' },
    })
  ).body.requirement.id;
  ref2 = (await buyer('POST', `/requirements/${id2}/submit`, {})).body.assessment_id;

  ids.good = (
    await vendor('anna@krakow.example', 'Krakow IT Services', ['IT Support'], ['PL', 'IN', 'BR', 'PH'], {
      industries: ['Financial Services'],
      certifications: ['ISO 27001'],
      staffCount: 400,
      foundedYear: 2008,
      supportHours: '24/7',
      usesSubprocessors: 'No',
      languages: ['English', 'Polish'],
    })
  ).id;
  ids.partial = (
    await vendor('raj@pune.example', 'Pune Helpdesk', ['IT Support'], ['IN'], { staffCount: 20 })
  ).id;
  ids.wrong = (await vendor('li@payroll.example', 'Payroll Partners', ['Payroll'], ['PL'])).id;
  ids.restricted = (await vendor('ivan@moscow.example', 'Moscow Support', ['IT Support'], ['RU', 'PL'])).id;
  ids.pending = (
    await vendor('new@pending.example', 'Pending Support Co', ['IT Support'], ['PL'], null, false)
  ).id;
});
after(async () => {
  console.log = log;
  server.close();
  await pool.end();
});

/* ---------------- Definitions and engine ---------------- */
test('step 5 definitions: 15 directory inputs (with the Assessment ID) and 25 onboarding fields', () => {
  assert.equal(DIRECTORY_FILTERS.length + 1, 15);
  assert.equal(ONBOARDING_FIELDS.length, 25);
  assert.equal(
    WEIGHTS.reduce((s, w) => s + w.weight, 0),
    100,
  );
  const bad = validateOnboarding({
    ...OWN_VENDOR,
    registeredCountry: 'GB',
    registrationNumber: '123',
    registeredAddress: { line1: '1 High St', city: 'London', postcode: '31-147' },
    serviceDescription: 'Too short',
    contactPhone: '01234',
    personalDataAccess: 'Maybe',
  });
  assert.match(bad.errors.registrationNumber, /Companies House/);
  assert.match(bad.errors.registeredAddress, /postcode/i);
  assert.ok(bad.errors.serviceDescription && bad.errors.contactPhone && bad.errors.personalDataAccess);
  const cond = validateOnboarding({
    ...OWN_VENDOR,
    remoteAccessCountries: [],
    serviceCategory: 'Cloud / infrastructure operations',
    hostingCountries: [],
  });
  assert.ok(cond.errors.remoteAccessCountries && cond.errors.hostingCountries, 'conditional fields');
  const ok = validateOnboarding({ ...OWN_VENDOR, website: 'http://vistula-it.example' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.contactPhone, '+48123456789');
  assert.ok(ok.notes.some(n => /https/.test(n)));
});

test('step 6: fit assessment — missing is not failure, restrictions are hard, buyer-added stays preliminary', () => {
  const d = { ...EXAMPLE, restrictedCountries: ['RU'] };
  const dir = (extra = {}) => ({
    source: 'DIRECTORY',
    verificationStatus: 'approved',
    services: ['IT Support'],
    deliveryCountries: ['PL', 'IN', 'BR', 'PH'],
    registeredCountry: 'PL',
    certifications: ['ISO 27001'],
    usesSubprocessors: 'No',
    industries: ['Financial Services'],
    supportHours: '24/7',
    ...extra,
  });
  const good = assessFit(d, dir());
  assert.equal(good.eligibility, 'ELIGIBLE');
  assert.equal(good.reviewStatus, 'VERIFIED');
  assert.equal(good.checks.length, 9);
  assert.equal(selectionStatus(good), 'SELECTED_PENDING_ASSESSMENT');
  assert.equal(good.score.total, 100);
  const unstated = assessFit(d, dir({ usesSubprocessors: null, industries: [] }));
  assert.equal(unstated.eligibility, 'ELIGIBLE_WITH_GAPS');
  assert.ok(unstated.selectable);
  assert.equal(
    unstated.checks.find(c => c.id === 'subprocessors').result,
    'missing',
    'not stated is "missing", never "fail"',
  );
  assert.ok(unstated.score.total < good.score.total);
  const restricted = assessFit(d, dir({ deliveryCountries: ['RU', 'PL'] }));
  assert.equal(restricted.eligibility, 'EXCLUDED');
  assert.equal(selectionStatus(restricted), 'SELECTION_BLOCKED');
  const own = assessFit(d, {
    ...dir(),
    source: 'BUYER_PROVIDED',
    verificationStatus: 'unverified',
    remoteAccessCountries: ['PL'],
    hostingCountries: null,
    personalDataAccess: 'Yes',
  });
  assert.equal(own.reviewStatus, 'PRELIMINARY_UNVERIFIED');
  assert.equal(selectionStatus(own), 'CONDITIONALLY_SELECTED');
  assert.ok(conditionsFor(own).includes('Complete the vendor assurance questionnaire.'));
  const f = directoryFilter(
    { staffCount: null, supportHours: 'Business hours' },
    { minStaff: 50, supportHours: '24/7' },
  );
  assert.deepEqual(f, { failed: ['Support hours'], notStated: ['Staff capacity'] });
});

/* ---------------- Route A ---------------- */
test('step 5 route A: directory search needs service and countries, lists verified directory vendors, ranks by fit', async () => {
  let r = await buyer('POST', `/assessments/${ref}/vendors/search`, {});
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.serviceCategory && r.body.fields.supplierCountries);
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['ANY'],
  });
  assert.equal(r.status, 200);
  const names = r.body.vendors.map(v => v.name);
  assert.ok(!names.includes('Pending Support Co'), 'unverified vendors are not in the directory');
  assert.ok(!names.includes('Payroll Partners'), 'service category filter');
  assert.equal(r.body.vendors[0].name, 'Krakow IT Services');
  assert.equal(r.body.vendors[0].rank, 1);
  assert.match(r.body.vendors[0].rankRationale, /Fit score/);
  const moscow = r.body.vendors.find(v => v.name === 'Moscow Support');
  assert.ok(moscow, 'hard exclusions stay visible');
  assert.equal(moscow.rank, null);
  assert.equal(moscow.fit.eligibility, 'EXCLUDED');
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['IN'],
  });
  assert.deepEqual(r.body.vendors.map(v => v.name).sort(), ['Krakow IT Services', 'Pune Helpdesk']);
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['IN'],
    minStaff: 50,
  });
  assert.deepEqual(
    r.body.vendors.map(v => v.name),
    ['Krakow IT Services'],
  );
  assert.equal(r.body.hidden, 1, 'Pune stated 20 staff');
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['IN'],
    certifications: ['SOC 2 Type II'],
  });
  const pune = r.body.vendors.find(v => v.name === 'Pune Helpdesk');
  assert.ok(pune?.filter.notStated.includes('Certifications'), 'not stated is kept and labelled');
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['ANY'],
    insuranceAmount: 1000000,
  });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.insuranceCurrency);
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['ANY'],
    budgetMin: 500,
    budgetMax: 100,
    budgetCurrency: 'GBP',
  });
  assert.ok(r.body.fields.budgetMax);
  const vend = client();
  await vend('POST', '/auth/login', { email: 'anna@krakow.example', password: 'Secure1234' });
  assert.equal(
    (
      await vend('POST', `/assessments/${ref}/vendors/search`, {
        serviceCategory: 'IT Support',
        supplierCountries: ['ANY'],
      })
    ).status,
    403,
    'vendors cannot search',
  );
  assert.ok((await pool.query('SELECT 1 FROM vendor_searches')).rows.length, 'searches are recorded');
});

test('step 7 route A: candidates are added, compared and ranked; unverified vendors cannot be added', async () => {
  for (const k of ['good', 'partial', 'restricted'])
    assert.equal((await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId: ids[k] })).status, 200);
  assert.equal((await buyer('POST', `/assessments/${ref}/shortlist`, { vendorId: ids.pending })).status, 404);
  const r = await buyer('GET', `/assessments/${ref}/selection`);
  assert.equal(r.body.candidates.length, 3);
  assert.ok(r.body.candidates.every(v => v.candidateSource === 'DIRECTORY' && v.fit.checks.length === 9));
  assert.deepEqual(
    r.body.candidates.map(v => v.rank),
    [1, 2, null],
  );
});

/* ---------------- Route B ---------------- */
test('step 5 route B: add our own vendor — validated, UNVERIFIED, BUYER_PROVIDED, duplicates caught', async () => {
  let r = await buyer('POST', `/assessments/${ref}/own-vendors`, { legalName: 'X' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.legalName && r.body.fields.contactEmail && r.body.fields.registeredAddress);
  r = await buyer('POST', `/assessments/${ref}/own-vendors`, {
    ...OWN_VENDOR,
    legalName: 'Krakow IT Services',
    registrationNumber: '0000999999',
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'possible_duplicate', 'same name as a directory vendor');
  r = await buyer('POST', `/assessments/${ref}/own-vendors`, OWN_VENDOR);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ids.own = r.body.vendorId;
  const o = (await pool.query('SELECT * FROM organisations WHERE id = $1', [ids.own])).rows[0];
  assert.equal(o.source, 'buyer_provided');
  assert.equal(o.verification_status, 'unverified');
  assert.equal(o.contact_email, 'ewa@vistula.example');
  const own = r.body.state.candidates.find(c => c.id === ids.own);
  assert.equal(own.candidateSource, 'BUYER_PROVIDED');
  assert.equal(own.rank, null, 'no fabricated rank');
  assert.equal(own.fit.reviewStatus, 'PRELIMINARY_UNVERIFIED');
  assert.equal(own.fit.eligibility, 'ELIGIBLE_WITH_GAPS');
  assert.equal(own.vendor.registeredAddress.postcode, '31-147');
  r = await buyer('POST', `/assessments/${ref}/own-vendors`, OWN_VENDOR);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'duplicate', 'cannot add the same vendor twice');
  // Directory search never shows buyer-added vendors.
  r = await buyer('POST', `/assessments/${ref}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['ANY'],
  });
  assert.ok(!r.body.vendors.some(v => v.id === ids.own));
  // Another buyer can add a vendor with the same name.
  const other = await signUp('other@elsewhere.example');
  await other('PUT', '/me/profile', {
    fullName: 'Other',
    organisationName: 'Elsewhere Ltd',
    sector: 'Retail',
    jobRole: 'Other',
  });
  assert.equal(
    (await other('POST', `/assessments/${ref}/own-vendors`, OWN_VENDOR)).status,
    404,
    'other buyers cannot use this assessment',
  );
});

test('step 5 route B: contract and DPA uploads (PDF or DOCX only)', async () => {
  let r = await buyer(
    'POST',
    `/assessments/${ref}/own-vendors/${ids.own}/documents?type=contract&name=msa.txt`,
    null,
    Buffer.from('hello'),
  );
  assert.equal(r.status, 400);
  r = await buyer(
    'POST',
    `/assessments/${ref}/own-vendors/${ids.own}/documents?type=contract&name=msa.pdf`,
    null,
    Buffer.from('%PDF-1.4 test'),
  );
  assert.equal(r.status, 201);
  const own = r.body.candidates.find(c => c.id === ids.own);
  assert.equal(own.vendor.documents.contract, true);
  assert.equal(own.fit.checks.find(c => c.id === 'contract').result, 'pass');
  assert.equal(
    (
      await buyer(
        'POST',
        `/assessments/${ref}/own-vendors/${ids.good}/documents?type=contract&name=x.pdf`,
        null,
        Buffer.from('%PDF'),
      )
    ).status,
    404,
    'only own vendors',
  );
});

/* ---------------- Step 8 ---------------- */
test('step 8: confirm checks candidate, source, approver authority, hard restrictions, exceptions and decision', async () => {
  let r = await buyer('POST', `/assessments/${ref}/selection`, { vendorId: ids.good, rationale: 'short' });
  assert.equal(r.status, 400);
  assert.ok(
    r.body.fields.rationale &&
      r.body.fields.approverId &&
      r.body.fields.confirmedAt &&
      r.body.fields.decision,
  );
  r = await buyer('POST', `/assessments/${ref}/selection`, confirmBody(ids.wrong, 'DIRECTORY'));
  assert.equal(r.body.error, 'not_a_candidate');
  r = await buyer('POST', `/assessments/${ref}/selection`, confirmBody(ids.own, 'DIRECTORY'));
  assert.ok(r.body.fields.selectionSource, 'source must match the candidate');
  r = await buyer(
    'POST',
    `/assessments/${ref}/selection`,
    confirmBody(ids.own, 'BUYER_PROVIDED', { approverId: me.colleague }),
  );
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'approver_not_authorised', 'high criticality needs an owner');
  r = await buyer('POST', `/assessments/${ref}/selection`, confirmBody(ids.restricted, 'DIRECTORY'));
  assert.equal(r.status, 409);
  assert.equal(r.body.status, 'SELECTION_BLOCKED');
  assert.ok(
    (
      await pool.query(`SELECT 1 FROM audit_events WHERE event = 'vendor_selection.blocked' AND ref = $1`, [
        ref,
      ])
    ).rows.length,
  );
  r = await buyer(
    'POST',
    `/assessments/${ref}/selection`,
    confirmBody(ids.own, 'BUYER_PROVIDED', { decision: 'SELECT' }),
  );
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.decision, 'conditional vendor needs "select with conditions"');
  r = await buyer(
    'POST',
    `/assessments/${ref}/selection`,
    confirmBody(ids.own, 'BUYER_PROVIDED', { confirmedAt: '2020-01-01T00:00:00Z' }),
  );
  assert.ok(r.body.fields.confirmedAt);
  assert.equal(
    (await buyer('GET', `/assessments/${ref}`)).body.summary.currentStatus.code !== 'VENDOR_SELECTED',
    true,
    'nothing saved yet',
  );
});

/* ---------------- Step 9 ---------------- */
test('step 9: buyer-added vendor saved as CONDITIONALLY_SELECTED with the 12-field record; contact is emailed', async () => {
  emails.length = 0;
  const r = await buyer('POST', `/assessments/${ref}/selection`, confirmBody(ids.own, 'BUYER_PROVIDED'));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = r.body.current;
  for (const k of [
    'id',
    'assessmentId',
    'vendorId',
    'source',
    'selectionCriteria',
    'comparisonSha256',
    'rationale',
    'approver',
    'exceptions',
    'selectedAt',
    'vendorProfileVersion',
  ])
    assert.ok(s[k] !== undefined && s[k] !== null, 'record field ' + k);
  assert.equal(s.recordVersion, '1.0');
  assert.equal(s.source, 'BUYER_PROVIDED');
  assert.equal(s.selectionMode, 'ADD_NEW_VENDOR');
  assert.equal(s.status, 'CONDITIONALLY_SELECTED');
  assert.ok(s.conditions.includes('Verify the legal entity and delivery locations.'));
  assert.equal(s.approver.email, 'sarah@ukcompany.example');
  assert.equal(s.vendorProfileVersion, 1);
  await assert.rejects(
    pool.query(`UPDATE vendor_selections SET rationale = 'x' WHERE id = $1`, [s.id]),
    /append-only/,
  );
  const a = await buyer('GET', `/assessments/${ref}`);
  assert.ok(
    a.body.timeline.some(
      t => t.stage === 2 && t.step === 8 && /conditionally selected: Vistula/.test(t.title),
    ),
  );
  assert.equal(a.body.timeline.find(t => t.status === 'next').stage, 3);
  assert.ok(
    emails.some(e => e.includes('ewa@vistula.example') && e.includes('Register on OffshoreAssure')),
    'contact invited to register',
  );
});

test('route B → Stage 3: the contact registers, takes over the company record and sees the selection', async () => {
  const st = await buyer('POST', `/assessments/${ref}/compliance`, {});
  assert.equal(st.status, 201, 'Stage 3 starts with a buyer-added vendor');
  const c = await signUp('ewa@vistula.example', 'vendor');
  const r = await c('PUT', '/me/profile', {
    ...vendorProfile('Vistula Remote Admin Sp. z o.o.', ['IT Support'], ['PL']),
    registrationNumber: '0000123456',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.vendor.organisationId, ids.own, 'joined the buyer-added company');
  assert.equal(r.body.vendor.verificationStatus, 'pending', 'now waits for OffshoreAssure verification');
  const v = await c('GET', '/vendor/assessments');
  assert.equal(v.body.selected[0].reference, ref);
  assert.equal(v.body.selected[0].selectionStatus, 'CONDITIONALLY_SELECTED');
  const q = (await c('GET', '/vendor/compliance')).body.questionnaires;
  assert.equal(q.length, 1, 'the questionnaire reaches the vendor');
  assert.equal(q[0].reference, ref);
  const versions = (
    await pool.query(
      'SELECT version, profile FROM vendor_profile_versions WHERE vendor_id = $1 ORDER BY version',
      [ids.own],
    )
  ).rows;
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[1].profile.remoteAccessCountries, ['PL'], 'buyer details kept');
});

/* ---------------- Route C ---------------- */
test('step 5 route C: reuse a vendor our organisation added or selected, with change check and contact update', async () => {
  let r = await buyer('GET', `/assessments/${ref2}/existing-vendors`);
  assert.deepEqual(
    r.body.vendors.map(v => v.name),
    ['Vistula Remote Admin Sp. z o.o.'],
  );
  r = await buyer('POST', `/assessments/${ref2}/existing-vendors`, {
    vendorId: ids.good,
    serviceCategory: 'IT Support',
    scopeDescription: 'Same scope as before.',
    reviewReason: 'Annual review of support.',
  });
  assert.equal(r.status, 404, 'only vendors this organisation has used');
  r = await buyer('POST', `/assessments/${ref2}/existing-vendors`, {
    vendorId: ids.own,
    serviceCategory: 'IT Support',
    scopeDescription: 'x',
    reviewReason: 'y',
  });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.scopeDescription && r.body.fields.reviewReason);
  r = await buyer('POST', `/assessments/${ref2}/existing-vendors`, {
    vendorId: ids.own,
    serviceCategory: 'IT Support',
    scopeDescription: 'Remote administration for the second site.',
    reviewReason: 'Extending the existing supplier to a new site.',
    contact: { contactPhone: '12' },
  });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields['contact.contactPhone']);
  r = await buyer('POST', `/assessments/${ref2}/existing-vendors`, {
    vendorId: ids.own,
    serviceCategory: 'IT Support',
    scopeDescription: 'Remote administration for the second site.',
    reviewReason: 'Extending the existing supplier to a new site.',
    contact: { contactName: 'Piotr Lis', contactEmail: 'piotr@vistula.example' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const cand = r.body.state.candidates.find(c => c.id === ids.own);
  assert.equal(cand.candidateSource, 'EXISTING');
  assert.equal(cand.rank, null);
  assert.ok(
    r.body.materialChanges.some(m => m.field === 'contactEmail'),
    'material change found since the last selection',
  );
  assert.equal(cand.vendor.contact.email, 'piotr@vistula.example');
  r = await buyer(
    'POST',
    `/assessments/${ref2}/selection`,
    confirmBody(ids.own, 'EXISTING', { approverId: me.colleague }),
  );
  assert.equal(r.status, 201, 'medium criticality: a member may approve');
  assert.equal(r.body.current.source, 'EXISTING');
  assert.equal(
    r.body.current.selectionCriteria.reviewReason,
    'Extending the existing supplier to a new site.',
  );
});

test('step 9: changing vendor creates v2 linked to v1 with a reason; a verified, complete vendor is SELECTED_PENDING_ASSESSMENT', async () => {
  const id = (
    await buyer('POST', '/requirements', {
      data: {
        ...EXAMPLE,
        assessmentTitle: 'Third IT Support',
        assuranceRequirements: ['Multi-factor authentication (MFA)'],
      },
    })
  ).body.requirement.id;
  const ref3 = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  await buyer('POST', `/assessments/${ref3}/vendors/search`, {
    serviceCategory: 'IT Support',
    supplierCountries: ['ANY'],
  });
  await buyer('POST', `/assessments/${ref3}/shortlist`, { vendorId: ids.good });
  await buyer('POST', `/assessments/${ref3}/shortlist`, { vendorId: ids.partial });
  let r = await buyer(
    'POST',
    `/assessments/${ref3}/selection`,
    confirmBody(ids.good, 'DIRECTORY', { decision: 'SELECT' }),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.current.status, 'SELECTED_PENDING_ASSESSMENT');
  assert.equal(r.body.current.selectionCriteria.serviceCategory, 'IT Support');
  r = await buyer(
    'POST',
    `/assessments/${ref3}/selection`,
    confirmBody(ids.good, 'DIRECTORY', { decision: 'SELECT' }),
  );
  assert.equal(r.body.error, 'no_changes');
  r = await buyer('POST', `/assessments/${ref3}/selection`, confirmBody(ids.partial, 'DIRECTORY'));
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.changeReason);
  r = await buyer(
    'POST',
    `/assessments/${ref3}/selection`,
    confirmBody(ids.partial, 'DIRECTORY', { changeReason: 'Krakow withdrew its offer.' }),
  );
  assert.equal(r.status, 201);
  assert.equal(r.body.current.version, 2);
  assert.equal(r.body.current.previousId, r.body.versions[0].id);
  assert.equal(r.body.current.status, 'CONDITIONALLY_SELECTED');
  const d = await admin('GET', `/admin/assessments/${ref3}`);
  assert.equal(d.body.selection.current.vendor.name, 'Pune Helpdesk');
  const vd = await admin('GET', '/admin/vendors?status=unverified');
  assert.equal(vd.status, 200);
});

test('selection is blocked while the requirement has contradictory answers', async () => {
  const id = (
    await buyer('POST', '/requirements', {
      data: { ...EXAMPLE, assessmentTitle: 'Contradiction', privilegedAccess: 'No' },
    })
  ).body.requirement.id;
  const ref4 = (await buyer('POST', `/requirements/${id}/submit`, {})).body.assessment_id;
  await buyer('POST', `/assessments/${ref4}/shortlist`, { vendorId: ids.good });
  const st = await buyer('GET', `/assessments/${ref4}/selection`);
  assert.ok(st.body.blocked);
  const r = await buyer('POST', `/assessments/${ref4}/selection`, confirmBody(ids.good, 'DIRECTORY'));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'information_required');
});

test('vendor profile: optional directory details are saved and a profile version is kept', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'raj@pune.example', password: 'Secure1234' });
  let r = await c(
    'PUT',
    '/me/profile',
    vendorProfile('Pune Helpdesk', ['IT Support'], ['IN'], { staffCount: 'lots' }),
  );
  assert.equal(r.status, 400);
  r = await c(
    'PUT',
    '/me/profile',
    vendorProfile('Pune Helpdesk', ['IT Support'], ['IN'], { staffCount: 120, insuranceCover: 500000 }),
  );
  assert.equal(r.status, 400, 'insurance needs a currency');
  assert.ok(r.body.fields['directory.insuranceCurrency']);
  r = await c(
    'PUT',
    '/me/profile',
    vendorProfile('Pune Helpdesk', ['IT Support'], ['IN'], {
      staffCount: 120,
      insuranceCover: 500000,
      insuranceCurrency: 'gbp',
      languages: ['English', 'Hindi'],
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.vendor.directory.staffCount, 120);
  assert.equal(r.body.vendor.directory.insuranceCurrency, 'GBP');
  const versions = (
    await pool.query('SELECT count(*)::int AS n FROM vendor_profile_versions WHERE vendor_id = $1', [
      ids.partial,
    ])
  ).rows[0].n;
  assert.ok(versions >= 2);
});
