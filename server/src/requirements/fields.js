/* Stage 1 · Step 1: the 32 requirement fields (Moumita's "Stage 1 Inputs and Logics"), in six groups.
   This file is the single source of truth: the API serves it to the form, and uses it to validate drafts and submissions.
   Conditions are plain data so the browser can evaluate them too:
     { f: 'field', in: [...] }   field value is one of the list (for multi-selects: contains one of them)
     { f: 'field', filled: true } field has a value
     { any: [cond, ...] }         at least one condition holds                                                       */
import { COUNTRY_CODES, CURRENCIES, countryName } from '../reference/countries.js';
import { SECTORS, SERVICE_CATEGORIES } from '../validation.js';

export const UNKNOWN = 'UNKNOWN';
const TRI = ['Yes', 'No', 'Unknown'];
const PD_YES_OR_UNKNOWN = { f: 'personalData', in: ['Yes', 'Unknown'] };

export const GROUPS = [
  { id: 'buyer', title: 'Buyer', lead: 'Who is buying the service.', fields: [
    { key: 'buyerLegalName', label: 'Buyer legal name', type: 'text', min: 2, max: 200, required: true, example: 'UK Company Ltd' },
    { key: 'companyRegNumber', label: 'Company registration number', type: 'text', max: 20, requiredIf: { f: 'buyerCountry', in: ['GB'] },
      help: 'Required for UK companies (Companies House number, e.g. 01234567 or SC123456).', example: '01234567' },
    { key: 'buyerCountry', label: 'Buyer country', type: 'country', required: true },
    { key: 'buyerSector', label: 'Industry / sector', type: 'select', options: SECTORS, required: true },
    { key: 'buyerContactEmail', label: 'Buyer contact email', type: 'email', required: true }
  ] },
  { id: 'service', title: 'Service', lead: 'What is being outsourced and why.', fields: [
    { key: 'assessmentTitle', label: 'Assessment title', type: 'text', min: 5, max: 150, required: true, example: 'Global IT Support' },
    { key: 'serviceCategory', label: 'Service category', type: 'select', required: true,
      options: SERVICE_CATEGORIES },
    { key: 'serviceDescription', label: 'Service description', type: 'textarea', min: 10, max: 3000, required: true,
      help: 'Describe the actual activities the supplier will perform.', example: '24/7 service desk, incident handling and user account administration' },
    { key: 'businessObjective', label: 'Business objective / outsourcing purpose', type: 'textarea', min: 10, max: 2000, required: true, example: 'Cost reduction and service continuity' },
    { key: 'serviceCriticality', label: 'Service criticality', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'], required: true },
    { key: 'deliveryModel', label: 'Service delivery model', type: 'select', options: ['Remote', 'Onsite', 'Hybrid'], required: true },
    { key: 'supportHours', label: 'Required support hours', type: 'select', options: ['Business hours', '24/7', 'Custom'], required: true }
  ] },
  { id: 'commercial', title: 'Commercial & geography', lead: 'Where the work may happen, timing and budget.', fields: [
    { key: 'preferredCountries', label: 'Preferred supplier countries', type: 'countries' },
    { key: 'restrictedCountries', label: 'Restricted countries', type: 'countries', help: 'Countries where the service must not be delivered from. Conflicts with other answers are flagged.' },
    { key: 'startDate', label: 'Planned start date', type: 'date', requiredIf: { f: 'contractDuration', filled: true }, help: 'Required when a contract duration is given.' },
    { key: 'contractDuration', label: 'Contract duration (months)', type: 'int', minValue: 1, maxValue: 120 },
    { key: 'estimatedBudget', label: 'Estimated annual budget', type: 'decimal', minValue: 0 },
    { key: 'currency', label: 'Currency', type: 'currency', requiredIf: { f: 'estimatedBudget', filled: true }, help: 'Required when a budget is given.' }
  ] },
  { id: 'personal', title: 'Personal data', lead: 'Whether the supplier will handle personal data. "Unknown" is allowed but blocks the final privacy conclusion.', fields: [
    { key: 'personalData', label: 'Personal data involved', type: 'tri', required: true },
    { key: 'dataSubjectCategories', label: 'Data-subject categories', type: 'multiselect', showIf: PD_YES_OR_UNKNOWN, requiredIf: { f: 'personalData', in: ['Yes'] },
      options: ['Employees', 'Customers', 'Prospective customers', 'Suppliers / contractors', 'Patients', 'Children', 'Members of the public', 'Other'] },
    { key: 'personalDataCategories', label: 'Personal-data categories', type: 'multiselect', showIf: PD_YES_OR_UNKNOWN, requiredIf: { f: 'personalData', in: ['Yes'] },
      options: ['Names', 'Contact details (email, phone)', 'Ticket / case records', 'Identification numbers', 'Financial / payment data', 'Employment / HR records', 'Location data', 'Online identifiers (IP, device)', 'Other'] },
    { key: 'specialCategory', label: 'Special-category data', type: 'tri', showIf: PD_YES_OR_UNKNOWN, requiredIf: { f: 'personalData', in: ['Yes'] },
      help: 'Health, ethnicity, religion, biometrics, trade union, sexual orientation, etc. "Yes" triggers additional review.' },
    { key: 'criminalOffence', label: 'Criminal-offence data', type: 'tri', showIf: PD_YES_OR_UNKNOWN, requiredIf: { f: 'personalData', in: ['Yes'] }, help: '"Yes" triggers a separate legal review.' },
    { key: 'dataVolume', label: 'Approximate data volume (records)', type: 'int', minValue: 0, showIf: PD_YES_OR_UNKNOWN, example: '10000' }
  ] },
  { id: 'access', title: 'Access, locations & suppliers', lead: 'Which systems the supplier reaches, from where, and where data is stored.', fields: [
    { key: 'privilegedAccess', label: 'Privileged access required', type: 'tri', required: true, help: '"Unknown" triggers a clarification request.' },
    { key: 'systemsAccessed', label: 'Systems accessed', type: 'multiselect', withOther: true,
      requiredIf: { any: [{ f: 'privilegedAccess', in: ['Yes'] }, { f: 'deliveryModel', in: ['Remote', 'Hybrid'] }] },
      help: 'Required when privileged or remote access is involved.',
      options: ['Service desk / ticketing', 'Email & collaboration', 'Identity / directory (AD, Entra ID)', 'Endpoints / devices', 'Servers & infrastructure', 'Cloud consoles', 'Business applications (ERP, CRM)', 'Databases', 'Network & security tools', 'Other'] },
    { key: 'storageCountries', label: 'Data storage locations', type: 'countries', allowUnknown: true, requiredIf: { f: 'personalData', in: ['Yes'] },
      help: 'Where data is stored or hosted. "Unknown" is allowed for now but must be clarified.', example: 'United States' },
    { key: 'remoteAccessCountries', label: 'Remote access countries', type: 'countries', allowUnknown: true, requiredIf: { f: 'deliveryModel', in: ['Remote', 'Hybrid'] },
      help: 'Where supplier staff access systems or data from (separate from storage).', example: 'Poland, India, Philippines' },
    { key: 'subprocessors', label: 'Subprocessors permitted', type: 'select', options: ['Allowed', 'Approval required', 'Prohibited'], required: true },
    { key: 'cloudServices', label: 'Cloud services involved', type: 'tri', required: true, help: '"Yes" adds a cloud questionnaire later in the assessment.' }
  ] },
  { id: 'assurance', title: 'Assurance', lead: 'What the buyer expects the supplier to demonstrate.', fields: [
    { key: 'assuranceRequirements', label: 'Assurance requirements', type: 'multiselect', required: true, minItems: 1,
      options: ['ISO 27001 certification', 'SOC 2 Type II report', 'Cyber Essentials / Plus', 'Multi-factor authentication (MFA)', 'Encryption at rest and in transit', 'Business continuity & disaster recovery plan',
        'Penetration testing', 'Vulnerability & patch management', 'Staff screening & training', 'Incident notification', 'Cyber / professional indemnity insurance', 'Audit rights', 'Data return & deletion on exit'] },
    { key: 'riskTolerance', label: 'Risk tolerance', type: 'select', options: ['Low', 'Medium', 'High'], required: true }
  ] }
];

export const FIELDS = GROUPS.flatMap(g => g.fields.map(f => ({ ...f, group: g.id })));
export const FIELD_COUNT = FIELDS.length; // 32

/* Documents requested at this stage (all optional). */
export const DOC_TYPES = [
  ['requirements_document', 'Outsourcing requirements document'],
  ['service_description', 'Service description'],
  ['data_inventory', 'Preliminary data inventory'],
  ['data_flow_diagram', 'Preliminary data-flow diagram'],
  ['security_requirements', 'Security requirements document'],
  ['procurement_policy', 'Internal outsourcing / procurement policy']
];
export const DOC_RULES = {
  maxBytes: 10 * 1024 * 1024,
  extensions: { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain' }
};

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UK_COMPANY = /^([A-Z]{2}\d{6}|\d{8})$/;

/* Normalises one value; returns [value] or [undefined, error message]. Empty values come back as undefined. */
function clean(f, raw, d) {
  if (isEmpty(raw)) return [undefined];
  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (f.type) {
    case 'text': case 'textarea': {
      if (typeof s !== 'string') return [undefined, 'Enter text.'];
      let v = s;
      if (f.key === 'companyRegNumber') {
        v = s.replace(/\s+/g, '').toUpperCase();
        if (d.buyerCountry === 'GB' && !UK_COMPANY.test(v)) return [undefined, 'Enter a UK company number: 8 digits, or 2 letters and 6 digits (e.g. SC123456).'];
      }
      if (f.min && v.length < f.min) return [undefined, `Enter at least ${f.min} characters.`];
      if (f.max && v.length > f.max) return [undefined, `Use at most ${f.max} characters (currently ${v.length}).`];
      return [v || undefined];
    }
    case 'email': return typeof s === 'string' && s.length <= 254 && EMAIL.test(s) ? [s.toLowerCase()] : [undefined, 'Enter a valid email address.'];
    case 'country': return COUNTRY_CODES.includes(s) ? [s] : [undefined, 'Choose a valid country.'];
    case 'currency': return CURRENCIES.includes(String(s).toUpperCase()) ? [String(s).toUpperCase()] : [undefined, 'Choose a valid ISO 4217 currency.'];
    case 'select': return f.options.includes(s) ? [s] : [undefined, 'Choose one of the listed options.'];
    case 'tri': return TRI.includes(s) ? [s] : [undefined, 'Choose Yes, No or Unknown.'];
    case 'multiselect': {
      if (!Array.isArray(s) || s.some(x => !f.options.includes(x))) return [undefined, 'Choose from the listed options.'];
      return [[...new Set(s)]];
    }
    case 'countries': {
      if (!Array.isArray(s)) return [undefined, 'Choose countries from the list.'];
      const ok = s.every(c => COUNTRY_CODES.includes(c) || (f.allowUnknown && c === UNKNOWN));
      if (!ok) return [undefined, 'Choose valid countries.'];
      const v = [...new Set(s)];
      if (v.includes(UNKNOWN) && v.length > 1) return [v.filter(c => c !== UNKNOWN).concat(UNKNOWN)];
      return [v];
    }
    case 'date': {
      if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return [undefined, 'Enter a date as YYYY-MM-DD.'];
      const dt = new Date(s + 'T00:00:00Z');
      if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== s) return [undefined, 'Enter a real calendar date.'];
      if (dt.getUTCFullYear() < 2000 || dt.getUTCFullYear() > 2100) return [undefined, 'Enter a date between 2000 and 2100.'];
      return [s];
    }
    case 'int': case 'decimal': {
      const n = typeof s === 'number' ? s : Number(String(s).replace(/,/g, ''));
      if (!Number.isFinite(n)) return [undefined, 'Enter a number.'];
      if (f.type === 'int' && !Number.isInteger(n)) return [undefined, 'Enter a whole number.'];
      if (f.type === 'decimal' && Math.round(n * 100) !== n * 100) return [undefined, 'Use at most 2 decimal places.'];
      if (f.minValue != null && n < f.minValue) return [undefined, f.minValue === 0 ? 'Cannot be negative.' : `Must be at least ${f.minValue}.`];
      if (f.maxValue != null && n > f.maxValue) return [undefined, `Must be at most ${f.maxValue}.`];
      return [n];
    }
    default: return [undefined, 'Unsupported field.'];
  }
}

/* Validates a requirement.
   Returns { values, errors, missing, flags, completion }:
   - errors:  invalid values (rejected in drafts too)
   - missing: mandatory or conditional fields still empty (only block submission)
   - flags:   boundary conditions the buyer should see (conflicts, unknowns, enhanced assessment)          */
export function validateRequirement(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const values = {}; const errors = {};
  // first pass with raw values so conditions referencing other fields work
  const view = { ...raw };
  for (const f of FIELDS) {
    if (!isVisible(f, view)) continue;
    const [v, err] = clean(f, raw[f.key], view);
    if (err) errors[f.key] = err; else if (v !== undefined) values[f.key] = v;
  }
  const other = typeof raw.systemsAccessedOther === 'string' ? raw.systemsAccessedOther.trim() : '';
  if (other.length > 300) errors.systemsAccessedOther = 'Use at most 300 characters.';
  else if (other && values.systemsAccessed?.includes('Other')) values.systemsAccessedOther = other;
  if (values.systemsAccessed?.includes('Other') && !values.systemsAccessedOther && !errors.systemsAccessedOther) errors.systemsAccessedOther = 'Name the other systems.';

  const missing = [];
  for (const f of FIELDS) {
    if (!isRequired(f, values)) continue;
    const v = values[f.key];
    if (isEmpty(v) && !errors[f.key]) missing.push({ field: f.key, label: f.label, group: f.group, reason: f.required ? 'Required' : 'Required because of another answer' });
    else if (f.minItems && Array.isArray(v) && v.length < f.minItems) missing.push({ field: f.key, label: f.label, group: f.group, reason: `Choose at least ${f.minItems}` });
  }
  const filled = FIELDS.filter(f => isVisible(f, values) && !isEmpty(values[f.key])).length;
  const relevant = FIELDS.filter(f => isVisible(f, values)).length;
  return { values, errors, missing, flags: boundaryFlags(values), completion: { filled, relevant } };
}

/* Step 1 boundary conditions (the engine's later steps decide the formal outcome). */
export function boundaryFlags(d) {
  const flags = [];
  const restricted = d.restrictedCountries || [];
  const names = list => list.map(countryName).join(', ');
  const clash = (key, label) => {
    const hit = (d[key] || []).filter(c => restricted.includes(c));
    if (hit.length) flags.push({ code: 'country_conflict', level: 'warning', field: key, message: `${names(hit)} ${hit.length > 1 ? 'are' : 'is'} both restricted and listed under ${label}.` });
  };
  clash('preferredCountries', 'preferred countries'); clash('storageCountries', 'data storage locations'); clash('remoteAccessCountries', 'remote access countries');
  if (d.personalData === 'Unknown') flags.push({ code: 'personal_data_unknown', level: 'warning', field: 'personalData', message: 'Personal data status is unknown: a preliminary assessment is possible, but no final privacy conclusion can be given until it is confirmed.' });
  for (const [key, label] of [['storageCountries', 'Data storage locations'], ['remoteAccessCountries', 'Remote access countries']])
    if ((d[key] || []).includes(UNKNOWN)) flags.push({ code: 'location_unknown', level: 'warning', field: key, message: `${label} include "Unknown": this must be clarified before the location and transfer review can be finalised.` });
  if (d.privilegedAccess === 'Unknown') flags.push({ code: 'privileged_unknown', level: 'warning', field: 'privilegedAccess', message: 'Privileged access is unknown: a clarification will be requested.' });
  const high = [];
  if (d.serviceCriticality === 'Critical') high.push('critical service');
  if (d.specialCategory === 'Yes') high.push('special-category data');
  if (d.criminalOffence === 'Yes') high.push('criminal-offence data');
  if (high.length) flags.push({ code: 'enhanced_assessment', level: 'info', message: `Enhanced assessment will apply (${high.join(', ')}).` });
  return flags;
}
