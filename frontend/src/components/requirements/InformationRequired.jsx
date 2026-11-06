import { CLASS_LABEL, TIER_LABEL, TIER_TONE, serviceLabel } from '../../lib/assessments.js';
import { STAGES } from '../../lib/stages.js';
import { Link } from 'react-router-dom';
import { Badge } from '../common/Badges.jsx';
import { Icon } from '../common/Icon.jsx';

/* Status word → badge tone. Never "compliant": the best status is "Ready for vendor selection". */
const STATUS_TONE = {
  INFORMATION_REQUIRED: 'Action required',
  READY_PRELIMINARY: 'Attention',
  READY_EVIDENCE_OUTSTANDING: 'Approved',
  READY: 'Approved',
  VENDOR_SELECTED: 'Complete',
};
const stageName = n => STAGES.find(s => s.n === n)?.title || '';
const Req = ({ v }) =>
  v ? <span className="b b-coral">Required</span> : <span className="b b-mute">Not required</span>;

/* Stage 1 · Step 4 output: the "Information Required" box (10 fields) built by the engine from the latest requirement profile. */
export default function InformationRequired({ s, onCorrect, link = true }) {
  if (!s) return null;
  const j = s.jurisdictions,
    nm = c => j.names?.[c] || c;
  const answers = s.missingItems.filter(m => m.kind === 'answer');
  const evidence = s.missingItems.filter(m => m.kind === 'evidence');
  const abroad = j.processingCountries.map(nm).concat(j.unknownLocations ? ['unconfirmed locations'] : []);
  return (
    <section className="card ir" data-section="information-required" aria-labelledby="ir-h">
      <div className="ir-head">
        <div>
          <div className="eyebrow">
            Stage 1 · Step 4 · Requirement profile and gaps · profile v{s.profileVersion}
          </div>
          <h2 id="ir-h">Information Required</h2>
        </div>
        <Badge s={STATUS_TONE[s.currentStatus.code]} label={s.currentStatus.label} />
      </div>
      <p className="ir-status note" data-status={s.currentStatus.code}>
        {s.currentStatus.detail}
      </p>

      <dl className="ir-facts">
        <div>
          <dt>Requirement assessment</dt>
          <dd>
            <span>
              <span className="mono">{s.assessmentId}</span> · {serviceLabel(s.service.code)}
            </span>
            <span className="note">
              {s.service.title} · {s.service.criticality} criticality · {s.service.deliveryModel}
            </span>
          </dd>
        </div>
        <div>
          <dt>Buyer</dt>
          <dd>
            <span>{s.buyer.name}</span>
            <span className="note">
              {nm(s.buyer.country)} · {s.buyer.sector}
            </span>
          </dd>
        </div>
        <div>
          <dt>Initial risk</dt>
          <dd>
            <span className={'b b-' + TIER_TONE[s.initialRiskTier.tier]}>
              {TIER_LABEL[s.initialRiskTier.tier]}
              {s.initialRiskTier.provisional ? ' · provisional' : ''}
            </span>
            <span className="note">{s.initialRiskTier.reason}</span>
          </dd>
        </div>
        <div>
          <dt>Data classification</dt>
          <dd>
            <span>{CLASS_LABEL[s.dataClassification]}</span>
          </dd>
        </div>
        <div>
          <dt>Data protection</dt>
          <dd>
            {s.reviews.dataProtection ? (
              <span className="b b-coral">Assessment required</span>
            ) : (
              <span className="b b-mute">No personal data</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Transfer review</dt>
          <dd>
            <Req v={s.reviews.transferReview} />
          </dd>
        </div>
        <div>
          <dt>Contract review</dt>
          <dd>
            <Req v={s.reviews.contractReview} />
          </dd>
        </div>
        <div>
          <dt>Vendor assessment</dt>
          <dd>
            <Req v={s.reviews.vendorAssessment} />
          </dd>
        </div>
        <div className="ir-wide">
          <dt>Jurisdictions</dt>
          <dd>
            <span>
              Buyer in {nm(j.buyerCountry)}
              {abroad.length ? (
                <>
                  {' '}
                  · data stored in or accessed from <b>{abroad.join(', ')}</b>
                </>
              ) : (
                ' · no processing outside the buyer’s country'
              )}
            </span>
            {j.restrictedCountries.length ? (
              <span className="note">Restricted: {j.restrictedCountries.map(nm).join(', ')}</span>
            ) : null}
            <div className="row ir-chips">
              {j.packs.map(p => (
                <span key={p} className="rid">
                  {p}
                </span>
              ))}
            </div>
          </dd>
        </div>
        <div className="ir-wide">
          <dt>Assurance controls</dt>
          <dd>
            <span>{s.assuranceControls.length} applicable</span>
            <div className="row ir-chips">
              {s.assuranceControls.map(c => (
                <span
                  key={c.id}
                  className="rid"
                  title={c.name + (c.buyerRequested ? ' (requested by the buyer)' : '')}
                >
                  {c.id}
                </span>
              ))}
            </div>
          </dd>
        </div>
      </dl>

      <div className="ir-block" data-section="missing-items">
        <h3>
          Missing information{' '}
          {s.missingItems.length ? <span className="note">({s.missingItems.length})</span> : null}
        </h3>
        {!s.missingItems.length ? (
          <p className="note" style={{ margin: 0 }}>
            Nothing missing from the requirement.
          </p>
        ) : null}
        {answers.length ? (
          <>
            <div className="ir-sub">To confirm by you</div>
            <ul className="ir-list">
              {answers.map((m, i) => (
                <li key={'a' + i} className="ir-ans">
                  <Icon n="alert" s={15} />
                  <div>
                    <b>{m.text}</b>
                    <span className="note">{m.why}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {evidence.length ? (
          <>
            <div className="ir-sub">Evidence to collect in later stages</div>
            <ul className="ir-list">
              {evidence.map((m, i) => (
                <li key={'e' + i}>
                  <span className="ir-dot" aria-hidden="true" />
                  <div>
                    <b>{m.text}</b>
                    <span className="note">
                      {m.owner} · Stage {m.stage}, {stageName(m.stage)} · {m.why}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="ir-block" data-section="next-actions">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Required next actions</h3>
          {onCorrect && answers.length ? (
            <button className="btn sm primary" data-act="correct-from-gaps" onClick={onCorrect}>
              Correct answers
            </button>
          ) : null}
        </div>
        <ol className="ir-actions">
          {s.requiredNextActions.map((x, i) => (
            <li key={i} className={x.done ? 'done' : ''}>
              <span className="ir-stage">Stage {x.stage}</span>
              <div>
                <b>
                  {x.done ? (
                    <span className="b b-sage" style={{ marginRight: 8 }}>
                      Done
                    </span>
                  ) : null}
                  {x.text}
                </b>
                <span className="note">
                  {x.owner} · {stageName(x.stage)}
                  {x.stage === 2 && link ? (
                    <>
                      {' '}
                      ·{' '}
                      <Link
                        className="link"
                        to={'/vendor-selection/' + s.assessmentId}
                        data-act="open-selection"
                      >
                        {x.done ? 'View vendor selection' : 'Open vendor selection'}
                      </Link>
                    </>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {s.note} The profile can move to vendor selection while later-stage
        evidence is outstanding.
      </p>
    </section>
  );
}
