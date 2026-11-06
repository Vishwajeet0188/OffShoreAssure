/*
 * Small SVG charts for the buyer dashboard. No chart library: a ring for one
 * score and a donut for a few groups. Colours come from the theme, so they
 * work in light and dark mode.
 */

/* One score out of 100 as a ring, with the number in the middle. */
export function ScoreRing({ value, size = 92, stroke = 9, label }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value)) / 100;

  return (
    <svg
      className="ov-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label || (value === null ? 'No score yet' : `${value} out of 100`)}
    >
      <circle
        className="ov-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
      />
      {/* No fill at all for "no score": a zero-length round cap would still draw a dot. */}
      {filled > 0 ? (
        <circle
          className="ov-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
      <text className="ov-ring-value" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {value === null || value === undefined ? '—' : `${value}%`}
      </text>
    </svg>
  );
}

/* Colour for each slice, in a fixed order (a slice keeps its colour whatever the others are). */
export const SLICE_COLOURS = [
  'var(--plum)',
  'var(--copper)',
  'var(--sage)',
  'var(--amber)',
  'var(--inverse)',
  'var(--muted)',
];

/*
 * Donut of groups (e.g. assessments by service). `centre` is the big text in the
 * middle and `centreNote` the small line under it.
 */
export function Donut({ slices, size = 168, stroke = 22, centre, centreNote }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = slices.length > 1 ? 3 : 0; // a thin gap between slices

  let offset = 0;

  return (
    <svg
      className="ov-donut"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={slices.map(s => `${s.label}: ${s.value}`).join(', ')}
    >
      <circle
        className="ov-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
      />

      {total > 0
        ? slices.map((slice, index) => {
            const length = (slice.value / total) * circumference;
            const dash = Math.max(length - gap, 0.5);
            const element = (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={SLICE_COLOURS[index % SLICE_COLOURS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset += length;
            return element;
          })
        : null}

      <text className="ov-donut-value" x="50%" y="46%" dominantBaseline="central" textAnchor="middle">
        {centre}
      </text>
      {centreNote ? (
        <text className="ov-donut-note" x="50%" y="62%" dominantBaseline="central" textAnchor="middle">
          {centreNote}
        </text>
      ) : null}
    </svg>
  );
}
