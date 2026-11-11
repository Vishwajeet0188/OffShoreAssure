/* Helpers for Stage 4 · Contract analysis. */
import { readResponse, unavailableError } from './api.js';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export const CONFIDENCE_TONE = { High: 'b-sage', Medium: 'b-amber', Low: 'b-mute' };

/* Finding status (step 20) → badge colour. */
export const FINDING_TONE = {
  FOUND: 'b-sage',
  PARTIAL: 'b-amber',
  MISSING: 'b-coral',
  NOT_APPLICABLE: 'b-mute',
  HUMAN_REVIEW: 'b-plum',
};
export const REVIEW_TONE = { EXTRACTED: 'b-mute', HUMAN_REVIEW: 'b-plum', VERIFIED: 'b-sage' };
export const EXECUTION_LABEL = {
  DRAFT: 'Draft',
  SIGNED: 'Signed',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
};
export const EXTRACTION_LABEL = {
  EXTRACTED: ['b-sage', 'Text extracted'],
  UNREADABLE: ['b-coral', 'Unreadable: manual review'],
  LANGUAGE: ['b-plum', 'Other language: manual review'],
};
export const confidenceText = c => (c == null ? '—' : `${Math.round(c * 100)}%`);

export const contractFileUrl = (reference, id) => `${BASE}/assessments/${reference}/contract/file/${id}`;

/* Step 17: the file is the raw request body; the 11 fields go in the query string. */
export async function uploadContract(reference, file, fields) {
  const params = new URLSearchParams({ name: file.name });
  for (const [k, v] of Object.entries(fields))
    if (v != null && String(v).trim() !== '') params.set(k, String(v).trim());
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
