/*
 * Stage 4 – Contract analysis (client specification "Input / Output Stage 4, 5, 6", steps 17–20).
 *
 * Step 18: the text of each contract document is split into numbered clauses. Each clause gets the
 * 10 fields of the specification (clause ID, document ID, page, section, heading, text, category,
 * responsible party, extraction confidence, review status) and is placed in one or more of the 20
 * clause categories CL-01 … CL-20.
 * Step 20: each category becomes a finding: FOUND, PARTIAL, MISSING, NOT APPLICABLE or HUMAN REVIEW.
 *
 * Two rules from the specification shape the checks:
 *  - a heading alone is not proof: the clause text must contain what the category asks for;
 *  - a clause cannot be reported as missing when the text could not be read well enough.
 * Article 28 terms are only required for a controller–processor relationship; commercial clauses
 * are never treated as statutory requirements.
 *
 * TOPICS below are the older, broader topic tags. They are kept on every clause because Stages 5 and 6
 * read them (obligation rules and transfer terms).
 *
 * The result is a reading aid for review, not a legal opinion or a compliance conclusion.
 */

export const S4_RULE_PACK = 'RP-2026.11-S4';
export const EXTRACTION_MODEL_VERSION =
  'OA-EXTRACT-2026.11 (unpdf / mammoth text + rule-based clause reader)';

export const ANALYSIS_NOTE =
  'Clauses are identified automatically from the text and checked against the clause categories. These are preliminary findings for review, not a legal opinion or a compliance conclusion. A heading alone is not treated as proof.';

/*
 * Each topic has:
 *  - headingWords: words that usually appear in the clause heading
 *  - phrases: words or phrases that usually appear in the clause body
 *  - controls: the assurance controls (ASS-xxx) the topic relates to
 *  - expected: true when an outsourcing contract that handles personal data
 *    would normally contain this topic, so we report it if we cannot find it
 */
export const TOPICS = [
  {
    id: 'data_protection',
    name: 'Data protection',
    headingWords: ['data protection', 'processing of personal data', 'personal data'],
    phrases: [
      'personal data',
      'data protection legislation',
      'uk gdpr',
      'documented instructions',
      'data controller',
      'data processor',
      'processing',
    ],
    controls: ['ASS-004'],
    expected: true,
  },
  {
    id: 'security',
    name: 'Security measures',
    headingWords: ['security', 'information security'],
    phrases: [
      'technical and organisational measures',
      'encryption',
      'multi-factor',
      'access control',
      'iso 27001',
      'penetration test',
      'vulnerability',
    ],
    controls: ['ASS-002', 'ASS-003', 'ASS-009'],
    expected: true,
  },
  {
    id: 'breach_notification',
    name: 'Breach and incident notification',
    headingWords: ['breach', 'incident', 'notification'],
    phrases: [
      'personal data breach',
      'security incident',
      'notify the customer',
      'without undue delay',
      'becoming aware',
    ],
    controls: ['ASS-007'],
    expected: true,
  },
  {
    id: 'subprocessors',
    name: 'Subcontractors and sub-processors',
    headingWords: ['sub-processor', 'subprocessor', 'subcontract', 'sub-contract'],
    phrases: [
      'sub-processor',
      'subprocessor',
      'subcontractor',
      'sub-contractor',
      'prior written consent',
      'flow down',
    ],
    controls: ['ASS-006'],
    expected: true,
  },
  {
    id: 'international_transfer',
    name: 'International data transfers',
    headingWords: ['international transfer', 'transfer', 'data location'],
    phrases: [
      'outside the united kingdom',
      'outside the uk',
      'international data transfer agreement',
      'idta',
      'standard contractual clauses',
      'adequacy',
      'appropriate safeguard',
      'transfer personal data',
    ],
    controls: ['ASS-005'],
    expected: true,
  },
  {
    id: 'audit_rights',
    name: 'Audit and inspection rights',
    headingWords: ['audit', 'inspection'],
    phrases: ['audit', 'inspect', 'right of access', 'records'],
    controls: ['ASS-013'],
    expected: true,
  },
  {
    id: 'return_deletion',
    name: 'Return and deletion of data',
    headingWords: ['return', 'deletion', 'exit'],
    phrases: [
      'return or securely delete',
      'return or delete',
      'delete all personal data',
      'destroy',
      'exit plan',
      'retention',
    ],
    controls: ['ASS-014'],
    expected: true,
  },
  {
    id: 'service_levels',
    name: 'Service levels',
    headingWords: ['service level', 'sla', 'performance'],
    phrases: [
      'service level',
      'respond',
      'resolve',
      'availability',
      'service credit',
      'uptime',
      'priority 1',
    ],
    controls: ['ASS-012'],
    expected: false,
  },
  {
    id: 'business_continuity',
    name: 'Business continuity',
    headingWords: ['business continuity', 'disaster recovery'],
    phrases: ['business continuity', 'disaster recovery', 'recovery time', 'backup'],
    controls: ['ASS-008'],
    expected: false,
  },
  {
    id: 'confidentiality',
    name: 'Confidentiality and personnel',
    headingWords: ['confidentiality', 'personnel', 'staff'],
    phrases: ['confidential', 'bound by confidentiality', 'screening', 'training'],
    controls: ['ASS-010'],
    expected: false,
  },
  {
    id: 'insurance',
    name: 'Insurance',
    headingWords: ['insurance'],
    phrases: ['insurance', 'indemnity insurance', 'cyber insurance'],
    controls: ['ASS-011'],
    expected: false,
  },
  {
    id: 'liability',
    name: 'Liability and indemnity',
    headingWords: ['liability', 'indemnity', 'indemnities'],
    phrases: ['liability', 'indemnify', 'shall not exceed', 'limitation'],
    controls: [],
    expected: false,
  },
  {
    id: 'termination',
    name: 'Term and termination',
    headingWords: ['term', 'termination'],
    phrases: ['terminate', 'termination', 'notice period', "days' written notice"],
    controls: ['ASS-014'],
    expected: false,
  },
  {
    id: 'governing_law',
    name: 'Governing law',
    headingWords: ['governing law', 'jurisdiction'],
    phrases: ['governed by the laws', 'courts of', 'jurisdiction'],
    controls: [],
    expected: false,
  },
];

// A clause needs at least this many points to be linked to a topic.
// A heading word is worth 3 points and each body phrase 1 point.
const HEADING_POINTS = 3;
const PHRASE_POINTS = 1;
const MIN_POINTS = 2;

// "4." or "4.1" or "4.1.2" at the start of a line, then some text.
const NUMBERED_LINE = /^(\d{1,3}(?:\.\d{1,3}){0,3})\.?\s+(\S.*)$/;
// "Clause 4", "Section 4.1", "Article 12" at the start of a line.
const NAMED_LINE = /^(?:clause|section|article)\s+(\d{1,3}(?:\.\d{1,3}){0,3})\.?\s*[:\-–]?\s*(.*)$/i;

/**
 * Splits the contract into clauses.
 *
 * @param {string[]} pages  the text of each page, in order
 * @returns {{ number: string, heading: string, text: string, page: number }[]}
 */
export function splitIntoClauses(pages) {
  const clauses = [];
  let current = null;
  let currentHeading = '';

  pages.forEach((pageText, index) => {
    const pageNumber = index + 1;

    for (const rawLine of pageText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = line.match(NUMBERED_LINE) || line.match(NAMED_LINE);
      if (!match) {
        // A line without a number continues the clause we are in.
        if (current) current.text += ' ' + line;
        continue;
      }

      const [, number, rest] = match;
      const isHeadingOnly = !number.includes('.') && looksLikeHeading(rest);

      if (isHeadingOnly) {
        // "4. Data Protection" starts a new section. Its sub-clauses (4.1, 4.2 …)
        // carry the heading. If the section has no sub-clauses it becomes a clause itself.
        currentHeading = rest;
        current = { number, heading: rest, text: '', page: pageNumber };
        clauses.push(current);
      } else {
        current = { number, heading: currentHeading, text: rest, page: pageNumber };
        clauses.push(current);
      }
    }
  });

  // Drop section headings whose text is empty because their sub-clauses hold the content.
  const withText = clauses.filter(clause => clause.text.trim() !== '');
  if (withText.length > 0) return withText.map(tidyClause);

  // No numbering found: fall back to paragraphs, so the buyer still gets something to review.
  return splitIntoParagraphs(pages);
}

function looksLikeHeading(text) {
  const words = text.split(/\s+/);
  return words.length <= 8 && !/[.;:]$/.test(text);
}

function tidyClause(clause) {
  return { ...clause, text: clause.text.replace(/\s+/g, ' ').trim() };
}

function splitIntoParagraphs(pages) {
  const paragraphs = [];
  pages.forEach((pageText, index) => {
    for (const block of pageText.split(/\n\s*\n/)) {
      const text = block.replace(/\s+/g, ' ').trim();
      if (text.length < 40) continue; // too short to be a clause (titles, page numbers)
      paragraphs.push({ number: `P${paragraphs.length + 1}`, heading: '', text, page: index + 1 });
    }
  });
  return paragraphs;
}

/**
 * Finds the topics a clause is about.
 * Returns the matching topics, strongest first, with the words that matched.
 */
export function classifyClause(clause) {
  const heading = clause.heading.toLowerCase();
  const body = clause.text.toLowerCase();
  const matches = [];

  for (const topic of TOPICS) {
    const headingHits = topic.headingWords.filter(word => heading.includes(word));
    const phraseHits = topic.phrases.filter(phrase => body.includes(phrase));
    const points = (headingHits.length > 0 ? HEADING_POINTS : 0) + phraseHits.length * PHRASE_POINTS;

    if (points >= MIN_POINTS) {
      matches.push({
        topicId: topic.id,
        points,
        confidence: confidenceLabel(headingHits.length > 0, phraseHits.length),
        matchedOn: [...new Set([...headingHits, ...phraseHits])],
      });
    }
  }

  return matches.sort((a, b) => b.points - a.points);
}

function confidenceLabel(headingMatched, phraseCount) {
  if (headingMatched && phraseCount >= 1) return 'High';
  if (headingMatched || phraseCount >= 3) return 'Medium';
  return 'Low';
}

/**
 * Pulls out the details a reviewer usually looks for first:
 * time limits ("within 24 hours"), percentages ("99.5%") and money amounts.
 */
export function findKeyTerms(text) {
  const terms = [];

  const timeLimits =
    text.match(
      /\b(?:within|at least|no later than|on)\s+\d+\s*(?:minutes?|hours?|(?:working |business )?days?|weeks?|months?)(?:'|’)?/gi,
    ) || [];
  for (const value of timeLimits) terms.push({ kind: 'Time limit', value: value.replace(/['’]$/, '') });

  const percentages = text.match(/\b\d{1,3}(?:\.\d+)?\s?%/g) || [];
  for (const value of percentages) terms.push({ kind: 'Percentage', value });

  const amounts =
    text.match(/(?:£|\$|€|GBP\s?|USD\s?|INR\s?)\d[\d,]*(?:\.\d+)?(?:\s?(?:million|m|k))?/g) || [];
  for (const value of amounts) terms.push({ kind: 'Amount', value: value.trim() });

  return terms;
}

/* ---------- Step 18: the 20 clause categories ----------
   heading: words in a clause heading that point to the category (a hint only, never proof).
   phrases: words in the clause text that place a clause in the category.
   context: if set, the clause text must also contain one of these (e.g. "sub-processor").
   requires: what the text must show for the category to be FOUND. Each item has a label and either
             "any" (phrases) or "re" (a pattern). Some found → PARTIAL, none → heading only.
   topic: the older topic tag (used by Stage 7 to pick the risk theme).
   group: ART28 (UK GDPR Article 28 processor terms), TRANSFER (Chapter V) or CONTRACT (commercial). */
const C = (id, name, check, def) => ({ id, name, check, ...def });
export const CATEGORIES = [
  C('CL-01', 'Subject matter and duration', 'Defined processing and contract period', {
    group: 'ART28',
    article: '28(3)',
    topic: 'data_protection',
    heading: ['subject matter', 'duration', 'details of processing', 'processing details'],
    phrases: [
      'subject matter',
      'duration of the processing',
      'for the duration of',
      'term of this agreement',
    ],
    requires: [
      { label: 'the subject matter of the processing', any: ['subject matter', 'the services'] },
      { label: 'the duration', any: ['duration', 'term of this agreement', 'for the term', 'until'] },
    ],
  }),
  C('CL-02', 'Nature and purpose', 'Processing activities clearly described', {
    group: 'ART28',
    article: '28(3)',
    topic: 'data_protection',
    heading: ['nature and purpose', 'purpose of processing', 'details of processing', 'processing details'],
    phrases: [
      'nature and purpose',
      'purpose of the processing',
      'purposes of the processing',
      'processing activities',
    ],
    requires: [
      { label: 'the nature of the processing', any: ['nature', 'processing activities'] },
      { label: 'the purpose', any: ['purpose'] },
    ],
  }),
  C('CL-03', 'Data and data subjects', 'Categories and scope documented', {
    group: 'ART28',
    article: '28(3)',
    topic: 'data_protection',
    heading: ['categories of data', 'data subjects', 'types of personal data'],
    phrases: [
      'categories of personal data',
      'types of personal data',
      'categories of data subjects',
      'data subjects',
    ],
    requires: [
      {
        label: 'the types of personal data',
        any: ['categories of personal data', 'types of personal data', 'personal data categories'],
      },
      { label: 'the categories of data subjects', any: ['data subjects'] },
    ],
  }),
  C('CL-04', 'Documented instructions', 'Processor acts on controller instructions', {
    group: 'ART28',
    article: '28(3)(a)',
    topic: 'data_protection',
    heading: ['instructions'],
    phrases: [
      'documented instructions',
      'only on the instructions',
      'written instructions',
      'on the instructions of',
    ],
    requires: [
      {
        label: 'processing only on documented instructions',
        any: [
          'documented instructions',
          'only on the instructions',
          'only on the written instructions',
          'only on the documented',
        ],
      },
    ],
  }),
  C('CL-05', 'Confidentiality', 'Personnel confidentiality commitments', {
    group: 'ART28',
    article: '28(3)(b)',
    topic: 'confidentiality',
    heading: ['confidentiality'],
    phrases: [
      'bound by confidentiality',
      'duty of confidentiality',
      'obligation of confidentiality',
      'confidentiality obligations',
      'keep confidential',
    ],
    requires: [
      {
        label: 'the people who handle the data',
        any: ['persons authorised', 'personnel', 'staff', 'employees', 'persons'],
      },
      { label: 'a confidentiality commitment', any: ['confidential'] },
    ],
  }),
  C('CL-06', 'Security measures', 'Appropriate technical and organisational measures', {
    group: 'ART28',
    article: '28(3)(c) and Art. 32',
    topic: 'security',
    heading: ['security'],
    phrases: [
      'technical and organisational measures',
      'article 32',
      'security measures',
      'encryption',
      'access control',
    ],
    requires: [
      {
        label: 'appropriate technical and organisational measures',
        any: ['technical and organisational measures', 'security measures', 'article 32'],
      },
    ],
    alsoWhen: x => x.controls.includes('ASS-002'),
  }),
  C('CL-07', 'Subprocessor authorisation', 'Specific or general authorisation where required', {
    group: 'ART28',
    article: '28(2)',
    topic: 'subprocessors',
    heading: ['sub-processor', 'subprocessor', 'subcontract'],
    phrases: ['sub-processor', 'subprocessor', 'sub-contractor', 'subcontractor'],
    requires: [
      {
        label: 'prior specific or general written authorisation',
        any: [
          'prior written consent',
          'prior specific',
          'general written authorisation',
          'prior written authorisation',
          'written authorisation',
        ],
      },
    ],
  }),
  C('CL-08', 'Subprocessor changes', 'Notice and objection provisions', {
    group: 'ART28',
    article: '28(2)',
    topic: 'subprocessors',
    heading: ['changes to sub', 'change of sub', 'new sub'],
    phrases: [
      'intended changes',
      'new sub-processor',
      'new subprocessor',
      'replacement of',
      'object to',
      'objection',
      'addition or replacement',
    ],
    context: ['sub-processor', 'subprocessor', 'subcontract'],
    requires: [
      { label: 'notice of changes', any: ['notify', 'notice', 'inform'] },
      { label: 'a way to object', any: ['object', 'objection'] },
    ],
  }),
  C('CL-09', 'Flow-down obligations', 'Required downstream processor protections', {
    group: 'ART28',
    article: '28(4)',
    topic: 'subprocessors',
    heading: ['flow down', 'flow-down'],
    phrases: [
      'same data protection obligations',
      'flow down',
      'flow-down',
      'equivalent obligations',
      'same obligations',
    ],
    context: ['sub-processor', 'subprocessor', 'subcontract'],
    requires: [
      {
        label: 'the same data protection duties passed to subprocessors',
        any: [
          'same data protection obligations',
          'same obligations',
          'equivalent obligations',
          'flow down',
          'flow-down',
        ],
      },
    ],
  }),
  C('CL-10', 'Data-subject rights', 'Processor assistance obligations', {
    group: 'ART28',
    article: '28(3)(e)',
    topic: 'data_protection',
    heading: ['data subject rights', 'rights of data subjects'],
    phrases: [
      'data subject rights',
      'rights of data subjects',
      'data subject request',
      'exercise of rights',
      'subject access',
    ],
    requires: [
      { label: 'help with data-subject requests', any: ['assist', 'assistance', 'support', 'help'] },
      { label: 'the data subjects’ rights', any: ['data subject', 'subject access'] },
    ],
  }),
  C('CL-11', 'Breach / DPIA assistance', 'Applicable assistance duties', {
    group: 'ART28',
    article: '28(3)(f)',
    topic: 'data_protection',
    heading: ['impact assessment', 'dpia', 'assistance'],
    phrases: [
      'data protection impact assessment',
      'dpia',
      'articles 32 to 36',
      'prior consultation',
      'assist the customer in ensuring compliance',
    ],
    requires: [
      { label: 'a duty to assist', any: ['assist', 'assistance'] },
      {
        label: 'breach and impact-assessment duties',
        any: ['impact assessment', 'dpia', 'articles 32 to 36', 'breach', 'prior consultation'],
      },
    ],
  }),
  C('CL-12', 'Return and deletion', 'End-of-service handling', {
    group: 'ART28',
    article: '28(3)(g)',
    topic: 'return_deletion',
    heading: ['return', 'deletion', 'exit'],
    phrases: [
      'return or securely delete',
      'return or delete',
      'delete all personal data',
      'destroy',
      'deletion',
    ],
    requires: [
      { label: 'return or deletion of the data', any: ['return', 'delete', 'destroy'] },
      {
        label: 'when it happens (end of the service)',
        any: ['termination', 'end of', 'expiry', 'on completion', 'cessation'],
      },
    ],
  }),
  C('CL-13', 'Audit rights', 'Information and audit / inspection rights', {
    group: 'ART28',
    article: '28(3)(h)',
    topic: 'audit_rights',
    heading: ['audit', 'inspection'],
    phrases: ['audit', 'inspect', 'inspection'],
    requires: [
      { label: 'audits or inspections', any: ['audit', 'inspect'] },
      { label: 'information to show compliance', any: ['information', 'records', 'demonstrate'] },
    ],
    alsoWhen: x => x.controls.includes('ASS-013'),
  }),
  C('CL-14', 'International transfers', 'Instructions, routes and safeguards', {
    group: 'TRANSFER',
    topic: 'international_transfer',
    heading: ['international transfer', 'transfers', 'data location'],
    phrases: [
      'outside the united kingdom',
      'outside the uk',
      'international data transfer agreement',
      'idta',
      'standard contractual clauses',
      'addendum',
      'transfer personal data',
      'transfers of personal data',
    ],
    requires: [
      {
        label: 'which transfers are allowed',
        any: ['except', 'only', 'consent', 'authorised', 'instructions'],
      },
      {
        label: 'a transfer safeguard',
        any: [
          'international data transfer agreement',
          'idta',
          'standard contractual clauses',
          'addendum',
          'adequacy',
          'appropriate safeguard',
        ],
      },
    ],
  }),
  C('CL-15', 'Incident notification', 'Contractual notice triggers and deadlines', {
    group: 'CONTRACT',
    rule: 'Art. 33(2) and contract term',
    topic: 'breach_notification',
    heading: ['breach', 'incident', 'notification'],
    phrases: ['personal data breach', 'security incident', 'without undue delay', 'becoming aware'],
    requires: [
      { label: 'what triggers a notice', any: ['breach', 'incident'] },
      { label: 'a deadline', re: /within\s+\d+\s*(hours?|days?)|without undue delay/i },
    ],
    when: x => x.controls.includes('ASS-007'),
  }),
  C('CL-16', 'Service levels', 'Availability, response, resolution', {
    group: 'CONTRACT',
    topic: 'service_levels',
    heading: ['service level', 'sla', 'performance'],
    phrases: [
      'service level',
      'availability',
      'uptime',
      'response time',
      'resolution time',
      'respond to',
      'resolve',
    ],
    requires: [
      { label: 'availability', any: ['availability', 'uptime'] },
      { label: 'response times', any: ['respond', 'response'] },
      { label: 'resolution times', any: ['resolve', 'resolution'] },
    ],
    when: x => x.controls.includes('ASS-012'),
  }),
  C('CL-17', 'Business continuity', 'Recovery and continuity commitments', {
    group: 'CONTRACT',
    topic: 'business_continuity',
    heading: ['business continuity', 'disaster recovery'],
    phrases: ['business continuity', 'disaster recovery', 'recovery time', 'recovery point', 'backup'],
    requires: [
      { label: 'a continuity or recovery plan', any: ['business continuity', 'disaster recovery'] },
      {
        label: 'recovery targets or testing',
        any: ['recovery time', 'recovery point', 'rto', 'rpo', 'test'],
      },
    ],
    when: x => x.controls.includes('ASS-008'),
  }),
  C('CL-18', 'Termination and exit', 'Exit support, access revocation', {
    group: 'CONTRACT',
    topic: 'termination',
    heading: ['termination', 'exit'],
    phrases: ['terminate', 'termination', 'exit plan', 'exit assistance', 'transition'],
    requires: [
      { label: 'termination rights', any: ['terminat'] },
      {
        label: 'exit support or access removal',
        any: ['exit', 'transition', 'handover', 'hand over', 'revoke', 'revocation', 'remove access'],
      },
    ],
  }),
  C('CL-19', 'Liability and indemnity', 'Contractual liability allocation', {
    group: 'CONTRACT',
    topic: 'liability',
    heading: ['liability', 'indemn'],
    phrases: ['liability', 'indemnify', 'indemnity', 'shall not exceed', 'limitation of liability'],
    requires: [{ label: 'how liability is shared or limited', any: ['liability', 'indemn'] }],
  }),
  C('CL-20', 'Change control', 'Material-change approval process', {
    group: 'CONTRACT',
    topic: 'contract_terms',
    heading: ['change control', 'variation', 'changes to the services'],
    phrases: ['change control', 'change request', 'variation', 'material change', 'amendment'],
    requires: [
      { label: 'how changes are approved', any: ['agree', 'approval', 'approve', 'in writing', 'signed'] },
    ],
  }),
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const DOCUMENT_TYPES = ['MSA', 'SOW', 'SLA', 'DPA', 'NDA', 'SCC', 'OTHER'];
export const EXECUTION_STATUSES = ['DRAFT', 'SIGNED', 'EXPIRED', 'TERMINATED'];
export const SUPPORTED_LANGUAGES = ['en'];
export const FINDING_STATUSES = {
  FOUND: 'Found',
  PARTIAL: 'Partial',
  MISSING: 'Missing',
  NOT_APPLICABLE: 'Not applicable',
  HUMAN_REVIEW: 'Human review',
};
export const REVIEW_STATUSES = { EXTRACTED: 'Extracted', HUMAN_REVIEW: 'Human review', VERIFIED: 'Verified' };

const lower = s => String(s || '').toLowerCase();
const hasAny = (text, list) => list.filter(w => text.includes(w));

/* Which categories a clause belongs to, with how sure we are (0–1). */
export function categoriseClause(clause) {
  const heading = lower(clause.heading);
  const body = lower(clause.text);
  const out = [];
  for (const c of CATEGORIES) {
    const headingHit = hasAny(heading, c.heading).length > 0;
    const phraseHits = hasAny(body, c.phrases);
    if (c.context && !hasAny(body, c.context).length) continue;
    if (!headingHit && !phraseHits.length) continue;
    // A heading alone counts only weakly; the text decides.
    const confidence = !phraseHits.length
      ? 0.4
      : Math.min(0.97, 0.55 + 0.1 * Math.min(phraseHits.length, 3) + (headingHit ? 0.12 : 0));
    out.push({
      categoryId: c.id,
      confidence: Math.round(confidence * 100) / 100,
      headingOnly: !phraseHits.length,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/* Who the clause puts the duty on (step 18 "responsible party"). */
export function responsibleParty(text, { buyerName = '', vendorName = '' } = {}) {
  const t = lower(text);
  const first = w => lower(w).split(/\s+/)[0];
  const vendorWords = [
    'supplier',
    'processor',
    'vendor',
    'contractor',
    'service provider',
    first(vendorName),
  ].filter(w => w.length > 2);
  const buyerWords = ['customer', 'controller', 'client', 'buyer', first(buyerName)].filter(
    w => w.length > 2,
  );
  const duty = /\b(shall|must|will|agrees? to|may)\b/;
  let vendor = false,
    buyer = false,
    both = /\b(either|each|both) part(y|ies)\b/.test(t);
  for (const sentence of t.split(/(?<=[.;])\s+/)) {
    const m = sentence.match(duty);
    if (!m) continue;
    const subject = sentence.slice(0, m.index);
    if (vendorWords.some(w => subject.includes(w))) vendor = true;
    if (buyerWords.some(w => subject.includes(w))) buyer = true;
  }
  if (both || (vendor && buyer)) return 'Both parties';
  if (vendor) return vendorName || 'Supplier';
  if (buyer) return buyerName || 'Customer';
  return 'Not stated';
}

/* Step 18 for one document: the clause register (10 fields per clause). */
export function readDocument(
  pages,
  { documentId, documentNo, version, buyerName, vendorName, startAt = 1 } = {},
) {
  const raw = splitIntoClauses(pages);
  const paragraphs = raw.some(c => /^P\d+$/.test(c.number));
  return {
    paragraphs,
    clauses: raw.map((clause, i) => {
      const cats = categoriseClause(clause);
      const topics = classifyClause(clause);
      const base = cats[0]?.confidence ?? (topics.length ? 0.5 : 0.4);
      const confidence = Math.round(Math.max(0.1, base * (paragraphs ? 0.7 : 1)) * 100) / 100;
      return {
        id: `CLA-${String(startAt + i).padStart(3, '0')}`,
        key: `${documentId || documentNo}:${i + 1}`, // stable across analyses; reviewer corrections point here
        documentId: documentNo,
        documentUuid: documentId,
        documentVersion: version,
        page: clause.page,
        number: clause.number,
        heading: clause.heading,
        text: clause.text,
        category: cats[0]?.categoryId || null,
        categories: cats.map(c => c.categoryId),
        headingOnly: cats.filter(c => c.headingOnly).map(c => c.categoryId),
        responsibleParty: responsibleParty(clause.text, { buyerName, vendorName }),
        confidence,
        reviewStatus: confidence < 0.5 && cats.length ? 'HUMAN_REVIEW' : 'EXTRACTED',
        topics,
        keyTerms: findKeyTerms(clause.text),
        relevant: cats.length > 0 || topics.length > 0,
      };
    }),
  };
}

/* Applying a reviewer's corrections to a clause register. The original text never changes. */
export function applyCorrections(clauses, corrections = []) {
  const byKey = new Map(clauses.map(c => [c.key, { ...c }]));
  for (const k of corrections) {
    const c = byKey.get(k.clauseKey);
    if (!c) continue;
    if (k.action === 'VERIFY') {
      c.reviewStatus = 'VERIFIED';
      c.confidence = 1;
    }
    if (k.action === 'RECATEGORISE') {
      c.categories = k.categoryId ? [k.categoryId] : [];
      c.category = k.categoryId || null;
      c.headingOnly = [];
      c.reviewStatus = 'VERIFIED';
      c.confidence = 1;
    }
    if (k.action === 'SET_PARTY') c.responsibleParty = k.party;
  }
  return [...byKey.values()];
}

/* Whether a category applies to this relationship (step 18 legal logic). */
export function categoryApplies(c, x) {
  if (c.group === 'ART28') {
    if (x.processorRelationship) return { applies: true };
    if (c.alsoWhen?.(x)) return { applies: true, contractOnly: true };
    return {
      applies: false,
      why: 'No controller–processor relationship, so this Article 28 term is not required.',
    };
  }
  if (c.group === 'TRANSFER')
    return x.transferReview
      ? { applies: true }
      : {
          applies: false,
          why: 'No personal data leaves the buyer’s country (Stage 1), so no transfer terms are needed.',
        };
  if (c.when && !c.when(x))
    return { applies: false, why: 'The related control does not apply to this requirement (Stage 1).' };
  return { applies: true };
}
export function ruleFor(c, x, contractOnly = false) {
  if (c.group === 'ART28' && !contractOnly) return `${x.law} Art. ${c.article}`;
  if (c.group === 'TRANSFER') return `${x.law} Chapter V (Art. 44–46)`;
  if (c.rule) return x.processorRelationship ? `${x.law} ${c.rule}` : 'Contract term (not statutory)';
  return 'Contract term (not statutory)';
}

/* Step 20: one finding per category with the 9 output fields. */
export function assessFindings(clauses, x, { quality = { ok: true, reasons: [] }, overrides = [] } = {}) {
  return CATEGORIES.map(c => {
    const { applies, why, contractOnly } = categoryApplies(c, x);
    const hits = clauses.filter(k => k.categories.includes(c.id));
    const first = hits[0];
    const source = hits.map(k => `${k.documentId} §${k.number}${k.page ? ' p.' + k.page : ''}`).join('; ');
    const text = lower(hits.map(k => k.text).join(' '));
    const found = c.requires.filter(r => (r.re ? r.re.test(text) : hasAny(text, r.any).length));
    const missing = c.requires.filter(r => !found.includes(r));
    const confidence = hits.length ? Math.max(...hits.map(k => k.confidence)) : quality.ok ? 0.9 : 0.3;
    let status, explanation, action;
    if (!applies) {
      status = 'NOT_APPLICABLE';
      explanation = why;
      action = 'None.';
    } else if (!hits.length) {
      if (!quality.ok) {
        status = 'HUMAN_REVIEW';
        explanation = `No clause was found, but this cannot be reported as missing: ${quality.reasons.join(' ')}`;
        action = 'Read the contract and its schedules by hand, or upload a readable copy.';
      } else {
        status = 'MISSING';
        explanation = `No clause about ${c.name.toLowerCase()} was found (${c.check.toLowerCase()}).`;
        action = `Add a clause covering ${c.check.toLowerCase()}, or upload the schedule that covers it.`;
      }
    } else if (!found.length) {
      status = 'PARTIAL';
      explanation = `A clause is headed or worded like this, but its text does not show ${missing.map(r => r.label).join(' or ')}. A heading alone is not proof.`;
      action = 'Check the clause and its schedules; add the missing wording.';
    } else if (missing.length) {
      status = 'PARTIAL';
      explanation = `The clause covers ${found.map(r => r.label).join(' and ')}, but ${missing.map(r => r.label).join(' and ')} ${missing.length === 1 ? 'is' : 'are'} unclear.`;
      action = `Clarify ${missing.map(r => r.label).join(' and ')}.`;
    } else if (confidence < 0.5) {
      status = 'HUMAN_REVIEW';
      explanation = 'A matching clause was found, but the extraction confidence is low.';
      action = 'Check the clause by hand and mark it verified.';
    } else {
      status = 'FOUND';
      explanation = `Covers ${found.map(r => r.label).join(' and ')}.`;
      action = 'None.';
    }
    const finding = {
      categoryId: c.id,
      name: c.name,
      check: c.check,
      clauseId: first?.id || null,
      clauseIds: hits.map(k => k.id),
      heading: first?.heading || null,
      page: first?.page || null,
      sourceRef: source || null,
      rule: ruleFor(c, x, contractOnly),
      statutory: (c.group === 'ART28' && !contractOnly) || c.group === 'TRANSFER',
      status,
      explanation,
      confidence: Math.round(confidence * 100) / 100,
      recommendedAction: action,
      topic: c.topic,
    };
    const o = [...overrides].reverse().find(k => k.categoryId === c.id);
    if (o) {
      finding.status = o.status;
      finding.explanation = `${o.note} (reviewer)`;
      finding.reviewed = { by: o.by, at: o.at };
      finding.confidence = 1;
      if (o.status === 'FOUND' || o.status === 'NOT_APPLICABLE') finding.recommendedAction = 'None.';
    }
    return finding;
  });
}

/* The context the checks need, from Stage 1 and Stage 3. */
export function reviewContext({ data = {}, controls = [], processingRole = null, transferReview = false }) {
  const pd = ['Yes', 'Unknown'].includes(data.personalData);
  const bc = data.buyerCountry || 'GB';
  return {
    law: bc === 'GB' ? 'UK GDPR' : 'GDPR',
    controls,
    processorRelationship: pd && processingRole !== 'controller',
    transferReview,
  };
}

/* Step 18 for the whole contract set: clauses from every current document, findings and totals. */
export function analyseSet(documents, x, { corrections = [], buyerName = '', vendorName = '' } = {}) {
  const quality = { ok: true, reasons: [] };
  const readable = documents.filter(d => d.clauses.length);
  if (!readable.length) {
    quality.ok = false;
    quality.reasons.push('no document could be read.');
  }
  for (const d of documents) {
    if (d.extractionStatus === 'UNREADABLE') {
      quality.ok = false;
      quality.reasons.push(`${d.documentNo} could not be read.`);
    }
    if (d.extractionStatus === 'LANGUAGE') {
      quality.ok = false;
      quality.reasons.push(`${d.documentNo} is not in a supported language.`);
    }
    if (d.paragraphs) {
      quality.ok = false;
      quality.reasons.push(`${d.documentNo} has no clause numbering, so clauses were read as paragraphs.`);
    }
  }
  // Clause IDs run across the whole set (CLA-001, CLA-002 …); corrections follow the stable key.
  const clauses = applyCorrections(
    documents.flatMap(d => d.clauses).map((k, i) => ({ ...k, id: `CLA-${String(i + 1).padStart(3, '0')}` })),
    corrections,
  );
  const findings = assessFindings(clauses, x, {
    quality,
    overrides: corrections.filter(k => k.action === 'SET_FINDING'),
  });
  const count = s => findings.filter(f => f.status === s).length;
  const preliminary = [];
  for (const d of documents) {
    if (d.executionStatus === 'DRAFT')
      preliminary.push(
        `${d.documentNo} (${d.title}) is an unsigned draft: its terms are not yet binding and are not treated as an executed agreement.`,
      );
    if (d.executionStatus === 'EXPIRED' || d.executionStatus === 'TERMINATED')
      preliminary.push(`${d.documentNo} (${d.title}) is ${d.executionStatus.toLowerCase()}.`);
    if (d.partiesMissing?.length)
      preliminary.push(
        `${d.documentNo}: ${d.partiesMissing.join(' and ')} not named in the text. Check the parties.`,
      );
  }
  const notFound = findings
    .filter(f => f.status === 'MISSING')
    .map(f => ({ topicId: f.topic, categoryId: f.categoryId, name: f.name, text: f.explanation }));
  return {
    rulePackVersion: S4_RULE_PACK,
    status: quality.ok ? 'ANALYSED' : 'HUMAN_REVIEW',
    quality,
    clauses,
    findings,
    preliminary,
    notFound,
    topics: TOPICS.map(t => ({
      id: t.id,
      name: t.name,
      controls: t.controls,
      clauseIds: clauses.filter(k => k.topics.some(z => z.topicId === t.id)).map(k => k.id),
      status: clauses.some(k => k.topics.some(z => z.topicId === t.id)) ? 'FOUND' : 'NOT_FOUND',
    })),
    totals: {
      documents: documents.length,
      clauses: clauses.length,
      relevant: clauses.filter(k => k.relevant).length,
      found: count('FOUND'),
      partial: count('PARTIAL'),
      missing: count('MISSING'),
      notApplicable: count('NOT_APPLICABLE'),
      humanReview: count('HUMAN_REVIEW'),
      toReview: clauses.filter(k => k.reviewStatus === 'HUMAN_REVIEW').length,
    },
    note: ANALYSIS_NOTE,
  };
}

/**
 * Kept for the engine tests and the obligation tests: a single document, read straight from its pages.
 * @param {string[]} pages
 */
export function analyseContract(
  pages,
  { applicableControls = [], data = { personalData: 'Yes' }, processingRole = 'processor' } = {},
) {
  const doc = readDocument(pages, { documentId: null, documentNo: 'DOC-001', version: 1 });
  const x = reviewContext({
    data,
    controls: applicableControls,
    processingRole,
    transferReview: applicableControls.includes('ASS-005'),
  });
  return analyseSet([{ documentNo: 'DOC-001', title: 'Contract', ...doc }], x);
}
