import { RULEBASE_VERSION, JURISDICTIONS, TRIGGER_TEXT, REQUIREMENTS, TAXONOMY, EVIDENCE_TYPES, RULES, DELIVERY_RULES } from '../data/prototype-data.js';
import { userById } from '../engine/engines.js';
import { reqName, engineOf } from '../lib/constants.js';
import { Badge, Sev, Rid, ETag } from '../components/common/Badges.jsx';
import { PageHead } from '../components/common/Blocks.jsx';

/* Settings / Rule base: the prototype rules the four engines apply (read-only). */
export default function RuleBase() {
  return (
    <>
      <PageHead eyebrow="Settings" title="Rule base" lead={'The rules the four engines apply. Authored in house, versioned, and referenced on every audit entry. Version ' + RULEBASE_VERSION + '. Prototype sample rules, not production legal or regulatory rules.'} />
      <div className="card"><div className="ch"><h2>Engine A · Requirement triggers</h2></div><div className="tw"><table>
        <thead><tr><th>ID</th><th>Requirement</th><th>Trigger</th><th className="num">Weight</th></tr></thead>
        <tbody>{REQUIREMENTS.map(r => <tr key={r.id}><td className="mono">REQ-{r.id}</td><td>{r.name}</td><td className="mono" style={{ fontSize: 11.5 }}>IF {TRIGGER_TEXT[r.id]}</td><td className="num">{r.weight}</td></tr>)}</tbody>
      </table></div></div>
      <div className="card"><div className="ch"><h2>Compliance rules (Engines A–C)</h2><span className="note">{RULES.length} rules</span></div><div className="tw"><table>
        <thead><tr><th>Rule</th><th>Engine</th><th>Requirement</th><th>Check</th><th>Input</th><th>Severity if open</th><th>Default owner</th></tr></thead>
        <tbody>{RULES.map((r, i) => (
          <tr key={r.id + i}><td><Rid id={r.id} /></td><td><ETag L={engineOf({ id: r.id, req: r.req, rule: r })} /></td><td>{reqName(r.req)}</td>
            <td>{r.name}{r.mode ? <> <span className="note">({r.mode === 'named' ? 'named sub-processor' : 'unnamed subcontractors'})</span></> : null}</td>
            <td>{r.type === 'contract' ? 'Clause: ' + r.cat.join(', ') : r.type === 'evidence' ? 'Evidence: ' + EVIDENCE_TYPES[r.ev].label : r.type}</td><td><Sev s={r.sev} /></td><td>{userById(r.owner).role}</td></tr>))}</tbody>
      </table></div></div>
      <div className="card"><div className="ch"><h2>Engine D · Delivery rules</h2><span className="proto">Sample feed</span></div><div className="tw"><table><tbody>
        {DELIVERY_RULES.map(r => <tr key={r.id}><td><Rid id={r.id} /></td><td>{r.name}</td><td className="note">Targets from contract: {r.metrics.join(', ')}</td></tr>)}
        <tr><td><Rid id="ALERT" /></td><td>Alert when the rolling score is below 80 or a breach falls in the window</td><td className="note">High &lt; 60 · Medium &lt; 80 · otherwise Low</td></tr>
      </tbody></table></div></div>
      <div className="grid g2 top-al">
        <div className="card"><div className="ch"><h2>Engine B · Clause taxonomy</h2></div><div className="tw"><table><tbody>
          {TAXONOMY.filter(t => t.relevant).map((t, i) => <tr key={i}><td>{t.label}</td><td className="mono" style={{ fontSize: 11 }}>{String(t.pat).slice(1, 64)}</td></tr>)}
        </tbody></table></div></div>
        <div className="card"><div className="ch"><h2>Engine C · Transfer rule table</h2><span className="note">Prototype data · confirm against the current ICO list</span></div><div className="tw" style={{ maxHeight: 440, overflow: 'auto' }}><table><tbody>
          {Object.entries(JURISDICTIONS).sort((x, y) => x[0].localeCompare(y[0])).map(([c, j]) => (
            <tr key={c}><td>{c}</td><td><Badge s={j.status === 'adequate' || j.status === 'domestic' ? 'Adequate' : j.status === 'partial' ? 'Partial' : 'Restricted transfer'} label={j.status === 'adequate' ? 'Adequate' : j.status === 'domestic' ? 'Domestic' : j.status === 'partial' ? 'Partial' : 'Restricted'} /></td><td className="note">{j.basis}</td></tr>))}
        </tbody></table></div></div>
      </div>
      <div className="card pad stack"><h2>Governance controls</h2><dl className="kv">
        <dt>Evidence weighting</dt><dd>Evidenced controls score 100%; declared-only controls score 60%.</dd>
        <dt>Access flag</dt><dd>Approved ≥ 80 with no area below 60 · Conditional ≥ 60 or any area below 60 · Restricted &lt; 60.</dd>
        <dt>Escalation threshold</dt><dd>Extractions under 75% confidence are held for human review.</dd>
        <dt>Sector rule FS-OR-01</dt><dd>Financial Services: operational incident evidence must be verified, not self-declared.</dd>
        <dt>Assurance score</dt><dd>Per requirement 50% Engine A + 50% rule results, weighted; then 80% A–C + 20% Engine D delivery score.</dd>
        <dt>Action closure</dt><dd>An action closes only when its linked rule passes on verified evidence.</dd>
        <dt>Positioning</dt><dd>Outputs are risk indicators. The platform does not issue legal determinations.</dd>
      </dl></div>
    </>
  );
}
