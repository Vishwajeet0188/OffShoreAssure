/*
 * Stage 6 – International transfer assessment
 * Client specification: "Offshore Assure – Input / Output Stage 4, 5, 6" (steps 25–28).
 *
 * The specification asks us to assess actual legal entities and data flows, not to give each
 * country a risk rating. So every route is "who sends the data → who receives it", for example
 *
 *     UK Company Ltd (buyer) → Krakow IT, Poland (primary supplier)
 *     Krakow IT → support team in India
 *     Krakow IT → cloud provider in the USA
 *
 * Step 25  Map the routes. Each route has the 18 fields of the specification (exporter and importer
 *          entity, countries and roles, data, purpose, locations, onward recipients, frequency,
 *          encryption/access controls, sub-processor relationship and proposed safeguard).
 *          An unknown entity or location stops a final decision. Remote access is not assumed
 *          to be a restricted transfer.
 *
 * Step 26  Follow the required legal decision sequence for each route and fill the 12 decision fields:
 *            1 Which data-protection regime applies?
 *            2 Who starts the transfer and who receives the data?
 *            3 Is it a restricted transfer (outside the UK, to a separate legal entity)?
 *            4 If restricted, does UK adequacy cover this recipient?
 *            5 If not, is there an appropriate safeguard or a narrow exception?
 *            6 For a safeguard, is the transfer risk assessment (TRA) done, with extra measures?
 *            7 Is the transfer instrument completed, applicable and executed (signed)?
 *            8 Record unresolved issues and ask for legal review where needed.
 *
 * Step 27  The buyer sees 10 fields per route with one of six statuses:
 *          NO RESTRICTED TRANSFER IDENTIFIED, ADEQUACY ROUTE, SAFEGUARD REVIEW, EXCEPTION REVIEW,
 *          INFORMATION REQUIRED and LEGAL REVIEW REQUIRED.
 *          We never say a route is legally cleared.
 *
 * Step 28  Each route is saved on its own with the 12 stored fields. New locations, entities or
 *          safeguards give the route a new version and it is assessed again.
 *
 * The adequacy list must be checked against the ICO's current list. This is not a legal opinion.
 */
import crypto from 'node:crypto';
import { countryName } from '../reference/countries.js';

export const S6_RULE_PACK = 'RP-2026.11-S6';

export const TRANSFER_NOTE =
  'A route-by-route view of who sends personal data to whom, and what is still needed. No route is shown as legally cleared: the findings support a legal review, they do not replace it. Check the adequacy list against the ICO’s current guidance.';

/* ------------------------------------------------------------------ */
/*  Fixed lists                                                       */
/* ------------------------------------------------------------------ */

/* The six statuses of step 27, from the most to the least serious. */
export const ROUTE_STATUS = {
  LEGAL_REVIEW_REQUIRED: { label: 'Legal review required', tone: 'coral', rank: 5 },
  INFORMATION_REQUIRED: { label: 'Information required', tone: 'amber', rank: 4 },
  EXCEPTION_REVIEW: { label: 'Exception review', tone: 'amber', rank: 3 },
  SAFEGUARD_REVIEW: { label: 'Safeguard review', tone: 'amber', rank: 2 },
  ADEQUACY_ROUTE: { label: 'Adequacy route', tone: 'sage', rank: 1 },
  NO_RESTRICTED_TRANSFER: { label: 'No restricted transfer identified', tone: 'sage', rank: 0 },
};

/* Where the decision sequence ended (the boxes at the bottom of the client's diagram). */
export const OUTCOMES = {
  NOT_APPLICABLE: 'UK GDPR does not apply: record non-applicability and assess other laws',
  NO_RESTRICTED_TRANSFER: 'Record no restricted transfer under this test',
  ADEQUACY_EVIDENCE: 'Record adequacy evidence and complete the other UK GDPR checks',
  CONDITIONAL_CLEARANCE: 'Conditional clearance, subject to the other controls',
  EXCEPTION_RATIONALE: 'Check the strict exception criteria and document the rationale',
  PENDING_INFORMATION: 'Waiting for information before a decision can be made',
  BLOCK_OR_ESCALATE: 'Block or escalate until there is a lawful route',
};

export const ROLES = {
  CONTROLLER: 'Controller',
  PROCESSOR: 'Processor',
  SUBPROCESSOR: 'Sub-processor',
  UNKNOWN: 'Not confirmed',
};

export const SAFEGUARDS = {
  IDTA: 'International Data Transfer Agreement (IDTA)',
  UK_ADDENDUM: 'UK Addendum to the EU Standard Contractual Clauses',
  BCR: 'Binding Corporate Rules',
  EXCEPTION: 'Article 49 exception',
  NONE: 'None in place',
  UNKNOWN: 'Not known',
};

export const INSTRUMENT_STATUS = {
  EXECUTED: 'Executed (signed)',
  DRAFT: 'Draft (not signed)',
  NOT_PROVIDED: 'Not provided',
  NOT_NEEDED: 'Not needed',
};

export const TRA_STATUS = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  NOT_STARTED: 'Not started',
  NOT_REQUIRED: 'Not required',
};

export const FREQUENCIES = {
  CONTINUOUS: 'Continuous',
  REGULAR: 'Regular',
  OCCASIONAL: 'Occasional',
  ONE_OFF: 'One-off',
  UNKNOWN: 'Not known',
};

/* ------------------------------------------------------------------ */
/*  UK adequacy ("data bridges")                                      */
/* ------------------------------------------------------------------ */

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

/*
 * Destinations covered by UK adequacy regulations. A text value is the condition the recipient must
 * meet. Naming a country as "adequate" without checking that scope is not enough (step 26 boundary).
 */
export const ADEQUACY = {
  ...Object.fromEntries(EEA.map(code => [code, null])),
  GI: null,
  AD: null,
  AR: null,
  FO: null,
  GG: null,
  IM: null,
  IL: null,
  JE: null,
  NZ: null,
  KR: null,
  CH: null,
  UY: null,
  CA: 'Only for organisations covered by Canada’s commercial privacy law (PIPEDA).',
  JP: 'Only for the private sector.',
  US: 'Only for US organisations certified under the UK Extension to the EU–US Data Privacy Framework.',
};

const UNKNOWN = 'UNKNOWN';
const nameOf = code => (!code || code === UNKNOWN ? 'Not confirmed' : countryName(code) || code);

/* ------------------------------------------------------------------ */
/*  What the contract says about transfers (from Stage 4)             */
/* ------------------------------------------------------------------ */

const SAFEGUARD_TERMS = [
  ['international data transfer agreement', 'IDTA'],
  ['idta', 'IDTA'],
  ['addendum', 'UK_ADDENDUM'],
  ['standard contractual clauses', 'UK_ADDENDUM'],
  ['binding corporate rules', 'BCR'],
];

/**
 * Reads the transfer terms of the contract set: which safeguard is named, in which document,
 * whether that document is signed, and whether the contract only allows some countries.
 *
 * @param {Array} clauses     Stage 4 clauses (with categories and topics)
 * @param {Array} documents   the contract documents ({ documentNo, type, title, executionStatus })
 */
export function readContractTransferTerms(clauses = [], documents = []) {
  const transferClauses = clauses.filter(
    clause =>
      (clause.categories || []).includes('CL-14') ||
      (clause.topics || []).some(topic => topic.topicId === 'international_transfer'),
  );
  const text = transferClauses.map(clause => clause.text).join(' ');
  const lower = text.toLowerCase();

  // The safeguard named in the clauses, and the document it sits in.
  let safeguard = null;
  let safeguardDocument = null;
  for (const [term, code] of SAFEGUARD_TERMS) {
    const clause = transferClauses.find(c => c.text.toLowerCase().includes(term));
    if (clause) {
      safeguard = code;
      safeguardDocument = clause.documentId || null;
      break;
    }
  }

  // A document of type SCC (an IDTA or Addendum uploaded on its own) is the instrument itself.
  const sccDocument = documents.find(d => d.type === 'SCC');
  if (sccDocument) {
    safeguard =
      safeguard ||
      (/addendum|scc|standard contractual/i.test(sccDocument.title || '') ? 'UK_ADDENDUM' : 'IDTA');
    safeguardDocument = sccDocument.documentNo;
  }

  const instrumentDocument = documents.find(d => d.documentNo === safeguardDocument) || null;

  // "outside the United Kingdom except to India" → only the named countries are allowed.
  const limitsCountries = /\b(?:not|no)\b[^.]*\boutside\b[^.]*\b(?:except|other than|unless)\b/i.test(text);
  const knownCountries = Object.keys(ADEQUACY).concat([
    'IN',
    'PH',
    'BR',
    'ZA',
    'MX',
    'CN',
    'SG',
    'MY',
    'EG',
    'UA',
    'VN',
    'LK',
    'PK',
    'BD',
    'AE',
    'AU',
  ]);
  const allowedCountries = knownCountries.filter(code => {
    const name = countryName(code);
    return name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  });

  return {
    clauseRefs: transferClauses.map(clause => `${clause.documentId || 'DOC-001'} §${clause.number}`),
    safeguard,
    safeguardDocument,
    instrumentStatus: instrumentDocument
      ? instrumentDocument.executionStatus === 'SIGNED'
        ? 'EXECUTED'
        : 'DRAFT'
      : null,
    limitsCountries,
    allowedCountries: [...new Set(allowedCountries)],
    mentionsTransfers: transferClauses.length > 0 || lower.includes('transfer'),
  };
}

/* ------------------------------------------------------------------ */
/*  Step 25 – mapping the routes                                      */
/* ------------------------------------------------------------------ */

const slug = text =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/* The data being sent, from the Stage 1 requirement. */
function dataProfile(requirement) {
  let sensitivity = 'PERSONAL';
  if (requirement.personalData === 'No') sensitivity = 'NON_PERSONAL';
  if (requirement.personalData === 'Unknown') sensitivity = 'UNKNOWN';
  if (requirement.specialCategory === 'Yes') sensitivity = 'SPECIAL_CATEGORY';
  if (requirement.criminalOffence === 'Yes') sensitivity = 'CRIMINAL_OFFENCE';

  return {
    dataSubjectCategories: requirement.dataSubjectCategories || [],
    dataCategories: requirement.personalDataCategories || [],
    dataSensitivity: sensitivity,
    processingPurpose:
      [requirement.serviceDescription, requirement.businessObjective]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 300) || 'Not stated',
  };
}

/* Encryption and access controls, as the vendor answered them in Stage 3. */
function controlsFromStage3(stage3Results = []) {
  const statusOf = id => stage3Results.find(r => r.controlId === id)?.status || 'NOT_ASSESSED';
  return {
    encryption: statusOf('SEC-04'),
    privilegedMfa: statusOf('ACC-01'),
    remoteMfa: statusOf('ACC-02'),
    leastPrivilege: statusOf('ACC-03'),
    source: stage3Results.length ? 'Stage 3 vendor answers' : 'Not assessed in Stage 3',
  };
}

/**
 * Step 25: builds the routes between legal entities.
 *
 * @param {object} input
 *   requirement      Stage 1 answers
 *   buyer            { id, name, country }
 *   vendor           { id, name, country, deliveryCountries }
 *   processingRole   the vendor's role from Stage 3 (controller / processor / subprocessor / unknown)
 *   stage3           { answers, results } from the latest Stage 3 snapshot
 *   facts            route facts confirmed by the buyer, by route key
 */
export function mapRoutes({
  requirement = {},
  buyer,
  vendor,
  processingRole = null,
  stage3 = {},
  facts = {},
}) {
  const answers = stage3.answers || {};
  const buyerCountry = requirement.buyerCountry || buyer.country || 'GB';
  const vendorCountry = vendor.country || UNKNOWN;
  const data = dataProfile(requirement);
  const controls = controlsFromStage3(stage3.results);

  // Where the data is stored and where it is accessed from: Stage 1, the vendor's profile and Stage 3.
  const storage = unique([...(requirement.storageCountries || []), ...(answers['TRF-02']?.countries || [])]);
  const access = unique([
    ...(requirement.remoteAccessCountries || []),
    ...(answers['TRF-01']?.countries || []),
    ...(vendor.deliveryCountries || []),
  ]);
  const subprocessorRows = answers['SUB-01']?.answer === 'Yes' ? answers['SUB-01'].rows || [] : [];
  const cloud = requirement.cloudServices === 'Yes';

  // The buyer is the controller unless the vendor is itself a controller (then both are controllers).
  const vendorRole =
    { controller: 'CONTROLLER', processor: 'PROCESSOR', subprocessor: 'SUBPROCESSOR' }[processingRole] ||
    (requirement.personalData === 'No' ? 'UNKNOWN' : 'PROCESSOR');

  const routes = [];
  const add = route => routes.push({ ...route, ...data });

  /* ---- 1. Buyer → primary supplier ---- */
  add({
    key: 'vendor',
    parentKey: null,
    flow: `${requirement.serviceCategory || 'Outsourced service'} / data access`,
    exporter: { name: buyer.name, entityId: buyer.id, kind: 'buyer' },
    exporterCountry: buyerCountry,
    exporterRole: 'CONTROLLER',
    importer: { name: vendor.name, entityId: vendor.id, kind: 'vendor', confirmed: true },
    importerCountry: vendorCountry,
    importerRole: vendorRole,
    storageLocation: storage.filter(c => c === vendorCountry && !cloud),
    remoteAccessLocation: access.filter(c => c === vendorCountry),
    transferFrequency: 'CONTINUOUS',
    encryptionAccessControls: controls,
    subprocessorRelationship: { isSubprocessor: false, reference: null },
    sources: ['Stage 2 selected vendor', 'Stage 3 processing role'],
  });

  /* ---- 2. Supplier → its own teams in other countries (remote access, delivery centres) ---- */
  for (const country of access) {
    if (country === vendorCountry || country === buyerCountry) continue;
    add({
      key: `access:${country}`,
      parentKey: 'vendor',
      flow: 'Potential remote support',
      exporter: { name: vendor.name, entityId: vendor.id, kind: 'vendor' },
      exporterCountry: vendorCountry,
      exporterRole: vendorRole,
      // Is the team in this country the same company, a group company or a contractor? Not known yet.
      importer: { name: `${vendor.name} support team`, entityId: null, kind: 'team', confirmed: false },
      importerCountry: country,
      importerRole: 'UNKNOWN',
      storageLocation: [],
      remoteAccessLocation: [country],
      transferFrequency: requirement.supportHours === '24/7' ? 'CONTINUOUS' : 'REGULAR',
      encryptionAccessControls: controls,
      subprocessorRelationship: { isSubprocessor: false, reference: null },
      sources: ['Stage 1 remote-access countries', 'Stage 3 TRF-01', 'Vendor delivery countries'].filter(
        Boolean,
      ),
    });
  }

  /* ---- 3. Named sub-processors from the vendor's Stage 3 answer (SUB-01) ---- */
  const usedRows = new Set();
  subprocessorRows.forEach((row, index) => {
    if (!row.name) return;
    usedRows.add(index);
    const isHost = /cloud|host|storage|aws|azure|google|data ?cent(?:re|er)/i.test(
      `${row.name} ${row.service}`,
    );
    add({
      key: `sub:${slug(row.name)}`,
      parentKey: 'vendor',
      flow: isHost ? 'Potential cloud processing' : 'Potential onward processing',
      exporter: { name: vendor.name, entityId: vendor.id, kind: 'vendor' },
      exporterCountry: vendorCountry,
      exporterRole: vendorRole,
      importer: { name: row.name, entityId: null, kind: isHost ? 'cloud' : 'subprocessor', confirmed: true },
      importerCountry: row.country || UNKNOWN,
      importerRole: 'SUBPROCESSOR',
      storageLocation: isHost && row.country ? [row.country] : [],
      remoteAccessLocation: [],
      transferFrequency: isHost ? 'CONTINUOUS' : 'REGULAR',
      encryptionAccessControls: controls,
      subprocessorRelationship: { isSubprocessor: true, reference: `Stage 3 SUB-01, row ${index + 1}` },
      sources: ['Stage 3 subprocessor table (SUB-01)'],
    });
  });

  /* ---- 4. Storage abroad that no named sub-processor explains ---- */
  for (const country of storage) {
    if (country === buyerCountry || country === UNKNOWN) continue;
    if (!cloud && country === vendorCountry) continue; // already on the supplier route
    if (routes.some(route => route.storageLocation.includes(country) && route.key !== 'vendor')) continue;

    add({
      key: `storage:${country}`,
      parentKey: 'vendor',
      flow: cloud ? 'Potential cloud processing' : 'Data storage',
      exporter: { name: vendor.name, entityId: vendor.id, kind: 'vendor' },
      exporterCountry: vendorCountry,
      exporterRole: vendorRole,
      importer: {
        name: cloud ? 'Cloud hosting provider (not named)' : `${vendor.name} storage site`,
        entityId: null,
        kind: cloud ? 'cloud' : 'team',
        confirmed: false,
      },
      importerCountry: country,
      importerRole: cloud ? 'SUBPROCESSOR' : 'UNKNOWN',
      storageLocation: [country],
      remoteAccessLocation: [],
      transferFrequency: 'CONTINUOUS',
      encryptionAccessControls: controls,
      subprocessorRelationship: { isSubprocessor: cloud, reference: null },
      sources: ['Stage 1 storage countries', 'Stage 3 TRF-02'],
    });
  }

  /* ---- 5. Unknown storage location, or sub-processors allowed but none named ---- */
  if (storage.includes(UNKNOWN)) {
    add(
      unknownRoute(
        'storage:unknown',
        'Data storage (location not confirmed)',
        vendor,
        vendorCountry,
        vendorRole,
        controls,
        false,
      ),
    );
  }
  if (['Allowed', 'Approval required'].includes(requirement.subprocessors) && !usedRows.size) {
    add(
      unknownRoute(
        'sub:unlisted',
        'Sub-processors (not yet listed)',
        vendor,
        vendorCountry,
        vendorRole,
        controls,
        true,
      ),
    );
  }

  // The buyer's confirmed facts take precedence over what we worked out.
  const withFacts = routes.map(route => applyFacts(route, facts[route.key]));

  // Each route lists who it sends the data on to (its onward recipients).
  for (const route of withFacts) {
    route.onwardRecipients = withFacts
      .filter(child => child.parentKey === route.key)
      .map(child => ({ name: child.importer.name, country: child.importerCountry, routeKey: child.key }));
  }

  // Route IDs in order: TR-001, TR-002 …
  return withFacts.map((route, index) => ({ id: `TR-${String(index + 1).padStart(3, '0')}`, ...route }));
}

function unknownRoute(key, name, vendor, vendorCountry, vendorRole, controls, isSub) {
  return {
    key,
    parentKey: 'vendor',
    flow: isSub ? 'Potential onward processing' : 'Data storage',
    exporter: { name: vendor.name, entityId: vendor.id, kind: 'vendor' },
    exporterCountry: vendorCountry,
    exporterRole: vendorRole,
    importer: { name, entityId: null, kind: isSub ? 'subprocessor' : 'team', confirmed: false },
    importerCountry: UNKNOWN,
    importerRole: isSub ? 'SUBPROCESSOR' : 'UNKNOWN',
    storageLocation: isSub ? [] : [UNKNOWN],
    remoteAccessLocation: [],
    transferFrequency: 'UNKNOWN',
    encryptionAccessControls: controls,
    subprocessorRelationship: { isSubprocessor: isSub, reference: null },
    sources: [isSub ? 'Stage 1: sub-processors allowed' : 'Stage 1 storage countries'],
  };
}

/* Applies the facts the buyer confirmed for a route (a new entity, country or safeguard). */
function applyFacts(route, facts) {
  if (!facts) return { ...route, facts: null };

  const next = { ...route, importer: { ...route.importer } };
  if (facts.importerName) {
    next.importer.name = facts.importerName;
    next.importer.confirmed = true;
  }
  if (facts.importerCountry) next.importerCountry = facts.importerCountry;
  if (facts.importerRole) next.importerRole = facts.importerRole;
  if (facts.transferFrequency) next.transferFrequency = facts.transferFrequency;
  return { ...next, facts };
}

/* ------------------------------------------------------------------ */
/*  Step 26 – the legal decision sequence                             */
/* ------------------------------------------------------------------ */

/**
 * Runs the eight steps of the client's decision diagram for one route.
 *
 * @param {object} route      from mapRoutes (with the buyer's facts)
 * @param {object} context    requirement, contractTerms, stage3 answers
 */
export function decideRoute(route, { requirement = {}, contractTerms, stage3 = {} }) {
  const facts = route.facts || {};
  const answers = stage3.answers || {};
  const sequence = [];
  const missingDocuments = [];
  const questions = [];
  const step = (number, question, answer, note = null) =>
    sequence.push({ step: number, question, answer, note });
  const ask = (to, text) => questions.push({ to, text });

  const destination = nameOf(route.importerCountry);
  const sensitive = ['SPECIAL_CATEGORY', 'CRIMINAL_OFFENCE'].includes(route.dataSensitivity);

  // The 12 legal-decision fields, filled in as we go.
  const decision = {
    routeId: route.id,
    applicableRegime: null,
    transferInitiator: route.exporter.name,
    separateEntityTest: 'UNKNOWN',
    restrictedTransferFinding: 'UNDETERMINED',
    adequacyStatus: 'NOT_ASSESSED',
    safeguardType: null,
    instrumentStatus: 'NOT_NEEDED',
    traStatus: 'NOT_REQUIRED',
    supplementaryMeasures: [],
    onwardTransferStatus: route.onwardRecipients?.length ? 'ASSESSED_SEPARATELY' : 'NONE',
    legalReviewStatus: 'NOT_REQUIRED',
  };

  const finish = (status, outcome, rationale, requiredAction) => {
    // Step 8: record the unresolved issues; some routes always need a lawyer.
    const needsLawyer =
      status === 'LEGAL_REVIEW_REQUIRED' ||
      status === 'EXCEPTION_REVIEW' ||
      (sensitive && decision.restrictedTransferFinding === 'RESTRICTED');
    if (needsLawyer) decision.legalReviewStatus = 'REQUIRED';
    if (facts.legalReview?.status === 'COMPLETED') decision.legalReviewStatus = 'COMPLETED';

    step(
      8,
      'Unresolved issues recorded; legal review needed?',
      decision.legalReviewStatus === 'NOT_REQUIRED'
        ? 'No'
        : decision.legalReviewStatus === 'COMPLETED'
          ? 'Done'
          : 'Yes',
      decision.legalReviewStatus === 'COMPLETED'
        ? `Reviewed by ${facts.legalReview.by}: ${facts.legalReview.note}`
        : sensitive && decision.restrictedTransferFinding === 'RESTRICTED'
          ? 'Special-category or criminal-offence data on a restricted transfer.'
          : null,
    );

    return { status, outcome, rationale, requiredAction, decision, sequence, missingDocuments, questions };
  };

  /* ---- Step 1: which regime applies ---- */
  const buyerCountry = requirement.buyerCountry || 'GB';
  if (requirement.personalData === 'No') {
    decision.applicableRegime = 'NOT_APPLICABLE';
    step(1, 'UK GDPR applies to the relevant processing?', 'No', 'No personal data is involved (Stage 1).');
    decision.restrictedTransferFinding = 'NOT_RESTRICTED';
    return finish(
      'NO_RESTRICTED_TRANSFER',
      'NOT_APPLICABLE',
      'No personal data is involved, so UK GDPR transfer rules do not apply. Other laws (for example confidentiality or export control) may still apply.',
      'Record non-applicability; check any other laws that apply.',
    );
  }
  if (buyerCountry !== 'GB') {
    decision.applicableRegime = 'OTHER';
    step(1, 'UK GDPR applies to the relevant processing?', 'No', `The buyer is in ${nameOf(buyerCountry)}.`);
    return finish(
      'LEGAL_REVIEW_REQUIRED',
      'NOT_APPLICABLE',
      `The buyer is in ${nameOf(buyerCountry)}, so another data-protection regime applies. This platform's transfer rules are written for UK GDPR.`,
      'Ask a lawyer to assess the transfer under the law that applies.',
    );
  }
  decision.applicableRegime = 'UK_GDPR';
  step(
    1,
    'UK GDPR applies to the relevant processing?',
    'Yes',
    requirement.personalData === 'Unknown'
      ? 'Personal data is “Unknown” in Stage 1, so we assume it may be involved.'
      : null,
  );

  /* ---- Step 2: who sends and who receives ---- */
  const entityKnown = route.importer.confirmed !== false;
  const countryKnown = route.importerCountry && route.importerCountry !== UNKNOWN;
  step(
    2,
    'Who starts the transfer and who receives the data?',
    `${route.exporter.name} → ${route.importer.name}`,
    !entityKnown
      ? 'The receiving legal entity is not confirmed.'
      : !countryKnown
        ? 'The receiving country is not confirmed.'
        : null,
  );

  if (!countryKnown) {
    missingDocuments.push(
      route.subprocessorRelationship.isSubprocessor
        ? 'Subprocessor register with countries'
        : 'Hosting schedule',
    );
    ask(
      'vendor',
      `Confirm the country where ${route.importer.name.toLowerCase()} receives or stores the data.`,
    );
    return finish(
      'INFORMATION_REQUIRED',
      'PENDING_INFORMATION',
      'The location is not known, so no final route decision can be made.',
      'Get the location (and the legal entity) from the vendor.',
    );
  }

  /* ---- Step 3: restricted-transfer test ---- */
  const outsideUk = route.importerCountry !== 'GB';
  if (!outsideUk) {
    decision.separateEntityTest = route.importer.kind === 'team' ? 'NO' : 'YES';
    decision.restrictedTransferFinding = 'NOT_RESTRICTED';
    step(
      3,
      'Transfer to an organisation outside the UK?',
      'No',
      `${route.importer.name} is in the United Kingdom.`,
    );
    return finish(
      'NO_RESTRICTED_TRANSFER',
      'NO_RESTRICTED_TRANSFER',
      'The receiver is in the UK, so this is not a restricted transfer. The usual UK GDPR duties still apply.',
      'None for transfers.',
    );
  }

  // Is the receiver a separate legal entity? The supplier and named sub-processors are; the supplier's own
  // teams abroad are not known until the buyer confirms. We do not assume remote access is a transfer.
  let separate = route.importer.kind === 'team' ? 'UNKNOWN' : 'YES';
  if (facts.separateEntity) separate = facts.separateEntity;
  decision.separateEntityTest = separate;

  // The buyer confirmed the people abroad work for the sender itself: not a further restricted transfer.
  if (separate === 'NO') {
    decision.restrictedTransferFinding = 'NOT_RESTRICTED';
    step(
      3,
      'Separate legal entity?',
      'No',
      `The people in ${destination} work for ${route.exporter.name} itself.`,
    );
    return finish(
      'NO_RESTRICTED_TRANSFER',
      'NO_RESTRICTED_TRANSFER',
      `Access from ${destination} is by ${route.exporter.name}'s own staff, so it is not a further restricted transfer under this test. The location is still covered by the security and transfer terms of the supplier route.`,
      'Keep the access location in the data-flow map and the supplier’s security controls.',
    );
  }

  if (separate === 'UNKNOWN' || !entityKnown) {
    step(
      3,
      'Transfer to an organisation outside the UK, and a separate legal entity?',
      'Not known yet',
      'Remote access is not automatically a restricted transfer: it depends on who the people work for.',
    );
    missingDocuments.push('Access-location disclosure naming the legal entity');
    ask(
      'vendor',
      `Name the legal entity whose staff access the data from ${destination}, and say whether it is part of ${route.exporter.name}.`,
    );
    return finish(
      'INFORMATION_REQUIRED',
      'PENDING_INFORMATION',
      `${route.importer.name}: the recipient entity is not verified, so the route cannot be decided.`,
      `Confirm the legal entity in ${destination} and its role.`,
    );
  }

  decision.restrictedTransferFinding = 'RESTRICTED';
  step(3, 'Transfer to a separate legal entity outside the UK?', 'Yes — restricted transfer');

  // The buyer said the service must not be delivered from this country (Stage 1).
  if ((requirement.restrictedCountries || []).includes(route.importerCountry)) {
    step(
      4,
      'Is the destination allowed by the buyer?',
      'No',
      `${destination} is on the buyer's restricted list (Stage 1).`,
    );
    ask('buyer', `Decide whether data may go to ${destination}, or ask the vendor to stop this route.`);
    return finish(
      'LEGAL_REVIEW_REQUIRED',
      'BLOCK_OR_ESCALATE',
      `${destination} is on your restricted list, but data would go there.`,
      'Block the route or record a decision to allow it.',
    );
  }

  /* ---- Step 4: UK adequacy ---- */
  const condition = ADEQUACY[route.importerCountry];
  const inAdequacyList = route.importerCountry in ADEQUACY;

  if (inAdequacyList && !condition) {
    decision.adequacyStatus = 'COVERED';
    decision.safeguardType = 'NOT_NEEDED';
    step(
      4,
      'UK adequacy covers the recipient?',
      'Yes',
      `${destination} is covered by UK adequacy regulations.`,
    );
    return adequacyFinish();
  }

  if (inAdequacyList && condition) {
    if (facts.adequacyEligibility === 'CONFIRMED') {
      decision.adequacyStatus = 'CONDITION_CONFIRMED';
      decision.safeguardType = 'NOT_NEEDED';
      step(4, 'UK adequacy covers the recipient?', 'Yes, eligibility confirmed', condition);
      return adequacyFinish();
    }
    decision.adequacyStatus = 'CONDITION_NOT_CONFIRMED';
    step(
      4,
      'UK adequacy covers the recipient?',
      'Not confirmed',
      `${condition} Naming the country is not enough.`,
    );
    missingDocuments.push('Adequacy eligibility evidence');
    ask('vendor', `${destination}: ${condition} Provide evidence that ${route.importer.name} is covered.`);
  } else {
    decision.adequacyStatus = 'NOT_COVERED';
    step(
      4,
      'UK adequacy covers the recipient?',
      'No',
      `${destination} is not covered by UK adequacy regulations.`,
    );
  }

  /* ---- Step 5: safeguard or exception ---- */
  const contractSafeguard = safeguardFromContract(route, contractTerms);
  let safeguard = facts.safeguardType || contractSafeguard.safeguard;
  if (!safeguard) {
    // Nothing in the contract: the vendor's Stage 3 answer (TRF-03) tells us whether to look further.
    const vendorSays = answers['TRF-03']?.answer;
    safeguard = vendorSays === 'No' ? 'NONE' : 'UNKNOWN';
  }
  decision.safeguardType = safeguard;

  if (safeguard === 'EXCEPTION') {
    step(
      5,
      'Appropriate safeguard or valid exception?',
      'Exception',
      facts.exceptionBasis || 'No rationale recorded yet.',
    );
    if (!facts.exceptionBasis) missingDocuments.push('Documented exception rationale');
    ask(
      'buyer',
      `Document why an Article 49 exception applies to ${route.exporter.name} → ${route.importer.name}, and why it is occasional and necessary.`,
    );
    return finish(
      'EXCEPTION_REVIEW',
      'EXCEPTION_RATIONALE',
      'An exception is relied on. Exceptions are narrow and must meet strict criteria.',
      'A lawyer checks the exception criteria and the documented rationale.',
    );
  }

  if (safeguard === 'UNKNOWN') {
    step(5, 'Appropriate safeguard or valid exception?', 'Not known', contractSafeguard.note);
    missingDocuments.push('Transfer agreement (IDTA or UK Addendum)');
    ask(
      'vendor',
      `Say which transfer mechanism covers ${route.exporter.name} → ${route.importer.name} (${destination}) and provide it.`,
    );
    return finish(
      'INFORMATION_REQUIRED',
      'PENDING_INFORMATION',
      `${route.importer.name}: no safeguard is established for ${destination}. ${contractSafeguard.note || ''}`.trim(),
      'Get the transfer agreement, or decide on another lawful mechanism.',
    );
  }

  if (safeguard === 'NONE') {
    step(5, 'Appropriate safeguard or valid exception?', 'Neither established', contractSafeguard.note);
    missingDocuments.push('Transfer agreement (IDTA or UK Addendum)');
    ask('buyer', `Put a transfer agreement in place for ${destination}, or stop this route.`);
    return finish(
      'LEGAL_REVIEW_REQUIRED',
      'BLOCK_OR_ESCALATE',
      `No safeguard or exception is established for ${destination}.`,
      'Block or escalate this route until there is a lawful mechanism.',
    );
  }

  step(5, 'Appropriate safeguard or valid exception?', 'Article 46 safeguard', SAFEGUARDS[safeguard]);

  /* ---- Step 6: transfer risk assessment and extra measures ---- */
  decision.traStatus = facts.traStatus || 'NOT_STARTED';
  decision.supplementaryMeasures = supplementaryMeasures(route, facts);
  step(
    6,
    'Transfer risk assessment / data protection test done, with extra measures?',
    TRA_STATUS[decision.traStatus],
    decision.supplementaryMeasures.length
      ? decision.supplementaryMeasures.join('; ')
      : 'No extra measures recorded.',
  );
  if (decision.traStatus !== 'COMPLETED') {
    missingDocuments.push('Transfer risk assessment');
    ask(
      'vendor',
      `Provide the transfer risk assessment for ${route.exporter.name} → ${route.importer.name} (${destination}).`,
    );
  }

  /* ---- Step 7: the instrument is completed, applicable and executed ---- */
  decision.instrumentStatus = facts.instrumentStatus || contractSafeguard.instrumentStatus || 'NOT_PROVIDED';
  step(
    7,
    'Transfer instrument completed, applicable and binding?',
    INSTRUMENT_STATUS[decision.instrumentStatus],
    decision.instrumentStatus === 'DRAFT'
      ? 'An unsigned instrument cannot satisfy the transfer assessment.'
      : null,
  );
  if (decision.instrumentStatus === 'DRAFT') missingDocuments.push('Signed transfer agreement');
  if (decision.instrumentStatus === 'NOT_PROVIDED')
    missingDocuments.push('Transfer agreement (IDTA or UK Addendum)');

  const sufficient = decision.instrumentStatus === 'EXECUTED' && decision.traStatus === 'COMPLETED';

  return finish(
    'SAFEGUARD_REVIEW',
    sufficient ? 'CONDITIONAL_CLEARANCE' : 'BLOCK_OR_ESCALATE',
    sufficient
      ? `${SAFEGUARDS[safeguard]} is executed and the TRA is complete. This is a conditional clearance subject to the other controls, not a legal clearance.`
      : `${SAFEGUARDS[safeguard]} is relied on, but ${[
          decision.instrumentStatus !== 'EXECUTED' ? 'the instrument is not signed or not provided' : null,
          decision.traStatus !== 'COMPLETED' ? 'the TRA is not complete' : null,
        ]
          .filter(Boolean)
          .join(' and ')}.`,
    sufficient
      ? 'Keep the signed instrument and the TRA on file; review on change.'
      : 'Escalate until the safeguard is signed and the TRA completed.',
  );

  /* The adequacy route: record the evidence, and check onward transfers. */
  function adequacyFinish() {
    if (route.onwardRecipients?.length)
      step(
        5,
        'Onward transfers from this recipient?',
        `${route.onwardRecipients.length} assessed as separate routes`,
      );
    return finish(
      'ADEQUACY_ROUTE',
      'ADEQUACY_EVIDENCE',
      `${destination} is covered by UK adequacy${decision.adequacyStatus === 'CONDITION_CONFIRMED' ? ', and the recipient’s eligibility is confirmed' : ''}. Onward transfers are assessed as their own routes.`,
      'Record the adequacy evidence; the other UK GDPR checks (Article 28 terms, security) still apply.',
    );
  }
}

/* Which safeguard the contract gives for this route, and why it may not count. */
function safeguardFromContract(route, terms) {
  if (!terms || !terms.safeguard) {
    return {
      safeguard: null,
      instrumentStatus: null,
      note: 'The contract does not name a transfer safeguard such as the IDTA or the UK Addendum.',
    };
  }
  if (terms.limitsCountries && !terms.allowedCountries.includes(route.importerCountry)) {
    return {
      safeguard: 'NONE',
      instrumentStatus: null,
      note: `The contract only allows transfers to ${terms.allowedCountries.map(nameOf).join(', ') || 'named countries'} (${terms.clauseRefs.join(', ')}), not to ${nameOf(route.importerCountry)}.`,
    };
  }
  return {
    safeguard: terms.safeguard,
    instrumentStatus: terms.instrumentStatus,
    note: `Named in ${terms.clauseRefs.join(', ') || terms.safeguardDocument}.`,
  };
}

/* Extra measures: what the buyer recorded, plus the vendor's Stage 3 answers that passed. */
function supplementaryMeasures(route, facts) {
  const list = [];
  if (facts.supplementaryMeasures) list.push(facts.supplementaryMeasures);
  const c = route.encryptionAccessControls || {};
  if (c.encryption === 'PASS') list.push('Encryption at rest and in transit (Stage 3 SEC-04)');
  if (c.privilegedMfa === 'PASS') list.push('MFA for privileged accounts (Stage 3 ACC-01)');
  if (c.remoteMfa === 'PASS') list.push('MFA for remote access (Stage 3 ACC-02)');
  if (c.leastPrivilege === 'PASS') list.push('Least-privilege access (Stage 3 ACC-03)');
  return list;
}

/* ------------------------------------------------------------------ */
/*  Steps 27 and 28 – output and stored fields                        */
/* ------------------------------------------------------------------ */

/* The legal mechanism in words (step 27 field 6). */
function mechanismOf(result) {
  const d = result.decision;
  if (d.applicableRegime === 'NOT_APPLICABLE') return 'Not needed (UK GDPR does not apply)';
  if (d.restrictedTransferFinding === 'NOT_RESTRICTED') return 'Not needed (no restricted transfer)';
  if (d.adequacyStatus === 'COVERED' || d.adequacyStatus === 'CONDITION_CONFIRMED')
    return 'UK adequacy regulations';
  if (!d.safeguardType || d.safeguardType === 'NOT_NEEDED') return 'Not established';
  if (d.safeguardType === 'UNKNOWN' || d.safeguardType === 'NONE') return 'None established';
  return SAFEGUARDS[d.safeguardType];
}

/* The safeguard status in words (step 27 field 7). */
function safeguardStatusOf(result) {
  const d = result.decision;
  if (['ADEQUACY_ROUTE', 'NO_RESTRICTED_TRANSFER'].includes(result.status)) return 'Not needed';
  if (!d.safeguardType || ['UNKNOWN', 'NONE'].includes(d.safeguardType)) return 'Missing';
  if (d.safeguardType === 'EXCEPTION') return 'Exception to be reviewed';
  return `${INSTRUMENT_STATUS[d.instrumentStatus]}; TRA ${TRA_STATUS[d.traStatus].toLowerCase()}`;
}

/* How serious the route is for Stage 7 (risk identification). */
function riskSeverityOf(result) {
  if (result.status === 'LEGAL_REVIEW_REQUIRED')
    return result.outcome === 'BLOCK_OR_ESCALATE' ? 'blocker' : 'fail';
  if (result.status === 'INFORMATION_REQUIRED') return 'unknown';
  if (result.status === 'EXCEPTION_REVIEW') return 'gap';
  if (result.status === 'SAFEGUARD_REVIEW') return result.outcome === 'CONDITIONAL_CLEARANCE' ? null : 'gap';
  return null;
}

/*
 * A fingerprint of everything that defines the route and its decision: the entities, locations,
 * facts and the safeguard found. Any change gives the route a new version (step 28 boundary).
 */
export function routeFingerprint(route, result) {
  const { id, onwardRecipients, ...rest } = route; // eslint-disable-line no-unused-vars
  const { routeId, ...decision } = result.decision; // eslint-disable-line no-unused-vars
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ route: rest, decision, status: result.status, outcome: result.outcome }))
    .digest('hex');
}

/**
 * Steps 25–28 together.
 *
 * @param {object} input
 *   requirement, buyer, vendor, processingRole, stage3, facts     (see mapRoutes)
 *   contract         { clauses, documents } from the latest Stage 4 analysis
 *   previousRoutes   the latest saved version of each route, by key ({ version, fingerprint })
 *   at               the time of this assessment
 */
export function assessTransfers(input) {
  const {
    requirement = {},
    contract = {},
    stage3 = {},
    previousRoutes = {},
    at = new Date().toISOString(),
  } = input;
  const contractTerms = readContractTransferTerms(contract.clauses || [], contract.documents || []);

  const routes = mapRoutes(input).map(route => {
    const result = decideRoute(route, { requirement, contractTerms, stage3 });

    // Step 28 boundary: a new entity, location or safeguard → a new route version.
    const fingerprint = routeFingerprint(route, result);
    const previous = previousRoutes[route.key];
    const routeVersion = !previous
      ? 1
      : previous.fingerprint === fingerprint
        ? previous.version
        : previous.version + 1;

    const exporter = `${route.exporter.name} (${nameOf(route.exporterCountry)})`;
    const importer = `${route.importer.name} (${nameOf(route.importerCountry)})`;
    const mechanism = mechanismOf(result);

    // References to the documents behind the decision.
    const documentReferences = [
      ...(contractTerms.clauseRefs || []),
      ...(contractTerms.safeguardDocument
        ? [`${contractTerms.safeguardDocument} (transfer instrument)`]
        : []),
      ...(route.facts?.documentReferences || []),
    ];

    return {
      ...route,
      // Kept for the pages and Stage 7, which read these names.
      fromName: nameOf(route.exporterCountry),
      toName: nameOf(route.importerCountry),

      status: result.status,
      statusLabel: ROUTE_STATUS[result.status].label,
      outcome: result.outcome,
      outcomeLabel: OUTCOMES[result.outcome],
      decision: result.decision,
      sequence: result.sequence,
      questions: result.questions,
      riskSeverity: riskSeverityOf(result),
      fingerprint,
      routeVersion,
      changed: !!previous && previous.fingerprint !== fingerprint,

      // Step 27: the 10 fields per route.
      output: {
        routeId: route.id,
        exporter,
        importer,
        destination: nameOf(route.importerCountry),
        restrictedTransferStatus: {
          RESTRICTED: 'Restricted transfer',
          NOT_RESTRICTED: 'Not a restricted transfer',
          UNDETERMINED: 'Not determined yet',
        }[result.decision.restrictedTransferFinding],
        legalMechanism: mechanism,
        safeguardStatus: safeguardStatusOf(result),
        missingDocuments: [...new Set(result.missingDocuments)],
        rationale: result.rationale,
        requiredAction: result.requiredAction,
      },

      // Step 28: the 12 stored fields per route.
      record: {
        routeId: route.id,
        exporter,
        importer,
        countries: {
          exporter: route.exporterCountry,
          importer: route.importerCountry,
          storage: route.storageLocation,
          access: route.remoteAccessLocation,
        },
        processingRoles: { exporter: route.exporterRole, importer: route.importerRole },
        restrictedTransferFinding: result.decision.restrictedTransferFinding,
        legalMechanism: mechanism,
        documentReferences,
        traReference: route.facts?.traReference || null,
        ruleVersion: S6_RULE_PACK,
        reviewer: route.facts?.legalReview?.by || route.facts?.confirmedBy || null,
        timestamp: at,
        routeVersion,
      },
    };
  });

  // The most serious status overall.
  const worst = routes.reduce(
    (current, route) =>
      !current || ROUTE_STATUS[route.status].rank > ROUTE_STATUS[current].rank ? route.status : current,
    null,
  );

  const questions = routes.flatMap(route =>
    route.questions.map(q => ({
      ...q,
      routeId: route.id,
      route: `${route.exporter.name} → ${route.importer.name}`,
    })),
  );
  const findings = routes
    .filter(route => ROUTE_STATUS[route.status].rank >= 2)
    .map(route => ({
      routeId: route.id,
      status: route.status,
      text: `${route.importer.name} (${route.toName}): ${route.output.rationale}`,
    }));

  const count = status => routes.filter(route => route.status === status).length;

  return {
    rulePackVersion: S6_RULE_PACK,
    overall: worst
      ? { status: worst, label: ROUTE_STATUS[worst].label }
      : { status: 'NO_RESTRICTED_TRANSFER', label: ROUTE_STATUS.NO_RESTRICTED_TRANSFER.label },
    totals: {
      routes: routes.length,
      restricted: routes.filter(r => r.decision.restrictedTransferFinding === 'RESTRICTED').length,
      noRestrictedTransfer: count('NO_RESTRICTED_TRANSFER'),
      adequacy: count('ADEQUACY_ROUTE'),
      safeguardReview: count('SAFEGUARD_REVIEW'),
      exceptionReview: count('EXCEPTION_REVIEW'),
      informationRequired: count('INFORMATION_REQUIRED'),
      legalReviewRequired: count('LEGAL_REVIEW_REQUIRED'),
      changedRoutes: routes.filter(r => r.changed).length,
      questions: questions.length,
    },
    contractTerms,
    flowMap: flowMap(routes),
    routes,
    findings,
    questions,
    note: TRANSFER_NOTE,
  };
}

/* The visual data-flow map: one node per entity, one edge per route (step 25 output). */
export function flowMap(routes) {
  const nodes = [];
  const edges = [];
  const nodeFor = (entity, country) => {
    const id = `${entity.kind === 'buyer' ? 'buyer' : entity.name}|${country}`;
    if (!nodes.some(n => n.id === id))
      nodes.push({ id, name: entity.name, country, countryName: nameOf(country), kind: entity.kind });
    return id;
  };
  for (const route of routes) {
    const from = nodeFor(route.exporter, route.exporterCountry);
    const to = nodeFor(route.importer, route.importerCountry);
    edges.push({ from, to, routeId: route.id, label: route.flow, status: route.status });
  }
  return { nodes, edges };
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}
