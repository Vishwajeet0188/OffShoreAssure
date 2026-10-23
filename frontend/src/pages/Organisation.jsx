import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtDate, fmtTime } from '../lib/format.js';
import { MEMBERSHIP } from '../lib/membership.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import Loading from '../components/extras/Loading.jsx';

/* Buyer organisation: members and join requests. Only the owner can approve or reject. */
export default function Organisation() {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(() => api('/organisation').then(setD).catch(x => setErr(x.message)), []);
  useEffect(() => { load(); }, [load]);
  const decide = async (m, action) => {
    setBusy(m.userId); setErr(''); setMsg('');
    try { await api('/organisation/members/' + m.userId, { method: 'PATCH', body: { action } }); setMsg(`${m.fullName || m.email} ${action === 'approve' ? 'can now see your organisation’s requirements and assessments' : 'was not approved'}. They have been emailed.`); await load(); }
    catch (x) { setErr(x.message); } finally { setBusy(''); }
  };
  if (err && !d) return <p className="form-err">{err}</p>;
  if (!d) return <Loading />;
  if (!d.organisation) return <p className="note">No organisation yet.</p>;
  const owner = d.membership === 'owner';
  const pending = d.members.filter(m => m.membership === 'pending');
  return (
    <>
      <PageHead eyebrow="Buyer · Organisation" title={d.organisation.name}
        lead="People in your organisation share its requirements and assessments. Anyone else who registers with this organisation's name waits here until the owner approves them."
        right={<Badge s={MEMBERSHIP[d.membership][0]} label={'You: ' + MEMBERSHIP[d.membership][1]} />} />
      {msg ? <div className="rq-msg ok" role="status"><b>{msg}</b></div> : null}
      {err ? <p className="form-err" role="alert">{err}</p> : null}
      {pending.length ? (
        <div className="card" data-section="join-requests">
          <div className="ch"><div><h2>Requests to join</h2><div className="sub">{owner ? 'Approve only people you know work for your organisation.' : 'Only the owner can approve or reject requests.'}</div></div><span className="note">{pending.length}</span></div>
          <div className="tw"><table><thead><tr><th>Person</th><th>Role</th><th>Registered</th><th></th></tr></thead>
            <tbody>{pending.map(m => (
              <tr key={m.userId}><td><b>{m.fullName}</b><div className="note">{m.email}</div></td><td>{m.jobRole}</td><td className="mono">{fmtTime(m.registeredAt)}</td>
                <td style={{ textAlign: 'right' }}>{owner ? <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm primary" disabled={busy === m.userId} onClick={() => decide(m, 'approve')} data-act="approve-member">Approve</button>
                  <button className="btn sm" disabled={busy === m.userId} onClick={() => decide(m, 'reject')} data-act="reject-member">Reject</button></div> : <Badge s="Pending" label="Waiting for the owner" />}</td></tr>))}</tbody></table></div>
        </div>) : null}
      <div className="card">
        <div className="ch"><h2>Members</h2><span className="note">{d.members.length - pending.length}</span></div>
        <div className="tw"><table><thead><tr><th>Person</th><th>Role</th><th>Access</th><th>Joined</th><th>Last sign-in</th></tr></thead>
          <tbody>{d.members.filter(m => m.membership !== 'pending').map(m => (
            <tr key={m.userId}><td><b>{m.fullName}</b><div className="note">{m.email}</div></td><td>{m.jobRole}</td>
              <td><Badge s={MEMBERSHIP[m.membership][0]} label={MEMBERSHIP[m.membership][1]} /></td>
              <td className="mono">{fmtDate(m.decidedAt || m.registeredAt)}</td><td className="mono">{m.lastLoginAt ? fmtTime(m.lastLoginAt) : 'Never'}</td></tr>))}</tbody></table></div>
      </div>
    </>
  );
}
