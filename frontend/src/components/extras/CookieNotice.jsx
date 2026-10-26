import { useState } from 'react';

const STORAGE_KEY = 'oa-cookie-notice';

function alreadySeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'seen';
  } catch {
    return false;
  }
}

/*
 * OffshoreAssure only sets one essential cookie (the sign-in session) and no
 * tracking or advertising cookies, so this is a notice, not a consent choice.
 */
export default function CookieNotice() {
  const [visible, setVisible] = useState(() => !alreadySeen());
  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'seen');
    } catch {
      /* shown again next visit */
    }
    setVisible(false);
  }

  return (
    <div className="cookie-notice" role="region" aria-label="Cookie notice" data-section="cookie-notice">
      <p>
        <b>We only use essential cookies.</b> One cookie keeps you signed in. We do not use tracking or
        advertising cookies.
      </p>
      <button type="button" className="btn sm primary" onClick={dismiss} data-act="cookie-ok">
        OK
      </button>
    </div>
  );
}
