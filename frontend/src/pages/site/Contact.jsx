import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import CopyButton from '../../components/extras/CopyButton.jsx';
import Loading from '../../components/extras/Loading.jsx';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  organisation: '',
  category: '',
  reference: '',
  subject: '',
  message: '',
  website: '', // hidden from people; spam robots fill it in
};

const STATUS_TONE = {
  OPEN: 'b-amber',
  IN_PROGRESS: 'b-plum',
  CLOSED: 'b-sage',
};

const STATUS_WORD = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  CLOSED: 'Closed',
};

const ROLE_WORD = {
  buyer: 'buyer',
  vendor: 'vendor',
  admin: 'OffshoreAssure admin',
};

/*
 * Contact page.
 *
 * Anyone can raise a support ticket and gets a ticket number straight away.
 * Signed-in buyers and vendors see all their tickets under the form, with
 * every reply from the OffshoreAssure team. A visitor who is not signed in
 * checks a ticket with its number and the email they used.
 */
export default function Contact() {
  const auth = useAuth();
  const [params] = useSearchParams();

  const [setup, setSetup] = useState(null);
  const [myTickets, setMyTickets] = useState(null);
  const [created, setCreated] = useState(null);

  // The ticket number from an email link (/contact?ticket=OA-TKT-…).
  const linkedTicket = params.get('ticket') || '';

  const loadMyTickets = useCallback(() => {
    if (!auth.user) {
      setMyTickets(null);
      return;
    }

    api('/support/tickets')
      .then(result => setMyTickets(result.tickets))
      .catch(() => setMyTickets([]));
  }, [auth.user]);

  useEffect(() => {
    api('/support/tickets/form')
      .then(setSetup)
      .catch(() => setSetup({ categories: [], me: null }));
  }, [auth.user]);

  useEffect(() => {
    loadMyTickets();
  }, [loadMyTickets]);

  function handleCreated(ticket) {
    setCreated(ticket);
    loadMyTickets();
  }

  return (
    <section className="lp-sec ct-sec" data-section="contact">
      <div className="lp-wrap">
        <div className="lp-sechead">
          <span className="eyebrow ct-eyebrow">Get in touch</span>
          <h1 className="lp-h2">How can we help?</h1>
          <p className="lp-sub">
            If you have a question, need help using OffshoreAssure, or want to report a problem, raise a
            ticket. You get a ticket number straight away, and our team replies here under your ticket.
          </p>
        </div>

        <div className="ct-grid">
          <aside className="ct-side">
            {setup?.contactEmail ? (
              <InfoCard icon="mail" title="Email">
                <a className="link" href={`mailto:${setup.contactEmail}`}>
                  {setup.contactEmail}
                </a>
              </InfoCard>
            ) : null}

            <InfoCard icon="bell" title="Need assistance?">
              Send your query with the form. You will get a ticket number, and an email when our team replies.
            </InfoCard>

            <InfoCard icon="clock" title="What happens next">
              Open → In progress → Closed. Every reply from our team appears under your ticket on this page.
            </InfoCard>

            {!auth.user ? <LookupCard initialNumber={linkedTicket} /> : null}
          </aside>

          <div className="ct-main">
            {created ? (
              <TicketCreated ticket={created} signedIn={!!auth.user} onAnother={() => setCreated(null)} />
            ) : setup ? (
              <TicketForm setup={setup} onCreated={handleCreated} />
            ) : (
              <div className="card">
                <Loading pad />
              </div>
            )}
          </div>
        </div>

        {auth.user ? <MyTickets tickets={myTickets} highlight={linkedTicket || created?.number} /> : null}
      </div>
    </section>
  );
}

function InfoCard({ icon, title, children }) {
  return (
    <div className="card ct-info">
      <span className="lp-oi">
        <Icon n={icon} s={18} />
      </span>
      <div>
        <b>{title}</b>
        <span className="note">{children}</span>
      </div>
    </div>
  );
}

/* The ticket form. When signed in, the name, email and organisation come from the account. */
function TicketForm({ setup, onCreated }) {
  const me = setup.me;

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    name: me?.name || '',
    email: me?.email || '',
    organisation: me?.organisation || '',
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
  }

  // The same checks the server makes, so people see what is missing straight away.
  function checkForm() {
    const found = {};

    if (form.name.trim().length < 2) found.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) found.email = 'Enter a valid email address.';
    if (!form.category) found.category = 'Choose what your query is about.';
    if (form.subject.trim().length < 4) found.subject = 'Enter a subject (at least 4 characters).';
    if (form.message.trim().length < 10) found.message = 'Tell us a little more (at least 10 characters).';

    return found;
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    const found = checkForm();
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    setBusy(true);
    try {
      const { ticket } = await api('/support/tickets', { method: 'POST', body: form });
      onCreated(ticket);
    } catch (err) {
      if (Object.keys(err.fields || {}).length) setErrors(err.fields);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Props shared by every input: value, change handler and the error link for screen readers.
  const inputProps = key => ({
    id: 'ct-' + key,
    value: form[key],
    onChange: event => update(key, event.target.value),
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `ct-${key}-err` : undefined,
  });

  return (
    <form className="card ct-form" onSubmit={submit} noValidate data-form="ticket">
      <div className="ct-form-head full">
        <h2>Raise a ticket</h2>
        <p className="note">
          {me
            ? `Signed in as ${me.email} (${ROLE_WORD[me.role] || me.role}). Replies go to this account.`
            : 'Please give as much detail as you can.'}
        </p>
      </div>

      <Field id="name" label="Your name" error={errors.name}>
        <input type="text" maxLength={120} autoComplete="name" {...inputProps('name')} />
      </Field>

      <Field id="email" label="Email address" error={errors.email}>
        <input
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          readOnly={!!me}
          {...inputProps('email')}
        />
      </Field>

      <Field id="phone" label="Phone number" optional error={errors.phone}>
        <input
          type="tel"
          maxLength={30}
          autoComplete="tel"
          placeholder="07123 456789"
          {...inputProps('phone')}
        />
      </Field>

      <Field id="organisation" label="Organisation" optional error={errors.organisation}>
        <input type="text" maxLength={160} autoComplete="organization" {...inputProps('organisation')} />
      </Field>

      <Field id="category" label="What is it about?" error={errors.category}>
        <select {...inputProps('category')}>
          <option value="">Choose…</option>
          {setup.categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>

      <Field id="reference" label="Assessment ID" optional error={errors.reference}>
        <input type="text" maxLength={40} placeholder="e.g. OA-UK-2026-000001" {...inputProps('reference')} />
      </Field>

      <Field id="subject" label="Subject" full error={errors.subject}>
        <input
          type="text"
          maxLength={150}
          placeholder="What can we help you with?"
          {...inputProps('subject')}
        />
      </Field>

      <Field id="message" label="Message" full error={errors.message}>
        <textarea
          rows={6}
          maxLength={4000}
          placeholder="Tell us how we can help…"
          {...inputProps('message')}
        />
      </Field>

      <input
        className="lp-hp"
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={form.website}
        onChange={event => update('website', event.target.value)}
      />

      {error ? (
        <div className="rq-msg err full" role="alert">
          <b>{error}</b>
        </div>
      ) : null}

      <div className="full ct-actions">
        <button className="btn primary" type="submit" disabled={busy} data-act="send-ticket">
          <Icon n="send" s={16} />
          {busy ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, optional = false, full = false, error, children }) {
  return (
    <div className={'field' + (full ? ' full' : '')}>
      <label htmlFor={'ct-' + id}>
        {label}{' '}
        {optional ? (
          <span className="note">(optional)</span>
        ) : (
          <span className="ct-req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span className="form-err" id={`ct-${id}-err`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function TicketCreated({ ticket, signedIn, onAnother }) {
  return (
    <div className="card ct-done" role="status" data-section="ticket-created">
      <span className="lp-oi">
        <Icon n="check" s={22} />
      </span>

      <div className="stack">
        <h2 style={{ margin: 0 }}>Thank you. Your ticket has been raised.</h2>

        <div className="ct-number">
          <span className="note">Your ticket number</span>
          <b className="mono" data-ticket-number>
            {ticket.number}
          </b>
          <CopyButton value={ticket.number} label="Copy ticket number" />
        </div>

        <p className="note" style={{ margin: 0 }}>
          We have emailed you a copy.{' '}
          {signedIn
            ? 'You can follow it below, under “Your tickets”.'
            : 'Keep the number: with your email it lets you check the ticket on this page.'}
        </p>

        <div>
          <button className="btn sm" onClick={onAnother} data-act="another-ticket">
            Raise another ticket
          </button>
        </div>
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
    setBusy(true);
    setError('');
    setTicket(null);

    try {
      const result = await api('/support/tickets/lookup', { method: 'POST', body: { number, email } });
      setTicket(result.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card ct-lookup" data-section="ticket-lookup">
      <form onSubmit={lookup} className="stack">
        <b>Check a ticket</b>
        <input
          type="text"
          value={number}
          onChange={event => setNumber(event.target.value)}
          placeholder="Ticket number, e.g. OA-TKT-2026-000001"
          aria-label="Ticket number"
        />
        <input
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="The email you used"
          aria-label="Email used for the ticket"
        />
        {error ? <span className="form-err">{error}</span> : null}
        <div>
          <button className="btn sm" type="submit" disabled={busy} data-act="lookup-ticket">
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>

      {ticket ? <TicketCard ticket={ticket} open /> : null}
    </div>
  );
}

function MyTickets({ tickets, highlight }) {
  let content;
  if (!tickets) {
    content = <Loading pad />;
  } else if (tickets.length === 0) {
    content = <p className="note">You have not raised a ticket yet.</p>;
  } else {
    content = (
      <div className="ct-list">
        {tickets.map(ticket => (
          <TicketCard key={ticket.number} ticket={ticket} open={ticket.number === highlight} />
        ))}
      </div>
    );
  }

  return (
    <section className="ct-mine" data-section="my-tickets">
      <h2 className="lp-h3">Your tickets</h2>
      {content}
    </section>
  );
}

/*
 * One ticket: what was asked, then every remark and status change from the team.
 * The header stacks (number and status, subject, date) so it reads well in the
 * narrow "Check a ticket" box as well as the full-width list.
 */
function TicketCard({ ticket, open: startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const replies = ticket.history.filter(entry => entry.remark).length;

  return (
    <article
      className={'card ct-ticket' + (open ? ' open' : '')}
      data-ticket={ticket.number}
      data-status={ticket.status}
    >
      <button className="ct-ticket-h" onClick={() => setOpen(current => !current)} aria-expanded={open}>
        <span className="ct-ticket-top">
          <span className="mono ct-num">{ticket.number}</span>
          <span className={'b ' + STATUS_TONE[ticket.status]}>{ticket.statusLabel}</span>
        </span>
        <b className="ct-ticket-subject">{ticket.subject}</b>
        <span className="note">
          {fmtTime(ticket.createdAt)}
          {replies ? ` · ${replies} ${replies === 1 ? 'reply' : 'replies'}` : ''}
        </span>
      </button>

      {open ? (
        <div className="ct-ticket-b">
          <p className="note" style={{ margin: 0 }}>
            {ticket.category}
            {ticket.reference ? ` · ${ticket.reference}` : ''}
          </p>

          <p className="ct-msg">{ticket.message}</p>

          <h3>Replies from OffshoreAssure</h3>
          {ticket.history.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              No reply yet. We will email you when there is one.
            </p>
          ) : (
            <ul className="ct-history">
              {ticket.history.map((entry, index) => (
                <li key={index}>
                  <span className="mono note">{fmtTime(entry.at)}</span>
                  {entry.remark ? (
                    <p className="ct-remark" data-remark>
                      {entry.remark}
                    </p>
                  ) : null}
                  {entry.toStatus ? (
                    <span className="note">
                      Status changed to <b>{STATUS_WORD[entry.toStatus]}</b>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {ticket.status === 'CLOSED' ? (
            <p className="note" style={{ margin: 0 }}>
              This ticket is closed. If you still need help, raise a new ticket and mention {ticket.number}.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
