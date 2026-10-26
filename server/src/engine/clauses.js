/*
 * Stage 4 – Contract analysis (step 18: extract the text and identify the clauses).
 *
 * The contract text is split into numbered clauses, and each clause is checked
 * against a list of topics (data protection, security, breach notification …).
 * A clause can match more than one topic.
 *
 * These topics and keywords are PROVISIONAL (rule pack RP-2026.10-S4-draft).
 * They follow the Use Case 1 prototype and the assurance controls from the
 * Stage 1 specification, and will be replaced when the client sends the
 * Stage 4 specification.
 *
 * The result is a reading aid for the buyer. It does not say whether the
 * contract is adequate or compliant.
 */

export const S4_RULE_PACK = 'RP-2026.10-S4-draft';

export const ANALYSIS_NOTE =
  'Clauses are identified automatically from the text. This is a reading aid for review, not a legal opinion or a compliance conclusion.';

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

/**
 * Runs the full analysis on the extracted pages.
 *
 * @param {string[]} pages
 * @param {{ applicableControls?: string[] }} options  controls from the requirement profile (Stage 1)
 */
export function analyseContract(pages, { applicableControls = [] } = {}) {
  const clauses = splitIntoClauses(pages).map((clause, index) => {
    const topics = classifyClause(clause);
    return {
      id: `C${String(index + 1).padStart(3, '0')}`,
      number: clause.number,
      heading: clause.heading,
      page: clause.page,
      text: clause.text,
      topics,
      keyTerms: findKeyTerms(clause.text),
      relevant: topics.length > 0,
    };
  });

  const topicSummary = TOPICS.map(topic => {
    const found = clauses.filter(clause => clause.topics.some(t => t.topicId === topic.id));
    const linkedToRequirement = topic.controls.some(id => applicableControls.includes(id));
    return {
      id: topic.id,
      name: topic.name,
      controls: topic.controls,
      clauseIds: found.map(clause => clause.id),
      clauseNumbers: found.map(clause => clause.number),
      expected: topic.expected || linkedToRequirement,
      status: found.length > 0 ? 'FOUND' : 'NOT_FOUND',
    };
  });

  const notFound = topicSummary.filter(topic => topic.expected && topic.status === 'NOT_FOUND');

  return {
    rulePackVersion: S4_RULE_PACK,
    totals: {
      clauses: clauses.length,
      relevant: clauses.filter(clause => clause.relevant).length,
      topicsFound: topicSummary.filter(topic => topic.status === 'FOUND').length,
      expectedNotFound: notFound.length,
    },
    clauses,
    topics: topicSummary,
    notFound: notFound.map(topic => ({
      topicId: topic.id,
      name: topic.name,
      text: `No clause about ${topic.name.toLowerCase()} was found. Check the contract and its schedules manually.`,
    })),
    note: ANALYSIS_NOTE,
  };
}
