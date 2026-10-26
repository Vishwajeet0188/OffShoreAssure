/* Assurance checks and control areas ASS-001 to ASS-015 (Stage 1 specification) and when each applies.
   PROVISIONAL applicability rules (pending the client's control-applicability mapping). Part of rule pack RP-2026.10-S1-draft. */
export const CONTROLS = [
  ['ASS-001', 'Legal Entity Verification', 'Supplier identity, registration and jurisdiction'],
  ['ASS-002', 'Information Security Governance', 'Security management framework, ISO 27001 or equivalent'],
  ['ASS-003', 'Identity and Access Management', 'MFA, least privilege, joiner/mover/leaver controls'],
  ['ASS-004', 'Data Protection Governance', 'Processing roles, DPA, data handling'],
  ['ASS-005', 'International Transfer Assurance', 'Exporter/importer, safeguards and transfer assessment'],
  ['ASS-006', 'Subprocessor Governance', 'Disclosure, approval, contractual flow-down'],
  ['ASS-007', 'Incident Response Assurance', 'Detection, escalation and notification procedures'],
  ['ASS-008', 'Business Continuity Assurance', 'BCP, DR, recovery testing'],
  ['ASS-009', 'Vulnerability Management', 'Patching, scanning, penetration-test evidence'],
  ['ASS-010', 'Personnel Security', 'Confidentiality, training, screening where appropriate'],
  ['ASS-011', 'Insurance Assurance', 'Cyber/professional indemnity where required'],
  ['ASS-012', 'Service Delivery Assurance', 'SLA, availability, response times'],
  ['ASS-013', 'Audit and Evidence Assurance', 'Audit rights and supporting evidence'],
  ['ASS-014', 'Data Retention and Exit', 'Deletion, return, retention and exit arrangements'],
  ['ASS-015', 'Sector-Specific Assurance', 'Applicable FCA/PRA, healthcare or other sector controls'],
].map(([id, name, verifies]) => ({ id, name, verifies }));

const maybe = v => v === 'Yes' || v === 'Unknown';
const has = (d, k, v) => (d[k] || []).includes(v);
const TECH = [
  'Servers & infrastructure',
  'Endpoints / devices',
  'Cloud consoles',
  'Network & security tools',
  'Databases',
];

/* Returns [{ id, name, verifies, reason, buyerRequested }] for the controls that apply. */
export function applicableControls(d, derived) {
  const out = [];
  const add = (id, reason, buyerRequested = false) => {
    const c = CONTROLS.find(x => x.id === id);
    out.push({ ...c, reason, buyerRequested });
  };
  const pd = maybe(d.personalData),
    priv = maybe(d.privilegedAccess),
    crit = ['High', 'Critical'].includes(d.serviceCriticality);
  const ar = v => has(d, 'assuranceRequirements', v);
  if (derived.vendorAssessmentRequired) {
    add(
      'ASS-001',
      'A vendor will deliver the service: its identity, registration and jurisdiction must be verified.',
    );
    add(
      'ASS-002',
      ar('ISO 27001 certification') || ar('SOC 2 Type II report') || ar('Cyber Essentials / Plus')
        ? 'Requested by the buyer (security certification).'
        : 'Vendor assessment required.',
      ar('ISO 27001 certification') || ar('SOC 2 Type II report') || ar('Cyber Essentials / Plus'),
    );
  }
  if (
    priv ||
    (d.systemsAccessed || []).length ||
    ['Remote', 'Hybrid'].includes(d.deliveryModel) ||
    ar('Multi-factor authentication (MFA)')
  )
    add(
      'ASS-003',
      priv
        ? 'Privileged access ' + (d.privilegedAccess === 'Yes' ? 'is required.' : 'is not yet confirmed.')
        : ar('Multi-factor authentication (MFA)')
          ? 'MFA requested by the buyer.'
          : 'The vendor accesses buyer systems remotely.',
      ar('Multi-factor authentication (MFA)'),
    );
  if (pd)
    add(
      'ASS-004',
      d.personalData === 'Yes' ? 'Personal data will be processed.' : 'Personal data status is unknown.',
    );
  if (derived.transferReviewRequired)
    add(
      'ASS-005',
      'Personal data may be stored in or accessed from outside ' +
        (d.buyerCountry === 'GB' ? 'the UK' : 'the buyer’s country') +
        '.',
    );
  if (['Allowed', 'Approval required'].includes(d.subprocessors) || d.cloudServices === 'Yes')
    add(
      'ASS-006',
      d.cloudServices === 'Yes'
        ? 'Cloud services are involved' +
            (d.subprocessors !== 'Prohibited'
              ? ' and subprocessors are ' + d.subprocessors.toLowerCase() + '.'
              : '.')
        : 'Subprocessors are ' + d.subprocessors.toLowerCase() + '.',
    );
  if (pd || priv || crit || ar('Incident notification'))
    add(
      'ASS-007',
      ar('Incident notification')
        ? 'Incident notification requested by the buyer.'
        : pd
          ? 'Personal-data breaches must be detected and notified.'
          : 'Privileged access or a high-criticality service.',
      ar('Incident notification'),
    );
  if (crit || d.supportHours === '24/7' || ar('Business continuity & disaster recovery plan'))
    add(
      'ASS-008',
      ar('Business continuity & disaster recovery plan')
        ? 'BCP/DR requested by the buyer.'
        : d.supportHours === '24/7'
          ? '24/7 support is required.'
          : 'High-criticality service.',
      ar('Business continuity & disaster recovery plan'),
    );
  if (
    priv ||
    (d.systemsAccessed || []).some(s => TECH.includes(s)) ||
    ar('Penetration testing') ||
    ar('Vulnerability & patch management')
  )
    add(
      'ASS-009',
      ar('Penetration testing') || ar('Vulnerability & patch management')
        ? 'Requested by the buyer.'
        : 'The vendor administers technical systems.',
      ar('Penetration testing') || ar('Vulnerability & patch management'),
    );
  if (pd || priv || ar('Staff screening & training'))
    add(
      'ASS-010',
      ar('Staff screening & training')
        ? 'Requested by the buyer.'
        : 'Vendor staff will handle personal data or have privileged access.',
      ar('Staff screening & training'),
    );
  if (crit || ar('Cyber / professional indemnity insurance'))
    add(
      'ASS-011',
      ar('Cyber / professional indemnity insurance')
        ? 'Requested by the buyer.'
        : 'High-criticality service.',
      ar('Cyber / professional indemnity insurance'),
    );
  add(
    'ASS-012',
    `Service levels for ${d.supportHours === 'Custom' ? 'custom' : (d.supportHours || '').toLowerCase()} support and ${String(d.serviceCriticality || '').toLowerCase()} criticality.`,
  );
  if (derived.contractReviewRequired || ar('Audit rights'))
    add(
      'ASS-013',
      ar('Audit rights')
        ? 'Audit rights requested by the buyer.'
        : 'Contract review required: audit rights and supporting evidence.',
      ar('Audit rights'),
    );
  if (pd || ar('Data return & deletion on exit'))
    add(
      'ASS-014',
      ar('Data return & deletion on exit')
        ? 'Requested by the buyer.'
        : 'Personal data must be returned or deleted at exit.',
      ar('Data return & deletion on exit'),
    );
  const sector = derived.jurisdictionPacks.find(p => p.startsWith('SECTOR-'));
  if (sector) add('ASS-015', `Sector overlay ${sector} applies (${d.buyerSector}).`);
  // Buyer requirements that map to a control already included are marked; encryption maps to ASS-002/ASS-004.
  if (ar('Encryption at rest and in transit'))
    for (const c of out) if (['ASS-002', 'ASS-004'].includes(c.id)) c.buyerRequested = true;
  return out;
}
