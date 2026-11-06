import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, displayName } from '../context/AuthContext.jsx';
import { Icon } from '../components/common/Icon.jsx';
import { activeMember } from '../lib/membership.js';
import Overview from '../components/dashboard/Overview.jsx';

const today = () =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Which assessments the figures cover, by when they were started.
const PERIOD_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
];

/* Buyer dashboard (words and layout from the client's demo), from saved records only. */
export default function Dashboard() {
  const auth = useAuth();
  const active = activeMember(auth.membership);
  const firstName = displayName(auth.user, auth.profile).split(' ')[0];
  const [period, setPeriod] = useState('all');

  return (
    <>
      <header className="ov-head">
        <div>
          <span className="eyebrow">Overview</span>
          <h1 className="ov-title">Dashboard</h1>
          <p className="ov-lead">
            Welcome back, {firstName}. Here’s your outsourcing compliance at a glance.
          </p>
        </div>

        {active ? (
          <div className="ov-head-actions">
            <PeriodMenu period={period} onChange={setPeriod} />
            <label className="ov-org">
              <Icon n="building" s={16} />
              <span className="sr-only">Organisation</span>
              <select defaultValue="all" data-act="organisation">
                <option value="all">All Organisations</option>
                <option value="mine">{auth.profile?.organisationName}</option>
              </select>
            </label>
          </div>
        ) : null}
      </header>

      {active ? <Overview period={period} /> : <MembershipWaiting auth={auth} />}
    </>
  );
}

/*
 * The date button from the demo. It shows today's date; the list under it picks
 * which assessments the dashboard covers. A chosen period replaces the date.
 */
function PeriodMenu({ period, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = event => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chosen = PERIOD_OPTIONS.find(option => option.value === period);

  return (
    <div className="ov-date-box" ref={boxRef}>
      <button
        type="button"
        className="ov-date"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-act="period"
      >
        <Icon n="calendar" s={16} />
        {period === 'all' ? today() : chosen.label}
        <Icon n="chevron" s={14} />
      </button>

      {open ? (
        <ul className="ov-date-pop" role="listbox" aria-label="Show assessments started in">
          {PERIOD_OPTIONS.map(option => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === period}
                className={option.value === period ? 'on' : ''}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                data-period={option.value}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* A person whose request to join their organisation is pending or was declined. */
function MembershipWaiting({ auth }) {
  const organisation = auth.profile?.organisationName;
  const pending = auth.membership === 'pending';

  return (
    <section
      className={'card vstatus vstatus-' + (pending ? 'pending' : 'rejected')}
      data-section="membership"
    >
      <div className="vstatus-head">
        <div>
          <div className="eyebrow">Organisation access</div>
          <h2>
            {pending
              ? `Waiting for ${organisation} to approve you`
              : `Your request to join ${organisation} was not approved`}
          </h2>
        </div>
      </div>
      <p>
        {pending
          ? `${organisation} is already registered on OffshoreAssure. Its owner has been emailed and must approve you before you can see or create its requirements and assessments.`
          : 'If you do work there, ask the organisation’s owner to contact the OffshoreAssure team. Otherwise, change the organisation in your profile.'}
      </p>
      <div className="row">
        <Link className="btn sm" to="/complete-profile">
          Change organisation
        </Link>
      </div>
    </section>
  );
}
