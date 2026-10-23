/* Inline SVG line icons (same path data as the plain-JS prototype; no icon package). */
export const ICONS = {
  home: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  users: ['c:9,8,3.5', 'M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M18 14.8c2 .7 3.2 2.6 3.6 5.2'],
  clipboard: ['M9 3.5h6v3H9z', 'M7 5H5v16h14V5h-2', 'M8.5 12h7', 'M8.5 16h5'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  globe: ['c:12,12,9', 'M3 12h18', 'M12 3c3 3.2 3 14.8 0 18', 'M12 3c-3 3.2-3 14.8 0 18'],
  pulse: ['M3 12h4l2-5 4 10 2-5h6'],
  flow: ['M4 5h7v5H4z', 'M13 14h7v5h-7z', 'M7.5 10v3.5a2 2 0 0 0 2 2H13'],
  folder: ['M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  report: ['M6 3h12v18H6z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  gear: ['c:12,12,3', 'M12 2.5v3', 'M12 18.5v3', 'M4.6 6.6l2.1 2.1', 'M17.3 15.3l2.1 2.1', 'M2.5 12h3', 'M18.5 12h3', 'M4.6 17.4l2.1-2.1', 'M17.3 8.7l2.1-2.1'],
  search: ['c:11,11,6.5', 'M16 16l4.5 4.5'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  check: ['c:12,12,9', 'M8 12.5l2.7 2.7L16 10'],
  alert: ['M12 3.5L21.5 20h-19z', 'M12 10v4.5', 'M12 17.3v.01'],
  shield: ['M12 3l7.5 3v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5V6z', 'M9 12l2.2 2.2L15.5 10'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v4h16v-4'],
  scale: ['M12 4v16', 'M7 20h10', 'M5 8h14', 'M5 8l-2.5 6a2.5 2.5 0 0 0 5 0z', 'M19 8l-2.5 6a2.5 2.5 0 0 0 5 0z'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  scan: ['M6 3h8l4 4v6', 'M6 3v18h6', 'c:16.5,17.5,3', 'M18.7 19.7L21 22'],
  doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  layout: ['M3 3h18v18H3z', 'M3 9h18', 'M9 21V9'],
  login: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  userplus: ['c:9,7,4', 'M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2', 'M19 8v6', 'M22 11h-6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  building: ['M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17', 'M15 9h4a1 1 0 0 1 1 1v11', 'M8 7h3', 'M8 11h3', 'M8 15h3', 'M3 21h18'],
  target: ['c:12,12,8.5', 'c:12,12,4.5', 'c:12,12,.8'],
  clock: ['c:12,12,9', 'M12 7v5l3 2'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5']
};

export function Icon({ n, s = 18, style }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {(ICONS[n] || []).map((d, i) => {
        if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(','); return <circle key={i} cx={cx} cy={cy} r={r} />; }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}
/* Arrow pointing left (the "back"/export glyph used in the prototype). */
export const BackArrow = ({ s = 17, n = 'arrow' }) => <Icon n={n} s={s} style={{ transform: 'rotate(180deg)' }} />;

/* Small status glyphs used inside badges. */
export const StatusIcon = {
  sage: <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4.9 8.2l2.1 2.1 4.1-4.2" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  amber: <svg width="13" height="13" viewBox="0 0 16 15" aria-hidden="true"><path d="M8 1.3L15 13.7H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 5.6v3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.4" r=".9" fill="currentColor" /></svg>,
  coral: <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 4.4v4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="8" cy="11.2" r=".95" fill="currentColor" /></svg>,
  plum: <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 4.5V8l2.4 1.6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>,
  mute: <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" /></svg>
};
