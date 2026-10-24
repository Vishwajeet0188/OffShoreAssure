import { z } from 'zod';
import { COUNTRY_CODES } from './reference/countries.js';

export const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address.');
export const password = z.string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .refine(p => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain at least one letter and one number.');
export const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.');

export const SECTORS = ['Financial Services', 'Healthcare', 'Retail', 'IT & Technology', 'Professional Services', 'Public Sector', 'Other'];
export const JOB_ROLES = ['Compliance Manager', 'Information Security Lead', 'Legal & Procurement', 'Vendor Manager', 'Other'];
export const VENDOR_JOB_ROLES = ['Director / Owner', 'Account / Sales Manager', 'Delivery Manager', 'Compliance / Security Lead', 'Other'];
export const SERVICE_CATEGORIES = ['IT Support', 'Software development', 'Cloud / infrastructure operations', 'HR', 'Payroll', 'Finance & accounting', 'Customer support', 'Data processing / back office', 'Other'];
export const ROLES = ['buyer', 'vendor'];
const country = z.string().refine(c => COUNTRY_CODES.includes(c), 'Choose a valid country.');

/* UTM tags from the link the person first opened (all optional, short text only). */
const utmValue = z.string().trim().max(100).optional();
const signupSource = z.object({
  utm_source: utmValue,
  utm_medium: utmValue,
  utm_campaign: utmValue,
  utm_term: utmValue,
  utm_content: utmValue,
  landingPage: z.string().trim().max(200).optional(),
}).optional().catch(undefined);

/* Optional vendor details used by the Stage 2 directory filters. */
const optionalInt = (min, max, msg) => z.preprocess(v => v === '' || v == null ? undefined : Number(v), z.number({ message: msg }).int(msg).min(min, msg).max(max, msg).optional());
const optionalMoney = msg => z.preprocess(v => v === '' || v == null ? undefined : Number(v), z.number({ message: msg }).min(0, msg).max(1e12, msg).optional());
const optionalCurrency = z.string().trim().toUpperCase().refine(c => !c || Intl.supportedValuesOf('currency').includes(c), 'Choose a valid currency.').optional().or(z.literal(''));
export const VENDOR_CERTIFICATIONS = ['ISO 27001', 'SOC 2 Type II', 'Cyber Essentials', 'Cyber Essentials Plus', 'ISO 27701', 'ISO 9001', 'PCI DSS'];
export const VENDOR_LANGUAGES = ['English', 'Hindi', 'Polish', 'Portuguese', 'Spanish', 'Tagalog', 'French', 'German', 'Arabic', 'Mandarin'];
const vendorDirectory = z.object({
  deliveryModel: z.enum(['Remote', 'Onsite', 'Hybrid']).optional().or(z.literal('')),
  industries: z.array(z.enum(SECTORS)).max(SECTORS.length).optional(),
  staffCount: optionalInt(0, 1000000, 'Enter a whole number of staff.'),
  foundedYear: optionalInt(1800, new Date().getUTCFullYear(), 'Enter a valid year.'),
  certifications: z.array(z.enum(VENDOR_CERTIFICATIONS)).optional(),
  insuranceCover: optionalMoney('Enter a valid amount.'),
  insuranceCurrency: optionalCurrency,
  supportHours: z.enum(['Business hours', 'Extended hours', '24/7']).optional().or(z.literal('')),
  languages: z.array(z.enum(VENDOR_LANGUAGES)).optional(),
  minAnnualValue: optionalMoney('Enter a valid amount.'),
  valueCurrency: optionalCurrency,
  usesSubprocessors: z.enum(['Yes', 'No', 'Unknown']).optional().or(z.literal(''))
}).refine(d => d.insuranceCover == null || !!d.insuranceCurrency, { message: 'Choose the currency.', path: ['insuranceCurrency'] })
  .refine(d => d.minAnnualValue == null || !!d.valueCurrency, { message: 'Choose the currency.', path: ['valueCurrency'] });

export const schemas = {
  register: z.object({ email, password, role: z.enum(ROLES, { message: 'Choose buyer or vendor.' }).default('buyer'), source: signupSource }),
  verify: z.object({ email, code }),
  resend: z.object({ email, purpose: z.enum(['register', 'reset']).default('register') }),
  login: z.object({ email, password: z.string().min(1, 'Enter your password.').max(128) }),
  forgot: z.object({ email }),
  reset: z.object({ email, code, newPassword: password }),
  profile: z.object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    organisationName: z.string().trim().min(2, 'Enter your organisation name.').max(200),
    sector: z.enum(SECTORS, { message: 'Choose a sector.' }),
    jobRole: z.enum(JOB_ROLES, { message: 'Choose your role.' }),
    phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/, 'Enter a valid phone number.').optional().or(z.literal(''))
  }),
  vendorProfile: z.object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    jobRole: z.enum(VENDOR_JOB_ROLES, { message: 'Choose your role.' }),
    phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/, 'Enter a valid phone number.').optional().or(z.literal('')),
    organisationName: z.string().trim().min(2, 'Enter your company\'s legal name.').max(200),
    registrationNumber: z.string().trim().min(2, 'Enter the company registration number.').max(50),
    country: country,
    services: z.array(z.enum(SERVICE_CATEGORIES)).min(1, 'Choose at least one service you provide.').max(SERVICE_CATEGORIES.length),
    deliveryCountries: z.array(country).min(1, 'Choose at least one country you deliver from.').max(50),
    website: z.string().trim().max(200).regex(/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i, 'Enter a valid website address.').optional().or(z.literal('')),
    description: z.string().trim().max(1000, 'Use at most 1,000 characters.').optional().or(z.literal('')),
    // Optional directory details (Stage 2 Route A filters). Empty means "not stated".
    directory: vendorDirectory.optional()
  }),
  vendorDecision: z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional().or(z.literal('')) }),
  adminStatus: z.object({ status: z.enum(['active', 'inactive']) }),
  adminInvite: z.object({ email, fullName: z.string().trim().min(2, 'Enter their full name.').max(120) })
};

/* Express helper: validates req.body; on failure sends 400 with field messages. */
export function parse(schema, req, res) {
  const r = schema.safeParse(req.body || {});
  if (r.success) return r.data;
  const fields = {};
  for (const i of r.error.issues) { const k = i.path.join('.') || 'form'; if (!fields[k]) fields[k] = i.message; }
  res.status(400).json({ error: 'validation', message: Object.values(fields)[0], fields });
  return null;
}
