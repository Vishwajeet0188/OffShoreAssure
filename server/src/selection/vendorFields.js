/* Stage 2 · Step 5 field definitions (client spec "Stage 2 Inputs and Outputs", v2).

   The first choice is vendor_selection_mode:
     DIRECTORY_SEARCH  Route A · search OffshoreAssure's vendor directory (15 inputs)
     ADD_NEW_VENDOR    Route B · add our own vendor (25 onboarding fields)
     EXISTING_VENDOR   Route C · reuse a vendor our organisation added or selected before

   Like the Stage 1 fields, this file is the single source of truth: the API serves the definitions to the
   browser and uses them to validate what comes back. Conditions use the same { f, in } / { any } shape.        */
import { COUNTRIES, COUNTRY_CODES, CURRENCIES } from '../reference/countries.js';
import { SECTORS, SERVICE_CATEGORIES, VENDOR_CERTIFICATIONS, VENDOR_LANGUAGES } from '../validation.js';
import { clean, holds, UNKNOWN } from '../requirements/fields.js';

export const SELECTION_MODES = ['DIRECTORY_SEARCH', 'EXISTING_VENDOR', 'ADD_NEW_VENDOR'];
export const SOURCES = { DIRECTORY_SEARCH: 'DIRECTORY', EXISTING_VENDOR: 'EXISTING', ADD_NEW_VENDOR: 'BUYER_PROVIDED' };

export const DELIVERY_MODELS = ['Remote', 'Onsite', 'Hybrid'];
export const SUPPORT_HOURS = ['Business hours', 'Extended hours', '24/7'];
export const CERTIFICATIONS = VENDOR_CERTIFICATIONS;
export const LANGUAGES = VENDOR_LANGUAGES;
export const SUBPROCESSOR_RULES = ['Allowed', 'Approval required', 'Prohibited'];
export const TRI = ['Yes', 'No', 'Unknown'];

/* ---------- Route A · Directory search: 15 inputs (the Assessment ID comes from the address) ---------- */
export const DIRECTORY_FILTERS = [
  { key: 'search', label: 'Vendor name or service', type: 'text', max: 200, example: 'service desk' },
  { key: 'serviceCategory', label: 'Service category', type: 'select', options: SERVICE_CATEGORIES, required: true },
  { key: 'supplierCountries', label: 'Supplier countries', type: 'countries', required: true, anyCountry: true,
    help: 'Countries the vendor delivers from. Choose "Any country" to see every location.' },
  { key: 'deliveryModel', label: 'Delivery model', type: 'select', options: DELIVERY_MODELS },
  { key: 'industries', label: 'Industry experience', type: 'multiselect', options: SECTORS },
  { key: 'minStaff', label: 'Minimum staff capacity', type: 'int', minValue: 0, maxValue: 1000000, example: '50' },
  { key: 'minYears', label: 'Minimum operating history (years)', type: 'int', minValue: 0, maxValue: 200, example: '3' },
  { key: 'certifications', label: 'Certification preferences', type: 'multiselect', options: CERTIFICATIONS },
  { key: 'assuranceThreshold', label: 'Assurance threshold (fit score 0–100)', type: 'int', minValue: 0, maxValue: 100,
    help: 'Hide vendors whose fit score is below this. The fit score is not a legal compliance score.' },
  { key: 'insuranceAmount', label: 'Insurance requirement', type: 'decimal', minValue: 0, pair: 'insuranceCurrency', example: '1000000' },
  { key: 'supportHours', label: 'Support hours', type: 'select', options: SUPPORT_HOURS },
  { key: 'languages', label: 'Languages', type: 'multiselect', options: LANGUAGES },
  { key: 'budgetMin', label: 'Budget range (annual, from – to)', type: 'decimal', minValue: 0, pair: 'budgetMax', currency: 'budgetCurrency' },
  { key: 'subprocessorRule', label: 'Subprocessor restrictions', type: 'select', options: SUBPROCESSOR_RULES }
];
export const ANY_COUNTRY = 'ANY';

/* ---------- Route B · Add our own vendor: 25 onboarding fields ---------- */
export const CONTACT_ROLES = ['Compliance', 'Legal', 'Sales', 'Director', 'Other'];
export const CONTRACT_RELATIONSHIPS = ['Direct supplier', 'Subprocessor', 'Other'];
export const PROCESSING_ROLES = ['Controller', 'Joint controller', 'Processor', 'Sub-processor', 'Not processing personal data', 'Unknown'];
export const CRITICALITY = ['Low', 'Medium', 'High', 'Critical'];
export const SUPPLIER_STATUS = ['Proposed', 'Current', 'Previously used'];

/* Countries where we know the company-register format. Elsewhere the number is optional. */
const REGISTERS = {
  GB: { pattern: /^([A-Z]{2}\d{6}|\d{8})$/, hint: 'Companies House number: 8 digits, or 2 letters and 6 digits (e.g. SC123456).' },
  IN: { pattern: /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, hint: 'Corporate Identification Number (CIN), 21 characters, e.g. U72200KA2010PTC123456.' },
  IE: { pattern: /^\d{5,6}$/, hint: 'CRO number, 5 or 6 digits.' },
  PL: { pattern: /^\d{10}$/, hint: 'KRS number, 10 digits.' }
};
export const REGISTER_COUNTRIES = Object.keys(REGISTERS);

/* Postcode shapes for the countries where we can check them. */
const POSTCODES = {
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
  IN: /^\d{6}$/,
  PL: /^\d{2}-\d{3}$/,
  US: /^\d{5}(-\d{4})?$/,
  PH: /^\d{4}$/,
  IE: /^[A-Z\d]{3} ?[A-Z\d]{4}$/i
};

// Services where the vendor normally hosts or stores the data itself.
const HOSTING_INVOLVED = { f: 'serviceCategory', in: ['Cloud / infrastructure operations', 'Data processing / back office'] };

export const ONBOARDING_GROUPS = [
  { id: 'identity', title: 'Legal identity', fields: [
    { key: 'legalName', label: 'Vendor legal name', type: 'text', min: 2, max: 200, required: true, example: 'Krakow IT Services Sp. z o.o.' },
    { key: 'tradingName', label: 'Trading name', type: 'text', max: 200, help: 'If different from the legal name.' },
    { key: 'registrationNumber', label: 'Registration number', type: 'text', max: 50, requiredIf: { f: 'registeredCountry', in: REGISTER_COUNTRIES },
      help: 'Required where we know the company register (UK, India, Ireland, Poland).' },
    { key: 'registeredCountry', label: 'Registered country', type: 'country', required: true },
    { key: 'registeredAddress', label: 'Registered address', type: 'address', required: true },
    { key: 'website', label: 'Website', type: 'url', max: 200, help: 'An https:// address is preferred.' }
  ] },
  { id: 'contact', title: 'Vendor contact', fields: [
    { key: 'contactName', label: 'Primary contact name', type: 'text', min: 2, max: 120, required: true },
    { key: 'contactEmail', label: 'Contact email', type: 'email', required: true,
      help: 'We email this person when you select the vendor, so they can answer the Stage 3 questionnaire.' },
    { key: 'contactRole', label: 'Contact role', type: 'select', options: CONTACT_ROLES, required: true },
    { key: 'contactPhone', label: 'Contact telephone', type: 'phone', max: 16, help: 'International format, e.g. +48 12 345 6789.' }
  ] },
  { id: 'service', title: 'Service and locations', fields: [
    { key: 'serviceCategory', label: 'Service category', type: 'select', options: SERVICE_CATEGORIES, required: true },
    { key: 'serviceDescription', label: 'Service description', type: 'textarea', min: 20, max: 3000, required: true,
      example: 'IT support and remote administration for our UK staff' },
    { key: 'deliveryCountries', label: 'Delivery countries', type: 'countries', required: true },
    { key: 'remoteAccessCountries', label: 'Remote access countries', type: 'countries', allowUnknown: true,
      requiredIf: { f: 'personalDataAccess', in: ['Yes', 'Unknown'] }, help: 'Required when the vendor may access personal data. "Unknown" is allowed.' },
    { key: 'hostingCountries', label: 'Data hosting countries', type: 'countries', allowUnknown: true, requiredIf: HOSTING_INVOLVED,
      help: 'Required where the vendor hosts or stores data. "Unknown" is allowed.' }
  ] },
  { id: 'processing', title: 'Relationship and data', fields: [
    { key: 'contractRelationship', label: 'Contract relationship', type: 'select', options: CONTRACT_RELATIONSHIPS, required: true },
    { key: 'processingRole', label: 'Expected processing role', type: 'select', options: PROCESSING_ROLES, required: true },
    { key: 'personalDataAccess', label: 'Personal-data access', type: 'tri', required: true, help: '"Unknown" asks the vendor to clarify.' },
    { key: 'subprocessorsUsed', label: 'Subprocessors used', type: 'tri', required: true, help: '"Yes" means the vendor discloses them later.' },
    { key: 'serviceCriticality', label: 'Service criticality', type: 'select', options: CRITICALITY, required: true }
  ] },
  { id: 'documents', title: 'Documents and status', fields: [
    { key: 'existingContract', label: 'Existing contract', type: 'file', help: 'PDF or DOCX, up to 15 MB.' },
    { key: 'existingDpa', label: 'Existing data processing agreement (DPA)', type: 'file', help: 'If relevant and available. Not needed to create the vendor.' },
    { key: 'certificationsClaimed', label: 'Certifications claimed', type: 'multiselect', options: CERTIFICATIONS,
      help: 'Claims stay unverified until evidence is checked in Stage 3.' },
    { key: 'supplierStatus', label: 'Supplier status', type: 'select', options: SUPPLIER_STATUS, required: true },
    { key: 'onboardingNotes', label: 'Buyer onboarding notes', type: 'textarea', max: 2000 }
  ] }
];
export const ONBOARDING_FIELDS = ONBOARDING_GROUPS.flatMap(g => g.fields.map(f => ({ ...f, group: g.id })));
// 25 fields; the two file fields are uploaded after the vendor is created.
const DATA_FIELDS = ONBOARDING_FIELDS.filter(f => f.type !== 'file');

/* ---------- Validation ---------- */
const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function cleanAddress(raw, country) {
  if (!raw || typeof raw !== 'object') return [undefined, 'Enter the registered address.'];
  const part = (k, max) => typeof raw[k] === 'string' ? raw[k].trim().slice(0, max) : '';
  const a = { line1: part('line1', 200), line2: part('line2', 200), city: part('city', 100), region: part('region', 100), postcode: part('postcode', 20).toUpperCase() };
  if (a.line1.length < 3) return [undefined, 'Enter the first line of the address.'];
  if (a.city.length < 2) return [undefined, 'Enter the town or city.'];
  const shape = POSTCODES[country];
  if (shape && !a.postcode) return [undefined, 'Enter the postcode.'];
  if (shape && !shape.test(a.postcode)) return [undefined, 'This postcode does not match the registered country.'];
  return [Object.fromEntries(Object.entries(a).filter(([, v]) => v))];
}

function cleanOne(f, raw, d) {
  if (isEmpty(raw)) return [undefined];
  switch (f.type) {
    case 'address': return cleanAddress(raw, d.registeredCountry);
    case 'url': {
      const s = String(raw).trim();
      if (s.length > 200 || !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return [undefined, 'Enter a valid website address.'];
      return [/^https?:\/\//i.test(s) ? s : 'https://' + s];
    }
    case 'phone': {
      const s = String(raw).replace(/[\s()-]/g, '');
      return /^\+[1-9]\d{6,14}$/.test(s) ? [s] : [undefined, 'Enter the number in international format, starting with + and the country code.'];
    }
    default: {
      const [v, err] = clean(f, raw, d);
      if (err || f.key !== 'registrationNumber') return [v, err];
      const reg = REGISTERS[d.registeredCountry];
      const n = v.replace(/\s+/g, '').toUpperCase();
      return reg && !reg.pattern.test(n) ? [undefined, reg.hint] : [n];
    }
  }
}

/* Validates fields against their definitions. Returns { values, errors } where errors also lists missing required fields. */
export function validateFields(fields, input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const values = {}; const errors = {};
  for (const f of fields) {
    const [v, err] = cleanOne(f, raw[f.key], raw);
    if (err) errors[f.key] = err; else if (v !== undefined) values[f.key] = v;
  }
  for (const f of fields) {
    const required = f.required || (f.requiredIf && holds(f.requiredIf, values));
    if (required && isEmpty(values[f.key]) && !errors[f.key]) errors[f.key] = f.required ? 'Required.' : 'Required because of another answer.';
  }
  return { values, errors };
}

/* Route B: the onboarding profile (23 data fields; the contract and DPA files follow as uploads). */
export function validateOnboarding(input) {
  const { values, errors } = validateFields(DATA_FIELDS, input);
  const notes = [];
  if (values.website && values.website.startsWith('http://')) notes.push('The website does not use https://.');
  if (values.personalDataAccess === 'Unknown') notes.push('Personal-data access is unknown: the vendor will be asked to clarify.');
  return { values, errors, notes };
}

/* Route A: directory criteria. Countries may be ["ANY"]. Pairs (insurance currency, budget to/currency) are checked here. */
export function validateCriteria(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const fields = DIRECTORY_FILTERS.map(f => f.key === 'supplierCountries' ? { ...f, type: 'any-countries' } : f);
  const values = {}; const errors = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (isEmpty(v)) continue;
    if (f.type === 'any-countries') {
      if (!Array.isArray(v) || !v.every(c => c === ANY_COUNTRY || COUNTRY_CODES.includes(c))) errors[f.key] = 'Choose countries from the list.';
      else values[f.key] = v.includes(ANY_COUNTRY) ? [ANY_COUNTRY] : [...new Set(v)];
      continue;
    }
    const [c, err] = clean(f, v, raw);
    if (err) errors[f.key] = err; else if (c !== undefined) values[f.key] = c;
  }
  for (const f of fields) if (f.required && isEmpty(values[f.key]) && !errors[f.key]) errors[f.key] = 'Required.';

  const money = (key, label) => {
    if (isEmpty(raw[key])) return undefined;
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0) { errors[key] = `Enter a valid ${label}.`; return undefined; }
    return n;
  };
  const currency = key => {
    const c = String(raw[key] || '').toUpperCase();
    if (!c) return undefined;
    if (!CURRENCIES.includes(c)) { errors[key] = 'Choose a valid currency.'; return undefined; }
    return c;
  };
  const budgetMax = money('budgetMax', 'amount');
  if (budgetMax !== undefined) values.budgetMax = budgetMax;
  if (values.budgetMin !== undefined && budgetMax !== undefined && budgetMax < values.budgetMin) errors.budgetMax = 'The upper amount must not be below the lower amount.';
  const insuranceCurrency = currency('insuranceCurrency');
  const budgetCurrency = currency('budgetCurrency');
  if (values.insuranceAmount !== undefined) {
    if (!insuranceCurrency) errors.insuranceCurrency = 'Choose the currency.'; else values.insuranceCurrency = insuranceCurrency;
  }
  if (values.budgetMin !== undefined || budgetMax !== undefined) {
    if (!budgetCurrency) errors.budgetCurrency = 'Choose the currency.'; else values.budgetCurrency = budgetCurrency;
  }
  return { values, errors };
}

/* What the browser needs to draw the Stage 2 forms. */
export const formDefinitions = () => ({
  modes: SELECTION_MODES,
  directoryFilters: DIRECTORY_FILTERS,
  onboardingGroups: ONBOARDING_GROUPS,
  options: { deliveryModels: DELIVERY_MODELS, supportHours: SUPPORT_HOURS, certifications: CERTIFICATIONS, languages: LANGUAGES,
    subprocessorRules: SUBPROCESSOR_RULES, contactRoles: CONTACT_ROLES, criticality: CRITICALITY },
  unknown: UNKNOWN,
  anyCountry: ANY_COUNTRY,
  countries: COUNTRIES,
  currencies: CURRENCIES
});
