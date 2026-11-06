import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, displayName } from '../../context/AuthContext.jsx';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { fmtTime } from '../../lib/format.js';
import { api } from '../../lib/api.js';
import { Badge } from '../../components/common/Badges.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';
import { ScoreRing } from '../../components/dashboard/Charts.jsx';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = list => (list || []).map(c => regionName.of(c)).join(', ');

const today = () =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/*
 * Vendor dashboard, laid out like the buyer's: headline figures, then every piece of
 * work a buyer has given the company, each with its confirmation (who selected it and
 * when) and where it stands now, and the recent activity.
 * Until the company is verified, it shows the verification status and the profile.
 */
export default function VendorDashboard() {
  const auth = useAuth();
  const status = auth.vendor?.verificationStatus || 'pending';
  const firstName = displayName(auth.user, auth.profile).split(' ')[0];

  return (
    <>
      <header className="ov-head">
        <div>
          <span className="eyebrow">Overview · {auth.profile?.organisationName}</span>
          <h1 className="ov-title">Dashboard</h1>
          <p className="ov-lead">
            Welcome back, {firstName}. Here’s the work UK buyers have given your company, and what is next.
          </p>
        </div>
        <div className="ov-head-actions">
          <span className="ov-date" title="Today">
            <Icon n="clock" s={15} />
            {today()}
          </span>
        </div>
      </header>

      {status === 'approved' ? (
        <>
          <VerifiedStrip />
          <WorkOverview />
        </>
      ) : (
        <>
          <Verification status={status} />
          <CompanySummary />
        </>
      )}
    </>
  );
}

/* ---------- Verified: the work overview ---------- */

function WorkOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/vendor/overview')
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  if (error) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;

  const f = data.figures;

  return (
    <div className="ov" data-section="vendor-overview">
      <div className="ov-figures" data-section="vendor-figures">
        <Tile tone="dark" icon="clipboard" label="Work received" value={f.work} to="/vendor/assessments">
          from {f.buyers} buyer{f.buyers === 1 ? '' : 's'}
        </Tile>
        <Tile
          tone="amber"
          icon="list"
          label="Questionnaires"
          value={f.questionnairesToAnswer}
          to="/vendor/assessments"
        >
          to answer
        </Tile>
        <Tile tone="coral" icon="flag" label="Actions to do" value={f.actionsToDo} to="/vendor/actions">
          open or sent back
        </Tile>
        <Tile icon="clock" label="With the buyer" value={f.actionsWaiting} to="/vendor/actions">
          waiting for review
        </Tile>
        <Tile
          tone="sage"
          icon="check"
          label="Actions closed"
          value={f.actionsClosed}
          to="/vendor/track-record"
        >
          checked by the buyer
        </Tile>
        <div className="ov-tile ov-score" data-figure="score">
          <ScoreRing value={f.averageScore} size={74} stroke={8} />
          <span>
            <b className="ov-score-title">Assurance score</b>
            <span className="ov-tile-note">
              {f.averageScore === null ? 'after your first questionnaire' : 'average across buyers'}
            </span>
          </span>
        </div>
      </div>

      <section className="card ov-card" data-section="vendor-work">
        <div className="ov-card-h">
          <h2>Work you have been given</h2>
          <Link className="ov-view-all" to="/vendor/track-record">
            Track record <Icon n="arrow" s={13} />
          </Link>
        </div>
        {data.work.length === 0 ? (
          <p className="note ov-empty">
            No buyer has selected your company yet. When a buyer chooses you, the work appears here with the
            date, the buyer and what to do next, and you get an email.
          </p>
        ) : (
          <ul className="vw-list">
            {data.work.map(item => (
              <WorkItem key={item.reference} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section className="card ov-card" data-section="activity">
        <div className="ov-card-h">
          <h2>Recent activity</h2>
        </div>
        {data.activity.length === 0 ? (
          <p className="note ov-empty">Each step of your assessments is listed here.</p>
        ) : (
          <ul className="ov-activity">
            {data.activity.map((event, index) => (
              <li key={index}>
                <span className="ov-activity-icon">
                  <Icon n="clock" s={16} />
                </span>
                <span className="ov-activity-text">
                  <b title={event.title}>{event.title}</b>
                  <span className="note">
                    {event.reference} · Stage {event.stage} · {fmtTime(event.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ tone = '', icon, label, value, to, children }) {
  return (
    <Link className={'ov-tile ' + tone} to={to}>
      <span className="ov-tile-head">
        <span className="ov-tile-icon">
          <Icon n={icon} s={18} />
        </span>
        {label}
      </span>
      <b>{value}</b>
      <span className="ov-tile-note">
        {children}
        <Icon n="arrow" s={14} />
      </span>
    </Link>
  );
}

/* One piece of work: the confirmation that it was given, and where it stands. */
function WorkItem({ item }) {
  // Actions whose risk the buyer accepted are not the vendor's to do.
  const a = item.actions;

  return (
    <li className="vw-item" data-ref={item.reference}>
      <div className="vw-confirm">
        <span className="vw-confirm-icon">
          <Icon n="check" s={16} />
        </span>
        <span>
          <b>
            {item.selection.label} by {item.buyer}
          </b>
          <span className="note">
            {item.selection.at ? fmtTime(item.selection.at) : ''}
            {item.selection.by ? ` · approved by ${item.selection.by}` : ''}
            {item.selection.version ? ` · Vendor Selection Record v${item.selection.version}.0` : ''}
          </span>
        </span>
      </div>

      <div className="vw-main">
        <div className="vw-title">
          <b>{item.title}</b>
          <span className="note">
            {item.service} · <span className="mono">{item.reference}</span>
          </span>
          {item.selection.conditional ? (
            <span className="note vw-conditional">
              Selected with conditions: the open points are checked through the questionnaire and actions.
            </span>
          ) : null}
        </div>

        <dl className="vw-steps">
          <div>
            <dt>Questionnaire</dt>
            <dd>
              <span className={'b b-' + item.questionnaire.tone}>{item.questionnaire.label}</span>
            </dd>
          </div>
          <div>
            <dt>Actions</dt>
            <dd>
              {a.assigned === 0 ? (
                <span className="muted">None yet</span>
              ) : (
                <>
                  <b>{a.closed}</b> closed of {a.assigned - a.accepted}
                  {a.toDo ? <span className="b b-coral">{a.toDo} to do</span> : null}
                  {a.waiting ? <span className="b b-amber">{a.waiting} with the buyer</span> : null}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Buyer’s report</dt>
            <dd>
              {item.report ? (
                <>
                  v{item.report.version}.0 · {item.report.position}
                </>
              ) : (
                <span className="muted">Not issued yet</span>
              )}
            </dd>
          </div>
        </dl>

        <Link className="btn sm primary vw-next" to={item.next.to} data-act="work-next">
          {item.next.label} <Icon n="arrow" s={13} />
        </Link>
      </div>
    </li>
  );
}

function VerifiedStrip() {
  const auth = useAuth();
  const v = auth.vendor;

  return (
    <div className="vw-verified" data-section="verification">
      <Icon n="check" s={16} />
      <span>
        <b>Your company is verified.</b>{' '}
        <span className="note">
          {auth.profile?.organisationName} was verified by the OffshoreAssure team
          {v?.verifiedAt ? ' on ' + fmtTime(v.verifiedAt) : ''} and can be presented to UK buyers.
        </span>
      </span>
      <Link className="link note" to="/vendor/profile">
        Company profile
      </Link>
    </div>
  );
}

/* ---------- Not verified yet ---------- */

function Verification({ status }) {
  const auth = useAuth();
  const v = auth.vendor;

  return (
    <section className={'card vstatus vstatus-' + status} data-section="verification">
      <div className="vstatus-head">
        <div>
          <div className="eyebrow">Company verification · ASS-001 Legal Entity Verification</div>
          <h2>{status === 'rejected' ? 'Verification needs attention' : 'Waiting for verification'}</h2>
        </div>
        <Badge s={VERIFY_LABEL[status][0]} label={VERIFY_LABEL[status][1]} />
      </div>
      <p>
        {status === 'rejected'
          ? 'The OffshoreAssure team could not verify your company yet. Correct your company details and they will be reviewed again.'
          : 'The OffshoreAssure team is checking your company’s identity, registration and jurisdiction. Buyers will see your profile once it is verified. We will email you when it is done.'}
      </p>
      {status === 'rejected' && v?.verificationNote ? (
        <p className="vstatus-note">
          <b>Reason:</b> {v.verificationNote}
        </p>
      ) : null}
      <div>
        <Link className="btn sm" to="/vendor/profile">
          {status === 'rejected' ? 'Update company details' : 'View company profile'}
        </Link>
      </div>
    </section>
  );
}

function CompanySummary() {
  const auth = useAuth();
  const v = auth.vendor;

  return (
    <div className="card">
      <div className="ch">
        <div>
          <h2>Company profile</h2>
          <div className="sub">Your reusable profile for UK buyers</div>
        </div>
        <Link className="link" to="/vendor/profile">
          Open <Icon n="arrow" s={13} />
        </Link>
      </div>
      {v ? (
        <dl className="kv rq-kv">
          <div>
            <dt>Company</dt>
            <dd>{auth.profile.organisationName}</dd>
          </div>
          <div>
            <dt>Registration number</dt>
            <dd>{v.registrationNumber}</dd>
          </div>
          <div>
            <dt>Country of registration</dt>
            <dd>{countries([v.country])}</dd>
          </div>
          <div>
            <dt>Delivers from</dt>
            <dd>{countries(v.deliveryCountries)}</dd>
          </div>
          <div>
            <dt>Services</dt>
            <dd>{v.services.join(', ')}</dd>
          </div>
        </dl>
      ) : (
        <p className="note pad">No company profile yet.</p>
      )}
    </div>
  );
}
