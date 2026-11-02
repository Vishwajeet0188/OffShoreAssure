/* Display helpers for Stage 6 · Transfer assessment. */

const STATUS_TONE = {
  NOT_PERMITTED: 'b-coral',
  SAFEGUARD_MISSING: 'b-coral',
  INFORMATION_NEEDED: 'b-amber',
  SAFEGUARD_TRA_NEEDED: 'b-amber',
  ADEQUATE_CHECK: 'b-amber',
  ADEQUATE: 'b-sage',
  NOT_RESTRICTED: 'b-sage',
};

export const statusTone = status => STATUS_TONE[status] || 'b-mute';

/* Colour for each check result on a route. */
export const CHECK_TONE = {
  OK: 'b-sage',
  NO: 'b-mute',
  CONDITION: 'b-amber',
  NEEDED: 'b-amber',
  UNKNOWN: 'b-amber',
  GAP: 'b-amber',
  'HIGHER RISK': 'b-amber',
  FAIL: 'b-coral',
};
