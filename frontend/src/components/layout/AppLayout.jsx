import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import SkipLink from '../extras/SkipLink.jsx';
import FloatingActions from '../extras/FloatingActions.jsx';
import CookieNotice from '../extras/CookieNotice.jsx';

/* Signed-in workspace shell for the buyer portal and the vendor portal. */
export default function AppLayout({ portal = 'buyer' }) {
  const { pathname } = useLocation();
  return (
    <div className={'app portal-' + portal}>
      <SkipLink target="content" />
      <Sidebar portal={portal} />
      <div className="main">
        <Topbar portal={portal} />
        <main className="content" id="content" tabIndex={-1}><ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary></main>
      </div>
      <FloatingActions showContact={false} />
      <CookieNotice />
    </div>
  );
}
