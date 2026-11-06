/* Stage 1 · Step 1 API tests: requirement drafts, submission rules, boundary flags, documents. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.DEV_SHOW_CODES = 'true';
process.env.RATE_LIMIT = 'false';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-storage-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { FIELD_COUNT } = await import('../src/requirements/fields.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body, raw) => {
    const headers = {
      ...(cookie ? { cookie } : {}),
      ...(raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {}),
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
async function buyer(email, org = 'UK Company Ltd') {
  const c = client();
  const r = await c('POST', '/auth/register', { email, password: 'Secure1234' });
  await c('POST', '/auth/verify', { email, code: r.body.devCode });
  await c('PUT', '/me/profile', {
    fullName: 'Sarah Williams',
    organisationName: org,
    sector: 'Financial Services',
    jobRole: 'Compliance Manager',
  });
  return c;
}

import { EXAMPLE } from './fixtures.js';
export { EXAMPLE };

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await pool.end();
});

test('form definition: 32 fields in 6 groups, prefilled from the profile', async () => {
  const c = await buyer('sarah@ukcompany.example');
  const r = await c('GET', '/requirements/form');
  assert.equal(r.status, 200);
  assert.equal(FIELD_COUNT, 32);
  assert.equal(r.body.fieldCount, 32);
  assert.deepEqual(
    r.body.groups.map(g => g.fields.length),
    [5, 7, 6, 6, 6, 2],
  );
  assert.equal(r.body.prefill.buyerLegalName, 'UK Company Ltd');
  assert.equal(r.body.prefill.buyerContactEmail, 'sarah@ukcompany.example');
  assert.equal(r.body.countries.length, 249);
  assert.equal(r.body.documents.types.length, 6);
});

test('access: signed-out → 401, admin → 403, other buyer cannot see my draft', async () => {
  assert.equal((await client()('GET', '/requirements')).status, 401);
  await pool.query(
    `INSERT INTO users (email, password_hash, status, is_admin, email_verified_at) VALUES ('admin@offshoreassure.example', $1, 'active', true, now())`,
    [await bcrypt.hash('Admin12345', 4)],
  );
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  assert.equal((await admin('GET', '/requirements')).status, 403);
  const a = client();
  await a('POST', '/auth/login', { email: 'sarah@ukcompany.example', password: 'Secure1234' });
  const d = await a('POST', '/requirements', { data: { assessmentTitle: 'Private draft' } });
  const b = await buyer('other@elsewhere.example', 'Elsewhere Ltd');
  assert.equal((await b('GET', `/requirements/${d.body.requirement.id}`)).status, 404);
  assert.equal((await b('GET', '/requirements')).body.requirements.length, 0);
});

test('draft: partial answers saved; invalid values rejected; hidden conditional fields dropped', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'sarah@ukcompany.example', password: 'Secure1234' });
  let r = await c('POST', '/requirements', {
    data: { assessmentTitle: 'Global IT Support', buyerCountry: 'GB' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.requirement.status, 'draft');
  assert.ok(r.body.requirement.check.missing.length > 10, 'missing fields listed but not blocking a draft');
  const id = r.body.requirement.id;
  r = await c('PUT', `/requirements/${id}`, {
    data: {
      assessmentTitle: 'Global IT Support',
      startDate: '2026-02-30',
      contractDuration: 500,
      buyerCountry: 'XY',
      estimatedBudget: -5,
    },
  });
  assert.equal(r.status, 400);
  for (const k of ['startDate', 'contractDuration', 'buyerCountry', 'estimatedBudget'])
    assert.ok(r.body.fields[k], k);
  r = await c('PUT', `/requirements/${id}`, {
    data: {
      assessmentTitle: 'Global IT Support',
      personalData: 'No',
      dataSubjectCategories: ['Employees'],
      buyerCountry: 'GB',
      companyRegNumber: '123',
    },
  });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.companyRegNumber, /UK company number/);
  r = await c('PUT', `/requirements/${id}`, {
    data: {
      assessmentTitle: 'Global IT Support',
      personalData: 'No',
      dataSubjectCategories: ['Employees'],
      buyerCountry: 'GB',
      companyRegNumber: 'sc 123456',
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.requirement.data.dataSubjectCategories, undefined, 'hidden when no personal data');
  assert.equal(r.body.requirement.data.companyRegNumber, 'SC123456');
});

test('submit: rejected with missing list (stays draft), conditional rules, then accepted and locked', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'sarah@ukcompany.example', password: 'Secure1234' });
  const id = (await c('POST', '/requirements', { data: { assessmentTitle: 'Global IT Support' } })).body
    .requirement.id;
  let r = await c('POST', `/requirements/${id}/submit`, {
    data: {
      ...EXAMPLE,
      storageCountries: [],
      systemsAccessed: [],
      currency: undefined,
      assuranceRequirements: [],
    },
  });
  assert.equal(r.status, 422);
  const miss = r.body.missing.map(m => m.field).sort();
  assert.deepEqual(miss, ['assuranceRequirements', 'currency', 'storageCountries', 'systemsAccessed'].sort());
  assert.equal((await c('GET', `/requirements/${id}`)).body.requirement.status, 'draft');
  r = await c('POST', `/requirements/${id}/submit`, { data: EXAMPLE });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'accepted');
  assert.equal(r.body.requirement.status, 'submitted');
  assert.equal((await c('PUT', `/requirements/${id}`, { data: EXAMPLE })).status, 409);
  assert.equal((await c('DELETE', `/requirements/${id}`)).status, 409);
  const list = (await c('GET', '/requirements')).body.requirements;
  assert.ok(list.some(x => x.id === id && x.status === 'submitted' && x.missingCount === 0));
});

test('boundary flags: country conflict, unknown personal data and locations, enhanced assessment', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'sarah@ukcompany.example', password: 'Secure1234' });
  const r = await c('POST', '/requirements', {
    data: {
      ...EXAMPLE,
      restrictedCountries: ['IN'],
      personalData: 'Unknown',
      storageCountries: ['UNKNOWN'],
      serviceCriticality: 'Critical',
      privilegedAccess: 'Unknown',
    },
  });
  const codes = r.body.requirement.check.flags.map(f => f.code);
  for (const code of [
    'country_conflict',
    'personal_data_unknown',
    'location_unknown',
    'enhanced_assessment',
    'privileged_unknown',
  ])
    assert.ok(codes.includes(code), code);
  assert.match(r.body.requirement.check.flags.find(f => f.code === 'country_conflict').message, /India/);
  // Unknown personal data still allows submission (preliminary assessment)
  const s = await c('POST', `/requirements/${r.body.requirement.id}/submit`, {});
  assert.equal(s.status, 200, JSON.stringify(s.body.missing));
});

test('documents: upload with SHA-256, reject unsupported or oversized, download, remove', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'sarah@ukcompany.example', password: 'Secure1234' });
  const id = (await c('POST', '/requirements', { data: { assessmentTitle: 'Docs test' } })).body.requirement
    .id;
  const pdf = Buffer.from('%PDF-1.4 sample service description');
  let r = await c(
    'POST',
    `/requirements/${id}/documents?type=service_description&name=${encodeURIComponent('Service description.pdf')}`,
    null,
    { type: 'application/pdf', data: pdf },
  );
  assert.equal(r.status, 201);
  assert.equal(r.body.document.sha256, crypto.createHash('sha256').update(pdf).digest('hex'));
  const docId = r.body.document.id;
  r = await c('POST', `/requirements/${id}/documents?type=service_description&name=run.exe`, null, {
    type: 'application/octet-stream',
    data: Buffer.from('MZ'),
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /not supported/);
  r = await c('POST', `/requirements/${id}/documents?type=bogus&name=a.pdf`, null, {
    type: 'application/pdf',
    data: pdf,
  });
  assert.equal(r.status, 400);
  r = await c('POST', `/requirements/${id}/documents?type=data_inventory&name=big.pdf`, null, {
    type: 'application/pdf',
    data: Buffer.alloc(10 * 1024 * 1024 + 10),
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /10 MB/);
  r = await c('GET', `/requirements/${id}/documents/${docId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.equals(pdf));
  assert.equal((await c('GET', `/requirements/${id}`)).body.documents.length, 1);
  r = await c('DELETE', `/requirements/${id}/documents/${docId}`);
  assert.equal(r.status, 200);
  assert.equal((await c('GET', `/requirements/${id}`)).body.documents.length, 0);
});

test('audit: requirement events recorded under stage-1', async () => {
  const ev = (await pool.query(`SELECT event FROM audit_events WHERE stage = 'stage-1'`)).rows.map(
    r => r.event,
  );
  for (const e of [
    'requirement.draft_created',
    'requirement.draft_saved',
    'requirement.submission_rejected',
    'requirement.submitted',
    'requirement.document_uploaded',
    'requirement.document_rejected',
    'requirement.document_removed',
  ])
    assert.ok(ev.includes(e), e);
});

/* ---------------- Step 2: validate fields and create Assessment ID ---------------- */
async function signIn(email = 'sarah@ukcompany.example') {
  const c = client();
  await c('POST', '/auth/login', { email, password: 'Secure1234' });
  return c;
}

test('step 2: validate (dry run) returns the spec output and saves nothing', async () => {
  const c = await signIn();
  const before = Number((await pool.query('SELECT count(*) FROM assessments')).rows[0].count);
  let r = await c('POST', '/assessments/validate', { data: EXAMPLE });
  assert.equal(r.status, 200);
  assert.deepEqual(
    { ...r.body, details: undefined },
    {
      validation_status: 'VALID',
      service: 'IT_SUPPORT',
      personal_data: true,
      vendor_assessment_required: true,
      contract_review_required: true,
      transfer_review_required: true,
      missing_fields: [],
      details: undefined,
    },
  );
  r = await c('POST', '/assessments/validate', { data: { ...EXAMPLE, startDate: '2026-13-01' } });
  assert.equal(r.body.validation_status, 'INVALID');
  r = await c('POST', '/assessments/validate', { data: { ...EXAMPLE, personalData: 'Unknown' } });
  assert.equal(r.body.validation_status, 'INCOMPLETE');
  assert.equal(r.body.personal_data, null);
  assert.ok(r.body.missing_fields.includes('personalData'));
  r = await c('POST', '/assessments/validate', { data: { assessmentTitle: 'Only a title' } });
  assert.equal(r.body.validation_status, 'INCOMPLETE');
  assert.equal(Number((await pool.query('SELECT count(*) FROM assessments')).rows[0].count), before);
});

test('step 2: submit creates OA-UK-2026-xxxxxx with the 15 system fields (worked example)', async () => {
  const c = await signIn();
  const id = (await c('POST', '/requirements', { data: EXAMPLE })).body.requirement.id;
  const r = await c('POST', `/requirements/${id}/submit`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const year = new Date().getUTCFullYear();
  assert.match(r.body.assessment_id, new RegExp(`^OA-UK-${year}-\\d{6}$`));
  const a = r.body.assessment;
  assert.equal(a.requirementVersion, '1.0');
  assert.equal(a.serviceCode, 'IT_SUPPORT');
  assert.equal(a.dataClassification, 'PERSONAL');
  assert.equal(a.riskTier, 'HIGH');
  assert.equal(a.validationStatus, 'VALID');
  assert.deepEqual(a.missingFields, []);
  assert.ok(
    a.jurisdictionPacks.includes('UK-GDPR') &&
      a.jurisdictionPacks.includes('UK-GDPR-CHAPTER-V') &&
      a.jurisdictionPacks.includes('COUNTRY-IN') &&
      a.jurisdictionPacks.includes('SECTOR-UK-FCA-PRA'),
  );
  assert.equal(a.rulePackVersion, 'RP-2026.10-S1-draft');
  assert.ok(a.vendorAssessmentRequired && a.contractReviewRequired && a.transferReviewRequired);
  assert.ok(a.buyerId && a.createdBy && a.createdAt);
  assert.ok(a.findings.legalScreening.some(l => l.provision === 'UK GDPR Art. 28'));
  assert.match(a.findings.reasons.riskTolerance, /above the buyer's stated risk tolerance/);
  // the requirement now carries the assessment
  const g = await c('GET', `/requirements/${id}`);
  assert.equal(g.body.assessment.reference, r.body.assessment_id);
  const list = await c('GET', '/requirements');
  assert.equal(list.body.requirements.find(x => x.id === id).assessment.reference, r.body.assessment_id);
});

test('step 2: idempotency — repeated request returns the same assessment, never a duplicate', async () => {
  const c = await signIn();
  const id = (
    await c('POST', '/requirements', {
      data: { ...EXAMPLE, assessmentTitle: 'Payroll outsourcing', serviceCategory: 'Payroll' },
    })
  ).body.requirement.id;
  const r1 = await c('POST', '/assessments', { requirementId: id });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.duplicate, false);
  const r2 = await c('POST', '/assessments', { requirementId: id });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.duplicate, true);
  assert.equal(r2.body.assessment_id, r1.body.assessment_id);
  const n = Number(
    (await pool.query('SELECT count(*) FROM assessments WHERE requirement_id = $1', [id])).rows[0].count,
  );
  assert.equal(n, 1);
  // sequential references
  const refs = (await pool.query(`SELECT reference FROM assessments ORDER BY reference`)).rows.map(x =>
    Number(x.reference.slice(-6)),
  );
  assert.deepEqual(
    refs,
    refs.map((_, i) => refs[0] + i),
  );
});

test('step 2: derivations — unknowns → INCOMPLETE + provisional; special category → CRITICAL; contradictions and duplicates reported', async () => {
  const c = await signIn();
  let id = (
    await c('POST', '/requirements', {
      data: {
        ...EXAMPLE,
        assessmentTitle: 'Helpdesk with unknowns',
        personalData: 'Unknown',
        storageCountries: ['UNKNOWN'],
      },
    })
  ).body.requirement.id;
  let r = await c('POST', `/requirements/${id}/submit`, {});
  assert.equal(r.body.assessment.validationStatus, 'INCOMPLETE');
  assert.ok(r.body.assessment.missingFields.some(m => m.field === 'storageCountries'));
  assert.equal(r.body.assessment.findings.riskProvisional, true);
  id = (
    await c('POST', '/requirements', {
      data: { ...EXAMPLE, assessmentTitle: 'Clinical records support', specialCategory: 'Yes' },
    })
  ).body.requirement.id;
  r = await c('POST', `/requirements/${id}/submit`, {});
  assert.equal(r.body.assessment.riskTier, 'CRITICAL');
  assert.equal(r.body.assessment.dataClassification, 'SPECIAL_CATEGORY');
  assert.ok(r.body.assessment.findings.legalScreening.some(l => l.provision === 'UK GDPR Art. 9'));
  id = (
    await c('POST', '/requirements', {
      data: { ...EXAMPLE, deliveryModel: 'Onsite', subprocessors: 'Prohibited', restrictedCountries: ['IN'] },
    })
  ).body.requirement.id;
  r = await c('POST', `/requirements/${id}/submit`, {});
  const msgs = r.body.assessment.findings.contradictions.map(x => x.message).join(' | ');
  assert.match(msgs, /onsite/i);
  assert.match(msgs, /Subprocessors are prohibited/);
  assert.match(msgs, /India is both restricted/);
  assert.match(
    r.body.assessment.findings.duplicateOf,
    /^OA-UK-/,
    'same title + service as an earlier assessment',
  );
});

test('step 2: organisation scope — colleagues see the assessment, other buyers and admins do not', async () => {
  const sarah = await signIn();
  const ref = (await sarah('GET', '/assessments')).body.assessments[0].reference;
  const colleague = await buyer('tom@ukcompany.example', 'UK Company Ltd');
  assert.equal(
    (await colleague('GET', `/assessments/${ref}`)).status,
    403,
    'pending until the owner approves',
  );
  const tom = (await sarah('GET', '/organisation')).body.members.find(
    m => m.email === 'tom@ukcompany.example',
  );
  assert.equal(tom.membership, 'pending');
  assert.equal(
    (await sarah('PATCH', `/organisation/members/${tom.userId}`, { action: 'approve' })).status,
    200,
  );
  assert.equal((await colleague('GET', `/assessments/${ref}`)).status, 200);
  const other = await signIn('other@elsewhere.example');
  assert.equal((await other('GET', `/assessments/${ref}`)).status, 404);
  assert.equal((await other('GET', '/assessments')).body.assessments.length, 0);
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@offshoreassure.example', password: 'Admin12345' });
  assert.equal((await admin('POST', '/assessments/validate', { data: EXAMPLE })).status, 403);
  const all = await admin('GET', '/admin/assessments');
  assert.ok(all.body.assessments.some(a => a.reference === ref && a.buyerName === 'UK Company Ltd'));
  assert.equal((await admin('GET', `/admin/assessments/${ref}`)).status, 200);
  assert.ok(
    (await pool.query(`SELECT 1 FROM audit_events WHERE event = 'assessment.created' AND ref = $1`, [ref]))
      .rows.length,
  );
});

/* ---------------- Step 3: requirement profile, controls, timeline, versions ---------------- */
test('step 3: submit saves profile v1.0 with the 15 stored fields, controls and timeline', async () => {
  const c = await signIn();
  const id = (
    await c('POST', '/requirements', { data: { ...EXAMPLE, assessmentTitle: 'Service desk for EMEA' } })
  ).body.requirement.id;
  const pdf = Buffer.from('%PDF-1.4 requirements document');
  await c('POST', `/requirements/${id}/documents?type=requirements_document&name=req.pdf`, null, {
    type: 'application/pdf',
    data: pdf,
  });
  const r = await c('POST', `/requirements/${id}/submit`, {});
  assert.equal(r.status, 200);
  assert.equal(r.body.profiles.length, 1);
  const p = r.body.profiles[0];
  for (const k of [
    'id',
    'assessmentId',
    'version',
    'originalSubmission',
    'normalisedRequirement',
    'rulePackIds',
    'rulePackVersions',
    'controlIds',
    'createdAt',
    'createdBy',
    'sourceDocuments',
    'documentHashes',
    'validationFindings',
    'missingInformation',
    'previousVersion',
  ])
    assert.ok(k in p, 'stored field ' + k);
  assert.equal(p.version, '1.0');
  assert.equal(p.previousVersion, null);
  assert.equal(p.normalisedRequirement.service.code, 'IT_SUPPORT');
  assert.equal(p.rulePackIds.length, p.rulePackVersions.length);
  assert.deepEqual(p.documentHashes, [crypto.createHash('sha256').update(pdf).digest('hex')]);
  assert.equal(p.sourceDocuments[0].fileName, 'req.pdf');
  // worked example: everything applies except sector-free / no-insurance cases
  for (const ctl of [
    'ASS-001',
    'ASS-002',
    'ASS-003',
    'ASS-004',
    'ASS-005',
    'ASS-006',
    'ASS-007',
    'ASS-008',
    'ASS-009',
    'ASS-010',
    'ASS-011',
    'ASS-012',
    'ASS-013',
    'ASS-014',
    'ASS-015',
  ])
    assert.ok(p.controlIds.includes(ctl), ctl);
  assert.ok(p.validationFindings.checks.every(x => ['pass', 'fail', 'unknown'].includes(x.result)));
  assert.ok(
    p.validationFindings.controls.find(x => x.id === 'ASS-003').buyerRequested,
    'MFA requested by the buyer',
  );
  assert.match(p.snapshotSha256, /^[0-9a-f]{64}$/);
  const done = r.body.timeline.filter(t => t.status === 'done').map(t => t.step);
  assert.deepEqual(done, [1, 2, 3, 4], 'steps 1–4 done (Step 4 is issued by the engine on submit)');
  assert.equal(r.body.timeline.find(t => t.status === 'next').stage, 2, 'Stage 2 next');
  assert.equal(r.body.timeline.filter(t => t.status === 'pending').length, 7, 'stages 3–9 pending');
  assert.ok(
    (
      await pool.query(`SELECT 1 FROM audit_events WHERE event = 'requirement_profile.saved' AND ref = $1`, [
        r.body.assessment_id,
      ])
    ).rows.length,
  );
});

test('step 3: controls follow the answers (no personal data → no ASS-004/005/014)', async () => {
  const c = await signIn();
  const data = {
    ...EXAMPLE,
    assessmentTitle: 'Internal tooling build',
    serviceCategory: 'Software development',
    personalData: 'No',
    storageCountries: [],
    subprocessors: 'Prohibited',
    cloudServices: 'No',
    serviceCriticality: 'Medium',
    supportHours: 'Business hours',
    buyerSector: 'Retail',
    assuranceRequirements: ['ISO 27001 certification'],
  };
  const id = (await c('POST', '/requirements', { data })).body.requirement.id;
  const r = await c('POST', `/requirements/${id}/submit`, {});
  const ids = r.body.profiles[0].controlIds;
  for (const x of ['ASS-004', 'ASS-005', 'ASS-006', 'ASS-014', 'ASS-015'])
    assert.ok(!ids.includes(x), x + ' should not apply');
  for (const x of ['ASS-001', 'ASS-002', 'ASS-003', 'ASS-012'])
    assert.ok(ids.includes(x), x + ' should apply');
});

test('step 3: profiles are immutable; corrections create v1.1 linked to v1.0 and update the assessment', async () => {
  const c = await signIn();
  const id = (await c('POST', '/requirements', { data: { ...EXAMPLE, assessmentTitle: 'Correction test' } }))
    .body.requirement.id;
  const s = await c('POST', `/requirements/${id}/submit`, {});
  const ref = s.body.assessment_id;
  await assert.rejects(
    pool.query(`UPDATE requirement_profiles SET version = '9.9' WHERE id = $1`, [s.body.profiles[0].id]),
    /append-only/,
  );
  await assert.rejects(
    pool.query(`DELETE FROM requirement_profiles WHERE id = $1`, [s.body.profiles[0].id]),
    /append-only/,
  );
  let r = await c('POST', `/assessments/${ref}/corrections`, { data: EXAMPLE, reason: '' });
  assert.equal(r.status, 400);
  r = await c('POST', `/assessments/${ref}/corrections`, {
    data: { ...EXAMPLE, assessmentTitle: 'Correction test' },
    reason: 'No real change',
  });
  assert.equal(r.status, 409);
  r = await c('POST', `/assessments/${ref}/corrections`, {
    data: { ...EXAMPLE, assessmentTitle: 'Correction test', specialCategory: 'Yes' },
    reason: 'Health data confirmed by HR',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.version, '1.1');
  assert.equal(r.body.assessment.assessmentId ?? r.body.assessment.reference, ref, 'same Assessment ID');
  assert.equal(r.body.assessment.requirementVersion, '1.1');
  assert.equal(r.body.assessment.riskTier, 'CRITICAL');
  const [v10, v11] = r.body.profiles;
  assert.equal(v11.previousVersion, v10.id);
  assert.equal(v11.changeReason, 'Health data confirmed by HR');
  assert.equal(v10.normalisedRequirement.personalData.specialCategory, 'No', 'v1.0 unchanged');
  assert.ok(r.body.timeline.some(t => /profile v1.1 saved/.test(t.title)));
  r = await c('POST', `/assessments/${ref}/corrections`, {
    data: { ...EXAMPLE, assessmentTitle: 'Correction test', startDate: 'bad' },
    reason: 'Broken date',
  });
  assert.equal(r.status, 400);
  const other = await signIn('other@elsewhere.example');
  assert.equal(
    (await other('POST', `/assessments/${ref}/corrections`, { data: EXAMPLE, reason: 'Not mine at all' }))
      .status,
    404,
  );
});

test('step 3: documents are encrypted at rest and decrypt on download', async () => {
  const c = await signIn();
  const id = (await c('POST', '/requirements', { data: { assessmentTitle: 'Encryption test' } })).body
    .requirement.id;
  const plain = Buffer.from('%PDF-1.4 secret security requirements');
  const up = await c('POST', `/requirements/${id}/documents?type=security_requirements&name=sec.pdf`, null, {
    type: 'application/pdf',
    data: plain,
  });
  const row = (
    await pool.query('SELECT storage_key, encrypted FROM requirement_documents WHERE id = $1', [
      up.body.document.id,
    ])
  ).rows[0];
  assert.equal(row.encrypted, true);
  const onDisk = fs.readFileSync(path.join(process.env.STORAGE_DIR, row.storage_key));
  assert.ok(!onDisk.includes(Buffer.from('secret security requirements')), 'ciphertext on disk');
  const dl = await c('GET', `/requirements/${id}/documents/${up.body.document.id}`);
  assert.ok(dl.body.equals(plain));
});

test('step 4: "Information Required" summary with the 10 output fields (worked example)', async () => {
  const c = await signIn();
  const id = (await c('POST', '/requirements', { data: { ...EXAMPLE, assessmentTitle: 'Step 4 example' } }))
    .body.requirement.id;
  const sub = await c('POST', `/requirements/${id}/submit`, {});
  const ref = sub.body.assessment_id;
  assert.ok(sub.body.summary, 'summary returned with the submission');
  const r = await c('GET', `/assessments/${ref}/summary`);
  assert.equal(r.status, 200);
  for (const k of [
    'assessment_id',
    'service',
    'buyer',
    'jurisdictions',
    'data_classification',
    'assurance_controls',
    'initial_risk_tier',
    'missing_items',
    'required_next_actions',
    'current_status',
  ])
    assert.ok(k in r.body, 'output field ' + k);
  assert.equal(r.body.assessment_id, ref);
  assert.equal(r.body.service.code, 'IT_SUPPORT');
  assert.equal(r.body.data_classification, 'PERSONAL');
  assert.equal(r.body.initial_risk_tier.tier, 'HIGH');
  assert.equal(r.body.assurance_controls.length, 15);
  assert.deepEqual(r.body.jurisdictions.processingCountries.sort(), ['BR', 'IN', 'PH', 'PL', 'US']);
  const texts = r.body.missing_items.map(m => m.text);
  assert.ok(texts.includes('Final cloud hosting and backup locations.'));
  assert.ok(texts.includes('Complete subprocessor chain.'));
  assert.ok(
    texts.some(t => /legal entities providing Poland, India, Brazil and Philippines support/.test(t)),
    texts.join(' | '),
  );
  assert.ok(
    r.body.missing_items.every(m => m.kind === 'evidence'),
    'no answer gaps in the example',
  );
  const stages = r.body.required_next_actions.map(a => a.stage);
  assert.deepEqual(
    stages,
    [2, 3, 3, 4, 6],
    'select vendor, vendor assessment, enhanced (tier above tolerance), contract, transfer',
  );
  assert.equal(r.body.current_status.code, 'READY_EVIDENCE_OUTSTANDING');
  assert.ok(
    !/compliant/i.test(JSON.stringify(r.body).replace(/not a compliance/gi, '')),
    'never "compliant"',
  );
  assert.equal(
    (
      await pool.query(
        `SELECT count(*)::int AS n FROM audit_events WHERE event = 'requirement_summary.issued' AND ref = $1`,
        [ref],
      )
    ).rows[0].n,
    1,
    'issued once',
  );
  await c('GET', `/assessments/${ref}`);
  assert.equal(
    (
      await pool.query(
        `SELECT count(*)::int AS n FROM audit_events WHERE event = 'requirement_summary.issued' AND ref = $1`,
        [ref],
      )
    ).rows[0].n,
    1,
    'viewing again does not re-issue',
  );
});

test('step 4: unknown answers and contradictions become buyer items; a correction updates the summary', async () => {
  const c = await signIn();
  const data = {
    ...EXAMPLE,
    assessmentTitle: 'Step 4 gaps',
    personalData: 'Unknown',
    storageCountries: ['US', 'UNKNOWN'],
    privilegedAccess: 'No',
  };
  const id = (await c('POST', '/requirements', { data })).body.requirement.id;
  const sub = await c('POST', `/requirements/${id}/submit`, {});
  assert.ok([200, 201].includes(sub.status));
  let s = sub.body.summary;
  const buyerItems = s.missingItems.filter(m => m.kind === 'answer').map(m => m.field);
  assert.ok(buyerItems.includes('personalData'));
  assert.ok(buyerItems.includes('storageCountries'));
  assert.ok(
    buyerItems.includes('privilegedAccess'),
    'contradiction: privileged No but identity systems listed',
  );
  assert.equal(s.currentStatus.code, 'INFORMATION_REQUIRED');
  assert.equal(s.requiredNextActions[0].action, 'correct');
  assert.ok(s.initialRiskTier.provisional);
  const r = await c('POST', `/assessments/${sub.body.assessment_id}/corrections`, {
    data: { ...EXAMPLE, assessmentTitle: 'Step 4 gaps' },
    reason: 'Answers confirmed with IT',
  });
  assert.equal(r.status, 201);
  s = r.body.summary;
  assert.equal(s.profileVersion, '1.1');
  assert.equal(s.missingItems.filter(m => m.kind === 'answer').length, 0);
  assert.equal(s.currentStatus.code, 'READY_EVIDENCE_OUTSTANDING');
  assert.ok(r.body.timeline.some(t => /gaps updated \(v1\.1\)/.test(t.title)));
});

test('step 4: low-risk requirement with no gaps is ready for vendor selection', async () => {
  const c = await signIn();
  const data = {
    ...EXAMPLE,
    assessmentTitle: 'Step 4 clean',
    serviceCategory: 'Software development',
    personalData: 'No',
    storageCountries: [],
    remoteAccessCountries: ['GB'],
    preferredCountries: ['GB'],
    privilegedAccess: 'No',
    systemsAccessed: ['Service desk / ticketing'],
    subprocessors: 'Prohibited',
    cloudServices: 'No',
    serviceCriticality: 'Medium',
    buyerSector: 'Retail',
  };
  const id = (await c('POST', '/requirements', { data })).body.requirement.id;
  const s = (await c('POST', `/requirements/${id}/submit`, {})).body.summary;
  assert.equal(s.missingItems.length, 0, JSON.stringify(s.missingItems));
  assert.equal(s.currentStatus.code, 'READY');
  assert.equal(s.currentStatus.label, 'Ready for vendor selection');
});
