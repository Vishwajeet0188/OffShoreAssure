import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import Loading from '../../components/extras/Loading.jsx';

/* Vendor portal · Track record: the company's history across its buyers (Stage 9, step 43). */
export default function TrackRecord() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/vendor/track-record').then(setData).catch(err => setError(err.message)); }, []);

  if (error && !data) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;
  const t = data.totals;

  return (
    <div className="vs">
      <PageHead eyebrow="Vendor · Track record" title="Track record"
        lead="Your delivery and assurance history across the buyers that selected your company. Keep it strong by answering renewals and actions on time." />

      {t && t.assessments ? (
        <section className="card" data-section="track-totals">
          <div className="ca-figures">
            <div><b>{t.assessments}</b><span>Assessments</span></div>
            <div><b>{t.averageScore ?? '—'}</b><span>Average compliance score</span></div>
            <div><b>{t.closedOnTime} / {t.actionsClosed}</b><span>Actions closed on time</span></div>
            <div className={t.actionsOpen ? 'warn' : ''}><b>{t.actionsOpen}</b><span>Actions still open</span></div>
          </div>
          <p className="note pad" style={{ margin: 0 }}>{data.note}</p>
        </section>
      ) : null}

      {data.expiring.length ? (
        <section className="card" data-section="track-expiring">
          <div className="ch"><div><h2>Renewals coming up</h2><div className="sub">Certificates and insurance that expire within 90 days. Buyers may ask you for the renewed document.</div></div></div>
          <ul className="mn-items">{data.expiring.map((e, i) => (
            <li key={i} className="mn-item"><span className="mn-dot" />
              <div><b>{e.fileName}</b><div className="note">{e.type === 'insurance' ? 'Insurance' : 'Certificate'} · {e.reference}</div></div>
              <span className={'b ' + (e.expiresOn < new Date().toISOString().slice(0, 10) ? 'b-coral' : 'b-amber')}>Expires {e.expiresOn}</span>
            </li>))}</ul>
        </section>
      ) : null}

      <section className="card" data-section="track-list">
        {data.assessments.length === 0 ? (
          <p className="note pad">No history yet. It builds up as buyers select your company and you complete their assessments.</p>
        ) : (
          <div className="tw"><table>
            <thead><tr><th>Assessment</th><th>Buyer</th><th>Compliance score</th><th>Actions</th><th>Reports</th></tr></thead>
            <tbody>{data.assessments.map(a => (
              <tr key={a.reference} data-ref={a.reference}>
                <td><b className="mono">{a.reference}</b><div className="note">{a.title}</div></td>
                <td>{a.buyerName}</td>
                <td>{a.compliance ? <><b>{a.compliance.score}</b>/100<div className="note">{a.compliance.rating}</div></> : <span className="muted">Not scored yet</span>}</td>
                <td>{a.actions.assigned ? <>{a.actions.closed} closed of {a.actions.assigned}<div className="note">{a.actions.onTime} on time{a.actions.open ? ` · ${a.actions.open} open` : ''}</div></> : <span className="muted">None</span>}
                  {a.actions.open ? <div><Link className="link note" to={'/vendor/actions/' + a.reference}>Open actions</Link></div> : null}</td>
                <td>{a.reports.count ? <>{a.reports.count} issued<div className="note">Last {fmtTime(a.reports.last)}</div></> : <span className="muted">None yet</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
