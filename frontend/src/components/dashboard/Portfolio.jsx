import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { serviceLabel, TIER_LABEL, TIER_TONE } from '../../lib/assessments.js';
import { ratingTone } from '../../lib/risks.js';
import { POSITION_TONE } from '../../lib/reports.js';
import { Icon } from '../common/Icon.jsx';
import Loading from '../extras/Loading.jsx';

const RATINGS = [
  ['critical', 'Critical', 'b-coral'],
  ['high', 'High', 'b-coral'],
  ['medium', 'Medium', 'b-amber'],
  ['low', 'Low', 'b-sage'],
];
const ALERT_TONE = { high: 'b-coral', medium: 'b-amber', low: 'b-plum' };
/* The furthest stage an assessment has reached, so a click opens where the work is. */
const furthest = a =>
  (a.report
    ? '/monitoring/'
    : a.remediation
      ? '/remediation/'
      : a.risks
        ? '/risks/'
        : a.transfers
          ? '/transfers/'
          : a.obligations
            ? '/obligations/'
            : a.contract
              ? '/contract/'
              : a.compliance
                ? '/compliance/'
                : '/vendor-selection/') + a.reference;
const ALERT_WORD = { overdue: 'Overdue', expiry: 'Expiry', review: 'To review', decide: 'To decide' };

/*
 * Buyer dashboard (UI flow screen 1; Technical Architecture "Buyer dashboard":
 * one evidence-backed view of vendor risk, contract exposure, transfer decisions
 * and progress). Every number comes from the saved records.
 */
export default function Portfolio({ drafts }) {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ vendor: 'all', service: 'all', tier: 'all' });

  useEffect(() => {
    api('/assessments')
      .then(r => setAssessments(r.assessments))
      .catch(err => setError(err.message));
    api('/assessments/alerts')
      .then(r => setAlerts(r.alerts))
      .catch(() => setAlerts([]));
  }, []);

  const options = useMemo(() => {
    const list = assessments || [];
    return {
      vendors: [...new Set(list.map(a => a.selectedVendor).filter(Boolean))].sort(),
      services: [...new Set(list.map(a => a.serviceCode))].sort(),
      tiers: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].filter(t => list.some(a => a.riskTier === t)),
    };
  }, [assessments]);

  if (error) return <p className="form-err">{error}</p>;
  if (!assessments) return <Loading />;

  const visible = assessments.filter(
    a =>
      (filter.vendor === 'all' || a.selectedVendor === filter.vendor) &&
      (filter.service === 'all' || a.serviceCode === filter.service) &&
      (filter.tier === 'all' || a.riskTier === filter.tier),
  );
  const sum = (list, pick) => list.reduce((n, a) => n + (pick(a) || 0), 0);
  const highRisk = sum(visible, a => (a.risks?.totals?.critical || 0) + (a.risks?.totals?.high || 0));
  const outstanding = sum(visible, a => a.remediation?.open);
  const closed = sum(visible, a => a.remediation?.closed);
  const vendorsUnderReview = new Set(
    visible.filter(a => a.selectedVendor && !a.report).map(a => a.selectedVendor),
  ).size;
  const byRating = RATINGS.map(([key, label, tone]) => ({
    key,
    label,
    tone,
    count: sum(visible, a => a.risks?.totals?.[key]),
  }));
  const maxRating = Math.max(1, ...byRating.map(r => r.count));

  return (
    <>
      <div className="dash-tiles dash-tiles-wide" data-section="dash-figures">
        <Link className="dash-tile" to="/requirements">
          <span className="note">Requirements in draft</span>
          <b>{drafts ?? '—'}</b>
        </Link>
        <Link className="dash-tile" to="/requirements">
          <span className="note">Active assessments</span>
          <b>{visible.length}</b>
        </Link>
        <Link className="dash-tile" to="/contract">
          <span className="note">Contracts analysed</span>
          <b>{visible.filter(a => a.contract).length}</b>
        </Link>
        <Link className="dash-tile" to="/risks">
          <span className="note">High-risk issues</span>
          <b className={highRisk ? 'warn' : ''}>{highRisk}</b>
        </Link>
        <Link className="dash-tile" to="/remediation">
          <span className="note">Actions outstanding</span>
          <b>{outstanding}</b>
        </Link>
        <Link className="dash-tile" to="/vendor-selection">
          <span className="note">Vendors under review</span>
          <b>{vendorsUnderReview}</b>
        </Link>
      </div>

      <section className="card" data-section="dash-alerts">
        <div className="ch">
          <div>
            <h2>Needs your attention</h2>
            <div className="sub">
              Overdue actions, certificates or insurance expiring within 30 days, and work waiting for you.
            </div>
          </div>
          <span className="note">{alerts ? alerts.length : ''}</span>
        </div>
        {!alerts ? (
          <Loading pad />
        ) : alerts.length === 0 ? (
          <p className="note pad">Nothing needs your attention right now.</p>
        ) : (
          <ul className="mn-items">
            {alerts.slice(0, 8).map((x, i) => (
              <li key={i} className="mn-item dash-alert" data-alert={x.kind} onClick={() => navigate(x.path)}>
                <span className="mn-dot" />
                <div>
                  <b>{x.title}</b>
                  <div className="note">
                    {x.reference} · {x.detail}
                  </div>
                </div>
                <span className={'b ' + ALERT_TONE[x.severity]}>{ALERT_WORD[x.kind]}</span>
              </li>
            ))}
          </ul>
        )}
        {alerts && alerts.length > 8 ? (
          <p className="note pad" style={{ margin: 0 }}>
            and {alerts.length - 8} more.
          </p>
        ) : null}
      </section>

      <section className="card" data-section="dash-portfolio">
        <div className="ch">
          <div>
            <h2>Vendors and assessments</h2>
            <div className="sub">
              One row per assessment: compliance, risk, contract gaps, transfers, actions and the report.
            </div>
          </div>
          <span className="note">
            {visible.length} of {assessments.length}
          </span>
        </div>
        <div className="ca-filters">
          <select
            aria-label="Filter by vendor"
            value={filter.vendor}
            onChange={e => setFilter(f => ({ ...f, vendor: e.target.value }))}
            data-filter="vendor"
          >
            <option value="all">All vendors</option>
            {options.vendors.map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by service"
            value={filter.service}
            onChange={e => setFilter(f => ({ ...f, service: e.target.value }))}
            data-filter="service"
          >
            <option value="all">All services</option>
            {options.services.map(v => (
              <option key={v} value={v}>
                {serviceLabel(v)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by risk tier"
            value={filter.tier}
            onChange={e => setFilter(f => ({ ...f, tier: e.target.value }))}
            data-filter="tier"
          >
            <option value="all">All risk tiers</option>
            {options.tiers.map(v => (
              <option key={v} value={v}>
                {TIER_LABEL[v]}
              </option>
            ))}
          </select>
        </div>
        {visible.length === 0 ? (
          <p className="note pad">
            {assessments.length
              ? 'No assessments match.'
              : 'No assessments yet. Submit a requirement to create one.'}
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Vendor</th>
                  <th>Compliance</th>
                  <th>Highest risk</th>
                  <th>Contract gaps</th>
                  <th>Transfers</th>
                  <th>Actions</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(a => {
                  const gaps =
                    (a.contract?.totals?.expectedNotFound || 0) + (a.obligations?.totals?.gaps || 0);
                  return (
                    <tr
                      key={a.reference}
                      className="click"
                      onClick={() => navigate(furthest(a))}
                      data-ref={a.reference}
                    >
                      <td>
                        <b className="mono">{a.reference}</b>
                        <div className="note">
                          {a.title} · {serviceLabel(a.serviceCode)}
                        </div>
                        <span className={'b b-' + TIER_TONE[a.riskTier]}>{TIER_LABEL[a.riskTier]} tier</span>
                      </td>
                      <td>{a.selectedVendor || <span className="muted">Not selected</span>}</td>
                      <td>
                        {a.compliance?.overall != null ? (
                          <Link to={'/compliance/' + a.reference} onClick={e => e.stopPropagation()}>
                            <b>{a.compliance.overall}</b>/100
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {a.risks ? (
                          <Link
                            className={'b ' + ratingTone(a.risks.overall.rating)}
                            to={'/risks/' + a.reference}
                            onClick={e => e.stopPropagation()}
                          >
                            {a.risks.overall.label}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {a.contract ? (
                          <Link to={'/contract/' + a.reference} onClick={e => e.stopPropagation()}>
                            {gaps ? `${gaps} gap${gaps === 1 ? '' : 's'}` : 'None found'}
                          </Link>
                        ) : (
                          <span className="muted">No contract</span>
                        )}
                      </td>
                      <td>
                        {a.transfers ? (
                          <Link to={'/transfers/' + a.reference} onClick={e => e.stopPropagation()}>
                            {a.transfers.overall.label}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {a.remediation ? (
                          <Link to={'/remediation/' + a.reference} onClick={e => e.stopPropagation()}>
                            {a.remediation.open} open
                            {a.remediation.overdue ? (
                              <span className="b b-coral" style={{ marginLeft: 6 }}>
                                {a.remediation.overdue} overdue
                              </span>
                            ) : null}
                            <div className="note">{a.remediation.closed} closed</div>
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {a.report ? (
                          <Link
                            className={'b ' + POSITION_TONE[a.report.position.code]}
                            to={'/monitoring/' + a.reference}
                            onClick={e => e.stopPropagation()}
                          >
                            v{a.report.version}.0 · {a.report.position.label}
                          </Link>
                        ) : (
                          <span className="muted">Not yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="dash-charts">
        <section className="card" data-section="dash-risks-chart">
          <div className="ch">
            <div>
              <h2>Risks by rating</h2>
              <div className="sub">From the latest risk register of each assessment shown.</div>
            </div>
          </div>
          <div className="dash-bars">
            {byRating.map(r => (
              <div key={r.key} className="dash-bar" title={`${r.label}: ${r.count}`}>
                <span className="note">{r.label}</span>
                <span className="dash-bar-track">
                  <span
                    className={'dash-bar-fill ' + r.tone}
                    style={{ width: `${(r.count / maxRating) * 100}%` }}
                  />
                </span>
                <b>{r.count}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="card" data-section="dash-actions-chart">
          <div className="ch">
            <div>
              <h2>Actions</h2>
              <div className="sub">Open against closed or accepted, across the assessments shown.</div>
            </div>
          </div>
          <div className="dash-bars">
            {[
              ['Open', outstanding, 'b-amber'],
              ['Closed or accepted', closed, 'b-sage'],
            ].map(([label, count, tone]) => (
              <div key={label} className="dash-bar" title={`${label}: ${count}`}>
                <span className="note">{label}</span>
                <span className="dash-bar-track">
                  <span
                    className={'dash-bar-fill ' + tone}
                    style={{ width: `${(count / Math.max(1, outstanding + closed)) * 100}%` }}
                  />
                </span>
                <b>{count}</b>
              </div>
            ))}
          </div>
          <p className="note pad" style={{ margin: 0 }}>
            <Icon n="clock" s={13} /> Delivery progress (tickets, milestones) will appear here once the client
            confirms the delivery assurance scope.
          </p>
        </section>
      </div>
    </>
  );
}
