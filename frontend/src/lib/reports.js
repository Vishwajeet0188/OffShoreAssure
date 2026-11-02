/* Display helpers for Stage 9 · Monitoring and audit. */
import { API_BASE } from './api.js';

export const POSITION_TONE = { ACTION_REQUIRED: 'b-coral', IN_REMEDIATION: 'b-amber', RISKS_ACCEPTED: 'b-plum', ACTIONS_CLOSED: 'b-sage' };
export const SEVERITY_TONE = { high: 'b-coral', medium: 'b-amber', low: 'b-sage' };
export const SEVERITY_WORD = { high: 'Needs attention now', medium: 'Coming up', low: 'For information' };
export const KIND_WORD = { renewal: 'Renewal', overdue: 'Overdue action', change: 'Records changed', review: 'Periodic review' };

/* Where each stage lives in the app, so a report section can link back to its record. */
export const STAGE_PATH = { 1: '/requirements', 2: '/vendor-selection', 3: '/compliance', 4: '/contract', 5: '/obligations', 6: '/transfers', 7: '/risks', 8: '/remediation' };

export const packUrl = (reference, version) => `${API_BASE}/assessments/${reference}/report/${version}/pack`;
export const pdfUrl = (reference, version) => `${API_BASE}/assessments/${reference}/report/${version}/pdf`;
export const adminPdfUrl = (reference, version) => `${API_BASE}/admin/reports/${reference}/${version}/pdf`;
export const shortHash = h => (h ? h.slice(0, 12) + '…' : '—');
