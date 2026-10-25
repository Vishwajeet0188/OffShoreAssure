/* Display helpers for Stage 8 · Remediation. */
import { API_BASE, ApiError, readResponse, unavailableError } from './api.js';

export const STATUS_TONE = {
  PROPOSED: 'b-plum', OPEN: 'b-amber', RETURNED: 'b-coral', SUBMITTED: 'b-amber', CLOSED: 'b-sage', RISK_ACCEPTED: 'b-mute',
};
export const RESIDUAL_WORD = { OPEN: 'Open', PART_MITIGATED: 'Partly fixed', MITIGATED: 'Fixed', ACCEPTED: 'Accepted' };
export const RESIDUAL_TONE = { OPEN: 'b-coral', PART_MITIGATED: 'b-amber', MITIGATED: 'b-sage', ACCEPTED: 'b-mute' };
export const EVENT_WORD = {
  proposed: 'Proposed from the risk register', assigned: 'Approved and assigned', risk_accepted: 'Risk accepted',
  evidence_uploaded: 'Document added', evidence_removed: 'Document removed', submitted: 'Response submitted',
  returned: 'Returned for more', closed: 'Closed',
};

const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = action => !!action.dueOn && action.dueOn < today() && ['OPEN', 'RETURNED'].includes(action.status);

/* Uploads one document (raw body) for an action. `base` is the action's API path. */
export async function uploadActionFile(base, file) {
  let res;
  try {
    res = await fetch(`${API_BASE}${base}/evidence?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
    });
  } catch (error) {
    throw unavailableError(0, error.message);
  }
  if (res.status === 413) throw new ApiError(413, { message: 'The file is larger than 10 MB.' });
  return readResponse(res);
}
export const actionFileUrl = (base, id) => `${API_BASE}${base}/evidence/${id}`;
