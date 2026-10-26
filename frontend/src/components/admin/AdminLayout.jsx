import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Icon } from '../common/Icon.jsx';
import { Logo } from '../layout/Brand.jsx';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import ThemeToggle from '../extras/ThemeToggle.jsx';
import SkipLink from '../extras/SkipLink.jsx';
import FloatingActions from '../extras/FloatingActions.jsx';
import { useMobileMenu } from '../../hooks/useMobileMenu.js';

/* Grouped by party. `stage` marks pages whose data arrives with a later build stage. */
const NAV = [
  ['', [['/admin', 'Overview', 'layout', null, true]]],
  [
    'Buyers',
    [
      ['/admin/buyers', 'Organisations', 'building'],
      ['/admin/users', 'Buyer users', 'users'],
      ['/admin/assessments', 'Assessments', 'clipboard'],
    ],
  ],
  [
    'Suppliers',
    [
      ['/admin/vendors', 'Vendors', 'globe'],
      ['/admin/evidence', 'Evidence review', 'scan', 'Later'],
    ],
  ],
  ['Outputs', [['/admin/reports', 'Reports', 'report']]],
  [
    'Platform',
    [
      ['/admin/rules', 'Rule base', 'scale'],
      ['/admin/team', 'Admin team', 'shield'],
      ['/admin/tickets', 'Support tickets', 'ticket'],
      ['/admin/feedback', 'Website feedback', 'bell'],
      ['/admin/audit', 'Audit log', 'list'],
      ['/admin/settings', 'Platform settings', 'gear'],
    ],
  ],
];

/* OffshoreAssure admin console: a separate workspace from the buyer/supplier app. */
export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const menu = useMobileMenu();

  return (
    <div className="adm">
      <SkipLink target="admin-content" />
      <header className="adm-top">
        <button
          type="button"
          className="menu-btn on-dark"
          onClick={menu.toggle}
          aria-label={menu.open ? 'Close menu' : 'Open menu'}
          aria-expanded={menu.open}
          aria-controls="admin-menu"
          data-act="menu"
        >
          <Icon n={menu.open ? 'x' : 'menu'} s={22} />
        </button>
        <div className="adm-brand">
          <Logo w={34} h={26} />
          <span>
            <b>OffshoreAssure</b>
            <small>Admin console</small>
          </span>
        </div>
        <span className="adm-env">Internal · OffshoreAssure team</span>
        <div className="adm-user">
          <ThemeToggle className="on-dark" />
          <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
            AD
          </span>
          <span className="adm-email">{user?.email}</span>
          <button
            className="btn sm"
            data-act="signout"
            onClick={() => {
              navigate('/');
              logout();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="adm-body">
        <div
          className={'nav-backdrop' + (menu.open ? ' open' : '')}
          onClick={menu.close}
          aria-hidden="true"
        />
        <nav className={'adm-nav' + (menu.open ? ' open' : '')} aria-label="Admin" id="admin-menu">
          {NAV.map(([grp, links]) => (
            <div key={grp || 'top'} className="adm-navsec">
              {grp ? <div className="adm-navgrp">{grp}</div> : null}
              {links.map(([to, label, icon, stage, end]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => 'adm-link' + (isActive ? ' on' : '') + (stage ? ' later' : '')}
                  title={stage ? 'Data arrives with ' + stage : undefined}
                >
                  <Icon n={icon} s={18} />
                  <span>{label}</span>
                  {stage ? <small>{stage}</small> : null}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="adm-navfoot note">Changes made here are recorded in the audit log.</div>
        </nav>
        <main className="adm-main" id="admin-content" tabIndex={-1}>
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <FloatingActions showContact={false} />
    </div>
  );
}
