import { Link } from 'react-router-dom';
import { useAuth, displayName } from '../../context/AuthContext.jsx';
import { VENDOR_JOURNEY } from '../../lib/stages.js';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { fmtTime } from '../../lib/format.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { Icon } from '../../components/common/Icon.jsx';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = list => (list || []).map(c => regionName.of(c)).join(', ');

/* Vendor (supplier) dashboard: verification status, company profile summary and the vendor's part of the journey. */
export default function VendorDashboard() {
  const auth = useAuth();
  const v = auth.vendor;
  const st = v?.verificationStatus || 'pending';
  return (
    <>
      <PageHead eyebrow={'Vendor dashboard · ' + (auth.profile?.organisationName || '')} title={'Welcome, ' + displayName(auth.user, auth.profile).split(' ')[0]}
        lead="Your company's profile on OffshoreAssure, and what you will be asked to do when UK buyers assess you." />
      <div className="role-note vendor" data-section="role-note">
        <span className="role-pill vendor">Vendor</span>
        <p>You are signed in as a <b>vendor (supplier)</b>: the company that provides an outsourced service. Buyers assess you; you answer questionnaires, provide evidence and close actions.
          <span className="note"> Buyers use a separate buyer portal. The OffshoreAssure team uses the admin console.</span></p>
      </div>

      <section className={'card vstatus vstatus-' + st} data-section="verification">
        <div className="vstatus-head">
          <div><div className="eyebrow">Company verification · ASS-001 Legal Entity Verification</div>
            <h2>{st === 'approved' ? 'Your company is verified' : st === 'rejected' ? 'Verification needs attention' : 'Waiting for verification'}</h2></div>
          <Badge s={VERIFY_LABEL[st][0]} label={VERIFY_LABEL[st][1]} />
        </div>
        <p>{st === 'approved'
          ? `The OffshoreAssure team verified ${auth.profile?.organisationName}${v?.verifiedAt ? ' on ' + fmtTime(v.verifiedAt) : ''}. Your profile can now be presented to UK buyers.`
          : st === 'rejected'
            ? 'The OffshoreAssure team could not verify your company yet. Correct your company details and they will be reviewed again.'
            : 'The OffshoreAssure team is checking your company’s identity, registration and jurisdiction. Buyers will see your profile once it is verified. We will email you when it is done.'}</p>
        {st === 'rejected' && v?.verificationNote ? <p className="vstatus-note"><b>Reason:</b> {v.verificationNote}</p> : null}
        <div><Link className="btn sm" to="/vendor/profile">{st === 'rejected' ? 'Update company details' : 'View company profile'}</Link></div>
      </section>

      <div className="card">
        <div className="ch"><div><h2>Company profile</h2><div className="sub">Stage 2 · your reusable profile for UK buyers</div></div><Link className="link" to="/vendor/profile">Open <Icon n="arrow" s={13} /></Link></div>
        {v ? <dl className="kv rq-kv">
          <div><dt>Company</dt><dd>{auth.profile.organisationName}</dd></div>
          <div><dt>Registration number</dt><dd>{v.registrationNumber}</dd></div>
          <div><dt>Country of registration</dt><dd>{countries([v.country])}</dd></div>
          <div><dt>Delivers from</dt><dd>{countries(v.deliveryCountries)}</dd></div>
          <div><dt>Services</dt><dd>{v.services.join(', ')}</dd></div>
          <div><dt>Website</dt><dd>{v.website || '—'}</dd></div>
        </dl> : <p className="note pad">No company profile yet.</p>}
      </div>

      <div className="card">
        <div className="ch"><div><h2>Your part in the assessment</h2><div className="sub">From the client's Technical Architecture (offshore vendor lane) and sequence diagram</div></div></div>
        <ol className="journey">{VENDOR_JOURNEY.map(j => (
          <li key={j.slug} className={j.path ? 'journey-partial' : 'journey-not-started'}>
            <Link to={j.path || '/vendor/stage/' + j.slug}>
              <span className="journey-n">{j.stage}</span>
              <span className="journey-t"><b>{j.title}</b><span className="note">{j.text}</span></span>
              <span className="journey-s">{j.path ? 'Available' : 'Not available yet'}</span>
            </Link>
          </li>))}</ol>
      </div>
    </>
  );
}
