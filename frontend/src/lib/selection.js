/* Display helpers for Stage 2 · Vendor selection (spec v2: directory, existing vendor, add our own vendor). */
import { API_BASE, ApiError, readResponse, unavailableError } from './api.js';

export const MODES = [
  { id: 'DIRECTORY_SEARCH', title: 'Search the OffshoreAssure directory', text: 'Find verified vendors by service and country. Results show service fit, evidence and a fit score.' },
  { id: 'EXISTING_VENDOR', title: 'Select a vendor already added by our organisation', text: 'Reuse a saved vendor with its evidence and version history.' },
  { id: 'ADD_NEW_VENDOR', title: 'Add our own vendor', text: 'The vendor does not need to be on OffshoreAssure. It starts as unverified.' }
];

export const SOURCE_LABEL = { DIRECTORY: 'OffshoreAssure directory', EXISTING: 'Existing vendor (reused)', BUYER_PROVIDED: 'Buyer provided' };

// Badge status word (sets the colour) and the label people read.
export const ELIGIBILITY = {
  ELIGIBLE: ['Approved', 'Eligible'],
  ELIGIBLE_WITH_GAPS: ['Attention', 'Eligible with gaps'],
  EXCLUDED: ['Restricted', 'Excluded']
};
export const REVIEW = {
  VERIFIED: ['Verified', 'Verified'],
  VERIFICATION_PENDING: ['Pending', 'Verification pending'],
  PRELIMINARY_UNVERIFIED: ['Pending', 'Preliminary, unverified'],
  NOT_VERIFIED: ['Rejected', 'Not verified']
};
export const SELECTION_STATUS = {
  SELECTED_PENDING_ASSESSMENT: ['Complete', 'Selected, pending assessment'],
  CONDITIONALLY_SELECTED: ['Attention', 'Conditionally selected'],
  SELECTION_BLOCKED: ['Restricted', 'Selection blocked']
};

export const CHECK_TONE = { pass: 'b-sage', partial: 'b-amber', missing: 'b-mute', info: 'b-plum', fail: 'b-coral' };
export const CHECK_WORD = { pass: 'Matches', partial: 'Partly', missing: 'Missing', info: 'Note', fail: 'Does not match' };

/* The status Step 8 will give this candidate (same rule as the server). */
export function expectedStatus(fit) {
  if (!fit.selectable) return 'SELECTION_BLOCKED';
  if (fit.reviewStatus !== 'VERIFIED' || fit.eligibility !== 'ELIGIBLE') return 'CONDITIONALLY_SELECTED';
  return 'SELECTED_PENDING_ASSESSMENT';
}

export const countryList = (codes, names) => (codes || []).map(c => c === 'UNKNOWN' ? 'Unknown' : names?.[c] || c).join(', ');

/* Uploads the existing contract or DPA of a buyer-added vendor (raw body, PDF or DOCX). */
export async function uploadVendorDocument(ref, vendorId, type, file) {
  let res;
  try {
    res = await fetch(`${API_BASE}/assessments/${ref}/own-vendors/${vendorId}/documents?type=${type}&name=${encodeURIComponent(file.name)}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file
    });
  } catch (error) {
    throw unavailableError(0, error.message);
  }
  if (res.status === 413) throw new ApiError(413, { message: 'The file is larger than 15 MB.' });
  return readResponse(res);
}
export const vendorDocumentUrl = (ref, vendorId, docId) => `${API_BASE}/assessments/${ref}/own-vendors/${vendorId}/documents/${docId}`;
