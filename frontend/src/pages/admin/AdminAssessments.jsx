import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { CLASS_LABEL, TIER_LABEL, TIER_TONE, serviceLabel } from '../../lib/assessments.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import { BackArrow } from '../../components/common/Icon.jsx';
import AssessmentResult from '../../components/requirements/AssessmentResult.jsx';
import ProfilePanel from '../../components/requirements/ProfilePanel.jsx';
import { MATCH_LABEL, CHECK_SHORT } from '../../lib/selection.js';
import InformationRequired from '../../components/requirements/InformationRequired.jsx';

/* Admin · Assessments across every buyer organisation (Stage 1 · Step 2 onwards). */
export default function AdminAssessments() {
  const navigate = useNavigate();
  const [q, setQ] = useState(''); const [search, setSearch] = useState('');
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { api('/admin/assessments' + (search ? '?search=' + encodeURIComponent(search) : '')).then(setD).catch(x => setErr(x.message)); }, [search]);
  return (
    <>
      <PageHead eyebrow="Admin console · Buyers" title="Assessments" lead="Every assessment created from a buyer's submitted requirement, with the engine's validation result and preliminary risk tier." />
      {d ? <div className="adm-tiles adm-tiles-4">
        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(t => <div key={t} className="adm-tile"><span className="adm-tile-l">{TIER_LABEL[t]} risk</span><span className="adm-tile-n">{d.byRiskTier[t] || 0}</span></div>)}
      </div> : null}
      <div className="card">
        <div className="ch"><input type="search" aria-label="Search assessments" placeholder="Search ID, title or buyer" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 340 }} />
          <span className="note">{d ? `${d.assessments.length} assessment${d.assessments.length === 1 ? '' : 's'}` : ''}</span></div>
        {err ? <p className="form-err" style={{ padding: '0 20px' }}>{err}</p> : null}
        <div className="tw"><table>
          <thead><tr><th>Assessment ID</th><th>Title</th><th>Buyer</th><th>Service</th><th>Classification</th><th>Risk tier</th><th>Vendor</th><th>Created</th></tr></thead>
          <tbody>{!d ? <tr><td colSpan="8" className="note">Loading…</td></tr> : d.assessments.length === 0 ? <tr><td colSpan="8" className="note">No assessments yet. They appear when a buyer submits a requirement.</td></tr>
            : d.assessments.map(a => (
              <tr key={a.id} className="click" onClick={() => navigate('/admin/assessments/' + a.reference)}>
                <td className="mono"><Link className="adm-ulink" to={'/admin/assessments/' + a.reference} onClick={e => e.stopPropagation()}><b>{a.reference}</b></Link></td>
                <td>{a.title}</td><td>{a.buyerName}</td><td>{serviceLabel(a.serviceCode)}</td><td>{CLASS_LABEL[a.dataClassification]}</td>
                <td><span className={'b b-' + TIER_TONE[a.riskTier]}>{TIER_LABEL[a.riskTier]}</span></td>
                <td>{a.selectedVendor ? <b>{a.selectedVendor}</b> : <span className="muted">Not selected</span>}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.createdAt)}</td>
              </tr>))}</tbody>
        </table></div>
      </div>
    </>
  );
}

export function AdminAssessmentDetail() {
  const { ref } = useParams();
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api('/admin/assessments/' + encodeURIComponent(ref)).then(setD).catch(x => setErr(x.message)); }, [ref]);
  const back = <Link className="link" to="/admin/assessments" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><BackArrow s={14} /> Assessments</Link>;
  if (err) return <>{back}<p className="form-err">{err}</p></>;
  if (!d) return <p className="note">Loading…</p>;
  const a = d.assessment;
  return (
    <>
      {back}
      <PageHead eyebrow={'Admin console · ' + a.buyerName} title={a.title} lead={`Submitted by ${a.createdByEmail}`} />
      {d.summary ? <InformationRequired s={d.summary} link={false} /> : null}
      {d.selection ? <SelectionPanel s={d.selection} /> : null}
      {d.compliance?.compliance ? <CompliancePanel s={d.compliance} /> : null}
      <AssessmentResult a={a} buyerName={a.buyerName} />
      {d.profiles ? <ProfilePanel profiles={d.profiles} timeline={d.timeline} catalogue={d.controlCatalogue} /> : null}
    </>
  );
}

/* Stage 2 for the admin: shortlist and the saved selection (read-only). */
function SelectionPanel({ s }) {
  const cur = s.current;
  return (
    <section className="card" data-section="admin-selection">
      <div className="ch"><div><h2>Stage 2 · Vendor selection</h2><div className="sub">{cur ? `Selection v${cur.version} saved ${fmtTime(cur.selectedAt)} by ${cur.selectedByEmail}` : 'No vendor selected yet'}</div></div>
        {cur ? <Badge s="Complete" label={'Selected: ' + cur.vendor.name} /> : <Badge s="Pending" label={`${s.shortlist.length} on shortlist`} />}</div>
      {cur ? <div className="asr-block"><h3>Reason</h3><p style={{ margin: 0 }}>{cur.rationale}</p>{cur.acceptedFlags.length ? <p className="note">Accepted issues: {cur.acceptedFlags.map(f => CHECK_SHORT[f] || f).join(', ')}</p> : null}{cur.changeReason ? <p className="note">Change reason: {cur.changeReason}</p> : null}</div> : null}
      {s.shortlist.length ? <div className="tw"><table><thead><tr><th>Shortlisted vendor</th><th>Match</th><th>Added</th></tr></thead>
        <tbody>{s.shortlist.map(v => <tr key={v.id}><td><Link className="adm-ulink" to={'/admin/vendors/' + v.id}><b>{v.name}</b></Link>{cur?.vendorId === v.id ? <span className="b b-plum" style={{ marginLeft: 8 }}>Selected</span> : null}</td>
          <td><Badge s={MATCH_LABEL[v.match.result][0]} label={MATCH_LABEL[v.match.result][1]} /></td><td className="mono">{fmtTime(v.addedAt)} · {v.addedByEmail}</td></tr>)}</tbody></table></div> : null}
      {s.versions.length > 1 ? <div className="asr-block"><h3>Earlier selections</h3><ul>{s.versions.slice(0, -1).map(v => <li key={v.id}>v{v.version} · {v.vendor.name} · {fmtTime(v.selectedAt)}</li>)}</ul></div> : null}
    </section>
  );
}

/* Stage 3 for the admin: status, provisional score and gaps (read-only). */
function CompliancePanel({ s }) {
  const c = s.compliance, r = s.result;
  return (
    <section className="card" data-section="admin-compliance">
      <div className="ch"><div><h2>Stage 3 · Compliance assessment</h2><div className="sub">{s.vendor?.name} · started {fmtTime(c.startedAt)} · {c.progress.answered}/{c.progress.total} answered · {c.progress.evidence} documents</div></div>
        {r ? <Badge s={r.overall >= 60 ? 'Approved' : r.overall >= 40 ? 'Attention' : 'Restricted'} label={`${r.overall}/100 · ${r.rating.label}`} /> : <Badge s="Pending" label="Waiting for the vendor" />}</div>
      {r ? <>
        <div className="asr-block"><h3>Score by area</h3><ul className="cp-bars">{r.areas.map(a => <li key={a.id}><span className="cp-bar-l">{a.label}</span><span className="cp-bar-t"><i style={{ width: Math.max(a.score, 2) + '%' }} className={a.score < 60 ? 'low' : ''} /></span><b className="mono">{a.score}</b></li>)}</ul></div>
        <div className="asr-block"><h3>Gaps ({r.gaps.length})</h3>{r.gaps.length ? <ul>{r.gaps.map((g, i) => <li key={i}>{g.text}</li>)}</ul> : <p className="note" style={{ margin: 0 }}>None.</p>}</div>
      </> : null}
    </section>
  );
}
