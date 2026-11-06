import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon } from '../components/common/Icon.jsx';
import VendorProfileForm from '../components/auth/VendorProfileForm.jsx';
import { homeFor } from '../lib/roles.js';

export const SECTORS = [
  'Financial Services',
  'Healthcare',
  'Retail',
  'IT & Technology',
  'Professional Services',
  'Public Sector',
  'Other',
];
export const JOB_ROLES = [
  'Compliance Manager',
  'Information Security Lead',
  'Legal & Procurement',
  'Vendor Manager',
  'Other',
];

/* Stage 0 · Complete your profile: the details not collected at registration (pending confirmation of fields). */
export default function CompleteProfile() {
  const auth = useAuth();
  if (auth.user?.role === 'vendor') return <VendorCompleteProfile />;
  return <BuyerCompleteProfile />;
}

/* Vendor (supplier): the person and the company profile. */
function VendorCompleteProfile() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <section className="lp-sec lp-authsec">
      <div className="lp-wrap lp-auth" style={{ maxWidth: 820 }}>
        <div className="card pad stack" style={{ gap: 16 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="role-pill">Vendor</span>
              <span className="proto">Step 2 of 2</span>
            </div>
            <h1 className="lp-h2" style={{ marginTop: 10 }}>
              Set up your company profile
            </h1>
            <p className="lp-sub" style={{ margin: '6px 0 0' }}>
              Signed in as <b>{auth.user?.email}</b>. Tell us who you are and about the company that provides
              outsourced services.
            </p>
          </div>
          <VendorProfileForm
            initial={{ ...auth.profile, ...(auth.vendor || {}) }}
            submitLabel={
              <>
                Save and continue <Icon n="arrow" s={15} />
              </>
            }
            onSaved={async f => {
              await auth.saveProfile(f);
              navigate('/vendor', { replace: true });
            }}
            extraButtons={
              <button
                className="btn"
                type="button"
                onClick={() => {
                  navigate('/');
                  auth.logout();
                }}
              >
                Sign out
              </button>
            }
          />
        </div>
      </div>
    </section>
  );
}

/* Buyer: the person and the organisation that is outsourcing. */
function BuyerCompleteProfile() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    fullName: '',
    organisationName: '',
    sector: '',
    jobRole: '',
    phone: '',
    ...(auth.profile || {}),
  });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setMsg('');
    const v = {};
    if (f.fullName.trim().length < 2) v.fullName = 'Enter your full name.';
    if (f.organisationName.trim().length < 2) v.organisationName = 'Enter your organisation name.';
    if (!f.sector) v.sector = 'Choose a sector.';
    if (!f.jobRole) v.jobRole = 'Choose your role.';
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await auth.saveProfile(f);
      navigate(homeFor(r.user), { replace: true });
    } catch (x) {
      setErrs(x.fields || {});
      setMsg(x.message);
    } finally {
      setBusy(false);
    }
  };
  const err = k => (errs[k] ? <span className="form-err">{errs[k]}</span> : null);

  return (
    <section className="lp-sec lp-authsec">
      <div className="lp-wrap lp-auth">
        <div className="card pad stack" style={{ gap: 16 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="role-pill">Buyer</span>
              <span className="proto">Step 2 of 2</span>
            </div>
            <h1 className="lp-h2" style={{ marginTop: 10 }}>
              Complete your profile
            </h1>
            <p className="lp-sub" style={{ margin: '6px 0 0' }}>
              Signed in as <b>{auth.user?.email}</b>. Tell us who you are and which organisation you assess
              suppliers for.
            </p>
          </div>
          <form className="form" noValidate onSubmit={submit}>
            <div className="field">
              <label htmlFor="cp-name">Full name</label>
              <input
                type="text"
                id="cp-name"
                autoComplete="name"
                value={f.fullName}
                onChange={set('fullName')}
              />
              {err('fullName')}
            </div>
            <div className="field">
              <label htmlFor="cp-org">Organisation name</label>
              <input
                type="text"
                id="cp-org"
                autoComplete="organization"
                placeholder="e.g. UK Company Ltd"
                value={f.organisationName}
                onChange={set('organisationName')}
              />
              {err('organisationName')}
            </div>
            <div className="field">
              <label htmlFor="cp-sector">Sector</label>
              <select id="cp-sector" value={f.sector} onChange={set('sector')}>
                <option value="">Select…</option>
                {SECTORS.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {err('sector')}
            </div>
            <div className="field">
              <label htmlFor="cp-role">Your role</label>
              <select id="cp-role" value={f.jobRole} onChange={set('jobRole')}>
                <option value="">Select…</option>
                {JOB_ROLES.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {err('jobRole')}
            </div>
            <div className="field">
              <label htmlFor="cp-phone">Phone (optional)</label>
              <input type="tel" id="cp-phone" autoComplete="tel" value={f.phone} onChange={set('phone')} />
              {err('phone')}
            </div>
            <div className="field full">
              {msg ? (
                <p className="form-err" role="alert">
                  {msg}
                </p>
              ) : null}
              <div className="row">
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? (
                    'Saving…'
                  ) : (
                    <>
                      Save and continue <Icon n="arrow" s={15} />
                    </>
                  )}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    navigate('/');
                    auth.logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
