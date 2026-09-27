import { USERS } from '../data/prototype-data.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';

/* Prototype buyer registration. Details stay in this browser and pre-fill new assessments. No account or password is created. */
export default function Signup() {
  const { S, act } = useAssessment();
  const b = S.buyerDraft || S.buyer || {};
  const field = (k, label, ph) => <div className="field"><label htmlFor={'su-' + k}>{label}</label><input type="text" id={'su-' + k} data-su={k} value={b[k] || ''} placeholder={ph} onChange={e => act.setBuyerDraft(k, e.target.value)} /></div>;
  return (
    <section className="lp-sec lp-authsec"><div className="lp-wrap lp-auth">
      <div className="card pad stack" style={{ gap: 16 }}>
        <div><span className="proto">Prototype registration</span><h1 className="lp-h2" style={{ marginTop: 10 }}>Register your organisation</h1>
          <p className="lp-sub" style={{ margin: '6px 0 0' }}>Set up a buyer workspace for the demonstration. Nothing is sent anywhere: the details stay in this browser and pre-fill new assessments. No account or password is created.</p></div>
        {S.buyer ? <div className="outcome sage" style={{ padding: '12px 16px' }}><p><b>{S.buyer.org}</b> is registered for this demo. New assessments start with this organisation.</p></div> : null}
        <form className="form" data-form="signup" noValidate onSubmit={e => { e.preventDefault(); act.submitSignup(); }}>
          {field('org', 'Organisation name', 'e.g. Acme Financial Services Ltd')}
          <div className="field"><label htmlFor="su-sector">Sector</label>
            <select id="su-sector" data-su="sector" value={b.sector || 'Financial Services'} onChange={e => act.setBuyerDraft('sector', e.target.value)}>
              {['Financial Services', 'Healthcare', 'Retail', 'Professional Services'].map(x => <option key={x}>{x}</option>)}
            </select></div>
          {field('name', 'Your name', 'e.g. Sarah Williams')}
          <div className="field"><label htmlFor="su-role">Your role</label>
            <select id="su-role" data-su="role" value={b.role || 'sw'} onChange={e => act.setBuyerDraft('role', e.target.value)}>
              {USERS.map(u => <option key={u.id} value={u.id}>{u.role}</option>)}
            </select></div>
          <div className="field full"><div className="row">
            <button className="btn primary" type="submit">Create buyer workspace <Icon n="arrow" s={15} /></button>
            <span className="note">Already set up? <button className="link" type="button" data-act="go" data-v="login" onClick={() => act.go('login')}>Sign in</button></span>
          </div></div>
        </form>
      </div>
    </div></section>
  );
}
