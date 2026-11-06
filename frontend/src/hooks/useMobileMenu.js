import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/*
 * Open / closed state for the slide-out menu on small screens (buyer portal,
 * vendor portal and admin console). The menu closes by itself when the page
 * changes or Escape is pressed, and the page behind it does not scroll while
 * it is open.
 */
export function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen(current => !current), []);

  // A link in the menu was followed: close it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('menu-open');

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('menu-open');
    };
  }, [open]);

  return { open, close, toggle };
}
