/*
 * Stage 6 – Transfer assessment (steps 25 and 26).
 *
 * Step 25: list the routes personal data takes from the UK: where it is stored,
 * where it is accessed from, where the vendor delivers from, and sub-processors.
 *
 * Step 26: check each route. Who receives the data and in what role, whether
 * the destination is covered by UK adequacy regulations, whether the contract
 * has a transfer safeguard (IDTA, Addendum) that allows that country, and what
 * the vendor said in Stage 3.
 *
 * The country list and the checks are PROVISIONAL (rule pack RP-2026.10-S6-draft)
 * until the client sends the Stage 6 specification. The adequacy list should be
 * checked against the ICO's current list before the result is relied on.
 *
 * The result shows what to check and ask. It is not a legal opinion and never
 * says a transfer is "compliant".
 */
import { countryName } from '../reference/countries.js';

export const S6_RULE_PACK = 'RP-2026.10-S6-draft';

export const TRANSFER_NOTE =
  'This is a route-by-route view of where personal data goes and what still needs checking. It is not a legal opinion. Check the adequacy list against the ICO’s current guidance.';

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

/* Destinations covered by UK adequacy regulations ("data bridges"). Some only cover part of the destination. */
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

/* What each route status means for the buyer. Ordered from most to least serious. */
export const ROUTE_STATUS = {
  NOT_PERMITTED: { label: 'Not permitted', tone: 'coral', rank: 6 },
  SAFEGUARD_MISSING: { label: 'Safeguard missing', tone: 'coral', rank: 5 },
  INFORMATION_NEEDED: { label: 'Information needed', tone: 'amber', rank: 4 },
  SAFEGUARD_TRA_NEEDED: { label: 'Safeguard in contract · risk assessment needed', tone: 'amber', rank: 3 },
  ADEQUATE_CHECK: { label: 'Adequacy applies, with a condition', tone: 'amber', rank: 2 },
  ADEQUATE: { label: 'Covered by UK adequacy', tone: 'sage', rank: 1 },
  NOT_RESTRICTED: { label: 'Stays in the UK', tone: 'sage', rank: 0 },
};

const SAFEGUARD_TERMS = [
  ['international data transfer agreement', 'International Data Transfer Agreement (IDTA)'],
  ['idta', 'International Data Transfer Agreement (IDTA)'],
  ['addendum', 'UK Addendum to the EU Standard Contractual Clauses'],
  ['standard contractual clauses', 'Standard Contractual Clauses (with the UK Addendum)'],
  ['binding corporate rules', 'Binding Corporate Rules'],
];

const UNKNOWN = 'UNKNOWN';
const nameOf = code => (code === UNKNOWN ? 'Not confirmed' : countryName(code) || code);

/**
 * Reads what the contract says about transfers (from the Stage 4 clauses):
 * which safeguards it names, which countries it allows, and the clause numbers.
 */
export function readContractTransferTerms(clauses = []) {
  const transferClauses = clauses.filter(clause =>
    (clause.topics || []).some(t => t.topicId === 'international_transfer'),
  );
  const text = transferClauses.map(clause => clause.text).join(' ');
  const lower = text.toLowerCase();

  const safeguards = [
    ...new Set(SAFEGUARD_TERMS.filter(([term]) => lower.includes(term)).map(([, label]) => label)),
  ];

  // "outside the United Kingdom except to India" → only the named countries are allowed.
  const limitsCountries = /\b(?:not|no)\b[^.]*\boutside\b[^.]*\b(?:except|other than|unless)\b/i.test(text);
  const namedCountries = Object.keys(ADEQUACY)
    .concat(['IN', 'PH', 'BR', 'ZA', 'MX', 'CN', 'SG', 'MY', 'EG', 'UA', 'VN', 'LK', 'PK', 'BD', 'AE', 'AU'])
    .filter(code => {
      const name = countryName(code);
      return name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
    });

  return {
    clauseNumbers: transferClauses.map(clause => clause.number),
    safeguards,
    limitsCountries,
    allowedCountries: [...new Set(namedCountries)],
  };
}

/**
 * Step 25: the routes personal data takes, one per destination.
 *
 * @param {object} requirement  the Stage 1 answers
 * @param {{ name: string, country?: string, deliveryCountries?: string[] }} vendor
 */
export function mapRoutes(requirement, vendor) {
  const origin = requirement.buyerCountry || 'GB';
  const routes = new Map();

  function addRoute(destination, use, recipient, role) {
    if (!routes.has(destination)) {
      routes.set(destination, { destination, uses: [], recipients: [] });
    }
    const route = routes.get(destination);
    if (!route.uses.includes(use)) route.uses.push(use);
    if (!route.recipients.some(r => r.name === recipient && r.role === role))
      route.recipients.push({ name: recipient, role });
  }

  const hostedInCloud = requirement.cloudServices === 'Yes';
  for (const country of requirement.storageCountries || []) {
    addRoute(
      country,
      'Data storage',
      hostedInCloud ? 'Cloud hosting provider (to be named)' : vendor.name,
      hostedInCloud ? 'Sub-processor' : 'Processor',
    );
  }
  for (const country of requirement.remoteAccessCountries || []) {
    addRoute(country, 'Remote access', vendor.name, 'Processor');
  }
  for (const country of vendor.deliveryCountries || []) {
    addRoute(country, 'Vendor delivery centre', vendor.name, 'Processor');
  }
  if (['Allowed', 'Approval required'].includes(requirement.subprocessors)) {
    addRoute(UNKNOWN, 'Sub-processors', 'Sub-processors (to be listed by the vendor)', 'Sub-processor');
  }

  return [...routes.values()].map((route, index) => ({
    id: `RT-${String(index + 1).padStart(2, '0')}`,
    from: origin,
    fromName: nameOf(origin),
    to: route.destination,
    toName: nameOf(route.destination),
    uses: route.uses,
    recipients: route.recipients,
  }));
}

/**
 * Step 26: check one route and return its status, the checks made, and the
 * questions it raises.
 */
export function checkRoute(route, context) {
  const { requirement, contractTerms, vendorTransferScore } = context;
  const checks = [];
  const questions = [];

  const ask = (to, text) => questions.push({ to, text });
  const check = (name, result, detail) => checks.push({ name, result, detail });

  // Data that stays in the UK is not a restricted transfer.
  if (route.to === route.from) {
    check('Destination', 'OK', `${route.toName} is the buyer’s own country.`);
    return { status: 'NOT_RESTRICTED', checks, questions };
  }

  if (route.to === UNKNOWN) {
    check('Destination', 'UNKNOWN', `${route.uses.join(', ')}: the location is not confirmed yet.`);
    ask(
      'vendor',
      route.uses.includes('Sub-processors')
        ? 'List every sub-processor with the country where it stores or accesses the data.'
        : 'Confirm the country where the data is stored or accessed from.',
    );
    return { status: 'INFORMATION_NEEDED', checks, questions };
  }

  // 1. The buyer said the service must not be delivered from this country.
  if ((requirement.restrictedCountries || []).includes(route.to)) {
    check(
      'Restricted country',
      'FAIL',
      `The requirement says the service must not be delivered from ${route.toName}.`,
    );
    ask('buyer', `Confirm whether data may go to ${route.toName}, or ask the vendor to remove this route.`);
    return { status: 'NOT_PERMITTED', checks, questions };
  }
  check('Restricted country', 'OK', `${route.toName} is not on the buyer’s restricted list.`);

  // 2. Recipients and their roles.
  for (const recipient of route.recipients) {
    check(
      'Recipient',
      recipient.name.includes('to be') ? 'UNKNOWN' : 'OK',
      `${recipient.name} · ${recipient.role}`,
    );
    if (recipient.name.includes('to be'))
      ask('vendor', `Name the ${recipient.role.toLowerCase()} that receives the data in ${route.toName}.`);
  }
  if (route.recipients.some(r => r.name === context.vendorName)) {
    ask('vendor', `Confirm the legal entity that receives the data in ${route.toName}.`);
  }

  // 3. UK adequacy regulations.
  if (route.to in ADEQUACY) {
    const condition = ADEQUACY[route.to];
    check(
      'UK adequacy',
      condition ? 'CONDITION' : 'OK',
      condition || `${route.toName} is covered by UK adequacy regulations.`,
    );
    if (condition) {
      ask('vendor', `${route.toName}: ${condition} Confirm that the recipient meets this.`);
      return { status: 'ADEQUATE_CHECK', checks, questions };
    }
    return { status: 'ADEQUATE', checks, questions };
  }
  check(
    'UK adequacy',
    'NO',
    `${route.toName} is not covered by UK adequacy regulations, so a safeguard is needed.`,
  );

  // 4. A safeguard in the contract that allows this country.
  const clauses = contractTerms.clauseNumbers.length
    ? ` (clause ${contractTerms.clauseNumbers.join(', ')})`
    : '';
  if (contractTerms.safeguards.length === 0) {
    check(
      'Safeguard in contract',
      'FAIL',
      'The contract does not name a transfer safeguard such as the IDTA or the UK Addendum.',
    );
    ask('buyer', `Add a transfer safeguard (IDTA or UK Addendum) to the contract for ${route.toName}.`);
    return { status: 'SAFEGUARD_MISSING', checks, questions };
  }
  if (contractTerms.limitsCountries && !contractTerms.allowedCountries.includes(route.to)) {
    check(
      'Safeguard in contract',
      'FAIL',
      `The contract only allows transfers to ${contractTerms.allowedCountries.map(nameOf).join(', ') || 'named countries'}${clauses}, not to ${route.toName}.`,
    );
    ask(
      'buyer',
      `Either add ${route.toName} to the contract’s transfer clause or ask the vendor to stop this route.`,
    );
    return { status: 'SAFEGUARD_MISSING', checks, questions };
  }
  check('Safeguard in contract', 'OK', `${contractTerms.safeguards.join('; ')}${clauses}.`);

  // 5. A transfer risk assessment is needed for a safeguard route.
  check(
    'Transfer risk assessment',
    'NEEDED',
    `A transfer risk assessment (TRA) is needed for ${route.toName}.`,
  );
  ask('vendor', `Provide the transfer risk assessment (TRA) for ${route.fromName} → ${route.toName}.`);

  // 6. What the vendor said about transfers in Stage 3.
  if (vendorTransferScore !== null && vendorTransferScore < 100) {
    check(
      'Vendor answers (Stage 3)',
      'GAP',
      `The vendor’s transfer controls (ASS-005) scored ${vendorTransferScore}/100.`,
    );
    ask('vendor', 'Explain the gaps in your answers on international transfers (ASS-005).');
  }

  // 7. Special-category data raises the bar.
  if (requirement.specialCategory === 'Yes') {
    check(
      'Special-category data',
      'HIGHER RISK',
      'Special-category data is involved; the risk assessment needs extra care.',
    );
  }

  return { status: 'SAFEGUARD_TRA_NEEDED', checks, questions };
}

/**
 * Steps 25–26 together, with the findings and questions shown to the buyer (step 27).
 */
export function assessTransfers({ requirement, vendor, contractClauses = [], vendorTransferScore = null }) {
  const contractTerms = readContractTransferTerms(contractClauses);
  const context = { requirement, contractTerms, vendorTransferScore, vendorName: vendor.name };

  const routes = mapRoutes(requirement, vendor).map(route => {
    const result = checkRoute(route, context);
    return { ...route, ...result, statusLabel: ROUTE_STATUS[result.status].label };
  });

  const worst = routes.reduce(
    (current, route) =>
      !current || ROUTE_STATUS[route.status].rank > ROUTE_STATUS[current].rank ? route.status : current,
    null,
  );

  const questions = routes.flatMap(route =>
    route.questions.map(q => ({ ...q, routeId: route.id, route: `${route.fromName} → ${route.toName}` })),
  );
  const findings = routes
    .filter(route => ROUTE_STATUS[route.status].rank >= 3)
    .map(route => ({
      routeId: route.id,
      status: route.status,
      text: `${route.fromName} → ${route.toName}: ${ROUTE_STATUS[route.status].label.toLowerCase()}.`,
    }));

  const count = status => routes.filter(route => route.status === status).length;

  return {
    rulePackVersion: S6_RULE_PACK,
    overall: worst
      ? { status: worst, label: ROUTE_STATUS[worst].label }
      : { status: 'NOT_RESTRICTED', label: ROUTE_STATUS.NOT_RESTRICTED.label },
    totals: {
      routes: routes.length,
      restricted: routes.filter(route => route.status !== 'NOT_RESTRICTED').length,
      adequate: count('ADEQUATE') + count('ADEQUATE_CHECK'),
      safeguardNeeded: count('SAFEGUARD_TRA_NEEDED') + count('SAFEGUARD_MISSING'),
      notPermitted: count('NOT_PERMITTED'),
      informationNeeded: count('INFORMATION_NEEDED'),
      questions: questions.length,
    },
    contractTerms,
    routes,
    findings,
    questions,
    note: TRANSFER_NOTE,
  };
}
