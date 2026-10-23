/* Stage 1 · Step 1 helpers. The field definitions come from the API (/api/requirements/form);
   these mirror the server's condition rules so the form can show/hide conditional fields as you type. */
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
import { ApiError, readResponse, unavailableError } from './api.js';

export const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
export function holds(cond, d) {
  if (!cond) return true;
  if (cond.any) return cond.any.some(c => holds(c, d));
  const v = d[cond.f];
  if (cond.filled) return !isEmpty(v);
  if (cond.in) return Array.isArray(v) ? v.some(x => cond.in.includes(x)) : cond.in.includes(v);
  return false;
}
export const isVisible = (f, d) => holds(f.showIf, d);
export const isRequired = (f, d) => isVisible(f, d) && (f.required === true || (f.requiredIf ? holds(f.requiredIf, d) : false));

export const STATUS_LABEL = { draft: ['In progress', 'Draft'], submitted: ['Submitted', 'Submitted'] };

/* Uploads one supporting document (raw body; the server computes the SHA-256). */
export async function uploadDocument(reqId, type, file) {
  let res;
  try {
    res = await fetch(`${BASE}/requirements/${reqId}/documents?type=${encodeURIComponent(type)}&name=${encodeURIComponent(file.name)}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file
    });
  } catch (error) {
    throw unavailableError(0, error.message);
  }
  if (res.status === 413) throw new ApiError(413, { message: 'The file is larger than 10 MB.' });
  return readResponse(res);
}
export const docUrl = (reqId, docId) => `${BASE}/requirements/${reqId}/documents/${docId}`;
export const fmtBytes = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

/* Development only: the worked example from the Stage 1 spec ("Fill example (dev)"). Not included in production builds. */
export const EXAMPLE = import.meta.env.DEV ? {
  buyerLegalName: 'UK Company Ltd', companyRegNumber: '01234567', buyerCountry: 'GB', buyerSector: 'Financial Services',
  assessmentTitle: 'Global IT Support', serviceCategory: 'IT Support',
  serviceDescription: '24/7 service desk, incident handling and user account administration for around 2,000 UK staff. Primary delivery from Poland, with follow-the-sun support from India, Brazil and the Philippines.',
  businessObjective: 'Cost reduction and service continuity.', serviceCriticality: 'High', deliveryModel: 'Remote', supportHours: '24/7',
  preferredCountries: ['PL'], restrictedCountries: [], startDate: '2027-01-04', contractDuration: 36, estimatedBudget: 480000, currency: 'GBP',
  personalData: 'Yes', dataSubjectCategories: ['Employees', 'Customers'], personalDataCategories: ['Names', 'Contact details (email, phone)', 'Ticket / case records'],
  specialCategory: 'No', criminalOffence: 'No', dataVolume: 10000,
  privilegedAccess: 'Yes', systemsAccessed: ['Service desk / ticketing', 'Identity / directory (AD, Entra ID)', 'Endpoints / devices'],
  storageCountries: ['US'], remoteAccessCountries: ['PL', 'IN', 'BR', 'PH'], subprocessors: 'Approval required', cloudServices: 'Yes',
  assuranceRequirements: ['ISO 27001 certification', 'Multi-factor authentication (MFA)', 'Business continuity & disaster recovery plan'], riskTolerance: 'Medium'
} : null;
