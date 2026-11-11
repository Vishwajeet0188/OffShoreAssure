/* Display helpers for Stage 6 · Transfer assessment. */

const STATUS_TONE = {
  // The six statuses of the client's specification.
  LEGAL_REVIEW_REQUIRED: 'b-coral',
  INFORMATION_REQUIRED: 'b-amber',
  EXCEPTION_REVIEW: 'b-amber',
  SAFEGUARD_REVIEW: 'b-amber',
  ADEQUACY_ROUTE: 'b-sage',
  NO_RESTRICTED_TRANSFER: 'b-sage',

  // Results saved with the earlier draft rules.
  NOT_PERMITTED: 'b-coral',
  SAFEGUARD_MISSING: 'b-coral',
  INFORMATION_NEEDED: 'b-amber',
  SAFEGUARD_TRA_NEEDED: 'b-amber',
  ADEQUATE_CHECK: 'b-amber',
  ADEQUATE: 'b-sage',
  NOT_RESTRICTED: 'b-sage',
};

export const statusTone = status => STATUS_TONE[status] || 'b-mute';

/* The encryption and access controls on a route, from the vendor's Stage 3 answers. */
export const CONTROL_LABEL = {
  encryption: 'Encryption',
  privilegedMfa: 'MFA (privileged)',
  remoteMfa: 'MFA (remote)',
  leastPrivilege: 'Least privilege',
};

const CONTROL_TONE = {
  PASS: 'b-sage',
  PARTIAL: 'b-amber',
  FAIL: 'b-coral',
  UNKNOWN: 'b-amber',
  REVIEW_REQUIRED: 'b-amber',
};
export const controlTone = status => CONTROL_TONE[status] || 'b-mute';
