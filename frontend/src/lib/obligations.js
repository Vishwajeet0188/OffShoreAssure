/* Display helpers for Stage 5 · Obligation extraction. */

export const PARTY_TONE = { vendor: 'b-plum', buyer: 'b-sage', both: 'b-amber', unknown: 'b-mute' };
export const TYPE_TONE = { Obligation: 'b-mute', Prohibition: 'b-coral', Right: 'b-sage' };

// Registers saved before the client's specification used High / Medium / Low.
export const CONFIDENCE_TONE = { High: 'b-sage', Medium: 'b-amber', Low: 'b-mute' };

/* Review status of an obligation (step 23). */
export const STATUS_TONE = {
  UNVERIFIED: 'b-mute',
  REQUIRES_VERIFICATION: 'b-amber',
  VERIFIED: 'b-sage',
  REJECTED: 'b-coral',
};

/* Rule trace status (step 22). */
export const RULE_TONE = {
  COVERED: 'b-sage',
  PARTIAL: 'b-amber',
  HUMAN_REVIEW: 'b-amber',
  NOT_FOUND: 'b-coral',
  NOT_APPLICABLE: 'b-mute',
};
export const RULE_LABEL = {
  COVERED: 'Covered',
  PARTIAL: 'Partly covered',
  HUMAN_REVIEW: 'Human review',
  NOT_FOUND: 'Not found',
  NOT_APPLICABLE: 'Not applicable',
};

/* Engine checks (step 22). */
export const CHECK_TONE = { issue: 'b-coral', warning: 'b-amber', info: 'b-mute' };
export const CHECK_LABEL = {
  BASIS: 'Legal or contractual',
  PARTY: 'Responsible party',
  COMPLETENESS: 'Completeness',
  CONFLICT: 'Conflicting clauses',
  DOWNSTREAM: 'Downstream duties',
  EVIDENCE: 'Evidence',
};

/* Confidence is a number from 0 to 1 (older registers used words). */
export function confidenceTone(value) {
  if (typeof value !== 'number') return CONFIDENCE_TONE[value] || 'b-mute';
  if (value >= 0.8) return 'b-sage';
  if (value >= 0.6) return 'b-amber';
  return 'b-mute';
}
export const confidenceText = value => (typeof value === 'number' ? value.toFixed(2) : value);

/* "DOC-002 · §9.4 · p. 3" (older registers: "Clause 9.4"). */
export function sourceOf(obligation) {
  if (obligation.sourceClause) {
    const { section, page } = obligation.sourceClause;
    return [obligation.sourceDocument?.id, '§' + section, page ? 'p. ' + page : null]
      .filter(Boolean)
      .join(' · ');
  }
  return obligation.source ? 'Clause ' + obligation.source.clauseNumber : '';
}

/* "Becoming aware of the event · within 24 hours · Event-driven" (older registers: their own words). */
export function describeTiming(obligation, frequencies = {}) {
  // Older registers: a list of deadlines, a frequency phrase and a condition.
  if (Array.isArray(obligation.deadline)) {
    const parts = [...obligation.deadline];
    if (obligation.frequency) parts.push(obligation.frequency);
    if (obligation.condition) parts.push(obligation.condition);
    return parts.join(' · ');
  }

  const parts = [];
  if (obligation.trigger && obligation.trigger.type !== 'ONGOING') parts.push(obligation.trigger.text);
  if (obligation.deadline && obligation.deadline.type !== 'UNSPECIFIED') parts.push(obligation.deadline.text);
  if (obligation.frequency && !['EVENT_DRIVEN'].includes(obligation.frequency))
    parts.push(frequencies[obligation.frequency] || obligation.frequency);
  return parts.join(' · ');
}

/* What the contract says happens when the obligation is missed. */
export function consequenceOf(obligation) {
  const c = obligation.consequence;
  if (!c) return null;
  if (c.type === 'NOT_STATED') return { text: 'Not stated in the contract', clause: null };
  return {
    text: c.text,
    clause: c.clauseRef || c.clauseNumber || null,
    general: c.type === 'GENERAL_BREACH_TERM' || c.scope === 'contract',
  };
}
