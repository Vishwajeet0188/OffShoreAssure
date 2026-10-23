import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { TIER_LABEL, TIER_TONE, serviceLabel } from '../lib/assessments.js';
import { MATCH_LABEL, CHECK_TONE, CHECK_WORD, CHECK_SHORT, VERIFY, countryList } from '../lib/selection.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';

const BackArrow = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;

/* Stage 2 landing: the organisation's assessments and where each one is in vendor selection. */
export function VendorSelectionList() {
  const navigate = useNavigate();
  const [list, setList] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api('/assessments').then(r => setList(r.assessments)).catch(x => setErr(x.message)); }, []);
  return (
    <>
      <PageHead eyebrow="Buyer · Stage 2 · Vendor selection" title="Vendor selection"
        lead="Choose the vendor for each assessment: search verified vendors or invite one, compare them against your requirement, then confirm your choice with the reason." />
      <div className="card" data-section="selection-list">
        {err ? <p className="form-err" style={{ padding: '0 22px' }}>{err}</p> : null}
        {!list ? <p className="note pad">Loading…</p> : !list.length ? (
          <p className="note pad">No assessments yet. Submit a requirement first (<Link className="link" to="/requirements">Stage 1 · Requirement</Link>); its Assessment ID then appears here.</p>
        ) : (
          <div className="tw"><table>
            <thead><tr><th>Assessment</th><th>Service</th><th>Risk tier</th><th>Vendor</th><th></th></tr></thead>
            <tbody>{list.map(a => (
              <tr key={a.reference} className="click" onClick={() => navigate('/vendor-selection/' + a.reference)}>
                <td><Link className="adm-ulink" to={'/vendor-selection/' + a.reference} onClick={e => e.stopPropagation()}><b className="mono">{a.reference}</b></Link><div className="note">{a.title}</div></td>
                <td>{serviceLabel(a.serviceCode)}</td>
                <td><span className={'b b-' + TIER_TONE[a.riskTier]}>{TIER_LABEL[a.riskTier]}</span></td>
                <td>{a.selectedVendor ? <><Badge s="Complete" label="Selected" /> <b style={{ marginLeft: 6 }}>{a.selectedVendor}</b>{a.selectionVersion > 1 ? <span className="note"> · v{a.selectionVersion}</span> : null}</>
                  : a.shortlisted ? <Badge s="In progress" label={`${a.shortlisted} on shortlist`} /> : <span className="muted">Not started</span>}</td>
                <td style={{ textAlign: 'right' }}><span className="link">{a.selectedVendor ? 'View' : 'Select vendor'} <Icon n="arrow" s={13} /></span></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

function Checks({ m }) {
  return <div className="vs-checks">{m.checks.map(c => <span key={c.id} className={'b ' + CHECK_TONE[c.result]} title={c.detail}>{CHECK_SHORT[c.id]}: {CHECK_WORD[c.result]}</span>)}</div>;
}
function MatchBadge({ m }) { const [s, l] = MATCH_LABEL[m.result]; return <Badge s={s} label={l} />; }

/* Stage 2 for one assessment: Steps 5 (search / invite), 6 (match), 7 (shortlist and compare), 8 (confirm) and 9 (saved selection). */
export default function VendorSelection() {
  const { ref } = useParams();
  const [st, setSt] = useState(null);
  const [ref0, setRef0] = useState(null);           // reference data (countries, services)
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState({ search: '', service: '', country: '' });
  const [results, setResults] = useState(null);
  const [inv, setInv] = useState({ email: '', companyName: '', message: '' });
  const [invErr, setInvErr] = useState({});
  const [showInvite, setShowInvite] = useState(false);
  const [pick, setPick] = useState({ vendorId: '', rationale: '', acceptFlags: false, changeReason: '' });
  const [pickErr, setPickErr] = useState({});
  const [changing, setChanging] = useState(false);
  const confirmRef = useRef(null);

  const names = useMemo(() => Object.fromEntries((ref0?.countries || []).map(c => [c.code, c.name])), [ref0]);
  const load = useCallback(() => api(`/assessments/${ref}/selection`).then(setSt).catch(x => setErr(x.message)), [ref]);
  const search = useCallback(async (params = q) => {
    const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    try { const r = await api(`/assessments/${ref}/vendors?${s}`); setResults(r.vendors); } catch (x) { setErr(x.message); }
  }, [ref, q]);
  useEffect(() => { load(); api('/reference').then(setRef0).catch(() => {}); search({}); }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key, fn, okText) => {
    setBusy(key); setErr(''); setMsg(null);
    try { const r = await fn(); if (r?.shortlist) setSt(r); if (okText) setMsg({ tone: 'ok', text: okText }); return r; }
    catch (x) { setMsg({ tone: 'err', text: x.message }); throw x; } finally { setBusy(''); }
  };
  const add = v => act('add' + v.id, () => api(`/assessments/${ref}/shortlist`, { method: 'POST', body: { vendorId: v.id } }), `${v.name} added to the shortlist.`)
    .then(() => setResults(rs => rs?.map(x => x.id === v.id ? { ...x, shortlisted: true } : x))).catch(() => {});
  const remove = v => act('rm' + v.id, () => api(`/assessments/${ref}/shortlist/${v.id}`, { method: 'DELETE' }), `${v.name} removed from the shortlist.`)
    .then(() => { setResults(rs => rs?.map(x => x.id === v.id ? { ...x, shortlisted: false } : x)); setPick(p => p.vendorId === v.id ? { ...p, vendorId: '' } : p); }).catch(() => {});
  const invite = async e => {
    e.preventDefault(); setInvErr({});
    const v = {};
    if (inv.companyName.trim().length < 2) v.companyName = 'Enter the company name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email.trim())) v.email = 'Enter a valid email address.';
    if (Object.keys(v).length) return setInvErr(v);
    try {
      await act('invite', () => api(`/assessments/${ref}/invitations`, { method: 'POST', body: inv }), `Invitation sent to ${inv.email.trim()}.`);
      setInv({ email: '', companyName: '', message: '' }); setShowInvite(false);
    } catch (x) { if (x.fields) setInvErr(x.fields); }
  };
  const confirm = async e => {
    e.preventDefault(); setPickErr({});
    const v = {};
    if (!pick.vendorId) v.vendorId = 'Choose a vendor from the shortlist.';
    if (pick.rationale.trim().length < 20) v.rationale = 'Explain the decision in at least 20 characters.';
    const cand = st.shortlist.find(x => x.id === pick.vendorId);
    if (cand?.match.flags.length && !pick.acceptFlags) v.acceptFlags = 'Tick to confirm you accept these issues.';
    if (st.current && pick.changeReason.trim().length < 5) v.changeReason = 'Say why the vendor is changing.';
    if (Object.keys(v).length) return setPickErr(v);
    try {
      await act('confirm', () => api(`/assessments/${ref}/selection`, { method: 'POST', body: { ...pick, changeReason: st.current ? pick.changeReason : undefined } }),
        `${cand.name} is now the selected vendor. The decision is saved to the evidence record and the vendor has been emailed.`);
      setPick({ vendorId: '', rationale: '', acceptFlags: false, changeReason: '' }); setChanging(false); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) { if (x.fields) setPickErr(x.fields); }
  };

  if (err && !st) return <p className="form-err">{err}</p>;
  if (!st) return <p className="note">Loading…</p>;
  const c = st.criteria, cur = st.current;
  const cand = st.shortlist.find(x => x.id === pick.vendorId);
  const showConfirm = !cur || changing;
  const step = n => n === 5 ? st.shortlist.length > 0 || !!cur : n === 7 ? st.shortlist.length > 0 : !!cur;
  return (
    <div className="vs">
      <Link className="link" to="/vendor-selection" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><BackArrow /> Vendor selection</Link>
      <PageHead eyebrow={`Buyer · Stage 2 · Vendor selection · ${st.assessment.reference}`} title={st.assessment.title}
        lead="Search verified vendors or invite one, compare them against your requirement, then confirm the vendor and say why."
        right={<span className="mono asr-tag">{st.assessment.reference}</span>} />
      <ol className="vs-steps" aria-label="Stage 2 steps">
        {[[5, 'Search or invite'], [6, 'Match'], [7, 'Shortlist and compare'], [8, 'Confirm vendor'], [9, 'Saved to evidence']].map(([n, t]) => (
          <li key={n} className={(n === 6 ? step(5) : step(n)) ? 'done' : ''}><span className="journey-n">{n}</span>{t}</li>))}
      </ol>
      {msg ? <div className={'rq-msg ' + msg.tone} role="status"><b>{msg.text}</b></div> : null}
      {st.blocked ? <div className="rq-flag warning"><Icon n="alert" s={16} /><span>{st.blocked} <Link className="link" to="/requirements">Open requirements</Link></span></div> : null}

      {cur ? (
        <section className="card vs-selected" data-section="selected-vendor">
          <div className="asr-head">
            <div>
              <div className="eyebrow">Step 9 · Saved to the evidence record · selection v{cur.version}</div>
              <h2 className="prf-title">{cur.vendor.name}</h2>
              <div className="note">Selected {fmtTime(cur.selectedAt)} by {cur.selectedByEmail} · fingerprint <span className="mono">{cur.snapshotSha256.slice(0, 16)}…</span></div>
            </div>
            <div className="row"><MatchBadge m={cur.match} />{!changing ? <button className="btn sm" data-act="change-vendor" onClick={() => { setChanging(true); setTimeout(() => confirmRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }}>Change vendor</button> : null}</div>
          </div>
          <div className="asr-block"><h3>Reason for the decision</h3><p style={{ margin: 0 }}>{cur.rationale}</p>
            {cur.acceptedFlags.length ? <p className="note" style={{ marginTop: 8 }}>Accepted issues: {cur.acceptedFlags.map(f => CHECK_SHORT[f]).join(', ')}</p> : null}
            {cur.changeReason ? <p className="note" style={{ marginTop: 8 }}>Why the vendor changed: {cur.changeReason}</p> : null}</div>
          <div className="asr-block"><h3>Match at the time of selection</h3><Checks m={cur.match} />
            <p className="note" style={{ marginTop: 8 }}>Compared with {cur.candidates.length} shortlisted vendor{cur.candidates.length === 1 ? '' : 's'}: {cur.candidates.map(x => `${x.name} (${MATCH_LABEL[x.result][1].toLowerCase()})`).join(', ')}.</p></div>
          {st.versions.length > 1 ? <div className="asr-block"><h3>Earlier selections</h3><ul>{st.versions.slice(0, -1).reverse().map(v => <li key={v.id}>v{v.version} · <b>{v.vendor.name}</b> · {fmtTime(v.selectedAt)} by {v.selectedByEmail}</li>)}</ul></div> : null}
          <div className="asr-block"><div className="rq-next" style={{ border: 0, padding: 0, background: 'none', boxShadow: 'none' }}><Icon n="clock" s={18} /><div><b>Stage 2 is complete for this assessment. Next: Stage 3 — Compliance assessment.</b> <span className="note">The vendor answers a questionnaire and uploads evidence.</span>
              <div style={{ marginTop: 8 }}><Link className="btn primary sm" to={'/compliance/' + st.assessment.reference} data-act="go-compliance">Open compliance assessment</Link></div></div></div></div>
        </section>) : null}

      <section className="card vs-criteria" data-section="criteria">
        <div className="ch"><div><h2>What vendors are matched against</h2><div className="sub">From your requirement (profile v{st.assessment.requirementVersion}). Step 6 checks every vendor against these.</div></div></div>
        <dl className="kv pad">
          <dt>Service</dt><dd>{c.serviceCategory}</dd>
          <dt>Preferred countries</dt><dd>{countryList(c.preferredCountries, c.names) || <span className="muted">None given</span>}</dd>
          <dt>Restricted countries</dt><dd>{countryList(c.restrictedCountries, c.names) || <span className="muted">None given</span>}</dd>
          <dt>Accessed from</dt><dd>{countryList(c.remoteAccessCountries, c.names) || <span className="muted">No remote access</span>}</dd>
        </dl>
      </section>

      <section className="card" data-section="search">
        <div className="ch"><div><h2><span className="rq-num">5</span> Search verified vendors</h2><div className="sub">Only vendors verified by OffshoreAssure are listed. Best matches first.</div></div>
          <button className="btn sm" data-act="show-invite" onClick={() => setShowInvite(v => !v)}>{showInvite ? 'Close' : 'Invite a vendor'}</button></div>
        {showInvite ? (
          <form className="vs-invite" onSubmit={invite} noValidate data-form="invite">
            <p className="note" style={{ margin: 0 }}>Can't find the vendor? Invite them by email. They register their company, OffshoreAssure verifies it, and it appears on your shortlist.</p>
            <div className="vs-grid">
              <div className="field"><label htmlFor="vi-company">Company name</label><input type="text" id="vi-company" value={inv.companyName} aria-invalid={!!invErr.companyName} onChange={e => setInv({ ...inv, companyName: e.target.value })} />{invErr.companyName ? <span className="form-err">{invErr.companyName}</span> : null}</div>
              <div className="field"><label htmlFor="vi-email">Contact email</label><input type="email" id="vi-email" value={inv.email} aria-invalid={!!invErr.email} onChange={e => setInv({ ...inv, email: e.target.value })} />{invErr.email ? <span className="form-err">{invErr.email}</span> : null}</div>
              <div className="field full"><label htmlFor="vi-msg">Message (optional)</label><textarea id="vi-msg" rows={2} maxLength={500} value={inv.message} onChange={e => setInv({ ...inv, message: e.target.value })} /></div>
            </div>
            <div><button className="btn primary sm" type="submit" disabled={busy === 'invite'} data-act="send-invite">{busy === 'invite' ? 'Sending…' : 'Send invitation'}</button></div>
          </form>) : null}
        <form className="vs-search" onSubmit={e => { e.preventDefault(); search(); }}>
          <input type="search" aria-label="Search vendors" placeholder="Search by company name or description" value={q.search} onChange={e => setQ({ ...q, search: e.target.value })} />
          <select aria-label="Service" value={q.service} onChange={e => setQ({ ...q, service: e.target.value })}><option value="">Any service</option>{(ref0?.serviceCategories || []).map(s => <option key={s}>{s}</option>)}</select>
          <select aria-label="Delivers from" value={q.country} onChange={e => setQ({ ...q, country: e.target.value })}><option value="">Any country</option>{(ref0?.countries || []).map(x => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
          <button className="btn" type="submit" data-act="search">Search</button>
        </form>
        {!results ? <p className="note pad">Loading…</p> : !results.length ? <p className="note pad">No verified vendors match this search. Try fewer filters, or invite the vendor by email.</p> : (
          <div className="tw"><table data-table="results">
            <thead><tr><th>Vendor</th><th>Delivers from</th><th>Match (step 6)</th><th></th></tr></thead>
            <tbody>{results.map(v => (
              <tr key={v.id} data-vendor={v.name}>
                <td><b>{v.name}</b><div className="note">{names[v.country] || v.country} · {v.services.join(', ')}</div>{v.description ? <div className="note vs-desc">{v.description}</div> : null}</td>
                <td>{countryList(v.deliveryCountries, names)}</td>
                <td><MatchBadge m={v.match} /><Checks m={v.match} /></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{v.shortlisted ? <span className="b b-sage">On shortlist</span>
                  : <button className="btn sm" disabled={busy === 'add' + v.id} onClick={() => add(v)} data-act="shortlist">Add to shortlist</button>}</td>
              </tr>))}</tbody>
          </table></div>)}
        {st.invitations.length ? (
          <div className="asr-block"><h3>Invitations</h3>
            <ul className="vs-invs">{st.invitations.map(i => <li key={i.id}><b>{i.companyName}</b> <span className="note">{i.email} · invited {fmtTime(i.createdAt)}</span>
              {i.status === 'joined' ? <Badge s={VERIFY[i.verificationStatus]?.[0] || 'Info'} label={'Registered · ' + (VERIFY[i.verificationStatus]?.[1] || '')} /> : <Badge s="Pending" label="Waiting for them to register" />}</li>)}</ul></div>) : null}
      </section>

      <section className="card" data-section="shortlist">
        <div className="ch"><div><h2><span className="rq-num">7</span> Shortlist and comparison</h2><div className="sub">Each check shows its reason. Vendors waiting for verification can be shortlisted but not selected.</div></div><span className="note">{st.shortlist.length}</span></div>
        {!st.shortlist.length ? <p className="note pad">No vendors on the shortlist yet. Add them from the search above.</p> : (
          <div className="tw"><table data-table="compare">
            <thead><tr><th>Vendor</th>{Object.values(CHECK_SHORT).map(h => <th key={h}>{h}</th>)}<th>Result</th><th></th></tr></thead>
            <tbody>{st.shortlist.map(v => (
              <tr key={v.id} data-vendor={v.name}>
                <td><b>{v.name}</b><div className="note">{countryList(v.deliveryCountries, names)}{v.source === 'invitation' ? ' · invited' : ''}</div></td>
                {v.match.checks.map(ch => <td key={ch.id}><span className={'b ' + CHECK_TONE[ch.result]} title={ch.detail}>{CHECK_WORD[ch.result]}</span><div className="note vs-why">{ch.detail}</div></td>)}
                <td><MatchBadge m={v.match} />{cur?.vendorId === v.id ? <div><span className="b b-plum" style={{ marginTop: 4 }}>Selected</span></div> : null}</td>
                <td style={{ textAlign: 'right' }}>{cur?.vendorId === v.id ? null : <button className="btn sm" disabled={busy === 'rm' + v.id} onClick={() => remove(v)} data-act="remove">Remove</button>}</td>
              </tr>))}</tbody>
          </table></div>)}
      </section>

      {showConfirm ? (
        <section className="card" data-section="confirm" ref={confirmRef}>
          <div className="ch"><div><h2><span className="rq-num">8</span> {cur ? 'Change the selected vendor' : 'Confirm the selected vendor'}</h2><div className="sub">Your choice and your reason are saved to the evidence record and cannot be edited later. {cur ? 'Changing vendor creates a new version.' : ''}</div></div>
            {cur ? <button className="btn sm" onClick={() => setChanging(false)}>Cancel</button> : null}</div>
          <form className="pad stack" onSubmit={confirm} noValidate data-form="confirm">
            <fieldset className="vs-pick"><legend className="ql">Vendor</legend>
              {st.shortlist.filter(v => v.id !== cur?.vendorId).map(v => (
                <label key={v.id} className={'vs-opt' + (v.match.selectable ? '' : ' off') + (pick.vendorId === v.id ? ' on' : '')}>
                  <input type="radio" name="vendor" value={v.id} disabled={!v.match.selectable} checked={pick.vendorId === v.id} onChange={() => { setPick({ ...pick, vendorId: v.id, acceptFlags: false }); setPickErr({}); }} />
                  <span><b>{v.name}</b> <span className="note">{v.match.selectable ? MATCH_LABEL[v.match.result][1] : 'Verification pending: cannot be selected yet'}</span></span>
                </label>))}
              {!st.shortlist.filter(v => v.id !== cur?.vendorId).length ? <p className="note" style={{ margin: 0 }}>Add vendors to the shortlist first.</p> : null}
              {pickErr.vendorId ? <span className="form-err">{pickErr.vendorId}</span> : null}
            </fieldset>
            {cand?.match.flags.length ? (
              <div className="rq-flag warning vs-accept"><Icon n="alert" s={16} /><div>
                <b>{cand.name} does not fully match your requirement:</b>
                <ul>{cand.match.checks.filter(x => cand.match.flags.includes(x.id)).map(x => <li key={x.id}>{CHECK_SHORT[x.id]}: {x.detail}</li>)}</ul>
                <label className="vs-check"><input type="checkbox" checked={pick.acceptFlags} onChange={e => { setPick({ ...pick, acceptFlags: e.target.checked }); setPickErr(x => ({ ...x, acceptFlags: undefined })); }} data-act="accept-flags" /> I accept these issues for this selection.</label>
                {pickErr.acceptFlags ? <span className="form-err">{pickErr.acceptFlags}</span> : null}
              </div></div>) : null}
            <div className="field"><label htmlFor="vs-rationale">Reason for the decision</label>
              <textarea id="vs-rationale" rows={3} maxLength={2000} value={pick.rationale} aria-invalid={!!pickErr.rationale} placeholder="For example: best match on service and delivery countries; verified; strongest references." onChange={e => { setPick({ ...pick, rationale: e.target.value }); setPickErr(x => ({ ...x, rationale: undefined })); }} />
              {pickErr.rationale ? <span className="form-err">{pickErr.rationale}</span> : <span className="note">At least 20 characters. Shown to auditors in the evidence record.</span>}</div>
            {cur ? <div className="field"><label htmlFor="vs-change">Why is the vendor changing?</label><input type="text" id="vs-change" maxLength={500} value={pick.changeReason} aria-invalid={!!pickErr.changeReason} onChange={e => { setPick({ ...pick, changeReason: e.target.value }); setPickErr(x => ({ ...x, changeReason: undefined })); }} />{pickErr.changeReason ? <span className="form-err">{pickErr.changeReason}</span> : null}</div> : null}
            <div><button className="btn primary" type="submit" disabled={busy === 'confirm' || !!st.blocked} data-act="confirm-vendor">{busy === 'confirm' ? 'Saving…' : cur ? 'Save new selection' : 'Confirm vendor'}</button></div>
          </form>
        </section>) : null}
    </div>
  );
}
