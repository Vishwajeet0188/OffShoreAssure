/* Display helpers for Stage 3 · Compliance assessment. */
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

/* Overall position colour. The first four are from the earlier draft rule pack (older assessments). */
export const RATING_TONE = {
  STRONG: 'sage',
  ADEQUATE: 'amber',
  WEAK: 'coral',
  INSUFFICIENT: 'coral',
  SATISFACTORY: 'sage',
  CONDITIONAL: 'amber',
  ESCALATE: 'coral',
  BLOCKED: 'coral',
};
export const ratingBadge = code =>
  ({ sage: 'Approved', amber: 'Attention', coral: 'Restricted' })[RATING_TONE[code]] || 'Info';

export const STATUS = {
  requested: ['Pending', 'Waiting for the vendor'],
  in_progress: ['In progress', 'In progress: vendor is answering'],
  clarification: ['In review', 'Clarification requested'],
  submitted: ['Complete', 'Results ready'],
};

/* Control status (step 14). */
export const CONTROL_STATUS = {
  PASS: ['b-sage', 'Pass'],
  PARTIAL: ['b-amber', 'Partial'],
  REVIEW_REQUIRED: ['b-plum', 'Review required'],
  FAIL: ['b-coral', 'Fail'],
  UNKNOWN: ['b-mute', 'Unknown'],
  NOT_APPLICABLE: ['b-mute', 'Not applicable'],
};

export const GAP_KIND = {
  answer: ['b-coral', 'Fail'],
  partial: ['b-amber', 'Partial'],
  evidence: ['b-amber', 'Evidence missing'],
  expired: ['b-coral', 'Expired'],
  missing: ['b-mute', 'Not answered'],
  unknown: ['b-mute', 'Unknown'],
  unreadable: ['b-amber', 'Unreadable'],
  mismatch: ['b-coral', 'Mismatch'],
  contradiction: ['b-coral', 'Contradiction'],
  review: ['b-plum', 'Human review'],
  location: ['b-amber', 'Data location'],
  threshold: ['b-coral', 'Below target'],
  scope: ['b-amber', 'Certificate scope'],
};
export const gapKind = kind => GAP_KIND[kind] || ['b-mute', kind];

/* Evidence processing status (step 13). */
export const PROCESSING_TONE = {
  ACCEPTED: 'b-sage',
  EXPIRED: 'b-coral',
  UNREADABLE: 'b-amber',
  MISMATCH: 'b-coral',
  NEEDS_REVIEW: 'b-plum',
};
export const PROCESSING_SHORT = {
  ACCEPTED: 'Checks passed',
  EXPIRED: 'Expired',
  UNREADABLE: 'Unreadable',
  MISMATCH: 'Entity mismatch',
  NEEDS_REVIEW: 'Needs human review',
};

export const ROLE_LABEL = {
  controller: 'Controller',
  processor: 'Processor',
  subprocessor: 'Subprocessor',
  unknown: 'Unknown',
};
export const TYPE_LABEL = { initial: 'Initial', renewal: 'Renewal', 'event-driven': 'Event-driven' };

export const answerTone = a =>
  a === 'Yes'
    ? 'b-sage'
    : a === 'Partly' || a === 'Partial'
      ? 'b-amber'
      : a === 'Unknown'
        ? 'b-mute'
        : 'b-coral';

/* One answer in words, for the buyer's control table. */
export function answerText(control, v, countryName = c => c) {
  if (!v || (!v.answer && !v.countries?.length && v.rto == null && v.amount == null)) return 'Not answered';
  switch (control.answerType) {
    case 'YES_NO_REGISTRATION':
      return v.answer === 'Yes' ? `Yes · ${v.registrationNumber || 'no number given'}` : v.answer;
    case 'YES_NO_TABLE':
      return v.answer === 'Yes'
        ? `Yes · ${(v.rows || []).map(r => `${r.name}${r.country ? ' (' + countryName(r.country) + ')' : ''}`).join(', ')}`
        : v.answer;
    case 'COUNTRIES':
      return (v.countries || []).map(countryName).join(', ');
    case 'HOURS':
      return `RTO ${v.rto ?? '—'} h · RPO ${v.rpo ?? '—'} h`;
    case 'AMOUNT_DATE':
      return v.answer === 'No'
        ? 'No cover'
        : `${v.currency || 'GBP'} ${Number(v.amount || 0).toLocaleString('en-GB')} · expires ${v.expiresOn || '—'}`;
    default:
      return v.answer;
  }
}

export const buyerEvidenceUrl = (ref, id) => `${BASE}/assessments/${ref}/compliance/evidence/${id}`;
export const vendorEvidenceUrl = (ref, id) => `${BASE}/vendor/compliance/${ref}/evidence/${id}`;
