/* Stage 2 · vendor records shared by the three routes.
   A vendor is always an organisations row (kind 'vendor'), so Stage 3 and later stages work the same way
   whichever route the buyer used. Every profile change is kept in vendor_profile_versions.            */
import crypto from 'node:crypto';

const stable = v =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, stable(v[k])]),
        )
      : v;
export const sha256 = o =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(o)))
    .digest('hex');

const num = x => (x == null ? null : Number(x));

/* The profile of a self-registered vendor, as stored in a profile version. */
export const ownProfileOf = o => ({
  legalName: o.name,
  registrationNumber: o.registration_number,
  registeredCountry: o.country,
  website: o.website,
  serviceDescription: o.description,
  services: o.services || [],
  deliveryCountries: o.delivery_countries || [],
  deliveryModel: o.delivery_model,
  industries: o.industries || [],
  staffCount: o.staff_count,
  foundedYear: o.founded_year,
  certifications: o.certifications || [],
  insuranceCover: num(o.insurance_cover),
  insuranceCurrency: o.insurance_currency,
  supportHours: o.support_hours,
  languages: o.languages || [],
  minAnnualValue: num(o.min_annual_value),
  valueCurrency: o.value_currency,
  usesSubprocessors: o.uses_subprocessors,
});

/* Adds a profile version (append-only) and moves the organisation's version counter on. */
export async function saveProfileVersion(db, vendorId, profile, userId, note) {
  const version = (
    await db.query(
      'SELECT coalesce(max(version), 0) + 1 AS v FROM vendor_profile_versions WHERE vendor_id = $1',
      [vendorId],
    )
  ).rows[0].v;
  await db.query(
    `INSERT INTO vendor_profile_versions (vendor_id, version, profile, changed_by, change_note, sha256) VALUES ($1,$2,$3,$4,$5,$6)`,
    [vendorId, version, JSON.stringify(profile), userId || null, note || null, sha256(profile)],
  );
  await db.query('UPDATE organisations SET profile_version = $2 WHERE id = $1', [vendorId, version]);
  return version;
}

export async function latestProfile(db, vendorId) {
  return (
    (
      await db.query(
        'SELECT version, profile, changed_at FROM vendor_profile_versions WHERE vendor_id = $1 ORDER BY version DESC LIMIT 1',
        [vendorId],
      )
    ).rows[0] || null
  );
}

/* What the Step 6 engine needs to know about a vendor. `org` is an organisations row. */
export async function vendorView(db, org) {
  const buyerAdded = org.source === 'buyer_provided';
  const latest = buyerAdded ? await latestProfile(db, org.id) : null;
  const p = latest?.profile || {};
  const docs = (
    await db.query(
      'SELECT id, doc_type, file_name, size_bytes, sha256, uploaded_at FROM buyer_vendor_documents WHERE vendor_id = $1 ORDER BY uploaded_at',
      [org.id],
    )
  ).rows;
  const completed = (
    await db.query(
      `SELECT count(*)::int AS n FROM compliance_assessments WHERE vendor_id = $1 AND status = 'submitted'`,
      [org.id],
    )
  ).rows[0].n;
  return {
    id: org.id,
    name: org.name,
    source: buyerAdded ? 'BUYER_PROVIDED' : 'DIRECTORY',
    verificationStatus: org.verification_status,
    verifiedAt: org.verified_at,
    tradingName: p.tradingName || null,
    registrationNumber: org.registration_number,
    registeredCountry: org.country,
    registeredAddress: p.registeredAddress || null,
    website: org.website,
    description: org.description,
    services: org.services || [],
    deliveryCountries: org.delivery_countries || [],
    remoteAccessCountries: buyerAdded ? p.remoteAccessCountries || null : null,
    hostingCountries: buyerAdded ? p.hostingCountries || null : null,
    deliveryModel: org.delivery_model,
    industries: org.industries || [],
    staffCount: org.staff_count,
    foundedYear: org.founded_year,
    certifications: org.certifications || [],
    insuranceCover: num(org.insurance_cover),
    insuranceCurrency: org.insurance_currency,
    supportHours: org.support_hours,
    languages: org.languages || [],
    minAnnualValue: num(org.min_annual_value),
    valueCurrency: org.value_currency,
    usesSubprocessors: org.uses_subprocessors,
    contact: buyerAdded
      ? { name: p.contactName, email: org.contact_email, role: p.contactRole, phone: p.contactPhone || null }
      : null,
    contractRelationship: p.contractRelationship || null,
    processingRole: p.processingRole || null,
    personalDataAccess: p.personalDataAccess || null,
    serviceCriticality: p.serviceCriticality || null,
    supplierStatus: p.supplierStatus || null,
    onboardingNotes: p.onboardingNotes || null,
    documents: {
      contract: docs.some(d => d.doc_type === 'contract'),
      dpa: docs.some(d => d.doc_type === 'dpa'),
      files: docs.map(d => ({
        id: d.id,
        type: d.doc_type,
        fileName: d.file_name,
        size: d.size_bytes,
        sha256: d.sha256,
        uploadedAt: d.uploaded_at,
      })),
    },
    profileVersion: org.profile_version,
    completedAssessments: completed,
  };
}

/* Route B: creates the buyer's own vendor (UNVERIFIED, owned by the buyer) and its first profile version. */
export async function createBuyerVendor(db, buyerId, values, userId) {
  const o = (
    await db.query(
      `INSERT INTO organisations (kind, source, owner_buyer_id, name, registration_number, country, website, description, services, delivery_countries,
        contact_email, uses_subprocessors, certifications, verification_status, profile_version)
     VALUES ('vendor', 'buyer_provided', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unverified', 1) RETURNING *`,
      [
        buyerId,
        values.legalName,
        values.registrationNumber || null,
        values.registeredCountry,
        values.website || null,
        values.serviceDescription,
        [values.serviceCategory],
        values.deliveryCountries,
        values.contactEmail,
        values.subprocessorsUsed,
        values.certificationsClaimed || [],
      ],
    )
  ).rows[0];
  await saveProfileVersion(db, o.id, values, userId, 'Added by the buyer (Route B)');
  return (await db.query('SELECT * FROM organisations WHERE id = $1', [o.id])).rows[0];
}

/* Possible duplicates of a vendor the buyer is about to add: its own vendors and directory vendors with the same name or registration. */
export async function possibleDuplicates(db, buyerId, values) {
  return (
    await db.query(
      `SELECT id, name, country, source, registration_number FROM organisations
      WHERE kind = 'vendor' AND (source = 'self_registered' OR owner_buyer_id = $1)
        AND (lower(name) = lower($2) OR (registration_number IS NOT NULL AND upper(registration_number) = upper($3) AND country = $4))
      LIMIT 5`,
      [buyerId, values.legalName, values.registrationNumber || '', values.registeredCountry],
    )
  ).rows.map(r => ({
    id: r.id,
    name: r.name,
    country: r.country,
    source: r.source === 'buyer_provided' ? 'BUYER_PROVIDED' : 'DIRECTORY',
    registrationNumber: r.registration_number,
  }));
}

/* Route C: vendors the buyer's organisation added itself or selected in an earlier assessment. */
export async function existingVendors(db, buyerId) {
  const rows = (
    await db.query(
      `SELECT o.*, (SELECT max(s.selected_at) FROM vendor_selections s JOIN assessments a ON a.id = s.assessment_id WHERE a.buyer_id = $1 AND s.vendor_id = o.id) AS last_selected,
            (SELECT count(*)::int FROM vendor_selections s JOIN assessments a ON a.id = s.assessment_id WHERE a.buyer_id = $1 AND s.vendor_id = o.id) AS times_selected
       FROM organisations o
      WHERE o.kind = 'vendor' AND (o.owner_buyer_id = $1 OR o.id IN (SELECT s.vendor_id FROM vendor_selections s JOIN assessments a ON a.id = s.assessment_id WHERE a.buyer_id = $1))
      ORDER BY lower(o.name)`,
      [buyerId],
    )
  ).rows;
  return rows.map(o => ({
    id: o.id,
    name: o.name,
    country: o.country,
    services: o.services || [],
    source: o.source === 'buyer_provided' ? 'BUYER_PROVIDED' : 'DIRECTORY',
    verificationStatus: o.verification_status,
    profileVersion: o.profile_version,
    lastSelectedAt: o.last_selected,
    timesSelected: o.times_selected,
  }));
}

/* Fields whose change matters when a saved vendor is reused (Route C). */
const MATERIAL = [
  ['legalName', 'Legal name'],
  ['registrationNumber', 'Registration number'],
  ['registeredCountry', 'Registered country'],
  ['services', 'Services'],
  ['serviceCategory', 'Service category'],
  ['deliveryCountries', 'Delivery countries'],
  ['remoteAccessCountries', 'Remote access countries'],
  ['hostingCountries', 'Hosting countries'],
  ['processingRole', 'Processing role'],
  ['personalDataAccess', 'Personal-data access'],
  ['subprocessorsUsed', 'Subprocessors used'],
  ['usesSubprocessors', 'Subprocessors used'],
  ['certifications', 'Certifications'],
  ['certificationsClaimed', 'Certifications claimed'],
  ['contactEmail', 'Contact email'],
];
export function materialChanges(before, after) {
  if (!before) return [];
  const norm = x => (Array.isArray(x) ? (x.length ? [...x].sort() : null) : (x ?? null));
  const same = (x, y) => JSON.stringify(norm(x)) === JSON.stringify(norm(y));
  return MATERIAL.filter(([k]) => (k in before || k in after) && !same(before[k], after[k])).map(
    ([k, label]) => ({ field: k, label, before: before[k] ?? null, after: after[k] ?? null }),
  );
}

/* The profile version used the last time this buyer selected the vendor (for Route C's change check). */
export async function profileAtLastSelection(db, buyerId, vendorId) {
  const s = (
    await db.query(
      `SELECT s.vendor_profile_version FROM vendor_selections s JOIN assessments a ON a.id = s.assessment_id
      WHERE a.buyer_id = $1 AND s.vendor_id = $2 ORDER BY s.selected_at DESC LIMIT 1`,
      [buyerId, vendorId],
    )
  ).rows[0];
  if (!s?.vendor_profile_version) return null;
  return (
    (
      await db.query(
        'SELECT version, profile FROM vendor_profile_versions WHERE vendor_id = $1 AND version = $2',
        [vendorId, s.vendor_profile_version],
      )
    ).rows[0] || null
  );
}
