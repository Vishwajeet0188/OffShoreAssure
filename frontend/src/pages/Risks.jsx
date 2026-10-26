import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import {
  EVIDENCE_TONE,
  SEVERITY_TONE,
  SEVERITY_WORD,
  STAGE_PATH,
  cellBand,
  ratingTone,
} from '../lib/risks.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';

const STEPS = [
  [29, 'Consolidate'],
  [30, 'Score'],
  [31, 'Register'],
  [32, 'Saved'],
];
const RATING_WORD = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

/* Stage 7 landing page: every assessment and the state of its risk register. */
export function RisksList() {
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
        eyebrow="Buyer · Stage 7 · Risk identification"
        title="Risk identification"
        lead="All the gaps from the earlier stages in one register, scored so you can see what to fix first."
      />
      <div className="card" data-section="risks-list">
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
                  <th>Risk register</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(assessment => (
                  <tr
                    key={assessment.reference}
                    className="click"
                    onClick={() => navigate('/risks/' + assessment.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/risks/' + assessment.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{assessment.reference}</b>
                      </Link>
                      <div className="note">{assessment.title}</div>
                    </td>
                    <td>{serviceLabel(assessment.serviceCode)}</td>
                    <td>{assessment.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                    <td>
                      <RegisterStatus assessment={assessment} />
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

function RegisterStatus({ assessment }) {
  const risks = assessment.risks;
  if (risks) {
    return (
      <span className={'b ' + ratingTone(risks.overall.rating)}>
        v{risks.version} · {risks.totals.risks} risks · highest {risks.overall.label.toLowerCase()}
      </span>
    );
  }
  if (assessment.transfers) return <span className="muted">Ready to run</span>;
  return <span className="muted">Waiting for Stage 6</span>;
}

/* Stage 7 for one assessment. */
export default function Risks() {
  const { ref } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    version => {
      const query = version ? `?version=${version}` : '';
      return api(`/assessments/${ref}/risks${query}`)
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
      setState(await api(`/assessments/${ref}/risks`, { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) return <p className="form-err">{error}</p>;
  if (!state) return <Loading />;

  const register = state.register;

  return (
    <div className="vs">
      <Link className="link" to="/risks" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        ← Risk identification
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 7 · Risk identification · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={state.vendor ? `Vendor: ${state.vendor.name}` : 'No vendor selected yet.'}
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 7 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={register ? 'done' : ''}>
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
        <section className="card pad stack" data-section="risks-blocked">
          <h2 style={{ margin: 0 }}>Build the risk register</h2>
          <div className="rq-flag warning">
            <Icon n="alert" s={16} />
            <span>
              {state.blocked}{' '}
              <Link className="link" to={'/transfers/' + ref}>
                Open transfer assessment
              </Link>
            </span>
          </div>
        </section>
      ) : state.canRun ? (
        <RunCard isUpdate={state.versions.length > 0} busy={busy} onRun={run} />
      ) : null}

      {register ? (
        <>
          <VersionBar state={state} onPick={load} />
          <SummaryCard register={register} />
          <RegisterCard register={register} reference={ref} />
          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Stage 7 is complete for this assessment. Next: Stage 8 — Remediation.</b>{' '}
              <span className="note">
                Each risk becomes an action for you or the vendor, with proof to upload.
              </span>
            </div>
            <Link className="btn primary" to={'/remediation/' + ref} data-act="go-remediation">
              Open remediation
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RunCard({ isUpdate, busy, onRun }) {
  return (
    <section className="card pad stack" data-section="risks-run">
      <h2 style={{ margin: 0 }}>
        {isUpdate ? 'Something has changed since the last register' : 'Step 29 · Bring the gaps together'}
      </h2>
      <p style={{ margin: 0 }}>
        OffshoreAssure reads the latest saved result of every earlier stage — unconfirmed answers, selection
        conditions, questionnaire gaps, missing contract topics, uncovered rules and transfer routes — and
        groups them into risks.
      </p>
      <ul className="cp-facts">
        <li>
          <Icon n="list" s={15} />
          One risk per subject, with every source linked
        </li>
        <li>
          <Icon n="alert" s={15} />
          Scored likelihood × impact (1–25)
        </li>
        <li>
          <Icon n="shield" s={15} />
          The reason for every score written out
        </li>
      </ul>
      <div>
        <button className="btn primary" onClick={onRun} disabled={busy} data-act="run-risks">
          {busy
            ? 'Building the register…'
            : isUpdate
              ? 'Build again with the latest information'
              : 'Build risk register'}
        </button>
      </div>
    </section>
  );
}

function VersionBar({ state, onPick }) {
  const register = state.register;
  const inputs = register.inputs;
  return (
    <section className="card pad ca-version" data-section="risks-version">
      <div className="ca-version-main">
        <Icon n="alert" s={20} />
        <div>
          <b>Risk register v{register.version}</b>
          <div className="note">
            Saved {fmtTime(register.createdAt)} · requirement v{inputs.requirement} · selection v
            {inputs.selection} · compliance result v{inputs.compliance} · contract v{inputs.contract} ·
            obligations v{inputs.obligations} · transfers v{inputs.transfers} · rule pack{' '}
            {register.rulePackVersion}
          </div>
          <div className="note">
            Fingerprint <span className="mono">{register.snapshotSha256.slice(0, 16)}…</span>
          </div>
        </div>
      </div>
      {state.versions.length > 1 ? (
        <select
          aria-label="Register version"
          value={register.version}
          onChange={e => onPick(Number(e.target.value))}
        >
          {state.versions.map(v => (
            <option key={v.version} value={v.version}>
              v{v.version} · {v.totals.risks} risks
              {v.version === state.versions[0].version ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}

function SummaryCard({ register }) {
  const { totals } = register;
  const figures = [
    ['Risks', totals.risks, ''],
    ['Critical', totals.critical, totals.critical ? 'warn' : ''],
    ['High', totals.high, totals.high ? 'warn' : ''],
    ['Medium or low', totals.medium + totals.low, ''],
  ];

  return (
    <section className="card cp-result" data-section="risks-summary">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Steps 29–31 · Risk register</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            What to fix first
          </h2>
          <div className="note">
            {totals.findings} findings from the earlier stages, grouped into {totals.risks} risks ·{' '}
            {totals.vendorActions} for the vendor, {totals.buyerActions} for you
          </div>
        </div>
        <span className={'b ' + ratingTone(register.overall.rating)}>Highest: {register.overall.label}</span>
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
        <h3>Likelihood × impact</h3>
        <RiskGrid grid={register.grid} />
      </div>
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {register.note}
      </p>
    </section>
  );
}

/* 5 × 5 grid: likelihood up the side (5 at the top), impact along the bottom, the number of risks in each cell. */
export function RiskGrid({ grid }) {
  const rows = [5, 4, 3, 2, 1];
  const cols = [1, 2, 3, 4, 5];
  return (
    <div
      className="rk-grid"
      role="table"
      aria-label="Number of risks by likelihood and impact"
      data-section="risk-grid"
    >
      {rows.map(l => (
        <div key={l} className="rk-row" role="row">
          <span className="rk-axis" role="rowheader">
            {l}
          </span>
          {cols.map(i => {
            const n = grid[l - 1][i - 1];
            return (
              <span
                key={i}
                role="cell"
                className={'rk-cell ' + cellBand(l * i) + (n ? ' has' : '')}
                title={`Likelihood ${l} × impact ${i} = ${l * i}`}
              >
                {n || ''}
              </span>
            );
          })}
        </div>
      ))}
      <div className="rk-row rk-foot">
        <span className="rk-axis" />
        {cols.map(i => (
          <span key={i} className="rk-axis">
            {i}
          </span>
        ))}
      </div>
      <div className="note rk-labels">
        <span>↑ Likelihood</span>
        <span>Impact →</span>
      </div>
    </div>
  );
}

function RegisterCard({ register, reference }) {
  const [openIds, setOpenIds] = useState({});
  const [filter, setFilter] = useState('ALL');
  const toggle = id => setOpenIds(current => ({ ...current, [id]: !current[id] }));
  const shown = useMemo(
    () => register.risks.filter(r => filter === 'ALL' || r.rating === filter || r.actionBy === filter),
    [register, filter],
  );

  return (
    <section className="card" data-section="risks-register">
      <div className="ch">
        <div>
          <h2>Step 31 · Risk register and rationale</h2>
          <div className="sub">
            Highest score first. Open a risk to see why it was scored that way and where each finding came
            from.
          </div>
        </div>
        <select
          aria-label="Show"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          data-act="risk-filter"
        >
          <option value="ALL">All risks</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
          <option value="Vendor">Vendor to act</option>
          <option value="Buyer">You to act</option>
        </select>
      </div>
      {register.risks.length === 0 ? <p className="note pad">No risks found in the earlier stages.</p> : null}
      <div className="cp-controls">
        {shown.map(risk => {
          const isOpen = !!openIds[risk.id];
          return (
            <div key={risk.id} className={'cp-ctl' + (isOpen ? ' open' : '')} data-risk={risk.theme}>
              <button className="cp-ctl-h rk-risk-h" onClick={() => toggle(risk.id)} aria-expanded={isOpen}>
                <span className="rid">{risk.id}</span>
                <b>{risk.title}</b>
                <span className="note">
                  L{risk.likelihood} × I{risk.impact} = {risk.score} · {risk.findings.length} finding
                  {risk.findings.length === 1 ? '' : 's'} ·{' '}
                  {risk.actionBy === 'Both'
                    ? 'both to act'
                    : risk.actionBy === 'Buyer'
                      ? 'you to act'
                      : 'vendor to act'}
                </span>
                <span className={'b ' + ratingTone(risk.rating)}>{RATING_WORD[risk.rating]}</span>
              </button>
              {isOpen ? (
                <div className="cp-ctl-b">
                  <p className="rk-why">
                    <b>Why this score:</b> {risk.rationale}
                  </p>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className={'b ' + (EVIDENCE_TONE[risk.evidence] || 'b-mute')}>
                      {risk.evidence}
                      {risk.evidenceScore !== null ? ` (${risk.evidenceScore}/100)` : ''}
                    </span>
                    {risk.controls.length ? (
                      <span className="note">Controls: {risk.controls.join(', ')}</span>
                    ) : null}
                    <span className="note">From stages {risk.stages.join(', ')}</span>
                  </div>
                  <ul className="rk-findings">
                    {risk.findings.map((f, index) => (
                      <li key={index}>
                        <span className={'b ' + (SEVERITY_TONE[f.severity] || 'b-mute')}>
                          {SEVERITY_WORD[f.severity]}
                        </span>
                        <span>
                          {f.text}
                          <span className="note">
                            {' '}
                            ·{' '}
                            <Link
                              className="link"
                              to={`${STAGE_PATH[f.stage]}${f.stage === 1 ? '' : '/' + reference}`}
                            >
                              Stage {f.stage} · {f.source}
                            </Link>
                            {f.ref ? ` · ${f.ref}` : ''} · {f.owner === 'Buyer' ? 'you' : 'vendor'} to act
                          </span>
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
