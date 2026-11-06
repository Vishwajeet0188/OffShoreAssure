import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { BackArrow } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';

export const TICKET_TONE = { OPEN: 'b-amber', IN_PROGRESS: 'b-plum', CLOSED: 'b-sage' };
const ROLE_WORD = { buyer: 'Buyer', vendor: 'Vendor', admin: 'Admin', visitor: 'Visitor' };
const TABS = [
  ['OPEN', 'Open'],
  ['IN_PROGRESS', 'In progress'],
  ['CLOSED', 'Closed'],
  ['', 'All'],
];

/* Admin · Support tickets raised from the Contact page. */
export default function AdminTickets() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    api('/admin/tickets?' + params)
      .then(setData)
      .catch(err => setError(err.message));
  }, [status, search]);

  return (
    <>
      <PageHead
        eyebrow="Admin console · Platform"
        title="Support tickets"
        lead="Queries from buyers, vendors and visitors, raised on the Contact page. Reply with a remark and change the status; the person sees it under their ticket and is emailed."
      />
      {error ? (
        <p className="form-err" role="alert">
          {error}
        </p>
      ) : null}
      <div className="card" data-section="admin-tickets">
        <div className="tk-bar">
          <div className="tk-tabs" role="tablist" aria-label="Status">
            {TABS.map(([value, label]) => (
              <button
                key={label}
                role="tab"
                aria-selected={status === value}
                className={'tk-tab' + (status === value ? ' on' : '')}
                onClick={() => setStatus(value)}
                data-tab={value || 'ALL'}
              >
                {label}
                {data && value ? <span className="tk-count">{data.counts[value]}</span> : null}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="tk-search"
            placeholder="Search number, subject, name or email"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search tickets"
          />
        </div>
        {!data ? (
          <Loading pad />
        ) : data.tickets.length === 0 ? (
          <p className="note pad">
            {search
              ? 'No tickets match.'
              : status
                ? `No ${TABS.find(t => t[0] === status)[1].toLowerCase()} tickets.`
                : 'No tickets yet.'}
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map(t => (
                  <tr
                    key={t.number}
                    className="click"
                    onClick={() => navigate('/admin/tickets/' + t.number)}
                    data-ticket={t.number}
                  >
                    <td>
                      <Link
                        className="adm-ulink mono"
                        to={'/admin/tickets/' + t.number}
                        onClick={e => e.stopPropagation()}
                      >
                        {t.number}
                      </Link>
                    </td>
                    <td>
                      <b>{t.subject}</b>
                      {t.reference ? <div className="note mono">{t.reference}</div> : null}
                    </td>
                    <td>
                      {t.name}
                      <div className="note">
                        {ROLE_WORD[t.role]} · {t.email}
                      </div>
                    </td>
                    <td>{t.category}</td>
                    <td>
                      <span className={'b ' + TICKET_TONE[t.status]}>{t.statusLabel}</span>
                      {t.remarks ? (
                        <div className="note">
                          {t.remarks} remark{t.remarks === 1 ? '' : 's'}
                        </div>
                      ) : null}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {fmtTime(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* One ticket: the query, the history, and the reply box. */
export function AdminTicketDetail() {
  const { number } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [remark, setRemark] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(
    () =>
      api('/admin/tickets/' + number)
        .then(d => {
          setData(d);
          setStatus(d.ticket.status);
        })
        .catch(err => setError(err.message)),
    [number],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const d = await api(`/admin/tickets/${number}/remarks`, { method: 'POST', body: { remark, status } });
      setData(d);
      setStatus(d.ticket.status);
      setRemark('');
      setMsg({
        tone: 'ok',
        text:
          d.ticket.status === 'CLOSED'
            ? 'Saved. The ticket is closed and the person has been emailed.'
            : 'Saved. The person can see it under their ticket and has been emailed.',
      });
    } catch (err) {
      setMsg({ tone: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;
  const t = data.ticket;

  return (
    <>
      <Link
        className="link"
        to="/admin/tickets"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        <BackArrow />
        Support tickets
      </Link>
      <PageHead
        eyebrow={'Admin console · Support ticket · ' + t.number}
        title={t.subject}
        right={
          <span className={'b ' + TICKET_TONE[t.status]} data-status={t.status}>
            {t.statusLabel}
          </span>
        }
      />
      <div className="tk-detail">
        <section className="card" data-section="ticket-query">
          <div className="ch">
            <div>
              <h2>The query</h2>
              <div className="sub">
                {t.category}
                {t.reference ? ` · ${t.reference}` : ''} · raised {fmtTime(t.createdAt)}
              </div>
            </div>
          </div>
          <p className="pad ct-msg" style={{ margin: 0 }}>
            {t.message}
          </p>
          <div className="asr-block">
            <h3>History</h3>
            {t.history.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>
                No remarks yet.
              </p>
            ) : (
              <ul className="ct-history">
                {t.history.map((h, i) => (
                  <li key={i}>
                    <span className="mono note">
                      {fmtTime(h.at)}
                      {h.by ? ` · ${h.by}` : ''}
                    </span>
                    {h.remark ? <p className="ct-remark">{h.remark}</p> : null}
                    {h.toStatus ? (
                      <span className="note">
                        Status: {data.statuses[h.fromStatus]?.label} →{' '}
                        <b>{data.statuses[h.toStatus].label}</b>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="asr-block tk-reply" onSubmit={save} data-form="ticket-remark">
            <h3>Reply</h3>
            <textarea
              rows={4}
              maxLength={4000}
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="Your remark. The person sees it under their ticket."
              aria-label="Remark"
            />
            <div className="row tk-reply-row">
              <label className="note">
                Status{' '}
                <select value={status} onChange={e => setStatus(e.target.value)} data-field="status">
                  {Object.entries(data.statuses).map(([value, s]) => (
                    <option key={value} value={value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn primary" type="submit" disabled={busy} data-act="save-remark">
                {busy ? 'Saving…' : status === 'CLOSED' && t.status !== 'CLOSED' ? 'Save and close' : 'Save'}
              </button>
            </div>
            {status === 'CLOSED' && t.status !== 'CLOSED' ? (
              <span className="note">Closing needs a remark that says how the query was resolved.</span>
            ) : null}
            {msg ? (
              <div className={'rq-msg ' + msg.tone} role="status">
                <b>{msg.text}</b>
              </div>
            ) : null}
          </form>
        </section>
        <aside className="card" data-section="ticket-person">
          <div className="ch">
            <div>
              <h2>From</h2>
            </div>
          </div>
          <dl className="tk-dl">
            <dt>Name</dt>
            <dd>{t.name}</dd>
            <dt>Email</dt>
            <dd>
              <a className="link" href={`mailto:${t.email}`}>
                {t.email}
              </a>
            </dd>
            {t.phone ? (
              <>
                <dt>Phone</dt>
                <dd>{t.phone}</dd>
              </>
            ) : null}
            {t.organisation ? (
              <>
                <dt>Organisation</dt>
                <dd>{t.organisation}</dd>
              </>
            ) : null}
            <dt>Who</dt>
            <dd>
              {ROLE_WORD[t.role]}
              {t.signedIn ? ' (signed in)' : ''}
            </dd>
            {t.reference ? (
              <>
                <dt>Assessment</dt>
                <dd>
                  <Link className="link mono" to={'/admin/assessments/' + t.reference}>
                    {t.reference}
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </aside>
      </div>
    </>
  );
}
