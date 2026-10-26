import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import SkipLink from '../extras/SkipLink.jsx';
import FloatingActions from '../extras/FloatingActions.jsx';
import CookieNotice from '../extras/CookieNotice.jsx';
import { useMobileMenu } from '../../hooks/useMobileMenu.js';

/* Signed-in workspace shell for the buyer portal and the vendor portal. */
export default function AppLayout({ portal = 'buyer' }) {
  const { pathname } = useLocation();
  const menu = useMobileMenu();

  return (
    <div className={'app portal-' + portal}>
      <SkipLink target="content" />
      <Sidebar portal={portal} open={menu.open} onClose={menu.close} />
      <div className={'nav-backdrop' + (menu.open ? ' open' : '')} onClick={menu.close} aria-hidden="true" />
      <div className="main">
        <Topbar portal={portal} menuOpen={menu.open} onMenu={menu.toggle} />
        <main className="content" id="content" tabIndex={-1}>
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <FloatingActions showContact={false} />
      <CookieNotice />
    </div>
  );
}
