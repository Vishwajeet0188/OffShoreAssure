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

export const schemas = {
  register: z.object({ email, password, role: z.enum(ROLES, { message: 'Choose buyer or vendor.' }).default('buyer') }),
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
    description: z.string().trim().max(1000, 'Use at most 1,000 characters.').optional().or(z.literal(''))
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
