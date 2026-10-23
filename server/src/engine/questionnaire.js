/* Stage 3 — Compliance assessment (steps 11 and 14).
   Step 11: generate the control set and questionnaire from the controls that apply (requirement profile, Stage 1 Step 3).
   Step 14: validate the vendor's answers and evidence and calculate a provisional score.
   PROVISIONAL rule pack RP-2026.10-S3-draft: questions, evidence rules, areas, weights and bands follow the Use Case 1
   prototype (area scores + overall score out of 100, "not a legal conclusion") until the client sends a Stage 3 specification.
   Change them here only, and bump the version. */

export const S3_RULE_PACK = 'RP-2026.10-S3-draft';
export const ANSWERS = ['Yes', 'Partly', 'No'];
export const ANSWER_POINTS = { Yes: 100, Partly: 50, No: 0 };

/* Evidence types a vendor can upload. certificate → needs an expiry date. */
export const EVIDENCE_TYPES = {
  certificate: 'Certificate (e.g. ISO 27001, SOC 2, Cyber Essentials)',
  policy: 'Policy or procedure',
  report: 'Report or test results',
  insurance: 'Insurance certificate',
  register: 'Register or list (e.g. subprocessors)',
  other: 'Other supporting document'
};
export const EXPIRING = ['certificate', 'insurance'];

/* Areas shown to the buyer (as in the Use Case 1 prototype) and the controls in each. */
export const AREAS = [
  ['governance', 'Company and governance', ['ASS-001', 'ASS-011', 'ASS-015']],
  ['security', 'Information security', ['ASS-002', 'ASS-003', 'ASS-009']],
  ['data', 'Data protection', ['ASS-004', 'ASS-014']],
  ['transfer', 'Data transfer', ['ASS-005']],
  ['subcontractors', 'Subcontractor controls', ['ASS-006']],
  ['incident', 'Incident management', ['ASS-007']],
  ['continuity', 'Business continuity', ['ASS-008']],
  ['people', 'People', ['ASS-010']],
  ['service', 'Service and audit', ['ASS-012', 'ASS-013']]
];

/* Questions per control. evidence: the evidence type that should back a "Yes" (null = no document needed). */
const Q = (id, text, evidence = null, help = '') => ({ id, text, evidence, help });
export const CONTROL_QUESTIONS = {
  'ASS-001': [Q('001-1', 'Is your company legally registered in the country you deliver the service from?', 'other', 'Upload a certificate of incorporation or registry extract.'),
              Q('001-2', 'Are all legal entities that will deliver this service named in your company profile?')],
  'ASS-002': [Q('002-1', 'Do you hold a current ISO 27001, SOC 2 Type II or Cyber Essentials certificate?', 'certificate'),
              Q('002-2', 'Do you have an information security policy approved by management?', 'policy'),
              Q('002-3', 'Is there a named person responsible for information security?')],
  'ASS-003': [Q('003-1', 'Is multi-factor authentication (MFA) used for all access to client systems?', 'policy'),
              Q('003-2', 'Is access given on a least-privilege basis and reviewed at least every quarter?'),
              Q('003-3', 'Is access removed within 24 hours when staff leave or change role?')],
  'ASS-004': [Q('004-1', 'Do you have a data protection policy that covers UK GDPR?', 'policy'),
              Q('004-2', 'Will you sign a data processing agreement (UK GDPR Article 28) with the buyer?'),
              Q('004-3', 'Do you keep records of the processing you carry out for clients?')],
  'ASS-005': [Q('005-1', 'Have you identified the transfer mechanism for data leaving the UK (e.g. IDTA or UK Addendum)?', 'other', 'Upload the signed IDTA / Addendum or your transfer policy.'),
              Q('005-2', 'Can you list every country where the buyer’s data will be stored or accessed?')],
  'ASS-006': [Q('006-1', 'Do you keep an up-to-date list of the subprocessors you use?', 'register'),
              Q('006-2', 'Do your subprocessor contracts include the same data protection duties as yours?'),
              Q('006-3', 'Will you ask the buyer before adding or changing a subprocessor?')],
  'ASS-007': [Q('007-1', 'Do you have a written incident response procedure?', 'policy'),
              Q('007-2', 'Can you notify the buyer of a personal-data breach within 24 hours of becoming aware of it?')],
  'ASS-008': [Q('008-1', 'Do you have a business continuity and disaster recovery plan?', 'policy'),
              Q('008-2', 'Has the plan been tested in the last 12 months?', 'report')],
  'ASS-009': [Q('009-1', 'Are security patches applied within an agreed time (e.g. 14 days for critical)?'),
              Q('009-2', 'Has an independent penetration test been done in the last 12 months?', 'report')],
  'ASS-010': [Q('010-1', 'Do all staff sign confidentiality agreements?'),
              Q('010-2', 'Do staff receive security and data protection training every year?'),
              Q('010-3', 'Are background checks carried out where the law allows?')],
  'ASS-011': [Q('011-1', 'Do you hold cyber and professional indemnity insurance?', 'insurance')],
  'ASS-012': [Q('012-1', 'Can you meet service levels for availability and response times, and report on them monthly?')],
  'ASS-013': [Q('013-1', 'Will you allow the buyer (or its auditors) to audit you and provide supporting evidence?')],
  'ASS-014': [Q('014-1', 'Do you have a data retention and deletion policy?', 'policy'),
              Q('014-2', 'Will you return or securely delete the buyer’s data at the end of the contract and confirm it in writing?')],
  'ASS-015': [Q('015-1', 'Are you familiar with and able to support the buyer’s sector rules (e.g. FCA SYSC 8 / PRA outsourcing rules)?')]
};

/* Step 11: questionnaire for the applicable controls (snapshot stored with the compliance assessment). */
export function buildQuestionnaire(controls) {
  return controls.filter(c => CONTROL_QUESTIONS[c.id]).map(c => ({
    id: c.id, name: c.name, verifies: c.verifies, reason: c.reason, buyerRequested: !!c.buyerRequested,
    area: AREAS.find(([, , ids]) => ids.includes(c.id))?.[0] || 'governance',
    questions: CONTROL_QUESTIONS[c.id]
  }));
}

/* Validation before submission: every question answered; documents checked. Returns { missing: [questionIds], problems: [...] }. */
export function checkReadiness(questionnaire, answers) {
  const missing = [];
  for (const c of questionnaire) for (const q of c.questions) if (!ANSWERS.includes(answers[q.id]?.answer)) missing.push(q.id);
  return { missing, complete: missing.length === 0 };
}

const days = (a, b) => Math.round((a - b) / 86400000);

/* Step 14: provisional score.
   Per question: Yes 100 · Partly 50 · No 0. A "Yes" that needs evidence counts as "Partly" (50) until a valid document is
   uploaded for that control; an expired certificate or insurance does not count. Control = average of its questions;
   area = average of its controls; overall = average of all controls. Bands never say "compliant". */
export function scoreAssessment(questionnaire, answers, evidence, today = new Date()) {
  const gaps = [], observations = [];
  const validEvidence = (controlId, type) => evidence.filter(e => e.controlId === controlId && (!type || e.type === type || type === 'other')
    && !(EXPIRING.includes(e.type) && e.expiresOn && new Date(e.expiresOn) < today));
  for (const e of evidence) {
    if (!EXPIRING.includes(e.type) || !e.expiresOn) continue;
    const d = days(new Date(e.expiresOn), today);
    if (d < 0) gaps.push({ controlId: e.controlId, kind: 'expired', text: `“${e.fileName}” expired on ${e.expiresOn}.` });
    else if (d <= 90) observations.push({ controlId: e.controlId, text: `“${e.fileName}” expires in ${d} day${d === 1 ? '' : 's'} (${e.expiresOn}).` });
  }
  const controls = questionnaire.map(c => {
    const qs = c.questions.map(q => {
      const a = answers[q.id]?.answer; let pts = ANSWER_POINTS[a] ?? 0; let note = null;
      if (a === 'Yes' && q.evidence && !validEvidence(c.id, q.evidence).length) { pts = 50; note = 'evidence missing'; gaps.push({ controlId: c.id, questionId: q.id, kind: 'evidence', text: `${c.id} ${c.name}: “Yes” without a supporting ${q.evidence === 'other' ? 'document' : q.evidence}.` }); }
      if (a === 'No') gaps.push({ controlId: c.id, questionId: q.id, kind: 'answer', text: `${c.id} ${c.name}: ${q.text.replace(/\?$/, '')} — answered “No”.` });
      if (a === 'Partly') gaps.push({ controlId: c.id, questionId: q.id, kind: 'partial', text: `${c.id} ${c.name}: ${q.text.replace(/\?$/, '')} — answered “Partly”.` });
      return { id: q.id, answer: a || null, points: pts, note };
    });
    const score = Math.round(qs.reduce((s, q) => s + q.points, 0) / qs.length);
    return { id: c.id, name: c.name, area: c.area, score, questions: qs, evidence: evidence.filter(e => e.controlId === c.id).length };
  });
  const areas = AREAS.map(([id, label, ids]) => {
    const cs = controls.filter(c => ids.includes(c.id));
    return cs.length ? { id, label, score: Math.round(cs.reduce((s, c) => s + c.score, 0) / cs.length), controls: cs.map(c => c.id) } : null;
  }).filter(Boolean);
  const overall = controls.length ? Math.round(controls.reduce((s, c) => s + c.score, 0) / controls.length) : 0;
  const weakest = [...areas].sort((a, b) => a.score - b.score).filter(a => a.score < 60);
  observations.unshift(...weakest.map(a => ({ area: a.id, text: `${a.label} (${a.score}) needs further review.` })));   // weakest first
  return { overall, rating: rating(overall), areas, controls, gaps, observations, rulePackVersion: S3_RULE_PACK,
    note: 'Provisional score from the vendor’s answers and evidence. It is a risk indicator, not a compliance or legal conclusion.' };
}

export function rating(score) {
  if (score >= 80) return { code: 'STRONG', label: 'Strong' };
  if (score >= 60) return { code: 'ADEQUATE', label: 'Adequate, with gaps' };
  if (score >= 40) return { code: 'WEAK', label: 'Weak' };
  return { code: 'INSUFFICIENT', label: 'Insufficient' };
}
