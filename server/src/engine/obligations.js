/*
 * Stage 5 – Obligation extraction
 * Client specification: "Offshore Assure – Input / Output Stage 4, 5, 6" (steps 21–24).
 *
 * Step 21  Each clause from the Stage 4 contract set is read sentence by sentence.
 *          A sentence that puts a duty on someone ("shall", "must", "agrees to") becomes an
 *          obligation with the 12 fields of the specification:
 *            Obligation ID, Source Document, Source Clause, Responsible Party, Beneficiary,
 *            Obligation Description, Trigger, Deadline, Frequency, Required Evidence,
 *            Consequence and Status.
 *          If the contract gives no deadline we store UNSPECIFIED. We never invent a timeframe.
 *
 * Step 22  Each obligation is mapped to the rules it supports. A mapping has the 8 fields:
 *            Obligation ID, Clause ID, Requirement ID, Rule ID, Rule Version,
 *            Applicability Status, Mapping Confidence and Reviewer Status.
 *          The engine then checks: legal or contractual basis, the right responsible party,
 *          completeness, conflicting clauses, downstream (sub-processor) duties and evidence.
 *          One clause may support many obligations, and one rule may need many clauses.
 *
 * Step 23  The buyer sees the register (9 fields per obligation) with filters.
 *          Low-confidence obligations are marked "Requires verification", and they are not
 *          monitored or escalated automatically until a reviewer verifies them.
 *
 * Step 24  The register is saved with 10 stored fields per obligation and monitoring triggers.
 *          A reviewer's edit makes a new version (v1.1, v1.2 …) and keeps the original source.
 *
 * The results help a reviewer. They are not a legal opinion.
 */
import { CATEGORY, TOPICS } from './clauses.js';

export const S5_RULE_PACK = 'RP-2026.11-S5';

export const REGISTER_NOTE =
  'Obligations are drawn from the contract text automatically. Check each one against its clause before relying on it. Low-confidence obligations are not monitored or escalated until a reviewer verifies them. This is not a legal opinion.';

// Below this extraction confidence an obligation needs a person to verify it.
export const REVIEW_THRESHOLD = 0.6;

/* ------------------------------------------------------------------ */
/*  Fixed lists (shown in the app and used by the filters)            */
/* ------------------------------------------------------------------ */

/* Who an obligation applies to. */
export const PARTIES = {
  vendor: 'Vendor',
  buyer: 'Buyer',
  both: 'Both parties',
  unknown: 'Not clear',
};

/* The status of each obligation (step 21 "Status", step 23 "Review Status"). */
export const OBLIGATION_STATUS = {
  UNVERIFIED: 'Unverified',
  REQUIRES_VERIFICATION: 'Requires verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected by reviewer',
};

/* What starts the obligation (step 21 "Trigger"). */
export const TRIGGER_TYPES = {
  EVENT: 'Event',
  ON_REQUEST: 'On request',
  ON_TERMINATION: 'On termination or expiry',
  SCHEDULED: 'Scheduled',
  ONGOING: 'Ongoing duty',
};

/* How the deadline is written in the contract (step 21 "Deadline"). */
export const DEADLINE_TYPES = {
  DURATION: 'Duration',
  DATE: 'Date',
  QUALITATIVE: 'Stated in words',
  UNSPECIFIED: 'UNSPECIFIED',
};

/* How often the obligation applies (step 21 "Frequency"). */
export const FREQUENCIES = {
  EVENT_DRIVEN: 'Event-driven',
  CONTINUOUS: 'Continuous',
  ONE_OFF: 'One-off',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
  PERIODIC: 'Periodic (other)',
};

/* Step 22: what the reviewer said about a mapping. */
export const MAPPING_REVIEW = {
  UNREVIEWED: 'Not reviewed',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
};

/* ------------------------------------------------------------------ */
/*  Step 21 – reading the sentences                                   */
/* ------------------------------------------------------------------ */

// Words a contract uses for each side when it does not use the company names.
const VENDOR_WORDS = [
  'supplier',
  'vendor',
  'service provider',
  'provider',
  'processor',
  'contractor',
  'sub-contractor',
];
const BUYER_WORDS = ['customer', 'client', 'buyer', 'controller', 'purchaser'];
const BOTH_WORDS = ['each party', 'either party', 'both parties', 'the parties', 'neither party'];

// Modal verbs. They are checked in this order, so "shall not" wins over "shall".
const MODALS = [
  {
    pattern: /\b(shall not|must not|will not|may not|is not permitted to|agrees not to)\b/i,
    type: 'Prohibition',
  },
  {
    pattern: /\b(shall|must|will|agrees to|undertakes to|is required to|is responsible for)\b/i,
    type: 'Obligation',
  },
  { pattern: /\b(may|is entitled to|has the right to)\b/i, type: 'Right' },
];

// Deadlines written as a period of time, for example "within 24 hours" or "no later than 30 days".
const DURATION_PATTERN =
  /\b(?:within|no later than|not later than|at least|before)\s+(?:\d+|one|two|three|five|seven|ten|fourteen|thirty)\s*(?:\(\d+\)\s*)?(?:minutes?|hours?|(?:working |business |calendar )?days?|weeks?|months?)\b/i;

// Deadlines written as a date, for example "by 31 March 2027".
const DATE_PATTERN =
  /\b(?:by|on or before|no later than)\s+(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i;

// Deadlines written only in words. We keep the words; we do not turn them into hours.
const QUALITATIVE_PATTERN =
  /\b(without undue delay|immediately|promptly|as soon as (?:reasonably )?practicable)\b/i;

// How often something is repeated.
const FREQUENCY_WORDS = [
  [/\b(daily|each day|every day)\b/i, 'DAILY'],
  [/\b(weekly|each week|every week)\b/i, 'WEEKLY'],
  [/\b(monthly|each month|every month|per month)\b/i, 'MONTHLY'],
  [/\b(quarterly|each quarter|every quarter|per quarter)\b/i, 'QUARTERLY'],
  [/\b(annually|yearly|each year|every year|per year|once a year)\b/i, 'ANNUALLY'],
  [/\b(once in any \d+\s*months? period|every \d+\s+(?:days|weeks|months))\b/i, 'PERIODIC'],
];

// Events that start an obligation.
const EVENT_PATTERNS = [
  [/\bbecoming aware\b|\bbecomes? aware\b/i, 'Becoming aware of the event'],
  [/\bpriority\s*\d+\s+incidents?\b/i, 'A priority incident is raised'],
  [
    /\b(?:on|upon)\s+(?:the customer'?s?|the buyer'?s?|written)?\s*request\b|\bif requested\b|\bwhen requested\b/i,
    'A request from the other party',
  ],
  [
    /\b(?:on|upon)\s+(?:the\s+)?(?:termination|expiry|expiration)\b|\bat the end of\b/i,
    'Termination or expiry of the agreement',
  ],
  [/\bin the event of\s+([^,;.]{4,60})/i, null],
  [/\b(?:if|where|when|unless)\s+([^,;.]{6,70})/i, null],
];

// Words that say what happens when an obligation is missed.
const REMEDY_PATTERN =
  /\b(service credits?|fee (?:reduction|deduction)s?|liquidated damages|penalt(?:y|ies)|indemnif(?:y|ies|ication)|liable for|may (?:immediately )?terminate[^.;]*\b(?:breach|fails?|failure)|suspend)/i;
const BREACH_PATTERN = /\b(material breach|breach of (?:this|the) agreement|fails? to (?:perform|comply))\b/i;
const ESCALATION_PATTERN = /\b(escalat(?:e|ion)|governance board|steering committee|dispute resolution)\b/i;

// Sentences about sub-processors that pass duties downstream (flow-down).
const DOWNSTREAM_PATTERN = /\b(sub-?processors?|subcontractors?|sub-?contractors?)\b/i;

/* What a reviewer would expect as proof, by clause category (step 21 "Required Evidence"). */
const EVIDENCE_BY_CATEGORY = {
  'CL-01': ['Processing details schedule'],
  'CL-02': ['Processing details schedule'],
  'CL-03': ['Data inventory (data and data subjects)'],
  'CL-04': ['Documented processing instructions'],
  'CL-05': ['Staff confidentiality agreements'],
  'CL-06': ['Information security policy', 'Penetration-test summary'],
  'CL-07': ['Subprocessor approval record', 'Subprocessor register'],
  'CL-08': ['Subprocessor change notice'],
  'CL-09': ['Subprocessor agreement with the same terms'],
  'CL-10': ['Data-subject request log'],
  'CL-11': ['Breach notification record', 'DPIA assistance record'],
  'CL-12': ['Return or deletion certificate'],
  'CL-13': ['Audit report or information provided'],
  'CL-14': ['Transfer agreement (IDTA or UK Addendum)', 'Transfer risk assessment'],
  'CL-15': ['Incident notification record'],
  'CL-16': ['Service level report'],
  'CL-17': ['Business continuity and disaster recovery test report'],
  'CL-18': ['Exit plan', 'Access revocation record'],
  'CL-19': [],
  'CL-20': ['Approved change request'],
};

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

  // Defined terms such as (the "Supplier") or ("Provider"): the company named just before decides the side.
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
  return String(text || '')
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

/* The deadline as written. When there is none we say so: UNSPECIFIED. */
export function findDeadline(sentence) {
  const duration = sentence.match(DURATION_PATTERN);
  if (duration) return { type: 'DURATION', text: tidy(duration[0]) };

  const date = sentence.match(DATE_PATTERN);
  if (date) return { type: 'DATE', text: tidy(date[0]) };

  const words = sentence.match(QUALITATIVE_PATTERN);
  if (words) return { type: 'QUALITATIVE', text: capitalise(words[0]) };

  return { type: 'UNSPECIFIED', text: 'UNSPECIFIED' };
}

/* What starts the obligation: an event, a request, termination, a schedule or nothing (ongoing). */
export function findTrigger(sentence, frequency) {
  for (const [pattern, label] of EVENT_PATTERNS) {
    const match = sentence.match(pattern);
    if (!match) continue;

    // Fixed labels for the common events, otherwise the words from the contract.
    const text = label || capitalise(tidy(match[1] || match[0]));
    let type = 'EVENT';
    if (label?.startsWith('A request')) type = 'ON_REQUEST';
    if (label?.startsWith('Termination')) type = 'ON_TERMINATION';
    return { type, text };
  }

  if (frequency && !['CONTINUOUS', 'EVENT_DRIVEN', 'ONE_OFF'].includes(frequency))
    return { type: 'SCHEDULED', text: FREQUENCIES[frequency] };

  return { type: 'ONGOING', text: 'Applies throughout the agreement' };
}

/* How often: a stated repeat, otherwise worked out from the trigger. */
export function findFrequency(sentence) {
  for (const [pattern, code] of FREQUENCY_WORDS) {
    if (pattern.test(sentence)) return code;
  }
  return null;
}

/*
 * What the contract says happens if the obligation is missed:
 *  1. a remedy in the same sentence or the same section (service credits, termination …)
 *  2. otherwise a general breach term anywhere in the contract
 *  3. otherwise an escalation route (governance board, dispute resolution)
 *  4. otherwise "not stated" – we do not invent one.
 */
export function consequenceFor(sentence, clause, clauses) {
  if (REMEDY_PATTERN.test(sentence))
    return { type: 'CONTRACTUAL_REMEDY', text: sentence, clauseRef: clause.number };

  // The same clause first, then the rest of its section ("3.1" looks at 3.2, 3.3 …).
  const section = String(clause.number || '').split('.')[0];
  const nearby = [
    clause,
    ...clauses.filter(
      other =>
        other !== clause &&
        other.documentId === clause.documentId &&
        section &&
        String(other.number || '').split('.')[0] === section,
    ),
  ];
  for (const other of nearby) {
    const remedy = splitSentences(other.text).find(line => line !== sentence && REMEDY_PATTERN.test(line));
    if (remedy) return { type: 'CONTRACTUAL_REMEDY', text: remedy, clauseRef: other.number };
  }

  for (const other of clauses) {
    const general = splitSentences(other.text).find(
      line => BREACH_PATTERN.test(line) && REMEDY_PATTERN.test(line),
    );
    if (general) return { type: 'GENERAL_BREACH_TERM', text: general, clauseRef: other.number };
  }

  for (const other of clauses) {
    const escalation = splitSentences(other.text).find(line => ESCALATION_PATTERN.test(line));
    if (escalation) return { type: 'ESCALATION', text: escalation, clauseRef: other.number };
  }

  return { type: 'NOT_STATED', text: 'Not stated in the contract', clauseRef: null };
}

/*
 * A short plain description: the words after the modal verb, for example
 *   "The Supplier shall notify the Customer of any breach within 24 hours"
 *   → "Notify the Customer of any breach within 24 hours".
 */
export function describe(sentence, modalMatch, type) {
  const rest = sentence
    .slice(modalMatch.index + modalMatch[0].length)
    .replace(/[.;]\s*$/, '')
    .trim();
  const text = rest.length > 180 ? rest.slice(0, 177).trimEnd() + '…' : rest;
  if (type === 'Prohibition') return 'Must not ' + text;
  if (type === 'Right') return 'May ' + text;
  return capitalise(text);
}

/* Extraction confidence 0–1: the clause's own confidence, lowered when the party or category is unclear. */
function confidenceFor({ clause, party, categories, modalWord }) {
  let value = typeof clause.confidence === 'number' ? clause.confidence : 0.6;

  if (party === 'unknown') value *= 0.5; // we could not tell who must do it
  if (!categories.length) value *= 0.85; // the clause is not in any of the 20 categories
  if (modalWord === 'will') value *= 0.9; // "will" is sometimes a statement, not a duty
  if (clause.reviewStatus === 'VERIFIED') value = Math.max(value, 0.9);

  return Math.round(Math.min(0.99, value) * 100) / 100;
}

/* The other side benefits from the obligation. */
function beneficiaryOf(party) {
  if (party === 'vendor') return 'buyer';
  if (party === 'buyer') return 'vendor';
  if (party === 'both') return 'both';
  return 'unknown';
}

/**
 * Step 21: obligations, prohibitions and rights from the Stage 4 clause register.
 *
 * @param {Array} clauses     the clauses of the latest contract analysis (Stage 4)
 * @param {object} context
 *   buyerName, vendorName    the two organisations
 *   documents                DOC-001 … → { type, title, uuid, executionStatus }
 */
export function extractObligations(clauses, { buyerName = '', vendorName = '', documents = {} } = {}) {
  const partyNames = findPartyNames(clauses, { buyerName, vendorName });
  const nameOf = party =>
    ({ vendor: vendorName || 'Vendor', buyer: buyerName || 'Buyer', both: 'Both parties' })[party] ||
    'Not clear';

  const obligations = [];

  for (const clause of clauses) {
    const sentences = splitSentences(clause.text);

    sentences.forEach((sentence, sentenceIndex) => {
      // Is there a modal verb? If not, the sentence is a description, not a duty.
      const modal = MODALS.map(candidate => ({
        ...candidate,
        match: sentence.match(candidate.pattern),
      })).find(candidate => candidate.match);
      if (!modal) return;

      const party = findParty(sentence, modal.match.index, partyNames);
      const categories = clause.categories || (clause.category ? [clause.category] : []);
      const frequencyWord = findFrequency(sentence);
      const deadline = findDeadline(sentence);
      const trigger = findTrigger(sentence, frequencyWord);

      // When no repeat is written, the trigger tells us how often.
      let frequency = frequencyWord;
      if (!frequency) {
        if (trigger.type === 'ONGOING') frequency = 'CONTINUOUS';
        else if (trigger.type === 'ON_TERMINATION') frequency = 'ONE_OFF';
        else frequency = 'EVENT_DRIVEN';
      }

      const confidence = confidenceFor({
        clause,
        party,
        categories,
        modalWord: modal.match[1].toLowerCase(),
      });

      const document = documents[clause.documentId] || {};

      obligations.push({
        // 1. Obligation ID (positions are given after sorting below).
        id: null,
        key: `${clause.key || clause.id}#${sentenceIndex + 1}`, // stable across analyses, used by reviewer edits
        type: modal.type,

        // 2. Source Document and 3. Source Clause.
        sourceDocument: {
          id: clause.documentId || null,
          uuid: clause.documentUuid || document.uuid || null,
          type: document.type || null,
          title: document.title || null,
          executed: document.executionStatus ? document.executionStatus === 'SIGNED' : null,
        },
        sourceClause: {
          clauseId: clause.id,
          section: clause.number,
          heading: clause.heading || null,
          page: clause.page || null,
        },

        // 4. Responsible Party and 5. Beneficiary.
        party,
        responsibleParty: { party, name: nameOf(party) },
        beneficiary: { party: beneficiaryOf(party), name: nameOf(beneficiaryOf(party)) },

        // 6. Obligation Description, with the original sentence kept as it was.
        description: describe(sentence, modal.match, modal.type),
        text: sentence,

        // 7. Trigger, 8. Deadline and 9. Frequency.
        trigger,
        deadline,
        frequency,

        // 10. Required Evidence.
        requiredEvidence: requiredEvidenceFor(categories, modal.type),

        // 11. Consequence (a right has none).
        consequence: modal.type === 'Right' ? null : consequenceFor(sentence, clause, clauses),

        // 12. Status. Low confidence or an unclear party needs a person first.
        status: confidence < REVIEW_THRESHOLD || party === 'unknown' ? 'REQUIRES_VERIFICATION' : 'UNVERIFIED',

        categories,
        topics: (clause.topics || []).map(topic => topic.topicId),
        downstream: modal.type !== 'Right' && DOWNSTREAM_PATTERN.test(sentence),
        confidence,
        version: 1,
        original: null, // filled in when a reviewer edits the obligation
      });
    });
  }

  // Number them in contract order: OBL-001, OBL-002 …
  obligations.forEach((obligation, index) => {
    obligation.id = `OBL-${String(index + 1).padStart(3, '0')}`;
  });

  return obligations;
}

function requiredEvidenceFor(categories, type) {
  if (type === 'Right') return [];
  const list = [...new Set(categories.flatMap(id => EVIDENCE_BY_CATEGORY[id] || []))];
  return list.length ? list : ['Record showing the obligation was met'];
}

/* ------------------------------------------------------------------ */
/*  Reviewer edits (step 24 boundary)                                 */
/* ------------------------------------------------------------------ */

// The fields a reviewer may correct. The source document, clause and original text never change.
export const EDITABLE_FIELDS = [
  'description',
  'party',
  'trigger',
  'deadline',
  'frequency',
  'requiredEvidence',
];

/**
 * Applies every reviewer edit in force, in order. Each change to an obligation raises its version
 * and keeps the extracted values in `original`, so the contractual source is never lost.
 *
 * An edit is { obligationKey, action: VERIFY | REJECT | EDIT | CONFIRM_MAPPING | REJECT_MAPPING,
 *              changes?, ruleId?, note, by, at }.
 */
export function applyEdits(obligations, edits = [], { buyerName = '', vendorName = '' } = {}) {
  const byKey = new Map(obligations.map(obligation => [obligation.key, structuredClone(obligation)]));
  const nameOf = party =>
    ({ vendor: vendorName || 'Vendor', buyer: buyerName || 'Buyer', both: 'Both parties' })[party] ||
    'Not clear';

  for (const edit of edits) {
    const obligation = byKey.get(edit.obligationKey);
    if (!obligation) continue; // the clause is no longer in the contract

    // Mapping reviews do not change the obligation itself.
    if (edit.action === 'CONFIRM_MAPPING' || edit.action === 'REJECT_MAPPING') continue;

    // Keep the values as first extracted, once.
    if (!obligation.original) {
      obligation.original = Object.fromEntries(
        EDITABLE_FIELDS.map(field => [field, structuredClone(obligation[field])]).concat([
          ['status', obligation.status],
          ['confidence', obligation.confidence],
        ]),
      );
    }

    if (edit.action === 'VERIFY') {
      obligation.status = 'VERIFIED';
    }

    if (edit.action === 'REJECT') {
      obligation.status = 'REJECTED';
    }

    if (edit.action === 'EDIT') {
      const changes = edit.changes || {};
      if (changes.description) obligation.description = changes.description;
      if (changes.party) {
        obligation.party = changes.party;
        obligation.responsibleParty = { party: changes.party, name: nameOf(changes.party) };
        obligation.beneficiary = {
          party: beneficiaryOf(changes.party),
          name: nameOf(beneficiaryOf(changes.party)),
        };
      }
      if (changes.trigger) obligation.trigger = changes.trigger;
      if (changes.deadline) obligation.deadline = changes.deadline;
      if (changes.frequency) obligation.frequency = changes.frequency;
      if (changes.requiredEvidence) obligation.requiredEvidence = changes.requiredEvidence;

      // A person has now checked it.
      obligation.status = 'VERIFIED';
    }

    obligation.version += 1;
    obligation.confidence = obligation.status === 'VERIFIED' ? 1 : obligation.confidence;
    obligation.reviewed = { by: edit.by, at: edit.at, note: edit.note || null, action: edit.action };
  }

  return [...byKey.values()];
}

/* ------------------------------------------------------------------ */
/*  Step 22 – rules, mapping and checks                               */
/* ------------------------------------------------------------------ */

/*
 * The rules each obligation is mapped to. Each rule needs one or more clause categories (CL-xx).
 *  - kind DUTY: someone must be bound by an obligation in those categories
 *  - kind TERM: the contract only needs to state it (no duty to monitor)
 * Whether the rule is a legal requirement or a contract term comes from Stage 4: the same
 * category finding is "statutory" only for a controller–processor relationship.
 */
export const RULES = [
  {
    id: 'R-A28-01',
    kind: 'TERM',
    categories: ['CL-01', 'CL-02', 'CL-03'],
    party: 'any',
    text: 'The contract states the subject matter, duration, nature, purpose, type of data and data subjects.',
    article: 'Art. 28(3)',
  },
  {
    id: 'R-A28-02',
    kind: 'DUTY',
    categories: ['CL-04'],
    party: 'vendor',
    text: 'The vendor acts only on the buyer’s documented instructions.',
    article: 'Art. 28(3)(a)',
  },
  {
    id: 'R-A28-03',
    kind: 'DUTY',
    categories: ['CL-05'],
    party: 'vendor',
    text: 'People authorised to process the data are bound by confidentiality.',
    article: 'Art. 28(3)(b)',
  },
  {
    id: 'R-A28-04',
    kind: 'DUTY',
    categories: ['CL-06'],
    party: 'vendor',
    text: 'The vendor takes appropriate technical and organisational security measures.',
    article: 'Art. 28(3)(c) and Art. 32',
  },
  {
    id: 'R-A28-05',
    kind: 'DUTY',
    categories: ['CL-07', 'CL-08'],
    party: 'vendor',
    text: 'The vendor uses sub-processors only with the buyer’s authorisation, and gives notice of changes so the buyer can object.',
    article: 'Art. 28(2)',
  },
  {
    id: 'R-A28-06',
    kind: 'DUTY',
    categories: ['CL-09'],
    party: 'vendor',
    text: 'The same data protection duties are passed down to every sub-processor.',
    article: 'Art. 28(4)',
  },
  {
    id: 'R-A28-07',
    kind: 'DUTY',
    categories: ['CL-10'],
    party: 'vendor',
    text: 'The vendor helps the buyer answer data-subject requests.',
    article: 'Art. 28(3)(e)',
  },
  {
    id: 'R-A28-08',
    kind: 'DUTY',
    categories: ['CL-11'],
    party: 'vendor',
    text: 'The vendor helps with breaches and data protection impact assessments.',
    article: 'Art. 28(3)(f)',
  },
  {
    id: 'R-A28-09',
    kind: 'DUTY',
    categories: ['CL-12'],
    party: 'vendor',
    text: 'At the end of the service the vendor returns or deletes the data.',
    article: 'Art. 28(3)(g)',
  },
  {
    id: 'R-A28-10',
    kind: 'DUTY',
    categories: ['CL-13'],
    // Met by the buyer's right to audit or by the vendor's duty to support audits.
    party: 'any',
    text: 'The vendor gives the information needed and allows audits and inspections.',
    article: 'Art. 28(3)(h)',
  },
  {
    id: 'R-TRF-01',
    kind: 'DUTY',
    categories: ['CL-14'],
    party: 'vendor',
    text: 'Personal data leaves the country only on instructions and with an appropriate safeguard.',
    article: 'Chapter V',
  },
  {
    id: 'R-CON-01',
    kind: 'DUTY',
    categories: ['CL-15'],
    party: 'vendor',
    text: 'Incidents are notified to the buyer, with a trigger and a deadline.',
    needsDeadline: true,
  },
  {
    id: 'R-CON-02',
    kind: 'DUTY',
    categories: ['CL-16'],
    party: 'vendor',
    text: 'Service levels (availability, response, resolution) are committed to.',
  },
  {
    id: 'R-CON-03',
    kind: 'DUTY',
    categories: ['CL-17'],
    party: 'vendor',
    text: 'The vendor keeps business continuity and recovery arrangements.',
  },
  {
    id: 'R-CON-04',
    kind: 'DUTY',
    categories: ['CL-18'],
    party: 'any',
    text: 'There is exit support and access is revoked at the end.',
  },
  {
    id: 'R-CON-05',
    kind: 'TERM',
    categories: ['CL-19'],
    party: 'any',
    text: 'Liability and indemnity are allocated between the parties.',
  },
  {
    id: 'R-CON-06',
    kind: 'TERM',
    categories: ['CL-20'],
    party: 'any',
    text: 'Material changes follow an agreed approval process.',
  },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map(rule => [rule.id, rule]));

/* Which assurance controls (Stage 1 requirement IDs) a clause category relates to. */
function controlsForCategory(categoryId) {
  const topicId = CATEGORY[categoryId]?.topic;
  return TOPICS.find(topic => topic.id === topicId)?.controls || [];
}

/* Duration as hours, so two deadlines can be compared ("within 24 hours" vs "within 3 days"). */
function durationHours(text) {
  const match = String(text).match(
    /(\d+)\s*(?:\(\d+\)\s*)?(minute|hour|(?:working |business |calendar )?day|week|month)/i,
  );
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const perUnit = unit.startsWith('minute')
    ? 1 / 60
    : unit.startsWith('hour')
      ? 1
      : unit.includes('day')
        ? 24
        : unit.startsWith('week')
          ? 168
          : 720;
  return Number(match[1]) * perUnit;
}

/**
 * Step 22: maps each obligation to its rules and checks the whole register.
 *
 * @param {Array} obligations      after reviewer edits
 * @param {object} context
 *   findings              the Stage 4 findings (one per category; NOT_APPLICABLE, statutory …)
 *   applicableControls    control IDs from the Stage 1 requirement profile
 *   law                   'UK GDPR' or 'GDPR'
 *   subprocessorsUsed     true when the requirement or the vendor says sub-processors are used
 *   edits                 reviewer edits, for the mapping reviews
 */
export function mapToRules(
  obligations,
  { findings = [], applicableControls = [], law = 'UK GDPR', subprocessorsUsed = false, edits = [] } = {},
) {
  const findingFor = Object.fromEntries(findings.map(finding => [finding.categoryId, finding]));
  const active = obligations.filter(obligation => obligation.status !== 'REJECTED');

  /* ---- Legal or contractual basis, and whether the rule applies at all ---- */
  const ruleState = RULES.map(rule => {
    const ruleFindings = rule.categories.map(id => findingFor[id]).filter(Boolean);

    // Not applicable when Stage 4 found every one of its categories not applicable.
    const applies = !ruleFindings.length || ruleFindings.some(finding => finding.status !== 'NOT_APPLICABLE');
    const statutory = ruleFindings.some(finding => finding.statutory);

    const source = statutory
      ? rule.article === 'Chapter V'
        ? `${law} Chapter V`
        : `${law} ${rule.article}`
      : 'Contract term (not statutory)';

    return { rule, applies, statutory, source, findings: ruleFindings };
  });
  const stateOf = Object.fromEntries(ruleState.map(state => [state.rule.id, state]));

  /* ---- The 8 mapping fields: one row per obligation and rule ---- */
  const reviewOf = (obligationKey, ruleId) =>
    [...edits]
      .reverse()
      .find(
        edit =>
          edit.obligationKey === obligationKey &&
          edit.ruleId === ruleId &&
          (edit.action === 'CONFIRM_MAPPING' || edit.action === 'REJECT_MAPPING'),
      );

  const mappings = [];
  for (const obligation of active) {
    for (const rule of RULES) {
      const sharedCategories = rule.categories.filter(id => obligation.categories.includes(id));
      if (!sharedCategories.length) continue;

      const state = stateOf[rule.id];
      const requirementIds = [...new Set(sharedCategories.flatMap(controlsForCategory))].filter(id =>
        applicableControls.includes(id),
      );

      // A mapping is as sure as the obligation, and less sure when the party is not the expected one.
      const partyFits =
        rule.party === 'any' || obligation.party === rule.party || obligation.party === 'both';
      const mappingConfidence = Math.round(obligation.confidence * (partyFits ? 1 : 0.5) * 100) / 100;

      const review = reviewOf(obligation.key, rule.id);

      mappings.push({
        obligationId: obligation.id,
        obligationKey: obligation.key,
        clauseId: obligation.sourceClause.clauseId,
        requirementId: requirementIds[0] || null,
        requirementIds,
        ruleId: rule.id,
        ruleVersion: S5_RULE_PACK,
        applicabilityStatus: state.applies ? 'APPLICABLE' : 'NOT_APPLICABLE',
        basis: state.statutory ? 'LEGAL' : 'CONTRACTUAL',
        mappingConfidence,
        partyFits,
        reviewerStatus: review
          ? review.action === 'CONFIRM_MAPPING'
            ? 'CONFIRMED'
            : 'REJECTED'
          : 'UNREVIEWED',
        reviewed: review ? { by: review.by, at: review.at, note: review.note || null } : null,
      });
    }
  }

  // Each obligation also carries the rules it supports (a rejected mapping no longer counts).
  const counted = mappings.filter(mapping => mapping.reviewerStatus !== 'REJECTED');
  for (const obligation of obligations) {
    obligation.ruleIds = counted.filter(m => m.obligationId === obligation.id).map(m => m.ruleId);
    obligation.requirementIds = [
      ...new Set(counted.filter(m => m.obligationId === obligation.id).flatMap(m => m.requirementIds)),
    ];
  }

  /* ---- Rule trace: clause → rule → obligation ---- */
  const ruleTrace = ruleState.map(({ rule, applies, statutory, source, findings: ruleFindings }) => {
    const clauseIds = [...new Set(ruleFindings.flatMap(finding => finding.clauseIds || []))];
    const rows = counted.filter(mapping => mapping.ruleId === rule.id);
    const obligationIds = [...new Set(rows.map(mapping => mapping.obligationId))];

    // Which of the rule's categories are covered by an obligation from the right party.
    const coveredCategories = rule.categories.filter(categoryId =>
      active.some(
        obligation =>
          obligation.categories.includes(categoryId) &&
          // A right only counts where either side may meet the rule (for example the right to audit).
          (obligation.type !== 'Right' || rule.party === 'any') &&
          (rule.party === 'any' || obligation.party === rule.party || obligation.party === 'both'),
      ),
    );
    const wrongPartyOnly = !coveredCategories.length && rows.length > 0;
    const unreadable = ruleFindings.some(finding => finding.status === 'HUMAN_REVIEW');

    let status;
    let explanation;

    if (!applies) {
      status = 'NOT_APPLICABLE';
      explanation = ruleFindings[0]?.explanation || 'Does not apply to this relationship.';
    } else if (rule.kind === 'TERM') {
      // A term only needs to be stated, so the Stage 4 findings decide.
      const statuses = ruleFindings.map(finding => finding.status);
      if (statuses.length && statuses.every(s => s === 'FOUND' || s === 'NOT_APPLICABLE')) {
        status = 'COVERED';
        explanation = 'Stated in the contract (Stage 4).';
      } else if (statuses.includes('HUMAN_REVIEW')) {
        status = 'HUMAN_REVIEW';
        explanation = 'The contract text could not be read well enough to decide. Check it by hand.';
      } else if (statuses.some(s => s === 'FOUND' || s === 'PARTIAL')) {
        status = 'PARTIAL';
        explanation = 'Only partly stated in the contract (Stage 4).';
      } else {
        status = 'NOT_FOUND';
        explanation = 'Not stated in the contract (Stage 4).';
      }
    } else if (coveredCategories.length === rule.categories.length) {
      status = 'COVERED';
      explanation = `Covered by ${obligationIds.join(', ')}.`;
    } else if (coveredCategories.length) {
      const missing = rule.categories.filter(id => !coveredCategories.includes(id));
      status = 'PARTIAL';
      explanation = `No obligation found for ${missing.map(id => `${id} ${CATEGORY[id]?.name}`).join(' and ')}. One rule may need several clauses.`;
    } else if (wrongPartyOnly) {
      status = 'PARTIAL';
      explanation = 'Clauses exist, but none binds the expected party. Check the responsible party.';
    } else if (unreadable) {
      status = 'HUMAN_REVIEW';
      explanation =
        'No obligation was found, but the extraction quality is not good enough to call it missing.';
    } else {
      status = 'NOT_FOUND';
      explanation = 'No obligation in the contract covers this rule.';
    }

    return {
      id: rule.id,
      kind: rule.kind,
      text: rule.text,
      categories: rule.categories,
      party: rule.party,
      source,
      basis: statutory ? 'LEGAL' : 'CONTRACTUAL',
      ruleVersion: S5_RULE_PACK,
      applies,
      clauseIds,
      obligationIds,
      status,
      explanation,
    };
  });

  /* ---- Engine checks ---- */
  const checks = [];
  const add = (kind, severity, text, extra = {}) => checks.push({ kind, severity, text, ...extra });

  // Legal versus contractual basis.
  const legalRules = ruleTrace.filter(rule => rule.applies && rule.basis === 'LEGAL').length;
  const contractRules = ruleTrace.filter(rule => rule.applies && rule.basis === 'CONTRACTUAL').length;
  add(
    'BASIS',
    'info',
    `${legalRules} rule${legalRules === 1 ? ' is a legal requirement' : 's are legal requirements'}; ${contractRules} ${contractRules === 1 ? 'is a contract term' : 'are contract terms'}. Commercial clauses are not treated as statutory.`,
  );

  // Correct responsible party.
  for (const mapping of mappings.filter(m => !m.partyFits && m.applicabilityStatus === 'APPLICABLE')) {
    const obligation = obligations.find(o => o.id === mapping.obligationId);
    if (obligation.type === 'Right') continue;
    add(
      'PARTY',
      'issue',
      `${obligation.id} supports ${mapping.ruleId}, but it binds ${PARTIES[obligation.party].toLowerCase()} instead of the vendor. Check the responsible party.`,
      { obligationIds: [obligation.id], ruleId: mapping.ruleId },
    );
  }

  // Completeness: rules with no obligation, and deadlines the rules need.
  for (const rule of ruleTrace.filter(
    r => r.applies && (r.status === 'NOT_FOUND' || r.status === 'PARTIAL'),
  )) {
    add(
      'COMPLETENESS',
      rule.status === 'NOT_FOUND' ? 'issue' : 'warning',
      `${rule.id}: ${rule.explanation}`,
      {
        ruleId: rule.id,
      },
    );
  }
  for (const rule of RULES.filter(r => r.needsDeadline)) {
    const undated = active.filter(
      o => o.ruleIds.includes(rule.id) && o.type !== 'Right' && o.deadline.type === 'UNSPECIFIED',
    );
    if (undated.length && stateOf[rule.id].applies)
      add(
        'COMPLETENESS',
        'warning',
        `${undated.map(o => o.id).join(', ')} ${undated.length === 1 ? 'has' : 'have'} no deadline in the contract (stored as UNSPECIFIED).`,
        { obligationIds: undated.map(o => o.id), ruleId: rule.id },
      );
  }

  // Conflicting clauses: the same subject with different deadlines, or a duty and a permission that clash.
  for (const categoryId of [...new Set(active.flatMap(o => o.categories))]) {
    const sameSubject = active.filter(o => o.categories.includes(categoryId) && o.type !== 'Right');

    const durations = sameSubject
      .filter(o => o.deadline.type === 'DURATION')
      .map(o => ({ obligation: o, hours: durationHours(o.deadline.text) }))
      .filter(item => item.hours != null);
    const distinct = [...new Set(durations.map(item => item.hours))];
    if (distinct.length > 1) {
      add(
        'CONFLICT',
        'issue',
        `${categoryId} ${CATEGORY[categoryId]?.name}: different deadlines (${durations.map(item => `${item.obligation.id} “${item.obligation.deadline.text}”`).join(', ')}). Check which one governs.`,
        { obligationIds: durations.map(item => item.obligation.id), categoryId },
      );
    }

    const prohibitions = active.filter(o => o.categories.includes(categoryId) && o.type === 'Prohibition');
    const rights = active.filter(o => o.categories.includes(categoryId) && o.type === 'Right');
    for (const prohibition of prohibitions) {
      const clash = rights.find(
        right =>
          right.party === prohibition.party &&
          right.sourceClause.clauseId !== prohibition.sourceClause.clauseId,
      );
      if (clash)
        add(
          'CONFLICT',
          'warning',
          `${prohibition.id} says the ${PARTIES[prohibition.party].toLowerCase()} must not, but ${clash.id} says it may (${categoryId} ${CATEGORY[categoryId]?.name}). Check how the clauses fit together.`,
          { obligationIds: [prohibition.id, clash.id], categoryId },
        );
    }
  }

  // Downstream obligations: sub-processors must receive the same duties.
  const flowDown = active.filter(o => o.categories.includes('CL-09') || (o.downstream && o.type !== 'Right'));
  if (subprocessorsUsed && !active.some(o => o.categories.includes('CL-09') && o.type !== 'Right')) {
    add(
      'DOWNSTREAM',
      'issue',
      'Sub-processors may be used, but no obligation passes the same data protection duties down to them.',
      { ruleId: 'R-A28-06' },
    );
  } else if (flowDown.length) {
    add(
      'DOWNSTREAM',
      'info',
      `${flowDown.length} obligation${flowDown.length === 1 ? ' applies' : 's apply'} to sub-processors as well: ${flowDown.map(o => o.id).join(', ')}.`,
      { obligationIds: flowDown.map(o => o.id) },
    );
  }

  // Evidence requirements.
  const noEvidence = active.filter(o => o.type !== 'Right' && !o.categories.length);
  if (noEvidence.length)
    add(
      'EVIDENCE',
      'info',
      `${noEvidence.length} obligation${noEvidence.length === 1 ? ' is' : 's are'} outside the 20 clause categories; the evidence needed is a general record that it was met.`,
      { obligationIds: noEvidence.map(o => o.id) },
    );

  return { obligations, mappings, ruleTrace, checks };
}

/* ------------------------------------------------------------------ */
/*  Step 24 – monitoring triggers and stored fields                   */
/* ------------------------------------------------------------------ */

/*
 * Each obligation with a deadline, a repeat or an event becomes a monitoring trigger.
 * Triggers for unverified low-confidence obligations wait for a reviewer (step 23 boundary).
 */
export function monitoringTriggers(obligations) {
  return obligations
    .filter(o => o.type !== 'Right' && o.status !== 'REJECTED')
    .filter(o => o.deadline.type !== 'UNSPECIFIED' || !['CONTINUOUS'].includes(o.frequency))
    .map(o => {
      let kind = 'EVENT';
      if (!['EVENT_DRIVEN', 'ONE_OFF', 'CONTINUOUS'].includes(o.frequency)) kind = 'RECURRING';
      else if (o.deadline.type !== 'UNSPECIFIED' && o.frequency === 'ONE_OFF') kind = 'DEADLINE';

      const waiting = o.status === 'REQUIRES_VERIFICATION';
      return {
        obligationId: o.id,
        obligationKey: o.key,
        kind,
        owner: o.party,
        watch: `${o.trigger.text}${o.deadline.type !== 'UNSPECIFIED' ? ' → ' + o.deadline.text : ''}`,
        frequency: o.frequency,
        state: waiting ? 'AWAITING_VERIFICATION' : 'ACTIVE',
        escalation:
          o.consequence?.type === 'NOT_STATED' ? 'Escalate to the buyer' : o.consequence?.text || null,
      };
    });
}

/* The 10 stored fields per obligation (step 24). */
export function storedRecords(obligations, { assessmentId, version, at }) {
  return obligations.map(o => ({
    obligationId: o.id,
    assessmentId,
    contractId: o.sourceDocument.uuid,
    contractDocument: o.sourceDocument.id,
    clauseId: o.sourceClause.clauseId,
    ruleIds: o.ruleIds || [],
    responsibleParty: o.responsibleParty.name,
    deadlineRule:
      o.deadline.type === 'UNSPECIFIED' ? 'UNSPECIFIED' : `${o.deadline.type}: ${o.deadline.text}`,
    status: o.status,
    version: `${version}`,
    obligationVersion: o.version,
    timestamp: at,
  }));
}

/* ------------------------------------------------------------------ */
/*  Steps 21–24 together                                              */
/* ------------------------------------------------------------------ */

/**
 * Builds the whole register from one contract analysis.
 *
 * @param {object} analysis   the latest Stage 4 analysis ({ clauses, findings })
 * @param {object} context    buyerName, vendorName, documents, applicableControls, law,
 *                            subprocessorsUsed, edits (reviewer edits in force)
 */
export function buildRegister(analysis, context = {}) {
  const { buyerName = '', vendorName = '', documents = {}, edits = [] } = context;

  // Step 21: extract, then apply the reviewer's edits (they never change the source).
  const extracted = extractObligations(analysis.clauses || [], { buyerName, vendorName, documents });
  const edited = applyEdits(extracted, edits, { buyerName, vendorName });

  // Step 22: map and check.
  const { obligations, mappings, ruleTrace, checks } = mapToRules(edited, {
    findings: analysis.findings || [],
    applicableControls: context.applicableControls || [],
    law: context.law || 'UK GDPR',
    subprocessorsUsed: !!context.subprocessorsUsed,
    edits,
  });

  // Step 24: monitoring triggers.
  const monitors = monitoringTriggers(obligations);

  // The gaps Stage 7 turns into risks.
  const gaps = ruleTrace
    .filter(rule => rule.applies && (rule.status === 'NOT_FOUND' || rule.status === 'PARTIAL'))
    .map(rule => ({
      ruleId: rule.id,
      kind: rule.status === 'NOT_FOUND' ? 'MISSING' : 'PARTIAL',
      text: `${rule.status === 'NOT_FOUND' ? 'No obligation found' : 'Only partly covered'}: ${rule.text}`,
      source: rule.source,
    }));

  const count = predicate => obligations.filter(predicate).length;
  const live = o => o.status !== 'REJECTED';

  return {
    rulePackVersion: S5_RULE_PACK,
    totals: {
      obligations: count(o => live(o) && o.type === 'Obligation'),
      prohibitions: count(o => live(o) && o.type === 'Prohibition'),
      rights: count(o => live(o) && o.type === 'Right'),
      vendor: count(o => live(o) && o.party === 'vendor'),
      buyer: count(o => live(o) && o.party === 'buyer'),
      both: count(o => live(o) && o.party === 'both'),
      unclear: count(o => live(o) && o.party === 'unknown'),
      withDeadline: count(o => live(o) && o.deadline.type !== 'UNSPECIFIED'),
      unspecifiedDeadline: count(o => live(o) && o.type !== 'Right' && o.deadline.type === 'UNSPECIFIED'),
      requiresVerification: count(o => o.status === 'REQUIRES_VERIFICATION'),
      verified: count(o => o.status === 'VERIFIED'),
      rejected: count(o => o.status === 'REJECTED'),
      rulesCovered: ruleTrace.filter(rule => rule.status === 'COVERED').length,
      rulesTotal: ruleTrace.filter(rule => rule.applies).length,
      gaps: gaps.length,
      issues: checks.filter(check => check.severity === 'issue').length,
      monitored: monitors.filter(monitor => monitor.state === 'ACTIVE').length,
    },
    obligations,
    mappings,
    ruleTrace,
    checks,
    gaps,
    monitors,
    note: REGISTER_NOTE,
  };
}

/* ------------------------------------------------------------------ */
/*  Small text helpers                                                */
/* ------------------------------------------------------------------ */

function tidy(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function capitalise(text) {
  const value = tidy(text);
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
