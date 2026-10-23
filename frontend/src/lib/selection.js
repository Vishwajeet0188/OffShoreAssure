/* Display helpers for Stage 2 · Vendor selection. */
export const MATCH_LABEL = { GOOD: ['Approved', 'Good match'], PARTIAL: ['Attention', 'Partial match'], NO_MATCH: ['Restricted', 'Not a match'] };
export const CHECK_TONE = { pass: 'b-sage', partial: 'b-amber', fail: 'b-coral' };
export const CHECK_WORD = { pass: 'Yes', partial: 'Partly', fail: 'No' };
export const CHECK_SHORT = { verified: 'Verified', service: 'Service', location: 'Preferred country', restricted: 'Restricted countries', scope: 'Access countries' };
export const VERIFY = { approved: ['Verified', 'Verified'], pending: ['Pending', 'Verification pending'], rejected: ['Rejected', 'Not verified'] };
export const countryList = (codes, names) => (codes || []).map(c => names?.[c] || c).join(', ');
