import { useEffect } from 'react';
import { isPass } from '../engine/engines.js';
import { reqName } from '../lib/constants.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Badge, Rid, Cid } from '../components/common/Badges.jsx';
import { PageHead, Tabs, useTab, NextButton } from '../components/common/Blocks.jsx';

/* Step 5 · Engine B: contractual obligations mapped to the rule that evaluates each one. */
export default function Obligations() {
  const { a, D, act } = useAssessment();
  const an = D.analysis;
  const obl = D.checks.filter(c => c.clauses[0] && c.clauses[0].obligation && c.rule.type !== 'jurisdiction');
  const needs = obl.filter(c => !isPass(c.status) || D.reqStatus[c.req] !== 'Satisfied');
  const list = [['all', 'All', obl.length], ['att', 'Needs attention', needs.length], ['ok', 'No open gap', obl.length - needs.length]];
  const cur = useTab('obl', list);
  const rows = cur === 'att' ? needs : cur === 'ok' ? obl.filter(c => !needs.includes(c)) : obl;
  const other = an.obligations.filter(c => !obl.find(x => x.clauses[0].id === c.id));

  /* First visit records the obligation count in the audit trail (once per assessment). */
  useEffect(() => { if (!a.obligationsSeen) act.markSeen('obligationsSeen', an.obligations.length + ' obligations identified', 'From ' + a.contractName, 'EXTRACT'); }, [a, an, act]);

  return (
    <>
      <PageHead eyebrow="Step 5 · Engine B" title="Obligations" lead={an.obligations.length + ' contractual obligations extracted from ' + a.contractName + '. Each mapped obligation links to the OffshoreAssure rule that evaluates it.'} />
      <div className="card">
        <div style={{ padding: '4px 20px 0' }}><Tabs k="obl" list={list} cur={cur} /></div>
        <div className="tw"><table><thead><tr><th>Obligation</th><th>Source clause</th><th>Rule / requirement</th><th>Deadline</th><th>Clause check</th><th>Requirement status</th></tr></thead><tbody>
          {rows.map(c => { const o = c.clauses[0].obligation; return (
            <tr key={c.id} className="click" data-act="selCheck" data-id={c.id} onClick={() => act.selCheck(c.id)}>
              <td><b>{o.text.length > 110 ? o.text.slice(0, 108) + '…' : o.text}</b></td><td><Cid id={c.clauses[0].id} /></td>
              <td><Rid id={c.id} /><div className="note">{reqName(c.req)}</div></td><td className="mono">{o.deadline}</td><td><Badge s={c.status} /></td><td><Badge s={D.reqStatus[c.req]} /></td>
            </tr>); })}
        </tbody></table></div>
      </div>
      {other.length ? <details className="trace"><summary>{other.length} further obligations extracted but not mapped to a compliance rule</summary>
        {other.map(c => <div className="trow" key={c.id}><div className="in">{c.obligation.text}</div><div><Cid id={c.id} /></div><div className="note">{c.label}</div></div>)}
      </details> : null}
      <NextButton v="mapping" label="Continue to rule mapping" />
    </>
  );
}
