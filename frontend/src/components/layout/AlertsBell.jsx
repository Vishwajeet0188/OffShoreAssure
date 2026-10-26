import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Icon } from '../common/Icon.jsx';

const KIND_WORD = { overdue: 'Overdue', expiry: 'Expiry', review: 'To review', decide: 'To decide' };
const KIND_TONE = { overdue: 'b-coral', expiry: 'b-amber', review: 'b-amber', decide: 'b-plum' };

/*
 * Buyer portal bell: overdue actions, certificates or insurance expiring within
 * 30 days, and work waiting for the buyer. The number is how many there are.
 */
export default function AlertsBell() {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const { pathname } = useLocation();

  // Load on every page change, so the count stays current.
  useEffect(() => {
    api('/assessments/alerts')
      .then(result => setAlerts(result.alerts))
      .catch(() => setAlerts([]));
    setOpen(false);
  }, [pathname]);

  // Close when clicking anywhere else or pressing Escape.
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

  return (
    <div className="bell-box" ref={boxRef}>
      <button
        type="button"
        className="bell"
        onClick={() => setOpen(current => !current)}
        aria-label={`Needs your attention: ${alerts.length}`}
        aria-expanded={open}
        data-act="alerts"
      >
        <Icon n="bell" s={20} />
        {alerts.length ? <i data-count>{alerts.length}</i> : null}
      </button>

      {open ? (
        <div className="bellpop" role="dialog" aria-label="Needs your attention" data-section="dash-alerts">
          <b className="bellpop-title">Needs your attention</b>
          {alerts.length === 0 ? (
            <p className="note">Nothing needs your attention right now.</p>
          ) : (
            <ul>
              {alerts.slice(0, 8).map((alert, index) => (
                <li key={index} data-alert={alert.kind}>
                  <Link to={alert.path}>
                    <span className={'b ' + KIND_TONE[alert.kind]}>{KIND_WORD[alert.kind]}</span>
                    <span>
                      <b>{alert.title}</b>
                      <span className="note">
                        {alert.reference} · {alert.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 8 ? <p className="note">and {alerts.length - 8} more.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
