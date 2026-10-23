/* Helpers for Stage 4 · Contract analysis. */
import { readResponse, unavailableError } from './api.js';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export const CONFIDENCE_TONE = { High: 'b-sage', Medium: 'b-amber', Low: 'b-mute' };

export const contractFileUrl = (reference, version) =>
  `${BASE}/assessments/${reference}/contract/${version}/file`;

/* Sends the file as the raw request body; label and reason go in the query string. */
export async function uploadContract(reference, file, { label = '', reason = '' } = {}) {
  const params = new URLSearchParams({ name: file.name });
  if (label.trim()) params.set('label', label.trim());
  if (reason.trim()) params.set('reason', reason.trim());

  let response;
  try {
    response = await fetch(`${BASE}/assessments/${reference}/contract?${params}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
  } catch (error) {
    throw unavailableError(0, error.message);
  }

  return readResponse(response);
}
