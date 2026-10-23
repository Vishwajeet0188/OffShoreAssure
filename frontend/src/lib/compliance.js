/* Display helpers for Stage 3 · Compliance assessment. */
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const RATING_TONE = { STRONG: 'sage', ADEQUATE: 'amber', WEAK: 'coral', INSUFFICIENT: 'coral' };
export const STATUS = { requested: ['Pending', 'Waiting for the vendor'], in_progress: ['In progress', 'Vendor is answering'], submitted: ['Complete', 'Results ready'] };
export const GAP_KIND = { answer: ['b-coral', 'Answered No'], partial: ['b-amber', 'Partly'], evidence: ['b-amber', 'Evidence missing'], expired: ['b-coral', 'Expired'] };
export const answerTone = a => a === 'Yes' ? 'b-sage' : a === 'Partly' ? 'b-amber' : 'b-coral';
export const buyerEvidenceUrl = (ref, id) => `${BASE}/assessments/${ref}/compliance/evidence/${id}`;
export const vendorEvidenceUrl = (ref, id) => `${BASE}/vendor/compliance/${ref}/evidence/${id}`;
