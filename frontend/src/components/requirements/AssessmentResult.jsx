import { CLASS_LABEL, TIER_LABEL, TIER_TONE, STATUS_LABEL, serviceLabel } from '../../lib/assessments.js';
import { fmtTime } from '../../lib/format.js';
import { Badge } from '../common/Badges.jsx';
import { Icon } from '../common/Icon.jsx';

const YesNo = ({ v }) => v ? <span className="b b-coral">Required</span> : <span className="b b-mute">Not required</span>;

/* Stage 1 · Step 2 output: the Assessment ID and the 15 system fields, with the reason for each derived value. */
export default function AssessmentResult({ a, buyerName }) {
  const f = a.findings || {};
  const [st, stLabel] = STATUS_LABEL[a.validationStatus];
  return (
    <section className="card asr" data-section="assessment-result" aria-labelledby="asr-h">
      <div className="asr-head">
        <div>
          <div className="eyebrow">Stage 1 · Step 2 · Validated by the OffshoreAssure engine</div>
          <h2 id="asr-h" className="asr-id mono">{a.reference}</h2>
          <div className="note">Created {fmtTime(a.createdAt)} · requirement version {a.requirementVersion} · rule pack {a.rulePackVersion}</div>
        </div>
        <Badge s={st} label={stLabel} />
      </div>
      <div className="asr-grid">
        <div className="asr-cell"><span className="note">Service</span><b>{serviceLabel(a.serviceCode)}</b><span className="mono note">{a.serviceCode}</span></div>
        <div className="asr-cell"><span className="note">Buyer</span><b>{buyerName}</b></div>
        <div className="asr-cell"><span className="note">Data classification</span><b>{CLASS_LABEL[a.dataClassification]}</b><span className="note">{f.reasons?.dataClassification}</span></div>
        <div className="asr-cell"><span className="note">Preliminary risk tier</span><b><span className={'b b-' + TIER_TONE[a.riskTier]}>{TIER_LABEL[a.riskTier]}{f.riskProvisional ? ' · provisional' : ''}</span></b><span className="note">{f.reasons?.riskTier}</span></div>
      </div>
      <div className="asr-reviews">
        <div><span>Vendor assessment</span><YesNo v={a.vendorAssessmentRequired} /><span className="note">{f.reasons?.vendorAssessment}</span></div>
        <div><span>Contract review</span><YesNo v={a.contractReviewRequired} /><span className="note">{f.reasons?.contractReview}</span></div>
        <div><span>Transfer review</span><YesNo v={a.transferReviewRequired} /><span className="note">{f.reasons?.transferReview}</span></div>
      </div>
      {f.reasons?.riskTolerance ? <div className="rq-flag info"><Icon n="shield" s={16} /><span>{f.reasons.riskTolerance}</span></div> : null}
      {a.missingFields?.length ? (
        <div className="asr-block"><h3>Clarification needed</h3><ul>{a.missingFields.map(m => <li key={m.field}><b>{m.label}</b> — {m.reason}</li>)}</ul></div>) : null}
      {f.contradictions?.length ? (
        <div className="asr-block warn"><h3>Answers to check</h3><ul>{f.contradictions.map((c, i) => <li key={i}>{c.message}</li>)}</ul></div>) : null}
      {f.duplicateOf ? <div className="rq-flag warning"><Icon n="alert" s={16} /><span>This looks similar to {f.duplicateOf} (same title and service in the last 30 days).</span></div> : null}
      <div className="asr-block"><h3>Jurisdiction and rule packs selected</h3><div className="row" style={{ gap: 6 }}>{a.jurisdictionPacks.map(p => <span key={p} className="rid">{p}</span>)}</div></div>
      {f.legalScreening?.length ? (
        <div className="asr-block"><h3>Possibly applicable provisions</h3>
          <ul className="asr-legal">{f.legalScreening.map(l => <li key={l.provision}><b>{l.provision}</b><span className="note">{l.why}</span></li>)}</ul>
          <p className="note">{f.note}</p></div>) : null}
    </section>
  );
}
