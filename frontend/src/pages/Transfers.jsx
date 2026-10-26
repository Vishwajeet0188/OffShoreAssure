import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import { CHECK_TONE, statusTone } from '../lib/transfers.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';

const STEPS = [
  [25, 'Map routes'],
  [26, 'Check safeguards'],
  [27, 'Findings'],
  [28, 'Saved'],
];

/* Stage 6 landing page: every assessment and the state of its transfer assessment. */
export function TransfersList() {
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
        eyebrow="Buyer · Stage 6 · Transfer assessment"
        title="Transfer assessment"
        lead="See every route your data takes out of the UK, who receives it, and whether a safeguard covers it."
      />
      <div className="card" data-section="transfers-list">
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
                  <th>Transfers</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr
                    key={assessment.reference}
                    className="click"
                    onClick={() => navigate('/transfers/' + assessment.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/transfers/' + assessment.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      <TransferStatus assessment={assessment} />
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

function TransferStatus({ assessment }) {
  const transfers = assessment.transfers;
  if (transfers) {
    return (
      <span className={'b ' + statusTone(transfers.overall.status)}>
        v{transfers.version} · {transfers.overall.label}
      </span>
    );
  }
  if (assessment.obligations) return <span className="muted">Ready to run</span>;
  return <span className="muted">Waiting for Stage 5</span>;
}

/* Stage 6 for one assessment. */
export default function Transfers() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    version => {
      const query = version ? `?version=${version}` : '';
      return api(`/assessments/${ref}/transfers${query}`)
        .then(setState)
        .catch(err => setError(err.message));
    },
    [ref],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      setState(await api(`/assessments/${ref}/transfers`, { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;

  const result = state.result;

  return (
    <div className="vs">
      <Link className="link" to="/transfers" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        ← Transfer assessment
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 6 · Transfer assessment · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Vendor: ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 6 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={result && number <= 28 ? 'done' : ''}>
            <span className="journey-n">{number}</span>
            {title}
          </li>
        ))}
      </ol>

      {error ? (
        <div className="rq-msg err" role="alert">
          <b>{error}</b>
        </div>
      ) : null}

      {state.blocked ? (
        <section className="card pad stack" data-section="transfers-blocked">
          <h2 style={{ margin: 0 }}>Run the transfer assessment</h2>
          <div className="rq-flag warning">
            <Icon n="alert" s={16} />
            <span>
              {state.blocked}{' '}
              <Link className="link" to={'/obligations/' + ref}>
                Open obligation extraction
              </Link>
            </span>
          </div>
        </section>
      ) : state.canRun ? (
        <RunCard isUpdate={state.versions.length > 0} busy={busy} onRun={run} />
      ) : null}

      {result ? (
        <>
          <VersionBar state={state} onPick={load} />
          <SummaryCard result={result} />
          <RoutesCard result={result} />
          <QuestionsCard result={result} />
          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Stage 6 is complete for this assessment. Next: Stage 7 — Risk identification.</b>{' '}
              <span className="note">
                The gaps from Stages 1 to 6 are brought together in one scored risk register.
              </span>
            </div>
            <Link className="btn primary" to={'/risks/' + ref} data-act="go-risks">
              Open risk register
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RunCard({ isUpdate, busy, onRun }) {
  return (
    <section className="card pad stack" data-section="transfers-run">
      <h2 style={{ margin: 0 }}>
        {isUpdate ? 'Something has changed since the last run' : 'Step 25 · Map the data flows'}
      </h2>
      <p style={{ margin: 0 }}>
        OffshoreAssure uses your requirement (where data is stored and accessed from), the vendor’s delivery
        countries, the contract’s transfer clause and the vendor’s answers to check every route, one by one.
      </p>
      <ul className="cp-facts">
        <li>
          <Icon n="globe" s={15} />
          One route per destination
        </li>
        <li>
          <Icon n="users" s={15} />
          Who receives the data, and their role
        </li>
        <li>
          <Icon n="shield" s={15} />
          UK adequacy or a contract safeguard
        </li>
      </ul>
      <div>
        <button className="btn primary" onClick={onRun} disabled={busy} data-act="run-transfers">
          {busy
            ? 'Checking the routes…'
            : isUpdate
              ? 'Run again with the latest information'
              : 'Run transfer assessment'}
        </button>
      </div>
    </section>
  );
}

function VersionBar({ state, onPick }) {
  const result = state.result;
  const inputs = result.inputs;
  return (
    <section className="card pad ca-version" data-section="transfers-version">
      <div className="ca-version-main">
        <Icon n="globe" s={20} />
        <div>
          <b>Transfer assessment v{result.version}</b>
          <div className="note">
            Saved {fmtTime(result.createdAt)} · requirement v{inputs.requirement} · contract v
            {inputs.contract} · obligations v{inputs.obligations} · rule pack {result.rulePackVersion}
          </div>
          <div className="note">
            Fingerprint <span className="mono">{result.snapshotSha256.slice(0, 16)}…</span>
          </div>
        </div>
      </div>
      {state.versions.length > 1 ? (
        <select
          aria-label="Assessment version"
          value={result.version}
          onChange={e => onPick(Number(e.target.value))}
        >
          {state.versions.map(v => (
            <option key={v.version} value={v.version}>
              v{v.version} · {v.overall.label}
              {v.version === state.versions[0].version ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}

function SummaryCard({ result }) {
  const { totals, contractTerms } = result;
  const figures = [
    ['Routes', totals.routes],
    ['Covered by UK adequacy', totals.adequate],
    ['Need a safeguard', totals.safeguardNeeded],
    ['Information needed', totals.informationNeeded + totals.notPermitted],
  ];

  return (
    <section className="card cp-result" data-section="transfers-summary">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Steps 25–27 · Transfer findings</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            Where the data goes
          </h2>
          <div className="note">
            Contract transfer clause:{' '}
            {contractTerms.clauseNumbers.length ? contractTerms.clauseNumbers.join(', ') : 'none found'}
            {contractTerms.safeguards.length ? ` · ${contractTerms.safeguards.join('; ')}` : ''}
          </div>
        </div>
        <span className={'b ' + statusTone(result.overall.status)}>{result.overall.label}</span>
      </div>
      <div className="ca-figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {result.findings.length ? (
        <div className="asr-block" data-section="transfers-findings">
          <h3>Findings</h3>
          <ul className="cp-gaps">
            {result.findings.map(finding => (
              <li key={finding.routeId}>
                <span className={'b ' + statusTone(finding.status)}>{finding.routeId}</span>
                <span>{finding.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {result.note}
      </p>
    </section>
  );
}

function RoutesCard({ result }) {
  const [openIds, setOpenIds] = useState({});
  const toggle = id => setOpenIds(current => ({ ...current, [id]: !current[id] }));

  return (
    <section className="card" data-section="transfers-routes">
      <div className="ch">
        <div>
          <h2>Step 26 · Route by route</h2>
          <div className="sub">Open a route to see who receives the data and each check made.</div>
        </div>
        <span className="note">{result.routes.length}</span>
      </div>
      <div className="cp-controls">
        {result.routes.map(route => {
          const isOpen = !!openIds[route.id];
          return (
            <div key={route.id} className={'cp-ctl' + (isOpen ? ' open' : '')} data-route={route.to}>
              <button className="cp-ctl-h tr-route-h" onClick={() => toggle(route.id)} aria-expanded={isOpen}>
                <span className="rid">{route.id}</span>
                <b>
                  {route.fromName} → {route.toName}
                </b>
                <span className="note">{route.uses.join(' · ')}</span>
                <span className={'b ' + statusTone(route.status)}>{route.statusLabel}</span>
              </button>
              {isOpen ? (
                <div className="cp-ctl-b">
                  <div className="note">
                    Received by: {route.recipients.map(r => `${r.name} (${r.role})`).join('; ')}
                  </div>
                  <ul className="tr-checks">
                    {route.checks.map((check, index) => (
                      <li key={index}>
                        <span className={'b ' + (CHECK_TONE[check.result] || 'b-mute')}>{check.result}</span>
                        <span>
                          <b>{check.name}:</b> {check.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuestionsCard({ result }) {
  const forBuyer = result.questions.filter(q => q.to === 'buyer');
  const forVendor = result.questions.filter(q => q.to === 'vendor');

  const list = (questions, empty) =>
    questions.length === 0 ? (
      <p className="note" style={{ margin: 0 }}>
        {empty}
      </p>
    ) : (
      <ul className="tr-questions">
        {questions.map((question, index) => (
          <li key={index}>
            <span className="mono note">{question.routeId}</span>
            <span>{question.text}</span>
          </li>
        ))}
      </ul>
    );

  return (
    <section className="card" data-section="transfers-questions">
      <div className="ch">
        <div>
          <h2>Step 27 · Questions to resolve</h2>
          <div className="sub">These become actions in Stage 8 (Remediation).</div>
        </div>
        <span className="note">{result.questions.length}</span>
      </div>
      <div className="tr-qcols">
        <div className="asr-block">
          <h3>For you (the buyer)</h3>
          {list(forBuyer, 'Nothing for you to do.')}
        </div>
        <div className="asr-block">
          <h3>For the vendor</h3>
          {list(forVendor, 'Nothing to ask the vendor.')}
        </div>
      </div>
    </section>
  );
}
