/* Stage 1 · Step 4 — Requirement profile and gaps (Engine → Buyer).
   Input: the stored requirement profile (latest version) and its validation findings.
   Output: the 10 fields of the "Information Required" box: Assessment ID, service, buyer, jurisdictions, data classification,
   assurance controls, initial risk tier, missing items, required next actions and current status.
   Boundary: a profile can be ready for vendor selection while later-stage evidence is outstanding, but it is never shown as compliant.
   PROVISIONAL: which items count as "missing" and the status rules are part of rule pack RP-2026.10-S1-draft (pending the client). */
import { UNKNOWN } from '../requirements/fields.js';
import { countryName } from '../reference/countries.js';
import { clarifications, contradictions, processingCountries } from './rulepack.js';

const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const names = codes => codes.filter(c => c !== UNKNOWN).map(countryName);

/* What the buyer must confirm (answers) and what must be evidenced later (mostly by the vendor). */
const CONFIRM = {
  personalData: 'Confirm whether personal data will be processed.',
  specialCategory: 'Confirm whether special-category data is involved.',
  criminalOffence: 'Confirm whether criminal-offence data is involved.',
  storageCountries: 'Confirm where the data will be stored (a storage location is "Unknown").',
  remoteAccessCountries: 'Confirm the countries the service will be accessed from (a remote access location is "Unknown").',
  privilegedAccess: 'Confirm whether the vendor needs privileged (administrator) access.',
  cloudServices: 'Confirm whether cloud services are involved.'
};

export function missingItems(d) {
  const items = [];
  // 1. Answers the buyer still has to confirm (from the validation findings).
  for (const c of clarifications(d)) items.push({ kind: 'answer', owner: 'Buyer', stage: 1, field: c.field, text: CONFIRM[c.field] || c.reason, why: c.reason });
  for (const c of contradictions(d)) items.push({ kind: 'answer', owner: 'Buyer', stage: 1, field: c.fields[0], text: 'Check: ' + c.message, why: 'Contradictory answers must be corrected before the profile can be relied on.' });

  // 2. Evidence that is not available yet and is collected in later stages.
  const abroad = codes => [...new Set((codes || []).filter(c => c !== UNKNOWN && c !== d.buyerCountry))];
  if (d.cloudServices === 'Yes')
    items.push({ kind: 'evidence', owner: 'Vendor', stage: 3, text: 'Final cloud hosting and backup locations.', why: 'Cloud services are involved; the exact hosting and backup regions decide the transfer review.' });
  const support = abroad(d.remoteAccessCountries).length ? abroad(d.remoteAccessCountries) : abroad(d.preferredCountries);
  if (support.length)
    items.push({ kind: 'evidence', owner: 'Vendor', stage: 3, text: `Confirmed legal entities providing ${list(support.map(countryName))} support.`, why: 'ASS-001 Legal Entity Verification: who delivers the service in each country.' });
  if (['Allowed', 'Approval required'].includes(d.subprocessors) || d.cloudServices === 'Yes')
    items.push({ kind: 'evidence', owner: 'Vendor', stage: 3, text: 'Complete subprocessor chain.', why: (d.subprocessors === 'Prohibited' ? 'Subprocessors are prohibited, but a cloud provider is involved' : 'Subprocessors: ' + d.subprocessors.toLowerCase()) + ' (ASS-006).' });
  return items;
}

/* Next actions in diagram order. stage = the stage where the action happens. */
export function nextActions(d, derived, controls, items, selectedVendor = null) {
  const out = [];
  const answers = items.filter(i => i.kind === 'answer');
  if (answers.length) out.push({ stage: 1, owner: 'Buyer', text: `Correct the answers: ${answers.length} item${answers.length === 1 ? '' : 's'} to confirm or fix ("Correct answers" creates a new profile version).`, action: 'correct' });
  out.push(selectedVendor ? { stage: 2, owner: 'Buyer', text: `Vendor selected: ${selectedVendor}.`, done: true } : { stage: 2, owner: 'Buyer', text: 'Select a vendor or invite one to the assessment.' });
  if (derived.vendorAssessmentRequired) out.push({ stage: 3, owner: 'Vendor', text: `Vendor compliance assessment against the ${controls.length} applicable assurance control${controls.length === 1 ? '' : 's'}.`, controls: controls.map(c => c.id) });
  const enhanced = derived.riskTier === 'CRITICAL' || derived.reasons?.riskTolerance;
  if (enhanced) out.push({ stage: 3, owner: 'OffshoreAssure', text: derived.reasons?.riskTolerance || 'Enhanced assessment: the preliminary risk tier is critical.' });
  if (derived.contractReviewRequired) out.push({ stage: 4, owner: 'Buyer', text: `Contract review (${derived.reasons.contractReview}).` });
  if (derived.transferReviewRequired) {
    const c = names(processingCountries(d).known);
    out.push({ stage: 6, owner: 'OffshoreAssure', text: `Transfer assessment for ${c.length ? list(c) : 'the unconfirmed locations'}.` });
  }
  return out;
}

/* Current status. Never "compliant": at most "ready for vendor selection". */
export function currentStatus(items, selectedVendor = null) {
  const answers = items.filter(i => i.kind === 'answer'), evidence = items.filter(i => i.kind === 'evidence');
  if (items.some(i => i.kind === 'answer' && i.text.startsWith('Check:')))
    return { code: 'INFORMATION_REQUIRED', label: 'Information required', detail: 'Some answers contradict each other. Correct them before selecting a vendor.' };
  if (selectedVendor)
    return { code: 'VENDOR_SELECTED', label: 'Vendor selected · compliance assessment next', detail: `Stage 2 is complete: ${selectedVendor} is the selected vendor. Next is Stage 3, the compliance assessment.${answers.length ? ' Some answers are still unknown, so the risk tier stays provisional.' : ''} This is not a compliance conclusion.` };
  if (answers.length)
    return { code: 'READY_PRELIMINARY', label: 'Ready for vendor selection · preliminary', detail: 'Vendor selection can start. Some answers are unknown, so the risk tier and privacy conclusion stay provisional until they are confirmed.' };
  if (evidence.length)
    return { code: 'READY_EVIDENCE_OUTSTANDING', label: 'Ready for vendor selection', detail: 'Later-stage evidence is outstanding. This is not a compliance conclusion.' };
  return { code: 'READY', label: 'Ready for vendor selection', detail: 'No gaps found in the requirement. This is not a compliance conclusion.' };
}

/* The 10 output fields. a = assessment row (latest derived fields), d = answers of the latest profile version, controls from that profile. */
export function requirementSummary({ a, d, derived, controls, profileVersion, buyerName, selectedVendor = null }) {
  const items = missingItems(d);
  const { known, unknown } = processingCountries(d);
  return {
    assessmentId: a.reference,
    service: { title: d.assessmentTitle, code: a.service_code, category: d.serviceCategory, criticality: d.serviceCriticality, deliveryModel: d.deliveryModel },
    buyer: { name: buyerName || d.buyerLegalName, legalName: d.buyerLegalName, country: d.buyerCountry, sector: d.buyerSector },
    jurisdictions: {
      buyerCountry: d.buyerCountry, processingCountries: known, unknownLocations: unknown,
      storageCountries: d.storageCountries || [], remoteAccessCountries: d.remoteAccessCountries || [],
      preferredCountries: d.preferredCountries || [], restrictedCountries: d.restrictedCountries || [], packs: a.jurisdiction_packs,
      names: Object.fromEntries([d.buyerCountry, ...(d.storageCountries || []), ...(d.remoteAccessCountries || []), ...(d.preferredCountries || []), ...(d.restrictedCountries || [])]
        .filter(Boolean).map(c => [c, c === UNKNOWN ? 'Unknown' : countryName(c)]))
    },
    dataClassification: a.data_classification,
    assuranceControls: controls.map(c => ({ id: c.id, name: c.name, buyerRequested: !!c.buyerRequested })),
    initialRiskTier: { tier: a.risk_tier, provisional: !!derived.riskProvisional, reason: derived.reasons?.riskTier },
    reviews: { dataProtection: ['Yes', 'Unknown'].includes(d.personalData), vendorAssessment: a.vendor_assessment_required, contractReview: a.contract_review_required, transferReview: a.transfer_review_required },
    missingItems: items,
    requiredNextActions: nextActions(d, derived, controls, items, selectedVendor),
    currentStatus: currentStatus(items, selectedVendor),
    selectedVendor,
    profileVersion,
    note: 'Preliminary screening from the requirement. It is not a compliance or legal conclusion.'
  };
}
