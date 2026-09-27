import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VENDORS } from '../data/prototype-data.js';
import { isOpen, isSoft, compute } from '../engine/engines.js';
import { STAGES, PATHCOL, statusWord, engineOf } from '../lib/constants.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge, Rid } from '../components/common/Badges.jsx';
import { Ring } from '../components/common/Charts.jsx';
import { LP_SECTIONS, scrollToSection } from '../components/layout/PublicLayout.jsx';

const ENGINE_CARDS = [
  { L: 'A', name: 'Compliance', icon: 'shield', stage: 'compliance', text: 'Assess supplier requirements, certifications, security controls and compliance evidence.', out: 'Requirement scores and an access flag' },
  { L: 'B', name: 'Contract', icon: 'scan', stage: 'contract', text: 'Identify relevant contractual clauses, obligations, subcontracting provisions and terms requiring review.', out: 'Clauses, obligations and third parties' },
  { L: 'C', name: 'Data Transfer', icon: 'globe', stage: 'transfer', text: 'Assess transfer destinations, data categories, safeguards and applicable transfer pathways.', out: 'Adequacy path or a safeguard review gate' },
  { L: 'D', name: 'Delivery Assurance', icon: 'pulse', stage: 'delivery', text: 'Track delivery progress, milestones, reporting and supporting evidence.', out: 'Rolling delivery score and alerts' }
];
const OUTPUTS = [
  ['clipboard', 'Requirements', 'Generated from what is being outsourced'],
  ['target', 'Compliance scores and flags', 'Weighted by requirement, with an access flag'],
  ['file', 'Contract clauses', 'Classified against a fixed clause taxonomy'],
  ['list', 'Contractual obligations', 'Party, event and deadline for each'],
  ['globe', 'Data-transfer findings', 'Destination status and safeguard gate'],
  ['alert', 'Risks', 'Ranked by severity, linked to their rule'],
  ['flow', 'Actions', 'Owner, priority and due date'],
  ['folder', 'Evidence', 'Attached to the rule it satisfies'],
  ['flag', 'Final Assessment', 'One buyer-facing view']
];
const CHAIN = [['users', 'Input'], ['scan', 'Analysis'], ['scale', 'Rules'], ['check', 'Results'], ['alert', 'Risk'], ['flow', 'Actions'], ['folder', 'Evidence'], ['flag', 'Final Assessment']];
const SAMPLE_LOG = [['09:32', 'Requirements generated', '7 requirements from scope answers', 'REQ'], ['09:41', 'Contract analysed (Engine B)', '34 clauses, 11 relevant', 'EXTRACT'], ['09:44', 'Transfer gate executed', 'Review required: no safeguard recorded', 'XFER-002'], ['09:52', 'Evidence verified', 'International_Transfer_Assessment.pdf', 'EV-002']];
const HASH_ROUTES = { dashboard: 'dash', dash: 'dash', login: 'login', signup: 'signup', 'sign-up': 'signup' };

/* Hero preview card: live values from the first analysed assessment, otherwise the labelled UC1 sample. */
function HeroPreview() {
  const { S, act } = useAssessment();
  const live = S.list.find(a => a.createdDone && a.contractAnalysed && a.vendorRun);
  let rows, title, sub, status, score, tag;
  if (live) {
    const d = compute(live); const v = VENDORS[live.vendorId];
    const x2 = d.checks.find(c => c.id === 'XFER-002'); const bOpen = d.findings.some(f => engineOf(f) === 'B' && isOpen(f.status));
    title = live.name; sub = live.id + ' · ' + v.name; status = statusWord(d.overall); score = d.assurance; tag = 'Live from this prototype';
    rows = [['A', 'Compliance', d.vendorScore.overall + '/100', d.vendorScore.flag, 'Access: ' + d.vendorScore.flag],
      ['B', 'Contract', d.analysis.obligations.length + ' obligations', bOpen ? 'Review required' : 'Satisfied', bOpen ? 'Review required' : 'No open gap'],
      ['C', 'Data Transfer', v.country, d.juris.status === 'adequate' ? 'Adequacy identified' : x2 ? x2.status : 'Review required', d.juris.status === 'adequate' ? 'Adequacy path' : x2 && isSoft(x2.status) ? 'Subject to review' : 'Review required'],
      ['D', 'Delivery Assurance', d.delivery && d.delivery.score != null ? d.delivery.score + '/100' : 'Not run', d.delivery ? d.delivery.label : 'Pending', d.delivery ? d.delivery.label : 'Not run yet']];
  } else {
    title = 'Customer Support Outsourcing'; sub = 'Use Case 1 · Global Assist Services Ltd, India'; status = 'Action required'; score = 76; tag = 'Sample preview';
    rows = [['A', 'Compliance', '76/100', 'Conditional', 'Access: Conditional'], ['B', 'Contract', '9 obligations', 'Review required', 'Review required'], ['C', 'Data Transfer', 'India', 'Review required', 'Safeguard gate'], ['D', 'Delivery Assurance', '76/100', 'Attention', 'Attention']];
  }
  return (
    <div className="lp-preview card">
      <div className="spread" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ minWidth: 0 }}><div className="eyebrow">Assessment</div><div style={{ font: '600 17px/1.3 var(--f-serif)', color: 'var(--ink)' }}>{title}</div><div className="note">{sub}</div></div>
        <span className="proto">{tag}</span>
      </div>
      <div className="row" style={{ padding: '14px 18px', gap: 16, flexWrap: 'nowrap' }}><Ring pct={score} size={74} /><div><div className="eyebrow">Assurance score</div><Badge s={status} /></div></div>
      {rows.map(r => <div className="lp-prow" key={r[0]}><span className="eletter" style={{ width: 26, height: 26, fontSize: 13 }}>{r[0]}</span><span><b>{r[1]}</b><span className="note" style={{ display: 'block' }}>{r[2]}</span></span><Badge s={r[3]} label={r[4]} /></div>)}
      {live
        ? <button className="lp-prev-cta" data-act="open" data-id={live.id} onClick={() => act.open(live.id)}>Open this assessment <Icon n="arrow" s={15} /></button>
        : <button className="lp-prev-cta" data-act="go" data-v="dash" onClick={() => act.go('dash')}>Open the dashboard <Icon n="arrow" s={15} /></button>}
    </div>
  );
}

export default function Landing() {
  const { act } = useAssessment();
  const loc = useLocation(); const navigate = useNavigate();

  /* Section targets from other pages, and the legacy hash links (#dashboard, #login, #signup, #how-it-works …). */
  useEffect(() => {
    const target = loc.state && loc.state.lpTarget;
    const h = (loc.hash || '').replace('#', '');
    if (target) { requestAnimationFrame(() => scrollToSection(target, false)); return; }
    if (HASH_ROUTES[h]) { act.go(HASH_ROUTES[h]); return; }
    if (LP_SECTIONS[h]) requestAnimationFrame(() => scrollToSection(LP_SECTIONS[h], false));
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBtn = (v, cls, children) => <button className={cls} data-act="go" data-v={v} onClick={() => act.go(v)}>{children}</button>;
  return (
    <>
      <section className="lp-hero" id="lp-top"><div className="lp-wrap lp-herogrid">
        <div className="lp-herotext">
          <div className="row" style={{ gap: 10 }}><span className="eyebrow" style={{ color: 'var(--copper)' }}>Offshore outsourcing assurance</span><span className="proto">Phase 1 Prototype</span></div>
          <h1 className="lp-h1">Confidence in every outsourced relationship.</h1>
          <p className="lp-lead">OffshoreAssure brings compliance, contracts, data transfers and delivery assurance into one connected assessment workflow.</p>
          <div className="row" style={{ gap: 12, marginTop: 6 }}>
            <button className="btn primary lp-cta" data-act="lpstart" onClick={act.lpStart}>Start an Assessment <Icon n="arrow" s={16} /></button>
            {goBtn('dash', 'btn outline lp-cta', <><Icon n="layout" s={16} />Explore the Dashboard</>)}
          </div>
          <p className="note" style={{ maxWidth: '56ch' }}>Phase 1 prototype with sample data and simulated interactions. Outputs are risk indicators that support a buyer's decision. They are not legal advice or compliance certification.</p>
        </div>
        <HeroPreview />
      </div></section>

      <section className="lp-band"><div className="lp-wrap lp-statement"><span className="lp-rule"></span>
        <p className="lp-state1">Offshore outsourcing can introduce compliance, contractual, data-transfer and delivery risks across multiple stages of a supplier relationship.</p>
        <p className="lp-state2">OffshoreAssure connects those checks into one structured assurance journey.</p>
      </div></section>

      <section className="lp-sec" id="solutions"><div className="lp-wrap">
        <div className="lp-sechead"><span className="eyebrow">Solutions · The four operational engines</span><h2 className="lp-h2">One connected assurance journey.</h2><p className="lp-sub">Four operational engines each perform a defined, rule-based function. Each engine's output becomes an input to the next stage, so nothing is assessed in isolation.</p></div>
        <div className="lp-engines">{ENGINE_CARDS.map(e => (
          <article className="lp-engine card" key={e.L}>
            <div className="spread"><span className="lp-eic"><Icon n={e.icon} s={22} /></span><span className="eletter">{e.L}</span></div>
            <h3 className="lp-h3">{e.name}</h3><p>{e.text}</p>
            <div className="lp-out"><span className="eyebrow">Produces</span><span>{e.out}</span></div>
            <button className="link" data-act="lpstage" data-v={e.stage} onClick={() => act.go(e.stage)}>See it in the prototype <Icon n="arrow" s={14} /></button>
          </article>))}
        </div>
        <p className="note lp-center">Governance evidence sits beneath all four engines as the traceability layer. The Final Assessment brings their results together.</p>
      </div></section>

      <section className="lp-sec lp-alt" id="how-it-works"><div className="lp-wrap">
        <div className="lp-sechead"><span className="eyebrow">How it works</span><h2 className="lp-h2">From supplier to certainty.</h2><p className="lp-sub">Each stage builds on the information produced by the previous stage, creating a traceable assurance workflow.</p></div>
        <ol className="lp-journey">{STAGES.map((s, i) => (
          <li key={s.id}><button data-act="lpstage" data-v={s.id} onClick={() => act.go(s.id)}><span className="lp-jn">{String(i + 1).padStart(2, '0')}</span><span className="lp-jc" style={{ background: PATHCOL[i] }}><Icon n={s.icon} s={18} /></span><span className="lp-jl">{s.label}</span></button></li>))}
        </ol>
        <div className="card lp-chaincard">
          <div><span className="eyebrow">What happens at every stage</span><p className="note" style={{ marginTop: 4 }}>The same pattern runs through each step, so every result can be traced back to the input and rule that produced it.</p></div>
          <div className="lp-chain">{CHAIN.map((c, i) => [
            <div className="lp-ch" key={'c' + i}><span className={'lp-chi' + (i === CHAIN.length - 1 ? ' last' : '')}><Icon n={c[0]} s={17} /></span><span>{c[1]}</span></div>,
            i < CHAIN.length - 1 ? <span className="lp-charr" aria-hidden="true" key={'a' + i}><Icon n="arrow" s={14} /></span> : null])}
          </div>
        </div>
      </div></section>

      <section className="lp-sec"><div className="lp-wrap">
        <div className="lp-sechead"><span className="eyebrow">Outputs</span><h2 className="lp-h2">What the platform produces.</h2><p className="lp-sub">Every stage leaves a stored output that the next stage reads.</p></div>
        <div className="lp-outputs">{OUTPUTS.map((o, i) => <div className="lp-output" key={o[1]}><span className="lp-oi"><Icon n={o[0]} s={19} /></span><div><b>{o[1]}</b><span className="note" style={{ display: 'block' }}>{o[2]}</span></div><span className="lp-on">{String(i + 1).padStart(2, '0')}</span></div>)}</div>
      </div></section>

      <section className="lp-sec lp-alt"><div className="lp-wrap lp-split">
        <div className="lp-sechead" style={{ margin: 0 }}><span className="eyebrow">Governance evidence</span><h2 className="lp-h2">Evidence behind every assessment.</h2><p className="lp-sub">OffshoreAssure connects assessment inputs, rules, results, flags, evidence and timestamps so buyers can understand how assessment information was produced.</p><p className="note">This is the supporting traceability layer across the four engines, not a separate engine.</p></div>
        <div className="card lp-log">
          <div className="spread" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-2)' }}><b>Audit trail</b><span className="proto">Sample entries</span></div>
          {SAMPLE_LOG.map(e => <div className="lp-logrow" key={e[0]}><span className="mono muted">{e[0]}</span><span className="lp-dot"></span><div><b>{e[1]}</b><span className="note" style={{ display: 'block' }}>{e[2]}</span></div><Rid id={e[3]} /></div>)}
        </div>
      </div></section>

      <section className="lp-sec"><div className="lp-wrap lp-split rev">
        <div className="card lp-final">
          <div className="spread"><div><div className="eyebrow">Final assessment</div><div style={{ font: '600 19px/1.3 var(--f-serif)', color: 'var(--ink)' }}>Customer Support Outsourcing</div></div><span className="proto">Sample preview</span></div>
          <div className="outcome coral" style={{ padding: '12px 16px' }}><div className="big" style={{ fontSize: 17 }}>ACTION REQUIRED</div></div>
          <div className="lp-fgrid">{ENGINE_CARDS.map(e => <div key={e.L}><span className="eletter" style={{ width: 24, height: 24, fontSize: 12 }}>{e.L}</span><span>{e.name}</span></div>)}</div>
          <div className="row" style={{ gap: 18 }}><span className="stat"><b>3</b><span className="note">findings</span></span><span className="stat"><b>3</b><span className="note">actions</span></span><span className="stat"><b>2</b><span className="note">evidence gaps</span></span></div>
        </div>
        <div className="lp-sechead" style={{ margin: 0 }}><span className="eyebrow">Buyer-facing outcome</span><h2 className="lp-h2">One view for the final decision.</h2>
          <p className="lp-sub">The Final Assessment brings the four operational engines together into one buyer-facing view, with findings, actions, evidence and review status.</p>
          <p className="lp-sub" style={{ fontSize: 15 }}>OffshoreAssure supports the buyer's decision. It does not make the outsourcing decision, and it does not certify compliance.</p>
          <div>{goBtn('dash', 'btn primary lp-cta', <>View Dashboard <Icon n="arrow" s={16} /></>)}</div>
        </div>
      </div></section>

      <section className="lp-sec lp-alt" id="about"><div className="lp-wrap lp-about">
        <div><span className="eyebrow">About Us</span><h2 className="lp-h2">About OffshoreAssure</h2></div>
        <div className="stack" style={{ gap: 14 }}>
          <p className="lp-sub" style={{ margin: 0 }}>OffshoreAssure is designed as a B2B compliance and assurance platform for organisations that outsource software development, testing, IT support and related services to offshore providers.</p>
          <p className="lp-sub" style={{ margin: 0 }}>Our focus is structured assurance: helping buyers bring supplier, compliance, contractual, data-transfer and delivery information into one connected workflow.</p>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn primary" data-act="lpstart" onClick={act.lpStart}>Start an Assessment</button>
            {goBtn('rules', 'btn outline', <><Icon n="scale" s={16} />View the rule base</>)}
          </div>
        </div>
      </div></section>
    </>
  );
}
