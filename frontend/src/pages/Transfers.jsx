/*
 * Stage 6 · International transfer assessment (steps 25–28), to the client's specification.
 *
 *  - Step 25: the transfer-route register (18 fields per route) and the visual data-flow map
 *  - Step 26: the legal decision sequence for each route (12 decision fields)
 *  - Step 27: the route table (10 fields) with the six statuses, and the questions to resolve
 *  - Step 28: each route saved on its own; the buyer's confirmed facts give a new route version
 *
 * No route is ever shown as legally cleared.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import { statusTone, controlTone, CONTROL_LABEL } from '../lib/transfers.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';
import CountryPicker from '../components/requirements/CountryPicker.jsx';

const STEPS = [
  [25, 'Map routes'],
  [26, 'Legal decision'],
  [27, 'Findings'],
  [28, 'Saved'],
];

/* ================================================================== */
/*  Stage 6 landing page                                              */
/* ================================================================== */

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
        title="International transfer assessment"
        lead="Who sends your data to whom, in which country, and what makes each route lawful — route by route, entity by entity."
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

/* ================================================================== */
/*  Stage 6 for one assessment                                        */
/* ================================================================== */

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
  const lastDoneStep = result ? 28 : 24;

  return (
    <div className="vs">
      <Link className="link" to="/transfers" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        ← Transfer assessment
      </Link>

      <PageHead
        eyebrow={`Buyer · Stage 6 · Transfer assessment · ${state.assessment.reference}`}
        title={state.assessment.title}
        lead={
          state.vendor
            ? `Data routes with ${state.vendor.name} and its onward recipients`
            : 'No vendor selected yet.'
        }
        right={<ReferenceTag value={state.assessment.reference} />}
      />

      <ol className="vs-steps" aria-label="Stage 6 steps">
        {STEPS.map(([number, title]) => (
          <li key={number} className={number <= lastDoneStep ? 'done' : ''}>
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

      {result && result.legacy ? <LegacyResult result={result} /> : null}

      {result && !result.legacy ? (
        <>
          <VersionBar state={state} onPick={load} />
          <SummaryCard result={result} statuses={state.statuses} />
          <FlowMap result={result} />
          <RoutesCard state={state} reference={ref} onChange={setState} />
          <QuestionsCard result={result} />

          <div className="card rq-next">
            <Icon n="clock" s={20} />
            <div>
              <b>Stage 6 is complete for this assessment. Next: Stage 7 — Risk identification.</b>{' '}
              <span className="note">Every open route becomes part of the risk register.</span>
            </div>
            <Link className="btn primary" to={'/risks/' + state.assessment.reference} data-act="go-risks">
              Open risk register
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Start, version and summary                                        */
/* ------------------------------------------------------------------ */

function RunCard({ isUpdate, busy, onRun }) {
  return (
    <section className="card pad stack" data-section="transfers-run">
      <h2 style={{ margin: 0 }}>
        {isUpdate ? 'Something has changed since the last assessment' : 'Step 25 · Map the data flows'}
      </h2>
      <p style={{ margin: 0 }}>
        OffshoreAssure builds a route for each legal entity that receives the data: your supplier, its teams
        in other countries, its sub-processors and its cloud hosts. For each route it follows the legal
        decision sequence: regime, who sends and receives, restricted-transfer test, UK adequacy, safeguard or
        exception, transfer risk assessment and the signed instrument.
      </p>
      <ul className="cp-facts">
        <li>
          <Icon n="globe" s={15} />
          Actual entities, not country ratings
        </li>
        <li>
          <Icon n="doc" s={15} />
          IDTA / UK Addendum and TRA checked
        </li>
        <li>
          <Icon n="shield" s={15} />
          Never shown as legally cleared
        </li>
      </ul>
      <div>
        <button className="btn primary" onClick={onRun} disabled={busy} data-act="run-transfers">
          {busy ? 'Assessing…' : isUpdate ? 'Assess the routes again' : 'Run transfer assessment'}
        </button>
      </div>
    </section>
  );
}

/* A result saved with the earlier draft rules. */
function LegacyResult({ result }) {
  return (
    <section className="card pad stack" data-section="transfers-legacy">
      <h2 style={{ margin: 0 }}>Transfer assessment v{result.label} (earlier rules)</h2>
      <p className="note" style={{ margin: 0 }}>
        Saved with the earlier draft rules ({result.rulePackVersion}). Run the assessment again to apply the
        client’s specification: routes between legal entities and the legal decision sequence.
      </p>
      <ul className="cp-gaps">
        {result.routes.map(route => (
          <li key={route.id}>
            <span className="b b-mute">{route.statusLabel}</span>
            <span>
              {route.id} · {route.fromName} → {route.toName}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VersionBar({ state, onPick }) {
  const result = state.result;

  return (
    <section className="card pad ca-version" data-section="transfers-version">
      <div className="ca-version-main">
        <Icon n="globe" s={20} />
        <div>
          <b>Transfer Assessment Register v{result.label}</b>
          <div className="note">
            Saved {fmtTime(result.createdAt)} by {result.createdBy} · {result.totals.routes} routes
            {result.totals.changedRoutes ? ` · ${result.totals.changedRoutes} reassessed` : ''} · rule pack{' '}
            {result.rulePackVersion}
          </div>
          <div className="note">
            Fingerprint <span className="mono">{result.snapshotSha256.slice(0, 16)}…</span>
          </div>
        </div>
      </div>

      {state.versions.length > 1 ? (
        <select
          aria-label="Register version"
          value={result.version}
          onChange={e => onPick(Number(e.target.value))}
        >
          {state.versions.map(v => (
            <option key={v.version} value={v.version}>
              v{v.label} · {v.overall.label}
              {v.version === state.versions[0].version ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}

function SummaryCard({ result, statuses }) {
  const { totals } = result;

  // One figure per status, in the order of the specification.
  const figures = [
    ['NO_RESTRICTED_TRANSFER', totals.noRestrictedTransfer],
    ['ADEQUACY_ROUTE', totals.adequacy],
    ['SAFEGUARD_REVIEW', totals.safeguardReview],
    ['EXCEPTION_REVIEW', totals.exceptionReview],
    ['INFORMATION_REQUIRED', totals.informationRequired],
    ['LEGAL_REVIEW_REQUIRED', totals.legalReviewRequired],
  ];

  return (
    <section className="card cp-result" data-section="transfers-summary">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Steps 25–27 · Route-by-route legal findings</div>
          <h2 className="prf-title" style={{ margin: '4px 0' }}>
            {totals.routes} route{totals.routes === 1 ? '' : 's'}, {totals.restricted} restricted
          </h2>
          <span className={'b ' + statusTone(result.overall.status)}>
            Most serious: {result.overall.label}
          </span>
        </div>
      </div>

      <div className="ca-figures">
        {figures.map(([status, value]) => (
          <div key={status} className={value && statuses[status].rank >= 4 ? 'warn' : ''}>
            <b>{value}</b>
            <span>{statuses[status].label}</span>
          </div>
        ))}
      </div>

      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {result.note}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 25 · the visual data-flow map                                */
/* ------------------------------------------------------------------ */

const NODE_W = 190;
const NODE_H = 54;
const COL_GAP = 120;
const ROW_GAP = 22;

/*
 * Draws the entities as boxes in columns (buyer → supplier → onward recipients) and each route as a line
 * coloured by its status. The layout is worked out from the routes, so it follows the data, not a template.
 */
function FlowMap({ result }) {
  const { nodes, edges } = result.flowMap;
  if (!nodes.length) return null;

  // Column of each node: how many routes away from the buyer.
  const depth = {};
  const start = nodes.find(n => n.kind === 'buyer') || nodes[0];
  depth[start.id] = 0;
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      if (depth[edge.from] != null && depth[edge.to] == null) depth[edge.to] = depth[edge.from] + 1;
    }
  }
  for (const node of nodes) if (depth[node.id] == null) depth[node.id] = 1;

  const columns = [];
  for (const node of nodes) (columns[depth[node.id]] ||= []).push(node);

  const tallest = Math.max(...columns.map(column => column.length));
  const height = tallest * (NODE_H + ROW_GAP) + ROW_GAP;
  const width = columns.length * NODE_W + (columns.length - 1) * COL_GAP + 20;

  // Centre each column vertically.
  const position = {};
  columns.forEach((column, c) => {
    const top = (height - column.length * (NODE_H + ROW_GAP) + ROW_GAP) / 2;
    column.forEach((node, r) => {
      position[node.id] = { x: 10 + c * (NODE_W + COL_GAP), y: top + r * (NODE_H + ROW_GAP) };
    });
  });

  return (
    <section className="card" data-section="transfers-map">
      <div className="ch">
        <div>
          <h2>Step 25 · Data-flow map</h2>
          <div className="sub">Each box is a legal entity; each line is a route, coloured by its status.</div>
        </div>
      </div>
      <div className="tr-map-wrap">
        <svg
          className="tr-map"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Data-flow map"
          style={{ minWidth: Math.min(width, 640) }}
        >
          {edges.map(edge => {
            const a = position[edge.from];
            const b = position[edge.to];
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <g key={edge.routeId} className={'tr-edge ' + statusTone(edge.status)}>
                <path d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} />
                {/* The label sits just before the receiving box, so labels never pile up where lines fan out. */}
                <text x={x2 - 6} y={y2 - 6} textAnchor="end">
                  {edge.routeId}
                </text>
              </g>
            );
          })}
          {nodes.map(node => {
            const p = position[node.id];
            return (
              <g key={node.id} className={'tr-node tr-' + node.kind} transform={`translate(${p.x},${p.y})`}>
                <rect width={NODE_W} height={NODE_H} rx={8} />
                <text x={10} y={22} className="tr-node-name">
                  {node.name.length > 26 ? node.name.slice(0, 25) + '…' : node.name}
                </text>
                <text x={10} y={40} className="tr-node-country">
                  {node.countryName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 27 · the route table, and each route's details               */
/* ------------------------------------------------------------------ */

function RoutesCard({ state, reference, onChange }) {
  const { result } = state;
  const [open, setOpen] = useState(null);

  return (
    <section className="card" data-section="transfers-routes">
      <div className="ch">
        <div>
          <h2>Step 27 · Transfer findings</h2>
          <div className="sub">
            Open a route to see the decision sequence, confirm facts and see its versions.
          </div>
        </div>
      </div>
      <div className="tw">
        <table className="tr-table">
          <thead>
            <tr>
              <th>Route ID</th>
              <th>Exporter</th>
              <th>Importer</th>
              <th>Destination</th>
              <th>Restricted transfer</th>
              <th>Legal mechanism</th>
              <th>Safeguard status</th>
              <th>Missing documents</th>
              <th>Rationale</th>
              <th>Required action</th>
            </tr>
          </thead>
          <tbody>
            {result.routes.map(route => (
              <Fragment key={route.key}>
                <tr
                  className="click"
                  data-route={route.key}
                  onClick={() => setOpen(open === route.key ? null : route.key)}
                >
                  <td className="mono">
                    {route.id}
                    <div className="note">v{route.routeVersion}</div>
                    <span className={'b ' + statusTone(route.status)}>{route.statusLabel}</span>
                  </td>
                  <td>{route.output.exporter}</td>
                  <td>{route.output.importer}</td>
                  <td>{route.output.destination}</td>
                  <td>{route.output.restrictedTransferStatus}</td>
                  <td>{route.output.legalMechanism}</td>
                  <td>{route.output.safeguardStatus}</td>
                  <td>
                    {route.output.missingDocuments.length ? route.output.missingDocuments.join('; ') : '—'}
                  </td>
                  <td className="note">{route.output.rationale}</td>
                  <td>{route.output.requiredAction}</td>
                </tr>
                {open === route.key ? (
                  <tr className="ob-detail-row">
                    <td colSpan={10}>
                      <RouteDetail route={route} state={state} reference={reference} onChange={onChange} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RouteDetail({ route, state, reference, onChange }) {
  const { roles, frequencies, safeguards, instrumentStatuses, traStatuses, outcomes } = state;
  const d = route.decision;
  const list = codes => (codes?.length ? codes.join(', ') : '—');

  return (
    <div className="ob-detail tr-detail" data-section="route-detail">
      <div className="tr-cols">
        {/* Step 25: the 18 route fields. */}
        <div>
          <h3>Route (step 25)</h3>
          <dl className="ob-fields">
            <dt>Exporter</dt>
            <dd>
              {route.exporter.name} · {route.exporterCountry} · {roles[route.exporterRole]}
            </dd>
            <dt>Importer</dt>
            <dd>
              {route.importer.name} · {route.importerCountry} · {roles[route.importerRole]}
              {route.importer.confirmed === false ? (
                <span className="note"> (entity not confirmed)</span>
              ) : null}
            </dd>
            <dt>Data subjects</dt>
            <dd>{list(route.dataSubjectCategories)}</dd>
            <dt>Data categories</dt>
            <dd>{list(route.dataCategories)}</dd>
            <dt>Sensitivity</dt>
            <dd>{route.dataSensitivity.replace(/_/g, ' ').toLowerCase()}</dd>
            <dt>Purpose</dt>
            <dd>{route.processingPurpose}</dd>
            <dt>Storage location</dt>
            <dd>{list(route.storageLocation)}</dd>
            <dt>Remote-access location</dt>
            <dd>{list(route.remoteAccessLocation)}</dd>
            <dt>Onward recipients</dt>
            <dd>
              {route.onwardRecipients.length
                ? route.onwardRecipients.map(r => `${r.name} (${r.country})`).join('; ')
                : 'None'}
            </dd>
            <dt>Frequency</dt>
            <dd>{frequencies[route.transferFrequency]}</dd>
            <dt>Encryption / access</dt>
            <dd>
              {Object.entries(CONTROL_LABEL).map(([key, label]) => (
                <span
                  key={key}
                  className={'b ' + controlTone(route.encryptionAccessControls[key])}
                  style={{ marginRight: 4 }}
                >
                  {label}: {route.encryptionAccessControls[key].replace(/_/g, ' ').toLowerCase()}
                </span>
              ))}
            </dd>
            <dt>Sub-processor</dt>
            <dd>
              {route.subprocessorRelationship.isSubprocessor ? 'Yes' : 'No'}
              {route.subprocessorRelationship.reference
                ? ` · ${route.subprocessorRelationship.reference}`
                : ''}
            </dd>
            <dt>Proposed safeguard</dt>
            <dd>{safeguards[d.safeguardType] || (d.safeguardType === 'NOT_NEEDED' ? 'Not needed' : '—')}</dd>
            <dt>From</dt>
            <dd className="note">{route.sources.join('; ')}</dd>
          </dl>
        </div>

        {/* Step 26: the decision sequence and its 12 fields. */}
        <div>
          <h3>Legal decision (step 26)</h3>
          <ol className="tr-seq">
            {route.sequence.map(s => (
              <li key={s.step}>
                <span className="journey-n">{s.step}</span>
                <div>
                  <b>{s.question}</b> <span className="b b-mute">{s.answer}</span>
                  {s.note ? <div className="note">{s.note}</div> : null}
                </div>
              </li>
            ))}
          </ol>
          <p>
            <span className={'b ' + statusTone(route.status)}>{route.statusLabel}</span>{' '}
            <span className="note">{outcomes[route.outcome]}</span>
          </p>
          <dl className="ob-fields">
            <dt>Regime</dt>
            <dd>
              {
                { UK_GDPR: 'UK GDPR', NOT_APPLICABLE: 'Not applicable', OTHER: 'Other law' }[
                  d.applicableRegime
                ]
              }
            </dd>
            <dt>Initiator</dt>
            <dd>{d.transferInitiator}</dd>
            <dt>Separate entity</dt>
            <dd>{{ YES: 'Yes', NO: 'No', UNKNOWN: 'Not known' }[d.separateEntityTest]}</dd>
            <dt>Restricted transfer</dt>
            <dd>{route.output.restrictedTransferStatus}</dd>
            <dt>Adequacy</dt>
            <dd>{d.adequacyStatus.replace(/_/g, ' ').toLowerCase()}</dd>
            <dt>Safeguard</dt>
            <dd>{safeguards[d.safeguardType] || d.safeguardType || '—'}</dd>
            <dt>Instrument</dt>
            <dd>{instrumentStatuses[d.instrumentStatus]}</dd>
            <dt>TRA</dt>
            <dd>
              {traStatuses[d.traStatus]}
              {route.record.traReference ? ` · ${route.record.traReference}` : ''}
            </dd>
            <dt>Extra measures</dt>
            <dd>{d.supplementaryMeasures.length ? d.supplementaryMeasures.join('; ') : '—'}</dd>
            <dt>Onward transfers</dt>
            <dd>
              {
                { NONE: 'None', ASSESSED_SEPARATELY: 'Assessed as separate routes', UNKNOWN: 'Not known' }[
                  d.onwardTransferStatus
                ]
              }
            </dd>
            <dt>Legal review</dt>
            <dd>
              {
                { NOT_REQUIRED: 'Not required', REQUIRED: 'Required', COMPLETED: 'Completed' }[
                  d.legalReviewStatus
                ]
              }
            </dd>
          </dl>
        </div>
      </div>

      {/* Step 28: what is stored for this route. */}
      <p className="note">
        <Icon n="shield" s={13} /> Route version {route.routeVersion} · rule {route.record.ruleVersion}
        {route.record.reviewer ? ` · confirmed by ${route.record.reviewer}` : ''}
        {route.record.documentReferences.length
          ? ` · documents: ${route.record.documentReferences.join('; ')}`
          : ''}
      </p>

      {state.latest ? (
        <FactsForm route={route} state={state} reference={reference} onChange={onChange} />
      ) : null}
      <RouteHistory routeKey={route.key} reference={reference} version={route.routeVersion} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Facts the buyer confirms (step 28: a new route version)           */
/* ------------------------------------------------------------------ */

function FactsForm({ route, state, reference, onChange }) {
  const facts = route.facts || {};
  const [open, setOpen] = useState(false);
  const [countries, setCountries] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The form starts from the facts already confirmed.
  const [form, setForm] = useState({
    importerName: facts.importerName || '',
    importerCountry: facts.importerCountry || '',
    importerRole: facts.importerRole || '',
    separateEntity: facts.separateEntity || '',
    transferFrequency: facts.transferFrequency || '',
    adequacyEligibility: facts.adequacyEligibility || '',
    safeguardType: facts.safeguardType || '',
    instrumentStatus: facts.instrumentStatus || '',
    traStatus: facts.traStatus || '',
    traReference: facts.traReference || '',
    supplementaryMeasures: facts.supplementaryMeasures || '',
    exceptionBasis: facts.exceptionBasis || '',
    documentReferences: (facts.documentReferences || []).join('; '),
    legalReviewNote: '',
    reason: '',
  });
  const set = key => e => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    if (open && !countries)
      api('/reference')
        .then(r => setCountries(r.countries))
        .catch(() => setCountries([]));
  }, [open, countries]);

  async function save() {
    // Only send the facts that were filled in or changed.
    const body = { reason: form.reason };
    for (const [key, value] of Object.entries(form)) {
      if (key === 'reason' || key === 'documentReferences') continue;
      if (value && value !== (facts[key] || '')) body[key] = value;
    }
    const refs = form.documentReferences
      .split(';')
      .map(x => x.trim())
      .filter(Boolean);
    if (refs.join(';') !== (facts.documentReferences || []).join(';')) body.documentReferences = refs;

    setBusy(true);
    setError('');
    try {
      onChange(
        await api(`/assessments/${reference}/transfers/routes/${encodeURIComponent(route.key)}/facts`, {
          method: 'POST',
          body,
        }),
      );
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn sm" onClick={() => setOpen(true)} data-act="route-facts">
        Confirm facts for {route.id}
      </button>
    );
  }

  const options = (map, label = 'Not confirmed') => [
    <option key="" value="">
      {label}
    </option>,
    ...Object.entries(map).map(([value, text]) => (
      <option key={value} value={value}>
        {text}
      </option>
    )),
  ];

  return (
    <div className="ob-edit stack tr-facts" data-section="route-facts">
      <h3 style={{ margin: 0 }}>Confirm facts for {route.id}</h3>
      <p className="note" style={{ margin: 0 }}>
        New entities, locations or safeguards give the route a new version and it is assessed again. An
        unsigned IDTA, or naming a country as adequate without checking the recipient is covered, does not
        satisfy the assessment.
      </p>

      <div className="tr-form-grid">
        <label>
          Receiving legal entity
          <input
            value={form.importerName}
            maxLength={200}
            onChange={set('importerName')}
            placeholder={route.importer.name}
          />
        </label>
        <label>
          Country
          {countries ? (
            <CountryPicker
              value={form.importerCountry}
              onChange={value => setForm({ ...form, importerCountry: value })}
              countries={countries}
            />
          ) : (
            <Loading />
          )}
        </label>
        <label>
          Role of the receiver
          <select value={form.importerRole} onChange={set('importerRole')}>
            {options(state.roles)}
          </select>
        </label>
        <label>
          Separate legal entity from the sender?
          <select value={form.separateEntity} onChange={set('separateEntity')}>
            <option value="">Not confirmed</option>
            <option value="YES">Yes, a separate company</option>
            <option value="NO">No, the sender’s own staff</option>
          </select>
        </label>
        <label>
          How often
          <select value={form.transferFrequency} onChange={set('transferFrequency')}>
            {options(state.frequencies)}
          </select>
        </label>
        {route.decision.adequacyStatus.startsWith('CONDITION') ? (
          <label>
            Adequacy eligibility (for example DPF UK Extension)
            <select value={form.adequacyEligibility} onChange={set('adequacyEligibility')}>
              <option value="">Not confirmed</option>
              <option value="CONFIRMED">Confirmed with evidence</option>
              <option value="NOT_CONFIRMED">Not covered</option>
            </select>
          </label>
        ) : null}
        <label>
          Safeguard
          <select value={form.safeguardType} onChange={set('safeguardType')}>
            {options(state.safeguards, 'As found in the contract')}
          </select>
        </label>
        <label>
          Instrument
          <select value={form.instrumentStatus} onChange={set('instrumentStatus')}>
            <option value="">As found in the contract</option>
            <option value="EXECUTED">Executed (signed)</option>
            <option value="DRAFT">Draft (not signed)</option>
            <option value="NOT_PROVIDED">Not provided</option>
          </select>
        </label>
        <label>
          Transfer risk assessment
          <select value={form.traStatus} onChange={set('traStatus')}>
            <option value="">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label>
          TRA reference
          <input
            value={form.traReference}
            maxLength={200}
            onChange={set('traReference')}
            placeholder="TRA-IN-2026-01"
          />
        </label>
      </div>

      <label>
        Extra measures (encryption, pseudonymisation, access limits …)
        <input value={form.supplementaryMeasures} maxLength={500} onChange={set('supplementaryMeasures')} />
      </label>
      {form.safeguardType === 'EXCEPTION' ? (
        <label>
          Why the exception applies
          <textarea rows={2} value={form.exceptionBasis} maxLength={1000} onChange={set('exceptionBasis')} />
        </label>
      ) : null}
      <label>
        Document references (separate with ;)
        <input
          value={form.documentReferences}
          onChange={set('documentReferences')}
          placeholder="IDTA signed 3 Nov 2026; Subprocessor register v4"
        />
      </label>
      <label>
        Legal review conclusion (only for a legal reviewer)
        <textarea rows={2} value={form.legalReviewNote} maxLength={1000} onChange={set('legalReviewNote')} />
      </label>
      <label>
        Where these facts come from
        <textarea
          rows={2}
          value={form.reason}
          maxLength={1000}
          onChange={set('reason')}
          placeholder="For example: the vendor's subprocessor register dated 1 Nov 2026"
        />
      </label>

      {error ? <span className="form-err">{error}</span> : null}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" disabled={busy} onClick={save} data-act="save-route-facts">
          {busy ? 'Saving…' : 'Save and assess again'}
        </button>
        <button className="btn sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* Every saved version of one route, with the facts behind each change. */
function RouteHistory({ routeKey, reference, version }) {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    api(`/assessments/${reference}/transfers/routes/${encodeURIComponent(routeKey)}`)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, [routeKey, reference, version]);

  if (!history || history.versions.length < 2) return null;

  return (
    <div data-section="route-history">
      <h3 style={{ margin: '10px 0 6px' }}>Route versions</h3>
      <ul className="cp-gaps">
        {history.versions.map(v => (
          <li key={v.routeVersion}>
            <span className={'b ' + statusTone(v.status)}>v{v.routeVersion}</span>
            <span>
              {v.statusLabel} · register v{v.registerVersion}.0 · {fmtTime(v.createdAt)}
              {v.record.reviewer ? ` · ${v.record.reviewer}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {history.facts.length ? (
        <p className="note">
          Facts confirmed:{' '}
          {history.facts
            .map(f => `v${f.version} by ${f.createdBy} (${fmtTime(f.createdAt)}): ${f.reason}`)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Questions to resolve                                              */
/* ------------------------------------------------------------------ */

function QuestionsCard({ result }) {
  if (!result.questions.length) return null;

  const forBuyer = result.questions.filter(q => q.to === 'buyer');
  const forVendor = result.questions.filter(q => q.to === 'vendor');

  return (
    <section className="card" data-section="transfers-questions">
      <div className="ch">
        <div>
          <h2>Questions to resolve</h2>
          <div className="sub">These become actions in Stage 8 once the risk register is built.</div>
        </div>
        <span className="note">{result.questions.length}</span>
      </div>
      <div className="tr-cols pad" style={{ paddingTop: 0 }}>
        {[
          ['For you (the buyer)', forBuyer],
          ['For the vendor', forVendor],
        ].map(([title, list]) => (
          <div key={title}>
            <h3>{title}</h3>
            {list.length ? (
              <ul className="cp-gaps">
                {list.map((q, index) => (
                  <li key={index}>
                    <span className="mono">{q.routeId}</span>
                    <span>{q.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">None.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
