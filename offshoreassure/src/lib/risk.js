/* Risk consolidation helpers (pure; ported from app-shell.js). */
import { VENDORS, SEV_RANK } from '../data/prototype-data.js';
import { isOpen } from '../engine/engines.js';
import { reqName, engineOf, issuesWord } from './constants.js';

export function riskRows(a, D) {
  const rows = D.findings.map(f => ({ level: f.level, title: reqName(f.req) + ': ' + f.name, detail: f.note, source: f.source, rule: f.id, status: f.status, eng: engineOf(f) }));
  D.reqs.filter(r => D.reqStatus[r.id] === 'Satisfied').forEach(r => rows.push({ level: 'Low', ok: true, title: r.id === 'XFER' ? 'International transfer destination' : r.name, detail: r.id === 'XFER' ? VENDORS[a.vendorId].country + ' is covered by UK adequacy regulations. No generic transfer escalation on destination status alone.' : (D.checks.filter(c => c.req === r.id && c.clauses[0]).map(c => 'Clause ' + c.clauses[0].id).join(', ') || 'Evidence verified') + ': provisions identified.', source: r.id === 'XFER' ? 'Jurisdiction' : 'Contract', eng: r.id === 'XFER' ? 'C' : 'B' }));
  return rows.sort((x, y) => SEV_RANK[y.level] - SEV_RANK[x.level] || (x.ok ? 1 : 0) - (y.ok ? 1 : 0));
}
/* Actionable compliance issues vs Delivery Assurance sample-feed alerts (kept separate). */
export function riskCounts(D) {
  const compliance = D.findings.filter(f => isOpen(f.status)).length;
  const alerts = D.delivery ? D.delivery.alerts.filter(x => x.status === 'Attention') : [];
  const sampleAlerts = alerts.filter(x => x.level !== 'Low').length;
  return { compliance, sampleAlerts, lowAlerts: alerts.length - sampleAlerts };
}
export function riskSummary(D) {
  const k = riskCounts(D);
  return k.compliance + ' actionable compliance ' + issuesWord(k.compliance) +
    (k.sampleAlerts ? ' · ' + k.sampleAlerts + ' Delivery Assurance sample-feed ' + (k.sampleAlerts === 1 ? 'alert' : 'alerts') : ' · no Delivery Assurance sample-feed alerts requiring attention');
}
