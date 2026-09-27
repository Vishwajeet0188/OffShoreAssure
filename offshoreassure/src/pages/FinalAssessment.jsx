import { RULEBASE_VERSION, VENDORS } from '../data/prototype-data.js';
import { isOpen } from '../engine/engines.js';
import { userName } from '../lib/constants.js';
import { fmtDate } from '../lib/format.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { BackArrow } from '../components/common/Icon.jsx';
import { Ring } from '../components/common/Charts.jsx';
import { PageHead } from '../components/common/Blocks.jsx';
import EngineStrip from '../components/engines/EngineStrip.jsx';
import Reassessment from '../components/assessment/Reassessment.jsx';
import { KeyFindings, TraceabilityTable, Stat } from '../components/reports/ReportSections.jsx';

/* Step 12 · Final assessment (also the Reports module): consolidated buyer-facing output with
   Export Report (downloads OffshoreAssure_<assessment>_<date>.html), Copy report text and Issue assessment report. */
export default function FinalAssessment() {
  const { a, D, act } = useAssessment();
  const v = VENDORS[a.vendorId]; const an = D.analysis;
  const bt = D.overall.startsWith('ACTION') ? 'coral' : D.overall.startsWith('REVIEW') ? 'plum' : 'sage';
  const B = a.baseline || {}; const openNow = D.findings.filter(f => isOpen(f.status)).length;
  const matIssues = B.material != null ? B.material : openNow; const gapsId = B.gaps != null ? B.gaps : D.evidenceGaps;
  const matActs = a.actions.filter(x => !x.ruleId.startsWith('DEL')).length, delActs = a.actions.length - matActs;
  const xfers = D.reqs.some(r => r.id === 'XFER') && D.juris && D.juris.status !== 'domestic' ? 1 : 0;
  return (
    <>
      <PageHead eyebrow="Step 12 · Consolidated buyer-facing output" title="Final assessment" lead="Built from the stored outputs of the four engines and the governance evidence layer. Nothing here is typed by hand."
        right={<>
          <button className="btn outline" data-act="exportReport" onClick={act.exportReport}><BackArrow n="upload" s={15} />Export Report</button>
          <button className="btn" data-act="copyReport" onClick={act.copyReport}>Copy report text</button>
          {a.reportGenerated ? null : <button className="btn primary" data-act="genReport" onClick={act.genReport}>Issue assessment report</button>}
        </>} />
      <div className="card sheet">
        <div className="rh">
          <div><div className="eyebrow">OffshoreAssure · Outsourcing assurance assessment</div><h1 style={{ marginTop: 6, fontSize: 30 }}>{a.name}</h1></div>
          <div className="mono" style={{ textAlign: 'right', lineHeight: 1.7 }}>{a.id}<br />{fmtDate(new Date().toISOString())}<br />{RULEBASE_VERSION}<br /><span className="proto">Prototype output</span></div>
        </div>
        <dl className="kv">
          <dt>Organisation</dt><dd>{a.org}</dd><dt>Supplier</dt><dd>{v.name} · {v.location + ', ' + v.country}</dd>
          {an.subprocessors[0] ? <><dt>Sub-processor</dt><dd>{an.subprocessors[0].name}</dd></> : null}
          <dt>Service</dt><dd>{a.category}</dd><dt>Assessment owner</dt><dd>{userName(a.owner)}</dd>
        </dl>
        <div className={'outcome ' + bt}>
          <div className="row" style={{ gap: 18 }}><Ring pct={D.assurance} size={96} /><div><div className="eyebrow">Assessment status</div><div className="big">{D.overall}</div></div></div>
          <p>{D.openCount ? 'Potential gaps identified. Further evidence and assessment required.' : D.overall.startsWith('REVIEW') ? 'No open gaps. Submitted evidence is awaiting reviewer verification.' : 'No open gaps. Evidence remains subject to periodic review.'} Assurance score {D.assurance}/100.</p>
        </div>
        <div><h2 className="serif" style={{ fontSize: 21, marginBottom: 12 }}>The four operational engines</h2><EngineStrip /></div>
        <div className="grid g5">
          <Stat n={D.reqs.length} l="requirements assessed" />
          <Stat n={an.clauses.length} l="contract clauses analysed" />
          <Stat n={an.relevant.length} l="relevant clauses" />
          <Stat n={an.obligations.length} l="obligations identified" />
          <Stat n={an.subprocessors.length} l="sub-processors identified" />
          <Stat n={xfers} l={'international ' + (xfers === 1 ? 'transfer' : 'transfers') + ' identified'} />
          <Stat n={matIssues} l={'material issues identified' + (openNow !== matIssues ? ' · ' + openNow + ' open now' : '')} />
          <Stat n={matActs} l={'actions from material issues' + (delActs ? ' · +' + delActs + ' delivery' : '')} />
          <Stat n={D.evidence.length} l="evidence items" />
          <Stat n={gapsId} l={'evidence gaps identified' + (D.evidenceGaps !== gapsId ? ' · ' + D.evidenceGaps + ' outstanding' : '')} />
        </div>
        <KeyFindings />
        <TraceabilityTable />
        {a.baseline ? <Reassessment /> : null}
        <div className="callout"><b>Governance evidence.</b><span>{a.audit.length} logged decisions, each with actor, timestamp, rule reference and rule base {RULEBASE_VERSION}. <button className="link" data-act="auditTab" onClick={act.auditTab}>Open audit trail</button></span></div>
        <p className="note">OffshoreAssure outputs are risk indicators that support the organisation's decision. They are not legal advice and do not determine compliance. Scores, statuses and the delivery feed are prototype / sample outputs.</p>
      </div>
    </>
  );
}
