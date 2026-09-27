import { EVIDENCE_REGISTER_BY_CATEGORY, USERS, JURISDICTIONS, COUNTRY_NAMES, REQUIREMENTS, TAXONOMY, EVIDENCE_TYPES, RULES, SEV_RANK, DUE_DAYS, RUBRIC_BY_CATEGORY, AREA_LABELS, RUBRIC, VENDORS, DELIVERY_WEEKS, DELIVERY_FEED, DELIVERY_WINDOW_WEIGHTS } from '../data/prototype-data.js';

/* ============ OffshoreAssure engines — pure functions. Every stage reads the previous stage's stored output. ============ */

const OPEN = ['Gap', 'Review required', 'Evidence missing', 'Evidence pending', 'Awaiting verification'];
const SOFT = ['Subject to review'];
const PASS = ['Satisfied', 'Identified', 'Adequacy identified', 'Domestic'];
const isOpen = s => OPEN.includes(s), isSoft = s => SOFT.includes(s), isPass = s => PASS.includes(s);

function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString(); }
function userById(id) { return USERS.find(u => u.id === id) || USERS[0]; }

/* ---------- Engine B: contract extraction (schema-bound parser; LLM adapter slot) ---------- */
function parseContract(text) {
  const lines = text.split(/\r?\n/);
  const partyM = text.match(/between\s+(.+?)\s+\("Customer"\)\s+and\s+(.+?)\s+\("Supplier"\)/i);
  const parties = { Customer: partyM ? partyM[1].trim() : 'Customer', Supplier: partyM ? partyM[2].trim() : 'Supplier' };
  const title = lines.find(l => l.trim()) || 'Contract';
  const clauses = [];
  let section = '';
  for (const raw of lines) {
    const l = raw.trim();
    const sec = l.match(/^(\d+)\.\s+([A-Z][A-Z &\-—]+)$/);
    if (sec) { section = sec[2]; continue; }
    const m = l.match(/^(\d+\.\d+)\s+([^.]+)\.\s+(.+)$/);
    if (!m) continue;
    clauses.push(classifyClause({ id: m[1], section, heading: m[2].trim(), text: m[3].trim() }, parties));
  }
  const entities = [];
  clauses.forEach(c => c.entities.forEach(e => { if (!entities.find(x => x.name === e.name)) entities.push(e); }));
  const relevant = clauses.filter(c => c.relevant);
  const obligations = relevant.filter(c => c.obligation);
  return { title: title.trim(), parties, clauses, relevant, obligations, entities, subprocessors: entities.filter(e => e.role === 'Sub-processor') };
}

function classifyClause(c, parties) {
  const full = c.heading + '. ' + c.text;
  let tax = TAXONOMY.find(t => (t.head && t.head.test(c.heading)) || (t.pat && !t.head && t.pat.test(full)));
  const signals = [];
  if (tax.pat && tax.pat.test(c.heading)) signals.push('heading');
  // modal + party
  const mm = c.text.match(/\b(The Supplier|The Customer|Either party|Neither party|Each party)\s+(shall not|shall|must|will|may)\b/i);
  let obligation = null, deadline = null, deadlineHours = null;
  const dm = c.text.match(/within\s+(\d+)\s+(hours?|business days|days)/i);
  if (dm) { const n = +dm[1]; deadlineHours = /hour/i.test(dm[2]) ? n : n * 24; deadline = n + ' ' + dm[2].toLowerCase(); }
  else if (/prior written (approval|authorisation)/i.test(c.text)) deadline = 'Before appointment';
  else if (/annually|every quarter|monthly/i.test(c.text)) deadline = (c.text.match(/annually|every quarter|monthly/i)[0]);
  if (mm) signals.push('party');
  if (mm && /shall|must|will/i.test(mm[2])) signals.push('modal');
  if (deadline) signals.push('deadline');
  if (mm && tax.relevant && /shall|must|will/i.test(mm[2])) {
    const who = /supplier/i.test(mm[1]) ? 'Supplier' : /customer/i.test(mm[1]) ? 'Customer' : 'Both parties';
    const verb = mm[2].toLowerCase() === 'shall not' ? 'must not' : 'must';
    const rest = c.text.slice(c.text.indexOf(mm[0]) + mm[0].length).trim().replace(/\.$/, '');
    const event = { incident: 'Security incident', deletion: 'Termination', 'subprocessor-auth': 'Appointment of subcontractor', 'subprocessor-change': 'Sub-processor change', 'data-location': 'Service delivery', audit: 'Customer audit request', 'subject-rights': 'Data-subject request' }[tax.cat] || 'Ongoing performance';
    obligation = { party: who, partyName: parties[who] || who, text: who + ' ' + verb + ' ' + rest + '.', deadline: deadline || 'Ongoing', event };
  }
  // entity extraction (third parties)
  const entities = [];
  const re = /([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,3}\s(?:Sp\. z o\.o\.|Ltd|Limited|Pvt\. Ltd\.|LLC|Inc\.|GmbH))/g;
  let em;
  while ((em = re.exec(c.text))) {
    const name = em[1].trim();
    if (name === parties.Customer || name === parties.Supplier) continue;
    const country = COUNTRY_NAMES.find(k => new RegExp('\\b' + k + '\\b').test(c.text)) || null;
    const loc = c.text.match(/established in ([A-Z][a-z]+),/);
    const act = c.text.match(/to provide ([^.]+?)(?:\.|$)/);
    entities.push({ name, role: /sub-?processor|subcontract/i.test(c.section + ' ' + c.heading) ? 'Sub-processor' : 'Third party', country, city: loc ? loc[1] : null, activity: act ? act[1] : null, clause: c.id });
  }
  // Secondary categories: other compliance categories whose wording also appears in the clause.
  // Used only as a fallback when no clause has that category as its primary classification.
  const alsoCats = tax.relevant ? TAXONOMY.filter(t => t.relevant && t.cat !== tax.cat && t.pat && t.pat.test(full)).map(t => t.cat) : [];
  const countries = COUNTRY_NAMES.filter(k => k !== 'United Kingdom' && new RegExp('\\b' + k + '\\b').test(c.text));
  const conf = tax.relevant ? Math.min(0.97, 0.62 + 0.08 * signals.length) : null;
  return { ...c, cat: tax.cat, alsoCats, label: tax.label, relevant: tax.relevant, obligation, deadline, deadlineHours, entities, countries, confidence: conf, signals };
}

/* ---------- Evidence status ---------- */
const DECLARED = { 'security-cert': q => q.iso || q.soc, 'incident-ops': q => q.incidentProc, 'sub-authorisation': q => q.usesSubs, 'sub-contract': q => q.subContract, 'sub-equivalent': q => q.subContract, 'sub-security': () => false, 'change-notice': () => false, 'transfer-assessment': q => q.xferMechanism };
function evidenceStatus(a, ev) {
  const docs = a.docs.filter(d => d.covers.includes(ev));
  if (docs.some(d => d.status === 'Verified')) return { status: 'Verified', docs };
  if (docs.length) return { status: 'Submitted', docs };
  if (a.requested[ev]) return { status: 'Requested', docs };
  const q = a.q || VENDORS[a.vendorId].q;
  return { status: DECLARED[ev] && DECLARED[ev](q) ? 'Pending' : 'Missing', docs };
}

/* ---------- Full recompute ---------- */
function compute(a) {
  const vendor = VENDORS[a.vendorId];
  const ctx = { ...a.scope, sector: a.sector, category: a.category, orgShort: (a.org || '').split(' ')[0] || 'the organisation', country: vendor ? vendor.country : '' };
  const out = { ctx, vendor };
  out.reqs = a.reqsGenerated ? REQUIREMENTS.filter(r => r.when(ctx)).map(r => ({ id: r.id, name: r.name, weight: r.weight, reason: r.reason(ctx), trigger: r.when.toString().replace(/^s\s*=>\s*/, '').replace(/^\(\)\s*=>\s*/, '') })) : [];
  const reqIds = out.reqs.map(r => r.id);
  const juris = vendor ? (JURISDICTIONS[vendor.country] || { status: 'none', basis: 'Not in rule table: treated as restricted' }) : null;
  out.juris = juris;

  // Engine A: vendor scoring
  if (a.vendorRun) {
    const q = a.q || vendor.q;
    const areas = out.reqs.map(r => {
      let items;
      if (r.id === 'XFER') {
        if (juris.status === 'adequate' || juris.status === 'domestic') items = [['Adequacy pathway (' + vendor.country + ')', 60, true, true], ['Data location disclosed', 20, q.dataLocation], ['Onward-transfer controls', 10, q.onward], ['Encryption in transit and at rest', 10, q.encryption]];
        else { const te = evidenceStatus(a, 'transfer-assessment'); const ev = ['Submitted', 'Verified'].includes(te.status);
          items = [['Transfer mechanism documented', 35, q.xferMechanism || ev, ev], ['Transfer risk assessment', 20, ev, ev], ['Data location disclosed', 20, q.dataLocation], ['Encryption in transit and at rest', 15, q.encryption], ['Onward-transfer controls', 10, q.onward]]; }
        items = items.map(([label, pts, ok, evd]) => ({ label, pts, earned: ok ? pts : 0, basis: ok ? (evd ? 'evidenced' : 'declared') : 'not met' }));
      } else {
        items = (((RUBRIC_BY_CATEGORY[a.category] || {})[r.id]) || RUBRIC[r.id] || []).map(([key, pts, label, evKey]) => {
          const declared = !!q[key];
          let evidenced = false;
          if (evKey) evidenced = EVIDENCE_TYPES[evKey] ? ['Submitted', 'Verified'].includes(evidenceStatus(a, evKey).status) : a.docs.some(d => d.policy === evKey);
          const earned = evidenced ? pts : declared ? (evKey ? Math.round(pts * 0.6) : pts) : 0;
          return { label, pts, earned, basis: evidenced ? 'evidenced' : declared ? (evKey ? 'declared only (60%)' : 'declared') : 'not met' };
        });
      }
      const score = Math.round(items.reduce((s, i) => s + i.earned, 0) / Math.max(1, items.reduce((s, i) => s + i.pts, 0)) * 100);
      return { id: r.id, name: ((AREA_LABELS[a.category] || {})[r.id]) || r.name, weight: r.weight, score, items };
    });
    const tw = areas.reduce((s, x) => s + x.weight, 0);
    const overall = Math.round(areas.reduce((s, x) => s + x.score * x.weight, 0) / tw);
    const weak = areas.filter(x => x.score < 60);
    const flag = overall >= 80 && !weak.length ? 'Approved' : overall >= 60 ? 'Conditional' : 'Restricted';
    out.vendorScore = { areas, overall, weak, flag };
  }

  // Engine B: contract
  out.analysis = a.contractAnalysed && a.contractText ? parseContract(a.contractText) : null;
  const an = out.analysis;
  const subMode = an && an.subprocessors.length ? 'named' : 'unnamed';
  out.subMode = subMode;
  const S = an && an.subprocessors[0] ? an.subprocessors[0].name : 'sub-processor';
  const P = vendor ? vendor.name.split(' ')[0] : 'Supplier';

  // Rule checks
  const checks = [];
  if (an) for (const rule of RULES) {
    if (!reqIds.includes(rule.req)) continue;
    if (rule.mode && rule.mode !== subMode) continue;
    const c = { rule, id: rule.id, req: rule.req, name: rule.name, sev: rule.sev, clauses: [], note: '', input: '', status: '' };
    if (rule.type === 'contract') {
      c.clauses = an.clauses.filter(x => rule.cat.includes(x.cat));
      if (!c.clauses.length) c.clauses = an.clauses.filter(x => x.relevant && (x.alsoCats || []).some(k => rule.cat.includes(k)));
      const cl = c.clauses[0];
      c.input = cl ? 'Clause ' + cl.id + ' (' + cl.label + ')' + (cl.deadline ? ', deadline ' + cl.deadline : '') : 'No clause in category ' + rule.cat.join('/');
      if (!cl) { c.status = 'Gap'; c.note = 'No matching provision found in the contract.'; }
      else if (rule.test && !rule.test(cl)) {
        const e = rule.ev ? evidenceStatus(a, rule.ev) : null;
        if (e && e.status === 'Verified') { c.status = 'Satisfied'; c.note = 'Resolved by verified evidence: ' + e.docs.map(d => d.name).join(', '); }
        else if (e && e.status === 'Submitted') { c.status = 'Subject to review'; c.note = 'Evidence submitted: ' + e.docs.map(d => d.name).join(', '); }
        else { c.status = 'Review required'; c.note = rule.failNote; }
        c.evStatus = e;
      } else { c.status = 'Satisfied'; c.note = 'Provision identified in clause ' + c.clauses.map(x => x.id).join(', ') + '.'; }
    } else if (rule.type === 'evidence') {
      const e = evidenceStatus(a, rule.ev); c.evStatus = e;
      c.input = EVIDENCE_TYPES[rule.ev].label + ': ' + e.status + (e.docs.length ? ' (' + e.docs.map(d => d.name).join(', ') + ')' : '');
      if (e.status === 'Verified') { c.status = 'Satisfied'; c.note = 'Verified evidence on file.'; }
      else if (e.status === 'Submitted') {
        if (rule.needVerified && rule.needVerified(ctx)) { c.status = 'Awaiting verification'; c.note = rule.verifiedNote; }
        else { c.status = 'Subject to review'; c.note = 'Evidence submitted; reviewer verification outstanding.'; }
      } else { c.status = e.status === 'Missing' ? 'Evidence missing' : 'Evidence pending'; c.note = e.status === 'Missing' ? 'No evidence provided or declared.' : e.status === 'Requested' ? 'Evidence requested from vendor.' : 'Vendor declared the control but has not provided evidence.'; }
    } else if (rule.type === 'extraction') {
      const sp = an.subprocessors[0];
      c.input = sp ? sp.name + ' (clause ' + sp.clause + ')' : 'No named sub-processor';
      c.status = sp ? 'Identified' : 'Gap'; c.note = sp ? 'Named in clause ' + sp.clause + '.' : '';
      if (sp) c.clauses = an.clauses.filter(x => x.id === sp.clause);
    } else if (rule.type === 'jurisdiction') {
      c.input = 'Destination: ' + vendor.country + (an.clauses.find(x => x.cat === 'data-location') ? ' (clause ' + an.clauses.find(x => x.cat === 'data-location').id + ')' : '');
      c.clauses = an.clauses.filter(x => x.cat === 'data-location');
      c.status = juris.status === 'adequate' ? 'Adequacy identified' : juris.status === 'domestic' ? 'Domestic' : 'Identified';
      c.note = juris.basis;
    } else if (rule.type === 'transfer') {
      if (juris.status === 'adequate' || juris.status === 'domestic') continue;
      const t = a.transfer || {}; const e = evidenceStatus(a, 'transfer-assessment'); c.evStatus = e;
      c.input = 'Mechanism: ' + (t.mechanism || 'not answered') + '; contractual protection: ' + (t.contractual || '—') + '; TRA completed: ' + (t.tra || '—');
      const declaredOk = t.mechanism && t.mechanism !== 'Not identified' && t.contractual === 'Yes' && t.tra === 'Yes';
      if (e.status === 'Verified') { c.status = 'Satisfied'; c.note = 'Safeguard and assessment verified.'; }
      else if (e.status === 'Submitted') { c.status = 'Subject to review'; c.note = 'Transfer documentation submitted: ' + e.docs.map(d => d.name).join(', '); }
      else if (declaredOk) { c.status = 'Evidence pending'; c.note = 'Safeguard declared; documentation not yet on file.'; }
      else { c.status = 'Review required'; c.note = 'Restricted transfer: no mechanism, contractual protection or transfer risk assessment recorded.'; }
      c.clauses = an.clauses.filter(x => x.cat === 'data-location');
    }
    if (rule.type === 'transfer') c.source = 'Data Transfer Assessment';
    else if (c.clauses[0]) c.source = 'Contract Clause ' + c.clauses[0].id;
    else if (rule.req === 'SUB' && subMode === 'named') c.source = 'Sub-processor Assessment';
    else { const sib = checks.find(x => x.req === rule.req && x.clauses && x.clauses[0]); c.source = sib ? 'Contract Clause ' + sib.clauses[0].id : 'Vendor Assessment'; }
    if (rule.id === 'SP-005') c.source = 'Sub-processor Rule SP-001';
    c.actionTitle = (rule.action || '').replace('{P}', P).replace('{S}', S.replace(/ Polska.*| Sp\..*/, ''));
    checks.push(c);
  }
  out.checks = checks;

  // Requirement status
  out.reqStatus = {};
  out.reqs.forEach(r => {
    const cs = checks.filter(c => c.req === r.id);
    let st = 'Not assessed';
    if (cs.length) {
      if (cs.some(c => ['Gap', 'Review required', 'Evidence missing', 'Evidence pending'].includes(c.status))) st = 'Review required';
      else if (cs.some(c => c.status === 'Awaiting verification')) st = 'Partially satisfied';
      else if (cs.some(c => isSoft(c.status))) st = 'Satisfactory subject to review';
      else st = 'Satisfied';
    }
    out.reqStatus[r.id] = st;
  });

  // Risk
  out.findings = checks.filter(c => isOpen(c.status) || isSoft(c.status)).map(c => ({ ...c, level: isSoft(c.status) ? 'Low' : c.sev }));
  out.findings.sort((x, y) => SEV_RANK[y.level] - SEV_RANK[x.level]);
  out.delivery = computeDelivery(a, an);
  const openF = out.findings.filter(f => isOpen(f.status));
  const openD = out.delivery ? out.delivery.alerts.filter(x => x.status === 'Attention' && x.level !== 'Low') : [];
  const softD = out.delivery ? out.delivery.alerts.filter(x => x.status !== 'Satisfied') : [];
  out.openCount = openF.length + openD.length;
  out.overall = !an ? 'In progress' : out.openCount ? 'ACTION REQUIRED' : (out.findings.length || softD.length) ? 'REVIEW — EVIDENCE AWAITING VERIFICATION' : 'NO OPEN GAPS IDENTIFIED';

  // Combined assessment score
  if (out.vendorScore && an) {
    const credit = s => isPass(s) ? 1 : isSoft(s) ? 0.75 : s === 'Awaiting verification' ? 0.5 : 0;
    const parts = out.vendorScore.areas.map(ar => {
      const cs = checks.filter(c => c.req === ar.id && c.rule.type !== 'jurisdiction');
      const cr = cs.length ? cs.reduce((s, c) => s + credit(c.status), 0) / cs.length : 1;
      return { id: ar.id, weight: ar.weight, vendor: ar.score, contract: Math.round(cr * 100), score: Math.round(ar.score * 0.5 + cr * 50) };
    });
    out.combined = { parts, overall: Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / parts.reduce((s, p) => s + p.weight, 0)) };
    out.assurance = out.delivery && out.delivery.score != null ? Math.round(out.combined.overall * 0.8 + out.delivery.score * 0.2) : out.combined.overall;
  }

  // Evidence rows
  out.evidence = checks.filter(c => c.rule.type !== 'jurisdiction' && c.rule.type !== 'extraction').map(c => {
    let label, status;
    if (c.rule.type === 'contract' && !c.rule.ev) { label = c.clauses[0] ? 'Contract clause ' + c.clauses[0].id : 'Contract provision'; status = c.status === 'Satisfied' ? 'Verified' : c.status === 'Gap' ? 'Missing' : 'In review'; }
    else if (c.rule.type === 'contract') { label = (c.clauses[0] ? 'Clause ' + c.clauses[0].id : '') + (c.evStatus && c.evStatus.docs.length ? ' + ' + c.evStatus.docs.map(d => d.name).join(', ') : ''); status = c.status === 'Satisfied' ? 'Verified' : c.status === 'Subject to review' ? 'Submitted' : 'In review'; }
    else { label = c.evStatus.docs.length ? c.evStatus.docs.map(d => d.name).join(', ') : EVIDENCE_TYPES[c.rule.ev].label; status = c.evStatus.status; }
    return { check: c, req: c.req, label, status, ev: c.rule.ev || null };
  });
  (a.actions || []).filter(x => x.ruleId.startsWith('DEL:')).forEach(x => {
    const e = evidenceStatus(a, 'delivery-plan');
    out.evidence.push({ check: { id: x.ruleId.replace('DEL:', 'DEL · '), rule: { ev: 'delivery-plan', type: 'evidence' }, evStatus: e, req: 'DEL' }, req: 'DEL', label: e.docs.length ? e.docs.map(d => d.name).join(', ') : EVIDENCE_TYPES['delivery-plan'].label, status: e.status, ev: 'delivery-plan' });
  });
  // Evidence register: per-rule rows are kept for traceability; a category template (if any) groups them for display.
  out.evidenceRules = out.evidence;
  const tpl = EVIDENCE_REGISTER_BY_CATEGORY[a.category];
  if (tpl) {
    const RANK = { Missing: 5, Requested: 4, Pending: 4, 'In review': 3, Submitted: 2, Verified: 1 };
    const used = new Set(); const grouped = [];
    tpl.forEach(g => {
      const members = out.evidenceRules.filter(r => r.req !== 'DEL' && g.rules.includes(r.check.id));
      if (!members.length) return;
      members.forEach(m => used.add(m));
      const status = members.map(m => m.status).sort((x, y) => (RANK[y] || 0) - (RANK[x] || 0))[0];
      const primary = members.find(m => m.ev && m.status !== 'Verified') || members.find(m => m.ev) || members[0];
      let label = members[0].label;
      if (members.length > 1) {
        const cl = [...new Set(members.flatMap(m => m.check.clauses ? m.check.clauses.slice(0, 1).map(x => x.id) : []))];
        const docs = [...new Set(members.flatMap(m => m.check.evStatus ? m.check.evStatus.docs.map(x => x.name) : []))];
        label = (g.evidence || g.label) + ': ' + [cl.length ? 'clauses ' + cl.join(', ') : '', docs.join(', ')].filter(Boolean).join(' + ');
      }
      grouped.push({ check: { ...primary.check, id: members.length > 1 ? members[0].check.id + ' +' + (members.length - 1) : primary.check.id, members: members.map(m => m.check.id) }, req: g.label, label, status, ev: primary.ev, members });
    });
    out.evidence = grouped.concat(out.evidenceRules.filter(r => !used.has(r)));
  }
  out.evidenceGaps = out.evidence.filter(e => ['Missing', 'Pending', 'Requested'].includes(e.status)).length;
  return out;
}


/* ---------- Engine D: Delivery Assurance. Targets come from the Contract engine; performance comes from a SAMPLE feed. ---------- */
function extractTargets(an) {
  const t = [];
  if (!an) return t;
  an.clauses.filter(c => c.cat === 'service-levels').forEach(c => {
    let m = c.text.match(/(\d+(?:\.\d+)?)% of calls within (\d+) seconds/i);
    if (m) t.push({ key: 'answer-rate', label: 'Calls answered within ' + m[2] + ' seconds', target: +m[1], unit: '%', dir: 'min', tol: 5, clause: c.id, rule: 'DEL-001' });
    m = c.text.match(/(\d+(?:\.\d+)?)% availability/i);
    if (m) t.push({ key: 'availability', label: 'Availability of monitored systems', target: +m[1], unit: '%', dir: 'min', tol: 0.1, clause: c.id, rule: 'DEL-001' });
  });
  const inc = an.clauses.find(c => c.cat === 'incident' && c.deadlineHours);
  if (inc) t.push({ key: 'incident-notify', label: 'Incident notification time', target: inc.deadlineHours, unit: 'h', dir: 'max', tol: 12, clause: inc.id, rule: 'DEL-002' });
  return t;
}
function weekScore(tg, v) {
  if (v == null) return null;
  const short = tg.dir === 'min' ? Math.max(0, tg.target - v) : Math.max(0, v - tg.target);
  return Math.max(0, Math.round(100 - short / tg.tol * 50));
}
function rolling(tg, series, end) {
  const w = DELIVERY_WINDOW_WEIGHTS; let sum = 0, ws = 0; const used = [];
  for (let i = 0; i < w.length; i++) { const idx = end - i; if (idx < 0) break; const sc = weekScore(tg, series[idx]); if (sc == null) continue; sum += sc * w[i]; ws += w[i]; used.push({ week: DELIVERY_WEEKS[idx], value: series[idx], score: sc, weight: w[i] }); }
  return ws ? { score: Math.round(sum / ws), used } : { score: null, used };
}
function computeDelivery(a, an) {
  if (!a.deliveryRun) return null;
  const feed = DELIVERY_FEED[a.vendorId]; const end = a.deliveryWeek == null ? 7 : a.deliveryWeek;
  const targets = extractTargets(an);
  const metrics = targets.map(tg => {
    const series = feed && feed.series[tg.key];
    if (!series) return { ...tg, noData: true };
    const now = rolling(tg, series, end), prev = rolling(tg, series, end - 1);
    const win = series.slice(Math.max(0, end - 3), end + 1).map((v, i) => ({ v, week: DELIVERY_WEEKS[Math.max(0, end - 3) + i] }));
    const breaches = win.filter(x => x.v != null && (tg.dir === 'min' ? x.v < tg.target : x.v > tg.target));
    const latest = [...win].reverse().find(x => x.v != null);
    return { ...tg, series: series.slice(0, end + 1), now: now.score, prev: prev.score, used: now.used, breaches, latest, moved: now.score != null && prev.score != null ? now.score - prev.score : 0 };
  });
  const scored = metrics.filter(m => m.now != null);
  const score = scored.length ? Math.round(scored.reduce((s, m) => s + m.now, 0) / scored.length) : null;
  const alerts = [];
  scored.forEach(m => {
    if (!(m.now < 80 || m.breaches.length)) return;
    const level = m.now < 60 ? 'High' : m.now < 80 ? 'Medium' : 'Low';
    const b = m.breaches[m.breaches.length - 1];
    const detail = m.label + ' moved ' + m.prev + ' → ' + m.now + ' (rolling score). ' + (b ? b.week + ': ' + b.v + m.unit + ' against the ' + (m.dir === 'min' ? 'minimum ' : 'maximum ') + m.target + m.unit + ' in clause ' + m.clause + '.' : '');
    const act = (a.actions || []).find(x => x.ruleId === 'DEL:' + m.key);
    const ev = evidenceStatus(a, 'delivery-plan');
    const status = act && ev.status === 'Verified' ? 'Satisfied' : act && ev.status === 'Submitted' ? 'Subject to review' : 'Attention';
    alerts.push({ key: m.key, rule: m.rule, level, detail, metric: m, status, actionId: act ? act.id : null });
  });
  return { source: feed ? feed.source : 'No sample feed for this supplier', end, week: DELIVERY_WEEKS[end], targets, metrics, score, alerts,
    label: score == null ? 'No measurable targets' : score >= 85 ? 'On track' : score >= 70 ? 'Attention' : 'High risk' };
}

/* ---------- Workflow: action generation & sync ---------- */
function syncActions(a, d) {
  let added = 0;
  d.findings.filter(f => isOpen(f.status)).forEach(f => {
    if (a.actions.find(x => x.ruleId === f.id)) return;
    const n = a.actions.length + 1;
    a.actions.push({ id: 'ACT-' + String(n).padStart(3, '0'), ruleId: f.id, req: f.req, title: f.actionTitle, owner: f.rule.owner, priority: f.sev, due: addDays(a.created, DUE_DAYS[f.sev]), source: f.source, ev: f.rule.ev || null, status: 'Open', history: [] });
    added++;
  });
  return added;
}
function actionState(a, d, act) {
  if (act.status === 'Complete') return 'Complete';
  if (act.ruleId.startsWith('DEL:')) { const e = evidenceStatus(a, 'delivery-plan'); return e.status === 'Verified' ? 'Ready to close' : e.status === 'Submitted' ? 'Evidence received' : a.requested['delivery-plan'] ? 'Evidence requested' : 'Open'; }
  const c = d.checks.find(x => x.id === act.ruleId);
  if (!c || isPass(c.status)) return 'Ready to close';
  if (isSoft(c.status) || c.status === 'Awaiting verification') return 'Evidence received';
  if (act.ev && a.requested[act.ev]) return 'Evidence requested';
  return 'Open';
}

function snapshot(a, d, label) {
  return { label, at: new Date().toISOString(), overall: d.overall, score: d.assurance != null ? d.assurance : null, vendor: d.vendorScore ? d.vendorScore.overall : null, reqStatus: { ...d.reqStatus }, open: d.openCount || 0, delivery: d.delivery ? d.delivery.score : null, material: d.findings.filter(f => isOpen(f.status)).length, gaps: d.evidenceGaps };
}

export { OPEN, SOFT, PASS, isOpen, isSoft, isPass, addDays, userById, parseContract, classifyClause, DECLARED, evidenceStatus, compute, extractTargets, weekScore, rolling, computeDelivery, syncActions, actionState, snapshot };
