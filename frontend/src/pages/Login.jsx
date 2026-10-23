import { useState } from 'react';
import PasswordInput from '../components/auth/PasswordInput.jsx';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../lib/roles.js';
import VerifyCodeModal from '../components/auth/VerifyCodeModal.jsx';

/* Stage 0 · Sign in with email and password. Unverified accounts get a fresh code and the verification popup. */
export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const flash = loc.state && loc.state.flash;

  /* Each role lands in its own portal; a "next" link is only followed inside that portal. */
  const goOn = r => {
    const home = homeFor(r.user);
    if (!r.user?.isAdmin && !r.profileComplete) return navigate('/complete-profile', { replace: true });
    const ok = next && next.startsWith('/') && (home === '/dashboard' ? !/^\/(admin|vendor)/.test(next) : next.startsWith(home));
    navigate(ok ? next : home, { replace: true });
  };

  const submit = async e => {
    e.preventDefault(); setMsg('');
    if (!email.trim() || !password) { setMsg('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const r = await auth.login(email.trim(), password);
      goOn(r);
    } catch (x) {
      if (x.code === 'not_verified') setPending({ email: x.body.email || email.trim().toLowerCase(), info: x.body });
      else setMsg(x.message);
    } finally { setBusy(false); }
  };

  const verify = async code => {
    const r = await auth.verify(pending.email, code);
    setPending(null);
    if (r.status === 'pending_approval') { setMsg(r.message); return; }
    goOn(r);
  };

  return (
    <section className="lp-sec lp-authsec"><div className="lp-wrap lp-auth" style={{ maxWidth: 520 }}>
      <div className="card pad stack" style={{ gap: 18, padding: '30px 30px 26px' }}>
        <div><h1 className="lp-h2">Sign in</h1><p className="lp-sub" style={{ margin: '6px 0 0' }}>Sign in to your OffshoreAssure buyer workspace.</p></div>
        {flash ? <div className="outcome sage" style={{ padding: '10px 14px' }}><p>{flash}</p></div> : null}
        <form className="stack" data-form="login" noValidate style={{ gap: 14 }} onSubmit={submit}>
          <div className="field"><label htmlFor="li-email">Email address</label>
            <input type="email" id="li-email" autoComplete="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field">
            <div className="spread"><label htmlFor="li-pass">Password</label><Link className="link" to="/forgot-password" style={{ fontSize: 12.5 }}>Forgot password?</Link></div>
            <PasswordInput id="li-pass" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {msg ? <p className="form-err" role="alert">{msg}</p> : null}
          <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center', padding: 11 }}>{busy ? 'Signing in…' : 'Sign In'}</button>
        </form>
        <p className="note">New to OffshoreAssure? <Link className="link" to="/signup">Create an account</Link></p>
      </div>
    </div>
    {pending ? <VerifyCodeModal email={pending.email} info={pending.info} onSubmit={verify}
      onResend={() => auth.resendCode(pending.email, 'register')} onClose={() => setPending(null)} submitLabel="Verify and sign in" /> : null}
    </section>
  );
}
