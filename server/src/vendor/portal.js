/*
 * Vendor portal top bar: the bell and the search box.
 *
 *   GET /api/vendor/alerts        what needs the vendor's attention
 *   GET /api/vendor/search?q=…    the vendor's own assessments, obligations and actions
 *
 * Everything is limited to the vendor's own company: assessments where it is the
 * selected vendor, and the questionnaires, obligations and actions that belong to it.
 * A vendor never sees another vendor's work or the buyer's own actions.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../auth/session.js';

export const vendorPortalTopRouter = Router();
vendorPortalTopRouter.use(['/alerts', '/search'], requireRole('vendor'));

const DUE_SOON_DAYS = 7;
const EXPIRY_DAYS = 30;
const PER_GROUP = 5;
export const MIN_SEARCH_LENGTH = 2;

const day = value =>
  value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : null;
const actionCode = number => `ACT-${String(number).padStart(2, '0')}`;
const daysUntil = date => Math.floor((new Date(day(date)) - new Date(day(new Date()))) / 86400000);

async function vendorOrganisation(userId) {
  const { rows } = await query('SELECT organisation_id FROM user_profiles WHERE user_id = $1', [userId]);
  return rows[0]?.organisation_id || null;
}

/* ---------------- Bell ---------------- */

vendorPortalTopRouter.get('/alerts', async (req, res) => {
  const vendorId = await vendorOrganisation(req.user.id);
  if (!vendorId) return res.json({ alerts: [] });

  res.json({ alerts: await vendorAlerts(vendorId) });
});

export async function vendorAlerts(vendorId) {
  const alerts = [];

  // Questionnaires still to answer (Stage 3).
  const { rows: questionnaires } = await query(
    `SELECT a.reference, b.name AS buyer, c.due_on
       FROM compliance_assessments c
       JOIN assessments a ON a.id = c.assessment_id
       JOIN organisations b ON b.id = a.buyer_id
      WHERE c.vendor_id = $1 AND c.status <> 'submitted'
      ORDER BY c.due_on`,
    [vendorId],
  );
  for (const q of questionnaires) {
    const left = daysUntil(q.due_on);
    alerts.push({
      kind: left < 0 ? 'overdue' : 'answer',
      reference: q.reference,
      title:
        left < 0
          ? `Questionnaire overdue (due ${day(q.due_on)})`
          : `Questionnaire to answer by ${day(q.due_on)}`,
      detail: q.buyer,
      path: '/vendor/assessments/' + q.reference,
    });
  }

  // Actions assigned to the vendor (Stage 8): sent back, overdue or due soon.
  const { rows: actions } = await query(
    `SELECT a.reference, x.number, x.title, x.status, x.due_on, x.buyer_note
       FROM remediation_actions x
       JOIN assessments a ON a.id = x.assessment_id
      WHERE a.selected_vendor_id = $1 AND x.owner = 'vendor' AND x.status IN ('OPEN', 'RETURNED')
      ORDER BY x.due_on NULLS LAST`,
    [vendorId],
  );
  for (const x of actions) {
    const left = x.due_on ? daysUntil(x.due_on) : null;
    const path = '/vendor/actions/' + x.reference;

    if (x.status === 'RETURNED') {
      alerts.push({
        kind: 'returned',
        reference: x.reference,
        title: `${actionCode(x.number)} was sent back: more is needed`,
        detail: x.buyer_note || x.title,
        path,
      });
    } else if (left !== null && left < 0) {
      alerts.push({
        kind: 'overdue',
        reference: x.reference,
        title: `${actionCode(x.number)} is overdue (due ${day(x.due_on)})`,
        detail: x.title,
        path,
      });
    } else if (left !== null && left <= DUE_SOON_DAYS) {
      alerts.push({
        kind: 'due',
        reference: x.reference,
        title: `${actionCode(x.number)} is due ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}`,
        detail: x.title,
        path,
      });
    }
  }

  // The vendor's own certificates and insurance expiring within 30 days (or expired).
  const { rows: expiring } = await query(
    `SELECT a.reference, e.file_name, e.expires_on
       FROM compliance_evidence e
       JOIN compliance_assessments c ON c.id = e.compliance_id
       JOIN assessments a ON a.id = c.assessment_id
      WHERE c.vendor_id = $1 AND e.expires_on IS NOT NULL
        AND e.expires_on <= current_date + ${EXPIRY_DAYS}
      ORDER BY e.expires_on`,
    [vendorId],
  );
  for (const e of expiring) {
    const left = daysUntil(e.expires_on);
    alerts.push({
      kind: 'expiry',
      reference: e.reference,
      title:
        left < 0
          ? `${e.file_name} expired on ${day(e.expires_on)}`
          : `${e.file_name} expires on ${day(e.expires_on)}`,
      detail: 'Upload the renewed document when the buyer asks for it',
      path: '/vendor/assessments/' + e.reference,
    });
  }

  // Invitations from buyers not yet looked at (Stage 2).
  const { rows: invitations } = await query(
    `SELECT a.reference, b.name AS buyer
       FROM vendor_invitations i
       JOIN assessments a ON a.id = i.assessment_id
       JOIN organisations b ON b.id = a.buyer_id
      WHERE i.vendor_id = $1 AND i.status = 'sent'`,
    [vendorId],
  );
  for (const i of invitations) {
    alerts.push({
      kind: 'invited',
      reference: i.reference,
      title: `${i.buyer} invited you to an assessment`,
      detail: 'See the invitation',
      path: '/vendor/assessments',
    });
  }

  const ORDER = { overdue: 0, returned: 1, expiry: 2, due: 3, answer: 4, invited: 5 };
  return alerts.sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
}

/* ---------------- Search ---------------- */

vendorPortalTopRouter.get('/search', async (req, res) => {
  const vendorId = await vendorOrganisation(req.user.id);
  if (!vendorId) return res.json({ query: '', groups: [] });

  res.json(await vendorSearch(vendorId, String(req.query.q || '').slice(0, 100)));
});

/* "50%_off" must match literally, not as LIKE wildcards. */
const likePattern = text => '%' + text.replace(/[\\%_]/g, char => '\\' + char) + '%';

export async function vendorSearch(vendorId, text) {
  const q = String(text || '').trim();
  if (q.length < MIN_SEARCH_LENGTH) return { query: q, groups: [] };
  const pattern = likePattern(q);

  const [assessments, obligations, actions] = await Promise.all([
    query(
      `SELECT a.reference, r.title, b.name AS buyer
         FROM assessments a
         JOIN requirements r ON r.id = a.requirement_id
         JOIN organisations b ON b.id = a.buyer_id
        WHERE a.selected_vendor_id = $1
          AND (a.reference ILIKE $2 OR r.title ILIKE $2 OR b.name ILIKE $2)
        ORDER BY a.created_at DESC
        LIMIT ${PER_GROUP}`,
      [vendorId, pattern],
    ),
    query(
      `SELECT a.reference, item ->> 'id' AS id, item ->> 'text' AS text,
              item -> 'source' ->> 'clauseNumber' AS clause
         FROM (SELECT DISTINCT ON (assessment_id) assessment_id, obligations
                 FROM obligation_registers
                ORDER BY assessment_id, version DESC) latest
         JOIN assessments a ON a.id = latest.assessment_id
         CROSS JOIN LATERAL jsonb_array_elements(latest.obligations) AS item
        WHERE a.selected_vendor_id = $1
          AND item ->> 'party' IN ('vendor', 'both')
          AND (item ->> 'text' ILIKE $2 OR item ->> 'id' ILIKE $2)
        LIMIT ${PER_GROUP}`,
      [vendorId, pattern],
    ),
    query(
      `SELECT a.reference, x.number, x.title, x.status
         FROM remediation_actions x
         JOIN assessments a ON a.id = x.assessment_id
        WHERE a.selected_vendor_id = $1 AND x.owner = 'vendor' AND x.status <> 'PROPOSED'
          AND (x.title ILIKE $2 OR ('ACT-' || lpad(x.number::text, 2, '0')) ILIKE $2)
        ORDER BY x.number
        LIMIT ${PER_GROUP}`,
      [vendorId, pattern],
    ),
  ]);

  const groups = [
    {
      key: 'assessments',
      label: 'Assessments',
      items: assessments.rows.map(row => ({
        title: row.title || row.reference,
        detail: `${row.reference} · ${row.buyer}`,
        to: '/vendor/assessments/' + row.reference,
      })),
    },
    {
      key: 'obligations',
      label: 'Obligations',
      items: obligations.rows.map(row => ({
        title: row.text,
        detail: [row.id, row.clause ? 'clause ' + row.clause : null, row.reference]
          .filter(Boolean)
          .join(' · '),
        to: '/vendor/obligations/' + row.reference,
      })),
    },
    {
      key: 'actions',
      label: 'Actions',
      items: actions.rows.map(row => ({
        title: row.title,
        detail: `${actionCode(row.number)} · ${row.status.toLowerCase().replace('_', ' ')} · ${row.reference}`,
        to: '/vendor/actions/' + row.reference,
      })),
    },
  ].filter(group => group.items.length > 0);

  return { query: q, groups };
}
