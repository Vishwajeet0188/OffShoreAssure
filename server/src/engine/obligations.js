/*
 * Stage 5 – Obligation extraction (steps 21 and 22).
 *
 * Step 21: each clause found in Stage 4 is split into sentences. A sentence that
 * says someone "shall", "must", "will" or "agrees to" do something is an
 * obligation; "shall not" or "must not" is a prohibition; "may" is a right.
 * We also record who it applies to, any deadline, how often, and the condition.
 *
 * Step 22: each obligation is linked to the topics of its clause, to the
 * assurance controls (ASS-xxx) and to a short list of rules. A rule with no
 * matching obligation is reported as a gap.
 *
 * The rules below are PROVISIONAL (rule pack RP-2026.10-S5-draft). They are the
 * UK GDPR Article 28 and 32–33 processor terms that the Stage 4 topics already
 * point to, and will be replaced by the client's Stage 5 specification.
 *
 * The result helps a reviewer; it is not a legal opinion.
 */
import { TOPICS } from './clauses.js';

export const S5_RULE_PACK = 'RP-2026.10-S5-draft';

export const REGISTER_NOTE =
  'Obligations are drawn automatically from the contract text. Check each one against the clause before relying on it. This is not a legal opinion.';

/* Who an obligation applies to. */
export const PARTIES = {
  vendor: 'Vendor',
  buyer: 'Buyer',
  both: 'Both parties',
  unknown: 'Not clear',
};

// Words a contract uses for each side when it does not use the company names.
const VENDOR_WORDS = ['supplier', 'vendor', 'service provider', 'provider', 'processor', 'contractor', 'sub-contractor'];
const BUYER_WORDS = ['customer', 'client', 'buyer', 'controller', 'purchaser'];
const BOTH_WORDS = ['each party', 'either party', 'both parties', 'the parties', 'neither party'];

/* Rules each obligation is checked against (step 22). */
export const RULES = [
  {
    id: 'R-DP-01',
    topicId: 'data_protection',
    party: 'vendor',
    text: 'The vendor processes personal data only on the buyer’s documented instructions.',
    source: 'UK GDPR Art. 28(3)(a)',
  },
  {
    id: 'R-DP-02',
    topicId: 'confidentiality',
    party: 'vendor',
    text: 'People authorised to process the data are bound by confidentiality.',
    source: 'UK GDPR Art. 28(3)(b)',
  },
  {
    id: 'R-SEC-01',
    topicId: 'security',
    party: 'vendor',
    text: 'The vendor applies appropriate technical and organisational security measures.',
    source: 'UK GDPR Art. 28(3)(c), Art. 32',
  },
  {
    id: 'R-SUB-01',
    topicId: 'subprocessors',
    party: 'vendor',
    text: 'The vendor uses sub-processors only with the buyer’s approval and passes on the same obligations.',
    source: 'UK GDPR Art. 28(2) and 28(4)',
  },
  {
    id: 'R-BRE-01',
    topicId: 'breach_notification',
    party: 'vendor',
    text: 'The vendor tells the buyer about a personal data breach without undue delay.',
    source: 'UK GDPR Art. 33(2)',
  },
  {
    id: 'R-TRF-01',
    topicId: 'international_transfer',
    party: 'vendor',
    text: 'Personal data leaves the UK only with an appropriate safeguard (for example the IDTA).',
    source: 'UK GDPR Chapter V',
  },
  {
    id: 'R-AUD-01',
    topicId: 'audit_rights',
    party: 'buyer',
    text: 'The buyer can audit or inspect the vendor, and the vendor provides the information needed.',
    source: 'UK GDPR Art. 28(3)(h)',
  },
  {
    id: 'R-EXIT-01',
    topicId: 'return_deletion',
    party: 'vendor',
    text: 'At the end of the service the vendor returns or deletes the personal data.',
    source: 'UK GDPR Art. 28(3)(g)',
  },
  {
    id: 'R-SLA-01',
    topicId: 'service_levels',
    party: 'vendor',
    text: 'Service levels (response, resolution, availability) are stated.',
    source: 'Requirement: service delivery (ASS-012)',
  },
];

// Modal verbs, checked in this order so "shall not" wins over "shall".
const MODALS = [
  { pattern: /\b(shall not|must not|will not|may not|is not permitted to|agrees not to)\b/i, type: 'Prohibition' },
  { pattern: /\b(shall|must|will|agrees to|undertakes to|is required to|is responsible for)\b/i, type: 'Obligation' },
  { pattern: /\b(may|is entitled to|has the right to)\b/i, type: 'Right' },
];

const FREQUENCY_PATTERNS = [
  /\b(each|every|per|once a|once in any)\s+(\d+\s*month period|\d+\s+(?:days|weeks|months)|day|week|month|quarter|year)\b/i,
  /\b(daily|weekly|monthly|quarterly|annually|yearly)\b/i,
];

const CONDITION_PATTERN = /\b(if|where|when|unless|on termination|upon termination|in the event of|on|upon)\b\s+([^,;.]{6,80})/i;

const DEADLINE_PATTERN = /\b(?:within|no later than|at least|before)\s+\d+\s*(?:minutes?|hours?|(?:working |business )?days?|weeks?|months?)\b|\bwithout undue delay\b|\bimmediately\b/gi;

/**
 * Finds the names a contract gives the two sides, for example
 *   UK Company Ltd (the "Customer") and Vendor A Test Ltd (the "Supplier").
 * Returns a map of lower-case term → 'vendor' | 'buyer'.
 */
export function findPartyNames(clauses, { buyerName = '', vendorName = '' } = {}) {
  const names = {};
  for (const word of VENDOR_WORDS) names[word] = 'vendor';
  for (const word of BUYER_WORDS) names[word] = 'buyer';
  if (buyerName) names[buyerName.toLowerCase()] = 'buyer';
  if (vendorName) names[vendorName.toLowerCase()] = 'vendor';

  // Defined terms such as (the "Supplier") or ("Provider").
  const allText = clauses.map(clause => clause.text).join(' ');
  for (const match of allText.matchAll(/\(\s*(?:the\s+)?["“']([A-Z][A-Za-z ]{2,30})["”']\s*\)/g)) {
    const term = match[1].toLowerCase();
    if (names[term]) continue;
    const before = allText.slice(Math.max(0, match.index - 80), match.index).toLowerCase();
    if (vendorName && before.includes(vendorName.toLowerCase())) names[term] = 'vendor';
    else if (buyerName && before.includes(buyerName.toLowerCase())) names[term] = 'buyer';
  }
  return names;
}

/* Splits a clause into sentences, keeping numbers such as "99.5" and "4.1" whole. */
export function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.;])\s+(?=[A-Z(])/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 15);
}

/* Who is the subject of the sentence: the words before the modal verb. */
export function findParty(sentence, modalIndex, partyNames) {
  const subject = sentence.slice(0, modalIndex).toLowerCase();

  if (BOTH_WORDS.some(word => subject.includes(word))) return 'both';

  // The name closest to the verb is the subject ("the Customer may audit the Supplier").
  let best = { party: 'unknown', position: -1 };
  for (const [name, party] of Object.entries(partyNames)) {
    const position = subject.lastIndexOf(name);
    if (position > best.position) best = { party, position };
  }
  return best.party;
}

function findDeadline(sentence) {
  const matches = sentence.match(DEADLINE_PATTERN);
  return matches ? matches.map(value => value.trim()) : [];
}

function findFrequency(sentence) {
  for (const pattern of FREQUENCY_PATTERNS) {
    const match = sentence.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function findCondition(sentence) {
  const match = sentence.match(CONDITION_PATTERN);
  if (!match) return null;
  const keyword = match[1].toLowerCase();
  // "on" and "upon" only count when they introduce an event, not "on 30 days' notice".
  if ((keyword === 'on' || keyword === 'upon') && !/^(termination|expiry|request|completion|receipt)/i.test(match[2])) return null;
  return match[0].trim();
}

function confidenceFor({ party, topics, modal }) {
  if (party !== 'unknown' && topics.length > 0 && modal !== 'will') return 'High';
  if (party !== 'unknown') return 'Medium';
  return 'Low';
}

/**
 * Step 21: extract obligations, prohibitions and rights from the Stage 4 clauses.
 *
 * @param {Array} clauses   clauses from the contract analysis (Stage 4)
 * @param {{ buyerName?: string, vendorName?: string }} parties
 */
export function extractObligations(clauses, parties = {}) {
  const partyNames = findPartyNames(clauses, parties);
  const obligations = [];

  for (const clause of clauses) {
    for (const sentence of splitSentences(clause.text)) {
      const modal = MODALS
        .map(candidate => ({ ...candidate, match: sentence.match(candidate.pattern) }))
        .find(candidate => candidate.match);
      if (!modal) continue;

      const topics = (clause.topics || []).map(topic => topic.topicId);
      const party = findParty(sentence, modal.match.index, partyNames);

      obligations.push({
        id: `OB-${String(obligations.length + 1).padStart(3, '0')}`,
        type: modal.type,
        party,
        text: sentence,
        deadline: findDeadline(sentence),
        frequency: findFrequency(sentence),
        condition: findCondition(sentence),
        source: { clauseId: clause.id, clauseNumber: clause.number, heading: clause.heading, page: clause.page },
        topics,
        confidence: confidenceFor({ party, topics, modal: modal.match[1].toLowerCase() }),
      });
    }
  }
  return obligations;
}

/**
 * Step 22: link obligations to controls and rules, and list the rules that no
 * obligation covers.
 *
 * @param {Array} obligations          from extractObligations
 * @param {string[]} applicableControls control ids from the requirement profile (Stage 1)
 */
export function mapToRules(obligations, applicableControls = []) {
  const topicControls = Object.fromEntries(TOPICS.map(topic => [topic.id, topic.controls]));

  const mapped = obligations.map(obligation => {
    const controls = [...new Set(obligation.topics.flatMap(topicId => topicControls[topicId] || []))];
    const rules = RULES
      .filter(rule => obligation.topics.includes(rule.topicId) && (rule.party === obligation.party || obligation.party === 'both'))
      .map(rule => rule.id);
    return {
      ...obligation,
      controls,
      requirementControls: controls.filter(id => applicableControls.includes(id)),
      rules,
    };
  });

  const ruleTrace = RULES.map(rule => {
    const covering = mapped.filter(obligation => obligation.rules.includes(rule.id));
    const controls = topicControls[rule.topicId] || [];
    return {
      ...rule,
      controls,
      appliesToRequirement: controls.length === 0 || controls.some(id => applicableControls.includes(id)),
      status: covering.length > 0 ? 'COVERED' : 'NOT_FOUND',
      obligationIds: covering.map(obligation => obligation.id),
    };
  });

  return { obligations: mapped, ruleTrace };
}

/* Steps 21–22 together, with the totals shown to the buyer (step 23). */
export function buildRegister(clauses, { buyerName, vendorName, applicableControls = [] } = {}) {
  const extracted = extractObligations(clauses, { buyerName, vendorName });
  const { obligations, ruleTrace } = mapToRules(extracted, applicableControls);

  const count = predicate => obligations.filter(predicate).length;
  const gaps = ruleTrace.filter(rule => rule.status === 'NOT_FOUND' && rule.appliesToRequirement);

  return {
    rulePackVersion: S5_RULE_PACK,
    totals: {
      obligations: count(o => o.type === 'Obligation'),
      prohibitions: count(o => o.type === 'Prohibition'),
      rights: count(o => o.type === 'Right'),
      vendor: count(o => o.party === 'vendor'),
      buyer: count(o => o.party === 'buyer'),
      both: count(o => o.party === 'both'),
      unclear: count(o => o.party === 'unknown'),
      withDeadline: count(o => o.deadline.length > 0),
      rulesCovered: ruleTrace.filter(rule => rule.status === 'COVERED').length,
      rulesTotal: ruleTrace.length,
      gaps: gaps.length,
    },
    obligations,
    ruleTrace,
    gaps: gaps.map(rule => ({
      ruleId: rule.id,
      text: `No obligation found for: ${rule.text}`,
      source: rule.source,
    })),
    note: REGISTER_NOTE,
  };
}
