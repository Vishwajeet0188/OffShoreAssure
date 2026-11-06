import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

function Loading() {
  return (
    <div className="auth-loading" role="status">
      <span className="note">Loading…</span>
    </div>
  );
}

/* Signed-in users only. New users complete their profile first. */
export function RequireAuth({ children }) {
  const { loading, user, profileComplete, membership } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  if (user.role === 'vendor') return <Navigate to="/vendor" replace />;
  if (!profileComplete) return <Navigate to="/complete-profile" replace />;
  // Waiting for (or refused) organisation approval: only the dashboard and organisation page are open.
  if (['pending', 'rejected'].includes(membership) && !['/dashboard', '/organisation'].includes(loc.pathname))
    return <Navigate to="/dashboard" replace />;
  return children;
}

/* Vendor (supplier) portal. Buyers and admins are sent to their own portal. */
export function RequireVendorArea({ children }) {
  const { loading, user, profileComplete } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  if (user.role !== 'vendor') return <Navigate to="/dashboard" replace />;
  if (!profileComplete) return <Navigate to="/complete-profile" replace />;
  return children;
}

/* Admin console (separate workspace). Customers are sent to their dashboard. */
export function RequireAdminArea({ children }) {
  const { loading, user } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />;
  if (!user.isAdmin) return <Navigate to={user.role === 'vendor' ? '/vendor' : '/dashboard'} replace />;
  return children;
}

/* Signed in, profile may be incomplete (Complete Your Profile page). */
export function RequireSignedIn({ children }) {
  const { loading, user } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
