import { useState } from 'react';
import { USERS } from '../data/prototype-data.js';
import { DEMO_EMAIL } from '../context/AssessmentContext.jsx';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';

/* Simulated sign-in. Nothing is checked, stored or sent: the email only selects a demo role.
   The password is held in component state for the "required" check and is never saved. */
export default function Login() {
  const { S, act } = useAssessment();
  const [email, setEmail] = useState(S.loginEmail || '');
  const [pass, setPass] = useState('');
  const opts = USERS.map(u => [u.id, u.name, u.role]).concat([['vendor', 'Supplier contact', 'Supplier portal']]);
  const sel = S.loginPick || 'sw';
  const submit = e => { e.preventDefault(); act.submitLogin(email.trim(), !!pass); };
  return (
    <section className="lp-sec lp-authsec"><div className="lp-wrap lp-auth" style={{ maxWidth: 520 }}>
      <div className="card pad stack" style={{ gap: 18, padding: '30px 30px 26px' }}>
        <div><h1 className="lp-h2">Sign in</h1><p className="lp-sub" style={{ margin: '6px 0 0' }}>Sign in to your OffshoreAssure buyer workspace.</p></div>
        <div className="callout" style={{ padding: '10px 14px' }}><span><b>Phase 1 Prototype — authentication is simulated.</b> Any email and password will sign you in. Nothing is checked, stored or sent.</span></div>
        <form className="stack" data-form="login" noValidate style={{ gap: 14 }} autoComplete="off" onSubmit={submit}>
          <div className="field"><label htmlFor="li-email">Email address</label><input type="text" inputMode="email" id="li-email" placeholder="name@company.com" value={email} autoComplete="off" onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="li-pass">Password</label><input type="password" id="li-pass" placeholder="Enter any password" autoComplete="off" value={pass} onChange={e => setPass(e.target.value)} /></div>
          {S.loginErr ? <p className="note" role="alert" style={{ color: 'var(--coral)' }}>{S.loginErr}</p> : null}
          <button className="btn primary" type="submit" style={{ justifyContent: 'center', padding: 11 }}>Sign In</button>
        </form>
        <p className="note">Demo accounts: {USERS.map((u, i) => <span key={u.id}>{i ? ', ' : ''}<span className="mono">{DEMO_EMAIL(u.id)}</span></span>)}. Any other email signs in as Compliance Manager.</p>
        <details className="trace"><summary>Use Demo Account</summary>
          <div className="stack" style={{ gap: 8, padding: '4px 16px 16px' }}>
            <div className="stack" role="radiogroup" aria-label="Demo user" style={{ gap: 8 }}>
              {opts.map(o => (
                <label key={o[0]} className={'lp-user' + (sel === o[0] ? ' on' : '')}>
                  <input type="radio" name="lp-user" value={o[0]} data-act="lpuser" checked={sel === o[0]} onChange={() => act.setLoginPick(o[0])} />
                  <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{o[1].split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
                  <span><b>{o[1]}</b><span className="note" style={{ display: 'block' }}>{o[2]}</span></span>
                </label>))}
            </div>
            <div><button className="btn outline" data-act="lplogin" onClick={act.demoLogin}>Continue as demo user <Icon n="arrow" s={15} /></button></div>
          </div>
        </details>
        <p className="note">New organisation? <button className="link" data-act="go" data-v="signup" onClick={() => act.go('signup')}>Register as a buyer</button></p>
      </div>
    </div></section>
  );
}
