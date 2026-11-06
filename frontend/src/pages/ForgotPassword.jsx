import { useState } from 'react';
import PasswordInput from '../components/auth/PasswordInput.jsx';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import VerifyCodeModal from '../components/auth/VerifyCodeModal.jsx';

/* Stage 0 · Forgot password: email → 6-digit code (same popup) + new password. */
export default function ForgotPassword() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [pw, setPw] = useState({ password: '', confirm: '' });

  const submit = async e => {
    e.preventDefault();
    setMsg('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMsg('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const r = await auth.forgotPassword(email.trim());
      setPending({ email: email.trim().toLowerCase(), info: r });
    } catch (x) {
      setMsg(x.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async code => {
    if (pw.password.length < 8 || !/[A-Za-z]/.test(pw.password) || !/\d/.test(pw.password))
      throw Object.assign(new Error('Use at least 8 characters with a letter and a number.'), { body: {} });
    if (pw.password !== pw.confirm) throw Object.assign(new Error('Passwords do not match.'), { body: {} });
    await auth.resetPassword(pending.email, code, pw.password);
    navigate('/login', {
      replace: true,
      state: { flash: 'Your password has been reset. Please sign in with your new password.' },
    });
  };

  return (
    <section className="lp-sec lp-authsec">
      <div className="lp-wrap lp-auth" style={{ maxWidth: 520 }}>
        <div className="card pad stack" style={{ gap: 18, padding: '30px 30px 26px' }}>
          <div>
            <h1 className="lp-h2">Forgot password</h1>
            <p className="lp-sub" style={{ margin: '6px 0 0' }}>
              Enter your account email. If it is registered, we'll send a 6-digit code to reset your password.
            </p>
          </div>
          <form className="stack" noValidate style={{ gap: 14 }} onSubmit={submit}>
            <div className="field">
              <label htmlFor="fp-email">Email address</label>
              <input
                type="email"
                id="fp-email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            {msg ? (
              <p className="form-err" role="alert">
                {msg}
              </p>
            ) : null}
            <button
              className="btn primary"
              type="submit"
              disabled={busy}
              style={{ justifyContent: 'center', padding: 11 }}
            >
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
          <p className="note">
            <Link className="link" to="/login">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
      {pending ? (
        <VerifyCodeModal
          email={pending.email}
          purpose="reset"
          info={pending.info}
          onSubmit={reset}
          onResend={() => auth.resendCode(pending.email, 'reset')}
          onClose={() => setPending(null)}
          submitLabel="Reset password"
          extra={
            <>
              <div className="field">
                <label htmlFor="fp-new">New password</label>
                <PasswordInput
                  id="fp-new"
                  autoComplete="new-password"
                  value={pw.password}
                  onChange={e => setPw(p => ({ ...p, password: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="fp-confirm">Confirm new password</label>
                <PasswordInput
                  id="fp-confirm"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                />
              </div>
            </>
          }
        />
      ) : null}
    </section>
  );
}
