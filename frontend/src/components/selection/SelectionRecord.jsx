import { Link } from 'react-router-dom';
import { fmtTime } from '../../lib/format.js';
import { Icon } from '../common/Icon.jsx';
import { SELECTION_STATUS, SOURCE_LABEL } from '../../lib/selection.js';
import { StatusBadge } from './Candidates.jsx';
import { FitTable } from './FitChecks.jsx';

/* Step 9: the saved Vendor Selection Record (versioned, cannot be edited). */
export default function SelectionRecord({ st, changing, onChange }) {
  const cur = st.current;
  const approver = cur.approver ? (cur.approver.fullName || cur.approver.email) : '—';
  return (
    <section className="card vs-selected" data-section="selected-vendor">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Step 9 · Vendor Selection Record v{cur.recordVersion}</div>
          <h2 className="prf-title">{cur.vendor.name}</h2>
          <div className="note">Saved {fmtTime(cur.selectedAt)} by {cur.selectedByEmail} · approved by {approver} · fingerprint <span className="mono">{cur.snapshotSha256.slice(0, 16)}…</span></div>
        </div>
        <div className="row"><StatusBadge status={cur.status} labels={SELECTION_STATUS} />
          {!changing ? <button className="btn sm" data-act="change-vendor" onClick={onChange}>Change vendor</button> : null}</div>
      </div>
      <div className="asr-block">
        <dl className="kv vs-kv" data-section="record">
          <dt>Selection ID</dt><dd className="mono">{cur.id}</dd>
          <dt>Vendor ID</dt><dd className="mono">{cur.vendorId}</dd>
          <dt>Source</dt><dd>{SOURCE_LABEL[cur.source]}</dd>
          <dt>Decision</dt><dd>{cur.decision === 'SELECT' ? 'Select' : 'Select with conditions'}</dd>
          <dt>Vendor profile</dt><dd>v{cur.vendorProfileVersion}</dd>
          <dt>Comparison</dt><dd>{cur.candidates.length} candidate{cur.candidates.length === 1 ? '' : 's'}: {cur.candidates.map(c => c.name + (c.rank ? ` (#${c.rank})` : '')).join(', ')} · {cur.comparisonSha256 ? <span className="mono">{cur.comparisonSha256.slice(0, 12)}…</span> : null}</dd>
          <dt>Confirmed</dt><dd>{fmtTime(cur.confirmedAt)}</dd>
        </dl>
      </div>
      <div className="asr-block"><h3>Reason for the decision</h3><p style={{ margin: 0 }}>{cur.rationale}</p>
        {cur.exceptionReason ? <p className="note" style={{ marginTop: 8 }}>Exception accepted ({cur.exceptions.map(e => e.check).join(', ')}): {cur.exceptionReason}</p> : null}
        {cur.changeReason ? <p className="note" style={{ marginTop: 8 }}>Why the vendor changed: {cur.changeReason}</p> : null}</div>
      {cur.conditions.length ? <div className="asr-block"><h3>Conditions to clear</h3><ul>{cur.conditions.map(c => <li key={c}>{c}</li>)}</ul></div> : null}
      <details className="asr-block vs-details"><summary>Checks at the time of selection</summary><FitTable fit={cur.fit} /></details>
      {st.versions.length > 1 ? <div className="asr-block"><h3>Earlier records</h3><ul>{st.versions.slice(0, -1).reverse().map(v =>
        <li key={v.id}>v{v.recordVersion} · <b>{v.vendor.name}</b> · {fmtTime(v.selectedAt)} by {v.selectedByEmail}</li>)}</ul></div> : null}
      <div className="asr-block"><div className="rq-next" style={{ border: 0, padding: 0, background: 'none', boxShadow: 'none' }}><Icon n="clock" s={18} /><div>
        <b>Stage 2 is complete for this assessment. Next: Stage 3 — Compliance assessment.</b> <span className="note">"Selected" does not mean compliant or approved for live data access.</span>
        <div style={{ marginTop: 8 }}><Link className="btn primary sm" to={'/compliance/' + st.assessment.reference} data-act="go-compliance">Open compliance assessment</Link></div></div></div></div>
    </section>
  );
}
