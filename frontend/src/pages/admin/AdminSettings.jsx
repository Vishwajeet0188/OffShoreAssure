import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import Loading from '../../components/extras/Loading.jsx';

/* Read-only view of the platform configuration (values come from the server's .env; no secrets are shown). */
export default function AdminSettings() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/admin/settings').then(setD).catch(x => setErr(x.message)); }, []);
  if (err) return <p className="form-err">{err}</p>;
  if (!d) return <Loading />;
  const yes = v => (v ? 'Yes' : 'No');
  return (
    <>
      <PageHead eyebrow="Admin console" title="Platform settings" lead={`How registration, sign-in and email are configured (${d.environment}). Values are set in the server's .env file; several are pending confirmation from the client.`} />
      <div className="adm-grid">
        <div className="card pad stack">
          <h2>Registration</h2>
          <dl className="kv">
            <dt>Admin approval after email verification</dt><dd>{yes(d.registration.requireAdminApproval)} <span className="note">(pending decision)</span></dd>
            <dt>Verification code</dt><dd>{d.registration.codeLength} digits, valid {d.registration.codeTtlMinutes} minutes</dd>
            <dt>Wrong-code attempts allowed</dt><dd>{d.registration.codeMaxAttempts}</dd>
            <dt>Resend available after</dt><dd>{d.registration.resendCooldownSeconds} seconds</dd>
          </dl>
        </div>
        <div className="card pad stack">
          <h2>Sign-in security</h2>
          <dl className="kv">
            <dt>Lock after failed sign-ins</dt><dd>{d.security.maxFailedLogins} attempts, for {d.security.lockMinutes} minutes</dd>
            <dt>Session length</dt><dd>{d.security.sessionHours} hours</dd>
            <dt>Rate limiting</dt><dd>{d.security.rateLimit ? 'On' : 'Off'}</dd>
            <dt>Passwords</dt><dd>bcrypt hashed; verification codes stored as hashes</dd>
          </dl>
        </div>
        <div className="card pad stack">
          <h2>Email delivery</h2>
          <dl className="kv">
            <dt>Status</dt><dd>{d.email.configured ? <Badge s="Verified" label="SMTP configured" /> : <Badge s="Attention" label="Not configured (codes printed in server console)" />}</dd>
            <dt>SMTP server</dt><dd className="mono">{d.email.host || '—'}</dd>
            <dt>Sender</dt><dd>{d.email.from}</dd>
            <dt>Codes shown on screen</dt><dd>{d.email.devShowCodes ? 'Yes (development only)' : 'No'}</dd>
          </dl>
        </div>
        <div className="card pad stack">
          <h2>Data and hosting</h2>
          <dl className="kv">
            <dt>Database</dt><dd>PostgreSQL</dd>
            <dt>Audit log</dt><dd>Append-only (edits and deletes blocked by the database)</dd>
            <dt>Production hosting</dt><dd>UK region required (Technical Architecture) <span className="note">(pending decision)</span></dd>
          </dl>
        </div>
      </div>
    </>
  );
}
