import { keyFindings, traceRows } from '../../lib/report.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Sev } from '../common/Badges.jsx';

export function KeyFindings() {
  const { a, D } = useAssessment();
  return (
    <div className="stack">
      <h2 className="serif" style={{ fontSize: 21 }}>Key findings</h2>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>{keyFindings(a, D).map((k, i) => <li key={i}>{k}</li>)}</ol>
    </div>
  );
}

/* Requirement → contract clause → extracted obligation → rule → risk → action → evidence. */
export function TraceabilityTable() {
  const { a, D } = useAssessment();
  return (
    <div className="stack">
      <h2 className="serif" style={{ fontSize: 21 }}>Traceability</h2>
      <p className="note">Requirement → contract clause → extracted obligation → rule → risk → action → evidence</p>
      <div className="tw"><table>
        <thead><tr><th>Requirement</th><th>Clause</th><th>Obligation</th><th>Rules</th><th>Engine</th><th>Risk</th><th>Action</th><th>Evidence</th></tr></thead>
        <tbody>{traceRows(a, D).map((r, i) => (
          <tr key={i}><td><b>{r[0]}</b></td><td className="mono">{r[1]}</td><td>{r[2]}</td><td className="mono" style={{ fontSize: 11 }}>{r[3]}</td><td className="mono">{r[7]}</td><td><Sev s={r[4]} /></td><td className="mono">{r[5]}</td><td>{r[6]}</td></tr>))}
        </tbody>
      </table></div>
    </div>
  );
}

export const Stat = ({ n, l }) => <div className="stat"><b>{n}</b><span className="note">{l}</span></div>;
