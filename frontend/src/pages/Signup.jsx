import { useState } from 'react';
import PasswordInput from '../components/auth/PasswordInput.jsx';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon } from '../components/common/Icon.jsx';
import VerifyCodeModal from '../components/auth/VerifyCodeModal.jsx';

/* Stage 0 · Registration (same pattern as ScotWarm): email + password → Register →
   6-digit code emailed → verification popup → account created. Other details are collected afterwards. */
export default function Signup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') === 'vendor' ? 'vendor' : 'buyer');
  const [form, setForm] = useState({ email: params.get('email') || '', password: '', confirm: '' });
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { email, info } while the code popup is open
  const [done, setDone] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setMsg('');
    const v = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) v.email = 'Enter a valid email address.';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) v.password = 'Use at least 8 characters with a letter and a number.';
    if (form.confirm !== form.password) v.confirm = 'Passwords do not match.';
    setErrs(v); if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await auth.register(form.email.trim(), form.password, role);
      setPending({ email: r.email || form.email.trim().toLowerCase(), info: r });
    } catch (x) {
      setErrs(x.fields || {}); setMsg(x.code === 'validation' ? '' : x.message);
    } finally { setBusy(false); }
  };

  const verify = async code => {
    const r = await auth.verify(pending.email, code);
    setPending(null);
    if (r.status === 'pending_approval') { setDone(r.message); return; }
    navigate('/complete-profile', { replace: true });
  };

  return (
    <section className="lp-sec lp-authsec"><div className="lp-wrap lp-auth" style={{ maxWidth: 520 }}>
      <div className="card pad stack" style={{ gap: 18, padding: '30px 30px 26px' }}>
        <div>
          <h1 className="lp-h2">Create your account</h1>
          <p className="lp-sub" style={{ margin: '6px 0 0' }}>Register with your work email. We'll send a 6-digit code to confirm it. You'll add your {role === 'vendor' ? 'company' : 'organisation'} details after that.</p>
        </div>
        <fieldset className="role-pick" data-field="role">
          <legend>I am registering as</legend>
          <label className={'role-opt' + (role === 'buyer' ? ' on' : '')}>
            <input type="radio" name="role" value="buyer" checked={role === 'buyer'} onChange={() => setRole('buyer')} />
            <span className="role-opt-t"><b>A buyer</b><span>My organisation is outsourcing a service and needs to assess the supplier.</span></span>
          </label>
          <label className={'role-opt' + (role === 'vendor' ? ' on' : '')}>
            <input type="radio" name="role" value="vendor" checked={role === 'vendor'} onChange={() => setRole('vendor')} />
            <span className="role-opt-t"><b>A vendor (supplier)</b><span>My company provides outsourced services and wants to be assessed by UK buyers.</span></span>
          </label>
        </fieldset>
        {done ? <div className="outcome sage" style={{ padding: '12px 16px' }}><p>{done}</p></div> : null}
        <form className="stack" data-form="signup" noValidate style={{ gap: 14 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor="su-email">Work email</label>
            <input type="email" id="su-email" autoComplete="email" placeholder="name@company.com" value={form.email} onChange={set('email')} aria-invalid={!!errs.email} />
            {errs.email ? <span className="form-err">{errs.email}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="su-pass">Password</label>
            <PasswordInput id="su-pass" autoComplete="new-password" placeholder="At least 8 characters, with a letter and a number" value={form.password} onChange={set('password')} aria-invalid={!!errs.password} />
            {errs.password ? <span className="form-err">{errs.password}</span> : null}
          </div>
          <div className="field">
            <label htmlFor="su-confirm">Confirm password</label>
            <PasswordInput id="su-confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} aria-invalid={!!errs.confirm} />
            {errs.confirm ? <span className="form-err">{errs.confirm}</span> : null}
          </div>
          {msg ? <p className="form-err" role="alert">{msg}{/already exists/.test(msg) ? <> <Link className="link" to="/login">Sign in</Link></> : null}</p> : null}
          <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center', padding: 11 }}>{busy ? 'Sending code…' : <>Register as {role === 'vendor' ? 'a vendor' : 'a buyer'} <Icon n="arrow" s={15} /></>}</button>
        </form>
        <p className="note">Already registered? <Link className="link" to="/login">Sign in</Link></p>
        <p className="note" style={{ marginTop: -8 }}>OffshoreAssure staff accounts are created by an administrator, not here.</p>
      </div>
    </div>
    {pending ? <VerifyCodeModal email={pending.email} info={pending.info} onSubmit={verify}
      onResend={() => auth.resendCode(pending.email, 'register')} onClose={() => setPending(null)} submitLabel="Verify and create account" /> : null}
    </section>
  );
}
