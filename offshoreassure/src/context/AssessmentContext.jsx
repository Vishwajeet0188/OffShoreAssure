/* Application state for the prototype.
   - One store object (same shape and localStorage key as the plain-JS version, `offshoreassure-proto-v2`).
   - React subscribes through useSyncExternalStore; every action mutates the store and commits once.
   - The current assessment comes from the route (/assessment/:assessmentId/...), falling back to the last one opened.
   - Engine output (D) is derived with the pure compute() from engine/engines.js. */
import { createContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RULEBASE_VERSION, USERS, EVIDENCE_TYPES, classifyDoc, DUE_DAYS, VENDORS, SCENARIOS, DELIVERY_WEEKS } from '../data/prototype-data.js';
import { CONTRACTS } from '../data/sample-contracts.js';
import { addDays, userById, parseContract, compute, extractTargets, syncActions, actionState, snapshot } from '../engine/engines.js';
import { STORE, STAGES, PROC_STEPS, reqName, userName, pathFor, viewFromPath, NO_ASSESSMENT } from '../lib/constants.js';
import { clone } from '../lib/format.js';
import { reportText, exportReportFile } from '../lib/report.js';

export const AssessmentContext = createContext(null);

/* ---------- persistence ---------- */
export function fresh() { return { role: 'sw', list: [], cur: null, sel: {}, tab: {}, q: '', bell: false, bellSeen: 0 }; }
function load() { try { const r = localStorage.getItem(STORE); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
/* Transient UI (processing animation, toast, search, popups, login form errors) is never persisted. */
function save(S) { try { const c = { ...S, proc: null, _toast: null, q: '', bell: false, loginEmail: null, loginErr: null, lpMenu: false }; localStorage.setItem(STORE, JSON.stringify(c)); } catch (e) { /* storage unavailable */ } }

function createStore() {
  let S = load() || fresh();
  S.proc = null; S._toast = null; S.q = ''; S.bell = false; S.lpMenu = false;
  let version = 0; const subs = new Set();
  return {
    get: () => S,
    replace: next => { S = next; },
    version: () => version,
    commit: () => { version++; save(S); subs.forEach(f => f()); },
    subscribe: f => { subs.add(f); return () => subs.delete(f); }
  };
}

export const DEMO_EMAIL = id => id === 'vendor' ? 'supplier.contact@globalassist.example' : userById(id).name.toLowerCase().replace(/\s+/g, '.') + '@acme.example';
export const SAMPLE_EV = { 'transfer-assessment': () => 'International_Transfer_Assessment.pdf', 'sub-authorisation': () => 'Approved_Subcontractor_List_Signed.pdf', 'incident-ops': a => VENDORS[a.vendorId].name.split(' ')[0] + '_IR_Exercise_Report_2026.pdf', 'sub-contract': () => 'CloudOps_Subprocessor_Agreement.pdf', 'sub-equivalent': () => 'CloudOps_Subprocessor_Agreement.pdf', 'sub-security': () => 'CloudOps_ISO27001.pdf', 'change-notice': () => 'Subprocessor_Change_Notice.pdf', 'security-cert': a => VENDORS[a.vendorId].name.split(' ')[0] + '_ISO27001.pdf', 'delivery-plan': a => VENDORS[a.vendorId].name.split(' ')[0] + '_Service_Improvement_Plan.pdf' };

export function AssessmentProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createStore();
  const store = storeRef.current;
  const version = useSyncExternalStore(store.subscribe, store.version);
  const navigate = useNavigate();
  const navRef = useRef(navigate); navRef.current = navigate;
  const location = useLocation();
  const route = viewFromPath(location.pathname);
  const S = store.get();

  /* The route decides which assessment is open; `none` means no assessment. */
  const curId = route.assessmentId != null ? (route.assessmentId === NO_ASSESSMENT ? null : route.assessmentId) : S.cur;
  const curRef = useRef(curId); curRef.current = curId;
  const a = S.list.find(x => x.id === curId) || null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const D = useMemo(() => (a ? compute(a) : null), [a, version]);

  /* Keep the stored "current assessment" in step with the URL (refresh, back/forward, deep links). */
  useEffect(() => {
    const s = store.get();
    if (route.assessmentId && route.assessmentId !== NO_ASSESSMENT && s.cur !== route.assessmentId && s.list.some(x => x.id === route.assessmentId)) {
      s.cur = route.assessmentId; s.sel = {}; s.tab = {}; store.commit();
    }
  }, [route.assessmentId, store]);

  const actions = useMemo(() => {
    const St = () => store.get();
    const A = () => St().list.find(x => x.id === curRef.current) || null;
    const Dnow = () => { const x = A(); return x ? compute(x) : null; };
    const me = () => St().role === 'vendor' ? { id: 'vendor', name: 'Supplier contact', role: 'Supplier portal' } : userById(St().role);
    const log = (x, event, detail, ref) => { x.audit.push({ at: new Date().toISOString(), event, detail: detail || '', ref: ref || '', by: me().name, rb: RULEBASE_VERSION }); };
    let toastT;
    const toast = msg => { St()._toast = msg; clearTimeout(toastT); toastT = setTimeout(() => { St()._toast = null; store.commit(); }, 3400); };
    const keep = () => store.commit();
    const go = v => {
      const s = St(); s.q = ''; s.bell = false; s.lpMenu = false;
      const path = pathFor(v, s.cur);
      store.commit();
      if (path === window.location.pathname) window.scrollTo(0, 0); else navRef.current(path);
    };

    function afterChange(x, why) { const d = compute(x); if (x.actionsGenerated) { const n = syncActions(x, d); if (n) log(x, n + ' new action' + (n > 1 ? 's' : '') + ' generated', why || '', 'WF-001'); } }
    function addDoc(x, name, stage, forceEv) {
      const d0 = compute(x);
      const subs = d0 && d0.analysis ? d0.analysis.subprocessors.map(s => s.name) : [];
      const c = classifyDoc(name, subs);
      if (forceEv && !c.covers.includes(forceEv)) c.covers.push(forceEv);
      const ex = x.docs.find(d => d.name === name);
      if (ex) { c.covers.forEach(k => { if (!ex.covers.includes(k)) ex.covers.push(k); }); return ex; }
      const doc = { name, stage, ...c, at: new Date().toISOString() }; x.docs.push(doc);
      log(x, 'Evidence uploaded', name + ' → ' + (doc.covers.map(k => EVIDENCE_TYPES[k].label).join(', ') || 'general document') + ' (' + doc.status + ')', doc.status === 'Verified' ? 'EV-001' : '');
      return doc;
    }
    /* Snapshot before an evidence change; the returned function logs reassessment deltas and action state changes. */
    function evidenceChanged(x, label) {
      const before = compute(x);
      return () => { const after = compute(x);
        Object.keys(after.reqStatus).forEach(k => { if (before.reqStatus[k] !== after.reqStatus[k]) log(x, 'Reassessment: ' + reqName(k), before.reqStatus[k] + ' → ' + after.reqStatus[k], 'RB'); });
        x.actions.forEach(t => { const b = actionState(x, before, t), n = actionState(x, after, t); if (b !== n) log(x, t.id + ' ' + n.toLowerCase(), t.title, t.ruleId.replace('DEL:', 'DEL-')); });
        x.evidenceTouched = true; afterChange(x, label); };
    }
    function makeDelAction(x, al, quiet) { const n = x.actions.length + 1; const pr = al.level === 'Low' ? 'Medium' : al.level;
      x.actions.push({ id: 'ACT-' + String(n).padStart(3, '0'), ruleId: 'DEL:' + al.key, req: 'DEL', title: 'Review ' + al.metric.label.toLowerCase() + ' shortfall with supplier', owner: 'th', priority: pr, due: addDays(x.created, DUE_DAYS[pr]), source: 'Delivery Assurance (sample feed) · clause ' + al.metric.clause, ev: 'delivery-plan', status: 'Open', history: [] });
      if (!quiet) log(x, 'Action created from delivery alert', al.detail, al.rule); }
    function newAssessment(preset) {
      const s = St(); const n = 12 + s.list.length;
      const x = { id: 'OA-2026-' + String(n).padStart(4, '0'), created: new Date().toISOString(), preset: preset || null,
        org: '', sector: 'Financial Services', name: '', category: 'Customer Support', owner: 'sw', description: '', vendorId: 'globalassist',
        scope: { personal: false, customerInfo: false, internalSystems: false, overseas: false, subcontractors: false, confidential: false, privileged: false, dataCats: [], activities: [] },
        docs: [], requested: {}, transfer: {}, actions: [], audit: [], accepted: {} };
      if (preset) Object.assign(x, clone(SCENARIOS[preset].create));
      /* New blank assessments pick up the registered buyer organisation (prototype registration). */
      if (!preset && s.buyer) { x.org = s.buyer.org; x.sector = s.buyer.sector; x.owner = s.buyer.role || x.owner; }
      s.list.unshift(x); s.cur = x.id; s.sel = {}; s.tab = {}; curRef.current = x.id;
      return x;
    }

    const api = {
      me, go, toast,
      /* ----- navigation / selection ----- */
      setTab: (k, v) => { St().tab[k] = v; keep(); },
      subTab: () => { St().tab.map = 'sub'; go('mapping'); },
      auditTab: () => { if (!A()) return; St().tab.ev = 'audit'; go('audit'); },
      create: preset => { newAssessment(preset); go('setup'); },
      open: (id, v) => { const s = St(); s.cur = id; s.sel = {}; s.tab = {}; curRef.current = id; const x = A(); go(v || (x.reportGenerated ? 'final' : (STAGES.slice().reverse().find(t => t.ok(x)) || STAGES[0]).id)); },
      selectSupplier: id => { St().sel.supplier = id; keep(); },
      select: (k, v) => { St().sel[k] = v; keep(); },
      reset: () => { try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ } store.replace(fresh()); curRef.current = null; go('dash'); },
      toggleBell: () => { const s = St(); s.bell = !s.bell; if (s.bell) s.bellSeen = Date.now() + 1; keep(); },
      closePopups: () => { const s = St(); if (s.q || s.bell) { s.q = ''; s.bell = false; keep(); } },
      closeBell: () => { St().bell = false; keep(); },
      setQuery: q => { St().q = q; keep(); },
      searchPick: (k, id, sup) => { const s = St(); s.q = '';
        if (k === 'suppliers') { s.sel.supplier = sup; go('suppliers'); }
        else if (k === 'open') api.open(id);
        else if (k === 'clause') { s.sel.clause = id; s.tab.contract = 'all'; go('contract'); }
        else if (k === 'check') { s.sel.check = id; s.tab.map = 'trace'; go('mapping'); }
        else go(id); },
      setRole: r => { St().role = r; keep(); },
      setOrgFilter: o => { St().orgf = o; keep(); },

      /* ----- stage 1-3 ----- */
      setField: (bind, value) => { const x = A(); if (!x) return; x[bind] = value; if (bind === 'vendorId') x.q = clone(VENDORS[value].q); keep(); },
      fill: k => { const x = A(); Object.assign(x, clone(SCENARIOS[k].create)); x.preset = k; x.q = clone(VENDORS[x.vendorId].q); x.scopeFilled = false; keep(); },
      createNext: () => { const x = A();
        if (!x.org.trim() || !x.name.trim()) { toast('Add the organisation and assessment name to continue.'); keep(); return; }
        if (!x.createdDone) { x.createdDone = true; log(x, 'Assessment created', x.name + ' · ' + VENDORS[x.vendorId].name); }
        if (!x.q) x.q = clone(VENDORS[x.vendorId].q);
        if (x.preset && !x.scopeFilled) { x.scope = clone(SCENARIOS[x.preset].scope); x.scopeFilled = true; }
        go('reqs'); },
      setScope: (k, yes) => { const x = A(); x.scope[k] = yes; if (x.reqsGenerated) { log(x, 'Scope changed', k + ' = ' + (yes ? 'Yes' : 'No'), 'REQ'); afterChange(x, 'Scope changed'); } keep(); },
      toggleScopeItem: (k, value, checked) => { const arr = A().scope[k]; const i = arr.indexOf(value); if (checked && i < 0) arr.push(value); if (!checked && i >= 0) arr.splice(i, 1); keep(); },
      genReqs: () => { const x = A(); x.reqsGenerated = true; const d = compute(x); log(x, 'Requirements generated', d.reqs.length + ' requirements: ' + d.reqs.map(r => r.name).join(', '), 'REQ'); toast(d.reqs.length + ' requirements stored'); keep(); },
      setAnswer: (k, yes) => { const x = A(); x.q[k] = yes; if (x.vendorRun) { log(x, 'Questionnaire changed', k + ' = ' + (yes ? 'Yes' : 'No'), 'RUBRIC'); afterChange(x, 'Questionnaire changed'); } keep(); },
      vendorSamples: () => { const x = A(); VENDORS[x.vendorId].docs.forEach(n => addDoc(x, n, 'vendor')); keep(); },
      runVendor: () => { const x = A(); x.vendorRun = true; const d = compute(x); log(x, 'Supplier assessed (Engine A)', d.vendorScore.overall + '/100 · access ' + d.vendorScore.flag.toLowerCase() + (d.vendorScore.weak.length ? ' (' + d.vendorScore.weak.map(w => w.name).join(', ') + ')' : ''), 'RUBRIC'); keep(); },

      /* ----- stage 4-6: contract ----- */
      sampleContract: () => { const x = A(); const n = VENDORS[x.vendorId].contract; x.contractName = n; x.contractText = CONTRACTS[n]; keep(); },
      analyse: () => {
        const x = A(); if (!x.contractText) return; const s = St();
        log(x, 'Contract uploaded', x.contractName); x.contractAnalysed = false; s.proc = 0; s.sel = {}; keep();
        const fast = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const tick = () => { s.proc++;
          if (s.proc >= PROC_STEPS.length) { s.proc = null; x.contractAnalysed = true; const d = compute(x);
            log(x, 'Contract analysed (Engine B)', d.analysis.clauses.length + ' clauses, ' + d.analysis.relevant.length + ' relevant, ' + extractTargets(d.analysis).length + ' service-level targets', 'EXTRACT');
            if (d.analysis.subprocessors.length) log(x, 'Third party extracted', d.analysis.subprocessors.map(p => p.name + ' (clause ' + p.clause + ')').join(', '), 'EXTRACT');
            afterChange(x, 'Contract re-analysed'); keep(); return; }
          keep(); setTimeout(tick, fast ? 60 : 380); };
        setTimeout(tick, fast ? 60 : 380);
      },
      uploadContract: file => {
        if (!/\.(txt|md)$/i.test(file.name) && file.type !== 'text/plain') { toast('This prototype parses text contracts. Export the agreement as .txt, or use the prepared sample.'); keep(); return; }
        const x = A(); const r = new FileReader();
        r.onload = () => { const txt = String(r.result); if (!parseContract(txt).clauses.length) { toast('No numbered clauses found. Use the format "7.1 Heading. Clause text."'); keep(); return; } x.contractName = file.name; x.contractText = txt; keep(); };
        r.readAsText(file);
      },
      uploadVendorDocs: files => { const x = A(); files.forEach(f => addDoc(x, f.name, 'vendor')); if (x.vendorRun) afterChange(x); keep(); },
      accept: id => { const x = A(); x.accepted[id] = me().name; log(x, 'Extraction accepted', 'Clause ' + id, 'HITL'); keep(); },
      mapClause: id => { const c = Dnow().checks.find(k => k.clauses.some(y => y.id === id)); const s = St(); s.sel.check = c ? c.id : null; s.tab.map = 'trace'; go('mapping'); },
      selCheck: id => { const s = St(); s.sel.check = id; s.tab.map = 'trace'; go('mapping'); },
      /* Views that record an audit entry the first time they are opened (obligations, mapping, sub-processor). */
      markSeen: (flag, event, detail, ref) => { const x = A(); if (!x || x[flag]) return; x[flag] = true; if (event) log(x, event, detail, ref); keep(); },

      /* ----- stage 7-8 ----- */
      request: ev => { const x = A(); const ch = evidenceChanged(x, 'Evidence requested'); x.requested[ev] = true; log(x, 'Evidence requested from supplier', EVIDENCE_TYPES[ev].label, 'WF-002'); ch(); toast('Request sent to ' + VENDORS[x.vendorId].name); keep(); },
      tqFill: () => { const x = A(); x.transfer = { ...SCENARIOS[x.preset].transfer }; keep(); },
      runGate: () => { const x = A(); const first = !x.transferDone; x.transferDone = true; const d = compute(x); const x2 = d.checks.find(c => c.id === 'XFER-002');
        if (first) log(x, 'International transfer identified (Engine C)', 'UK → ' + VENDORS[x.vendorId].country + ': ' + d.juris.basis, 'XFER-001');
        log(x, 'Transfer gate executed', x2 ? x2.status + ': ' + x2.input : '', 'XFER-002'); afterChange(x, 'Transfer answers changed'); keep(); },
      setTransfer: (k, v) => { const x = A(); x.transfer[k] = v; if (x.transferDone) api.runGate(); else keep(); },
      transferDone: () => { const x = A(); x.transferDone = true; const d = compute(x); log(x, 'International transfer assessed (Engine C)', 'UK → ' + VENDORS[x.vendorId].country + ': ' + d.juris.basis, 'XFER-001'); keep(); },
      runDelivery: () => { const x = A(); x.deliveryRun = true; x.deliveryWeek = 7; const d = compute(x); log(x, 'Delivery assessed (Engine D, sample feed)', 'Rolling score ' + d.delivery.score + ' at ' + d.delivery.week + (d.delivery.alerts.length ? '; alerts: ' + d.delivery.alerts.map(t => t.metric.label).join(', ') : ''), 'DEL-001'); keep(); },
      advance: () => { const x = A(); x.deliveryWeek = Math.min(DELIVERY_WEEKS.length - 1, (x.deliveryWeek == null ? 7 : x.deliveryWeek) + 1); const d = compute(x); log(x, 'Delivery re-scored at ' + d.delivery.week + ' (sample feed)', 'Rolling score ' + d.delivery.score + (d.delivery.alerts.length ? '; ' + d.delivery.alerts.map(t => t.detail).join(' ') : ''), 'DEL-001'); keep(); },
      delAction: key => { const x = A(); const al = Dnow().delivery.alerts.find(y => y.key === key);
        if (!x.actionsGenerated) { x.delRaised = x.delRaised || {}; x.delRaised[al.key] = true; log(x, 'Delivery alert raised for action', al.detail, al.rule); toast('Queued. It becomes an action when actions are generated.'); keep(); return; }
        makeDelAction(x, al); toast('Action created'); keep(); },

      /* ----- stage 9-11: risk, actions, evidence ----- */
      genActions: () => { const x = A(); const d = compute(x); let n = syncActions(x, d); if (d.delivery) d.delivery.alerts.filter(t => (x.delRaised || {})[t.key]).forEach(t => { makeDelAction(x, t, true); n++; }); x.actionsGenerated = true; x.baseline = snapshot(x, d, 'Baseline'); log(x, n + ' compliance actions generated', x.actions.map(t => t.id + ' ' + t.title).join('; '), 'WF-001'); go('actions'); },
      assign: (id, owner) => { const x = A(); const t = x.actions.find(y => y.id === id); t.owner = owner; log(x, t.id + ' assigned', userName(owner) + ' (' + userById(owner).role + ')', 'WF-003'); toast(t.id + ' assigned to ' + userName(owner)); keep(); },
      complete: id => { const x = A(); const t = x.actions.find(y => y.id === id); t.status = 'Complete'; log(x, t.id + ' marked complete', t.title, t.ruleId.replace('DEL:', 'DEL-')); keep(); },
      attachEv: ev => { const x = A(); const ch = evidenceChanged(x); addDoc(x, SAMPLE_EV[ev](x), 'evidence', ev); ch(); toast('Evidence submitted. Engines re-run.'); keep(); },
      uploadEvidence: (files, ev) => { const x = A(); const ch = evidenceChanged(x); files.forEach(f => addDoc(x, f.name, 'evidence', ev)); ch(); toast('Evidence submitted. Engines re-run.'); keep(); },
      verify: name => { const x = A(); if (St().role !== 'sw') return; const ch = evidenceChanged(x); const d = x.docs.find(t => t.name === name); d.status = 'Verified'; d.verifiedBy = me().name; log(x, 'Evidence verified', d.name, 'EV-002'); ch(); toast(d.name + ' verified'); keep(); },
      simulate: () => { const x = A(); const ch = evidenceChanged(x); log(x, 'Supplier response received (simulated)', SCENARIOS[x.preset].simulate.join(', '), 'DEMO'); SCENARIOS[x.preset].simulate.forEach(n => addDoc(x, n, 'evidence')); x.simulated = true; ch(); toast('Supplier response processed. ' + SCENARIOS[x.preset].simulate.length + ' documents classified.'); keep(); },

      /* ----- stage 12: final assessment ----- */
      genReport: () => { const x = A(); const d = compute(x); x.reportGenerated = true; log(x, 'Final assessment issued', d.overall + ' · ' + d.assurance + '/100', 'RPT'); keep(); },
      exportReport: () => { const x = A(); const file = exportReportFile(x, compute(x)); log(x, 'Report exported', file, 'RPT'); toast('Report exported: ' + file); keep(); },
      copyReport: () => { const txt = reportText(A(), Dnow()); try { navigator.clipboard.writeText(txt).then(() => { toast('Report copied'); keep(); }, () => { toast('Copy blocked by this viewer.'); keep(); }); } catch (e) { toast('Copy blocked by this viewer.'); keep(); } },

      /* ----- public site: simulated sign-in and prototype registration ----- */
      toggleLpMenu: () => { St().lpMenu = !St().lpMenu; keep(); },
      closeLpMenu: () => { if (St().lpMenu) { St().lpMenu = false; keep(); } },
      lpStart: () => { const s = St(); s.lpMenu = false; const blank = s.list.find(t => !t.createdDone && !t.preset && !t.name); if (blank) { s.cur = blank.id; curRef.current = blank.id; go('setup'); } else { newAssessment(); go('setup'); } },
      setLoginPick: id => { St().loginPick = id; keep(); },
      setLoginEmail: v => { St().loginEmail = v; keep(); },
      demoLogin: () => { const s = St(); s.role = s.loginPick || 'sw'; s.signedIn = true; const x = A(); if (x) log(x, 'Signed in (simulated)', me().name + ' · ' + me().role, 'DEMO'); toast('Signed in as ' + me().name + ' (simulated)'); go('dash'); },
      submitLogin: (email, hasPass) => { const s = St(); s.loginEmail = email;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { s.loginErr = 'Enter an email address, for example sarah.williams@acme.example.'; keep(); return; }
        if (!hasPass) { s.loginErr = 'Enter a password. Any password works in this prototype.'; keep(); return; }
        s.loginErr = null;
        const match = USERS.find(u => DEMO_EMAIL(u.id) === email.toLowerCase());
        s.role = match ? match.id : 'sw'; s.signedIn = true;
        toast('Signed in as ' + me().name + ' (simulated)'); go('dash'); },
      setBuyerDraft: (k, v) => { const s = St(); s.buyerDraft = s.buyerDraft || { ...(s.buyer || {}) }; s.buyerDraft[k] = v; keep(); },
      submitSignup: () => { const s = St(); const b = { sector: 'Financial Services', role: 'sw', ...(s.buyer || {}), ...(s.buyerDraft || {}) };
        if (!(b.org || '').trim() || !(b.name || '').trim()) { s.buyerDraft = b; toast('Add your organisation name and your name to continue.'); keep(); return; }
        s.buyer = { org: b.org.trim(), sector: b.sector || 'Financial Services', name: b.name.trim(), role: b.role || 'sw' }; s.buyerDraft = null; s.role = s.buyer.role; s.signedIn = true;
        toast('Buyer workspace created for ' + s.buyer.org + ' (prototype)'); go('dash'); }
    };
    return api;
  }, [store]);

  const me = actions.me();
  const value = { S, a, D, route, version, me, act: actions };
  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}

