import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

/* Signed-in workspace shell for the buyer portal and the vendor portal. */
export default function AppLayout({ portal = 'buyer' }) {
  const { pathname } = useLocation();
  return (
    <div className={'app portal-' + portal}>
      <Sidebar portal={portal} />
      <div className="main">
        <Topbar portal={portal} />
        <main className="content" id="content"><ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary></main>
      </div>
    </div>
  );
}
