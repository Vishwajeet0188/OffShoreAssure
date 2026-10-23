import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { VERIFY_LABEL } from '../../lib/roles.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import VendorProfileForm from '../../components/auth/VendorProfileForm.jsx';

/* Stage 2 (vendor lane): the vendor's reusable company profile. Changing the legal identity sends it back for verification. */
export default function VendorProfile() {
  const auth = useAuth();
  const [msg, setMsg] = useState('');
  const st = auth.vendor?.verificationStatus || 'pending';
  return (
    <>
      <PageHead eyebrow="Vendor · Stage 2 · Company profile" title="Company profile"
        lead="One reusable profile that OffshoreAssure can present to any UK buyer once your company is verified."
        right={<Badge s={VERIFY_LABEL[st][0]} label={VERIFY_LABEL[st][1]} />} />
      {msg ? <div className="rq-msg ok" role="status"><b>{msg}</b></div> : null}
      <div className="card pad">
        <VendorProfileForm key={auth.vendor?.organisationId || 'new'} initial={{ ...auth.profile, ...(auth.vendor || {}) }} submitLabel="Save company profile"
          notice={st === 'approved' ? <p className="note">Changing the company name, registration number or country sends the profile back for verification.</p> : null}
          onSaved={async f => {
            const r = await auth.saveProfile(f);
            setMsg(r.vendor.verificationStatus === 'pending' && st !== 'pending' ? 'Saved. Your company details changed, so the profile is back with the OffshoreAssure team for verification.' : 'Company profile saved.');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }} />
      </div>
    </>
  );
}
