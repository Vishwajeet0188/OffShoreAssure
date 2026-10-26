import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, displayName } from '../../context/AuthContext.jsx';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { useTheme } from '../../lib/theme.js';
import { Badge } from '../common/Badges.jsx';
import ThemeToggle from '../extras/ThemeToggle.jsx';
import { Icon } from '../common/Icon.jsx';
import AlertsBell from './AlertsBell.jsx';
import TopSearch from './TopSearch.jsx';
import { activeMember } from '../../lib/membership.js';

const initialsOf = name =>
  name
    .split(/\s+/)
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/*
 * Top bar.
 *   Buyer portal (layout from the client's demo): search, the bell, and the person's
 *   name with a ▾ menu (organisation, help, dark mode, sign out).
 *   Vendor portal: the role, the organisation and its verification, the theme switch,
 *   the person and Sign out.
 */
export default function Topbar({ portal = 'buyer', menuOpen = false, onMenu }) {
  const auth = useAuth();
  const vendor = portal === 'vendor';

  const menuButton = (
    <button
      type="button"
      className="menu-btn"
      onClick={onMenu}
      aria-label={menuOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={menuOpen}
      aria-controls="workspace-menu"
      data-act="menu"
    >
      <Icon n={menuOpen ? 'x' : 'menu'} s={22} />
    </button>
  );

  if (!vendor) {
    const member = activeMember(auth.membership);

    return (
      <header className="top top-buyer">
        {menuButton}
        {member ? <TopSearch /> : <span className="top-spacer" />}
        <div className="right">
          {member ? <AlertsBell /> : null}
          <UserMenu />
        </div>
      </header>
    );
  }

  return <VendorTopbar menuButton={menuButton} />;
}

/* The person's name and role; clicking opens their menu. */
function UserMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const name = displayName(auth.user, auth.profile);

  useEffect(() => setOpen(false), [pathname]);

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
    <div className="user-menu" ref={boxRef}>
      <button
        type="button"
        className="user"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={'Signed in as ' + auth.user?.email}
        data-act="user-menu"
      >
        <span className="avatar">{initialsOf(name)}</span>
        <span className="user-text">
          <b className="top-name">{name}</b>
          <span className="role">{auth.profile?.jobRole || ''}</span>
        </span>
        <Icon n="chevron" s={16} />
      </button>

      {open ? (
        <div className="user-pop" role="menu" data-section="user-menu">
          <div className="user-pop-head">
            <b>{auth.profile?.organisationName || ''}</b>
            <span className="note">{auth.user?.email}</span>
          </div>
          <Link to="/organisation" role="menuitem">
            <Icon n="building" s={16} /> Organisation
          </Link>
          <Link to="/contact" role="menuitem">
            <Icon n="ticket" s={16} /> Help and support
          </Link>
          <Link to="/" role="menuitem">
            <Icon n="home" s={16} /> Home page
          </Link>
          <button type="button" role="menuitem" onClick={toggle} data-act="theme">
            <Icon n="layers" s={16} /> {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              navigate('/');
              auth.logout();
            }}
            data-act="signout"
          >
            <Icon n="logout" s={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VendorTopbar({ menuButton }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const name = displayName(auth.user, auth.profile);
  const v = auth.vendor?.verificationStatus;

  return (
    <header className="top">
      {menuButton}
      <div className="top-role">
        <span className="role-pill vendor" data-role="vendor">
          Vendor
        </span>
        <div className="top-org">
          <b>{auth.profile?.organisationName || ''}</b>
        </div>
        {v ? <Badge s={VERIFY_LABEL[v][0]} label={VERIFY_LABEL[v][1]} /> : null}
      </div>
      <div className="right">
        <ThemeToggle />
        <div className="user">
          <span className="avatar">{initialsOf(name)}</span>
          <div>
            <b className="top-name">{name}</b>
            <div className="role">{auth.profile?.jobRole || ''}</div>
          </div>
        </div>
        <button
          className="btn sm"
          data-act="signout"
          title={'Signed in as ' + auth.user?.email}
          onClick={() => {
            navigate('/');
            auth.logout();
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
