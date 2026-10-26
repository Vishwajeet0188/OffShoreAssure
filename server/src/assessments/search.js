/*
 * Search box in the buyer top bar (GET /api/assessments/search?q=…).
 *
 * Looks through the buyer organisation's own records only:
 *   - assessments (reference, title, service)
 *   - vendors chosen in those assessments
 *   - contracts (file names)
 *   - obligations (latest register of each assessment)
 *   - risks (latest register of each assessment)
 *   - remediation actions
 *
 * Every result carries the page it opens. At most 5 results per group.
 */
import { query } from '../db.js';
import { countryName } from '../reference/countries.js';

const PER_GROUP = 5;
export const MIN_SEARCH_LENGTH = 2;

/* "50%_off" must match literally, not as LIKE wildcards. */
function likePattern(text) {
  return '%' + text.replace(/[\\%_]/g, char => '\\' + char) + '%';
}

const actionCode = number => `ACT-${String(number).padStart(2, '0')}`;

export async function buyerSearch(buyerId, text) {
  const q = String(text || '').trim();
  if (q.length < MIN_SEARCH_LENGTH) return { query: q, groups: [] };

  const pattern = likePattern(q);

  const [assessments, vendors, contracts, obligations, risks, actions] = await Promise.all([
    searchAssessments(buyerId, pattern),
    searchVendors(buyerId, pattern),
    searchContracts(buyerId, pattern),
    searchObligations(buyerId, pattern),
    searchRisks(buyerId, pattern),
    searchActions(buyerId, pattern),
  ]);

  const groups = [
    { key: 'assessments', label: 'Assessments', items: assessments },
    { key: 'vendors', label: 'Vendors', items: vendors },
    { key: 'contracts', label: 'Contracts', items: contracts },
    { key: 'obligations', label: 'Obligations', items: obligations },
    { key: 'risks', label: 'Risks', items: risks },
    { key: 'actions', label: 'Actions', items: actions },
  ].filter(group => group.items.length > 0);

  return { query: q, groups };
}

async function searchAssessments(buyerId, pattern) {
  const { rows } = await query(
    `SELECT a.reference, a.selected_vendor_id, r.title,
            coalesce(r.data ->> 'serviceCategory', a.service_code) AS service
       FROM assessments a
       JOIN requirements r ON r.id = a.requirement_id
      WHERE a.buyer_id = $1
        AND (a.reference ILIKE $2 OR r.title ILIKE $2 OR r.data ->> 'serviceCategory' ILIKE $2)
      ORDER BY a.created_at DESC
      LIMIT ${PER_GROUP}`,
    [buyerId, pattern],
  );

  return rows.map(row => ({
    title: row.title || row.reference,
    detail: `${row.reference} · ${row.service}`,
    // With a vendor chosen the assessment continues in Stage 3; before that, in vendor selection.
    to: (row.selected_vendor_id ? '/compliance/' : '/vendor-selection/') + row.reference,
  }));
}

async function searchVendors(buyerId, pattern) {
  const { rows } = await query(
    `SELECT DISTINCT ON (v.id) v.name, v.country, a.reference
       FROM assessments a
       JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.buyer_id = $1 AND v.name ILIKE $2
      ORDER BY v.id, a.created_at DESC
      LIMIT ${PER_GROUP}`,
    [buyerId, pattern],
  );

  return rows.map(row => ({
    title: row.name,
    detail: [row.country ? countryName(row.country) : null, row.reference].filter(Boolean).join(' · '),
    to: '/compliance/' + row.reference,
  }));
}

async function searchContracts(buyerId, pattern) {
  const { rows } = await query(
    `SELECT c.file_name, c.version, a.reference
       FROM contract_documents c
       JOIN assessments a ON a.id = c.assessment_id
      WHERE a.buyer_id = $1 AND (c.file_name ILIKE $2 OR c.label ILIKE $2)
      ORDER BY c.uploaded_at DESC
      LIMIT ${PER_GROUP}`,
    [buyerId, pattern],
  );

  return rows.map(row => ({
    title: row.file_name,
    detail: `Version ${row.version} · ${row.reference}`,
    to: '/contract/' + row.reference,
  }));
}

async function searchObligations(buyerId, pattern) {
  const { rows } = await query(
    `SELECT a.reference, item ->> 'id' AS id, item ->> 'text' AS text, item -> 'source' ->> 'clauseNumber' AS clause
       FROM (SELECT DISTINCT ON (assessment_id) assessment_id, obligations
               FROM obligation_registers
              ORDER BY assessment_id, version DESC) latest
       JOIN assessments a ON a.id = latest.assessment_id
       CROSS JOIN LATERAL jsonb_array_elements(latest.obligations) AS item
      WHERE a.buyer_id = $1 AND (item ->> 'text' ILIKE $2 OR item ->> 'id' ILIKE $2)
      LIMIT ${PER_GROUP}`,
    [buyerId, pattern],
  );

  return rows.map(row => ({
    title: row.text,
    detail: [row.id, row.clause ? 'clause ' + row.clause : null, row.reference].filter(Boolean).join(' · '),
    to: '/obligations/' + row.reference,
  }));
}

async function searchRisks(buyerId, pattern) {
  const { rows } = await query(
    `SELECT a.reference, item ->> 'id' AS id, item ->> 'title' AS title, item ->> 'rating' AS rating
       FROM (SELECT DISTINCT ON (assessment_id) assessment_id, risks
               FROM risk_registers
              ORDER BY assessment_id, version DESC) latest
       JOIN assessments a ON a.id = latest.assessment_id
       CROSS JOIN LATERAL jsonb_array_elements(latest.risks) AS item
      WHERE a.buyer_id = $1 AND (item ->> 'title' ILIKE $2 OR item ->> 'id' ILIKE $2)
      LIMIT ${PER_GROUP}`,
    [buyerId, pattern],
  );

  return rows.map(row => ({
    title: row.title,
    detail: [row.id, row.rating ? row.rating.toLowerCase() : null, row.reference].filter(Boolean).join(' · '),
    to: '/risks/' + row.reference,
  }));
}

async function searchActions(buyerId, pattern) {
  const { rows } = await query(
    `SELECT a.reference, x.number, x.title, x.status
       FROM remediation_actions x
       JOIN assessments a ON a.id = x.assessment_id
      WHERE a.buyer_id = $1 AND x.title ILIKE $2
      ORDER BY x.created_at DESC
      LIMIT ${PER_GROUP}`,
    [buyerId, pattern],
  );

  return rows.map(row => ({
    title: row.title,
    detail: `${actionCode(row.number)} · ${row.status.toLowerCase().replace('_', ' ')} · ${row.reference}`,
    to: '/remediation/' + row.reference,
  }));
}
