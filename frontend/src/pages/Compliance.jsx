import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime, fmtDate } from '../lib/format.js';
import { serviceLabel } from '../lib/assessments.js';
import { RATING_TONE, STATUS, GAP_KIND, answerTone, buyerEvidenceUrl } from '../lib/compliance.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';

const BackArrow = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;

/* Stage 3 landing: assessments of the organisation and where each one is in the compliance assessment. */
export function ComplianceList() {
  const navigate = useNavigate();
  const [list, setList] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api('/assessments').then(r => setList(r.assessments)).catch(x => setErr(x.message)); }, []);
  return (
    <>
      <PageHead eyebrow="Buyer · Stage 3 · Compliance assessment" title="Compliance assessment"
        lead="Send the selected vendor a questionnaire built from the controls that apply, collect its answers and evidence, and see a provisional score with the gaps." />
      <div className="card" data-section="compliance-list">
        {err ? <p className="form-err" style={{ padding: '0 22px' }}>{err}</p> : null}
        {!list ? <Loading pad /> : !list.length ? <p className="note pad">No assessments yet. Start with <Link className="link" to="/requirements">Stage 1 · Requirement</Link>.</p> : (
          <div className="tw"><table>
            <thead><tr><th>Assessment</th><th>Service</th><th>Vendor</th><th>Compliance</th><th></th></tr></thead>
            <tbody>{list.map(a => (
              <tr key={a.reference} className="click" onClick={() => navigate('/compliance/' + a.reference)}>
                <td><Link className="adm-ulink" to={'/compliance/' + a.reference} onClick={e => e.stopPropagation()}><b className="mono">{a.reference}</b></Link><div className="note">{a.title}</div></td>
                <td>{serviceLabel(a.serviceCode)}</td>
                <td>{a.selectedVendor || <span className="muted">Not selected yet</span>}</td>
                <td>{a.compliance ? <Badge s={STATUS[a.compliance.status][0]} label={a.compliance.status === 'submitted' ? `${a.compliance.overall}/100 · ${STATUS.submitted[1]}` : STATUS[a.compliance.status][1]} />
                  : <span className="muted">{a.selectedVendor ? 'Not started' : 'Select a vendor first'}</span>}</td>
                <td style={{ textAlign: 'right' }}><span className="link">Open <Icon n="arrow" s={13} /></span></td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
    </>
  );
}

/* Overall score as a ring (one value, single hue, the number in the middle). */
function ScoreRing({ score, rating }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="cp-ring" role="img" aria-label={`Provisional score ${score} out of 100, ${rating.label}`}>
      <svg viewBox="0 0 128 128"><circle cx="64" cy="64" r={r} fill="none" stroke="var(--line-2)" strokeWidth="12" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={`var(--${RATING_TONE[rating.code]})`} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 64 64)" /></svg>
      <div><b>{score}</b><span>/ 100</span></div>
    </div>
  );
}

/* Score by area: horizontal bars, labelled directly, one hue (the value is the number, the bar only helps compare). */
function AreaBars({ areas }) {
  return (
    <ul className="cp-bars" data-section="area-scores">{areas.map(a => (
      <li key={a.id} title={`${a.label}: ${a.score}/100 (${a.controls.join(', ')})`}>
        <span className="cp-bar-l">{a.label}</span>
        <span className="cp-bar-t"><i style={{ width: Math.max(a.score, 2) + '%' }} className={a.score < 60 ? 'low' : ''} /></span>
        <b className="mono">{a.score}</b>
      </li>))}</ul>
  );
}

const findQ = (questionnaire, id) => { for (const c of questionnaire) { const q = c.questions.find(x => x.id === id); if (q) return q; } return null; };

/* Stage 3 for one assessment (steps 10, 12 and 16 for the buyer). */
export default function Compliance() {
  const { ref } = useParams();
  const [st, setSt] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [open, setOpen] = useState({});
  const load = useCallback(() => api(`/assessments/${ref}/compliance`).then(setSt).catch(x => setErr(x.message)), [ref]);
  useEffect(() => { load(); }, [load]);
  const start = async () => { setBusy(true); setErr(''); try { setSt(await api(`/assessments/${ref}/compliance`, { method: 'POST' })); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  if (err && !st) return <p className="form-err">{err}</p>;
  if (!st) return <Loading />;
  const c = st.compliance, r = st.result;
  const steps = [[10, 'Start'], [11, 'Questionnaire'], [12, 'Request sent'], [13, 'Vendor answers'], [14, 'Score'], [15, 'Saved'], [16, 'Results']];
  const doneTo = !c ? 9 : c.status === 'submitted' ? 16 : 12;
  return (
    <div className="vs">
      <Link className="link" to="/compliance" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><BackArrow /> Compliance assessment</Link>
      <PageHead eyebrow={`Buyer · Stage 3 · Compliance assessment · ${st.assessment.reference}`} title={st.assessment.title}
        lead={st.vendor ? `Vendor: ${st.vendor.name}` : 'No vendor selected yet.'} right={<ReferenceTag value={st.assessment.reference} />} />
      <ol className="vs-steps" aria-label="Stage 3 steps">{steps.map(([n, t]) => <li key={n} className={n <= doneTo ? 'done' : ''}><span className="journey-n">{n}</span>{t}</li>)}</ol>
      {err ? <div className="rq-msg err" role="alert"><b>{err}</b></div> : null}

      {!c ? (
        <section className="card pad stack" data-section="compliance-start">
          <h2>Start the compliance assessment</h2>
          {st.blocked ? <div className="rq-flag warning"><Icon n="alert" s={16} /><span>{st.blocked} {!st.vendor ? <Link className="link" to={'/vendor-selection/' + ref}>Open vendor selection</Link> : null}</span></div> : <>
            <p style={{ margin: 0 }}>OffshoreAssure will build a questionnaire from the <b>{st.controls} assurance controls</b> that apply to this requirement and send it to <b>{st.vendor.name}</b>. The vendor answers each question and uploads evidence such as certificates and policies. You will see a provisional score and the gaps as soon as it is submitted.</p>
            <ul className="cp-facts"><li><Icon n="clock" s={15} />The vendor has 14 days to reply</li><li><Icon n="shield" s={15} />Documents are encrypted</li><li><Icon n="alert" s={15} />After starting, the vendor can no longer be changed</li></ul>
            <div><button className="btn primary" onClick={start} disabled={busy} data-act="start-compliance">{busy ? 'Starting…' : 'Start compliance assessment'}</button></div>
          </>}
        </section>
      ) : c.status !== 'submitted' ? (
        <section className="card pad stack" data-section="compliance-waiting">
          <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Waiting for {st.vendor.name}</h2><Badge s={STATUS[c.status][0]} label={STATUS[c.status][1]} /></div>
          <p className="note" style={{ margin: 0 }}>Questionnaire sent {fmtTime(c.startedAt)} · due {fmtDate(c.dueOn)} · {c.questionnaire.length} controls · rule pack {c.rulePackVersion}</p>
          <div className="cp-progress"><span style={{ width: `${Math.round(c.progress.answered / c.progress.total * 100)}%` }} /></div>
          <p style={{ margin: 0 }}><b>{c.progress.answered} of {c.progress.total}</b> questions answered · <b>{c.progress.evidence}</b> document{c.progress.evidence === 1 ? '' : 's'} uploaded</p>
          <details className="cp-qpreview"><summary>See the questionnaire ({c.progress.total} questions)</summary>
            {c.questionnaire.map(ct => <div key={ct.id} className="cp-qc"><b><span className="rid">{ct.id}</span> {ct.name}</b><ul>{ct.questions.map(q => <li key={q.id}>{q.text}{q.evidence ? <span className="note"> · evidence: {st.evidenceTypes[q.evidence].split(' (')[0].toLowerCase()}</span> : null}</li>)}</ul></div>)}
          </details>
        </section>
      ) : (
        <>
          <section className="card cp-result" data-section="compliance-result">
            <div className="asr-head">
              <div><div className="eyebrow">Steps 14–16 · Provisional score · result v{r.version}</div>
                <h2 className="prf-title" style={{ margin: '4px 0' }}>{st.vendor.name}</h2>
                <div className="note">Submitted {fmtTime(c.submittedAt)} · fingerprint <span className="mono">{r.snapshotSha256.slice(0, 16)}…</span> · rule pack {r.rulePackVersion}</div></div>
              <Badge s={r.overall >= 60 ? 'Approved' : r.overall >= 40 ? 'Attention' : 'Restricted'} label={r.rating.label} />
            </div>
            <div className="cp-top">
              <ScoreRing score={r.overall} rating={r.rating} />
              <div className="cp-top-r"><h3>Score by area</h3><AreaBars areas={r.areas} /></div>
            </div>
            {r.observations.length ? <div className="asr-block"><h3>Observations</h3><ul>{r.observations.map((o, i) => <li key={i}>{o.text}</li>)}</ul></div> : null}
            <p className="ir-foot note"><Icon n="shield" s={14} /> {r.note}</p>
          </section>

          <section className="card" data-section="compliance-gaps">
            <div className="ch"><div><h2>Missing items and gaps</h2><div className="sub">What needs attention. These become actions in Stage 8 (Remediation).</div></div><span className="note">{r.gaps.length}</span></div>
            {!r.gaps.length ? <p className="note pad">No gaps found.</p> : (
              <ul className="cp-gaps">{r.gaps.map((g, i) => <li key={i}><span className={'b ' + GAP_KIND[g.kind][0]}>{GAP_KIND[g.kind][1]}</span><span>{g.text}</span></li>)}</ul>)}
          </section>

          <section className="card" data-section="compliance-controls">
            <div className="ch"><div><h2>Answers by control</h2><div className="sub">Open a control to see each question, the answer, the vendor’s comment and the evidence.</div></div></div>
            <div className="cp-controls">{r.controls.map(ct => {
              const q = c.questionnaire.find(x => x.id === ct.id); const docs = c.evidence.filter(e => e.controlId === ct.id);
              return (
                <div key={ct.id} className={'cp-ctl' + (open[ct.id] ? ' open' : '')}>
                  <button className="cp-ctl-h" onClick={() => setOpen(o => ({ ...o, [ct.id]: !o[ct.id] }))} aria-expanded={!!open[ct.id]}>
                    <span className="rid">{ct.id}</span><b>{ct.name}</b><span className="cp-mini"><i style={{ width: ct.score + '%' }} className={ct.score < 60 ? 'low' : ''} /></span><b className="mono">{ct.score}</b><span className="note">{docs.length} doc{docs.length === 1 ? '' : 's'}</span>
                  </button>
                  {open[ct.id] ? <div className="cp-ctl-b">
                    {ct.questions.map(x => { const qq = findQ(c.questionnaire, x.id); const a = c.answers[x.id];
                      return <div key={x.id} className="cp-qa"><span>{qq?.text}</span><span className={'b ' + answerTone(x.answer)}>{x.answer}</span>{x.note ? <span className="b b-amber">{x.note}</span> : null}{a?.comment ? <span className="note cp-comment">“{a.comment}”</span> : null}</div>; })}
                    {docs.length ? <ul className="prf-docs">{docs.map(d => <li key={d.id}><Icon n="doc" s={15} /><a className="link" href={buyerEvidenceUrl(ref, d.id)}>{d.fileName}</a><span className="note">{st.evidenceTypes[d.type].split(' (')[0]}{d.expiresOn ? ` · expires ${fmtDate(d.expiresOn)}` : ''}</span></li>)}</ul> : <p className="note" style={{ margin: 0 }}>No documents for this control.</p>}
                    {q?.reason ? <p className="note" style={{ margin: 0 }}>Why it applies: {q.reason}</p> : null}
                  </div> : null}
                </div>);
            })}</div>
          </section>
          <div className="card rq-next"><Icon n="clock" s={20} /><div><b>Stage 3 is complete for this assessment. Next: Stage 4 — Contract analysis.</b> <span className="note">Upload the contract so its clauses can be checked.</span></div><Link className="btn primary" to={'/contract/' + ref} data-act="go-contract">Open contract analysis</Link></div>
        </>
      )}
    </div>
  );
}
