/* Display helpers for Stage 1 · Step 2 assessment fields. */
export const CLASS_LABEL = {
  PUBLIC: 'Public',
  INTERNAL: 'Internal',
  CONFIDENTIAL: 'Confidential',
  PERSONAL: 'Personal',
  SPECIAL_CATEGORY: 'Special category',
};
export const TIER_LABEL = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
export const TIER_TONE = { LOW: 'sage', MEDIUM: 'amber', HIGH: 'coral', CRITICAL: 'coral' };
export const STATUS_LABEL = {
  VALID: ['Approved', 'Valid'],
  INCOMPLETE: ['Pending', 'Incomplete — clarification needed'],
  INVALID: ['Restricted', 'Invalid'],
};
export const serviceLabel = code =>
  code
    .split('_')
    .map(w => w[0] + w.slice(1).toLowerCase())
    .join(' ')
    .replace('It ', 'IT ');
