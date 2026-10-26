/* Admin · Rule base: GET /api/admin/rules — every rule table the engines apply, by stage (read-only). */
import { Router } from 'express';
import { requireAdmin } from '../auth/session.js';
import { ruleCatalogue } from './catalogue.js';

export const adminRulesRouter = Router();

adminRulesRouter.get('/rules', requireAdmin, (_req, res) => {
  res.json({
    packs: ruleCatalogue(),
    note:
      'These are the rules the engines apply now. Rules for Stages 3–9 are provisional (“draft”) until the client confirms them. ' +
      'Every result saves the rule-pack version it used, so a later change never alters a saved result.',
  });
});
