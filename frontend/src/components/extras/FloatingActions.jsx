import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Set VITE_CONTACT_EMAIL to show an email link; without it the button opens the feedback form.
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';

/* Bottom-right buttons: "Contact us" always, and "Back to top" once the page is scrolled down. */
export default function FloatingActions({ showContact = true }) {
  const [scrolledDown, setScrolledDown] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolledDown(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="floating-actions">
      {scrolledDown ? (
        <button type="button" className="fab fab-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top" data-act="back-to-top">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      ) : null}
      {showContact ? (
        CONTACT_EMAIL ? (
          <a className="fab fab-contact" href={`mailto:${CONTACT_EMAIL}`} data-act="contact"><ContactIcon /><span>Contact us</span></a>
        ) : (
          <Link className="fab fab-contact" to="/#feedback" data-act="contact"><ContactIcon /><span>Contact us</span></Link>
        )
      ) : null}
    </div>
  );
}

function ContactIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
