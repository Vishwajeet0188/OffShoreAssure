import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime, fmtDate } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import {
  RATING_TONE,
  STATUS,
  CONTROL_STATUS,
  PROCESSING_TONE,
  PROCESSING_SHORT,
  ROLE_LABEL,
  TYPE_LABEL,
  gapKind,
  ratingBadge,
  answerText,
  buyerEvidenceUrl,
} from '../lib/compliance.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';
import CountryPicker from '../components/requirements/CountryPicker.jsx';

const BackArrow = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

/* Stage 3 landing: assessments of the organisation and where each one is in the compliance assessment. */
export function ComplianceList() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/assessments')
      .then(r => setList(r.assessments))
      .catch(x => setErr(x.message));
  }, []);
  return (
    <>
      <PageHead
        eyebrow="Buyer · Stage 3 · Compliance assessment"
        title="Compliance assessment"
        lead="Start the assessment for the selected vendor, collect its answers and evidence, and see provisional findings with the missing items."
      />
      <div className="card" data-section="compliance-list">
        {err ? (
          <p className="form-err" style={{ padding: '0 22px' }}>
            {err}
          </p>
        ) : null}
        {!list ? (
          <Loading pad />
        ) : !list.length ? (
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
                  <th>Compliance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map(a => (
                  <tr
                    key={a.reference}
                    className="click"
                    onClick={() => navigate('/compliance/' + a.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/compliance/' + a.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{a.reference}</b>
                      </Link>
                      <div className="note">{a.title}</div>
                    </td>
                    <td>{serviceLabel(a.serviceCode)}</td>
                    <td>{a.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      {a.compliance ? (
                        <Badge
                          s={(STATUS[a.compliance.status] || STATUS.in_progress)[0]}
                          label={
                            a.compliance.status === 'submitted'
                              ? `${a.compliance.overall}/100 · ${STATUS.submitted[1]}`
                              : (STATUS[a.compliance.status] || STATUS.in_progress)[1]
                          }
                        />
                      ) : (
                        <span className="muted">
                          {a.selectedVendor ? 'Not started' : 'Select a vendor first'}
                        </span>
                      )}
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

/* Overall score as a ring (one value, single hue, the number in the middle). */
function ScoreRing({ score, rating }) {
  const r = 52,
    c = 2 * Math.PI * r;
  return (
    <div className="cp-ring" role="img" aria-label={`Provisional score ${score} out of 100, ${rating.label}`}>
      <svg viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--line-2)" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={`var(--${RATING_TONE[rating.code] || 'amber'})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div>
        <b>{score}</b>
        <span>/ 100</span>
      </div>
    </div>
  );
}

/* Score by control family: horizontal bars, labelled directly, one hue. */
function AreaBars({ areas }) {
  return (
    <ul className="cp-bars" data-section="area-scores">
      {areas.map(a => (
        <li key={a.id} title={`${a.label}: ${a.score}/100 (${a.controls.join(', ')})`}>
          <span className="cp-bar-l">{a.label}</span>
          <span className="cp-bar-t">
            <i style={{ width: Math.max(a.score, 2) + '%' }} className={a.score < 60 ? 'low' : ''} />
          </span>
          <b className="mono">{a.score}</b>
        </li>
      ))}
    </ul>
  );
}

/* Step 10: the 8 start fields. Assessment ID and vendor ID come from the assessment and the selection. */
function StartForm({ st, onStarted }) {
  const s = st.start;
  const [f, setF] = useState(() => ({
    ...s.defaults,
    reviewerId: s.reviewers[0]?.id || '',
    targetCompletionOn: '',
  }));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onStarted(
        await api(`/assessments/${st.assessment.reference}/compliance`, {
          method: 'POST',
          body: { assessmentId: st.assessment.id, vendorId: st.vendor.id, ...f },
        }),
      );
    } catch (x) {
      setErr({ text: x.message, field: x.body?.field, problems: x.body?.problems });
    } finally {
      setBusy(false);
    }
  };
  const bad = k => (err?.field === k ? 'true' : undefined);
  return (
    <form className="stack" onSubmit={submit} noValidate data-form="compliance-start">
      <div className="cp-receives">
        <b>The engine receives</b>
        <span>
          the requirement ({st.controls} Stage 1 controls), the selected vendor ({st.vendor.name},{' '}
          {st.vendor.source === 'BUYER_PROVIDED' ? 'added by you' : 'directory'}), service criticality (
          {s.criticality || '—'}), the countries and the initial risk classification ({s.riskTier}).
        </span>
        {s.fuller ? (
          <span className="b b-amber">No previously verified evidence: fuller questionnaire</span>
        ) : null}
      </div>
      <div className="form">
        <div className="field">
          <label htmlFor="s-aid">Assessment ID</label>
          <input id="s-aid" type="text" className="mono" value={st.assessment.id} readOnly />
        </div>
        <div className="field">
          <label htmlFor="s-vid">Vendor ID · {st.vendor.name}</label>
          <input id="s-vid" type="text" className="mono" value={st.vendor.id} readOnly />
        </div>
        <div className="field">
          <label htmlFor="s-type">Assessment type</label>
          <select
            id="s-type"
            value={f.assessmentType}
            onChange={e => set('assessmentType')(e.target.value)}
            aria-invalid={bad('assessmentType')}
          >
            {s.assessmentTypes.map(t => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-role">Vendor processing role</label>
          <select
            id="s-role"
            value={f.processingRole}
            onChange={e => set('processingRole')(e.target.value)}
            aria-invalid={bad('processingRole')}
          >
            {s.processingRoles.map(t => (
              <option key={t} value={t}>
                {ROLE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor="s-scope">Service scope</label>
          <textarea
            id="s-scope"
            rows={3}
            maxLength={2000}
            value={f.serviceScope}
            onChange={e => set('serviceScope')(e.target.value)}
            aria-invalid={bad('serviceScope')}
          />
        </div>
        <div className="field full">
          <label htmlFor="s-juris">Relevant jurisdictions</label>
          <CountryPicker
            id="s-juris"
            multi
            value={f.jurisdictions}
            onChange={set('jurisdictions')}
            countries={st.countries}
            invalid={bad('jurisdictions')}
          />
        </div>
        <div className="field">
          <label htmlFor="s-rev">Assigned reviewer</label>
          <select
            id="s-rev"
            value={f.reviewerId}
            onChange={e => set('reviewerId')(e.target.value)}
            aria-invalid={bad('reviewerId')}
          >
            <option value="">Choose…</option>
            {s.reviewers.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.membership})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-target">
            Target completion date <span className="muted">(optional)</span>
          </label>
          <input
            id="s-target"
            type="date"
            value={f.targetCompletionOn}
            onChange={e => set('targetCompletionOn')(e.target.value)}
            aria-invalid={bad('targetCompletionOn')}
          />
        </div>
      </div>
      <div className={'rq-flag ' + (s.invitation.ready ? 'info' : 'warning')} data-section="invitation">
        <Icon n={s.invitation.ready ? 'mail' : 'alert'} s={16} />
        <span>
          <b>Vendor invitation readiness:</b> {s.invitation.text}
        </span>
      </div>
      {!s.identity.ok ? (
        <div className="rq-flag warning">
          <Icon n="alert" s={16} />
          <span>{s.identity.problems.join(' ')}</span>
        </div>
      ) : null}
      {err ? (
        <div className="rq-msg err" role="alert">
          <b>{err.text}</b>
        </div>
      ) : null}
      <ul className="cp-facts">
        <li>
          <Icon n="clock" s={15} />
          The vendor has 14 days to reply (or until the target date, if sooner)
        </li>
        <li>
          <Icon n="shield" s={15} />
          Documents are encrypted; the vendor’s link expires and can be withdrawn
        </li>
        <li>
          <Icon n="alert" s={15} />
          After starting, the vendor can no longer be changed
        </li>
      </ul>
      <div>
        <button className="btn primary" disabled={busy || !s.identity.ok} data-act="start-compliance">
          {busy ? 'Starting…' : 'Start compliance assessment'}
        </button>
      </div>
    </form>
  );
}

/* Step 11 output: the questionnaire and evidence checklist, by control family. */
function QuestionnairePreview({ qn, st }) {
  const families = [...new Set(qn.controls.map(c => c.family))];
  return (
    <details className="cp-qpreview">
      <summary>
        See the questionnaire ({qn.controls.length} of {qn.libraryCount} controls apply ·{' '}
        {qn.notApplicable.length} not applicable)
      </summary>
      {families.map(f => (
        <div key={f} className="cp-qc">
          <b>{st.families[f]}</b>
          <ul>
            {qn.controls
              .filter(c => c.family === f)
              .map(c => (
                <li key={c.id}>
                  <span className="rid">{c.id}</span> {c.question}{' '}
                  <span className="note">
                    · {st.answerTypes[c.answerType].label} · {st.levels[c.level]}
                    {c.critical ? ' · critical' : ''}
                    {c.evidence.length
                      ? ' · evidence: ' + c.evidence.map(t => st.documentTypes[t]).join(' or ')
                      : ''}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {qn.notApplicable.length ? (
        <div className="cp-qc">
          <b>Not applicable (different from unanswered)</b>
          <ul>
            {qn.notApplicable.map(c => (
              <li key={c.id}>
                <span className="rid">{c.id}</span> {c.question}{' '}
                <span className="note">· rule {c.applicability.rule} not met</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

/* Step 12: the request, its token status and the deliveries; withdraw or issue again. */
function RequestPanel({ st, act, busy }) {
  const q = st.request;
  if (!q) return null;
  const access = {
    open: ['b-sage', 'Link active'],
    expired: ['b-amber', 'Link expired'],
    revoked: ['b-coral', 'Access withdrawn'],
  }[q.access];
  return (
    <div className="asr-block" data-section="compliance-request">
      <h3>
        Request to the vendor <span className={'b ' + access[0]}>{access[1]}</span>
      </h3>
      <dl className="cp-dl">
        <dt>Request ID</dt>
        <dd className="mono">{q.id}</dd>
        <dt>Kind</dt>
        <dd>
          {q.kind === 'initial' ? 'First request' : q.kind === 'reissue' ? 'Issued again' : 'Clarification'}
        </dd>
        <dt>Contact</dt>
        <dd>{q.contactEmail || '—'}</dd>
        <dt>Questionnaire</dt>
        <dd>
          v{q.questionnaireVersion} · {q.controlIds.length} control{q.controlIds.length === 1 ? '' : 's'}
        </dd>
        <dt>Due date</dt>
        <dd>{fmtDate(q.dueOn)}</dd>
        <dt>Link expires</dt>
        <dd>{fmtTime(q.expiresAt)}</dd>
        <dt>Delivery</dt>
        <dd>
          {q.deliveries.length
            ? q.deliveries
                .map(d => `${d.to}: ${d.status === 'SENT' ? 'sent' : 'failed'} ${fmtTime(d.at)}`)
                .join(' · ')
            : 'Not recorded'}
        </dd>
      </dl>
      {q.message ? <p className="note">Message: “{q.message}”</p> : null}
      <details>
        <summary className="link">Documents requested ({q.requestedDocuments.length})</summary>
        <ul>
          {q.requestedDocuments.map(d => (
            <li key={d.type}>
              {d.label}
              <span className="note">
                {' '}
                · for {d.controls.join(', ')}
                {d.expires ? ' · expiry date needed' : ''}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {st.canReview && st.compliance.status !== 'submitted' ? (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          {q.access !== 'revoked' ? (
            <button
              className="btn sm"
              disabled={busy}
              onClick={() => act('request/revoke')}
              data-act="revoke-request"
            >
              Withdraw access
            </button>
          ) : null}
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => act('request/reissue', {})}
            data-act="reissue-request"
          >
            Issue a new link
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* Step 16: the illustrative "Vendor assurance" box and the 10 dashboard fields. */
function AssuranceBox({ st, r }) {
  const n = r.counts;
  const outstanding = r.missingEvidence.slice(0, 6);
  return (
    <section className="card cp-result" data-section="compliance-result">
      <div className="asr-head">
        <div>
          <div className="eyebrow">
            Vendor assurance · provisional · ComplianceAssessmentSnapshot v{r.snapshotVersion}
          </div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            {st.vendor.name}
          </h2>
          <div className="note">
            {fmtTime(r.createdAt)}
            {r.automatic ? ' · automatic re-check' : ''} · fingerprint{' '}
            <span className="mono">{r.snapshotSha256.slice(0, 16)}…</span> · rule pack {r.rulePackVersion}
          </div>
        </div>
        <Badge s={ratingBadge(r.rating.code)} label={r.rating.label} />
      </div>
      <div className="cp-top">
        <div>
          <ScoreRing score={r.overall} rating={r.rating} />
          <p className="note" style={{ textAlign: 'center', margin: '6px 0 0' }}>
            Provisional assurance score
          </p>
        </div>
        <div className="cp-top-r">
          <ul className="cp-counts" data-section="status-counts">
            <li className="pass">
              <b>{n.pass}</b> Pass
            </li>
            <li className="partial">
              <b>{n.partial}</b> Partial
            </li>
            <li className="fail">
              <b>{n.fail}</b> Fail
            </li>
            <li className="unknown">
              <b>{n.informationRequired}</b> Information required
              <span className="note">
                {n.unknown} unknown · {n.review} review
              </span>
            </li>
          </ul>
          <h3>Outstanding evidence</h3>
          {outstanding.length ? (
            <ul className="cp-out">
              {outstanding.map((m, i) => (
                <li key={i}>
                  <span className="rid">{m.controlId}</span> {m.text}
                </li>
              ))}
              {r.missingEvidence.length > outstanding.length ? (
                <li className="note">and {r.missingEvidence.length - outstanding.length} more below</li>
              ) : null}
            </ul>
          ) : (
            <p className="note" style={{ margin: 0 }}>
              None.
            </p>
          )}
        </div>
      </div>
      <dl className="cp-dash" data-section="dashboard-fields">
        <div>
          <dt>Vendor</dt>
          <dd>{st.vendor.name}</dd>
        </div>
        <div>
          <dt>Assessment status</dt>
          <dd>{(STATUS[st.compliance.status] || STATUS.in_progress)[1]}</dd>
        </div>
        <div>
          <dt>Applicable controls</dt>
          <dd>
            {n.applicable} <span className="note">of {n.library}</span>
          </dd>
        </div>
        <div>
          <dt>Passed controls</dt>
          <dd>{n.pass}</dd>
        </div>
        <div>
          <dt>Partial controls</dt>
          <dd>{n.partial}</dd>
        </div>
        <div>
          <dt>Failed controls</dt>
          <dd>{n.fail}</dd>
        </div>
        <div>
          <dt>Information-required controls</dt>
          <dd>{n.informationRequired}</dd>
        </div>
        <div>
          <dt>Provisional score</dt>
          <dd>{r.overall}/100</dd>
        </div>
        <div>
          <dt>Critical gaps</dt>
          <dd>{r.criticalGaps.length}</dd>
        </div>
        <div>
          <dt>Next actions</dt>
          <dd>{r.nextActions.length}</dd>
        </div>
      </dl>
      <p className="ir-foot note" data-section="provisional-label">
        <Icon n="shield" s={14} /> <b>Provisional findings, not a final legal approval.</b> {r.note}
      </p>
    </section>
  );
}

/* Results from the earlier draft rule pack (assessments started before the Stage 3 specification). */
function LegacyResult({ st, r }) {
  return (
    <section className="card cp-result" data-section="compliance-result">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Provisional score · result v{r.version} · earlier draft rule pack</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            {st.vendor.name}
          </h2>
          <div className="note">Rule pack {r.rulePackVersion}</div>
        </div>
        <Badge s={ratingBadge(r.rating.code)} label={r.rating.label} />
      </div>
      <div className="cp-top">
        <ScoreRing score={r.overall} rating={r.rating} />
        <div className="cp-top-r">
          <h3>Score by area</h3>
          <AreaBars areas={r.areas} />
        </div>
      </div>
      <div className="asr-block">
        <h3>Gaps ({r.gaps.length})</h3>
        <ul className="cp-gaps">
          {r.gaps.map((g, i) => (
            <li key={i}>
              <span className={'b ' + gapKind(g.kind)[0]}>{gapKind(g.kind)[1]}</span>
              <span>{g.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {r.note}
      </p>
    </section>
  );
}

/* Stage 3 for one assessment (steps 10–12 and 16 for the buyer, with the reviewer's actions). */
export default function Compliance() {
  const { ref } = useParams();
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [pick, setPick] = useState([]);
  const [clarify, setClarify] = useState('');
  const [note, setNote] = useState({});
  const [view, setView] = useState(null); // an earlier version
  const load = useCallback(
    () =>
      api(`/assessments/${ref}/compliance`)
        .then(setSt)
        .catch(x => setErr(x.message)),
    [ref],
  );
  useEffect(() => {
    load();
  }, [load]);

  const act = async (path, body, ok = '') => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      setSt(await api(`/assessments/${ref}/compliance/${path}`, { method: body?._method || 'POST', body }));
      setView(null);
      if (ok) setMsg(ok);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const review = (e, decision) =>
    act(
      `evidence/${e.id}/review`,
      { _method: 'PUT', decision, note: note[e.id] || '' },
      `“${e.fileName}” marked ${decision === 'VERIFIED' ? 'verified' : 'not acceptable'}. A new version was saved.`,
    );
  const showVersion = async v => {
    try {
      setView((await api(`/assessments/${ref}/compliance/results/${v}`)).result);
    } catch (x) {
      setErr(x.message);
    }
  };
  const countryName = useMemo(() => {
    const m = Object.fromEntries((st?.countries || []).map(c => [c.code, c.name]));
    return code => m[code] || code;
  }, [st]);

  if (err && !st) return <p className="form-err">{err}</p>;
  if (!st) return <Loading />;
  const c = st.compliance;
  const r = view || st.result;
  const qn = c && !c.legacy ? c.questionnaire : null;
  const shared = c && ['submitted', 'clarification'].includes(c.status);
  const steps = [
    [10, 'Start'],
    [11, 'Control set'],
    [12, 'Request'],
    [13, 'Vendor submits'],
    [14, 'Validate & score'],
    [15, 'Saved'],
    [16, 'Results'],
  ];
  const doneTo = !c ? 9 : shared ? 16 : 12;
  return (
    <div className="vs">
      <Link
        className="link"
        to="/compliance"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        <BackArrow /> Compliance assessment
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 3 · Compliance assessment · ${st.assessment.reference}`}
        title={st.assessment.title}
        lead={st.vendor ? `Vendor: ${st.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={st.assessment.reference} />}
      />
      <ol className="vs-steps" aria-label="Stage 3 steps">
        {steps.map(([n, t]) => (
          <li key={n} className={n <= doneTo ? 'done' : ''}>
            <span className="journey-n">{n}</span>
            {t}
          </li>
        ))}
      </ol>
      {err ? (
        <div className="rq-msg err" role="alert">
          <b>{err}</b>
        </div>
      ) : null}
      {msg ? (
        <div className="rq-msg ok" role="status">
          <b>{msg}</b>
        </div>
      ) : null}

      {!c ? (
        <section className="card pad stack" data-section="compliance-start">
          <h2>Step 10 · Start the compliance assessment</h2>
          {st.blocked || !st.start ? (
            <div className="rq-flag warning">
              <Icon n="alert" s={16} />
              <span>
                {st.blocked}{' '}
                {!st.vendor ? (
                  <Link className="link" to={'/vendor-selection/' + ref}>
                    Open vendor selection
                  </Link>
                ) : null}
              </span>
            </div>
          ) : (
            <StartForm st={st} onStarted={x => setSt(x)} />
          )}
        </section>
      ) : c.legacy && !shared ? (
        <section className="card pad stack" data-section="compliance-legacy">
          <h2 style={{ margin: 0 }}>Questionnaire from the earlier draft</h2>
          <p style={{ margin: 0 }}>
            This questionnaire was sent before the Stage 3 specification was adopted and has not been
            submitted. Start it again to send the vendor the current control set. The vendor’s draft answers
            and documents will be removed.
          </p>
          <div>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => act('restart')}
              data-act="restart-compliance"
            >
              Start again with the current control set
            </button>
          </div>
        </section>
      ) : null}

      {c && !c.legacy ? (
        <section className="card pad stack" data-section="compliance-session">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>
              {shared ? 'Assessment session' : `Waiting for ${st.vendor.name}`}{' '}
              <span className="note mono" style={{ fontWeight: 400 }}>
                {c.id}
              </span>
            </h2>
            <Badge
              s={(STATUS[c.status] || STATUS.in_progress)[0]}
              label={(STATUS[c.status] || STATUS.in_progress)[1]}
            />
          </div>
          <p className="note" style={{ margin: 0 }}>
            {TYPE_LABEL[c.assessmentType]} assessment · vendor role{' '}
            {ROLE_LABEL[c.processingRole]?.toLowerCase()} · reviewer {c.reviewer?.name} · jurisdictions{' '}
            {c.jurisdictions.map(countryName).join(', ')} · started {fmtTime(c.startedAt)} · due{' '}
            {fmtDate(c.dueOn)}
            {c.targetCompletionOn ? ` · target ${fmtDate(c.targetCompletionOn)}` : ''}
          </p>
          <p className="note" style={{ margin: 0 }}>
            Service scope: {c.serviceScope}
          </p>
          {!shared ? (
            <>
              <div className="cp-progress">
                <span style={{ width: `${c.progress.percent}%` }} />
              </div>
              <p style={{ margin: 0 }}>
                <b>{c.progress.percent}% complete</b> · {c.progress.answered} of {c.progress.total} questions
                answered · <b>{c.progress.evidence}</b> document{c.progress.evidence === 1 ? '' : 's'}{' '}
                uploaded
              </p>
            </>
          ) : null}
          <QuestionnairePreview qn={qn} st={st} />
          <RequestPanel st={st} act={act} busy={busy} />
        </section>
      ) : null}

      {r && shared ? (
        r.legacy ? (
          <LegacyResult st={st} r={r} />
        ) : (
          <>
            {view ? (
              <div className="rq-flag info">
                <Icon n="clock" s={16} />
                <span>
                  Showing the earlier version v{view.snapshotVersion} ({fmtTime(view.createdAt)}).{' '}
                  <button className="link" onClick={() => setView(null)}>
                    Back to the latest
                  </button>
                </span>
              </div>
            ) : null}
            <AssuranceBox st={st} r={r} />

            <section className="card" data-section="compliance-next">
              <div className="ch">
                <div>
                  <h2>Critical gaps and next actions</h2>
                  <div className="sub">
                    Critical controls that are not resolved need escalation
                    {r.policy === 'block' ? ' and block approval' : ''}. A high score never overrides them.
                  </div>
                </div>
              </div>
              <div className="pad stack">
                {r.criticalGaps.length ? (
                  <ul className="cp-gaps">
                    {r.criticalGaps.map(g => (
                      <li key={g.controlId}>
                        <span className={'b ' + CONTROL_STATUS[g.status][0]}>
                          {CONTROL_STATUS[g.status][1]}
                        </span>
                        <span>
                          <b>Critical</b> · {g.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="note" style={{ margin: 0 }}>
                    No critical control is unresolved.
                  </p>
                )}
                <ol className="cp-actions">
                  {r.nextActions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="card" data-section="compliance-gaps">
              <div className="ch">
                <div>
                  <h2>Missing items and gaps</h2>
                  <div className="sub">
                    Each gap has an ID. They become findings in Stage 7 and actions in Stage 8.
                  </div>
                </div>
                <span className="note">{r.gaps.length}</span>
              </div>
              {!r.gaps.length ? (
                <p className="note pad">No gaps found.</p>
              ) : (
                <ul className="cp-gaps">
                  {r.gaps.map(g => (
                    <li key={g.id}>
                      <span className="mono note">{g.id}</span>
                      <span className={'b ' + gapKind(g.kind)[0]}>{gapKind(g.kind)[1]}</span>
                      <span>{g.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card" data-section="compliance-controls">
              <div className="ch">
                <div>
                  <h2>Control-level results</h2>
                  <div className="sub">
                    Status, confidence, the answer and the evidence for each control.
                    {st.canReview && !view && c.status === 'submitted'
                      ? ' As the reviewer you can mark documents verified or not acceptable, and tick controls to ask the vendor for clarification.'
                      : ''}
                  </div>
                </div>
              </div>
              <div className="cp-controls">
                {[...new Set(r.results.map(x => x.family))].map(fam => (
                  <div key={fam}>
                    <div className="cp-fam">{st.families[fam]}</div>
                    {r.results
                      .filter(x => x.family === fam)
                      .map(x => {
                        const ctl =
                          qn.controls.find(k => k.id === x.controlId) ||
                          qn.notApplicable.find(k => k.id === x.controlId);
                        const docs = (c.evidence || []).filter(e => e.controlId === x.controlId);
                        const canPick =
                          st.canReview && !view && c.status === 'submitted' && x.status !== 'NOT_APPLICABLE';
                        return (
                          <div key={x.controlId} className={'cp-ctl' + (open[x.controlId] ? ' open' : '')}>
                            <div className="cp-ctl-h">
                              {canPick ? (
                                <input
                                  type="checkbox"
                                  aria-label={`Ask for clarification on ${x.controlId}`}
                                  checked={pick.includes(x.controlId)}
                                  onChange={e =>
                                    setPick(p =>
                                      e.target.checked
                                        ? [...p, x.controlId]
                                        : p.filter(i => i !== x.controlId),
                                    )
                                  }
                                />
                              ) : null}
                              <button
                                type="button"
                                className="cp-ctl-t"
                                onClick={() => setOpen(o => ({ ...o, [x.controlId]: !o[x.controlId] }))}
                                aria-expanded={!!open[x.controlId]}
                              >
                                <span className="rid">{x.controlId}</span>
                                <span className="cp-q">{ctl?.question}</span>
                              </button>
                              {x.critical ? <span className="b b-coral">Critical</span> : null}
                              <span className={'b ' + CONTROL_STATUS[x.status][0]}>
                                {CONTROL_STATUS[x.status][1]}
                              </span>
                              <span className="note">{x.confidence ? `${x.confidence} confidence` : ''}</span>
                            </div>
                            {open[x.controlId] ? (
                              <div className="cp-ctl-b">
                                <div className="cp-qa">
                                  <span>Answer</span>
                                  <b>
                                    {x.status === 'NOT_APPLICABLE'
                                      ? '—'
                                      : answerText(ctl, x.answer, countryName)}
                                  </b>
                                  {x.answer?.explanation ? (
                                    <span className="note cp-comment">“{x.answer.explanation}”</span>
                                  ) : null}
                                </div>
                                {x.gapReason ? <p className="cp-why">{x.gapReason}</p> : null}
                                <p className="note" style={{ margin: 0 }}>
                                  {st.levels[x.level]} · {x.legalRef} · weight {x.weight} · rule {x.ruleId}
                                  {x.provisionalScore != null ? ` · control score ${x.provisionalScore}` : ''}
                                  {x.gapIds.length ? ` · ${x.gapIds.join(', ')}` : ''}
                                </p>
                                {docs.length ? (
                                  <ul className="prf-docs">
                                    {docs.map(e => (
                                      <li key={e.id} className="cp-doc">
                                        <Icon n="doc" s={15} />
                                        <a className="link" href={buyerEvidenceUrl(ref, e.id)}>
                                          {e.fileName}
                                        </a>
                                        <span className="note">
                                          {st.documentTypes[e.docType] || e.docType} · v{e.version}
                                          {e.issuer ? ` · ${e.issuer}` : ''}
                                          {e.issuedOn ? ` · issued ${fmtDate(e.issuedOn)}` : ''}
                                          {e.expiresOn ? ` · expires ${fmtDate(e.expiresOn)}` : ''}
                                          {x.evidenceIds.includes(e.id) ? '' : ' · not in this version'}
                                        </span>
                                        <span
                                          className={'b ' + (PROCESSING_TONE[e.processingStatus] || 'b-mute')}
                                        >
                                          {PROCESSING_SHORT[e.processingStatus] || 'Received'}
                                        </span>
                                        {e.reviewStatus ? (
                                          <span
                                            className={
                                              'b ' + (e.reviewStatus === 'VERIFIED' ? 'b-sage' : 'b-coral')
                                            }
                                          >
                                            {e.reviewStatus === 'VERIFIED'
                                              ? 'Verified by reviewer'
                                              : 'Not acceptable'}
                                          </span>
                                        ) : null}
                                        {st.canReview && !view && c.status === 'submitted' && e.locked ? (
                                          <span className="cp-rev">
                                            <input
                                              type="text"
                                              placeholder="Reviewer note"
                                              aria-label={`Reviewer note for ${e.fileName}`}
                                              value={note[e.id] || ''}
                                              onChange={ev =>
                                                setNote(n => ({ ...n, [e.id]: ev.target.value }))
                                              }
                                            />
                                            <button
                                              className="btn sm"
                                              disabled={busy}
                                              onClick={() => review(e, 'VERIFIED')}
                                            >
                                              Verified
                                            </button>
                                            <button
                                              className="btn sm"
                                              disabled={busy}
                                              onClick={() => review(e, 'REJECTED')}
                                            >
                                              Not acceptable
                                            </button>
                                          </span>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                ) : x.status !== 'NOT_APPLICABLE' ? (
                                  <p className="note" style={{ margin: 0 }}>
                                    No documents for this control.
                                  </p>
                                ) : (
                                  <p className="note" style={{ margin: 0 }}>
                                    Not applicable: {ctl?.applicability.text.toLowerCase()} does not hold.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
              {st.canReview && !view && c.status === 'submitted' ? (
                <div className="pad stack cp-clarify" data-section="clarification">
                  <h3 style={{ margin: 0 }}>Request clarification</h3>
                  <p className="note" style={{ margin: 0 }}>
                    {pick.length
                      ? `Selected: ${pick.join(', ')}. The vendor can change only these answers and add new documents; earlier answers and documents are kept, and a new version is saved.`
                      : 'Tick the controls above that the vendor should look at again.'}
                  </p>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="What should the vendor clarify or send?"
                    value={clarify}
                    onChange={e => setClarify(e.target.value)}
                    aria-label="Clarification message"
                  />
                  <div>
                    <button
                      className="btn"
                      disabled={busy || !pick.length || clarify.trim().length < 3}
                      onClick={async () => {
                        await act(
                          'clarification',
                          { controlIds: pick, message: clarify },
                          'Clarification requested. The vendor has been told.',
                        );
                        setPick([]);
                        setClarify('');
                      }}
                      data-act="request-clarification"
                    >
                      Send clarification request
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {st.versions?.length > 1 ? (
              <section className="card" data-section="compliance-versions">
                <div className="ch">
                  <div>
                    <h2>Saved versions</h2>
                    <div className="sub">
                      Every review, clarification and automatic check saves a new version. Earlier ones are
                      kept.
                    </div>
                  </div>
                </div>
                <ul className="cp-versions">
                  {[...st.versions].reverse().map(v => (
                    <li key={v.version}>
                      <b className="mono">v{v.snapshotVersion}</b>
                      <span>
                        {v.overall}/100 · {fmtTime(v.createdAt)}
                        {v.automatic ? ' · automatic' : ''}
                      </span>
                      <button className="link" onClick={() => showVersion(v.version)}>
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )
      ) : null}

      {r && shared ? (
        <div className="card rq-next">
          <Icon n="clock" s={20} />
          <div>
            <b>Next: Stage 4 — Contract analysis.</b>{' '}
            <span className="note">
              Upload the contract so its clauses can be checked. The Stage 3 findings stay provisional until
              the open items are resolved.
            </span>
          </div>
          <Link className="btn primary" to={'/contract/' + ref} data-act="go-contract">
            Open contract analysis
          </Link>
        </div>
      ) : null}
    </div>
  );
}
