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

const EMPTY_FEEDBACK = { kind: 'feedback', rating: 0, message: '', publicConsent: false };

/*
 * Feedback form on the home page. Only signed-in buyers and vendors can send
 * feedback; everyone else is asked to sign in or create an account first.
 * Messages go to the OffshoreAssure team (Admin → Feedback).
 */
export function FeedbackForm() {
  const auth = useAuth();

  if (!auth.user) return <SignInToGiveFeedback />;
  if (!['buyer', 'vendor'].includes(auth.user.role)) {
    return (
      <div className="card lp-fbdone" data-section="feedback-admin">
        <span className="lp-oi"><Icon n="shield" s={20} /></span>
        <div><b>You are signed in as an OffshoreAssure admin.</b>
          <p className="note" style={{ margin: '4px 0 0' }}>Feedback is sent by buyers and vendors. You can read it in <Link className="link" to="/admin/feedback">Admin → Feedback</Link>.</p></div>
      </div>
    );
  }
  return <FeedbackFormFields user={auth.user} />;
}

function SignInToGiveFeedback() {
  return (
    <div className="card lp-fbdone" data-section="feedback-signin">
      <span className="lp-oi"><Icon n="login" s={20} /></span>
      <div>
        <b>Sign in to share your feedback.</b>
        <p className="note" style={{ margin: '4px 0 0' }}>
          Feedback and reviews can only be sent by registered buyers and vendors, so every review on this page comes from a real user.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Link className="btn primary sm" to="/login" data-act="feedback-login">Login</Link>
          <Link className="btn sm" to="/signup">Create an account</Link>
        </div>
      </div>
    </div>
  );
}

function FeedbackFormFields({ user }) {
  const [form, setForm] = useState(EMPTY_FEEDBACK);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentMessage, setSentMessage] = useState('');

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: undefined }));
  };

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (form.message.trim().length < 10) {
      setFieldErrors({ message: 'Write at least 10 characters.' });
      return;
    }

    setBusy(true);
    try {
      const result = await api('/feedback', {
        method: 'POST',
        body: { ...form, rating: form.rating || null, page: 'home' },
      });
      setSentMessage(result.message);
      setForm(EMPTY_FEEDBACK);
    } catch (err) {
      if (Object.keys(err.fields || {}).length) setFieldErrors(err.fields);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sentMessage) {
    return (
      <div className="card lp-fbdone" role="status" data-section="feedback-sent">
        <span className="lp-oi"><Icon n="check" s={20} /></span>
        <div>
          <b>{sentMessage}</b>
          <p className="note" style={{ margin: '4px 0 0' }}>We read every message. If you asked a question, we will reply to {user.email}.</p>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setSentMessage('')}>Send another message</button>
        </div>
      </div>
    );
  }

  const canBePublished = ['feedback', 'idea'].includes(form.kind);

  return (
    <form className="card lp-fbform" onSubmit={submit} noValidate data-form="feedback">
      <div className="field">
        <label htmlFor="fb-kind">What is it about?</label>
        <select id="fb-kind" value={form.kind} onChange={e => update('kind', e.target.value)}>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="field">
        <span className="ql" id="fb-rate-l">How would you rate OffshoreAssure? <span className="note">(optional)</span></span>
        <div className="lp-stars" role="radiogroup" aria-labelledby="fb-rate-l">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={form.rating === star}
              aria-label={`${star} out of 5`}
              className={'lp-star' + (form.rating >= star ? ' on' : '')}
              onClick={() => update('rating', form.rating === star ? 0 : star)}
            >★</button>
          ))}
        </div>
      </div>

      <div className="field full">
        <label htmlFor="fb-msg">Your message</label>
        <textarea
          id="fb-msg"
          rows={4}
          maxLength={2000}
          value={form.message}
          aria-invalid={!!fieldErrors.message}
          onChange={e => update('message', e.target.value)}
          placeholder="Tell us what works well, what is unclear, or what you would like to see."
        />
        {fieldErrors.message ? <span className="form-err">{fieldErrors.message}</span> : null}
      </div>

      <p className="note full" style={{ margin: 0 }}>Sending as {user.email}. We will reply there if needed.</p>

      {canBePublished ? (
        <label className="lp-consent full">
          <input type="checkbox" checked={form.publicConsent} onChange={e => update('publicConsent', e.target.checked)} data-act="consent" />
          <span>
            You can show my feedback on the OffshoreAssure website.{' '}
            <span className="note">Your name and your rating are shown, never your email. Our team checks every review before it appears.</span>
          </span>
        </label>
      ) : null}

      {error ? <p className="form-err full" role="alert">{error}</p> : null}
      <div className="full">
        <button className="btn primary" type="submit" disabled={busy} data-act="send-feedback">{busy ? 'Sending…' : 'Send feedback'}</button>
      </div>
    </form>
  );
}

function Stars({ rating }) {
  return (
    <span className="lp-rstars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(star => <span key={star} className={star <= rating ? 'on' : ''}>★</span>)}
    </span>
  );
}

function ReviewCard({ review, hidden }) {
  return (
    <figure className="lp-review card" aria-hidden={hidden || undefined}>
      {review.rating ? <Stars rating={review.rating} /> : null}
      <blockquote>“{review.message}”</blockquote>
      <figcaption>
        <span className="lp-ravatar">{review.name[0]}</span>
        <span><b>{review.name}</b><span className="note">{review.role}</span></span>
      </figcaption>
    </figure>
  );
}

/*
 * The reviews section on the home page.
 *
 * Only real feedback is shown: the sender agreed to it being published and an
 * admin approved it. The cards scroll from right to left and pause on hover.
 * With "reduce motion" switched on they become a normal list.
 *
 * The section is always shown. When there are no published reviews yet (or the
 * server cannot be reached) it invites visitors to leave the first one.
 */
export function ReviewsMarquee() {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    api('/feedback/public')
      .then(result => setReviews(result.reviews || []))
      .catch(() => setReviews([]));
  }, []);

  return (
    <section className="lp-sec lp-alt lp-reviews" data-section="reviews">
      <div className="lp-wrap">
        <SectionHead
          eyebrow="What people say"
          title="Feedback from our users."
          sub="Real comments sent through the form below, shared with the sender’s permission."
        />
      </div>
      {reviews.length > 0 ? <ScrollingReviews reviews={reviews} /> : <NoReviewsYet />}
    </section>
  );
}

function ScrollingReviews({ reviews }) {
  // Repeat the reviews until there are at least six cards, so the row is always
  // wider than the screen. The row is then drawn twice, which makes the loop seamless.
  const row = [];
  while (row.length < Math.max(6, reviews.length)) row.push(...reviews);

  return (
    <div className="lp-marquee" style={{ '--lp-dur': `${row.length * 7}s` }} tabIndex={0} aria-label="User reviews">
      <div className="lp-mtrack">
        {row.map((review, index) => (
          <ReviewCard key={'first-' + index} review={review} hidden={index >= reviews.length} />
        ))}
        {row.map((review, index) => (
          <ReviewCard key={'second-' + index} review={review} hidden />
        ))}
      </div>
    </div>
  );
}

function NoReviewsYet() {
  return (
    <div className="lp-wrap">
      <div className="card lp-askbox" data-section="no-reviews">
        <b>No reviews yet.</b>
        <span className="note">Be the first to tell us what you think. Reviews appear here once you agree to share them and our team has checked them.</span>
        <Link className="link" to="/#feedback">Leave feedback <Icon n="arrow" s={13} /></Link>
      </div>
    </div>
  );
}
