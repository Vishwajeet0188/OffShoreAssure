import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STAGES } from '../../lib/stages.js';
import { FAQ } from '../../pages/site/Home.jsx';
import { SOLUTIONS } from '../../pages/site/Solutions.jsx';

/* Everything the public search can find: the pages, the stages, the solutions and the FAQ. */
function buildIndex() {
  const pages = [
    { title: 'Home', text: 'Overview of OffshoreAssure, who it is for, feedback and reviews', to: '/' },
    { title: 'How It Works', text: 'The nine stages of an assessment, the buyer and vendor journeys', to: '/how-it-works' },
    { title: 'Solutions', text: 'What OffshoreAssure provides and how it helps', to: '/solutions' },
    { title: 'About Us', text: 'Who we are, our mission and values', to: '/about' },
    { title: 'Sign up', text: 'Create a buyer or vendor account', to: '/signup' },
    { title: 'Login', text: 'Sign in to your account', to: '/login' },
    { title: 'Send feedback', text: 'Questions, ideas or problems', to: '/#feedback' },
  ].map(item => ({ ...item, kind: 'Page' }));

  const stages = STAGES.map(stage => ({
    kind: `Stage ${stage.n}`, title: stage.title, text: stage.summary, to: '/how-it-works',
  }));
  const solutions = SOLUTIONS.map(([, title, , description]) => ({
    kind: 'Solution', title, text: description, to: '/solutions',
  }));
  const questions = FAQ.map(([question, answer]) => ({
    kind: 'FAQ', title: question, text: answer, to: '/#faq', showText: true,
  }));

  return [...pages, ...stages, ...solutions, ...questions];
}

function search(index, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return index
    .map(item => {
      const title = item.title.toLowerCase();
      const all = `${title} ${item.text.toLowerCase()}`;
      if (!words.every(word => all.includes(word))) return null;
      const score = words.filter(word => title.includes(word)).length; // title matches first
      return { ...item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

/* Search button for the website header. Also opens with Ctrl+K (⌘K on a Mac) or "/". */
export default function SiteSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="site-search-btn" onClick={() => setOpen(true)} aria-label="Search the site" title="Search (Ctrl+K)" data-act="open-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </button>
      {open ? <SearchDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SearchDialog({ onClose }) {
  const navigate = useNavigate();
  const input = useRef(null);
  const [query, setQuery] = useState('');
  const index = useMemo(buildIndex, []);
  const results = search(index, query);

  useEffect(() => {
    input.current?.focus();
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function go(to) {
    onClose();
    navigate(to);
  }

  return (
    <div className="modal-backdrop search-backdrop" onClick={onClose}>
      <div className="modal site-search" role="dialog" aria-modal="true" aria-label="Search the site" onClick={e => e.stopPropagation()} data-section="site-search">
        <input
          ref={input}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) go(results[0].to); }}
          placeholder="Search pages, stages and questions…"
          aria-label="Search"
        />
        {query && results.length === 0 ? <p className="note">No results for “{query}”.</p> : null}
        {results.length > 0 ? (
          <ul className="search-results">
            {results.map(item => (
              <li key={item.kind + item.title}>
                <button type="button" onClick={() => go(item.to)}>
                  <span className="note">{item.kind}</span>
                  <b>{item.title}</b>
                  {item.showText ? <span className="note">{item.text}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!query ? <p className="note">Try “vendor”, “transfer”, “contract” or “cost”.</p> : null}
      </div>
    </div>
  );
}
