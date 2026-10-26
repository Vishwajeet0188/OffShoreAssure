import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import {
  KIND_WORD,
  POSITION_TONE,
  SEVERITY_TONE,
  SEVERITY_WORD,
  STAGE_PATH,
  packUrl,
  pdfUrl,
  shortHash,
} from '../lib/reports.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';

const STEPS = [
  [39, 'Report or monitor'],
  [40, 'Compile'],
  [41, 'Save version'],
  [42, 'Report'],
  [43, 'Monitoring'],
];

/* Stage 9 landing page: every assessment, its latest report and position. */
export function MonitoringList() {
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
        eyebrow="Buyer · Stage 9 · Monitoring and audit"
        title="Monitoring and audit"
        lead="Generate the evidence-backed report with its audit trail, then keep an eye on renewals, overdue actions and changes."
      />
      <div className="card" data-section="monitoring-list">
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
                  <th>Report</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr
                    key={assessment.reference}
                    className="click"
                    onClick={() => navigate('/monitoring/' + assessment.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/monitoring/' + assessment.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      <ReportStatus assessment={assessment} />
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

function ReportStatus({ assessment }) {
  const report = assessment.report;
  if (report)
    return (
      <span className={'b ' + POSITION_TONE[report.position.code]}>
        v{report.version}.0 · {report.position.label}
      </span>
    );
  if (assessment.remediation) return <span className="muted">Ready when Stage 8 is decided</span>;
  return <span className="muted">Waiting for Stage 8</span>;
}

/* Stage 9 for one assessment. */
export default function Monitoring() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [version, setVersion] = useState(null);

  const load = useCallback(
    () =>
      api(`/assessments/${ref}/report${version ? `?version=${version}` : ''}`)
        .then(setState)
        .catch(err => setError(err.message)),
    [ref, version],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(key, fn, okText) {
    setBusy(key);
    setMsg(null);
    try {
      const next = await fn();
      if (next?.monitoring) {
        setState(next);
        setVersion(null);
      }
      if (okText) setMsg({ tone: 'ok', text: okText });
    } catch (err) {
      setMsg({ tone: 'err', text: err.message });
    } finally {
      setBusy('');
    }
  }

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;

  const reported = state.versions.length > 0;
  const done = n =>
    n === 43
      ? state.monitoring.checks.length > 0
      : n === 39
        ? reported || state.monitoring.checks.some(c => c.choice === 'monitor')
        : reported;

  return (
    <div className="vs">
      <Link
        className="link"
        to="/monitoring"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        ← Monitoring and audit
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 9 · Monitoring and audit · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Vendor: ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 9 steps">
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
        <section className="card pad stack" data-section="monitoring-blocked">
          <h2 style={{ margin: 0 }}>Report and monitoring</h2>
          <div className="rq-flag warning">
            <Icon n="alert" s={16} />
            <span>
              {state.blocked}{' '}
              <Link className="link" to={'/remediation/' + ref}>
                Open remediation
              </Link>
            </span>
          </div>
        </section>
      ) : (
        <ChoiceCard state={state} reference={ref} busy={busy} act={act} />
      )}

      {state.report ? <ReportCard state={state} reference={ref} onVersion={setVersion} /> : null}

      {!state.blocked ? <MonitoringCard state={state} reference={ref} busy={busy} act={act} /> : null}
    </div>
  );
}

/* Step 39: generate the report, or carry on monitoring. */
function ChoiceCard({ state, reference, busy, act }) {
  const [reason, setReason] = useState('');
  const latest = state.versions[0];
  return (
    <section className="card pad stack" data-section="report-choice">
      <h2 style={{ margin: 0 }}>Step 39 · Generate the report or continue monitoring</h2>
      {state.upToDate ? (
        <p style={{ margin: 0 }}>
          Report v{latest.version}.0 is up to date: no stage record has changed since{' '}
          {fmtTime(latest.createdAt)}.
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          {latest ? `Some records have changed since report v${latest.version}.0. ` : ''}
          The report brings the latest saved record of every stage together with the documents, their
          fingerprints and the audit trail. Each report is saved as a new version; earlier versions stay as
          they were.
        </p>
      )}
      {state.canGenerate && latest ? (
        <input
          type="text"
          className="mn-reason"
          maxLength={500}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why a new version (optional), e.g. vendor actions closed"
          aria-label="Reason for a new version"
        />
      ) : null}
      <div className="row">
        <button
          className="btn primary"
          disabled={!state.canGenerate || busy === 'report'}
          data-act="generate-report"
          onClick={() =>
            act(
              'report',
              () => api(`/assessments/${reference}/report`, { method: 'POST', body: { reason } }),
              'Report saved. It is shown below.',
            )
          }
        >
          {busy === 'report'
            ? 'Compiling…'
            : latest
              ? `Generate report v${latest.version + 1}.0`
              : 'Generate the report'}
        </button>
        <button
          className="btn"
          disabled={busy === 'monitor'}
          data-act="continue-monitoring"
          onClick={() =>
            act(
              'monitor',
              () =>
                api(`/assessments/${reference}/monitoring`, {
                  method: 'POST',
                  body: { choice: latest ? 'check' : 'monitor' },
                }),
              'Monitoring check saved.',
            )
          }
        >
          {busy === 'monitor'
            ? 'Checking…'
            : latest
              ? 'Run the monitoring check'
              : 'Continue monitoring without a report'}
        </button>
      </div>
    </section>
  );
}

/* Steps 40–42: the evidence-backed report. */
function ReportCard({ state, reference, onVersion }) {
  const r = state.report;
  const c = r.content;
  const sectionLink = s => (s.stage === 1 ? '/requirements' : `${STAGE_PATH[s.stage]}/${reference}`);
  return (
    <section className="card cp-result" data-section="report" data-version={r.version}>
      <div className="asr-head">
        <div>
          <div className="eyebrow">Step 42 · Evidence-backed assessment report</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            Report v{r.version}.0
          </h2>
          <div className="note">
            {fmtTime(r.createdAt)} · {r.createdBy} · {r.reason} · rules {r.rulePackVersion}
          </div>
        </div>
        <span className={'b ' + POSITION_TONE[c.position.code]} data-position={c.position.code}>
          {c.position.label}
        </span>
      </div>

      <div className="pad stack">
        <p style={{ margin: 0 }}>
          <b>Position.</b> {c.position.detail}
        </p>
        <div className="row mn-tools">
          <a className="btn sm primary" href={pdfUrl(reference, r.version)} data-act="download-pdf">
            <Icon n="file" s={14} /> Export report (PDF)
          </a>
          <a className="btn sm" href={packUrl(reference, r.version)} data-act="download-pack">
            <Icon n="file" s={14} /> Download the audit pack (JSON)
          </a>
          <button className="btn sm" onClick={() => window.print()} data-act="print-report">
            Print
          </button>
          {state.versions.length > 1 ? (
            <label className="note">
              Version{' '}
              <select
                value={r.version}
                onChange={e => onVersion(Number(e.target.value))}
                aria-label="Report version"
                data-field="version"
              >
                {state.versions.map(v => (
                  <option key={v.version} value={v.version}>
                    v{v.version}.0 · {v.position.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <div className="asr-block" data-section="report-sections">
        <h3>What each stage found</h3>
        <div className="mn-sections">
          {c.sections.map(s => (
            <div key={s.stage} className="mn-section" data-stage={s.stage}>
              <div className="mn-section-h">
                <span className="journey-n">{s.stage}</span>
                <b>{s.title}</b>
                <Link className="link note" to={sectionLink(s)}>
                  Open
                </Link>
              </div>
              <p style={{ margin: '4px 0' }}>{s.summary}</p>
              {s.facts.length ? (
                <details className="vs-details">
                  <summary>Details ({s.facts.length})</summary>
                  <ul className="mn-facts">
                    {s.facts.map(([k, v], i) => (
                      <li key={i}>
                        <span className="note">{k}</span> {v}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {c.openActions.length ? (
        <div className="asr-block" data-section="report-open">
          <h3>Still open</h3>
          <ul>
            {c.openActions.map(a => (
              <li key={a.code}>
                <span className="rid">{a.code}</span> {a.title} · {a.owner === 'vendor' ? 'vendor' : 'buyer'}{' '}
                · {a.status.toLowerCase()}
                {a.dueOn ? ` · due ${a.dueOn}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {c.acceptedRisks.length ? (
        <div className="asr-block" data-section="report-accepted">
          <h3>Risks accepted by the buyer</h3>
          <ul>
            {c.acceptedRisks.map(a => (
              <li key={a.code}>
                <span className="rid">{a.code}</span> {a.title}: <i>{a.reason}</i>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="asr-block" data-section="report-evidence">
        <h3>Evidence index ({c.evidence.length})</h3>
        {c.evidence.length ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Document</th>
                  <th>What</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {c.evidence.map((e, i) => (
                  <tr key={i}>
                    <td>{e.stage}</td>
                    <td>
                      {e.fileName}
                      {e.expiresOn ? <div className="note">Expires {e.expiresOn}</div> : null}
                    </td>
                    <td className="note">
                      {e.kind} · {e.detail}
                    </td>
                    <td className="mono note" title={e.sha256}>
                      {shortHash(e.sha256)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="note">No documents were uploaded.</p>
        )}
      </div>

      <div className="asr-block" data-section="report-records">
        <h3>Saved records and audit trail</h3>
        <ul className="mn-facts">
          {c.records.map(x => (
            <li key={x.record}>
              <span className="note">{x.record}</span>{' '}
              <span className="mono" title={x.sha256}>
                {shortHash(x.sha256)}
              </span>
            </li>
          ))}
          <li>
            <span className="note">Report fingerprint</span>{' '}
            <span className="mono" title={r.snapshotSha256}>
              {shortHash(r.snapshotSha256)}
            </span>
          </li>
          <li>
            <span className="note">Audit trail</span> {c.auditTrail.events} events
            {c.auditTrail.first
              ? `, ${fmtTime(c.auditTrail.first)} to ${fmtTime(c.auditTrail.last)}`
              : ''}{' '}
            (in the audit pack)
          </li>
          <li>
            <span className="note">Next periodic review</span> {c.nextReviewOn}
          </li>
        </ul>
      </div>
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {c.note}
      </p>
    </section>
  );
}

/* Step 43: what needs attention now, and renewals to send to the vendor. */
function MonitoringCard({ state, reference, busy, act }) {
  const { items, checks, rules } = state.monitoring;
  const [chosen, setChosen] = useState({});
  const requestable = items.filter(i => i.canRequest);
  const keys = Object.keys(chosen).filter(k => chosen[k] && requestable.some(i => i.key === k));

  return (
    <section className="card" data-section="monitoring">
      <div className="ch">
        <div>
          <h2>Step 43 · Ongoing monitoring</h2>
          <div className="sub">
            Certificates and insurance expiring within {rules.expiryWarningDays} days, overdue actions,
            records changed since the last report, and the next full review (every{' '}
            {rules.reviewMonths[state.assessment.riskTier] || 12} months for a{' '}
            {String(state.assessment.riskTier).toLowerCase()} risk tier).
          </div>
        </div>
        <span className="note">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="note pad">Nothing needs attention right now.</p>
      ) : (
        <ul className="mn-items">
          {items.map(i => (
            <li key={i.key} className="mn-item" data-item={i.kind} data-severity={i.severity}>
              {i.canRequest ? (
                <input
                  type="checkbox"
                  checked={!!chosen[i.key]}
                  onChange={e => setChosen(c => ({ ...c, [i.key]: e.target.checked }))}
                  aria-label={'Request renewal: ' + i.title}
                />
              ) : (
                <span className="mn-dot" />
              )}
              <div>
                <b>{i.title}</b>
                <div className="note">
                  {KIND_WORD[i.kind]} · {i.detail}
                </div>
              </div>
              <span className={'b ' + SEVERITY_TONE[i.severity]}>{SEVERITY_WORD[i.severity]}</span>
            </li>
          ))}
        </ul>
      )}
      {requestable.length ? (
        <div className="pad">
          <button
            className="btn primary"
            disabled={!keys.length || busy === 'request'}
            data-act="request-renewals"
            onClick={() =>
              act(
                'request',
                () =>
                  api(`/assessments/${reference}/monitoring/requests`, { method: 'POST', body: { keys } }),
                `Renewal sent to the vendor as ${keys.length} action${keys.length === 1 ? '' : 's'}. You will review the documents in Stage 8.`,
              )
            }
          >
            {busy === 'request'
              ? 'Sending…'
              : `Ask the vendor for ${keys.length || ''} renewal${keys.length === 1 ? '' : 's'}`.replace(
                  '  ',
                  ' ',
                )}
          </button>
        </div>
      ) : null}
      {checks.length ? (
        <div className="asr-block">
          <h3>Monitoring checks saved</h3>
          <ul className="rm-history">
            {checks.map((c, i) => (
              <li key={i}>
                <span className="mono note">{fmtTime(c.at)}</span>{' '}
                <b>
                  {c.choice === 'monitor'
                    ? 'Continue monitoring'
                    : c.choice === 'auto'
                      ? 'Automatic check'
                      : 'Check'}
                </b>{' '}
                ·{' '}
                {c.choice === 'auto'
                  ? c.note || 'records updated'
                  : c.attention
                    ? `${c.attention} need attention`
                    : 'nothing needs attention'}
                {c.reportVersion ? ` · report v${c.reportVersion}.0` : ''}{' '}
                <span className="note">· {c.by}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
