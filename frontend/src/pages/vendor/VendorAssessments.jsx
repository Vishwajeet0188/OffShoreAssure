import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';

/* Vendor portal · Assessments: buyers that invited this company, and assessments where it has been selected (Stage 2 output).
   The questionnaire and evidence request arrive with Stage 3 (steps 12–13). */
export default function VendorAssessments() {
  const auth = useAuth();
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [qs, setQs] = useState([]);
  useEffect(() => { api('/vendor/assessments').then(setD).catch(x => setErr(x.message)); api('/vendor/compliance').then(r => setQs(r.questionnaires)).catch(() => {}); }, []);
  const verified = auth.vendor?.verificationStatus === 'approved';
  if (err) return <p className="form-err">{err}</p>;
  if (!d) return <p className="note">Loading…</p>;
  return (
    <>
      <PageHead eyebrow="Vendor · Assessments" title="Assessments"
        lead="UK buyers that invited your company, and the assessments where you have been selected as the vendor." />
      {!verified ? <div className="rq-flag warning"><span>Your company is not verified yet. Buyers can invite and shortlist you, but they can only select you once the OffshoreAssure team has verified your company. <Link className="link" to="/vendor/profile">Company profile</Link></span></div> : null}
      {qs.length ? <div className="card" data-section="vendor-questionnaires">
        <div className="ch"><div><h2>Compliance questionnaires</h2><div className="sub">Stage 3 · answer the questions and upload evidence for the buyer</div></div><span className="note">{qs.length}</span></div>
        <div className="tw"><table><thead><tr><th>Assessment</th><th>Buyer</th><th>Progress</th><th>Due</th><th></th></tr></thead>
          <tbody>{qs.map(q => (
            <tr key={q.reference}><td><b className="mono">{q.reference}</b><div className="note">{q.title}</div></td><td>{q.buyerName}</td>
              <td style={{ minWidth: 160 }}><div className="cp-progress sm"><span style={{ width: `${Math.round(q.progress.answered / q.progress.total * 100)}%` }} /></div><span className="note">{q.progress.answered}/{q.progress.total} answered · {q.progress.evidence} docs</span></td>
              <td className="mono">{q.dueOn}</td>
              <td style={{ textAlign: 'right' }}>{q.status === 'submitted' ? <Link className="btn sm" to={'/vendor/assessments/' + q.reference}>View</Link> : <Link className="btn sm primary" to={'/vendor/assessments/' + q.reference} data-act="open-questionnaire">{q.status === 'requested' ? 'Start' : 'Continue'}</Link>}</td></tr>))}</tbody></table></div>
      </div> : null}
      <div className="card" data-section="vendor-selected">
        <div className="ch"><div><h2>Selected as vendor</h2><div className="sub">Stage 2 · the buyer confirmed your company for these assessments</div></div><span className="note">{d.selected.length}</span></div>
        {!d.selected.length ? <p className="note pad">No buyer has selected your company yet.</p> : (
          <div className="tw"><table><thead><tr><th>Assessment</th><th>Buyer</th><th>Service</th><th>Selected</th><th>Next</th></tr></thead>
            <tbody>{d.selected.map(s => (
              <tr key={s.reference}><td><b className="mono">{s.reference}</b><div className="note">{s.title}</div></td><td>{s.buyerName}<div className="note">{s.buyerSector}</div></td>
                <td>{s.serviceCategory}<div className="note">{s.criticality} criticality</div></td><td className="mono">{fmtTime(s.selectedAt)}</td>
                <td>{(() => { const q = qs.find(x => x.reference === s.reference); return q ? <Link className="link" to={'/vendor/assessments/' + s.reference}>{q.status === 'submitted' ? 'Questionnaire submitted' : 'Questionnaire to answer'}</Link>
                  : <><Badge s="Info" label="Stage 3 · Compliance assessment" /><div className="note">Waiting for the buyer to send the questionnaire</div></>; })()}</td></tr>))}</tbody></table></div>)}
      </div>
      <div className="card" data-section="vendor-invitations">
        <div className="ch"><div><h2>Invitations</h2><div className="sub">Buyers who invited your company to take part in their vendor selection</div></div><span className="note">{d.invitations.length}</span></div>
        {!d.invitations.length ? <p className="note pad">No invitations.</p> : (
          <div className="tw"><table><thead><tr><th>Assessment</th><th>Buyer</th><th>Service</th><th>Invited</th></tr></thead>
            <tbody>{d.invitations.map(i => (
              <tr key={i.id}><td><b className="mono">{i.reference}</b><div className="note">{i.title}</div>{i.message ? <div className="note">“{i.message}”</div> : null}</td><td>{i.buyerName}</td>
                <td>{i.serviceCategory}</td><td className="mono">{fmtTime(i.invitedAt)}</td></tr>))}</tbody></table></div>)}
      </div>
    </>
  );
}
