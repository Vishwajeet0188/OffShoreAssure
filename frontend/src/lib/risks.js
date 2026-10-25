/* Display helpers for Stage 7 · Risk identification. */

export const RATING_TONE = { CRITICAL: 'b-coral', HIGH: 'b-coral', MEDIUM: 'b-amber', LOW: 'b-sage', NONE: 'b-mute' };
export const ratingTone = rating => RATING_TONE[rating] || 'b-mute';

export const SEVERITY_TONE = { blocker: 'b-coral', fail: 'b-coral', gap: 'b-amber', unknown: 'b-amber' };
export const SEVERITY_WORD = { blocker: 'Not permitted', fail: 'Missing', gap: 'Partly', unknown: 'Not confirmed' };

export const EVIDENCE_TONE = { 'Evidence held': 'b-sage', 'Partly evidenced': 'b-amber', 'No evidence': 'b-coral', 'Not assessed': 'b-mute' };

/* Where each source lives in the app, so a finding can link back to it. */
export const STAGE_PATH = { 1: '/requirements', 2: '/vendor-selection', 3: '/compliance', 4: '/contract', 5: '/obligations', 6: '/transfers' };

/* The band a cell of the 5 × 5 grid falls in (same bands as the server). */
export const cellBand = score => (score >= 20 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low');
