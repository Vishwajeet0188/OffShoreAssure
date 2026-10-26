import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { CLASS_LABEL, TIER_LABEL, TIER_TONE, serviceLabel } from '../../lib/assessments.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { BackArrow } from '../../components/common/Icon.jsx';
import AssessmentResult from '../../components/requirements/AssessmentResult.jsx';
import ProfilePanel from '../../components/requirements/ProfilePanel.jsx';
import { ELIGIBILITY, SELECTION_STATUS, SOURCE_LABEL } from '../../lib/selection.js';
import InformationRequired from '../../components/requirements/InformationRequired.jsx';
import Loading from '../../components/extras/Loading.jsx';
import { POSITION_TONE, shortHash } from '../../lib/reports.js';

/* Admin · Assessments across every buyer organisation (Stage 1 · Step 2 onwards). */
export default function AdminAssessments() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    api('/admin/assessments' + (search ? '?search=' + encodeURIComponent(search) : ''))
      .then(setD)
      .catch(x => setErr(x.message));
  }, [search]);
  return (
    <>
      <PageHead
        eyebrow="Admin console · Buyers"
        title="Assessments"
        lead="Every assessment created from a buyer's submitted requirement, with the engine's validation result and preliminary risk tier."
      />
      {d ? (
        <div className="adm-tiles adm-tiles-4">
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(t => (
            <div key={t} className="adm-tile">
              <span className="adm-tile-l">{TIER_LABEL[t]} risk</span>
              <span className="adm-tile-n">{d.byRiskTier[t] || 0}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="card">
        <div className="ch">
          <input
            type="search"
            aria-label="Search assessments"
            placeholder="Search ID, title or buyer"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 340 }}
          />
          <span className="note">
            {d ? `${d.assessments.length} assessment${d.assessments.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
        {err ? (
          <p className="form-err" style={{ padding: '0 20px' }}>
            {err}
          </p>
        ) : null}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Assessment ID</th>
                <th>Title</th>
                <th>Buyer</th>
                <th>Service</th>
                <th>Classification</th>
                <th>Risk tier</th>
                <th>Vendor</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {!d ? (
                <tr>
                  <td colSpan="8" className="note">
                    Loading…
                  </td>
                </tr>
              ) : d.assessments.length === 0 ? (
                <tr>
                  <td colSpan="8" className="note">
                    No assessments yet. They appear when a buyer submits a requirement.
                  </td>
                </tr>
              ) : (
                d.assessments.map(a => (
                  <tr
                    key={a.id}
                    className="click"
                    onClick={() => navigate('/admin/assessments/' + a.reference)}
                  >
                    <td className="mono">
                      <Link
                        className="adm-ulink"
                        to={'/admin/assessments/' + a.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b>{a.reference}</b>
                      </Link>
                    </td>
                    <td>{a.title}</td>
                    <td>{a.buyerName}</td>
                    <td>{serviceLabel(a.serviceCode)}</td>
                    <td>{CLASS_LABEL[a.dataClassification]}</td>
                    <td>
                      <span className={'b b-' + TIER_TONE[a.riskTier]}>{TIER_LABEL[a.riskTier]}</span>
                    </td>
                    <td>
                      {a.selectedVendor ? (
                        <b>{a.selectedVendor}</b>
                      ) : (
                        <span className="muted">Not selected</span>
                      )}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {fmtTime(a.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function AdminAssessmentDetail() {
  const { ref } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/admin/assessments/' + encodeURIComponent(ref))
      .then(setD)
      .catch(x => setErr(x.message));
  }, [ref]);
  const back = (
    <Link
      className="link"
      to="/admin/assessments"
      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
    >
      <BackArrow s={14} /> Assessments
    </Link>
  );
  if (err)
    return (
      <>
        {back}
        <p className="form-err">{err}</p>
      </>
    );
  if (!d) return <Loading />;
  const a = d.assessment;
  return (
    <>
      {back}
      <PageHead
        eyebrow={'Admin console · ' + a.buyerName}
        title={a.title}
        lead={`Submitted by ${a.createdByEmail}`}
      />
      {d.summary ? <InformationRequired s={d.summary} link={false} /> : null}
      {d.selection ? <SelectionPanel s={d.selection} /> : null}
      {d.compliance?.compliance ? <CompliancePanel s={d.compliance} /> : null}
      {d.contract?.versions.length ? <ContractPanel state={d.contract} /> : null}
      {d.obligations?.register ? <ObligationsPanel state={d.obligations} /> : null}
      {d.transfers?.result ? <TransfersPanel state={d.transfers} /> : null}
      {d.risks?.register ? <RisksPanel state={d.risks} /> : null}
      {d.remediation?.actions?.length ? <RemediationPanel state={d.remediation} /> : null}
      {d.report?.versions?.length || d.report?.monitoring?.checks?.length ? (
        <ReportPanel state={d.report} />
      ) : null}
      <AssessmentResult a={a} buyerName={a.buyerName} />
      {d.profiles ? (
        <ProfilePanel profiles={d.profiles} timeline={d.timeline} catalogue={d.controlCatalogue} />
      ) : null}
    </>
  );
}

/* Stage 2 for the admin: candidates and the saved Vendor Selection Record (read-only). */
function SelectionPanel({ s }) {
  const cur = s.current;
  const status = cur && SELECTION_STATUS[cur.status];
  return (
    <section className="card" data-section="admin-selection">
      <div className="ch">
        <div>
          <h2>Stage 2 · Vendor selection</h2>
          <div className="sub">
            {cur
              ? `Vendor Selection Record v${cur.recordVersion} saved ${fmtTime(cur.selectedAt)} by ${cur.selectedByEmail}`
              : 'No vendor selected yet'}
          </div>
        </div>
        {cur ? (
          <Badge
            s={status ? status[0] : 'Complete'}
            label={`${status ? status[1] : 'Selected'}: ${cur.vendor.name}`}
          />
        ) : (
          <Badge
            s="Pending"
            label={`${s.candidates.length} candidate${s.candidates.length === 1 ? '' : 's'}`}
          />
        )}
      </div>
      {cur ? (
        <div className="asr-block">
          <h3>Reason</h3>
          <p style={{ margin: 0 }}>{cur.rationale}</p>
          <p className="note">
            Source: {SOURCE_LABEL[cur.source] || cur.source}
            {cur.approver ? ` · approved by ${cur.approver.fullName || cur.approver.email}` : ''}
          </p>
          {cur.exceptionReason ? <p className="note">Exception: {cur.exceptionReason}</p> : null}
          {cur.conditions.length ? <p className="note">Conditions: {cur.conditions.join(' ')}</p> : null}
          {cur.changeReason ? <p className="note">Change reason: {cur.changeReason}</p> : null}
        </div>
      ) : null}
      {s.candidates.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Source</th>
                <th>Eligibility</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {s.candidates.map(v => (
                <tr key={v.id}>
                  <td>
                    <Link className="adm-ulink" to={'/admin/vendors/' + v.id}>
                      <b>{v.name}</b>
                    </Link>
                    {cur?.vendorId === v.id ? (
                      <span className="b b-plum" style={{ marginLeft: 8 }}>
                        Selected
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {SOURCE_LABEL[v.candidateSource]}
                    {v.rank ? ` · #${v.rank}` : ''}
                  </td>
                  <td>
                    <Badge s={ELIGIBILITY[v.fit.eligibility][0]} label={ELIGIBILITY[v.fit.eligibility][1]} />
                  </td>
                  <td className="mono">
                    {fmtTime(v.addedAt)} · {v.addedByEmail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {s.versions.length > 1 ? (
        <div className="asr-block">
          <h3>Earlier records</h3>
          <ul>
            {s.versions.slice(0, -1).map(v => (
              <li key={v.id}>
                v{v.recordVersion} · {v.vendor.name} · {fmtTime(v.selectedAt)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* Stage 3 for the admin: status, provisional score and gaps (read-only). */
function CompliancePanel({ s }) {
  const c = s.compliance,
    r = s.result;
  return (
    <section className="card" data-section="admin-compliance">
      <div className="ch">
        <div>
          <h2>Stage 3 · Compliance assessment</h2>
          <div className="sub">
            {s.vendor?.name} · started {fmtTime(c.startedAt)} · {c.progress.answered}/{c.progress.total}{' '}
            answered · {c.progress.evidence} documents
          </div>
        </div>
        {r ? (
          <Badge
            s={r.overall >= 60 ? 'Approved' : r.overall >= 40 ? 'Attention' : 'Restricted'}
            label={`${r.overall}/100 · ${r.rating.label}`}
          />
        ) : (
          <Badge s="Pending" label="Waiting for the vendor" />
        )}
      </div>
      {r ? (
        <>
          <div className="asr-block">
            <h3>Score by area</h3>
            <ul className="cp-bars">
              {r.areas.map(a => (
                <li key={a.id}>
                  <span className="cp-bar-l">{a.label}</span>
                  <span className="cp-bar-t">
                    <i style={{ width: Math.max(a.score, 2) + '%' }} className={a.score < 60 ? 'low' : ''} />
                  </span>
                  <b className="mono">{a.score}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="asr-block">
            <h3>Gaps ({r.gaps.length})</h3>
            {r.gaps.length ? (
              <ul>
                {r.gaps.map((g, i) => (
                  <li key={i}>{g.text}</li>
                ))}
              </ul>
            ) : (
              <p className="note" style={{ margin: 0 }}>
                None.
              </p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

/* Stage 4 for the admin: contract versions and the latest analysis (read-only). */
function ContractPanel({ state }) {
  const latest = state.versions[0];
  const { totals, notFound } = state.analysis;

  return (
    <section className="card" data-section="admin-contract">
      <div className="ch">
        <div>
          <h2>Stage 4 · Contract analysis</h2>
          <div className="sub">
            {latest.fileName} · version {latest.version} of {state.versions.length} · uploaded{' '}
            {fmtTime(latest.uploadedAt)} by {latest.uploadedBy}
          </div>
        </div>
        <Badge s="Complete" label={`${totals.clauses} clauses · ${totals.relevant} relevant`} />
      </div>
      <div className="asr-block">
        <h3>Topics not found ({notFound.length})</h3>
        {notFound.length ? (
          <ul>
            {notFound.map(item => (
              <li key={item.topicId}>{item.name}</li>
            ))}
          </ul>
        ) : (
          <p className="note" style={{ margin: 0 }}>
            None.
          </p>
        )}
      </div>
      <div className="asr-block">
        <h3>Versions</h3>
        <ul>
          {state.versions.map(v => (
            <li key={v.version}>
              v{v.version} · {v.fileName}
              {v.label ? ` (${v.label})` : ''} · {fmtTime(v.uploadedAt)}
              {v.changeReason ? <span className="note"> · {v.changeReason}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Stage 5 for the admin: the latest obligation register (read-only). */
function ObligationsPanel({ state }) {
  const register = state.register;
  const { totals } = register;

  return (
    <section className="card" data-section="admin-obligations">
      <div className="ch">
        <div>
          <h2>Stage 5 · Obligation extraction</h2>
          <div className="sub">
            Register v{register.version} from contract v{register.contractVersion} · saved{' '}
            {fmtTime(register.createdAt)}
          </div>
        </div>
        <Badge
          s="Complete"
          label={`${totals.obligations + totals.prohibitions + totals.rights} items · ${totals.rulesCovered}/${totals.rulesTotal} rules`}
        />
      </div>
      <div className="asr-block">
        <h3>By party</h3>
        <p style={{ margin: 0 }}>
          Vendor {totals.vendor} · Buyer {totals.buyer} · Both {totals.both} · Not clear {totals.unclear}
        </p>
      </div>
      <div className="asr-block">
        <h3>Gaps ({register.gaps.length})</h3>
        {register.gaps.length ? (
          <ul>
            {register.gaps.map(gap => (
              <li key={gap.ruleId}>{gap.text}</li>
            ))}
          </ul>
        ) : (
          <p className="note" style={{ margin: 0 }}>
            None.
          </p>
        )}
      </div>
    </section>
  );
}

/* Stage 6 for the admin: the latest transfer assessment (read-only). */
function TransfersPanel({ state }) {
  const result = state.result;
  return (
    <section className="card" data-section="admin-transfers">
      <div className="ch">
        <div>
          <h2>Stage 6 · Transfer assessment</h2>
          <div className="sub">
            Version {result.version} · saved {fmtTime(result.createdAt)} · {result.totals.routes} routes ·{' '}
            {result.totals.questions} questions
          </div>
        </div>
        <Badge
          s={
            result.overall.status === 'ADEQUATE' || result.overall.status === 'NOT_RESTRICTED'
              ? 'Complete'
              : 'Attention'
          }
          label={result.overall.label}
        />
      </div>
      <div className="asr-block">
        <h3>Routes</h3>
        <ul>
          {result.routes.map(route => (
            <li key={route.id}>
              {route.fromName} → {route.toName}: {route.statusLabel}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Stage 7 for the admin: the latest risk register (read-only). */
function RisksPanel({ state }) {
  const register = state.register;
  const word = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
  return (
    <section className="card" data-section="admin-risks">
      <div className="ch">
        <div>
          <h2>Stage 7 · Risk identification</h2>
          <div className="sub">
            Version {register.version} · saved {fmtTime(register.createdAt)} · {register.totals.risks} risks
            from {register.totals.findings} findings
          </div>
        </div>
        <Badge
          s={
            register.totals.critical || register.totals.high
              ? 'Restricted'
              : register.totals.risks
                ? 'Attention'
                : 'Complete'
          }
          label={'Highest: ' + register.overall.label}
        />
      </div>
      <div className="asr-block">
        <h3>Risks</h3>
        <ul>
          {register.risks.map(risk => (
            <li key={risk.id}>
              {risk.id} · {risk.title}: {word[risk.rating]} ({risk.likelihood} × {risk.impact} = {risk.score})
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Stage 8 for the admin: actions and the remaining risk (read-only). */
function RemediationPanel({ state }) {
  const t = state.residual.totals;
  return (
    <section className="card" data-section="admin-remediation">
      <div className="ch">
        <div>
          <h2>Stage 8 · Remediation</h2>
          <div className="sub">
            {t.actions} actions · {t.open + t.proposed} outstanding · {t.awaitingReview} to review ·{' '}
            {t.closed} closed · {t.accepted} accepted · {state.snapshots.length} snapshots
          </div>
        </div>
        <Badge
          s={t.open + t.proposed + t.awaitingReview ? 'Attention' : 'Complete'}
          label={'Remaining highest: ' + state.residual.overall.label}
        />
      </div>
      <div className="asr-block">
        <h3>Actions</h3>
        <ul>
          {state.actions.map(a => (
            <li key={a.number}>
              {a.code} · {a.title} ({a.owner}): {a.statusLabel}
              {a.dueOn ? ` · due ${a.dueOn}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ReportPanel({ state }) {
  const latest = state.report;
  return (
    <section className="card" data-section="admin-report">
      <div className="ch">
        <div>
          <h2>Stage 9 · Monitoring and audit</h2>
          <div className="sub">
            {state.versions.length} report version{state.versions.length === 1 ? '' : 's'} ·{' '}
            {state.monitoring.checks.length} monitoring check{state.monitoring.checks.length === 1 ? '' : 's'}{' '}
            · {state.monitoring.items.filter(i => i.severity !== 'low').length} item(s) need attention
          </div>
        </div>
        {latest ? (
          <span className={'b ' + POSITION_TONE[latest.position.code]}>{latest.position.label}</span>
        ) : null}
      </div>
      <div className="asr-block">
        <h3>Reports</h3>
        {state.versions.length ? (
          <ul>
            {state.versions.map(v => (
              <li key={v.version}>
                v{v.version}.0 · {fmtTime(v.createdAt)} · {v.reason} · {v.position.label}{' '}
                <span className="mono note">{shortHash(v.snapshotSha256)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">No report yet; the buyer chose to continue monitoring.</p>
        )}
      </div>
    </section>
  );
}
