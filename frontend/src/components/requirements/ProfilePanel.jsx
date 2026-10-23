import { useState } from 'react';
import { fmtTime } from '../../lib/format.js';
import { fmtBytes } from '../../lib/requirements.js';
import { Icon } from '../common/Icon.jsx';

const RESULT = { pass: ['b-sage', 'Pass'], fail: ['b-coral', 'Check'], unknown: ['b-amber', 'Unknown'] };

/* Stage 1 · Step 3 output: Requirement Profile (versioned snapshot), applicable controls, validation findings and the assessment timeline. */
export default function ProfilePanel({ profiles, timeline, catalogue, onCorrect }) {
  const [sel, setSel] = useState(profiles.length - 1);
  const p = profiles[Math.min(sel, profiles.length - 1)];
  if (!p) return null;
  const latest = sel >= profiles.length - 1;
  const applied = p.validationFindings.controls || [];
  const notApplied = catalogue.filter(c => !p.controlIds.includes(c.id));
  return (
    <section className="card prf" data-section="requirement-profile" aria-labelledby="prf-h">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Stage 1 · Step 3 · Saved to the evidence record</div>
          <h2 id="prf-h" className="prf-title">Requirement profile <span className="mono">v{p.version}</span>{latest ? <span className="b b-sage" style={{ marginLeft: 10 }}>Current</span> : <span className="b b-mute" style={{ marginLeft: 10 }}>Earlier version</span>}</h2>
          <div className="note">Saved {fmtTime(p.createdAt)} by {p.createdByEmail} · fingerprint <span className="mono">{p.snapshotSha256.slice(0, 16)}…</span></div>
          {p.changeReason ? <div className="note" style={{ marginTop: 4 }}>Correction: {p.changeReason}</div> : null}
        </div>
        <div className="row">
          {profiles.length > 1 ? <div className="seg" role="tablist" aria-label="Profile versions">{profiles.map((x, i) =>
            <button key={x.id} role="tab" aria-selected={i === sel} className={i === sel ? 'on' : ''} onClick={() => setSel(i)}>v{x.version}</button>)}</div> : null}
          {onCorrect && latest ? <button className="btn sm" data-act="correct" onClick={onCorrect}>Correct answers</button> : null}
        </div>
      </div>

      <div className="asr-block">
        <h3>Applicable assurance controls <span className="note">({applied.length} of {catalogue.length})</span></h3>
        <ul className="prf-controls">{applied.map(c => (
          <li key={c.id}><span className="rid">{c.id}</span><div><b>{c.name}</b>{c.buyerRequested ? <span className="b b-plum prf-req">Requested by buyer</span> : null}
            <span className="note">{c.reason}</span></div></li>))}</ul>
        {notApplied.length ? <p className="note" style={{ marginTop: 10 }}>Not applicable from these answers: {notApplied.map(c => `${c.id} ${c.name}`).join(' · ')}</p> : null}
      </div>

      <div className="asr-block">
        <h3>Validation findings</h3>
        <ul className="prf-checks">{p.validationFindings.checks.map(c => (
          <li key={c.check}><span className={'b ' + RESULT[c.result][0]}>{RESULT[c.result][1]}</span><span>{c.check}{c.detail?.length ? <span className="note"> — {c.detail.join('; ')}</span> : null}</span></li>))}</ul>
      </div>

      {p.missingInformation.length ? <div className="asr-block"><h3>Open gaps</h3><ul>{p.missingInformation.map(m => <li key={m.field}>{m.reason}</li>)}</ul></div> : null}

      <div className="asr-block">
        <h3>Source documents</h3>
        {p.sourceDocuments.length ? <ul className="prf-docs">{p.sourceDocuments.map(d => <li key={d.id}><Icon n="doc" s={15} /><b>{d.fileName}</b><span className="note">{fmtBytes(d.size)}</span><span className="mono note">SHA-256 {d.sha256}</span></li>)}</ul>
          : <p className="note" style={{ margin: 0 }}>No documents attached to this version.</p>}
      </div>

      <div className="asr-block">
        <h3>Rule packs <span className="note">({p.rulePackVersions[0]})</span></h3>
        <div className="row" style={{ gap: 6 }}>{p.rulePackIds.map(x => <span key={x} className="rid">{x}</span>)}</div>
      </div>

      <div className="asr-block">
        <h3>Assessment timeline</h3>
        <ol className="tl">{timeline.map((t, i) => (
          <li key={i} className={'tl-' + t.status}>
            <span className="tl-dot" aria-hidden="true" />
            <div><b>{t.step ? `Step ${t.step} · ` : `Stage ${t.stage} · `}{t.title}</b>
              <span className="note">{t.status === 'done' ? fmtTime(t.at) : t.status === 'next' ? 'Next' : 'Later stage'}</span></div>
          </li>))}</ol>
      </div>
    </section>
  );
}
