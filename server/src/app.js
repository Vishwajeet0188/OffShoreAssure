import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { query } from './db.js';
import { loadUser } from './auth/session.js';
import { authRouter, meRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { requirementsRouter } from './requirements/routes.js';
import { assessmentsRouter } from './assessments/routes.js';
import { selectionRouter, vendorPortalRouter } from './selection/routes.js';
import { complianceBuyerRouter, complianceVendorRouter } from './compliance/routes.js';
import { contractRouter } from './contracts/routes.js';
import { obligationsBuyerRouter, obligationsVendorRouter } from './obligations/routes.js';
import { transfersRouter } from './transfers/routes.js';
import { risksRouter } from './risks/routes.js';
import { remediationBuyerRouter, remediationVendorRouter } from './remediation/routes.js';
import { feedbackRouter } from './feedback/routes.js';
import { organisationRouter } from './organisation/routes.js';
import { COUNTRIES, CURRENCIES } from './reference/countries.js';
import { SECTORS, JOB_ROLES, VENDOR_JOB_ROLES, SERVICE_CATEGORIES, VENDOR_CERTIFICATIONS, VENDOR_LANGUAGES } from './validation.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cors({ origin: config.frontendOrigin.split(',').map(s => s.trim()), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(loadUser);

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, service: 'offshoreassure-api' });
  });

  if (config.rateLimit) {
    api.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false,
      message: { error: 'rate_limited', message: 'Too many requests. Please wait a few minutes and try again.' } }));
  }
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/admin', adminRouter);
  // Lists used by the sign-up and profile forms.
  api.get('/reference', (_req, res) => res.json({ countries: COUNTRIES, serviceCategories: SERVICE_CATEGORIES, sectors: SECTORS, buyerJobRoles: JOB_ROLES, vendorJobRoles: VENDOR_JOB_ROLES,
    vendorCertifications: VENDOR_CERTIFICATIONS, vendorLanguages: VENDOR_LANGUAGES, currencies: CURRENCIES }));
  api.use('/requirements', requirementsRouter);
  api.use('/assessments', assessmentsRouter);
  api.use('/assessments', selectionRouter);
  api.use('/assessments', complianceBuyerRouter);
  api.use('/assessments', contractRouter);
  api.use('/assessments', obligationsBuyerRouter);
  api.use('/assessments', transfersRouter);
  api.use('/assessments', risksRouter);
  api.use('/assessments', remediationBuyerRouter);
  api.use('/vendor', vendorPortalRouter);
  api.use('/vendor', complianceVendorRouter);
  api.use('/vendor', obligationsVendorRouter);
  api.use('/vendor', remediationVendorRouter);
  api.use('/organisation', organisationRouter);
  api.use('/feedback', feedbackRouter);
  api.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'Not found.' }));

  app.use('/api', api);

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.status === 502 && err.message === 'email_failed') return res.status(502).json({ error: 'email_failed', message: 'We could not send the verification email. Please try again in a moment.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Invalid request.' });
    console.error(err);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
  });
  return app;
}
