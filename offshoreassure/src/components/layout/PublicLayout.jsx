import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Icon } from '../common/Icon.jsx';
import { Toast } from '../common/Blocks.jsx';
import { Logo } from './Brand.jsx';

export const LP_SECTIONS = { home: 'lp-top', 'how-it-works': 'how-it-works', solutions: 'solutions', about: 'about' };

function navOffset() { const nav = document.getElementById('lp-nav'); return nav ? nav.offsetHeight : 0; }
export function scrollToSection(id, smooth) {
  const el = document.getElementById(id); if (!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - navOffset() - 8), behavior: smooth && !reduce ? 'smooth' : 'auto' });
}

/* Scroll to a landing-page section: in place on "/", otherwise navigate home first. */
export function useLpScroll() {
  const { act } = useAssessment(); const navigate = useNavigate(); const loc = useLocation();
  return useCallback(k => {
    const id = LP_SECTIONS[k] || k; act.closeLpMenu();
    if (loc.pathname !== '/') navigate('/', { state: { lpTarget: id } });
    else scrollToSection(id, true);
  }, [act, navigate, loc.pathname]);
}

function LpNav() {
  const { S, act } = useAssessment(); const lpScroll = useLpScroll();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8); on();
    window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on);
  }, []);
  const link = (k, label) => <button className="lp-link" data-act="lpgo" data-k={k} onClick={() => lpScroll(k)}>{label}</button>;
  return (
    <header className={'lp-nav' + (scrolled ? ' scrolled' : '')} id="lp-nav">
      <div className="lp-wrap lp-navin">
        <button className="lp-brand" data-act="lpgo" data-k="home" aria-label="OffshoreAssure home" onClick={() => lpScroll('home')}>
          <Logo dark w={44} h={32} /><span><b>OffshoreAssure</b><small>Assurance for the connected world.</small></span>
        </button>
        <nav className={'lp-links' + (S.lpMenu ? ' open' : '')} aria-label="Main">
          {link('home', 'Home')}{link('how-it-works', 'How It Works')}{link('solutions', 'Solutions')}{link('about', 'About Us')}
          <div className="lp-actions">
            <button className="btn outline" data-act="go" data-v="login" onClick={() => act.go('login')}><Icon n="login" s={16} />Login</button>
            <button className="btn primary" data-act="go" data-v="signup" onClick={() => act.go('signup')}>Sign Up</button>
            <button className="btn dark" data-act="go" data-v="dash" onClick={() => act.go('dash')}><Icon n="layout" s={16} />Dashboard</button>
          </div>
        </nav>
        <button className="lp-burger" data-act="lpmenu" aria-label={S.lpMenu ? 'Close menu' : 'Open menu'} aria-expanded={!!S.lpMenu} onClick={act.toggleLpMenu}><Icon n={S.lpMenu ? 'x' : 'menu'} s={22} /></button>
      </div>
    </header>
  );
}

function Footer() {
  const { act } = useAssessment(); const lpScroll = useLpScroll();
  const lp = (k, label) => <button data-act="lpgo" data-k={k} onClick={() => lpScroll(k)}>{label}</button>;
  const go = (v, label) => <button data-act="go" data-v={v} onClick={() => act.go(v)}>{label}</button>;
  return (
    <footer className="lp-foot"><div className="lp-wrap">
      <div className="lp-footgrid">
        <div><div className="row" style={{ gap: 10 }}><Logo /><b style={{ font: '600 18px var(--f-serif)', color: '#fff' }}>OffshoreAssure</b></div><p style={{ marginTop: 8, color: '#CFC5D6' }}>Assurance for the connected world.</p></div>
        <nav className="lp-footlinks" aria-label="Footer">{lp('home', 'Home')}{lp('how-it-works', 'How It Works')}{lp('solutions', 'Solutions')}{lp('about', 'About Us')}{go('login', 'Login')}{go('signup', 'Sign Up')}{go('dash', 'Dashboard')}</nav>
      </div>
      <div className="lp-footbase"><span>Phase 1 prototype — sample data and simulated interactions.</span><span>Not production authentication, live regulatory validation, production AI analysis or legally valid compliance certification.</span></div>
    </div></footer>
  );
}

/* Public site shell: navigation bar, routed page (Landing / Login / Sign Up), footer. */
export default function PublicLayout() {
  return (
    <>
      <div className="lp"><LpNav /><main id="lp-main"><Outlet /></main><Footer /></div>
      <Toast />
    </>
  );
}
