/*
 * Automatic checks (Technical Architecture, element F: "a change detected by any
 * engine, for example a vendor certification expiring, updates … contract flags
 * and … scoring together"; user journey Stage 9: "rescores continuously").
 *
 * Once a day, for every assessment whose vendor has submitted its answers:
 *   1. Re-score the compliance result. A certificate or insurance that has expired
 *      no longer counts as evidence, so the score and gaps change; the new result is
 *      saved as a new locked version. A renewal the buyer has checked and closed
 *      (Stage 8, theme "monitoring") counts as valid again.
 *   2. If the risk register is now out of date, build it again.
 *   3. Ask the vendor for renewals 30 days before a certificate or insurance expires.
 *   4. Email the buyer what changed, and save the check on the assessment.
 *
 * The periods are PROVISIONAL (rule pack RP-2026.10-S9-draft).
 */
import crypto from 'node:crypto';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { sendNotice } from '../mailer.js';
import { scoreAssessment, S3_RULE_PACK } from '../engine/questionnaire.js';
import { monitoringItems, S9_RULE_PACK } from '../engine/report.js';
import { gatherSources, sameInputs, saveRiskRegister } from '../risks/routes.js';
import { createRenewalRequests, expiringEvidence, monitoringRequests } from '../reports/routes.js';
import { notifyVendor } from '../remediation/routes.js';

export const AUTO_RENEWAL_DAYS = 30;
const DAY = 86400000;
const sha = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const appLink = p => config.frontendOrigin.split(',')[0].trim() + p;

/* What makes two compliance results different for this purpose: the score and the gaps. */
const scoreKey = scored => sha({ overall: scored.overall, gaps: scored.gaps.map(g => g.text) });

export async function runAutomaticChecks({ today = new Date(), trigger = 'schedule' } = {}) {
  const run = (await query(`INSERT INTO automatic_check_runs (trigger) VALUES ($1) RETURNING id`, [trigger])).rows[0];
  const { rows: assessments } = await query(
    `SELECT a.*, r.title, o.name AS buyer_name, v.name AS vendor_name, c.id AS compliance_id, c.questionnaire
       FROM assessments a
       JOIN requirements r ON r.id = a.requirement_id
       JOIN organisations o ON o.id = a.buyer_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
       JOIN compliance_assessments c ON c.assessment_id = a.id AND c.status = 'submitted'`);

  const summary = { assessments: assessments.length, rescored: 0, registers: 0, renewals: 0, changed: [] };
  for (const a of assessments) {
    try {
      const changes = await checkOne(a, today);
      if (changes.length) {
        summary.changed.push({ reference: a.reference, changes });
        summary.rescored += changes.filter(c => c.kind === 'rescored').length;
        summary.registers += changes.filter(c => c.kind === 'register').length;
        summary.renewals += changes.filter(c => c.kind === 'renewals').reduce((n, c) => n + c.actions.length, 0);
      }
    } catch (error) {
      console.error(`[CHECKS] ${a.reference}:`, error.message);
      summary.changed.push({ reference: a.reference, error: error.message });
    }
  }
  await query('UPDATE automatic_check_runs SET finished_at = now(), summary = $2 WHERE id = $1', [run.id, JSON.stringify(summary)]);
  return summary;
}

async function checkOne(a, today) {
  const changes = [];
  const notices = [];

  await tx(async db => {
    await db.query('SELECT id FROM assessments WHERE id = $1 FOR UPDATE', [a.id]);
    const timeline = (title, detail = {}) => db.query(
      `INSERT INTO assessment_timeline (assessment_id, kind, stage, step, title, status, at, detail) VALUES ($1, 'event', 9, 43, $2, 'done', now(), $3)`,
      [a.id, title, JSON.stringify({ ...detail, automatic: true })]);

    // 1. Re-score the latest compliance result with today's date.
    const latest = (await db.query('SELECT * FROM compliance_results WHERE compliance_id = $1 ORDER BY version DESC LIMIT 1', [a.compliance_id])).rows[0];
    const requested = await monitoringRequests(db, a);
    const evidence = latest.evidence.map(e => {
      const renewal = requested.get(`renew:${e.id}`);
      // Renewed proof checked and closed by the buyer: the old expiry no longer applies.
      return renewal?.status === 'CLOSED' ? { ...e, expiresOn: null, renewedBy: renewal.code } : e;
    });
    const scored = scoreAssessment(a.questionnaire, latest.answers, evidence, today);
    if (scoreKey(scored) !== scoreKey(latest.result)) {
      const version = latest.version + 1;
      const record = { reference: a.reference, version, scored, answers: latest.answers, evidence, automatic: true };
      await db.query(
        `INSERT INTO compliance_results (compliance_id, version, overall_score, rating, result, answers, evidence, rule_pack_version, snapshot_sha256, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)`,
        [a.compliance_id, version, scored.overall, scored.rating.code, JSON.stringify(scored), JSON.stringify(latest.answers),
          JSON.stringify(evidence), S3_RULE_PACK, sha(record)]);
      const why = scored.gaps.filter(g => g.kind === 'expired').length > latest.result.gaps.filter(g => g.kind === 'expired').length
        ? 'a certificate or insurance has expired' : 'renewed evidence was accepted';
      await timeline(`Automatic check: ${why}; compliance score ${latest.overall_score} → ${scored.overall} (result v${version})`, { version });
      await audit(null, 'compliance.rescored', { db, stage: 'stage-9', ref: a.reference,
        detail: { reference: a.reference, version, from: latest.overall_score, to: scored.overall, reason: why, automatic: true } });
      changes.push({ kind: 'rescored', from: latest.overall_score, to: scored.overall, version, reason: why });
      notices.push(`Compliance score changed from ${latest.overall_score} to ${scored.overall} because ${why} (result v${version}).`);
    }

    // 2. Build the risk register again if a source it read has changed.
    const register = (await db.query('SELECT version, inputs FROM risk_registers WHERE assessment_id = $1 ORDER BY version DESC LIMIT 1', [a.id])).rows[0];
    if (register) {
      const sources = await gatherSources(db.query.bind(db), a);
      if (!sources.blocked && !sameInputs(register.inputs, sources.versions)) {
        const version = await saveRiskRegister(db, a, sources, { reason: changes.length ? 'the compliance score changed' : 'an earlier stage changed' });
        changes.push({ kind: 'register', version });
        notices.push(`The risk register was built again (v${version}). Check Stage 8 for new risks to plan.`);
      }
    }

    // 3. Ask for renewals 30 days before expiry (only once per document).
    if (a.selected_vendor_id) {
      const documents = await expiringEvidence(db, a);
      const soon = new Set(documents
        .filter(e => (new Date(e.expiresOn).getTime() - today.getTime()) / DAY <= AUTO_RENEWAL_DAYS)
        .map(e => `renew:${e.id}`));
      const due = monitoringItems({ evidence: documents, requested, today })
        .filter(i => i.kind === 'renewal' && i.canRequest && soon.has(i.key));
      if (due.length) {
        const sent = await createRenewalRequests(db, a, due, { note: `Requested automatically ${AUTO_RENEWAL_DAYS} days before expiry.` });
        await timeline(`Automatic check: renewal requested from ${a.vendor_name} (${sent.map(s => s.code).join(', ')})`, {});
        await audit(null, 'monitoring.requested', { db, stage: 'stage-9', ref: a.reference, detail: { reference: a.reference, actions: sent.map(s => s.code), automatic: true } });
        changes.push({ kind: 'renewals', actions: sent });
        notices.push(`Renewal requested from ${a.vendor_name}: ${sent.map(s => `${s.code} · ${s.title} (due ${s.due})`).join('; ')}.`);
      }
    }

    // 4. Save the check on the assessment.
    if (changes.length) {
      const reportVersion = (await db.query('SELECT max(version) AS v FROM report_versions WHERE assessment_id = $1', [a.id])).rows[0].v;
      await db.query(
        `INSERT INTO monitoring_checks (assessment_id, report_version, choice, note, items, rule_pack_version, created_by) VALUES ($1, $2, 'auto', $3, $4, $5, NULL)`,
        [a.id, reportVersion, notices.join(' ').slice(0, 1000), JSON.stringify(changes.map(c => ({ key: c.kind, severity: c.kind === 'renewals' ? 'medium' : 'high', title: c.kind }))), S9_RULE_PACK]);
    }
  });

  if (notices.length) {
    await emailBuyer(a, notices);
    const renewals = changes.find(c => c.kind === 'renewals');
    if (renewals) {
      await notifyVendor(a, `${a.buyer_name} needs renewed documents`,
        [`A certificate or insurance document for "${a.title}" (${a.reference}) expires soon:`, ...renewals.actions.map(s => `${s.code} · ${s.title} — due ${s.due}`)],
        'MONITORING', 'Renewed documents needed');
    }
  }
  return changes;
}

async function emailBuyer(a, lines) {
  const buyers = (await query(
    `SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.organisation_id = $1 AND p.membership IN ('owner', 'member') AND u.status = 'active'`, [a.buyer_id])).rows;
  for (const b of buyers) {
    try {
      await sendNotice(b.email, `Automatic check: changes on ${a.reference}`,
        [`Hello ${b.full_name || ''},`.replace(' ,', ','), `OffshoreAssure's daily check found changes on "${a.title}" (${a.reference}):`, ...lines],
        { kicker: 'MONITORING', title: 'Something changed', action: { label: 'Open monitoring and audit', url: appLink('/monitoring/' + a.reference) } });
    } catch (error) { console.error('[EMAIL] automatic check notice failed:', error.message); }
  }
}

/* Runs the checks once a day while the server is up (first run a minute after start). */
export function scheduleAutomaticChecks() {
  if (process.env.AUTOMATIC_CHECKS === 'off' || process.env.NODE_ENV === 'test') return;
  const go = () => runAutomaticChecks().then(s => console.log(`[CHECKS] ${s.assessments} assessments checked, ${s.changed.length} changed.`))
    .catch(error => console.error('[CHECKS] failed:', error.message));
  setTimeout(go, 60 * 1000).unref();
  setInterval(go, DAY).unref();
}
