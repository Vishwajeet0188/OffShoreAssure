/* Stage 1 · Step 2 rule pack: derives the system fields from a submitted requirement.
   PROVISIONAL: risk tier, data classification and pack selection follow the defaults proposed to Mukesh on 20 Oct 2026
   and must be confirmed by the client (and cross-checked by the internal legal team). Change them here only, and bump the version. */
import { UNKNOWN } from '../requirements/fields.js';
import { countryName } from '../reference/countries.js';

export const RULE_PACK_VERSION = 'RP-2026.10-S1-draft';

export const SERVICE_CODES = {
  'IT Support': 'IT_SUPPORT',
  'Software development': 'SOFTWARE_DEVELOPMENT',
  'Cloud / infrastructure operations': 'CLOUD_INFRASTRUCTURE',
  HR: 'HR',
  Payroll: 'PAYROLL',
  'Finance & accounting': 'FINANCE_ACCOUNTING',
  'Customer support': 'CUSTOMER_SUPPORT',
  'Data processing / back office': 'BACK_OFFICE',
  Other: 'OTHER',
};
export const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PERSONAL', 'SPECIAL_CATEGORY'];
export const RISK_TIERS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const EEA = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
];
const SECTOR_PACKS = {
  'Financial Services': 'SECTOR-UK-FCA-PRA',
  Healthcare: 'SECTOR-UK-HEALTH',
  'Public Sector': 'SECTOR-UK-PUBLIC',
};
const PRIVILEGED_SYSTEMS = [
  'Identity / directory (AD, Entra ID)',
  'Servers & infrastructure',
  'Cloud consoles',
  'Network & security tools',
  'Databases',
];

const yes = v => v === 'Yes';
const maybe = v => v === 'Yes' || v === 'Unknown';

/* Countries (other than the buyer's) where data is stored or accessed from. */
export function processingCountries(d) {
  const all = [...(d.storageCountries || []), ...(d.remoteAccessCountries || [])];
  return {
    known: [...new Set(all.filter(c => c !== UNKNOWN && c !== d.buyerCountry))],
    unknown: all.includes(UNKNOWN),
  };
}

export function derive(d) {
  const reasons = {};
  const pd = d.personalData;
  const { known: offshore, unknown: locUnknown } = processingCountries(d);
  const isOffshore = offshore.length > 0 || locUnknown;

  // Service code (taxonomy)
  const serviceCode = SERVICE_CODES[d.serviceCategory] || 'OTHER';

  // Data classification
  let classification, cls;
  if (yes(d.specialCategory) || yes(d.criminalOffence)) {
    classification = 'SPECIAL_CATEGORY';
    cls = yes(d.specialCategory)
      ? 'Special-category data involved.'
      : 'Criminal-offence data involved (handled with special-category controls).';
  } else if (maybe(pd)) {
    classification = 'PERSONAL';
    cls =
      pd === 'Yes'
        ? 'Personal data involved.'
        : 'Personal data status unknown: treated as personal until confirmed.';
  } else if (yes(d.privilegedAccess) || ['High', 'Critical'].includes(d.serviceCriticality)) {
    classification = 'CONFIDENTIAL';
    cls = 'No personal data, but privileged access or a high-criticality service.';
  } else {
    classification = 'INTERNAL';
    cls = 'No personal data and no privileged access.';
  }
  reasons.dataClassification = cls;

  // Preliminary risk tier
  let tier;
  const why = [];
  if (yes(d.specialCategory) || yes(d.criminalOffence)) {
    tier = 'CRITICAL';
    why.push(yes(d.specialCategory) ? 'special-category data' : 'criminal-offence data');
  } else if (d.serviceCriticality === 'Critical' && maybe(pd)) {
    tier = 'CRITICAL';
    why.push('critical service handling personal data');
  } else if (maybe(pd) && isOffshore && maybe(d.privilegedAccess)) {
    tier = 'HIGH';
    why.push(
      'personal data',
      'processed or accessed outside ' + countryName(d.buyerCountry || 'GB'),
      'privileged access',
    );
  } else if (d.serviceCriticality === 'Critical') {
    tier = 'HIGH';
    why.push('critical service');
  } else if (maybe(pd) || (isOffshore && maybe(d.privilegedAccess)) || d.serviceCriticality === 'High') {
    tier = 'MEDIUM';
    why.push(
      maybe(pd)
        ? 'personal data'
        : d.serviceCriticality === 'High'
          ? 'high-criticality service'
          : 'offshore privileged access',
    );
  } else {
    tier = 'LOW';
    why.push('no personal data, no offshore privileged access, low/medium criticality');
  }
  const provisional =
    [pd, d.privilegedAccess, d.specialCategory, d.criminalOffence].includes('Unknown') || locUnknown;
  reasons.riskTier = why.join(' + ') + (provisional ? ' (provisional: some answers are unknown)' : '');

  // Review flags
  const transferReview = maybe(pd) && isOffshore;
  reasons.transferReview = transferReview
    ? `Personal data may be stored in or accessed from ${offshore.map(countryName).join(', ') || 'unconfirmed locations'}${locUnknown && offshore.length ? ' and unconfirmed locations' : ''}.`
    : maybe(pd)
      ? 'All storage and access locations are in the buyer’s country.'
      : 'No personal data involved.';
  const contractReview =
    maybe(pd) ||
    ['Allowed', 'Approval required'].includes(d.subprocessors) ||
    ['High', 'Critical'].includes(d.serviceCriticality) ||
    d.buyerSector === 'Financial Services';
  reasons.contractReview = contractReview
    ? [
        maybe(pd) && 'processor terms for personal data',
        ['Allowed', 'Approval required'].includes(d.subprocessors) && 'subprocessor flow-down',
        ['High', 'Critical'].includes(d.serviceCriticality) && 'service criticality',
        d.buyerSector === 'Financial Services' && 'regulated-sector outsourcing terms',
      ]
        .filter(Boolean)
        .join(', ')
    : 'Low-criticality service with no personal data and no subprocessors.';
  const vendorAssessment = !(
    d.serviceCriticality === 'Low' &&
    pd === 'No' &&
    d.privilegedAccess === 'No' &&
    !isOffshore
  );
  reasons.vendorAssessment = vendorAssessment
    ? 'An external vendor will deliver the service; supplier assurance applies.'
    : 'Low-criticality service with no personal data, privileged access or offshore processing.';

  // Jurisdiction packs (country and sector rule sets to select)
  const packs = [];
  const bc = d.buyerCountry || 'GB';
  if (bc === 'GB') {
    packs.push('UK-GDPR', 'UK-DPA-2018');
  } else if (EEA.includes(bc)) packs.push('EU-GDPR');
  else packs.push('LOCAL-' + bc);
  if (transferReview)
    packs.push(bc === 'GB' ? 'UK-GDPR-CHAPTER-V' : EEA.includes(bc) ? 'EU-GDPR-CHAPTER-V' : 'TRANSFER-' + bc);
  for (const c of offshore) packs.push('COUNTRY-' + c);
  if (SECTOR_PACKS[d.buyerSector] && bc === 'GB') packs.push(SECTOR_PACKS[d.buyerSector]);
  if (yes(d.cloudServices)) packs.push('CLOUD-SERVICES');

  // Applicability screening (not a legal determination)
  const legal = [];
  if (bc === 'GB' && maybe(pd)) {
    legal.push(
      ['UK GDPR Art. 5', 'Data protection principles'],
      ['UK GDPR Art. 6', 'Lawful basis for processing'],
      ['UK GDPR Art. 28', 'Processor contract: the vendor processes on the buyer’s behalf'],
      ['UK GDPR Art. 30', 'Records of processing'],
      ['UK GDPR Art. 32', 'Security of processing'],
    );
    if (maybe(d.specialCategory))
      legal.push([
        'UK GDPR Art. 9',
        'Special-category data' + (d.specialCategory === 'Unknown' ? ' (to be confirmed)' : ''),
      ]);
    if (maybe(d.criminalOffence))
      legal.push([
        'UK GDPR Art. 10 / DPA 2018 Sch. 1',
        'Criminal-offence data' + (d.criminalOffence === 'Unknown' ? ' (to be confirmed)' : ''),
      ]);
    if (transferReview)
      legal.push(['UK GDPR Chapter V', 'International transfers / remote access from outside the UK']);
    legal.push(['Data Protection Act 2018', 'UK implementation and exemptions']);
  }
  if (SECTOR_PACKS[d.buyerSector] && bc === 'GB')
    legal.push([
      d.buyerSector === 'Financial Services'
        ? 'FCA SYSC 8 / PRA SS2/21'
        : d.buyerSector === 'Healthcare'
          ? 'Health and care data guidance'
          : 'Public sector security requirements',
      'Sector-specific outsourcing rules (overlay)',
    ]);

  // Buyer's stated risk tolerance compared with the preliminary tier
  const tolRank = { Low: 1, Medium: 2, High: 3 }[d.riskTolerance];
  const tierRank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[tier];
  if (tolRank && tierRank > tolRank)
    reasons.riskTolerance = `The preliminary tier (${tier.toLowerCase()}) is above the buyer's stated risk tolerance (${d.riskTolerance.toLowerCase()}): enhanced assessment applies.`;

  return {
    serviceCode,
    dataClassification: classification,
    riskTier: tier,
    riskProvisional: provisional,
    vendorAssessmentRequired: vendorAssessment,
    contractReviewRequired: contractReview,
    transferReviewRequired: transferReview,
    jurisdictionPacks: [...new Set(packs)],
    rulePackVersion: RULE_PACK_VERSION,
    reasons,
    legalScreening: legal.map(([provision, why]) => ({ provision, why })),
  };
}

/* Answers that need clarification before final determinations (validation status INCOMPLETE). */
export function clarifications(d) {
  const out = [];
  if (d.personalData === 'Unknown')
    out.push({
      field: 'personalData',
      reason: 'Personal data status unknown: no final privacy conclusion until confirmed.',
    });
  if (d.specialCategory === 'Unknown')
    out.push({ field: 'specialCategory', reason: 'Special-category data status unknown.' });
  if (d.criminalOffence === 'Unknown')
    out.push({ field: 'criminalOffence', reason: 'Criminal-offence data status unknown.' });
  if ((d.storageCountries || []).includes(UNKNOWN))
    out.push({
      field: 'storageCountries',
      reason: 'Storage location unknown: needed for the transfer determination.',
    });
  if ((d.remoteAccessCountries || []).includes(UNKNOWN))
    out.push({
      field: 'remoteAccessCountries',
      reason: 'Remote access location unknown: needed for the transfer determination.',
    });
  if (d.privilegedAccess === 'Unknown')
    out.push({ field: 'privilegedAccess', reason: 'Privileged access unknown: clarification requested.' });
  if (d.cloudServices === 'Unknown')
    out.push({
      field: 'cloudServices',
      reason: 'Cloud services unknown: the cloud questionnaire cannot be scoped.',
    });
  return out;
}

/* Contradictory or inconsistent answers. They are reported (not blocking) so the buyer can correct them. */
export function contradictions(d, today = new Date()) {
  const out = [];
  const add = (fields, message) => out.push({ fields, message });
  if (['HR', 'Payroll'].includes(d.serviceCategory) && d.personalData === 'No')
    add(
      ['serviceCategory', 'personalData'],
      `${d.serviceCategory} services normally involve personal data, but personal data is answered "No".`,
    );
  if (d.deliveryModel === 'Onsite' && (d.remoteAccessCountries || []).length)
    add(
      ['deliveryModel', 'remoteAccessCountries'],
      'Delivery is onsite, but remote access countries are listed.',
    );
  if (d.privilegedAccess === 'No' && (d.systemsAccessed || []).some(s => PRIVILEGED_SYSTEMS.includes(s)))
    add(
      ['privilegedAccess', 'systemsAccessed'],
      'Privileged access is "No", but administrative systems (identity, servers, cloud consoles, network or databases) are listed.',
    );
  if (d.subprocessors === 'Prohibited' && d.cloudServices === 'Yes')
    add(
      ['subprocessors', 'cloudServices'],
      'Subprocessors are prohibited, but cloud services are involved (a cloud provider usually acts as a subprocessor).',
    );
  const restricted = d.restrictedCountries || [];
  for (const key of ['preferredCountries', 'storageCountries', 'remoteAccessCountries']) {
    const hit = (d[key] || []).filter(c => restricted.includes(c));
    if (hit.length)
      add(
        [key, 'restrictedCountries'],
        `${hit.map(countryName).join(', ')} ${hit.length > 1 ? 'are' : 'is'} both restricted and listed under ${key === 'preferredCountries' ? 'preferred countries' : key === 'storageCountries' ? 'storage locations' : 'remote access countries'}.`,
      );
  }
  if (d.startDate && d.startDate < today.toISOString().slice(0, 10))
    add(['startDate'], 'The planned start date is in the past.');
  return out;
}
