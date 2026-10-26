import { useState } from 'react';

const Eye = ({ off }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off ? <path d="M4 4l16 16" /> : null}
  </svg>
);

/* Password field with a show/hide button. All other props go to the <input>. */
export default function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} type={show ? 'text' : 'password'} autoCapitalize="off" spellCheck="false" />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        title={show ? 'Hide password' : 'Show password'}
        data-act="toggle-password"
      >
        <Eye off={show} />
      </button>
    </div>
  );
}
