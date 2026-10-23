import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Badge } from '../../components/common/Badges.jsx';
import Loading from '../../components/extras/Loading.jsx';

const KIND = { feedback: 'Feedback', question: 'Question', problem: 'Problem', idea: 'Idea' };

/* Admin · messages sent from the website's feedback form. */
export default function AdminFeedback() {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(() => api('/admin/feedback').then(setD).catch(x => setErr(x.message)), []);
  useEffect(() => { load(); }, [load]);
  const mark = async (f, body) => { setErr(''); try { await api('/admin/feedback/' + f.id, { method: 'PATCH', body: typeof body === 'string' ? { status: body } : body }); load(); } catch (x) { setErr(x.message); } };
  if (err && !d) return <p className="form-err">{err}</p>;
  if (!d) return <Loading />;
  return (
    <>
      <PageHead eyebrow="Admin console · Platform" title="Website feedback" lead="Messages sent from the feedback form on the website's home page. A message can be published as a review on the home page only if the sender agreed." right={<div className="row"><Badge s={d.unread ? 'Pending' : 'Complete'} label={`${d.unread} unread`} /><Badge s="Info" label={`${d.published} on the website`} /></div>} />
      {err ? <p className="form-err" role="alert">{err}</p> : null}
      <div className="card" data-section="feedback-list">
        {!d.feedback.length ? <p className="note pad">No feedback yet.</p> : (
          <div className="tw"><table>
            <thead><tr><th>Received</th><th>Type</th><th>Rating</th><th>Message</th><th>From</th><th>Website</th><th></th></tr></thead>
            <tbody>{d.feedback.map(f => (
              <tr key={f.id} style={f.status === 'new' ? { fontWeight: 500 } : { opacity: .8 }}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtTime(f.createdAt)}</td>
                <td><span className={'b ' + (f.kind === 'problem' ? 'b-coral' : f.kind === 'question' ? 'b-amber' : 'b-plum')}>{KIND[f.kind]}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{f.rating ? '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) : <span className="muted">—</span>}</td>
                <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{f.message}</td>
                <td>{f.name || <span className="muted">Anonymous</span>}{f.email ? <div className="note">{f.email}</div> : null}{f.role ? <div className="note">Signed in as {f.role}</div> : null}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{f.published ? <><Badge s="Complete" label="Published" /><div><button className="btn sm" style={{ marginTop: 6 }} onClick={() => mark(f, { published: false })} data-act="unpublish">Remove</button></div></>
                  : f.publicConsent ? <button className="btn sm primary" onClick={() => mark(f, { published: true })} data-act="publish">Publish</button>
                  : <span className="note">Private (no permission)</span>}</td>
                <td>{f.status === 'new' ? <button className="btn sm" onClick={() => mark(f, 'read')} data-act="mark-read">Mark as read</button> : <button className="btn sm" onClick={() => mark(f, 'new')}>Mark unread</button>}</td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
    </>
  );
}
