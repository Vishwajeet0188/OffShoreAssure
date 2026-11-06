import { useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon } from '../common/Icon.jsx';
import { SELECTION_STATUS, SOURCE_LABEL, expectedStatus } from '../../lib/selection.js';
import { StatusBadge } from './Candidates.jsx';

/* Step 8: confirm the selected vendor. Inputs: vendor, selection source, decision, rationale, approver,
   exception reason and confirmation time (the Assessment ID comes from the address). */
export default function ConfirmSelection({ st, reference, me, changing, onCancel, onSaved, innerRef }) {
  const cur = st.current;
  const choices = st.candidates.filter(v => v.id !== cur?.vendorId);
  const [f, setF] = useState({
    vendorId: '',
    decision: '',
    rationale: '',
    approverId: me && st.approvers.some(a => a.id === me) ? me : '',
    exceptionReason: '',
    changeReason: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const cand = choices.find(v => v.id === f.vendorId);
  const status = cand ? expectedStatus(cand.fit) : null;
  const set = k => v => {
    setF(x => ({ ...x, [k]: v }));
    setErrors(x => ({ ...x, [k]: undefined }));
  };

  const submit = async e => {
    e.preventDefault();
    setErrors({});
    setMsg(null);
    const v = {};
    if (!cand) v.vendorId = 'Choose a vendor from the candidates.';
    if (!f.decision) v.decision = 'Choose your decision.';
    if (status === 'CONDITIONALLY_SELECTED' && f.decision === 'SELECT')
      v.decision = 'This vendor has open conditions. Choose "Select with conditions".';
    if (f.rationale.trim().length < 20) v.rationale = 'Explain the decision in at least 20 characters.';
    if (!f.approverId) v.approverId = 'Choose the approver.';
    if (cand?.fit.exceptions.length && f.exceptionReason.trim().length < 10)
      v.exceptionReason = 'Explain why you accept this (at least 10 characters).';
    if (cur && f.changeReason.trim().length < 5) v.changeReason = 'Say why the vendor is changing.';
    if (Object.keys(v).length) return setErrors(v);
    setBusy(true);
    try {
      const state = await api(`/assessments/${reference}/selection`, {
        method: 'POST',
        body: {
          vendorId: cand.id,
          selectionSource: cand.candidateSource,
          decision: f.decision,
          rationale: f.rationale,
          approverId: f.approverId,
          exceptionReason: f.exceptionReason,
          confirmedAt: new Date().toISOString(),
          ...(cur ? { changeReason: f.changeReason } : {}),
        },
      });
      onSaved(
        state,
        `${cand.name} is now the selected vendor (${SELECTION_STATUS[state.current.status][1].toLowerCase()}). The Vendor Selection Record is saved.`,
      );
    } catch (x) {
      setErrors(x.fields || {});
      setMsg({ text: x.message, reasons: x.body?.reasons });
    } finally {
      setBusy(false);
    }
  };

  const err = k => (errors[k] ? <span className="form-err">{errors[k]}</span> : null);
  return (
    <section className="card" data-section="confirm" ref={innerRef}>
      <div className="ch">
        <div>
          <h2>
            <span className="rq-num">8</span>{' '}
            {cur ? 'Change the selected vendor' : 'Confirm the selected vendor'}
          </h2>
          <div className="sub">
            "Selected" does not mean compliant or approved for live data access. Your decision is saved to the
            evidence record and cannot be edited later.
          </div>
        </div>
        {cur && changing ? (
          <button className="btn sm" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <form className="pad stack" onSubmit={submit} noValidate data-form="confirm">
        <fieldset className="vs-pick">
          <legend className="ql">Vendor</legend>
          {choices.map(v => {
            const s = expectedStatus(v.fit);
            return (
              <label
                key={v.id}
                className={
                  'vs-opt' + (s === 'SELECTION_BLOCKED' ? ' off' : '') + (f.vendorId === v.id ? ' on' : '')
                }
              >
                <input
                  type="radio"
                  name="vendor"
                  value={v.id}
                  disabled={s === 'SELECTION_BLOCKED'}
                  checked={f.vendorId === v.id}
                  onChange={() => {
                    setF(x => ({
                      ...x,
                      vendorId: v.id,
                      decision: s === 'CONDITIONALLY_SELECTED' ? 'SELECT_WITH_CONDITIONS' : x.decision,
                    }));
                    setErrors({});
                    setMsg(null);
                  }}
                />
                <span>
                  <b>{v.name}</b>{' '}
                  <span className="note">
                    {SOURCE_LABEL[v.candidateSource]}
                    {v.rank ? ` · rank ${v.rank}` : ''}
                  </span>
                </span>
                <StatusBadge status={s} labels={SELECTION_STATUS} />
              </label>
            );
          })}
          {!choices.length ? (
            <p className="note" style={{ margin: 0 }}>
              Add a vendor first (step 5).
            </p>
          ) : null}
          {err('vendorId')}
        </fieldset>

        {cand && cand.fit.exceptions.length ? (
          <div className="rq-flag warning vs-accept">
            <Icon n="alert" s={16} />
            <div>
              <b>{cand.name} does not meet part of your requirement:</b>
              <ul>
                {cand.fit.exceptions.map(x => (
                  <li key={x.id}>
                    {x.check}: {x.detail}
                  </li>
                ))}
              </ul>
              <div className="field">
                <label htmlFor="vs-exception">Exception reason</label>
                <textarea
                  id="vs-exception"
                  rows={2}
                  maxLength={1000}
                  value={f.exceptionReason}
                  onChange={e => set('exceptionReason')(e.target.value)}
                  aria-invalid={!!errors.exceptionReason}
                />
                {err('exceptionReason')}
              </div>
            </div>
          </div>
        ) : null}

        <fieldset className="vs-pick">
          <legend className="ql">Decision</legend>
          <div className="seg rq-seg" role="radiogroup" aria-label="Decision">
            {[
              ['SELECT', 'Select'],
              ['SELECT_WITH_CONDITIONS', 'Select with conditions'],
            ].map(([k, label]) => (
              <button
                type="button"
                role="radio"
                key={k}
                aria-checked={f.decision === k}
                className={f.decision === k ? 'on' : ''}
                data-v={k}
                disabled={k === 'SELECT' && status === 'CONDITIONALLY_SELECTED'}
                onClick={() => set('decision')(k)}
              >
                {label}
              </button>
            ))}
          </div>
          {status === 'CONDITIONALLY_SELECTED' ? (
            <span className="note">
              Open conditions are saved with the selection and followed up in Stage 3.
            </span>
          ) : null}
          {err('decision')}
        </fieldset>

        <div className="form">
          <div className="field rq-field">
            <label htmlFor="vs-approver">Buyer approver</label>
            <select
              id="vs-approver"
              value={f.approverId}
              onChange={e => set('approverId')(e.target.value)}
              aria-invalid={!!errors.approverId}
            >
              <option value="">Choose…</option>
              {st.approvers.map(a => (
                <option key={a.id} value={a.id}>
                  {a.fullName || a.email}
                  {a.owner ? ' (owner)' : ''}
                </option>
              ))}
            </select>
            {errors.approverId ? (
              err('approverId')
            ) : (
              <span className="note">
                For high or critical services the approver must be an organisation owner.
              </span>
            )}
          </div>
          <div className="field rq-field full">
            <label htmlFor="vs-rationale">Reason for the decision</label>
            <textarea
              id="vs-rationale"
              rows={3}
              maxLength={2000}
              value={f.rationale}
              aria-invalid={!!errors.rationale}
              onChange={e => set('rationale')(e.target.value)}
              placeholder="For example: best service fit and delivery from our preferred country; references checked."
            />
            {errors.rationale ? (
              err('rationale')
            ) : (
              <span className="note">At least 20 characters. Shown to auditors in the evidence record.</span>
            )}
          </div>
          {cur ? (
            <div className="field rq-field full">
              <label htmlFor="vs-change">Why is the vendor changing?</label>
              <input
                type="text"
                id="vs-change"
                maxLength={500}
                value={f.changeReason}
                aria-invalid={!!errors.changeReason}
                onChange={e => set('changeReason')(e.target.value)}
              />
              {err('changeReason')}
            </div>
          ) : null}
        </div>
        {msg ? (
          <div className="rq-flag warning" role="alert">
            <Icon n="alert" s={16} />
            <div>
              <b>{msg.text}</b>
            </div>
          </div>
        ) : null}
        <div>
          <button
            className="btn primary"
            type="submit"
            disabled={busy || !!st.blocked}
            data-act="confirm-vendor"
          >
            {busy ? 'Saving…' : cur ? 'Save new selection' : 'Confirm vendor'}
          </button>
        </div>
      </form>
    </section>
  );
}
