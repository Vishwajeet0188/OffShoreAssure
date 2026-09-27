/* Shared UI constants and small pure helpers, ported unchanged from app-shell.js. */
import { REQUIREMENTS } from '../data/prototype-data.js';
import { userById } from '../engine/engines.js';

export const STORE = 'offshoreassure-proto-v2';

export const TONE = {
  sage: ['Satisfied', 'Identified', 'Verified', 'Adequacy identified', 'Complete', 'Completed', 'Approved', 'Domestic', 'Ready to close', 'No open gaps', 'NO OPEN GAPS IDENTIFIED', 'Accepted', 'On track', 'Low', 'Adequate', 'Triggered'],
  amber: ['Review required', 'Partially satisfied', 'Evidence pending', 'Pending', 'Requested', 'Awaiting verification', 'Conditional', 'In review', 'Evidence requested', 'Open', 'Attention', 'Medium', 'Review', 'Held for review', 'Partial', 'In progress'],
  coral: ['Gap', 'Evidence missing', 'Missing', 'Restricted', 'High', 'High risk', 'Action required', 'ACTION REQUIRED', 'Restricted transfer'],
  plum: ['Submitted', 'Subject to review', 'Satisfactory subject to review', 'Evidence received', 'REVIEW — EVIDENCE AWAITING VERIFICATION', 'Sample']
};
export const tone = s => Object.keys(TONE).find(k => TONE[k].includes(s)) || 'mute';

export const reqName = id => id === 'DEL' ? 'Delivery Assurance' : (REQUIREMENTS.find(r => r.id === id) || {}).name || id;
export const userName = id => id === 'vendor' ? 'Supplier contact' : userById(id).name;
export const initials = n => n.replace(/ (Sp\. z o\.o\.|Ltd|Inc\.|Limited)$/, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const CC = { 'United Kingdom': 'UK', Poland: 'PL', India: 'IN', Philippines: 'PH', 'South Africa': 'ZA', Ireland: 'IE', Netherlands: 'NL', Vietnam: 'VN', Ukraine: 'UA', Malaysia: 'MY', 'United States': 'US' };
export const statusWord = o => o.startsWith('ACTION') ? 'Action required' : o.startsWith('REVIEW') ? 'Satisfactory subject to review' : o.startsWith('NO') ? 'No open gaps' : 'In progress';
export const ENGINE = { A: 'Compliance engine', B: 'Contract engine', C: 'Data Transfer engine', D: 'Delivery Assurance engine' };
export const engineOf = c => c.req === 'DEL' ? 'D' : c.id.startsWith('XFER') ? 'C' : c.id.startsWith('SP-') || c.rule.type === 'contract' || c.rule.type === 'extraction' ? 'B' : 'A';
export const issuesWord = n => n === 1 ? 'issue' : 'issues';

/* The assurance path: 12 stages, each gated on the stored output of the stage before it. */
export const STAGES = [
  { id: 'setup', label: 'Supplier discovery', icon: 'users', ok: a => !!a },
  { id: 'reqs', label: 'Requirement analysis', icon: 'clipboard', ok: a => a && a.createdDone },
  { id: 'compliance', label: 'Compliance engine', icon: 'shield', ok: a => a && a.reqsGenerated },
  { id: 'contract', label: 'Contract extraction', icon: 'scan', ok: a => a && a.vendorRun },
  { id: 'obligations', label: 'Obligation identification', icon: 'list', ok: a => a && a.contractAnalysed },
  { id: 'mapping', label: 'Rule mapping', icon: 'scale', ok: a => a && a.contractAnalysed },
  { id: 'transfer', label: 'Jurisdiction / data transfer', icon: 'globe', ok: a => a && a.contractAnalysed },
  { id: 'delivery', label: 'Delivery assurance', icon: 'pulse', ok: a => a && a.transferDone },
  { id: 'risk', label: 'Risk assessment', icon: 'alert', ok: a => a && a.deliveryRun },
  { id: 'actions', label: 'Workflow actions', icon: 'check', ok: a => a && a.actionsGenerated },
  { id: 'evidence', label: 'Evidence & audit', icon: 'folder', ok: a => a && a.actionsGenerated },
  { id: 'final', label: 'Final assessment', icon: 'flag', ok: a => a && a.actionsGenerated }
];
export function stageDone(a, id) {
  if (!a) return false;
  return !!{ setup: a.createdDone, reqs: a.reqsGenerated, compliance: a.vendorRun, contract: a.contractAnalysed, obligations: a.obligationsSeen, mapping: a.mappingSeen, transfer: a.transferDone, delivery: a.deliveryRun, risk: a.actionsGenerated, actions: a.actionsGenerated && a.actions.length && a.actions.every(x => x.status === 'Complete'), evidence: a.evidenceTouched, final: a.reportGenerated }[id];
}
/* Sidebar modules: [view, label, icon, views that highlight it]. */
export const MODS = [
  ['dash', 'Dashboard', 'home', ['dash']], ['suppliers', 'Suppliers', 'users', ['suppliers']], ['assessments', 'Assessments', 'clipboard', ['assessments', 'setup', 'reqs', 'compliance', 'risk']],
  ['contract', 'Contracts', 'file', ['contract']], ['obligations', 'Obligations', 'list', ['obligations', 'mapping']], ['transfer', 'Data Transfers', 'globe', ['transfer']],
  ['delivery', 'Delivery Assurance', 'pulse', ['delivery']], ['actions', 'Workflow', 'flow', ['actions']], ['evidence', 'Evidence', 'folder', ['evidence']], ['final', 'Reports', 'report', ['final']], ['rules', 'Settings', 'gear', ['rules']]
];
export const PATHCOL = ['#271A38', '#5B2C45', '#5B2C45', '#B95F50', '#C0503F', '#C0503F', '#71806A', '#71806A', '#C0503F', '#2F4A3B', '#5B3F77', '#271A38'];
export const CAT_COL = ['#271A38', '#B95F50', '#71806A', '#C48342', '#8A76A6', '#4A4050'];
export const PROC_STEPS = ['Document uploaded', 'Text extracted', 'Clauses identified', 'Relevant clauses classified', 'Contractual obligations extracted', 'Third parties identified', 'Service-level targets extracted', 'Compliance mapping'];
export const SEED_STATUS = { Completed: 'No open gaps', 'In Review': 'Review required', 'Action Required': 'Action required', 'Vendor Response': 'Attention' };
export const GROUP = s => /IT|Hosting|Software|Analytics/.test(s) ? 'IT & Technology' : /Customer|Claims|Contact/.test(s) ? 'Customer Operations' : /Payroll/.test(s) ? 'HR & Payroll' : 'Data & Back Office';

/* ---------- routing: view ids <-> React Router paths ---------- */
export const VIEW_PATHS = { home: '/', login: '/login', signup: '/signup', dash: '/dashboard', suppliers: '/suppliers', assessments: '/assessments', rules: '/settings/rules' };
export const STAGE_SEGMENTS = { setup: '', reqs: 'requirements', compliance: 'compliance', contract: 'contract', obligations: 'obligations', mapping: 'rule-mapping', transfer: 'data-transfer', delivery: 'delivery', risk: 'risk', actions: 'actions', evidence: 'evidence', final: 'final-assessment', reports: 'reports', audit: 'audit-trail' };
const SEGMENT_VIEW = { '': 'setup', requirements: 'reqs', compliance: 'compliance', contract: 'contract', obligations: 'obligations', 'rule-mapping': 'mapping', 'data-transfer': 'transfer', delivery: 'delivery', risk: 'risk', actions: 'actions', evidence: 'evidence', 'final-assessment': 'final', reports: 'final', 'audit-trail': 'evidence' };
export const NO_ASSESSMENT = 'none';

export function pathFor(view, curId) {
  if (VIEW_PATHS[view]) return VIEW_PATHS[view];
  if (view in STAGE_SEGMENTS) { const seg = STAGE_SEGMENTS[view]; return '/assessment/' + encodeURIComponent(curId || NO_ASSESSMENT) + (seg ? '/' + seg : ''); }
  return VIEW_PATHS.dash;
}
/* Returns { view, assessmentId, segment } for a pathname. */
export function viewFromPath(pathname) {
  const m = pathname.match(/^\/assessment\/([^/]+)\/?([^/]*)\/?$/);
  if (m) return { view: SEGMENT_VIEW[m[2]] || 'setup', assessmentId: decodeURIComponent(m[1]), segment: m[2] };
  const hit = Object.entries(VIEW_PATHS).find(([, p]) => p === pathname.replace(/\/$/, '') || (p === '/' && pathname === '/'));
  return { view: hit ? hit[0] : 'home', assessmentId: null, segment: null };
}
