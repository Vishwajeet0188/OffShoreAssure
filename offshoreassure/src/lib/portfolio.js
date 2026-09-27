/* Portfolio, activity feed and stage-output helpers (pure; ported from app-shell.js). */
import { VENDORS, SEED_ASSESSMENTS } from '../data/prototype-data.js';
import { isOpen, compute } from '../engine/engines.js';
import { SEED_STATUS, statusWord } from './constants.js';

/* Live assessments plus the clearly labelled sample records. */
export function portfolio(list) {
  const live = list.filter(a => a.createdDone).map(a => { const d = compute(a); const v = VENDORS[a.vendorId];
    const open = d.findings.filter(f => isOpen(f.status));
    return { id: a.id, live: true, supplier: v.name, service: a.category, country: v.country, risk: !d.analysis ? '—' : open.some(f => f.level === 'High') ? 'High' : d.openCount ? 'Medium' : 'Low', status: d.analysis ? statusWord(d.overall) : 'In progress', score: d.assurance != null ? d.assurance : null, a }; });
  const seeds = SEED_ASSESSMENTS.map((x, i) => ({ id: x.id, sample: true, supplier: x.vendor, service: x.service, country: x.country, risk: x.risk, status: SEED_STATUS[x.status] || x.status, score: ({ High: 61, Medium: 74, Low: 88 })[x.risk] + (i % 3) * 2, issue: x.issue }));
  return live.concat(seeds);
}

export function allAudit(list) { return list.flatMap(a => a.audit.map(e => ({ ...e, aid: a.id }))).sort((x, y) => new Date(y.at) - new Date(x.at)); }
export function evIcon(e) { return /verified|complete/i.test(e.event) ? ['sage', 'check'] : /risk|required|alert/i.test(e.event) ? ['coral', 'alert'] : /action|assigned/i.test(e.event) ? ['copper', 'flow'] : ['plum', 'doc']; }

/* The short output label under each step of the assurance path. */
export function outputOf(a, D, id) {
  const d = D; const an = d.analysis;
  return { setup: a.createdDone ? VENDORS[a.vendorId].country : '', reqs: a.reqsGenerated ? d.reqs.length + ' reqs' : '', compliance: d.vendorScore ? d.vendorScore.overall + '/100' : '', contract: an ? an.clauses.length + ' clauses' : '', obligations: an ? an.obligations.length + ' found' : '', mapping: an ? d.checks.length + ' checks' : '', transfer: a.transferDone ? (d.juris.status === 'adequate' ? 'Adequacy' : 'Gate') : '', delivery: d.delivery && d.delivery.score != null ? d.delivery.score + '/100' : '', risk: a.deliveryRun ? d.findings.filter(f => isOpen(f.status)).length + ' actionable' : '', actions: a.actionsGenerated ? a.actions.length + ' actions' : '', evidence: a.actionsGenerated ? d.evidenceGaps + ' gaps' : '', final: a.reportGenerated ? 'Issued' : '' }[id] || '';
}
