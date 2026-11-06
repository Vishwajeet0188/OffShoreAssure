import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, displayName } from '../../context/AuthContext.jsx';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { useTheme } from '../../lib/theme.js';
import { Badge } from '../common/Badges.jsx';
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
 * Top bar, the same in both portals (layout from the client's demo): the person's
 * name with a ▾ menu (settings, help, home page, dark mode, sign out).
 * Search and the bell in both portals, each over that person's own records.
 *   Vendor portal: the company and its verification are at the top of the menu.
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

  // Buyers once their organisation has approved them; vendors always (their own work only).
  const showTools = vendor || activeMember(auth.membership);

  return (
    <header className="top top-buyer" data-portal={portal}>
      {menuButton}
      {showTools ? <TopSearch portal={portal} /> : <span className="top-spacer" />}
      <div className="right">
        {showTools ? <AlertsBell portal={portal} /> : null}
        <UserMenu vendor={vendor} />
      </div>
    </header>
  );
}

/* The person's name and role; clicking opens their menu. */
function UserMenu({ vendor = false }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const name = displayName(auth.user, auth.profile);
  const verification = auth.vendor?.verificationStatus;

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
            {vendor && verification ? (
              <Badge s={VERIFY_LABEL[verification][0]} label={VERIFY_LABEL[verification][1]} />
            ) : null}
            <span className="note">{auth.user?.email}</span>
          </div>
          {vendor ? (
            <Link to="/vendor/profile" role="menuitem">
              <Icon n="building" s={16} /> Company profile
            </Link>
          ) : (
            <Link to="/organisation" role="menuitem">
              <Icon n="building" s={16} /> Organisation
            </Link>
          )}
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
