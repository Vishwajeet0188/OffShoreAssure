import { NavLink, useLocation } from 'react-router-dom';
import { STAGES, stageStatus, VENDOR_JOURNEY } from '../../lib/stages.js';
import { Icon, BackArrow } from '../common/Icon.jsx';
import { Logo, Waves } from './Brand.jsx';

/* Sidebar. Buyer portal: Dashboard + the nine stages. Vendor portal: Dashboard + the vendor's part of the journey. */
export default function Sidebar({ portal = 'buyer' }) {
  const { pathname } = useLocation();
  const vendor = portal === 'vendor';
  const items = vendor
    ? VENDOR_JOURNEY.map(j => ({
        key: j.slug,
        to: j.path || '/vendor/stage/' + j.slug,
        n: j.stage,
        label: j.title,
        later: !j.path,
        title: `Stage ${j.stage} · ${j.title}`,
      }))
    : STAGES.map(s => ({
        key: s.n,
        to: s.path || '/stage/' + s.slug,
        n: s.n,
        label: s.title,
        later: stageStatus(s) === 'not-started',
        title: `Stage ${s.n} · ${s.title}`,
      }));
  return (
    <aside className="side">
      <Waves />
      <NavLink className="brand brandlink" to="/" title="OffshoreAssure home">
        <span className="wm">
          <Logo />
          <b>
            Offshore
            <br />
            Assure
          </b>
        </span>
        <small>Assurance for the connected world.</small>
      </NavLink>
      <div className="side-role" title={`You are signed in to the ${vendor ? 'vendor' : 'buyer'} portal`}>
        <span>{vendor ? 'Vendor portal' : 'Buyer portal'}</span>
      </div>
      <nav className="mods" aria-label="Workspace">
        <NavLink
          to={vendor ? '/vendor' : '/dashboard'}
          end
          className={({ isActive }) => 'mod' + (isActive ? ' on' : '')}
          title="Dashboard"
        >
          <Icon n="home" s={19} />
          <span className="lbl">Dashboard</span>
        </NavLink>
        {vendor ? null : (
          <NavLink
            to="/organisation"
            className={({ isActive }) => 'mod' + (isActive ? ' on' : '')}
            title="Your organisation and its members"
          >
            <Icon n="building" s={19} />
            <span className="lbl">Organisation</span>
          </NavLink>
        )}
        <NavLink
          to="/contact"
          className="mod"
          title="Raise a support ticket and see the replies"
          data-act="contact"
        >
          <Icon n="ticket" s={19} />
          <span className="lbl">Help and support</span>
        </NavLink>
        <div className="mods-grp">{vendor ? 'Your part in the assessment' : 'Assessment stages'}</div>
        {items.map(it => {
          const on = pathname === it.to || pathname.startsWith(it.to + '/');
          return (
            <NavLink
              key={it.key}
              to={it.to}
              className={'mod' + (on ? ' on' : '') + (it.later ? ' later' : '')}
              title={it.title + (it.later ? ' (not available yet)' : '')}
              data-stage={it.n}
            >
              <span className="mod-n">{it.n}</span>
              <span className="lbl">{it.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <NavLink className="mod" to="/" style={{ marginTop: 'auto' }} title="Public home page">
        <BackArrow s={17} />
        <span className="lbl">Back to home page</span>
      </NavLink>
      {import.meta.env.DEV ? (
        <div className="foot" style={{ marginTop: 0 }}>
          <span>Development build</span>
        </div>
      ) : null}
    </aside>
  );
}
