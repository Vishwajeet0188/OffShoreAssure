/*
 * Admin · automatic checks.
 *   GET  /api/admin/checks       the last runs and what they changed
 *   POST /api/admin/checks/run   run the checks now (they also run once a day by themselves)
 */
import { Router } from 'express';
import { query } from '../db.js';
import { audit } from '../audit.js';
import { requireAdmin } from '../auth/session.js';
import { runAutomaticChecks, AUTO_RENEWAL_DAYS } from './job.js';
import { EXPIRY_WARNING_DAYS } from '../engine/report.js';

export const adminChecksRouter = Router();

adminChecksRouter.get('/checks', requireAdmin, async (_req, res) => {
  const { rows } = await query('SELECT * FROM automatic_check_runs ORDER BY id DESC LIMIT 20');
  res.json({
    runs: rows.map(r => ({
      id: r.id,
      trigger: r.trigger,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      summary: r.summary,
    })),
    rules: { renewalDays: AUTO_RENEWAL_DAYS, expiryWarningDays: EXPIRY_WARNING_DAYS, schedule: 'Once a day' },
  });
});

adminChecksRouter.post('/checks/run', requireAdmin, async (req, res) => {
  // Tests may pass a date to check against; real runs use today.
  const today = process.env.NODE_ENV === 'test' && req.body?.today ? new Date(req.body.today) : new Date();
  const summary = await runAutomaticChecks({ today, trigger: 'admin' });
  await audit(req, 'admin.checks_run', {
    stage: 'stage-9',
    detail: { assessments: summary.assessments, changed: summary.changed.length },
  });
  res.json({ summary });
});
