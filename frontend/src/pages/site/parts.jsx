import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { homeFor } from '../../lib/roles.js';
import { Icon } from '../../components/common/Icon.jsx';

/* Shared building blocks for the public website pages. */

export function PageHero({ eyebrow, title, lead, points, children }) {
  return (
    <section className="lp-pagehero"><div className="lp-wrap lp-pagehero-in">
      <span className="eyebrow" style={{ color: 'var(--copper)' }}>{eyebrow}</span>
      <h1 className="lp-h1 lp-h1-page">{title}</h1>
      {lead ? <p className="lp-lead">{lead}</p> : null}
      {points?.length ? <ul className="lp-heropoints">{points.map(([ic, t]) => <li key={t}><span className="lp-oi"><Icon n={ic} s={16} /></span>{t}</li>)}</ul> : null}
      {children}
    </div></section>
  );
}

export function SectionHead({ eyebrow, title, sub, center, left }) {
  return (
    <div className={'lp-sechead' + (center ? ' lp-center' : '') + (left ? ' lp-sechead-left' : '')} style={left ? { textAlign: 'left' } : undefined}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2 className="lp-h2">{title}</h2>
      {sub ? <p className="lp-sub">{sub}</p> : null}
    </div>
  );
}

/* Main call-to-action button: workspace when signed in, otherwise sign-up. */
export function StartButton({ label }) {
  const auth = useAuth(); const navigate = useNavigate();
  return <button className="btn primary lp-cta" data-act="lpstart" onClick={() => navigate(auth.user ? homeFor(auth.user) : '/signup')}>{auth.user ? 'Go to your workspace' : label || 'Create an account'} <Icon n="arrow" s={16} /></button>;
}

export function CtaBand({ title = 'Ready to get started?', text = 'Create an account in a few minutes. Buyers can start a requirement straight away; vendors are verified by our team first.' }) {
  const auth = useAuth();
  return (
    <section className="lp-ctaband"><div className="lp-wrap lp-ctain">
      <div><h2 className="lp-h2" style={{ color: '#fff', margin: 0 }}>{title}</h2><p style={{ color: '#D8D0E0', margin: '8px 0 0', maxWidth: '58ch' }}>{text}</p></div>
      <div className="row" style={{ gap: 10 }}>
        <StartButton />
        {!auth.user ? <Link className="btn outline lp-cta lp-cta-light" to="/signup?role=vendor">Register as a vendor</Link> : null}
      </div>
    </div></section>
  );
}

/* Availability of a part of the service in this build (honest status, no invented claims). */
export const Available = ({ now }) => now ? <span className="b b-sage lp-avail">Available now</span> : <span className="b b-mute lp-avail">Coming soon</span>;

const KINDS = [['feedback', 'General feedback'], ['question', 'A question'], ['problem', 'Something is not working'], ['idea', 'An idea or suggestion']];

/* Feedback form: saved for the OffshoreAssure team (Admin → Feedback). */
export function FeedbackForm() {
  const auth = useAuth();
  const [f, setF] = useState({ kind: 'feedback', rating: 0, message: '', name: '', email: '', website: '', publicConsent: false });
  const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState(''); const [err, setErr] = useState('');
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setErrs(x => ({ ...x, [k]: undefined })); };
  const submit = async e => {
    e.preventDefault(); setErr('');
    const v = {};
    if (f.message.trim().length < 10) v.message = 'Write at least 10 characters.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) v.email = 'Enter a valid email address, or leave it empty.';
    if (Object.keys(v).length) return setErrs(v);
    setBusy(true);
    try {
      const r = await api('/feedback', { method: 'POST', body: { ...f, rating: f.rating || null, page: 'home' } });
      setDone(r.message); setF({ kind: 'feedback', rating: 0, message: '', name: '', email: '', website: '', publicConsent: false });
    } catch (x) { if (Object.keys(x.fields || {}).length) setErrs(x.fields); else setErr(x.message); } finally { setBusy(false); }
  };
  if (done) return (
    <div className="card lp-fbdone" role="status" data-section="feedback-sent">
      <span className="lp-oi"><Icon n="check" s={20} /></span>
      <div><b>{done}</b><p className="note" style={{ margin: '4px 0 0' }}>We read every message. If you left an email address and asked a question, we will reply.</p>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setDone('')}>Send another message</button></div>
    </div>);
  return (
    <form className="card lp-fbform" onSubmit={submit} noValidate data-form="feedback">
      <div className="field"><label htmlFor="fb-kind">What is it about?</label>
        <select id="fb-kind" value={f.kind} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field"><span className="ql" id="fb-rate-l">How would you rate OffshoreAssure? <span className="note">(optional)</span></span>
        <div className="lp-stars" role="radiogroup" aria-labelledby="fb-rate-l">
          {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={f.rating === n} aria-label={`${n} out of 5`} className={'lp-star' + (f.rating >= n ? ' on' : '')} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })}>★</button>)}
        </div></div>
      <div className="field full"><label htmlFor="fb-msg">Your message</label>
        <textarea id="fb-msg" rows={4} maxLength={2000} value={f.message} aria-invalid={!!errs.message} onChange={set('message')} placeholder="Tell us what works well, what is unclear, or what you would like to see." />
        {errs.message ? <span className="form-err">{errs.message}</span> : null}</div>
      {!auth.user ? <>
        <div className="field"><label htmlFor="fb-name">Name <span className="note">(optional)</span></label><input type="text" id="fb-name" maxLength={100} value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="fb-email">Email <span className="note">(optional, if you would like a reply)</span></label><input type="email" id="fb-email" value={f.email} aria-invalid={!!errs.email} onChange={set('email')} />{errs.email ? <span className="form-err">{errs.email}</span> : null}</div>
      </> : <p className="note full" style={{ margin: 0 }}>You are signed in as {auth.user.email}; we will reply there if needed.</p>}
      {['feedback', 'idea'].includes(f.kind) ? (
        <label className="lp-consent full"><input type="checkbox" checked={f.publicConsent} onChange={e => setF({ ...f, publicConsent: e.target.checked })} data-act="consent" />
          <span>You can show my feedback on the OffshoreAssure website. <span className="note">Your name (as you type it) and your rating are shown, never your email. Our team checks every review before it appears.</span></span></label>) : null}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="lp-hp" aria-hidden="true" value={f.website} onChange={set('website')} />
      {err ? <p className="form-err full" role="alert">{err}</p> : null}
      <div className="full"><button className="btn primary" type="submit" disabled={busy} data-act="send-feedback">{busy ? 'Sending…' : 'Send feedback'}</button></div>
    </form>
  );
}

const Stars = ({ n }) => <span className="lp-rstars" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= n ? 'on' : ''}>★</span>)}</span>;

/* Published reviews, scrolling right to left. Real feedback only: shown when the sender agreed and an admin published it.
   Pauses on hover/focus; with "reduce motion" it becomes a normal horizontal list. Renders nothing when there are no reviews. */
export function ReviewsMarquee() {
  const [reviews, setReviews] = useState(null);
  useEffect(() => { api('/feedback/public').then(r => setReviews(r.reviews)).catch(() => setReviews([])); }, []);
  if (!reviews || !reviews.length) return null;
  // Repeat the set so one half of the track is always wider than the screen; the second half makes the loop seamless.
  const set = []; while (set.length < Math.max(6, reviews.length)) set.push(...reviews);
  const card = (r, i, hidden) => (
    <figure key={i} className="lp-review card" aria-hidden={hidden || undefined}>
      {r.rating ? <Stars n={r.rating} /> : null}
      <blockquote>“{r.message}”</blockquote>
      <figcaption><span className="lp-ravatar">{r.name[0]}</span><span><b>{r.name}</b><span className="note">{r.role}</span></span></figcaption>
    </figure>);
  return (
    <section className="lp-sec lp-alt lp-reviews" data-section="reviews"><div className="lp-wrap">
      <SectionHead eyebrow="What people say" title="Feedback from our users." sub="Real comments sent through the form below, shared with the sender’s permission." />
    </div>
      <div className="lp-marquee" style={{ '--lp-dur': `${set.length * 7}s` }} tabIndex={0} aria-label="User reviews">
        <div className="lp-mtrack">{set.map((r, i) => card(r, 'a' + i, i >= reviews.length))}{set.map((r, i) => card(r, 'b' + i, true))}</div>
      </div>
    </section>
  );
}
