/* Stage 1 · Step 3 — Save requirement profile and timeline (Engine → Evidence Record).
   Saves the profile as a versioned snapshot (15 stored fields), generates the initial assessment timeline and records an audit event.
   A saved version is never overwritten: corrections create a new version (1.1, 1.2, …). */
import crypto from 'node:crypto';
import { audit } from '../audit.js';
import { CONTROLS, applicableControls } from '../engine/controls.js';
import { derive, clarifications, contradictions, RULE_PACK_VERSION } from '../engine/rulepack.js';
import { STAGES } from '../engine/stages.js';
import { requirementSummary } from '../engine/gaps.js';
import { FIELDS } from '../requirements/fields.js';

export const stable = v =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, stable(v[k])]),
        )
      : v;
const sha256 = obj =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(obj)))
    .digest('hex');
const nextVersion = v => {
  const [a, b] = v.split('.').map(Number);
  return `${a}.${b + 1}`;
};

/* Machine-readable profile: codes and ISO values grouped by area. */
export function normalise(d, derived) {
  return {
    buyer: {
      legalName: d.buyerLegalName,
      registrationNumber: d.companyRegNumber || null,
      country: d.buyerCountry,
      sector: d.buyerSector,
      contactEmail: d.buyerContactEmail,
    },
    service: {
      title: d.assessmentTitle,
      code: derived.serviceCode,
      description: d.serviceDescription,
      objective: d.businessObjective,
      criticality: d.serviceCriticality?.toUpperCase(),
      deliveryModel: d.deliveryModel?.toUpperCase(),
      supportHours: d.supportHours,
    },
    commercial: {
      preferredCountries: d.preferredCountries || [],
      restrictedCountries: d.restrictedCountries || [],
      startDate: d.startDate || null,
      durationMonths: d.contractDuration ?? null,
      annualBudget: d.estimatedBudget ?? null,
      currency: d.currency || null,
    },
    personalData: {
      involved: d.personalData,
      dataSubjects: d.dataSubjectCategories || [],
      categories: d.personalDataCategories || [],
      specialCategory: d.specialCategory || null,
      criminalOffence: d.criminalOffence || null,
      approxRecords: d.dataVolume ?? null,
      classification: derived.dataClassification,
    },
    access: {
      privileged: d.privilegedAccess,
      systems: d.systemsAccessed || [],
      systemsOther: d.systemsAccessedOther || null,
      storageCountries: d.storageCountries || [],
      remoteAccessCountries: d.remoteAccessCountries || [],
      subprocessors: d.subprocessors,
      cloudServices: d.cloudServices,
    },
    assurance: { requirements: d.assuranceRequirements || [], riskTolerance: d.riskTolerance },
    derived: {
      riskTier: derived.riskTier,
      riskProvisional: derived.riskProvisional,
      vendorAssessmentRequired: derived.vendorAssessmentRequired,
      contractReviewRequired: derived.contractReviewRequired,
      transferReviewRequired: derived.transferReviewRequired,
    },
  };
}

/* Validation findings: one line per engine check, result pass / fail / unknown. */
export function validationFindings(d, { duplicateOf } = {}) {
  const cl = clarifications(d),
    cx = contradictions(d);
  const known = (field, check) => ({ check, result: cl.some(c => c.field === field) ? 'unknown' : 'pass' });
  return [
    { check: 'Required and conditional fields complete', result: 'pass' },
    { check: 'Formats, dates and country codes valid', result: 'pass' },
    { check: 'Buyer belongs to the authenticated organisation', result: 'pass' },
    known('personalData', 'Personal-data status known'),
    known('specialCategory', 'Special-category status known'),
    known('criminalOffence', 'Criminal-offence status known'),
    {
      check: 'Storage and access locations known',
      result: cl.some(c => ['storageCountries', 'remoteAccessCountries'].includes(c.field))
        ? 'unknown'
        : 'pass',
    },
    known('privilegedAccess', 'Privileged access known'),
    known('cloudServices', 'Cloud services known'),
    {
      check: 'No contradictory answers',
      result: cx.length ? 'fail' : 'pass',
      detail: cx.map(c => c.message),
    },
    {
      check: 'No country conflicts',
      result: cx.some(c => c.fields.includes('restrictedCountries')) ? 'fail' : 'pass',
    },
    {
      check: 'Not a duplicate submission',
      result: duplicateOf ? 'fail' : 'pass',
      detail: duplicateOf ? ['Similar to ' + duplicateOf] : [],
    },
  ];
}

async function documents(db, requirementId) {
  const docs = (
    await db.query(
      'SELECT id, doc_type, file_name, size_bytes, sha256, uploaded_at FROM requirement_documents WHERE requirement_id = $1 ORDER BY uploaded_at',
      [requirementId],
    )
  ).rows;
  return docs.map(x => ({
    id: x.id,
    type: x.doc_type,
    fileName: x.file_name,
    size: x.size_bytes,
    sha256: x.sha256,
    uploadedAt: x.uploaded_at,
  }));
}

/* Saves one profile version (inside the caller's transaction). */
export async function saveProfile(
  db,
  req,
  { assessment, requirement, data, original, version = '1.0', previous = null, changeReason = null, userId },
) {
  const derived = derive(data);
  const controls = applicableControls(data, derived);
  const docs = await documents(db, requirement.id);
  const normalised = normalise(data, derived);
  const missing =
    (assessment.missing_fields || []).length && version === '1.0'
      ? assessment.missing_fields
      : clarifications(data);
  const p = (
    await db.query(
      `INSERT INTO requirement_profiles (assessment_id, version, original_submission, normalised_requirement, rule_pack_ids, rule_pack_versions, control_ids, created_by,
       source_documents, document_hashes, validation_findings, missing_information, previous_version, change_reason, snapshot_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        assessment.id,
        version,
        JSON.stringify(original),
        JSON.stringify(normalised),
        derived.jurisdictionPacks,
        derived.jurisdictionPacks.map(() => RULE_PACK_VERSION),
        controls.map(c => c.id),
        userId || req.user.id,
        JSON.stringify(docs),
        docs.map(x => x.sha256),
        JSON.stringify({
          checks: validationFindings(data, { duplicateOf: assessment.findings?.duplicateOf }),
          controls,
        }),
        JSON.stringify(missing),
        previous,
        changeReason,
        sha256(normalised),
      ],
    )
  ).rows[0];
  await audit(req, 'requirement_profile.saved', {
    db,
    stage: 'stage-1',
    ref: assessment.reference,
    actor: userId && userId !== req.user?.id ? { id: userId } : null,
    detail: {
      reference: assessment.reference,
      profileId: p.id,
      version,
      controls: controls.length,
      documents: docs.length,
      snapshotSha256: p.snapshot_sha256,
      changeReason,
    },
  });
  return { profile: p, derived, controls };
}

/* Initial assessment timeline: Steps 1–3 done, Step 4 next, then the remaining stages in diagram order (no dates are invented). */
export async function initialTimeline(db, assessment, requirement, profile) {
  const ev = (stage, step, title, at, detail = {}) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',$2,$3,$4,'done',$5,$6)`,
      [assessment.id, stage, step, title, at, JSON.stringify(detail)],
    );
  const ms = (stage, step, title, status) =>
    db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status) VALUES ($1,'milestone',$2,$3,$4,$5)`,
      [assessment.id, stage, step, title, status],
    );
  await ev(1, 1, 'Outsourcing requirement submitted', requirement.submitted_at || assessment.created_at, {
    requirementId: requirement.id,
  });
  await ev(1, 2, `Fields validated, Assessment ID ${assessment.reference} created`, assessment.created_at, {
    validationStatus: assessment.validation_status,
  });
  await ev(1, 3, `Requirement profile v${profile.version} saved`, profile.created_at, {
    profileId: profile.id,
  });
  await ms(1, 4, 'Requirement profile and gaps shared with the buyer', 'next');
  for (const [n, title] of STAGES.slice(1)) await ms(n, null, title, 'pending');
}

/* Creates profile v1.0 + timeline for an assessment that does not have one yet (new submissions, and assessments created before Step 3). */
export async function ensureProfile(db, req, assessmentId) {
  const a = (await db.query('SELECT * FROM assessments WHERE id = $1', [assessmentId])).rows[0];
  if (!a) return null;
  let profile = (
    await db.query(
      'SELECT * FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [a.id],
    )
  ).rows[0];
  if (!profile) {
    const r = (await db.query('SELECT * FROM requirements WHERE id = $1', [a.requirement_id])).rows[0];
    ({ profile } = await saveProfile(db, req, {
      assessment: a,
      requirement: r,
      data: r.data,
      original: r.data,
      userId: a.created_by,
    }));
    await initialTimeline(db, a, r, profile);
  }
  await issueSummary(db, req, a);
  return profile;
}

/* Step 4: the engine builds the "Information Required" summary from the latest profile and shares it with the buyer.
   Recorded once on the timeline and in the audit log (assessments created before Step 4 get it on first view). */
export async function issueSummary(db, req, a, { update = false } = {}) {
  if (!update) {
    const m = (
      await db.query(
        `SELECT id FROM assessment_timeline WHERE assessment_id = $1 AND stage = 1 AND step = 4 AND status = 'next' FOR UPDATE`,
        [a.id],
      )
    ).rows[0];
    if (!m) return null;
  }
  const s = await buildSummary(db, a.id);
  if (update) {
    await db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',1,4,$2,'done',now(),$3)`,
      [
        a.id,
        `Requirement profile and gaps updated (v${s.profileVersion})`,
        JSON.stringify({ status: s.currentStatus.code, missingItems: s.missingItems.length }),
      ],
    );
  } else {
    await db.query(
      `UPDATE assessment_timeline SET kind = 'event', status = 'done', at = now(), detail = $2 WHERE assessment_id = $1 AND stage = 1 AND step = 4 AND status = 'next'`,
      [a.id, JSON.stringify({ status: s.currentStatus.code, missingItems: s.missingItems.length })],
    );
    await db.query(
      `UPDATE assessment_timeline SET status = 'next' WHERE assessment_id = $1 AND stage = 2 AND step IS NULL AND status = 'pending'`,
      [a.id],
    );
  }
  await audit(req, 'requirement_summary.issued', {
    db,
    stage: 'stage-1',
    ref: a.reference,
    actor: req.user ? null : { id: a.created_by },
    detail: {
      reference: a.reference,
      version: s.profileVersion,
      status: s.currentStatus.code,
      missingItems: s.missingItems.length,
      nextActions: s.requiredNextActions.length,
      update,
    },
  });
  return s;
}

/* The 10 Step 4 output fields for an assessment, from its latest profile version. */
export async function buildSummary(db, assessmentId) {
  const a = (
    await db.query(
      'SELECT a.*, o.name AS buyer_name, sv.name AS selected_vendor FROM assessments a JOIN organisations o ON o.id = a.buyer_id LEFT JOIN organisations sv ON sv.id = a.selected_vendor_id WHERE a.id = $1',
      [assessmentId],
    )
  ).rows[0];
  const p = (
    await db.query(
      'SELECT * FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [assessmentId],
    )
  ).rows[0];
  if (!a || !p) return null;
  const d = p.original_submission;
  return requirementSummary({
    a,
    d,
    derived: derive(d),
    controls: p.validation_findings?.controls || [],
    profileVersion: p.version,
    buyerName: a.buyer_name,
    selectedVendor: a.selected_vendor || null,
  });
}

/* Correction: a new profile version. The assessment keeps its ID; its derived fields follow the latest version. */
export async function correctProfile(db, req, { assessment, requirement, evaluation, reason }) {
  const latest = (
    await db.query(
      'SELECT * FROM requirement_profiles WHERE assessment_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
      [assessment.id],
    )
  ).rows[0];
  const version = nextVersion(latest.version);
  const { profile, derived } = await saveProfile(db, req, {
    assessment,
    requirement,
    data: evaluation.values,
    original: evaluation.values,
    version,
    previous: latest.id,
    changeReason: reason,
  });
  await db.query('UPDATE requirements SET data = $2, title = $3, updated_at = now() WHERE id = $1', [
    requirement.id,
    JSON.stringify(evaluation.values),
    evaluation.values.assessmentTitle,
  ]);
  await db.query(
    `UPDATE assessments SET requirement_version = $2, service_code = $3, data_classification = $4, risk_tier = $5, jurisdiction_packs = $6, vendor_assessment_required = $7,
      contract_review_required = $8, transfer_review_required = $9, validation_status = $10, missing_fields = $11,
      findings = findings || $12::jsonb WHERE id = $1`,
    [
      assessment.id,
      version,
      derived.serviceCode,
      derived.dataClassification,
      derived.riskTier,
      derived.jurisdictionPacks,
      derived.vendorAssessmentRequired,
      derived.contractReviewRequired,
      derived.transferReviewRequired,
      evaluation.status,
      JSON.stringify(evaluation.missing),
      JSON.stringify({
        reasons: derived.reasons,
        riskProvisional: derived.riskProvisional,
        legalScreening: derived.legalScreening,
        contradictions: evaluation.contradictions,
        flags: evaluation.flags,
      }),
    ],
  );
  await db.query(
    `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1,'event',1,3,$2,'done',now(),$3)`,
    [
      assessment.id,
      `Requirement corrected: profile v${version} saved`,
      JSON.stringify({ profileId: profile.id, reason }),
    ],
  );
  return profile;
}

export function shapeProfile(p) {
  return {
    id: p.id,
    assessmentId: p.assessment_id,
    version: p.version,
    originalSubmission: p.original_submission,
    normalisedRequirement: p.normalised_requirement,
    rulePackIds: p.rule_pack_ids,
    rulePackVersions: p.rule_pack_versions,
    controlIds: p.control_ids,
    createdAt: p.created_at,
    createdBy: p.created_by,
    sourceDocuments: p.source_documents,
    documentHashes: p.document_hashes,
    validationFindings: p.validation_findings,
    missingInformation: p.missing_information,
    previousVersion: p.previous_version,
    changeReason: p.change_reason,
    snapshotSha256: p.snapshot_sha256,
  };
}

export async function loadProfiles(db, assessmentId) {
  const versions = (
    await db.query(
      `SELECT p.*, u.email AS created_by_email FROM requirement_profiles p JOIN users u ON u.id = p.created_by WHERE assessment_id = $1 ORDER BY p.created_at, p.id`,
      [assessmentId],
    )
  ).rows;
  const timeline = (
    await db.query(
      "SELECT kind, stage, step, title, status, at, detail FROM assessment_timeline WHERE assessment_id = $1 ORDER BY (status = 'done') DESC, (status = 'next') DESC, stage, step NULLS LAST, at NULLS LAST, id",
      [assessmentId],
    )
  ).rows;
  return {
    profiles: versions.map(p => ({ ...shapeProfile(p), createdByEmail: p.created_by_email })),
    timeline,
    controlCatalogue: CONTROLS,
    summary: await buildSummary(db, assessmentId),
  };
}
// Fields list re-exported for the UI labels of original submissions.
export const FIELD_LABELS = Object.fromEntries(FIELDS.map(f => [f.key, f.label]));
