/* Stage 2 · Step 6 — Match service, location and scope (Engine), and the fit score used in Step 7.

   One function, assessFit(), checks a vendor against the buyer's requirement and returns a VendorFitAssessment:
   eligibility, the requirements it matches, the information still missing, and the review status.

   Directory vendors were verified by OffshoreAssure. A vendor the buyer added itself is checked the same way,
   but its answers are the buyer's and stay "preliminary, unverified" until Stage 3.

   Rules from the client spec (Stage 2 Inputs and Outputs, v2):
   - Missing verification is not the same as a confirmed failure ("missing", never "fail").
   - Hard exclusions (the buyer's restricted countries, a rejected verification) stay visible and cannot be
     outweighed by the fit score.
   - The fit score is a ranking aid, not a legal compliance score, and is only used to compare directory vendors.

   Rule pack RP-2026.10-S2-v2-draft. The weights below are the example configuration from the spec.          */
import { UNKNOWN } from '../requirements/fields.js';
import { countryName } from '../reference/countries.js';

export const FIT_RULE_PACK = 'RP-2026.10-S2-v2-draft';

export const WEIGHTS = [
  { id: 'service', criterion: 'Service capability', weight: 30 },
  { id: 'security', criterion: 'Security assurance', weight: 25 },
  { id: 'geography', criterion: 'Geography and delivery', weight: 20 },
  { id: 'sector', criterion: 'Sector experience', weight: 15 },
  { id: 'commercial', criterion: 'Commercial fit', weight: 10 },
];
export const SCORE_NOTE = 'Fit score for ranking directory vendors. It is not a legal compliance score.';

export const ELIGIBILITY = { ELIGIBLE: 'ELIGIBLE', WITH_GAPS: 'ELIGIBLE_WITH_GAPS', EXCLUDED: 'EXCLUDED' };

// Stage 1 assurance answers that name a certification.
const REQUIRED_CERTS = {
  'ISO 27001 certification': ['ISO 27001'],
  'SOC 2 Type II report': ['SOC 2 Type II'],
  'Cyber Essentials / Plus': ['Cyber Essentials', 'Cyber Essentials Plus'],
};

const names = codes => codes.map(c => (c === UNKNOWN ? 'Unknown' : countryName(c))).join(', ');
const known = list => (list || []).filter(c => c !== UNKNOWN);
const hasUnknown = list => (list || []).includes(UNKNOWN);

/**
 * @param d  requirement answers (Stage 1)
 * @param v  vendor view: see vendorView() in selection/vendors.js
 * @param criteria  optional Route A search criteria (certification preferences, support hours, budget, …)
 */
export function assessFit(d, v, criteria = {}) {
  const buyerAdded = v.source === 'BUYER_PROVIDED';
  const checks = [];
  const add = (id, check, result, detail, extra = {}) => checks.push({ id, check, result, detail, ...extra });

  const delivery = v.deliveryCountries || [];
  const access = v.remoteAccessCountries; // null = not stated
  const hosting = v.hostingCountries; // null = not stated
  const restricted = d.restrictedCountries || [];

  // 1. Legal entity identity
  if (v.verificationStatus === 'approved')
    add('identity', 'Legal entity identity', 'pass', 'Identity and registration checked by OffshoreAssure.');
  else if (v.verificationStatus === 'rejected')
    add('identity', 'Legal entity identity', 'fail', 'OffshoreAssure could not verify this company.', {
      hard: true,
    });
  else if (buyerAdded)
    add(
      'identity',
      'Legal entity identity',
      'missing',
      v.registrationNumber
        ? `Entered by your organisation (registration ${v.registrationNumber}). Verification requested.`
        : 'Entered by your organisation without a registration number. Verification requested.',
      { request: 'Verify the legal entity and registration number.' },
    );
  else
    add('identity', 'Legal entity identity', 'missing', 'Waiting for OffshoreAssure verification.', {
      request: 'Wait for OffshoreAssure to verify the company.',
    });

  // 2. Service capability
  if ((v.services || []).includes(d.serviceCategory))
    add(
      'service',
      'Service capability',
      'pass',
      `${buyerAdded ? 'Service provided' : 'Declares'} "${d.serviceCategory}".`,
    );
  else if (d.serviceCategory === 'Other' || (v.services || []).includes('Other'))
    add(
      'service',
      'Service capability',
      'partial',
      'The service is "Other": compare the service description with your requirement.',
    );
  else
    add(
      'service',
      'Service capability',
      'fail',
      `${buyerAdded ? 'Service entered as' : 'Declares'} ${(v.services || []).join(', ') || 'no services'}, not "${d.serviceCategory}".`,
    );

  // 3. Delivery country: from a preferred country?
  const preferred = d.preferredCountries || [];
  const inPreferred = delivery.filter(c => preferred.includes(c));
  if (!delivery.length)
    add('delivery', 'Delivery country', 'missing', 'No delivery countries given.', {
      request: 'Confirm the delivery countries.',
    });
  else if (!preferred.length)
    add(
      'delivery',
      'Delivery country',
      'pass',
      `Delivers from ${names(delivery)}. No preferred countries were given.`,
    );
  else if (inPreferred.length)
    add('delivery', 'Delivery country', 'pass', `Delivers from ${names(inPreferred)} (preferred).`);
  else
    add(
      'delivery',
      'Delivery country',
      'partial',
      `Delivers from ${names(delivery)}; your preferred countries are ${names(preferred)}.`,
    );

  // 4. Data access locations
  const needed = known(d.remoteAccessCountries).filter(c => c !== d.buyerCountry);
  if (buyerAdded) {
    const stated = [...known(access), ...known(hosting)];
    if ((access && hasUnknown(access)) || (hosting && hasUnknown(hosting)))
      add('access', 'Data access locations', 'missing', 'Some access or hosting locations are "Unknown".', {
        request: 'Ask the vendor to confirm where data is accessed and hosted.',
      });
    else if (access == null && hosting == null)
      add(
        'access',
        'Data access locations',
        v.personalDataAccess === 'No' ? 'pass' : 'missing',
        v.personalDataAccess === 'No'
          ? 'No personal-data access expected.'
          : 'Access and hosting locations not given.',
        { request: 'Ask the vendor where data is accessed and hosted.' },
      );
    else
      add(
        'access',
        'Data access locations',
        'pass',
        `Access from ${names(known(access)) || 'no other country'}; hosting in ${names(known(hosting)) || 'no stated country'}.`,
        { countries: stated },
      );
  } else {
    const notCovered = needed.filter(c => !delivery.includes(c));
    if (!needed.length)
      add('access', 'Data access locations', 'pass', 'No remote access from outside your country.');
    else if (!notCovered.length)
      add('access', 'Data access locations', 'pass', `Covers your access countries (${names(needed)}).`);
    else
      add(
        'access',
        'Data access locations',
        'partial',
        `Does not list ${names(notCovered)} among its delivery countries.`,
      );
  }

  // 5. Certifications (claims only: evidence is checked in Stage 3)
  const wanted = [
    ...new Set([
      ...(d.assuranceRequirements || [])
        .flatMap(a => (REQUIRED_CERTS[a] ? [REQUIRED_CERTS[a]] : []))
        .map(group => group.join(' or ')),
      ...(criteria.certifications || []),
    ]),
  ];
  const claimed = v.certifications || [];
  const meets = w => w.split(' or ').some(c => claimed.includes(c));
  const met = wanted.filter(meets);
  if (!wanted.length)
    add(
      'certifications',
      'Certifications',
      claimed.length ? 'pass' : 'info',
      claimed.length
        ? `Claims ${claimed.join(', ')} (not yet evidenced).`
        : 'No certifications stated; your requirement does not ask for one.',
    );
  else if (met.length === wanted.length)
    add(
      'certifications',
      'Certifications',
      buyerAdded ? 'partial' : 'pass',
      `Claims ${met.join(', ')}. ${buyerAdded ? 'Request the certificates; do not assume them.' : 'Certificates are checked in Stage 3.'}`,
      buyerAdded ? { request: 'Request the certificates.' } : {},
    );
  else if (!claimed.length)
    add('certifications', 'Certifications', 'missing', `Wanted: ${wanted.join(', ')}. None stated.`, {
      request: 'Request certification evidence.',
    });
  else
    add(
      'certifications',
      'Certifications',
      'partial',
      `Wanted: ${wanted.join(', ')}. Claims ${claimed.join(', ')}.`,
    );

  // 6. Subprocessor use
  const subs = v.usesSubprocessors;
  const rule = criteria.subprocessorRule || d.subprocessors;
  if (!subs || subs === 'Unknown')
    add('subprocessors', 'Subprocessor use', 'missing', 'Subprocessor use not disclosed.', {
      request: 'Ask for an initial subprocessor disclosure.',
    });
  else if (subs === 'No') add('subprocessors', 'Subprocessor use', 'pass', 'Does not use subprocessors.');
  else if (rule === 'Prohibited')
    add(
      'subprocessors',
      'Subprocessor use',
      'fail',
      'Uses subprocessors, but your requirement prohibits them.',
    );
  else if (rule === 'Approval required')
    add('subprocessors', 'Subprocessor use', 'partial', 'Uses subprocessors: each one needs your approval.', {
      request: 'Ask for the subprocessor list for approval.',
    });
  else add('subprocessors', 'Subprocessor use', 'pass', 'Uses subprocessors; your requirement allows them.');

  // 7. Contract status
  if (v.documents?.contract)
    add(
      'contract',
      'Contract status',
      'pass',
      `Existing contract uploaded${v.documents.dpa ? ' with a DPA' : ''}. It is analysed in Stage 4.`,
    );
  else
    add(
      'contract',
      'Contract status',
      'info',
      buyerAdded
        ? 'Contract not uploaded. It can be added in Stage 4.'
        : 'No contract yet. It is analysed in Stage 4.',
    );

  // 8. Buyer restrictions (enforced the same way for every vendor)
  const everywhere = [
    ...new Set([v.registeredCountry, ...delivery, ...known(access), ...known(hosting)].filter(Boolean)),
  ];
  const hit = everywhere.filter(c => restricted.includes(c));
  if (hit.length)
    add(
      'restrictions',
      'Buyer restrictions',
      'fail',
      `${names(hit)} ${hit.length > 1 ? 'are' : 'is'} on your restricted list. This vendor cannot be selected.`,
      { hard: true },
    );
  else
    add(
      'restrictions',
      'Buyer restrictions',
      'pass',
      restricted.length
        ? `None of your restricted countries (${names(restricted)}).`
        : 'No restricted countries were given.',
    );

  // 9. Assurance readiness
  if (buyerAdded)
    add(
      'readiness',
      'Assurance readiness',
      'missing',
      'Preliminary and unverified: the vendor has not completed an assurance questionnaire.',
      { request: 'Complete the vendor assurance questionnaire (Stage 3).' },
    );
  else if (v.completedAssessments > 0)
    add(
      'readiness',
      'Assurance readiness',
      'pass',
      `Has completed ${v.completedAssessments} OffshoreAssure assessment${v.completedAssessments > 1 ? 's' : ''} before.`,
    );
  else if (v.verificationStatus === 'approved')
    add(
      'readiness',
      'Assurance readiness',
      'pass',
      'Verified company, ready for the Stage 3 assessment. No earlier findings yet.',
    );
  else add('readiness', 'Assurance readiness', 'missing', 'Not yet verified.');

  // Personal-data access unknown triggers a clarification (Route B boundary).
  if (buyerAdded && v.personalDataAccess === 'Unknown') {
    const a = checks.find(c => c.id === 'access');
    a.result = a.result === 'pass' ? 'missing' : a.result;
    a.request = 'Clarify whether the vendor will access personal data.';
  }

  const hardExclusions = checks.filter(c => c.hard && c.result === 'fail');
  const exceptions = checks.filter(c => !c.hard && c.result === 'fail');
  const missing = checks.filter(c => c.result === 'missing');
  const partial = checks.filter(c => c.result === 'partial');
  const eligibility = hardExclusions.length
    ? ELIGIBILITY.EXCLUDED
    : exceptions.length || missing.length || partial.length
      ? ELIGIBILITY.WITH_GAPS
      : ELIGIBILITY.ELIGIBLE;
  const reviewStatus =
    v.verificationStatus === 'approved'
      ? 'VERIFIED'
      : v.verificationStatus === 'rejected'
        ? 'NOT_VERIFIED'
        : buyerAdded
          ? 'PRELIMINARY_UNVERIFIED'
          : 'VERIFICATION_PENDING';

  return {
    vendorId: v.id,
    source: v.source,
    eligibility,
    reviewStatus,
    selectable: !hardExclusions.length,
    checks,
    matched: checks.filter(c => c.result === 'pass').map(c => c.check),
    missing: missing.map(c => ({ id: c.id, check: c.check, detail: c.detail, request: c.request || null })),
    exceptions: exceptions.map(c => ({ id: c.id, check: c.check, detail: c.detail })),
    gaps: partial.map(c => ({ id: c.id, check: c.check, detail: c.detail })),
    hardExclusions: hardExclusions.map(c => ({ id: c.id, check: c.check, detail: c.detail })),
    score: fitScore(d, v, checks, criteria),
    nextAction: nextAction({ hardExclusions, exceptions, missing, buyerAdded }),
    rulePackVersion: FIT_RULE_PACK,
  };
}

/* Step 7 ranking aid: the five weighted criteria, each 0–1. Unstated information counts as neutral (0.5), not as a failure. */
function fitScore(d, v, checks, criteria) {
  const r = id => checks.find(c => c.id === id)?.result;
  const level = { pass: 1, partial: 0.5, missing: 0.5, info: 0.5, fail: 0 };
  const sector = !(v.industries || []).length
    ? 0.5
    : v.industries.includes(d.buyerSector) || (criteria.industries || []).some(i => v.industries.includes(i))
      ? 1
      : 0;
  const commercial = commercialFit(d, v, criteria);
  const values = {
    service: level[r('service')],
    security: 0.6 * level[r('certifications')] + 0.4 * level[r('identity')],
    geography: (level[r('delivery')] + level[r('access')]) / 2,
    sector,
    commercial: commercial.value,
  };
  const parts = WEIGHTS.map(w => ({
    ...w,
    value: Math.round(values[w.id] * 100) / 100,
    points: Math.round(values[w.id] * w.weight * 10) / 10,
  }));
  return {
    total: Math.round(parts.reduce((s, p) => s + p.points, 0)),
    parts,
    commercial: commercial.notes,
    note: SCORE_NOTE,
  };
}

/* Commercial fit: support hours, budget, insurance and languages, where both sides stated them. */
function commercialFit(d, v, c) {
  const marks = [];
  const notes = [];
  const hours =
    c.supportHours ||
    (d.supportHours === '24/7' ? '24/7' : d.supportHours === 'Business hours' ? 'Business hours' : null);
  const rank = { 'Business hours': 0, 'Extended hours': 1, '24/7': 2 };
  if (hours) {
    if (!v.supportHours) notes.push('Support hours not stated');
    else {
      const ok = rank[v.supportHours] >= rank[hours];
      marks.push(ok ? 1 : 0);
      if (!ok) notes.push(`Offers ${v.supportHours}, you need ${hours}`);
    }
  }
  const budget = c.budgetMax ?? d.estimatedBudget;
  const budgetCurrency = c.budgetCurrency || d.currency;
  if (budget != null && v.minAnnualValue != null) {
    if (v.valueCurrency !== budgetCurrency)
      notes.push(`Minimum contract value is in ${v.valueCurrency}; compare manually`);
    else {
      const ok = v.minAnnualValue <= budget;
      marks.push(ok ? 1 : 0);
      if (!ok) notes.push('Minimum contract value is above your budget');
    }
  }
  if (c.insuranceAmount != null) {
    if (v.insuranceCover == null) notes.push('Insurance cover not stated');
    else if (v.insuranceCurrency !== c.insuranceCurrency)
      notes.push(`Insurance is in ${v.insuranceCurrency}; compare manually`);
    else {
      const ok = v.insuranceCover >= c.insuranceAmount;
      marks.push(ok ? 1 : 0);
      if (!ok) notes.push('Insurance cover is below your requirement');
    }
  }
  if ((c.languages || []).length) {
    if (!(v.languages || []).length) notes.push('Languages not stated');
    else {
      const ok = c.languages.every(l => v.languages.includes(l));
      marks.push(ok ? 1 : 0.5);
      if (!ok) notes.push('Not all languages offered');
    }
  }
  return { value: marks.length ? marks.reduce((s, m) => s + m, 0) / marks.length : 0.5, notes };
}

function nextAction({ hardExclusions, exceptions, missing, buyerAdded }) {
  if (hardExclusions.length) return `Cannot be selected: ${hardExclusions[0].detail}`;
  if (exceptions.length)
    return `Selecting needs an exception reason: ${exceptions.map(e => e.check.toLowerCase()).join(', ')}.`;
  if (buyerAdded)
    return 'Select with conditions: verify the legal entity and locations, then complete the Stage 3 questionnaire.';
  if (missing.length) return `Select with conditions: ${missing[0].request || missing[0].detail}`;
  return 'Ready to confirm. The Stage 3 compliance assessment follows.';
}

/* Route A filters a directory vendor must meet. Unstated values never exclude a vendor; they are listed as "not stated". */
export function directoryFilter(v, c) {
  const failed = [];
  const notStated = [];
  const check = (stated, ok, label) => {
    if (!stated) notStated.push(label);
    else if (!ok) failed.push(label);
  };
  if (c.deliveryModel)
    check(
      !!v.deliveryModel,
      v.deliveryModel === c.deliveryModel || v.deliveryModel === 'Hybrid',
      'Delivery model',
    );
  if ((c.industries || []).length)
    check(
      (v.industries || []).length > 0,
      c.industries.some(i => v.industries.includes(i)),
      'Industry experience',
    );
  if (c.minStaff != null) check(v.staffCount != null, v.staffCount >= c.minStaff, 'Staff capacity');
  if (c.minYears != null)
    check(
      v.foundedYear != null,
      new Date().getUTCFullYear() - v.foundedYear >= c.minYears,
      'Operating history',
    );
  if ((c.certifications || []).length)
    check(
      (v.certifications || []).length > 0,
      c.certifications.every(x => v.certifications.includes(x)),
      'Certifications',
    );
  if (c.insuranceAmount != null)
    check(
      v.insuranceCover != null,
      v.insuranceCurrency !== c.insuranceCurrency || v.insuranceCover >= c.insuranceAmount,
      'Insurance',
    );
  if (c.supportHours) {
    const rank = { 'Business hours': 0, 'Extended hours': 1, '24/7': 2 };
    check(!!v.supportHours, rank[v.supportHours] >= rank[c.supportHours], 'Support hours');
  }
  if ((c.languages || []).length)
    check(
      (v.languages || []).length > 0,
      c.languages.every(l => v.languages.includes(l)),
      'Languages',
    );
  if (c.budgetMax != null)
    check(
      v.minAnnualValue != null,
      v.valueCurrency !== c.budgetCurrency || v.minAnnualValue <= c.budgetMax,
      'Budget',
    );
  if (c.subprocessorRule === 'Prohibited')
    check(
      !!v.usesSubprocessors && v.usesSubprocessors !== 'Unknown',
      v.usesSubprocessors === 'No',
      'Subprocessor restrictions',
    );
  return { failed, notStated };
}

/* Step 8: the status a confirmed selection gets. */
export function selectionStatus(fit) {
  if (!fit.selectable) return 'SELECTION_BLOCKED';
  if (fit.reviewStatus !== 'VERIFIED' || fit.eligibility !== ELIGIBILITY.ELIGIBLE)
    return 'CONDITIONALLY_SELECTED';
  return 'SELECTED_PENDING_ASSESSMENT';
}

/* The conditions recorded with a conditional selection ("Required before approval"). */
export function conditionsFor(fit) {
  const list = [];
  if (fit.source === 'BUYER_PROVIDED')
    list.push(
      'Verify the legal entity and delivery locations.',
      'Complete the vendor assurance questionnaire.',
      'Review the relevant contract and processing terms.',
      'Confirm subprocessors and transfer routes.',
    );
  for (const m of fit.missing) {
    if (fit.source === 'BUYER_PROVIDED' && ['identity', 'readiness'].includes(m.id)) continue; // covered by the four items above
    if (m.request && !list.includes(m.request)) list.push(m.request);
  }
  for (const g of fit.gaps) list.push(`${g.check}: ${g.detail}`);
  for (const e of fit.exceptions) list.push(`Exception accepted — ${e.check}: ${e.detail}`);
  return [...new Set(list)];
}
