/*
 * Evidence page for the buyer (GET /api/assessments/evidence).
 *
 * Every document held for the buyer organisation's assessments, in one list:
 *   - contracts uploaded at Stage 4
 *   - the vendor's questionnaire evidence at Stage 3 (policies, certificates, reports …)
 *   - evidence sent for remediation actions at Stage 8
 *
 * Groups follow the client's demo: Contracts, Policies, Certificates, Other.
 * The status is what we know about the document; nothing is called "verified"
 * because OffshoreAssure does not verify documents itself.
 */
import { query } from '../db.js';

const EXPIRY_WARNING_DAYS = 30;

const day = value =>
  value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : null;

const actionCode = number => `ACT-${String(number).padStart(2, '0')}`;

/* Certificates and insurance: valid, expiring within 30 days, or expired. */
function expiryStatus(expiresOn) {
  if (!expiresOn) return 'Received';

  const daysLeft = Math.floor((new Date(day(expiresOn)) - new Date(day(new Date()))) / 86400000);
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= EXPIRY_WARNING_DAYS) return 'Expiring';
  return 'Valid';
}

function groupOf(docType) {
  if (docType === 'policy') return 'Policies';
  if (docType === 'certificate' || docType === 'insurance') return 'Certificates';
  return 'Other';
}

export async function buyerEvidence(buyerId) {
  const [contracts, questionnaire, actions] = await Promise.all([
    query(
      `SELECT c.id, c.file_name, c.version, c.label, c.uploaded_at, a.reference, v.name AS vendor,
              EXISTS (SELECT 1 FROM contract_analyses x WHERE x.contract_id = c.id) AS analysed
         FROM contract_documents c
         JOIN assessments a ON a.id = c.assessment_id
         LEFT JOIN organisations v ON v.id = c.vendor_id
        WHERE a.buyer_id = $1`,
      [buyerId],
    ),
    query(
      `SELECT e.id, e.file_name, e.doc_type, e.control_id, e.expires_on, e.uploaded_at, a.reference, v.name AS vendor
         FROM compliance_evidence e
         JOIN compliance_assessments c ON c.id = e.compliance_id
         JOIN assessments a ON a.id = c.assessment_id
         LEFT JOIN organisations v ON v.id = a.selected_vendor_id
        WHERE a.buyer_id = $1`,
      [buyerId],
    ),
    query(
      `SELECT e.id, e.file_name, e.submitted, e.uploaded_at, x.number, x.title, a.reference, v.name AS vendor
         FROM remediation_evidence e
         JOIN remediation_actions x ON x.id = e.action_id
         JOIN assessments a ON a.id = x.assessment_id
         LEFT JOIN organisations v ON v.id = a.selected_vendor_id
        WHERE a.buyer_id = $1`,
      [buyerId],
    ),
  ]);

  const documents = [
    ...contracts.rows.map(row => ({
      id: row.id,
      name: row.file_name,
      group: 'Contracts',
      relatedTo: `Contract, version ${row.version}${row.label ? ' (' + row.label + ')' : ''}`,
      reference: row.reference,
      vendor: row.vendor,
      uploadedAt: row.uploaded_at,
      status: row.analysed ? 'Analysed' : 'Uploaded',
      to: '/contract/' + row.reference,
    })),
    ...questionnaire.rows.map(row => ({
      id: row.id,
      name: row.file_name,
      group: groupOf(row.doc_type),
      relatedTo: `Questionnaire, control ${row.control_id}`,
      reference: row.reference,
      vendor: row.vendor,
      uploadedAt: row.uploaded_at,
      expiresOn: day(row.expires_on),
      status: expiryStatus(row.expires_on),
      to: '/compliance/' + row.reference,
    })),
    ...actions.rows.map(row => ({
      id: row.id,
      name: row.file_name,
      group: 'Other',
      relatedTo: `${actionCode(row.number)}: ${row.title}`,
      reference: row.reference,
      vendor: row.vendor,
      uploadedAt: row.uploaded_at,
      status: row.submitted ? 'Submitted' : 'Not submitted',
      to: '/remediation/' + row.reference,
    })),
  ].sort((x, y) => new Date(y.uploadedAt) - new Date(x.uploadedAt));

  return { documents, groups: ['Contracts', 'Policies', 'Certificates', 'Other'] };
}
