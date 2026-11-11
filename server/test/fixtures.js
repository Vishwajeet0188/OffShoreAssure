/* Shared test data. */
/* The worked example from the Stage 1 spec (UK Company Ltd, IT Support). */
export const EXAMPLE = {
  buyerLegalName: 'UK Company Ltd',
  companyRegNumber: '01234567',
  buyerCountry: 'GB',
  buyerSector: 'Financial Services',
  buyerContactEmail: 'sarah@ukcompany.example',
  assessmentTitle: 'Global IT Support',
  serviceCategory: 'IT Support',
  serviceDescription: '24/7 service desk, incident handling and user account administration for 2,000 staff.',
  businessObjective: 'Cost reduction and service continuity.',
  serviceCriticality: 'High',
  deliveryModel: 'Remote',
  supportHours: '24/7',
  preferredCountries: ['PL'],
  restrictedCountries: [],
  startDate: '2027-01-04',
  contractDuration: 36,
  estimatedBudget: 480000,
  currency: 'GBP',
  personalData: 'Yes',
  dataSubjectCategories: ['Employees', 'Customers'],
  personalDataCategories: ['Names', 'Contact details (email, phone)', 'Ticket / case records'],
  specialCategory: 'No',
  criminalOffence: 'No',
  dataVolume: 10000,
  privilegedAccess: 'Yes',
  systemsAccessed: ['Service desk / ticketing', 'Identity / directory (AD, Entra ID)'],
  storageCountries: ['US'],
  remoteAccessCountries: ['PL', 'IN', 'BR', 'PH'],
  subprocessors: 'Approval required',
  cloudServices: 'Yes',
  assuranceRequirements: [
    'ISO 27001 certification',
    'Multi-factor authentication (MFA)',
    'Business continuity & disaster recovery plan',
  ],
  riskTolerance: 'Medium',
};

/* ---------- Stage 3 helpers for the later-stage tests ---------- */

/* Step 10: start with the default start fields and the first reviewer. */
export async function startStage3(buyer, ref, extra = {}) {
  const state = (await buyer('GET', `/assessments/${ref}/compliance`)).body;
  return buyer('POST', `/assessments/${ref}/compliance`, {
    assessmentId: state.assessment.id,
    vendorId: state.vendor.id,
    ...state.start.defaults,
    reviewerId: state.start.reviewers[0].id,
    ...extra,
  });
}

/* A complete, positive answer for one control (the worked example's countries). */
export function positiveAnswer(control, data = EXAMPLE) {
  switch (control.answerType) {
    case 'YES_NO_REGISTRATION':
      return { answer: 'Yes', registrationNumber: 'KRS 1' };
    case 'YES_NO_TABLE':
      return { answer: 'Yes', rows: [{ name: 'Amazon Web Services', country: 'US', service: 'Hosting' }] };
    case 'COUNTRIES':
      return {
        countries:
          control.checks.countries === 'storage' ? data.storageCountries : data.remoteAccessCountries,
      };
    case 'HOURS':
      return { rto: 4, rpo: 1 };
    case 'AMOUNT_DATE':
      return { amount: 5000000, currency: 'GBP', expiresOn: '2028-12-31' };
    default:
      return { answer: control.good === 'No' ? 'No' : 'Yes' };
  }
}

/* Step 13: answer every question (overrides by control ID), optionally upload, then submit. */
export async function completeStage3(vendor, ref, { overrides = {}, beforeSubmit } = {}) {
  const d = (await vendor('GET', `/vendor/compliance/${ref}`)).body;
  const answers = {};
  for (const c of d.compliance.questionnaire.controls) answers[c.id] = overrides[c.id] || positiveAnswer(c);
  const saved = await vendor('PUT', `/vendor/compliance/${ref}/answers`, { answers });
  if (saved.status !== 200) throw new Error('answers: ' + JSON.stringify(saved.body));
  if (beforeSubmit) await beforeSubmit(d.compliance.questionnaire);
  return vendor('POST', `/vendor/compliance/${ref}/submit`);
}

/* ---------- Stage 4 helper ---------- */

/* Step 17: upload one contract document with the 11 input fields (defaults: a signed MSA under English law). */
export async function uploadSpecContract(
  buyer,
  ref,
  data,
  { type = 'application/pdf', name = 'contract.pdf', ...meta } = {},
) {
  const d = (await buyer('GET', `/assessments/${ref}/contract`)).body.form.defaults;
  const q = new URLSearchParams({
    name,
    assessmentId: d.assessmentId,
    documentType: 'MSA',
    title: 'IT Support Services Agreement',
    buyerEntity: d.buyerEntity,
    supplierEntity: d.supplierEntity || '',
    governingLaw: 'GB-EAW',
    effectiveOn: '2026-11-01',
    executionStatus: 'SIGNED',
    language: 'en',
    ...meta,
  });
  return buyer('POST', `/assessments/${ref}/contract?${q}`, null, { type, data });
}
