import { Badge } from '../common/Badges.jsx';
import { CHECK_TONE, CHECK_WORD, ELIGIBILITY, REVIEW } from '../../lib/selection.js';

/* Step 6 result in one line of small badges; the reason shows on hover. */
export function FitBadges({ fit }) {
  return (
    <div className="vs-checks">
      {fit.checks.map(c => (
        <span key={c.id} className={'b ' + CHECK_TONE[c.result]} title={c.detail}>
          {c.check}: {CHECK_WORD[c.result]}
        </span>
      ))}
    </div>
  );
}

export function EligibilityBadge({ fit }) {
  const [s, label] = ELIGIBILITY[fit.eligibility];
  return <Badge s={s} label={label} />;
}

export function ReviewBadge({ fit }) {
  const [s, label] = REVIEW[fit.reviewStatus];
  return <Badge s={s} label={label} />;
}

/* All nine checks with their reasons, for a single vendor. */
export function FitTable({ fit }) {
  return (
    <div className="tw">
      <table className="vs-fit" data-table="fit">
        <thead>
          <tr>
            <th>Check</th>
            <th>Result</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {fit.checks.map(c => (
            <tr key={c.id} data-check={c.id}>
              <td>
                <b>{c.check}</b>
              </td>
              <td>
                <span className={'b ' + CHECK_TONE[c.result]}>{CHECK_WORD[c.result]}</span>
              </td>
              <td>
                {c.detail}
                {c.request ? <div className="note">Next: {c.request}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* The weighted fit score (directory vendors only). */
export function ScoreBar({ score }) {
  return (
    <div
      className="vs-score"
      title={score.parts.map(p => `${p.criterion} ${p.weight}%: ${Math.round(p.value * 100)}%`).join('\n')}
    >
      <b>{score.total}</b>
      <span className="note">/100</span>
      <span className="vs-score-bar" aria-hidden="true">
        <span style={{ width: score.total + '%' }} />
      </span>
    </div>
  );
}
