import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { STAGES } from '../../lib/stages.js';
import { ratingTone } from '../../lib/risks.js';
import { Icon } from '../common/Icon.jsx';
import { Flag } from '../common/Flag.jsx';
import Loading from '../extras/Loading.jsx';
import { Donut, ScoreRing, SLICE_COLOURS } from './Charts.jsx';

// The map and its country shapes load separately, only when the dashboard is shown.
const FootprintMap = lazy(() => import('./FootprintMap.jsx'));

const STANDING_TONE = {
  ON_TRACK: 'b-sage',
  ATTENTION: 'b-amber',
  HIGH_RISK: 'b-coral',
  IN_PROGRESS: 'b-mute',
};

const SCORE_TONE = {
  ON_TRACK: 'sage',
  ATTENTION: 'amber',
  HIGH_RISK: 'coral',
  IN_PROGRESS: '',
};

const RISK_STATUS_TONE = { Open: 'b-coral', 'In progress': 'b-amber' };

const RATING_WORD = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

// The footprint filter: every country, or only those with one role.
const FOOTPRINT_ROLES = ['Head office', 'Data storage', 'Remote access', 'Vendor'];

// The assurance path, in the words of the client's demo, each opening the stage that does it.
const PATH = [
  { label: 'Supplier Discovery', icon: 'users', to: '/vendor-selection', tone: 'plum' },
  { label: 'Requirement Analysis', icon: 'clipboard', to: '/requirements', tone: 'plum' },
  { label: 'Contract Extraction', icon: 'file', to: '/contract', tone: 'plum' },
  { label: 'Obligation Identification', icon: 'target', to: '/obligations', tone: 'copper' },
  { label: 'Rule Mapping', icon: 'shield', to: '/compliance', tone: 'coral' },
  { label: 'Jurisdiction / Data Transfer', icon: 'globe', to: '/transfers', tone: 'sage' },
  { label: 'Risk Assessment', icon: 'alert', to: '/risks', tone: 'coral' },
  { label: 'Workflow Actions', icon: 'checkcircle', to: '/remediation', tone: 'sage' },
  { label: 'Evidence & Audit', icon: 'folder', to: '/monitoring', tone: 'plum' },
];

/* "2h ago", "3 days ago", or the date for anything older than a week. */
function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;
  return fmtTime(value);
}

/* "30 Apr 2025" */
const shortDate = value =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/*
 * Buyer dashboard, in the layout and words of the client's demo: headline figures,
 * compliance by sector, the global outsourcing footprint, recent activity, open
 * risks, recent compliance assessments and the assurance path. Every number comes
 * from the saved records; nothing is sample data.
 */
export default function Overview({ period = 'all' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;

    api('/assessments/overview?period=' + period)
      .then(result => current && setData(result))
      .catch(err => current && setError(err.message));

    return () => {
      current = false;
    };
  }, [period]);

  if (error) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;

  const f = data.figures;

  return (
    <div className="ov" data-section="overview" data-period={data.period}>
      <Figures figures={f} />

      <div className="ov-row ov-row-3">
        <SectorCompliance groups={data.byService} average={f.averageScore} />
        <Footprint places={data.footprint} />
        <Activity items={data.activity} />
      </div>

      <div className="ov-row ov-row-2">
        <OpenRisks risks={data.openRisks} />
        <RecentAssessments items={data.recentAssessments} labels={data.standingLabels} />
      </div>

      <AssurancePath />
    </div>
  );
}

/* ---------- Headline figures ---------- */

function Figures({ figures: f }) {
  const tile = (key, icon, label, value, note, to, tone = '') => (
    <Link className={'ov-tile ' + tone} to={to} data-figure={key}>
      <span className="ov-tile-head">
        <span className="ov-tile-icon">
          <Icon n={icon} s={18} />
        </span>
        {label}
      </span>
      <b>{value}</b>
      <span className="ov-tile-note">
        {note}
        <Icon n="arrow" s={14} />
      </span>
    </Link>
  );

  let scoreNote = '— vs last month';
  if (f.scoreChangeThisMonth !== null && f.scoreChangeThisMonth !== undefined) {
    const change = f.scoreChangeThisMonth;
    scoreNote = `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% vs last month`;
  }

  return (
    <div className="ov-figures" data-section="dash-figures">
      {tile(
        'vendors',
        'users',
        'Total Suppliers',
        f.vendors,
        `↑ +${f.newVendorsThisMonth || 0} since last month`,
        '/vendor-selection',
        'dark',
      )}
      {tile(
        'on-track',
        'check',
        'Compliant',
        f.onTrack,
        `${percent(f.onTrack, f.assessments)}% of total`,
        '/monitoring',
        'sage',
      )}
      {tile(
        'attention',
        'alert',
        'Attention',
        f.attention,
        `${percent(f.attention, f.assessments)}% of total`,
        '/remediation',
        'amber',
      )}
      {tile(
        'high-risk',
        'alert',
        'High Risk',
        f.highRisk,
        `${percent(f.highRisk, f.assessments)}% of total`,
        '/risks',
        'coral',
      )}
      {tile('actions', 'list', 'Actions Required', f.actionsOpen, 'in progress', '/remediation')}

      <div className="ov-tile ov-score" data-figure="average-score">
        <ScoreRing value={f.averageScore} size={84} stroke={9} />
        <span>
          <b className="ov-score-title">Overall Compliance</b>
          <span className="ov-tile-note">{scoreNote}</span>
        </span>
      </div>
    </div>
  );
}

/* ---------- Compliance by Sector (the sector of the service outsourced) ---------- */

function SectorCompliance({ groups, average }) {
  const slices = groups.map(g => ({ label: g.service, value: g.count }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <section className="card ov-card" data-section="by-service">
      <div className="ov-card-h">
        <h2>Compliance by Sector</h2>
      </div>
      <div className="ov-donut-wrap">
        <Donut slices={slices} centre={average === null ? '—' : `${average}%`} centreNote="Overall" />
        {groups.length === 0 ? (
          <p className="note ov-empty">No assessments yet.</p>
        ) : (
          <ul className="ov-legend">
            {groups.map((g, index) => (
              <li
                key={g.service}
                title={g.averageScore === null ? 'No score yet' : `Average score ${g.averageScore}%`}
              >
                <span
                  className="ov-dot"
                  style={{ background: SLICE_COLOURS[index % SLICE_COLOURS.length] }}
                />
                <span className="ov-legend-label">{g.service}</span>
                <span className="ov-legend-value">{percent(g.count, total)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------- Global Outsourcing Footprint ---------- */

function Footprint({ places }) {
  const [role, setRole] = useState('all');
  const shown = role === 'all' ? places : places.filter(place => place.roles.includes(role));

  return (
    <section className="card ov-card ov-footprint" data-section="footprint">
      <div className="ov-card-h">
        <h2>Global Outsourcing Footprint</h2>
        <select
          className="ov-select"
          value={role}
          onChange={event => setRole(event.target.value)}
          aria-label="Show countries"
          data-act="footprint-filter"
        >
          <option value="all">All Countries</option>
          {FOOTPRINT_ROLES.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="ov-footprint-body">
        <div className="ov-map-wrap">
          <Suspense fallback={<Loading pad />}>
            <FootprintMap places={shown} />
          </Suspense>
        </div>
        <ul className="ov-countries">
          {shown.map(place => (
            <li key={place.code} title={place.roles.join(', ')}>
              <Flag code={place.code} title={place.name} />
              <span className="ov-country">{place.name}</span>
              <span className="ov-legend-value">{place.assessments}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Recent Activity ---------- */

const STAGE_ICON = Object.fromEntries(STAGES.map(s => [s.n, s.icon]));
const ACTIVITY_TONE = ['sage', 'plum', 'coral', 'plum', 'copper', 'sage', 'coral', 'sage', 'plum'];

function Activity({ items }) {
  return (
    <section className="card ov-card" data-section="activity">
      <div className="ov-card-h">
        <h2>Recent Activity</h2>
        <Link className="ov-view-all" to="/requirements">
          View all <Icon n="arrow" s={13} />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="note ov-empty">No activity yet.</p>
      ) : (
        <ul className="ov-activity">
          {items.slice(0, 5).map((item, index) => (
            <li key={index}>
              <span className={'ov-activity-icon ' + (ACTIVITY_TONE[(item.stage || 1) - 1] || 'sage')}>
                <Icon n={STAGE_ICON[item.stage] || 'clock'} s={17} />
              </span>
              <span className="ov-activity-text">
                <b title={item.title}>{item.title}</b>
                <span className="note">
                  {item.vendor
                    ? `${item.vendor}${item.vendorCountry ? ` (${item.vendorCountry})` : ''}`
                    : item.reference}
                </span>
              </span>
              <span className="note ov-activity-time">{timeAgo(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Open Risks ---------- */

function OpenRisks({ risks }) {
  const navigate = useNavigate();

  return (
    <section className="card ov-card" data-section="open-risks">
      <div className="ov-card-h">
        <h2>Open Risks</h2>
        <Link className="ov-view-all" to="/risks">
          View all <Icon n="arrow" s={13} />
        </Link>
      </div>
      <div className="tw">
        <table className="ov-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Supplier</th>
              <th>Issue</th>
              <th>Severity</th>
              <th>Due Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {risks.length === 0 ? (
              <tr className="ov-empty-row">
                <td colSpan={6}>No open risks.</td>
              </tr>
            ) : (
              risks.map(risk => (
                <tr
                  key={risk.reference + risk.id}
                  className="click"
                  onClick={() => navigate('/remediation/' + risk.reference)}
                >
                  <td className="ov-id">{risk.id}</td>
                  <td>
                    {risk.vendor || <span className="muted">—</span>}
                    {risk.vendorCountry ? <span className="muted"> ({risk.vendorCountry})</span> : null}
                  </td>
                  <td>{risk.issue}</td>
                  <td>
                    <span className={'b ' + ratingTone(risk.rating)}>{RATING_WORD[risk.rating]}</span>
                  </td>
                  <td>{shortDate(risk.dueOn)}</td>
                  <td>
                    <span className={'b ' + RISK_STATUS_TONE[risk.status]}>{risk.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Recent Compliance Assessments ---------- */

function RecentAssessments({ items, labels }) {
  const navigate = useNavigate();

  return (
    <section className="card ov-card" data-section="recent-assessments">
      <div className="ov-card-h">
        <h2>Recent Compliance Assessments</h2>
        <Link className="ov-view-all" to="/requirements">
          View all <Icon n="arrow" s={13} />
        </Link>
      </div>
      <div className="tw">
        <table className="ov-table">
          <thead>
            <tr>
              <th>Supplier / Service</th>
              <th>Jurisdiction</th>
              <th>Status</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="ov-empty-row">
                <td colSpan={4}>
                  No assessments yet. <Link to="/requirements/new">Start a requirement</Link>
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr
                  key={item.reference}
                  className="click"
                  onClick={() => navigate('/compliance/' + item.reference)}
                  data-ref={item.reference}
                  title={item.reference}
                >
                  <td>
                    <span className="ov-flag-cell">
                      {item.country ? <Flag code={item.country.code} title={item.country.name} /> : null}
                      {item.vendor || 'No supplier yet'} / {item.service}
                    </span>
                  </td>
                  <td>
                    {item.country ? (
                      <span className="ov-flag-cell">
                        <Flag code={item.country.code} title={item.country.name} />
                        {item.country.name}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={'b ' + STANDING_TONE[item.standing]}>{labels[item.standing]}</span>
                  </td>
                  <td className={'ov-score-cell ' + SCORE_TONE[item.standing]}>
                    {item.score === null ? <span className="muted">—</span> : `${item.score}%`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- The Assurance Path ---------- */

function AssurancePath() {
  return (
    <section className="card ov-path" data-section="assurance-path">
      <div className="ov-path-intro">
        <span className="eyebrow">The assurance path</span>
        <h2>From supplier to certainty.</h2>
        <p className="note">
          We connect every step — from vendor discovery to evidence — so you can outsource with confidence.
        </p>
      </div>
      <ol className="ov-path-steps">
        {PATH.map((step, index) => (
          <Fragment key={step.label}>
            {index > 0 ? (
              <li className="ov-path-arrow" aria-hidden="true">
                <Icon n="arrow" s={16} />
              </li>
            ) : null}
            <li className="ov-path-item">
              <Link to={step.to} className="ov-path-step" data-stage={index + 1}>
                <span className={'ov-path-icon ' + step.tone}>
                  <Icon n={step.icon} s={22} />
                </span>
                <span>{step.label}</span>
              </Link>
            </li>
          </Fragment>
        ))}
      </ol>
    </section>
  );
}
