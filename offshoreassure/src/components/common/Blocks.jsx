/* Page-level building blocks shared by every stage: heading, tabs, trace panel, engine card, next button.
   data-act / data-v attributes are kept on buttons as stable test hooks for the QA scripts. */
import { Icon } from './Icon.jsx';
import { Rid } from './Badges.jsx';
import { ENGINE } from '../../lib/constants.js';
import { useAssessment } from '../../hooks/useAssessment.js';

export function PageHead({ eyebrow, title, lead, right }) {
  return (
    <div className="ph">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {right ? <div className="row">{right}</div> : null}
    </div>
  );
}

/* Collapsible "input → rule → result" execution trace. rows: [inputNode, ruleId, resultNode]. */
export function Trace({ title, rows, open }) {
  return (
    <details className="trace" open={open || undefined}>
      <summary>{title}<span className="note" style={{ fontWeight: 500 }}>input → rule → result</span></summary>
      <div className="trow h"><div>Input</div><div>Rule</div><div>Result</div></div>
      {rows.map((r, i) => <div className="trow" key={i}><div className="in">{r[0]}</div><div><Rid id={r[1]} /></div><div>{r[2]}</div></div>)}
    </details>
  );
}

export function EngineCard({ L, sub, inputs, rules, result }) {
  return (
    <div className="card">
      <div className="ch">
        <div className="row" style={{ gap: 12 }}><span className="eletter">{L}</span><div><h2>{ENGINE[L]}</h2><div className="sub">{sub}</div></div></div>
        <span className="flow3">Input <Icon n="arrow" s={12} /> Rule <Icon n="arrow" s={12} /> Result</span>
      </div>
      <div className="engine">
        <div><span className="eyebrow">Inputs</span><ul>{inputs.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><span className="eyebrow">Rules applied</span><ul>{rules.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><span className="eyebrow">Result</span>{result}</div>
      </div>
    </div>
  );
}

/* Current tab for a key, stored in prototype state so it survives refresh. */
export function useTab(key, list, def) {
  const { S } = useAssessment();
  return S.tab[key] || def || list[0][0];
}
export function Tabs({ k, list, cur, onSelect }) {
  const { act } = useAssessment();
  return (
    <div className="tabs" role="tablist">
      {list.map(([id, label, n]) => (
        <button key={id} className={'tab' + (cur === id ? ' on' : '')} role="tab" aria-selected={cur === id} data-act="tab" data-k={k} data-v={id} onClick={() => (onSelect ? onSelect(id) : act.setTab(k, id))}>
          {label}{n != null ? <span className="k">{n}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function GoButton({ v, className = 'btn primary', children, ...rest }) {
  const { act } = useAssessment();
  return <button className={className} data-act="go" data-v={v} onClick={() => act.go(v)} {...rest}>{children}</button>;
}
export function NextButton({ v, label }) {
  return <div className="row"><GoButton v={v}>{label} <Icon n="arrow" s={15} /></GoButton></div>;
}

export function Toast() {
  const { S } = useAssessment();
  return S._toast ? <div className="toast" role="status">{S._toast}</div> : null;
}
