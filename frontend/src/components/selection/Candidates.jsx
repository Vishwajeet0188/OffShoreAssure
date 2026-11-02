import { Badge } from '../common/Badges.jsx';
import { confirmAction } from '../extras/ConfirmDialog.jsx';
import { CHECK_TONE, CHECK_WORD, SOURCE_LABEL, countryList, expectedStatus, vendorDocumentUrl } from '../../lib/selection.js';
import { EligibilityBadge, FitTable, ReviewBadge, ScoreBar } from './FitChecks.jsx';

const result = (fit, id) => fit.checks.find(c => c.id === id);
const Cell = ({ check }) => check ? <><span className={'b ' + CHECK_TONE[check.result]}>{CHECK_WORD[check.result]}</span><div className="note vs-why">{check.detail}</div></> : null;

/* Step 7: directory candidates side by side, ranked by fit score. */
export function DirectoryComparison({ list, names, selectedId, busy, onRemove }) {
  return (
    <div className="tw"><table data-table="compare">
      <thead><tr><th>#</th><th>Vendor</th><th>Fit score</th><th>Identity</th><th>Service fit</th><th>Geography</th><th>Evidence</th><th>Gaps and exceptions</th><th>Eligibility and next action</th><th></th></tr></thead>
      <tbody>{list.map(v => {
        const gaps = [...v.fit.exceptions, ...v.fit.gaps, ...v.fit.missing];
        return (
          <tr key={v.id} data-vendor={v.name}>
            <td className="mono">{v.rank ?? '–'}</td>
            <td><b>{v.name}</b><div className="note">{SOURCE_LABEL[v.candidateSource]} · <span className="mono">{v.id.slice(0, 8)}</span></div><div className="note">{countryList(v.deliveryCountries, names)}</div></td>
            <td>{v.rank ? <ScoreBar score={v.fit.score} /> : <span className="note">Not ranked</span>}<div className="note vs-why">{v.rankRationale}</div></td>
            <td><Cell check={result(v.fit, 'identity')} /></td>
            <td><Cell check={result(v.fit, 'service')} /></td>
            <td><Cell check={result(v.fit, 'delivery')} /></td>
            <td><Cell check={result(v.fit, 'certifications')} /></td>
            <td>{gaps.length ? <ul className="vs-gaps">{gaps.map(g => <li key={g.id}>{g.check}</li>)}</ul> : <span className="note">None</span>}</td>
            <td><EligibilityBadge fit={v.fit} />{selectedId === v.id ? <div><span className="b b-plum" style={{ marginTop: 4 }}>Selected</span></div> : null}<div className="note vs-why">{v.fit.nextAction}</div></td>
            <td style={{ textAlign: 'right' }}>{selectedId === v.id ? null : <RemoveButton v={v} busy={busy} onRemove={onRemove} />}</td>
          </tr>);
      })}</tbody>
    </table></div>
  );
}

/* Step 7 for a buyer-added or reused vendor: a single-vendor summary, never a made-up rank. */
export function SingleVendorSummary({ v, names, reference, selectedId, busy, onRemove }) {
  const fit = v.fit; const vendor = v.vendor;
  const status = expectedStatus(fit);
  const conditions = [
    ...(v.candidateSource === 'BUYER_PROVIDED' || fit.reviewStatus !== 'VERIFIED'
      ? ['Verify legal entities and delivery locations.', 'Complete vendor assurance questionnaire.', 'Review relevant contract and processing terms.', 'Confirm subprocessors and transfer routes.'] : []),
    // The four standard items already cover identity and the questionnaire for an unverified vendor.
    ...fit.missing.filter(m => fit.reviewStatus === 'VERIFIED' || !['identity', 'readiness'].includes(m.id)).map(m => m.request).filter(Boolean)
  ];
  return (
    <article className="vs-single" data-vendor={v.name} data-source={v.candidateSource}>
      <div className="vs-single-head">
        <div>
          <div className="eyebrow">{v.candidateSource === 'BUYER_PROVIDED' ? 'Buyer-added vendor' : 'Existing vendor'} · {status === 'SELECTION_BLOCKED' ? 'Excluded' : fit.reviewStatus === 'VERIFIED' ? 'Verified' : 'Verification pending'}</div>
          <h3>{v.name}{vendor.tradingName ? <span className="note"> · trading as {vendor.tradingName}</span> : null}</h3>
          <div className="note">Source: {SOURCE_LABEL[v.candidateSource]} · Vendor ID <span className="mono">{v.id.slice(0, 8)}</span> · profile v{vendor.profileVersion}</div>
        </div>
        <div className="row"><ReviewBadge fit={fit} /><EligibilityBadge fit={fit} />
          {selectedId === v.id ? <span className="b b-plum">Selected</span> : <RemoveButton v={v} busy={busy} onRemove={onRemove} />}</div>
      </div>
      <dl className="kv vs-kv">
        <dt>Registered country</dt><dd>{names[vendor.registeredCountry] || vendor.registeredCountry}</dd>
        <dt>Service fit</dt><dd>{vendor.services.join(', ')}: {CHECK_WORD[result(fit, 'service').result].toLowerCase()}</dd>
        <dt>Delivery countries</dt><dd>{countryList(vendor.deliveryCountries, names)}</dd>
        <dt>Contract</dt><dd>{vendor.documents.contract ? 'Uploaded' : 'Not uploaded'}{vendor.documents.files.map(d => <span key={d.id}> · <a className="link" href={vendorDocumentUrl(reference, v.id, d.id)}>{d.type === 'dpa' ? 'DPA' : 'Contract'}: {d.fileName}</a></span>)}</dd>
        <dt>Security evidence</dt><dd>{vendor.certifications.length ? `${vendor.certifications.join(', ')} (claimed, pending evidence)` : 'Pending'}</dd>
        {vendor.contact ? <><dt>Contact</dt><dd>{vendor.contact.name} · {vendor.contact.email}{vendor.contact.role ? ` · ${vendor.contact.role}` : ''}</dd></> : null}
        {v.reuse ? <><dt>Reuse</dt><dd>{v.reuse.serviceCategory}: {v.reuse.scopeDescription}<div className="note">Reason: {v.reuse.reviewReason}{v.reuse.materialChanges.length ? ` · ${v.reuse.materialChanges.length} material change(s): ${v.reuse.materialChanges.map(c => c.label).join(', ')}` : ''}</div></dd></> : null}
      </dl>
      {conditions.length ? <div className="vs-required"><b>Required before approval</b><ul>{[...new Set(conditions)].map(c => <li key={c}>{c}</li>)}</ul></div> : null}
      <details className="vs-details"><summary>All nine checks (step 6)</summary><FitTable fit={fit} /></details>
      <p className="note" style={{ margin: 0 }}>Next: {fit.nextAction}</p>
    </article>
  );
}

function RemoveButton({ v, busy, onRemove }) {
  return <button className="btn sm" disabled={busy === 'rm' + v.id} data-act="remove"
    onClick={async () => { if (await confirmAction({ title: `Remove ${v.name} from the candidates?`, message: 'You can add the vendor again later.', confirmLabel: 'Remove' })) onRemove(v); }}>Remove</button>;
}

export const StatusBadge = ({ status, labels }) => <Badge s={labels[status][0]} label={labels[status][1]} />;
