/* Display helpers for Stage 5 · Obligation extraction. */

export const PARTY_TONE = { vendor: 'b-plum', buyer: 'b-sage', both: 'b-amber', unknown: 'b-mute' };
export const TYPE_TONE = { Obligation: 'b-mute', Prohibition: 'b-coral', Right: 'b-sage' };
export const CONFIDENCE_TONE = { High: 'b-sage', Medium: 'b-amber', Low: 'b-mute' };

/* "within 24 hours · each month · On termination" */
export function describeTiming(obligation) {
  const parts = [...(obligation.deadline || [])];
  if (obligation.frequency) parts.push(obligation.frequency);
  if (obligation.condition) parts.push(obligation.condition);
  return parts.join(' · ');
}
