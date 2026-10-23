import { useEffect, useRef, useState } from 'react';

/* Popup that asks for the 6-digit code sent by email (registration or password reset).
   props: email, purpose, info ({ expiresInMinutes, resendInSeconds, devCode }), onSubmit(code) → Promise,
          onResend() → Promise<info>, onClose(), extra (optional fields rendered above the button), submitLabel */
export default function VerifyCodeModal({ email, purpose = 'register', info, onSubmit, onResend, onClose, extra, submitLabel = 'Verify' }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(info?.resendInSeconds || 0);
  const [devCode, setDevCode] = useState(info?.devCode || '');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async e => {
    e.preventDefault(); setErr(''); setNote('');
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code from the email.'); return; }
    setBusy(true);
    try { await onSubmit(code); } catch (x) {
      const left = x.body?.attemptsLeft;
      setErr(x.message + (x.code === 'wrong_code' && left != null ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ''));
      if (x.fields && !x.fields.code && Object.keys(x.fields).length) setErr(Object.values(x.fields)[0]);
    } finally { setBusy(false); }
  };
  const resend = async () => {
    setErr(''); setNote('');
    try {
      const r = await onResend();
      setWait(r.resendInSeconds || 60); setDevCode(r.devCode || ''); setCode('');
      setNote('A new code has been sent to your email.');
    } catch (x) { setErr(x.message); if (x.body?.resendInSeconds) setWait(x.body.resendInSeconds); }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="vc-title">
        <button type="button" className="modal-x" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        <h2 id="vc-title" className="serif" style={{ fontSize: 22 }}>{purpose === 'reset' ? 'Reset your password' : 'Verify your email'}</h2>
        <p className="note" style={{ fontSize: 13.5 }}>
          We sent a 6-digit code to <b style={{ color: 'var(--ink)' }}>{email}</b>. It expires in {info?.expiresInMinutes || 10} minutes.
        </p>
        {devCode ? <div className="callout" style={{ padding: '8px 12px' }}><span><b>Development mode:</b> your code is <span className="mono">{devCode}</span> (email is not configured).</span></div> : null}
        <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="vc-code">Verification code</label>
            <input ref={inputRef} id="vc-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" />
          </div>
          {extra}
          {err ? <p className="form-err" role="alert">{err}</p> : null}
          {note ? <p className="form-ok" role="status">{note}</p> : null}
          <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center', padding: 11 }}>{busy ? 'Checking…' : submitLabel}</button>
        </form>
        <p className="note" style={{ textAlign: 'center' }}>
          Didn't get it? Check your spam folder or{' '}
          {wait > 0 ? <span>resend in {wait}s</span> : <button type="button" className="link" onClick={resend}>resend the code</button>}
        </p>
      </div>
    </div>
  );
}
