import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';

/* OffshoreAssure staff who can use the admin console. */
export default function AdminTeam() {
  const { user: me } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '' });
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/admin/team').then(setD).catch(x => setErr(x.message)), []);
  useEffect(() => { load(); }, [load]);

  const add = async e => {
    e.preventDefault(); setErr(''); setOk(''); setFieldErr({}); setBusy(true);
    try {
      const r = await api('/admin/team', { method: 'POST', body: form });
      setOk(`${r.email} added. ${r.emailed ? 'We emailed them' : 'Tell them'} to open Forgot password, enter this email and set their password.`);
      setForm({ fullName: '', email: '' }); await load();
    } catch (x) { setFieldErr(x.body?.fields || {}); setErr(x.message); } finally { setBusy(false); }
  };
  const setStatus = async (a, status) => {
    setErr(''); setOk('');
    try { await api('/admin/team/' + a.id, { method: 'PATCH', body: { status } }); await load(); } catch (x) { setErr(x.message); }
  };
  return (
    <>
      <PageHead eyebrow="Admin console · Platform" title="Admin team" lead="OffshoreAssure staff who can open this console. Admin accounts are separate from buyer and supplier accounts." />
      <form className="card pad stack" onSubmit={add} noValidate data-form="add-admin">
          <h2>Add an admin</h2>
          <p className="note">They receive an email and set their own password through Forgot password. Use their work email; it cannot be an email already used by a buyer.</p>
          <div className="adm-addrow">
          <div className="field"><label htmlFor="ad-name">Full name</label><input type="text" id="ad-name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />{fieldErr.fullName ? <p className="form-err">{fieldErr.fullName}</p> : null}</div>
          <div className="field"><label htmlFor="ad-email">Work email</label><input type="email" id="ad-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />{fieldErr.email ? <p className="form-err">{fieldErr.email}</p> : null}</div>
          <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add admin'}</button>
          </div>
          {err ? <p className="form-err" role="alert">{err}</p> : null}
          {ok ? <p className="form-ok" role="status">{ok}</p> : null}
        </form>
      <div>
        <div className="card">
          <div className="ch"><h2>Admins</h2><span className="note">{d ? d.admins.filter(a => a.status === 'active').length + ' active' : ''}</span></div>
          <div className="tw"><table>
            <thead><tr><th>Name</th><th>Status</th><th>Added</th><th>Last sign-in</th><th></th></tr></thead>
            <tbody>{!d ? <tr><td colSpan="5" className="note">Loading…</td></tr> : d.admins.map(a => (
              <tr key={a.id}>
                <td><b>{a.fullName || '—'}</b>{a.id === me.id ? <span className="proto" style={{ marginLeft: 6 }}>you</span> : null}<div className="note">{a.email}</div></td>
                <td>{a.status !== 'active' ? <Badge s="Restricted" label="Deactivated" /> : a.passwordSet ? <Badge s="Approved" label="Active" /> : <Badge s="Pending" label="Password not set yet" />}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.createdAt)}</td>
                <td className="mono">{a.lastLoginAt ? fmtTime(a.lastLoginAt) : 'Never'}</td>
                <td style={{ textAlign: 'right' }}>{a.id === me.id ? null : a.status === 'active'
                  ? <button className="btn sm" onClick={() => setStatus(a, 'inactive')}>Deactivate</button>
                  : <button className="btn sm primary" onClick={() => setStatus(a, 'active')}>Reactivate</button>}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
