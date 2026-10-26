import { NavLink, useLocation } from 'react-router-dom';
import { STAGES, VENDOR_JOURNEY } from '../../lib/stages.js';
import { Icon, BackArrow } from '../common/Icon.jsx';
import { Logo, Waves } from './Brand.jsx';

/*
 * Buyer menu, word for word from the client's demo. Each item opens the stage page
 * that does that job; `also` lists other pages that keep the item highlighted.
 */
const BUYER_MENU = [
  { key: 'suppliers', label: 'Suppliers', icon: 'users', to: '/vendor-selection' },
  {
    key: 'assessments',
    label: 'Assessments',
    icon: 'clipboard',
    to: '/requirements',
    also: ['/compliance', '/risks', '/stage'],
  },
  { key: 'contracts', label: 'Contracts', icon: 'doc', to: '/contract' },
  { key: 'obligations', label: 'Obligations', icon: 'list', to: '/obligations' },
  { key: 'transfers', label: 'Data Transfers', icon: 'globe', to: '/transfers' },
  { key: 'workflow', label: 'Workflow', icon: 'flow', to: '/remediation' },
  { key: 'evidence', label: 'Evidence', icon: 'folder', to: '/evidence' },
  { key: 'reports', label: 'Reports', icon: 'report', to: '/monitoring' },
  { key: 'settings', label: 'Settings', icon: 'gear', to: '/organisation', also: ['/contact'] },
];

const within = (pathname, path) => pathname === path || pathname.startsWith(path + '/');

/* Sidebar. Buyer portal: the demo's menu. Vendor portal: Dashboard + the vendor's part of the journey. */
export default function Sidebar({ portal = 'buyer', open = false, onClose }) {
  const { pathname } = useLocation();
  const vendor = portal === 'vendor';
  const journey = VENDOR_JOURNEY.map(j => ({
    key: j.slug,
    to: j.path || '/vendor/stage/' + j.slug,
    n: j.stage,
    label: j.title,
    icon: STAGES.find(s => s.n === j.stage)?.icon || 'list',
    later: !j.path,
    title: `Stage ${j.stage} · ${j.title}`,
  }));

  return (
    <aside className={'side' + (open ? ' open' : '')} id="workspace-menu">
      <Waves />
      {/* Small screens only: close the slide-out menu. */}
      <button
        type="button"
        className="side-close"
        onClick={onClose}
        aria-label="Close menu"
        data-act="menu-close"
      >
        <Icon n="x" s={20} />
      </button>
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
      {/* The buyer portal follows the client's demo, which has no portal label. */}
      {vendor ? (
        <div className="side-role" title="You are signed in to the vendor portal">
          <span>Vendor portal</span>
        </div>
      ) : null}
      <nav className="mods" aria-label="Workspace">
        <NavLink
          to={vendor ? '/vendor' : '/dashboard'}
          end
          className={({ isActive }) => 'mod' + (isActive ? ' on' : '')}
          title="Dashboard"
          data-nav="dashboard"
        >
          <Icon n="home" s={19} />
          <span className="lbl">Dashboard</span>
        </NavLink>

        {vendor ? <VendorMenu items={journey} pathname={pathname} /> : <BuyerMenu pathname={pathname} />}
      </nav>
      {vendor ? (
        <NavLink className="mod" to="/" style={{ marginTop: 'auto' }} title="Public home page">
          <BackArrow s={17} />
          <span className="lbl">Back to home page</span>
        </NavLink>
      ) : null}
      <div className="foot side-version" style={{ marginTop: vendor ? 0 : 'auto' }}>
        <span>v1.0.0</span>
        <span aria-hidden="true">|</span>
        <span>Prototype</span>
      </div>
    </aside>
  );
}

function BuyerMenu({ pathname }) {
  return BUYER_MENU.map(item => {
    const on = [item.to, ...(item.also || [])].some(path => within(pathname, path));
    return (
      <NavLink
        key={item.key}
        to={item.to}
        className={'mod' + (on ? ' on' : '')}
        title={item.label}
        data-nav={item.key}
      >
        <Icon n={item.icon} s={19} />
        <span className="lbl">{item.label}</span>
      </NavLink>
    );
  });
}

function VendorMenu({ items, pathname }) {
  return (
    <>
      <NavLink
        to="/contact"
        className="mod"
        title="Raise a support ticket and see the replies"
        data-act="contact"
      >
        <Icon n="ticket" s={19} />
        <span className="lbl">Help and support</span>
      </NavLink>
      <div className="mods-grp">Your part in the assessment</div>
      {items.map(it => {
        const on = within(pathname, it.to);
        return (
          <NavLink
            key={it.key}
            to={it.to}
            className={'mod' + (on ? ' on' : '') + (it.later ? ' later' : '')}
            title={it.title + (it.later ? ' (not available yet)' : '')}
            data-stage={it.n}
          >
            <Icon n={it.icon} s={19} />
            <span className="lbl">{it.label}</span>
          </NavLink>
        );
      })}
    </>
  );
}
