import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import CopyButton from '../../components/extras/CopyButton.jsx';
import Loading from '../../components/extras/Loading.jsx';

const EMPTY = { name: '', email: '', phone: '', organisation: '', category: '', reference: '', subject: '', message: '', website: '' };
const STATUS_TONE = { OPEN: 'b-amber', IN_PROGRESS: 'b-plum', CLOSED: 'b-sage' };
const ROLE_WORD = { buyer: 'buyer', vendor: 'vendor', admin: 'OffshoreAssure admin' };

/*
 * Contact page: anyone can raise a support ticket and gets a ticket number.
 * Signed-in buyers and vendors see all their tickets below the form, with the
 * team's remarks; a visitor checks a ticket with its number and email.
 */
export default function Contact() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const [setup, setSetup] = useState(null);
  const [mine, setMine] = useState(null);
  const [created, setCreated] = useState(null);

  const loadMine = useCallback(() => {
    if (!auth.user) { setMine(null); return; }
    api('/support/tickets').then(r => setMine(r.tickets)).catch(() => setMine([]));
  }, [auth.user]);

  useEffect(() => { api('/support/tickets/form').then(setSetup).catch(() => setSetup({ categories: [], me: null })); }, [auth.user]);
  useEffect(() => { loadMine(); }, [loadMine]);

  return (
    <>
      <section className="lp-sec ct-sec" data-section="contact">
        <div className="lp-wrap">
          <div className="lp-sechead">
            <span className="eyebrow ct-eyebrow">Get in touch</span>
            <h1 className="lp-h2">How can we help?</h1>
            <p className="lp-sub">If you have a question, need help using OffshoreAssure, or want to report a problem, raise a ticket.
              You get a ticket number straight away, and our team replies here under your ticket.</p>
          </div>

          <div className="ct-grid">
            <aside className="ct-side">
              {setup?.contactEmail ? (
                <div className="card ct-info"><span className="lp-oi"><Icon n="mail" s={18} /></span>
                  <div><b>Email</b><a className="link" href={`mailto:${setup.contactEmail}`}>{setup.contactEmail}</a></div></div>
              ) : null}
              <div className="card ct-info"><span className="lp-oi"><Icon n="bell" s={18} /></span>
                <div><b>Need assistance?</b><span className="note">Send your query with the form. You will get a ticket number and an email when our team replies.</span></div></div>
              <div className="card ct-info"><span className="lp-oi"><Icon n="clock" s={18} /></span>
                <div><b>What happens next</b><span className="note">Open → In progress → Closed. Every reply from our team appears under your ticket on this page.</span></div></div>
              {!auth.user ? <LookupCard initialNumber={params.get('ticket') || ''} /> : null}
            </aside>

            {created ? (
              <TicketCreated ticket={created} signedIn={!!auth.user} onAnother={() => setCreated(null)} />
            ) : !setup ? <div className="card"><Loading pad /></div> : (
              <TicketForm setup={setup} onCreated={t => { setCreated(t); loadMine(); }} />
            )}
          </div>

          {auth.user ? <MyTickets tickets={mine} highlight={params.get('ticket') || created?.number} /> : null}
        </div>
      </section>
    </>
  );
}

function TicketForm({ setup, onCreated }) {
  const me = setup.me;
  const [form, setForm] = useState(() => ({ ...EMPTY, name: me?.name || '', email: me?.email || '', organisation: me?.organisation || '' }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setErrors(e => ({ ...e, [key]: undefined })); };

  async function submit(event) {
    event.preventDefault();
    setError('');
    const local = {};
    if (form.name.trim().length < 2) local.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) local.email = 'Enter a valid email address.';
    if (!form.category) local.category = 'Choose what your query is about.';
    if (form.subject.trim().length < 4) local.subject = 'Enter a subject (at least 4 characters).';
    if (form.message.trim().length < 10) local.message = 'Tell us a little more (at least 10 characters).';
    if (Object.keys(local).length) { setErrors(local); return; }
    setBusy(true);
    try {
      const { ticket } = await api('/support/tickets', { method: 'POST', body: form });
      onCreated(ticket);
    } catch (err) {
      if (Object.keys(err.fields || {}).length) setErrors(err.fields);
      setError(err.message);
    } finally { setBusy(false); }
  }

  const field = (key, label, input, { optional = false, full = false } = {}) => (
    <div className={'field' + (full ? ' full' : '')}>
      <label htmlFor={'ct-' + key}>{label} {optional ? <span className="note">(optional)</span> : <span className="ct-req" aria-hidden="true">*</span>}</label>
      {input}
      {errors[key] ? <span className="form-err" id={'ct-' + key + '-err'}>{errors[key]}</span> : null}
    </div>
  );
  const attrs = key => ({ id: 'ct-' + key, value: form[key], onChange: e => set(key, e.target.value), 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? 'ct-' + key + '-err' : undefined });

  return (
    <form className="card ct-form" onSubmit={submit} noValidate data-form="ticket">
      <div className="ct-form-head full">
        <h2>Raise a ticket</h2>
        <p className="note">{me ? `Signed in as ${me.email} (${ROLE_WORD[me.role] || me.role}). Replies go to this account.` : 'Please give as much detail as you can.'}</p>
      </div>
      {field('name', 'Your name', <input type="text" maxLength={120} autoComplete="name" {...attrs('name')} />)}
      {field('email', 'Email address', <input type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" readOnly={!!me} {...attrs('email')} />)}
      {field('phone', 'Phone number', <input type="tel" maxLength={30} autoComplete="tel" placeholder="07123 456789" {...attrs('phone')} />, { optional: true })}
      {field('organisation', 'Organisation', <input type="text" maxLength={160} autoComplete="organization" {...attrs('organisation')} />, { optional: true })}
      {field('category', 'What is it about?', (
        <select {...attrs('category')}>
          <option value="">Choose…</option>
          {setup.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ))}
      {field('reference', 'Assessment ID', <input type="text" maxLength={40} placeholder="e.g. OA-UK-2026-000001" {...attrs('reference')} />, { optional: true })}
      {field('subject', 'Subject', <input type="text" maxLength={150} placeholder="What can we help you with?" {...attrs('subject')} />, { full: true })}
      {field('message', 'Message', <textarea rows={6} maxLength={4000} placeholder="Tell us how we can help…" {...attrs('message')} />, { full: true })}
      <input className="lp-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={e => set('website', e.target.value)} />
      {error ? <div className="rq-msg err full" role="alert"><b>{error}</b></div> : null}
      <div className="full ct-actions">
        <button className="btn primary" type="submit" disabled={busy} data-act="send-ticket"><Icon n="send" s={16} />{busy ? 'Sending…' : 'Send message'}</button>
      </div>
    </form>
  );
}

function TicketCreated({ ticket, signedIn, onAnother }) {
  return (
    <div className="card ct-done" role="status" data-section="ticket-created">
      <span className="lp-oi"><Icon n="check" s={22} /></span>
      <div className="stack">
        <h2 style={{ margin: 0 }}>Thank you. Your ticket has been raised.</h2>
        <div className="ct-number"><span className="note">Your ticket number</span><b className="mono" data-ticket-number>{ticket.number}</b><CopyButton value={ticket.number} label="Copy ticket number" /></div>
        <p className="note" style={{ margin: 0 }}>
          We have emailed you a copy. {signedIn ? 'You can follow it below, under “Your tickets”.' : 'Keep the number: with your email it lets you check the ticket on this page.'}
        </p>
        <div><button className="btn sm" onClick={onAnother} data-act="another-ticket">Raise another ticket</button></div>
      </div>
    </div>
  );
}

/* Visitors (not signed in) check a ticket with its number and the email they used. */
function LookupCard({ initialNumber }) {
  const [number, setNumber] = useState(initialNumber);
  const [email, setEmail] = useState('');
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function lookup(event) {
    event.preventDefault();
    setBusy(true); setError(''); setTicket(null);
    try { setTicket((await api('/support/tickets/lookup', { method: 'POST', body: { number, email } })).ticket); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="card ct-lookup" data-section="ticket-lookup">
      <form onSubmit={lookup} className="stack">
        <b>Check a ticket</b>
        <input type="text" value={number} onChange={e => setNumber(e.target.value)} placeholder="Ticket number, e.g. OA-TKT-2026-000001" aria-label="Ticket number" />
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="The email you used" aria-label="Email used for the ticket" />
        {error ? <span className="form-err">{error}</span> : null}
        <div><button className="btn sm" type="submit" disabled={busy} data-act="lookup-ticket">{busy ? 'Checking…' : 'Check'}</button></div>
      </form>
      {ticket ? <TicketCard ticket={ticket} open /> : null}
    </div>
  );
}

function MyTickets({ tickets, highlight }) {
  return (
    <section className="ct-mine" data-section="my-tickets">
      <h2 className="lp-h3">Your tickets</h2>
      {!tickets ? <Loading pad /> : tickets.length === 0 ? (
        <p className="note">You have not raised a ticket yet.</p>
      ) : (
        <div className="ct-list">{tickets.map(t => <TicketCard key={t.number} ticket={t} open={t.number === highlight} />)}</div>
      )}
    </section>
  );
}

/* One ticket: what was asked, and every remark and status change from our team. */
function TicketCard({ ticket, open: initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  const remarks = ticket.history.filter(h => h.remark).length;
  return (
    <article className={'card ct-ticket' + (open ? ' open' : '')} data-ticket={ticket.number} data-status={ticket.status}>
      <button className="ct-ticket-h" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="mono ct-num">{ticket.number}</span>
        <b>{ticket.subject}</b>
        <span className="note">{fmtTime(ticket.createdAt)}{remarks ? ` · ${remarks} repl${remarks === 1 ? 'y' : 'ies'}` : ''}</span>
        <span className={'b ' + STATUS_TONE[ticket.status]}>{ticket.statusLabel}</span>
      </button>
      {open ? (
        <div className="ct-ticket-b">
          <p className="note" style={{ margin: 0 }}>{ticket.category}{ticket.reference ? ` · ${ticket.reference}` : ''}</p>
          <p className="ct-msg">{ticket.message}</p>
          <h3>Replies from OffshoreAssure</h3>
          {ticket.history.length === 0 ? <p className="note" style={{ margin: 0 }}>No reply yet. We will email you when there is one.</p> : (
            <ul className="ct-history">{ticket.history.map((h, i) => (
              <li key={i}>
                <span className="mono note">{fmtTime(h.at)}</span>
                {h.remark ? <p className="ct-remark" data-remark>{h.remark}</p> : null}
                {h.toStatus ? <span className="note">Status changed to <b>{h.toStatus === 'IN_PROGRESS' ? 'In progress' : h.toStatus === 'CLOSED' ? 'Closed' : 'Open'}</b></span> : null}
              </li>))}</ul>
          )}
          {ticket.status === 'CLOSED' ? <p className="note" style={{ margin: 0 }}>This ticket is closed. If you still need help, raise a new ticket and mention {ticket.number}.</p> : null}
        </div>
      ) : null}
    </article>
  );
}

