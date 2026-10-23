import { useNavigate } from 'react-router-dom';
import { useAuth, displayName } from '../../context/AuthContext.jsx';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { Badge } from '../common/Badges.jsx';

/* Top bar: the role, the organisation, the signed-in user and sign out. */
export default function Topbar({ portal = 'buyer' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const name = displayName(auth.user, auth.profile);
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const vendor = portal === 'vendor';
  const v = auth.vendor?.verificationStatus;
  return (
    <header className="top">
      <div className="top-role">
        <span className={'role-pill' + (vendor ? ' vendor' : '')} data-role={portal}>{vendor ? 'Vendor' : 'Buyer'}</span>
        <div className="top-org"><b>{auth.profile?.organisationName || ''}</b>
          <span className="note">{vendor ? 'Vendor portal · the company providing the outsourced service' : 'Buyer portal · the organisation outsourcing a service'}</span></div>
        {vendor && v ? <Badge s={VERIFY_LABEL[v][0]} label={VERIFY_LABEL[v][1]} /> : null}
      </div>
      <div className="right">
        <div className="user">
          <span className="avatar">{initials}</span>
          <div><b className="top-name">{name}</b><div className="role">{auth.profile?.jobRole || ''}</div></div>
        </div>
        <button className="btn sm" data-act="signout" title={'Signed in as ' + auth.user?.email} onClick={() => { navigate('/'); auth.logout(); }}>Sign out</button>
      </div>
    </header>
  );
}
