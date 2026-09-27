/* Report builders (pure except for the file download): key findings, traceability rows,
   plain-text report and the downloadable HTML report. Ported unchanged from app-shell.js;
   the derived engine output D is now passed in instead of read from a module global. */
import { VENDORS, SEV_RANK, RULEBASE_VERSION } from '../data/prototype-data.js';
import { isOpen, isPass, actionState } from '../engine/engines.js';
import { esc, fmtDate, fmtTime } from './format.js';
import { reqName, userName, engineOf } from './constants.js';

export function keyFindings(a, D) {
  const v = VENDORS[a.vendorId]; const an = D.analysis; const out = [];
  const x2 = D.checks.find(c => c.id === 'XFER-002');
  if (x2 && !isPass(x2.status)) out.push('International transfer to ' + v.country + ' requires completion and verification of the relevant safeguard and transfer risk assessment.');
  if (an.subprocessors[0]) out.push('OffshoreAssure identified ' + an.subprocessors[0].name + ' as a sub-processor (clause ' + an.subprocessors[0].clause + ') and automatically opened authorisation, contractual protection, change-notification and evidence checks. Current status: ' + D.reqStatus.SUB.toLowerCase() + '.');
  const inc = an.clauses.find(c => c.cat === 'incident');
  if (inc && inc.deadline) out.push('Incident notification obligation identified in clause ' + inc.id + ' (' + inc.deadline + '). Incident management: ' + D.reqStatus.INC.toLowerCase() + '.');
  if (D.subMode === 'unnamed' && D.reqStatus.SUB && D.reqStatus.SUB !== 'Satisfied') out.push('Subcontractor authorisation requires verification.');
  if (D.juris.status === 'adequate') out.push('The UK → ' + v.country + ' destination is covered by UK adequacy regulations, so no alternative transfer mechanism was required. Processor and sub-processor governance checks continued separately.');
  if (D.delivery) out.push('Delivery assurance (sample feed): rolling score ' + D.delivery.score + '/100 at ' + D.delivery.week + (D.delivery.alerts.length ? '. Alert: ' + D.delivery.alerts.map(x => x.metric.label).join(', ') + '.' : ', no alerts.'));
  return out;
}
export function traceRows(a, D) {
  const rows = D.reqs.map(r => {
    const cs = D.checks.filter(c => c.req === r.id); const cl = [...new Set(cs.flatMap(c => c.clauses.map(x => x.id)))];
    const obl = [...new Set(cs.map(c => c.clauses[0] && c.clauses[0].obligation ? c.clauses[0].obligation.event : null).filter(Boolean))];
    const f = D.findings.filter(x => x.req === r.id); const acts = a.actions.filter(x => x.req === r.id); const ev = (D.evidenceRules || D.evidence).filter(e => e.req === r.id);
    return [r.name, cl.join(', ') || '—', obl.join(', ') || '—', cs.map(c => c.id).join(', '), f.length ? f.map(x => x.level).sort((p, q) => SEV_RANK[q] - SEV_RANK[p])[0] : 'Low', acts.map(x => x.id).join(', ') || '—', (ev.length ? ev.filter(e => e.status === 'Verified').length + '/' + ev.length + ' verified' : '—'), [...new Set(cs.map(engineOf))].join(', ')];
  });
  if (D.delivery) { const acts = a.actions.filter(x => x.ruleId.startsWith('DEL')); const ev = (D.evidenceRules || D.evidence).filter(e => e.req === 'DEL'); rows.push(['Delivery Assurance (sample feed)', D.delivery.targets.map(t => t.clause).join(', '), 'Service levels', 'DEL-001, DEL-002', D.delivery.alerts.length ? D.delivery.alerts.map(x => x.level).sort((p, q) => SEV_RANK[q] - SEV_RANK[p])[0] : 'Low', acts.map(x => x.id).join(', ') || '—', (ev.length ? ev.filter(e => e.status === 'Verified').length + '/' + ev.length + ' verified' : '—'), 'D']); }
  return rows;
}
export function reportText(a, D) {
  const v = VENDORS[a.vendorId]; const an = D.analysis;
  const L = ['OFFSHOREASSURE: Outsourcing Assurance Assessment (prototype output)', 'Assessment: ' + a.id, 'Organisation: ' + a.org, 'Supplier: ' + v.name + (an.subprocessors[0] ? ' (sub-processor: ' + an.subprocessors[0].name + ')' : ''), 'Service: ' + a.category, 'Status: ' + D.overall, 'Assurance score: ' + D.assurance + '/100', '', 'Requirements assessed: ' + D.reqs.length, 'Contractual obligations identified: ' + an.obligations.length, 'Material issues identified: ' + ((a.baseline || {}).material != null ? a.baseline.material : D.findings.filter(f => isOpen(f.status)).length), 'Evidence items: ' + D.evidence.length, 'Evidence gaps identified: ' + ((a.baseline || {}).gaps != null ? a.baseline.gaps : D.evidenceGaps), '',
    'Engine A Compliance: ' + D.vendorScore.overall + '/100, access ' + D.vendorScore.flag, 'Engine B Contract: ' + an.clauses.length + ' clauses, ' + an.obligations.length + ' obligations', 'Engine C Data Transfer: ' + (D.juris.status === 'adequate' ? 'adequacy path' : (D.checks.find(c => c.id === 'XFER-002') || {}).status), 'Engine D Delivery (sample feed): ' + (D.delivery ? D.delivery.score + '/100' : 'not run'), '', 'Key findings:'];
  keyFindings(a, D).forEach((k, i) => L.push((i + 1) + '. ' + k));
  L.push('', 'Traceability (requirement | clauses | obligations | rules | risk | actions | evidence | engines):'); traceRows(a, D).forEach(r => L.push('- ' + r.join(' | ')));
  L.push('', 'Risk indicators support the organisation\'s decision. They are not legal advice or a determination of compliance.');
  return L.join('\n');
}
/* Export Report: builds a self-contained HTML report from the stored assessment state and downloads it. */
export function exportReportFile(a, D) {
  const v = VENDORS[a.vendorId]; const an = D.analysis; const B = a.baseline || {};
  const openNow = D.findings.filter(f => isOpen(f.status)).length;
  const matIssues = B.material != null ? B.material : openNow; const gapsId = B.gaps != null ? B.gaps : D.evidenceGaps;
  const matActs = a.actions.filter(x => !x.ruleId.startsWith('DEL')).length;
  const xfers = D.reqs.some(r => r.id === 'XFER') && D.juris && D.juris.status !== 'domestic' ? 1 : 0;
  const x2 = D.checks.find(c => c.id === 'XFER-002');
  const cell = t => '<td>' + esc(t) + '</td>';
  const row = arr => '<tr>' + arr.map(cell).join('') + '</tr>';
  const table = (head, rows) => '<table><thead><tr>' + head.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row).join('') + '</tbody></table>';
  const today = new Date();
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OffshoreAssure report ' + esc(a.id) + '</title><style>' +
    'body{font:14px/1.55 "Segoe UI",system-ui,sans-serif;color:#392A47;background:#F5F2EB;margin:0;padding:32px 16px}main{max-width:960px;margin:0 auto;background:#FAF6F0;border:1px solid #E5DED5;border-radius:12px;padding:32px}' +
    'h1,h2{font-family:Georgia,"Times New Roman",serif;color:#271A38}h1{font-size:28px;margin:4px 0 0}h2{font-size:19px;margin:28px 0 10px}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#776C82}' +
    'table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #E5DED5;vertical-align:top}th{color:#62566E;font-size:12px}' +
    '.status{padding:14px 16px;border-radius:10px;background:#F8E4E0;color:#AF4343;font:600 18px Georgia,serif;margin:18px 0}.status.review{background:#EEE9F3;color:#5D4A77}.status.ok{background:#EBEFE6;color:#5B6D55}' +
    '.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.stats div{border:1px solid #E5DED5;border-radius:8px;padding:10px}.stats b{display:block;font:600 22px Georgia,serif;color:#271A38}' +
    '.note{color:#776C82;font-size:12.5px}@media(max-width:700px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:18px}}</style></head><body><main>' +
    '<div class="eyebrow">OffshoreAssure · Outsourcing assurance assessment · Prototype output</div><h1>' + esc(a.name) + '</h1>' +
    '<p class="note">' + esc(a.id) + ' · exported ' + esc(fmtDate(today.toISOString())) + ' ' + esc(today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) + ' · rule base ' + esc(RULEBASE_VERSION) + (a.reportGenerated ? ' · report issued' : ' · draft (not yet issued)') + '</p>' +
    table(['Organisation', 'Supplier', 'Sub-processor', 'Service', 'Assessment owner'], [[a.org, v.name + ' · ' + v.location + ', ' + v.country, an.subprocessors[0] ? an.subprocessors[0].name : '—', a.category, userName(a.owner)]]) +
    '<div class="status ' + (D.overall.startsWith('ACTION') ? '' : D.overall.startsWith('REVIEW') ? 'review' : 'ok') + '">Assessment status: ' + esc(D.overall) + ' · Assurance score ' + esc(D.assurance) + '/100</div>' +
    '<h2>Summary</h2><div class="stats">' + [[D.reqs.length, 'requirements assessed'], [an.clauses.length, 'contract clauses analysed'], [an.relevant.length, 'relevant clauses'], [an.obligations.length, 'contractual obligations'], [an.subprocessors.length, 'sub-processors identified'], [xfers, xfers === 1 ? 'international transfer identified' : 'international transfers identified'], [matIssues, 'material issues identified (' + openNow + ' open now)'], [matActs, 'actions from material issues'], [D.evidence.length, 'evidence items'], [gapsId, 'evidence gaps identified (' + D.evidenceGaps + ' outstanding)']].map(x => '<div><b>' + esc(x[0]) + '</b><span class="note">' + esc(x[1]) + '</span></div>').join('') + '</div>' +
    '<h2>Four operational engines</h2>' + table(['Engine', 'Result'], [
      ['A · Compliance', D.vendorScore.overall + '/100 · access ' + D.vendorScore.flag],
      ['B · Contract', an.clauses.length + ' clauses · ' + an.relevant.length + ' relevant · ' + an.obligations.length + ' obligations · ' + an.subprocessors.length + ' sub-processor(s)'],
      ['C · Data Transfer', 'UK → ' + v.country + ' · ' + (D.juris.status === 'adequate' ? 'adequacy pathway identified' : x2 ? x2.status : '—')],
      ['D · Delivery Assurance (sample feed)', D.delivery && D.delivery.score != null ? D.delivery.score + '/100 · ' + D.delivery.label + ' at ' + D.delivery.week + ' · ' + D.delivery.alerts.length + ' alert(s)' : 'Not run']]) +
    '<h2>Key findings</h2><ol>' + keyFindings(a, D).map(k => '<li>' + esc(k) + '</li>').join('') + '</ol>' +
    '<h2>Compliance risks</h2>' + table(['Severity', 'Risk', 'Rule', 'Source', 'Status'], D.findings.map(f => [f.level, reqName(f.req) + ': ' + f.name, f.id, f.source, f.status])) +
    (D.delivery && D.delivery.alerts.length ? '<h2>Delivery Assurance sample-feed alerts</h2><p class="note">Separate from the compliance workflow; sample data.</p>' + table(['Severity', 'Alert', 'Rule', 'Status'], D.delivery.alerts.map(x => [x.level, x.detail, x.rule, x.actionId ? 'Raised as ' + x.actionId : 'Not raised'])) : '') +
    '<h2>Actions</h2>' + (a.actions.length ? table(['Action', 'Title', 'Owner', 'Priority', 'Due', 'Source', 'Status'], a.actions.map(x => [x.id, x.title, userName(x.owner), x.priority, fmtDate(x.due), x.source, actionState(a, D, x)])) : '<p class="note">No actions generated.</p>') +
    '<h2>Evidence</h2>' + table(['Related to', 'Rule', 'Evidence', 'Status'], D.evidence.map(e => [reqName(e.req), e.check.id, e.label, e.status])) +
    '<h2>Traceability</h2><p class="note">Requirement → contract clause → extracted obligation → rule → risk → action → evidence</p>' + table(['Requirement', 'Clause', 'Obligation', 'Rules', 'Risk', 'Action', 'Evidence', 'Engine'], traceRows(a, D).map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]])) +
    (a.baseline ? '<h2>Reassessment</h2>' + table(['', 'Status', 'Assurance score', 'Engine A', 'Compliance issues'], [['Before evidence', B.overall, B.score, B.vendor, B.material != null ? B.material : B.open], ['Now', D.overall, D.assurance, D.vendorScore.overall, openNow]]) : '') +
    '<h2>Audit trail</h2>' + table(['Time', 'Event', 'Detail', 'By', 'Rule'], a.audit.slice().reverse().map(e => [fmtTime(e.at), e.event, e.detail, e.by, e.ref])) +
    '<p class="note" style="margin-top:24px">OffshoreAssure outputs are risk indicators that support the organisation\'s decision. They are not legal advice and do not determine compliance. Phase 1 prototype — sample data and simulated interactions; the delivery feed is sample data.</p>' +
    '</main></body></html>';
  const name = 'OffshoreAssure_' + a.id + '_' + today.toISOString().slice(0, 10) + '.html';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
