import { useEffect, useState, useCallback } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Icon } from '../common/Icon.jsx';
import { Logo } from './Brand.jsx';
import { homeFor } from '../../lib/roles.js';
import ThemeToggle from '../extras/ThemeToggle.jsx';
import SiteSearch from '../extras/SiteSearch.jsx';
import SkipLink from '../extras/SkipLink.jsx';
import ScrollProgress from '../extras/ScrollProgress.jsx';
import FloatingActions from '../extras/FloatingActions.jsx';
import CookieNotice from '../extras/CookieNotice.jsx';
import LastUpdated from '../extras/LastUpdated.jsx';

/* The public website pages (separate routes). */
export const SITE_PAGES = [['/', 'Home'], ['/how-it-works', 'How It Works'], ['/solutions', 'Solutions'], ['/about', 'About Us']];

/* Where "Dashboard" goes for the signed-in user. */
export { homeFor };

function LpNav() {
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const auth = useAuth(); const navigate = useNavigate(); const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8); on();
    window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { close(); }, [loc.pathname, close]);
  const go = to => { close(); navigate(to); };
  return (
    <header className={'lp-nav' + (scrolled ? ' scrolled' : '')} id="lp-nav">
      <div className="lp-wrap lp-navin">
        <Link className="lp-brand" to="/" aria-label="OffshoreAssure home">
          <Logo dark w={44} h={32} /><span><b>OffshoreAssure</b><small>Assurance for the connected world.</small></span>
        </Link>
        <nav className={'lp-links' + (menu ? ' open' : '')} aria-label="Main">
          {SITE_PAGES.map(([to, label]) => <NavLink key={to} to={to} end className={({ isActive }) => 'lp-link' + (isActive ? ' active' : '')} data-nav={label}>{label}</NavLink>)}
          <div className="lp-actions">
            {auth.user ? (<>
              <button className="btn outline" data-act="signout" title={'Signed in as ' + auth.user.email} onClick={() => { close(); auth.logout(); }}>Sign out</button>
              <button className="btn dark" data-act="go" data-v="dash" onClick={() => go(homeFor(auth.user))}><Icon n="layout" s={16} />{auth.user.isAdmin ? 'Admin console' : auth.user.role === 'vendor' ? 'Vendor portal' : 'Dashboard'}</button>
            </>) : (<>
              <button className="btn outline" data-act="go" data-v="login" onClick={() => go('/login')}><Icon n="login" s={16} />Login</button>
              <button className="btn primary" data-act="go" data-v="signup" onClick={() => go('/signup')}>Sign Up</button>
            </>)}
          </div>
        </nav>
        <div className="lp-tools">
          <SiteSearch />
          <ThemeToggle />
        </div>
        <button className="lp-burger" data-act="lpmenu" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(m => !m)}><Icon n={menu ? 'x' : 'menu'} s={22} /></button>
      </div>
    </header>
  );
}

function Footer() {
  const auth = useAuth();
  const year = new Date().getFullYear();
  const col = (title, links) => (
    <div className="lpf-col"><h3>{title}</h3><ul>{links.filter(Boolean).map(([to, label]) => <li key={label}><Link to={to}>{label}</Link></li>)}</ul></div>);
  return (
    <footer className="lp-foot" data-section="footer">
      <div className="lp-wrap">
        <div className="lpf-grid">
          <div className="lpf-brand">
            <Link to="/" className="row lpf-logo" style={{ gap: 10 }} aria-label="OffshoreAssure home"><Logo /><b>OffshoreAssure</b></Link>
            <p>Assurance for the connected world. One clear, traceable assessment for every offshore outsourcing arrangement.</p>
            <ul className="lpf-badges"><li><Icon n="shield" s={14} />Encrypted documents</li><li><Icon n="folder" s={14} />Full audit trail</li><li><Icon n="globe" s={14} />Built for UK organisations</li></ul>
          </div>
          {col('Platform', [['/how-it-works', 'How It Works'], ['/solutions', 'Solutions'], ['/', 'Home']])}
          {col('Company', [['/about', 'About Us'], ['/#feedback', 'Send feedback'], ['/#feedback', 'Contact us']])}
          {col(auth.user ? 'Your account' : 'Get started', auth.user
            ? [[homeFor(auth.user), auth.user.isAdmin ? 'Admin console' : auth.user.role === 'vendor' ? 'Vendor portal' : 'Dashboard']]
            : [['/signup?role=buyer', 'Register as a buyer'], ['/signup?role=vendor', 'Register as a vendor'], ['/login', 'Login']])}
        </div>
        <div className="lpf-base">
          <span>&copy; {year} OffshoreAssure. All rights reserved. <LastUpdated /></span>
          <span>OffshoreAssure supports the buyer&rsquo;s decision. It does not give legal advice or certify compliance.</span>
          <button className="lpf-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">Back to top <span aria-hidden="true">↑</span></button>
        </div>
      </div>
    </footer>
  );
}

/* Gentle "fade up" as sections and cards scroll into view (website pages only).
   Content is never hidden without JavaScript, and nothing moves for people who prefer reduced motion. */
const REVEAL = '.lp-sechead, .lp-card, .lp-sol, .lp-who, .lp-steps4 > li, .lp-timeline > li, .lp-riskin > *, .lp-askbox, .lp-fbpoints, .lp-stagelist > li, .lp-problems > li, .lp-faq > details, .lp-mission, .lp-about > *, .lp-fbform, .lp-chips, .lp-parties, .lp-ctain';
function useReveal() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let io;
    const t = setTimeout(() => {
      const els = [...document.querySelectorAll('#lp-main ' + REVEAL.split(', ').join(', #lp-main '))].filter(el => !el.closest('.lp-marquee'));
      io = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target; el.classList.add('lp-in'); io.unobserve(el);
        // once it has faded in, hand the element back to its normal styles (so hover effects work)
        setTimeout(() => { el.classList.remove('lp-reveal', 'lp-in'); el.style.removeProperty('--lp-delay'); }, 900);
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      els.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92) return;          // already on screen: leave as is
        const sibs = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
        el.style.setProperty('--lp-delay', `${Math.min(sibs, 5) * 70}ms`);
        el.classList.add('lp-reveal'); io.observe(el);
      });
    }, 30);
    return () => { clearTimeout(t); io?.disconnect(); };
  }, [pathname]);
}

/* Public site shell: navigation bar, routed page (Home, How It Works, Solutions, About Us, Login, Sign Up), footer. */
export default function PublicLayout() {
  useReveal();
  return (
    <div className="lp">
      <SkipLink target="lp-main" />
      <ScrollProgress />
      <LpNav />
      <main id="lp-main" tabIndex={-1}><Outlet /></main>
      <Footer />
      <FloatingActions />
      <CookieNotice />
    </div>
  );
}
