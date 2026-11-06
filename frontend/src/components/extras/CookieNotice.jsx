import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'oa-cookie-consent';
const OPEN_EVENT = 'oa:cookie-settings';

/*
 * The visitor's cookie choice: 'accepted', 'rejected' or null (not asked yet).
 *
 * OffshoreAssure sets one cookie today: the sign-in session, which is strictly
 * necessary and works whatever the choice. "Reject" therefore means "essential
 * cookies only". If optional cookies (for example analytics) are ever added,
 * they must check cookieConsent() === 'accepted' before being set.
 */
export function cookieConsent() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved?.choice || null;
  } catch {
    return null;
  }
}

/* Opens the banner again, e.g. from "Cookie settings" in the footer. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function saveChoice(choice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
  } catch {
    /* storage blocked: the banner shows again on the next visit */
  }
}

/*
 * Full-width cookie banner at the bottom of the screen, with Accept and Reject.
 * While it is open, its height is published as --cookie-banner-h so the floating
 * buttons (Contact us, Back to top) move up and are never covered.
 */
export default function CookieNotice() {
  const [visible, setVisible] = useState(() => cookieConsent() === null);
  const bannerRef = useRef(null);

  // "Cookie settings" anywhere on the site opens the banner again.
  useEffect(() => {
    const open = () => setVisible(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (!visible || !bannerRef.current) {
      root.style.removeProperty('--cookie-banner-h');
      return undefined;
    }

    const banner = bannerRef.current;
    const publishHeight = () => root.style.setProperty('--cookie-banner-h', `${banner.offsetHeight}px`);
    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(banner);

    return () => {
      observer.disconnect();
      root.style.removeProperty('--cookie-banner-h');
    };
  }, [visible]);

  if (!visible) return null;

  function choose(choice) {
    saveChoice(choice);
    setVisible(false);
  }

  const current = cookieConsent();

  return (
    <div
      ref={bannerRef}
      className="cookie-banner"
      role="region"
      aria-label="Cookie choices"
      data-section="cookie-notice"
    >
      <div className="cookie-banner-in">
        <p>
          <b>Cookies on OffshoreAssure.</b> We use one essential cookie to keep you signed in. We do not use
          tracking or advertising cookies. You can accept cookies, or reject anything that is not essential.
          {current ? (
            <span className="cookie-current">
              {' '}
              Your current choice: {current === 'accepted' ? 'accepted' : 'essential only'}.
            </span>
          ) : null}
        </p>

        <div className="cookie-banner-actions">
          <button
            type="button"
            className="btn sm cookie-reject"
            onClick={() => choose('rejected')}
            data-act="cookie-reject"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            className="btn sm primary"
            onClick={() => choose('accepted')}
            data-act="cookie-accept"
          >
            Accept cookies
          </button>
        </div>
      </div>
    </div>
  );
}
