import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { fmtBytes } from '../lib/requirements.js';
import { serviceLabel } from '../lib/assessments.js';
import { ratingTone } from '../lib/risks.js';
import {
  EVENT_WORD,
  RESIDUAL_TONE,
  RESIDUAL_WORD,
  STATUS_TONE,
  actionFileUrl,
  isOverdue,
  uploadActionFile,
} from '../lib/remediation.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';
import { RiskGrid } from './Risks.jsx';

const STEPS = [
  [33, 'Approve actions'],
  [34, 'Request from vendor'],
  [35, 'Vendor responds'],
  [36, 'Re-check'],
  [37, 'History saved'],
  [38, 'Status'],
];
const RATING_WORD = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', NONE: 'None' };

/* Stage 8 landing page: every assessment and the state of its actions. */
export function RemediationList() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/assessments')
      .then(result => setAssessments(result.assessments))
      .catch(err => setError(err.message));
  }, []);

  return (
    <>
      <PageHead
        eyebrow="Buyer · Stage 8 · Remediation"
        title="Remediation"
        lead="Turn each risk into an action for you or the vendor, check the proof, and watch the remaining risk come down."
      />
      <div className="card" data-section="remediation-list">
        {error ? <p className="form-err pad">{error}</p> : null}
        {!assessments ? (
          <Loading pad />
        ) : assessments.length === 0 ? (
          <p className="note pad">
            No assessments yet. Start with{' '}
            <Link className="link" to="/requirements">
              Stage 1 · Requirement
            </Link>
            .
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Service</th>
                  <th>Vendor</th>
                  <th>Actions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr
                    key={assessment.reference}
                    className="click"
                    onClick={() => navigate('/remediation/' + assessment.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/remediation/' + assessment.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      <PlanStatus assessment={assessment} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="link">
                        Open <Icon n="arrow" s={13} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function PlanStatus({ assessment }) {
  const plan = assessment.remediation;
  if (plan) {
    if (!plan.open) return <span className="b b-sage">All {plan.actions} done</span>;
    return (
      <span className={'b ' + (plan.awaitingReview ? 'b-amber' : 'b-plum')}>
        {plan.open} open{plan.awaitingReview ? ` · ${plan.awaitingReview} to review` : ''} · {plan.closed}{' '}
        done
      </span>
    );
  }
  if (assessment.risks) return <span className="muted">Ready to plan</span>;
  return <span className="muted">Waiting for Stage 7</span>;
}

/* Stage 8 for one assessment. */
export default function Remediation() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(
    () =>
      api(`/assessments/${ref}/remediation`)
        .then(setState)
        .catch(err => setError(err.message)),
    [ref],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Every change returns the new state; the message tells the person what happened.
  async function act(key, fn, okText) {
    setBusy(key);
    setMsg(null);
    try {
      const next = await fn();
      if (next?.actions) setState(next);
      if (okText) setMsg({ tone: 'ok', text: okText });
      return true;
    } catch (err) {
      setMsg({ tone: 'err', text: err.message });
      return false;
    } finally {
      setBusy('');
    }
  }

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;

  const proposed = state.actions.filter(a => a.status === 'PROPOSED');
  const active = state.actions.filter(a => a.status !== 'PROPOSED');
  const everDecided = active.length > 0;
  const done = n =>
    n === 33
      ? everDecided
      : n === 34
        ? active.some(a => a.owner === 'vendor')
        : n === 35
          ? active.some(a => a.submittedAt && a.owner === 'vendor')
          : state.snapshots.length > 0;
  const allDone =
    state.actions.length > 0 &&
    state.residual.totals.open + state.residual.totals.awaitingReview + state.residual.totals.proposed === 0;

  return (
    <div className="vs">
      <Link
        className="link"
        to="/remediation"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        ← Remediation
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 8 · Remediation · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Vendor: ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 8 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={done(number) ? 'done' : ''}>
            <span className="journey-n">{number}</span>
            {title}
          </li>
        ))}
      </ol>

      {msg ? (
        <div className={'rq-msg ' + msg.tone} role="status">
          <b>{msg.text}</b>
        </div>
      ) : null}

      {state.blocked ? (
        <section className="card pad stack" data-section="remediation-blocked">
          <h2 style={{ margin: 0 }}>Plan the actions</h2>
          <div className="rq-flag warning">
            <Icon n="alert" s={16} />
            <span>
              {state.blocked}{' '}
              <Link className="link" to={'/risks/' + ref}>
                Open risk identification
              </Link>
            </span>
          </div>
        </section>
      ) : null}

      {state.canPlan ? (
        <section className="card pad stack" data-section="remediation-plan">
          <h2 style={{ margin: 0 }}>
            {state.actions.length
              ? 'The risk register has new risks'
              : 'Step 33 · Turn the risks into actions'}
          </h2>
          <p style={{ margin: 0 }}>
            OffshoreAssure proposes one action per risk and side: what the vendor must fix or prove, and what
            you must decide or change in the contract. Each gets a due date from the risk's rating (
            {Object.entries(state.dueDays)
              .map(([r, d]) => `${RATING_WORD[r].toLowerCase()} ${d} days`)
              .join(', ')}
            ).
          </p>
          <div>
            <button
              className="btn primary"
              disabled={busy === 'plan'}
              data-act="plan-actions"
              onClick={() =>
                act(
                  'plan',
                  () => api(`/assessments/${ref}/remediation/plan`, { method: 'POST' }),
                  'Actions proposed. Approve them below.',
                )
              }
            >
              {busy === 'plan'
                ? 'Proposing…'
                : `Propose ${state.newProposals} action${state.newProposals === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>
      ) : null}

      {state.residual && state.actions.length ? <StatusCard state={state} /> : null}

      {proposed.length ? (
        <DecisionsCard
          key={proposed.map(a => a.number).join(',')}
          reference={ref}
          actions={proposed}
          hasVendor={!!state.vendor}
          busy={busy}
          act={act}
        />
      ) : null}

      {active.length ? <ActionsCard reference={ref} actions={active} busy={busy} act={act} /> : null}

      {state.residual && state.actions.length ? (
        <ResidualCard residual={state.residual} snapshots={state.snapshots} />
      ) : null}

      {allDone ? (
        <div className="card rq-next">
          <Icon n="clock" s={20} />
          <div>
            <b>Stage 8 is complete for this assessment. Next: Stage 9 — Monitoring and audit.</b>{' '}
            <span className="note">
              Generate the evidence-backed report and keep monitoring renewals and changes.
            </span>
          </div>
          <Link className="btn primary sm" to={'/monitoring/' + ref} data-act="go-monitoring">
            Open monitoring and audit
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* Step 38: updated status and outstanding actions. */
function StatusCard({ state }) {
  const t = state.residual.totals;
  const figures = [
    ['Outstanding', t.open + t.proposed, t.open ? 'warn' : ''],
    ['Waiting your review', t.awaitingReview, ''],
    ['Overdue', t.overdue, t.overdue ? 'warn' : ''],
    ['Closed or accepted', t.closed + t.accepted, ''],
  ];
  return (
    <section className="card cp-result" data-section="remediation-status">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Step 38 · Updated status</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            What is still open
          </h2>
          <div className="note">
            {t.actions} actions from risk register v{state.planVersion} · {t.mitigatedRisks} of{' '}
            {state.residual.risks.length} risks fixed
          </div>
        </div>
        <span className={'b ' + ratingTone(state.residual.overall.rating)}>
          Remaining highest: {state.residual.overall.label}
        </span>
      </div>
      <div className="ca-figures">
        {figures.map(([label, value, tone]) => (
          <div key={label} className={tone}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="asr-block rk-grid-wrap">
        <h3>Remaining risk · likelihood × impact</h3>
        <RiskGrid grid={state.residual.grid} />
      </div>
      {state.residual.recheck.length ? (
        <div className="asr-block" data-section="recheck">
          <h3>Step 36 · Checks to run again</h3>
          <p className="note" style={{ marginTop: 0 }}>
            Closed actions changed things that earlier stages checked. Run these again so the record matches:
          </p>
          <ul>
            {state.residual.recheck.map(r => (
              <li key={r.stage}>{r.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {state.residual.note}
      </p>
    </section>
  );
}

/* Step 33: approve and assign each proposed action, or accept the risk. */
function DecisionsCard({ reference, actions, hasVendor, busy, act }) {
  const [choice, setChoice] = useState(() =>
    Object.fromEntries(
      actions.map(a => [a.number, { decision: 'assign', owner: a.owner, dueOn: a.suggestedDueOn, note: '' }]),
    ),
  );
  const set = (n, patch) => setChoice(c => ({ ...c, [n]: { ...c[n], ...patch } }));

  async function submit() {
    const decisions = actions
      .filter(a => choice[a.number]?.decision !== 'later')
      .map(a => {
        const c = choice[a.number];
        return c.decision === 'accept'
          ? { number: a.number, decision: 'accept', note: c.note }
          : { number: a.number, decision: 'assign', owner: c.owner, dueOn: c.dueOn, note: c.note };
      });
    if (!decisions.length) return;
    const assigned = decisions.filter(d => d.decision === 'assign').length;
    await act(
      'decide',
      () => api(`/assessments/${reference}/remediation/decisions`, { method: 'POST', body: { decisions } }),
      `${assigned} action${assigned === 1 ? '' : 's'} assigned${decisions.length > assigned ? `, ${decisions.length - assigned} risk${decisions.length - assigned === 1 ? '' : 's'} accepted` : ''}. The vendor has been emailed its actions.`,
    );
  }

  return (
    <section className="card" data-section="remediation-decisions">
      <div className="ch">
        <div>
          <h2>Step 33 · Approve or assign actions</h2>
          <div className="sub">
            Check who does each action and by when. Accepting a risk instead needs a reason and is kept in the
            record.
          </div>
        </div>
        <span className="note">{actions.length}</span>
      </div>
      <div className="rm-decisions">
        {actions.map(a => {
          const c = choice[a.number];
          return (
            <div key={a.number} className="rm-decision" data-action={a.code}>
              <div className="rm-decision-head">
                <span className="rid">{a.code}</span>
                <b>{a.title}</b>
                <span className={'b ' + ratingTone(a.rating)}>
                  {RATING_WORD[a.rating]} · {a.riskId}
                </span>
              </div>
              <ul className="rm-requests">
                {a.requests.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="rm-decision-form">
                <label>
                  Decision
                  <select
                    value={c.decision}
                    onChange={e => set(a.number, { decision: e.target.value })}
                    data-field="decision"
                  >
                    <option value="assign">Approve and assign</option>
                    <option value="accept">Accept the risk</option>
                    <option value="later">Decide later</option>
                  </select>
                </label>
                {c.decision === 'assign' ? (
                  <>
                    <label>
                      Who does it
                      <select
                        value={c.owner}
                        onChange={e => set(a.number, { owner: e.target.value })}
                        data-field="owner"
                      >
                        <option value="vendor" disabled={!hasVendor}>
                          The vendor
                        </option>
                        <option value="buyer">You (the buyer)</option>
                      </select>
                    </label>
                    <label>
                      Due
                      <input
                        type="date"
                        value={c.dueOn}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={e => set(a.number, { dueOn: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}
                {c.decision !== 'later' ? (
                  <label className="rm-note">
                    {c.decision === 'accept' ? 'Why you accept the risk' : 'Note (optional)'}
                    <input
                      type="text"
                      maxLength={1000}
                      value={c.note}
                      onChange={e => set(a.number, { note: e.target.value })}
                      data-field="note"
                      placeholder={
                        c.decision === 'accept'
                          ? 'At least 10 characters'
                          : 'e.g. include the country of each sub-processor'
                      }
                    />
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pad">
        <button
          className="btn primary"
          disabled={busy === 'decide'}
          onClick={submit}
          data-act="approve-actions"
        >
          {busy === 'decide' ? 'Saving…' : 'Save decisions'}
        </button>
      </div>
    </section>
  );
}

/* Steps 34–36: each assigned action, its proof and history; review a vendor's response or finish your own action. */
function ActionsCard({ reference, actions, busy, act }) {
  const [openIds, setOpenIds] = useState(() =>
    Object.fromEntries(actions.filter(a => a.status === 'SUBMITTED').map(a => [a.number, true])),
  );
  const toggle = n => setOpenIds(o => ({ ...o, [n]: !o[n] }));
  return (
    <section className="card" data-section="remediation-actions">
      <div className="ch">
        <div>
          <h2>Steps 34–36 · Actions</h2>
          <div className="sub">
            Open an action to see what was asked, the response, the documents and every change.
          </div>
        </div>
        <span className="note">{actions.length}</span>
      </div>
      <div className="cp-controls">
        {actions.map(a => {
          const isOpen = !!openIds[a.number];
          const overdue = isOverdue(a);
          return (
            <div
              key={a.number}
              className={'cp-ctl' + (isOpen ? ' open' : '')}
              data-action={a.code}
              data-status={a.status}
            >
              <button
                className="cp-ctl-h rm-action-h"
                onClick={() => toggle(a.number)}
                aria-expanded={isOpen}
              >
                <span className="rid">{a.code}</span>
                <b>{a.title}</b>
                <span className="note">
                  {a.owner === 'vendor' ? 'Vendor' : 'You'}
                  {a.dueOn ? ` · due ${a.dueOn}` : ''}
                  {overdue ? ' · overdue' : ''}
                </span>
                <span className={'b ' + (overdue ? 'b-coral' : STATUS_TONE[a.status])}>
                  {overdue ? 'Overdue' : a.statusLabel}
                </span>
              </button>
              {isOpen ? <ActionBody reference={reference} a={a} busy={busy} act={act} /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionBody({ reference, a, busy, act }) {
  const base = `/assessments/${reference}/remediation/actions/${a.number}`;
  const [note, setNote] = useState('');
  const [response, setResponse] = useState('');
  const mine = a.owner === 'buyer' && ['OPEN', 'RETURNED'].includes(a.status);

  async function upload(file) {
    if (!file) return;
    await act('up' + a.number, () => uploadActionFile(base, file), `${file.name} added to ${a.code}.`);
  }

  return (
    <div className="cp-ctl-b stack">
      <div>
        <b>What is needed</b>
        <ul className="rm-requests">
          {a.requests.map(r => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {a.needsDocument ? <span className="note">A document is needed as proof.</span> : null}
      </div>
      {a.buyerNote ? (
        <p className="rm-quote">
          <b>
            {a.status === 'RISK_ACCEPTED'
              ? 'Why the risk was accepted'
              : a.status === 'RETURNED'
                ? 'What is still missing'
                : 'Your note'}
            :
          </b>{' '}
          {a.buyerNote}
        </p>
      ) : null}
      {a.response ? (
        <p className="rm-quote">
          <b>Response:</b> {a.response}
        </p>
      ) : null}
      {a.evidence.length ? (
        <div>
          <b>Documents</b>
          <ul className="rm-files">
            {a.evidence.map(e => (
              <li key={e.id}>
                <a className="link" href={actionFileUrl(base, e.id)}>
                  {e.fileName}
                </a>{' '}
                <span className="note">
                  {fmtBytes(e.size)} · {fmtTime(e.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.status === 'SUBMITTED' ? (
        <div className="rm-review" data-section="review">
          <b>Step 36 · Review the vendor's response</b>
          <input
            type="text"
            maxLength={1000}
            placeholder="If returning: what is still missing"
            value={note}
            onChange={e => setNote(e.target.value)}
            aria-label="Review note"
          />
          <div className="row">
            <button
              className="btn primary sm"
              disabled={busy === 'rv' + a.number}
              data-act="close-action"
              onClick={() =>
                act(
                  'rv' + a.number,
                  () => api(`${base}/review`, { method: 'POST', body: { outcome: 'close', note } }),
                  `${a.code} closed. The remaining risk has been re-checked.`,
                )
              }
            >
              Close the action
            </button>
            <button
              className="btn sm"
              disabled={busy === 'rv' + a.number}
              data-act="return-action"
              onClick={() =>
                act(
                  'rv' + a.number,
                  () => api(`${base}/review`, { method: 'POST', body: { outcome: 'return', note } }),
                  `${a.code} returned to the vendor.`,
                )
              }
            >
              Return for more
            </button>
          </div>
        </div>
      ) : null}

      {mine ? (
        <div className="rm-review" data-section="own-action">
          <b>Complete your action</b>
          <label className="btn sm rm-file">
            Add a document
            <input
              type="file"
              hidden
              onChange={e => {
                upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <textarea
            rows={2}
            maxLength={3000}
            placeholder="What you did (at least 10 characters)"
            value={response}
            onChange={e => setResponse(e.target.value)}
            aria-label="What you did"
          />
          <div>
            <button
              className="btn primary sm"
              disabled={busy === 'done' + a.number}
              data-act="mark-done"
              onClick={() =>
                act(
                  'done' + a.number,
                  () => api(`${base}/done`, { method: 'POST', body: { response } }),
                  `${a.code} done. The remaining risk has been re-checked.`,
                )
              }
            >
              Mark as done
            </button>
          </div>
        </div>
      ) : null}

      <details className="vs-details">
        <summary>History ({a.history.length})</summary>
        <ul className="rm-history">
          {a.history.map((h, i) => (
            <li key={i}>
              <span className="mono note">{fmtTime(h.at)}</span> <b>{EVENT_WORD[h.event] || h.event}</b>{' '}
              <span className="note">· {h.by}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/* Steps 36–37: the remaining risk per register entry, and the saved snapshots. */
function ResidualCard({ residual, snapshots }) {
  return (
    <section className="card" data-section="remediation-residual">
      <div className="ch">
        <div>
          <h2>Steps 36–37 · Remaining risk and history</h2>
          <div className="sub">
            Each closed action lowers the likelihood of its risk. Every change is saved as a locked snapshot.
          </div>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Risk</th>
              <th>Before</th>
              <th>Now</th>
              <th>Status</th>
              <th>Actions done</th>
            </tr>
          </thead>
          <tbody>
            {residual.risks.map(r => (
              <tr key={r.id} data-risk={r.theme}>
                <td>
                  <span className="rid">{r.id}</span> <b>{r.title}</b>
                </td>
                <td>
                  <span className={'b ' + ratingTone(r.original.rating)}>
                    {r.original.score} · {RATING_WORD[r.original.rating]}
                  </span>
                </td>
                <td>
                  <span className={'b ' + ratingTone(r.status === 'MITIGATED' ? 'LOW' : r.rating)}>
                    {r.score} · {RATING_WORD[r.rating]}
                  </span>
                </td>
                <td>
                  <span className={'b ' + RESIDUAL_TONE[r.status]}>{RESIDUAL_WORD[r.status]}</span>
                </td>
                <td>
                  {r.closedActions} / {r.actions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshots.length ? (
        <div className="asr-block">
          <h3>Saved snapshots</h3>
          <ul className="rm-history">
            {snapshots.map(s => (
              <li key={s.version}>
                <b>v{s.version}</b> · {fmtTime(s.createdAt)} · {s.reason} · remaining highest{' '}
                {s.overall.label.toLowerCase()}{' '}
                <span className="mono note">{s.snapshotSha256.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
