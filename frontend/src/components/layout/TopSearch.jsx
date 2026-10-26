import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { STAGES } from '../../lib/stages.js';
import { Icon } from '../common/Icon.jsx';

const MIN_LENGTH = 2;
const WAIT_MS = 250; // wait for a pause in typing before asking the server

// Pages anyone in the buyer portal can jump to by name.
const PAGES = [
  { title: 'Dashboard', to: '/dashboard' },
  { title: 'Organisation', to: '/organisation' },
  { title: 'Help and support', to: '/contact' },
  ...STAGES.map(stage => ({ title: stage.title, to: stage.path || '/stage/' + stage.slug, stage: stage.n })),
];

/*
 * Search box in the buyer top bar. Finds the organisation's assessments, vendors,
 * contracts, obligations, risks and actions (server), and pages by name (here).
 * Arrow keys move through the results, Enter opens one, Escape closes the list.
 * Ctrl+K or "/" puts the cursor in the box from anywhere.
 */
export default function TopSearch() {
  const [text, setText] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const query = text.trim();

  // Close and clear when the page changes.
  useEffect(() => {
    setOpen(false);
    setText('');
  }, [pathname]);

  // Ctrl+K or "/" focuses the box (not while typing somewhere else).
  useEffect(() => {
    const onKey = event => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = event => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Ask the server after a short pause; ignore answers to older searches.
  useEffect(() => {
    if (query.length < MIN_LENGTH) {
      setGroups([]);
      setLoading(false);
      return undefined;
    }

    let current = true;
    setLoading(true);

    const timer = setTimeout(() => {
      api('/assessments/search?q=' + encodeURIComponent(query))
        .then(result => current && setGroups(result.groups))
        .catch(() => current && setGroups([]))
        .finally(() => current && setLoading(false));
    }, WAIT_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  // Pages first, then the records, as one list for the arrow keys.
  const results = useMemo(() => {
    if (query.length < MIN_LENGTH) return [];

    const lower = query.toLowerCase();
    const pages = PAGES.filter(page => page.title.toLowerCase().includes(lower)).slice(0, 4);
    const list = pages.map(page => ({
      group: 'Pages',
      title: page.title,
      detail: page.stage ? 'Stage ' + page.stage : '',
      to: page.to,
    }));

    for (const group of groups) {
      for (const item of group.items) list.push({ group: group.label, ...item });
    }
    return list;
  }, [groups, query]);

  useEffect(() => setActive(0), [results]);

  function go(result) {
    setOpen(false);
    setText('');
    inputRef.current?.blur();
    navigate(result.to);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(index => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      go(results[active]);
    }
  }

  const showList = open && query.length >= MIN_LENGTH;

  return (
    <div className={'top-search' + (open ? ' open' : '')} ref={boxRef} data-section="top-search">
      <label className="top-search-field">
        <Icon n="search" s={17} />
        <input
          ref={inputRef}
          type="search"
          value={text}
          placeholder="Search suppliers, contracts, obligations, etc..."
          aria-label="Search your assessments"
          aria-expanded={showList}
          aria-controls="top-search-results"
          autoComplete="off"
          onChange={event => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          data-act="top-search"
        />
      </label>

      {showList ? (
        <div className="top-search-pop" id="top-search-results" role="listbox">
          {results.length === 0 ? (
            <p className="note top-search-empty">
              {loading ? 'Searching…' : `Nothing found for “${query}”.`}
            </p>
          ) : (
            results.map((result, index) => (
              <div key={result.group + result.to + result.title + index}>
                {index === 0 || results[index - 1].group !== result.group ? (
                  <div className="top-search-group">{result.group}</div>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={'top-search-item' + (index === active ? ' on' : '')}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(result)}
                  data-result={result.group}
                >
                  <b>{result.title}</b>
                  {result.detail ? <span className="note">{result.detail}</span> : null}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
