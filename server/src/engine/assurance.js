/* Stage 3 · Compliance assessment engine (client specification "Stage 3 Inputs and Outputs", steps 10–16).

   Step 10  start: assessment type, service scope, processing role, jurisdictions, reviewer, target date.
   Step 11  control set: each control is one question with 10 fields (ID, family, question, answer type,
            applicability rule, mandatory flag, evidence types, risk weight, legal reference, rule version).
   Step 14  validation and provisional score: PASS · PARTIAL · FAIL · UNKNOWN · NOT APPLICABLE · REVIEW REQUIRED.
   Step 15  the saved result rows (12 fields per control) and gap IDs.

   The engine works the same for directory vendors and buyer-added vendors. A vendor with no previously
   verified evidence (buyer-added, or not yet approved by OffshoreAssure) gets a fuller questionnaire.

   PROVISIONAL settings (marked "Provisional" below) are our reading of the specification and wait for the
   client's confirmation: continuity targets, the minimum insurance limit and the critical-control policy.
   Change them here only, and bump RULE_VERSION. */

import crypto from 'node:crypto';
import { countryName } from '../reference/countries.js';

export const RULE_VERSION = 'RP-2026.11-S3';
export const CONTROL_SET_VERSION = 'CS-2026.11-1';
export const QUESTIONNAIRE_VERSION = '1.0';

export const ASSESSMENT_TYPES = ['initial', 'renewal', 'event-driven'];
export const PROCESSING_ROLES = ['controller', 'processor', 'subprocessor', 'unknown'];

/* Provisional: what happens when a critical control is not resolved ('escalate' or 'block'). */
export const CRITICAL_POLICY = 'escalate';

/* Provisional: recovery targets (hours) by service criticality, until the buyer states its own. */
export const CONTINUITY_TARGETS = {
  Critical: { rto: 4, rpo: 1 },
  High: { rto: 8, rpo: 4 },
  Medium: { rto: 24, rpo: 12 },
  Low: { rto: 72, rpo: 24 },
};

/* Provisional: minimum insured limit (GBP). null = no minimum set, so only the expiry date is checked. */
export const INSURANCE_MINIMUM = null;

/* Status of each control (step 14) and the points it earns towards the weighted score. */
export const STATUSES = {
  PASS: { label: 'Pass', points: 1 },
  PARTIAL: { label: 'Partial', points: 0.5 },
  REVIEW_REQUIRED: { label: 'Review required', points: 0.5 },
  FAIL: { label: 'Fail', points: 0 },
  UNKNOWN: { label: 'Unknown', points: 0 },
  NOT_APPLICABLE: { label: 'Not applicable', points: null },
};

/* Why a control applies: legally mandatory, contractually required, buyer-required or recommended. */
export const LEVELS = {
  LEGAL: 'Legally mandatory',
  CONTRACT: 'Contractually required',
  BUYER: 'Buyer-required',
  RECOMMENDED: 'Recommended',
};

export const FAMILIES = {
  CORPORATE: 'Corporate and legal identity',
  INFOSEC: 'Information security',
  ACCESS: 'Access security',
  PRIVACY: 'Privacy',
  SUBPROCESSORS: 'Subprocessors',
  TRANSFER: 'International transfer',
  INCIDENT: 'Incident',
  CONTINUITY: 'Continuity',
  VULNERABILITY: 'Vulnerability management',
  PERSONNEL: 'Personnel security',
  INSURANCE: 'Insurance',
  SERVICE: 'Service delivery and audit',
  EXIT: 'Data retention and exit',
  SECTOR: 'Sector requirements',
};

/* Step 12: the documents a control can ask for. expires: an expiry date is required. */
export const DOCUMENT_TYPES = {
  REGISTRATION: { label: 'Company registration certificate or official extract' },
  INFOSEC_POLICY: { label: 'Information Security Policy' },
  PRIVACY_POLICY: { label: 'Privacy / Data Protection Policy' },
  ACCESS_POLICY: { label: 'Access Control and MFA Policy' },
  INCIDENT_PLAN: { label: 'Incident Response Plan' },
  BCP: { label: 'Business Continuity Plan' },
  DR_PLAN: { label: 'Disaster Recovery Plan' },
  CERTIFICATION: { label: 'ISO 27001 certificate, SOC 2 report or equivalent', expires: true },
  PENTEST: { label: 'Penetration-test summary', maxAgeMonths: 12 },
  INSURANCE_CERT: { label: 'Cyber / Professional Indemnity Insurance Certificate', expires: true },
  SUBPROCESSOR_REGISTER: { label: 'Subprocessor Register' },
  DATA_FLOW: { label: 'Data-Flow Diagram' },
  AGREEMENT: { label: 'Processing or transfer agreement (DPA, IDTA or UK Addendum)' },
  HR_POLICY: { label: 'HR / personnel security policy' },
  OTHER: { label: 'Other supporting document' },
};

/* Answer types (step 11) and the answers each accepts. */
export const ANSWER_TYPES = {
  YES_NO: { label: 'Yes/No', options: ['Yes', 'No'] },
  YES_NO_PARTIAL: { label: 'Yes/No/Partial', options: ['Yes', 'No', 'Partial'] },
  YES_NO_UNKNOWN: { label: 'Yes/No/Unknown', options: ['Yes', 'No', 'Unknown'] },
  YES_NO_REGISTRATION: { label: 'Yes/No + registration number', options: ['Yes', 'No'] },
  YES_NO_TABLE: { label: 'Yes/No + table of subprocessors', options: ['Yes', 'No'] },
  YES_NO_FILE: { label: 'Yes/No + file', options: ['Yes', 'No'] },
  COUNTRIES: { label: 'Country multi-select', options: [] },
  HOURS: { label: 'Numeric hours (RTO and RPO)', options: [] },
  AMOUNT_DATE: { label: 'Amount + expiry date', options: ['No'] },
};

/* ---------- Applicability helpers ---------- */
const maybe = v => v === 'Yes' || v === 'Unknown';
const pd = x => maybe(x.personalData);
const has = (x, ass) => x.ass.includes(ass);
const asked = (x, item) => (x.assuranceRequested || []).includes(item);
const processorRole = x => x.role !== 'controller';
const law = x => x.law;
const CERTS = ['ISO 27001 certification', 'SOC 2 Type II report', 'Cyber Essentials / Plus'];

/* rule: the applicability rule ID and its plain-English expression (stored with each control). */
const rule = (id, text, test) => ({ id, text, test });

/* ---------- Step 11: the control library ----------
   One entry = one question. ass: the Stage 1 control it belongs to (ASS-001 … ASS-015).
   good: the answer that passes ('Yes' by default; 'No' for a question where "No" is the safe answer;
   'either' when both answers are fine and only the consistency checks decide).
   critical: true or a function; an unresolved critical control triggers escalation (or a block).
   fuller: only asked when the vendor has no previously verified evidence. */
export const CONTROL_LIBRARY = [
  {
    id: 'CORP-01',
    family: 'CORPORATE',
    ass: 'ASS-001',
    question: 'Is the vendor registered as the stated legal entity?',
    help: 'Give the company registration number and upload the registration certificate or an official extract.',
    answerType: 'YES_NO_REGISTRATION',
    evidence: ['REGISTRATION'],
    weight: 1.5,
    critical: true,
    level: () => 'CONTRACT',
    legalRef: () => 'OA-S3-ENTITY',
    applies: rule('APP-ALWAYS', 'Always: the vendor’s identity must be confirmed.', () => true),
  },
  {
    id: 'CORP-02',
    family: 'CORPORATE',
    ass: 'ASS-001',
    fuller: true,
    question: 'Are the registered address and country of registration the same as in the vendor profile?',
    answerType: 'YES_NO',
    evidence: ['REGISTRATION'],
    weight: 0.5,
    level: () => 'RECOMMENDED',
    legalRef: () => 'OA-S3-ENTITY',
    applies: rule(
      'APP-UNVERIFIED',
      'The vendor has no previously verified evidence (buyer-added or not yet approved).',
      x => x.fuller,
    ),
  },
  {
    id: 'CORP-03',
    family: 'CORPORATE',
    ass: 'ASS-001',
    fuller: true,
    question:
      'Is the company, or any of its directors, subject to sanctions, insolvency or regulatory action?',
    help: '“No” is the expected answer. If “Yes”, explain in the box below.',
    answerType: 'YES_NO',
    good: 'No',
    evidence: [],
    weight: 1,
    critical: true,
    level: () => 'CONTRACT',
    legalRef: () => 'OA-S3-ENTITY',
    applies: rule(
      'APP-UNVERIFIED',
      'The vendor has no previously verified evidence (buyer-added or not yet approved).',
      x => x.fuller,
    ),
  },
  {
    id: 'SEC-01',
    family: 'INFOSEC',
    ass: 'ASS-002',
    question: 'Does the supplier maintain an information security management system?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['INFOSEC_POLICY', 'CERTIFICATION'],
    weight: 1.5,
    critical: x => pd(x),
    level: x => (pd(x) ? 'LEGAL' : 'RECOMMENDED'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 32` : 'OA-S3-SECURITY'),
    applies: rule('APP-ASS-002', 'Information security governance applies (Stage 1, ASS-002).', x =>
      has(x, 'ASS-002'),
    ),
  },
  {
    id: 'SEC-02',
    family: 'INFOSEC',
    ass: 'ASS-002',
    question:
      'Do you hold a current ISO 27001 certificate, SOC 2 report or equivalent that covers this service?',
    help: 'This gives assurance but is not a legal requirement in itself.',
    answerType: 'YES_NO',
    evidence: ['CERTIFICATION'],
    expiryCritical: true,
    scopeCheck: true,
    weight: 1,
    level: () => 'BUYER',
    legalRef: () => 'BUYER-ASSURANCE',
    applies: rule('APP-CERT-REQUESTED', 'The buyer asked for a security certification.', x =>
      CERTS.some(c => asked(x, c)),
    ),
  },
  {
    id: 'SEC-03',
    family: 'INFOSEC',
    ass: 'ASS-002',
    fuller: true,
    question:
      'Has the security management system been independently audited or reviewed in the last 12 months?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['CERTIFICATION', 'PENTEST', 'OTHER'],
    weight: 0.5,
    level: () => 'RECOMMENDED',
    legalRef: () => 'OA-S3-SECURITY',
    applies: rule(
      'APP-UNVERIFIED',
      'The vendor has no previously verified evidence (buyer-added or not yet approved).',
      x => x.fuller && has(x, 'ASS-002'),
    ),
  },
  {
    id: 'SEC-04',
    family: 'INFOSEC',
    ass: 'ASS-002',
    question: 'Is the buyer’s data encrypted at rest and in transit?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['INFOSEC_POLICY'],
    weight: 1,
    level: x => (asked(x, 'Encryption at rest and in transit') ? 'BUYER' : 'LEGAL'),
    legalRef: x => (asked(x, 'Encryption at rest and in transit') ? 'BUYER-ASSURANCE' : `${law(x)} Art. 32`),
    applies: rule(
      'APP-PD-OR-ENCRYPTION',
      'Personal data is processed, or the buyer asked for encryption.',
      x => pd(x) || asked(x, 'Encryption at rest and in transit'),
    ),
  },
  {
    id: 'ACC-01',
    family: 'ACCESS',
    ass: 'ASS-003',
    question: 'Is MFA mandatory for privileged accounts?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['ACCESS_POLICY'],
    mfaCheck: true,
    weight: 2,
    critical: x => maybe(x.privilegedAccess) || asked(x, 'Multi-factor authentication (MFA)'),
    level: x => (asked(x, 'Multi-factor authentication (MFA)') ? 'BUYER' : pd(x) ? 'LEGAL' : 'RECOMMENDED'),
    legalRef: x =>
      asked(x, 'Multi-factor authentication (MFA)')
        ? 'BUYER-ASSURANCE'
        : pd(x)
          ? `${law(x)} Art. 32`
          : 'OA-S3-ACCESS',
    applies: rule('APP-ASS-003', 'Identity and access management applies (Stage 1, ASS-003).', x =>
      has(x, 'ASS-003'),
    ),
  },
  {
    id: 'ACC-02',
    family: 'ACCESS',
    ass: 'ASS-003',
    question: 'Is MFA used for all remote access to the buyer’s systems?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['ACCESS_POLICY'],
    weight: 1,
    level: x => (asked(x, 'Multi-factor authentication (MFA)') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x => (asked(x, 'Multi-factor authentication (MFA)') ? 'BUYER-ASSURANCE' : 'OA-S3-ACCESS'),
    applies: rule('APP-ASS-003', 'Identity and access management applies (Stage 1, ASS-003).', x =>
      has(x, 'ASS-003'),
    ),
  },
  {
    id: 'ACC-03',
    family: 'ACCESS',
    ass: 'ASS-003',
    question: 'Is access given on a least-privilege basis and reviewed at least every quarter?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['ACCESS_POLICY'],
    weight: 1,
    level: x => (pd(x) ? 'LEGAL' : 'RECOMMENDED'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 32` : 'OA-S3-ACCESS'),
    applies: rule('APP-ASS-003', 'Identity and access management applies (Stage 1, ASS-003).', x =>
      has(x, 'ASS-003'),
    ),
  },
  {
    id: 'ACC-04',
    family: 'ACCESS',
    ass: 'ASS-003',
    question: 'Is access removed within 24 hours when staff leave or change role?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['ACCESS_POLICY'],
    weight: 1,
    level: () => 'RECOMMENDED',
    legalRef: () => 'OA-S3-ACCESS',
    applies: rule('APP-ASS-003', 'Identity and access management applies (Stage 1, ASS-003).', x =>
      has(x, 'ASS-003'),
    ),
  },
  {
    id: 'PRV-01',
    family: 'PRIVACY',
    ass: 'ASS-004',
    question: 'Does the vendor process personal data only on the buyer’s documented instructions?',
    answerType: 'YES_NO_UNKNOWN',
    evidence: ['AGREEMENT'],
    weight: 2,
    critical: true,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Art. 28(3)(a)`,
    applies: rule(
      'APP-PD-PROCESSOR',
      'Personal data is processed and the vendor is not an independent controller.',
      x => pd(x) && processorRole(x),
    ),
  },
  {
    id: 'PRV-02',
    family: 'PRIVACY',
    ass: 'ASS-004',
    question: 'Do you have a privacy / data protection policy that covers the buyer’s data protection law?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['PRIVACY_POLICY'],
    weight: 1,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Art. 24`,
    applies: rule('APP-PD', 'Personal data is processed (Stage 1, ASS-004).', x => pd(x)),
  },
  {
    id: 'PRV-03',
    family: 'PRIVACY',
    ass: 'ASS-004',
    question: 'Do you keep a record of the processing you carry out for clients?',
    answerType: 'YES_NO',
    evidence: [],
    weight: 0.5,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Art. 30(2)`,
    applies: rule(
      'APP-PD-PROCESSOR',
      'Personal data is processed and the vendor is not an independent controller.',
      x => pd(x) && processorRole(x),
    ),
  },
  {
    id: 'SUB-01',
    family: 'SUBPROCESSORS',
    ass: 'ASS-006',
    question: 'Are additional processors (subprocessors) engaged?',
    help: 'If “Yes”, list each one with its country and what it does, and upload your subprocessor register.',
    answerType: 'YES_NO_TABLE',
    good: 'either',
    evidence: ['SUBPROCESSOR_REGISTER'],
    evidenceWhen: 'Yes',
    subprocessorCheck: true,
    weight: 1.5,
    critical: x => x.subprocessors === 'Prohibited',
    level: x => (pd(x) ? 'LEGAL' : 'CONTRACT'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 28(2)` : 'OA-S3-SUBPROCESSORS'),
    applies: rule('APP-ASS-006', 'Subprocessor governance applies (Stage 1, ASS-006).', x =>
      has(x, 'ASS-006'),
    ),
  },
  {
    id: 'SUB-02',
    family: 'SUBPROCESSORS',
    ass: 'ASS-006',
    question:
      'Will you ask the buyer before adding or changing a subprocessor, and pass on the same data protection duties?',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 1,
    level: x => (pd(x) ? 'LEGAL' : 'CONTRACT'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 28(2) and 28(4)` : 'OA-S3-SUBPROCESSORS'),
    applies: rule('APP-ASS-006', 'Subprocessor governance applies (Stage 1, ASS-006).', x =>
      has(x, 'ASS-006'),
    ),
  },
  {
    id: 'TRF-01',
    family: 'TRANSFER',
    ass: 'ASS-005',
    question: 'From which countries can staff access the buyer’s data?',
    answerType: 'COUNTRIES',
    countries: 'access',
    evidence: ['DATA_FLOW'],
    weight: 1.5,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Chapter V`,
    applies: rule(
      'APP-ASS-005',
      'Data may be stored in or accessed from another country (Stage 1, ASS-005).',
      x => has(x, 'ASS-005'),
    ),
  },
  {
    id: 'TRF-02',
    family: 'TRANSFER',
    ass: 'ASS-005',
    question: 'In which countries is the buyer’s data stored or hosted?',
    answerType: 'COUNTRIES',
    countries: 'storage',
    evidence: ['DATA_FLOW'],
    weight: 1,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Chapter V`,
    applies: rule(
      'APP-ASS-005',
      'Data may be stored in or accessed from another country (Stage 1, ASS-005).',
      x => has(x, 'ASS-005'),
    ),
  },
  {
    id: 'TRF-03',
    family: 'TRANSFER',
    ass: 'ASS-005',
    question:
      'Is a transfer mechanism in place for personal data leaving the buyer’s country (e.g. IDTA or UK Addendum)?',
    answerType: 'YES_NO_UNKNOWN',
    evidence: ['AGREEMENT'],
    weight: 1.5,
    critical: true,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Art. 46`,
    applies: rule(
      'APP-ASS-005-PD',
      'Personal data leaves the buyer’s country (Stage 1, ASS-005).',
      x => has(x, 'ASS-005') && pd(x),
    ),
  },
  {
    id: 'INC-01',
    family: 'INCIDENT',
    ass: 'ASS-007',
    question: 'Is there a documented incident escalation process?',
    answerType: 'YES_NO_FILE',
    evidence: ['INCIDENT_PLAN'],
    weight: 1.5,
    critical: x => pd(x),
    level: x => (asked(x, 'Incident notification') ? 'BUYER' : pd(x) ? 'LEGAL' : 'RECOMMENDED'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 28(3)(f) and 33(2)` : 'OA-S3-INCIDENT'),
    applies: rule('APP-ASS-007', 'Incident response applies (Stage 1, ASS-007).', x => has(x, 'ASS-007')),
  },
  {
    id: 'INC-02',
    family: 'INCIDENT',
    ass: 'ASS-007',
    question: 'Can you tell the buyer about a personal-data breach without undue delay, and within 24 hours?',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 1,
    level: () => 'LEGAL',
    legalRef: x => `${law(x)} Art. 33(2)`,
    applies: rule(
      'APP-ASS-007-PD',
      'Incident response applies and personal data is processed.',
      x => has(x, 'ASS-007') && pd(x),
    ),
  },
  {
    id: 'BCP-01',
    family: 'CONTINUITY',
    ass: 'ASS-008',
    question: 'What are the RTO and RPO for this service?',
    help: 'Recovery time objective (RTO) and recovery point objective (RPO), in hours.',
    answerType: 'HOURS',
    evidence: ['BCP', 'DR_PLAN'],
    weight: 1.5,
    critical: x => x.criticality === 'Critical',
    level: x => (asked(x, 'Business continuity & disaster recovery plan') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x =>
      asked(x, 'Business continuity & disaster recovery plan') ? 'BUYER-ASSURANCE' : 'OA-S3-CONTINUITY',
    applies: rule('APP-ASS-008', 'Business continuity applies (Stage 1, ASS-008).', x => has(x, 'ASS-008')),
  },
  {
    id: 'BCP-02',
    family: 'CONTINUITY',
    ass: 'ASS-008',
    question: 'Has the business continuity and disaster recovery plan been tested in the last 12 months?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['BCP', 'DR_PLAN'],
    weight: 1,
    level: x => (asked(x, 'Business continuity & disaster recovery plan') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x =>
      asked(x, 'Business continuity & disaster recovery plan') ? 'BUYER-ASSURANCE' : 'OA-S3-CONTINUITY',
    applies: rule('APP-ASS-008', 'Business continuity applies (Stage 1, ASS-008).', x => has(x, 'ASS-008')),
  },
  {
    id: 'VUL-01',
    family: 'VULNERABILITY',
    ass: 'ASS-009',
    question: 'Has an independent penetration test been carried out in the last 12 months?',
    answerType: 'YES_NO',
    evidence: ['PENTEST'],
    weight: 1,
    level: x => (asked(x, 'Penetration testing') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x => (asked(x, 'Penetration testing') ? 'BUYER-ASSURANCE' : 'OA-S3-VULNERABILITY'),
    applies: rule('APP-ASS-009', 'Vulnerability management applies (Stage 1, ASS-009).', x =>
      has(x, 'ASS-009'),
    ),
  },
  {
    id: 'VUL-02',
    family: 'VULNERABILITY',
    ass: 'ASS-009',
    question: 'Are critical security patches applied within 14 days?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['INFOSEC_POLICY'],
    weight: 1,
    level: x => (asked(x, 'Vulnerability & patch management') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x => (asked(x, 'Vulnerability & patch management') ? 'BUYER-ASSURANCE' : 'OA-S3-VULNERABILITY'),
    applies: rule('APP-ASS-009', 'Vulnerability management applies (Stage 1, ASS-009).', x =>
      has(x, 'ASS-009'),
    ),
  },
  {
    id: 'PER-01',
    family: 'PERSONNEL',
    ass: 'ASS-010',
    question: 'Are relevant staff subject to confidentiality commitments?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['HR_POLICY'],
    weight: 1.5,
    critical: x => pd(x),
    level: x => (pd(x) ? 'LEGAL' : 'RECOMMENDED'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 28(3)(b)` : 'OA-S3-PERSONNEL'),
    applies: rule('APP-ASS-010', 'Personnel security applies (Stage 1, ASS-010).', x => has(x, 'ASS-010')),
  },
  {
    id: 'PER-02',
    family: 'PERSONNEL',
    ass: 'ASS-010',
    question: 'Do staff receive security and data protection training every year?',
    answerType: 'YES_NO_PARTIAL',
    evidence: ['HR_POLICY'],
    weight: 0.5,
    level: x => (asked(x, 'Staff screening & training') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x => (asked(x, 'Staff screening & training') ? 'BUYER-ASSURANCE' : 'OA-S3-PERSONNEL'),
    applies: rule('APP-ASS-010', 'Personnel security applies (Stage 1, ASS-010).', x => has(x, 'ASS-010')),
  },
  {
    id: 'PER-03',
    family: 'PERSONNEL',
    ass: 'ASS-010',
    question: 'Are background checks carried out on staff with privileged access, where the law allows?',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 0.5,
    level: x => (asked(x, 'Staff screening & training') ? 'BUYER' : 'RECOMMENDED'),
    legalRef: x => (asked(x, 'Staff screening & training') ? 'BUYER-ASSURANCE' : 'OA-S3-PERSONNEL'),
    applies: rule(
      'APP-PRIVILEGED',
      'Personnel security applies and staff have privileged access.',
      x => has(x, 'ASS-010') && (maybe(x.privilegedAccess) || asked(x, 'Staff screening & training')),
    ),
  },
  {
    id: 'INS-01',
    family: 'INSURANCE',
    ass: 'ASS-011',
    question: 'What is the insured limit and expiry date?',
    help: 'Cyber and professional indemnity cover. Choose “No cover” if you have none.',
    answerType: 'AMOUNT_DATE',
    evidence: ['INSURANCE_CERT'],
    expiryCritical: true,
    weight: 1,
    level: x => (asked(x, 'Cyber / professional indemnity insurance') ? 'BUYER' : 'CONTRACT'),
    legalRef: x =>
      asked(x, 'Cyber / professional indemnity insurance') ? 'BUYER-ASSURANCE' : 'OA-S3-INSURANCE',
    applies: rule('APP-ASS-011', 'Insurance assurance applies (Stage 1, ASS-011).', x => has(x, 'ASS-011')),
  },
  {
    id: 'SVC-01',
    family: 'SERVICE',
    ass: 'ASS-012',
    question: 'Can you meet the required service levels and report on them every month?',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 0.5,
    level: () => 'CONTRACT',
    legalRef: () => 'OA-S3-SERVICE',
    applies: rule('APP-ASS-012', 'Service delivery assurance applies (Stage 1, ASS-012).', x =>
      has(x, 'ASS-012'),
    ),
  },
  {
    id: 'AUD-01',
    family: 'SERVICE',
    ass: 'ASS-013',
    question: 'Will you let the buyer (or its auditors) audit you and give supporting evidence?',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 1,
    level: x => (pd(x) ? 'LEGAL' : asked(x, 'Audit rights') ? 'BUYER' : 'CONTRACT'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 28(3)(h)` : 'OA-S3-AUDIT'),
    applies: rule('APP-ASS-013', 'Audit and evidence assurance applies (Stage 1, ASS-013).', x =>
      has(x, 'ASS-013'),
    ),
  },
  {
    id: 'EXT-01',
    family: 'EXIT',
    ass: 'ASS-014',
    question:
      'Will you return or securely delete the buyer’s data at the end of the contract and confirm it in writing?',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 1,
    level: x => (pd(x) ? 'LEGAL' : 'BUYER'),
    legalRef: x => (pd(x) ? `${law(x)} Art. 28(3)(g)` : 'BUYER-ASSURANCE'),
    applies: rule('APP-ASS-014', 'Data retention and exit applies (Stage 1, ASS-014).', x =>
      has(x, 'ASS-014'),
    ),
  },
  {
    id: 'SCT-01',
    family: 'SECTOR',
    ass: 'ASS-015',
    question:
      'Can you support the buyer’s sector outsourcing rules, including access for the buyer’s regulator?',
    help: 'For example FCA SYSC 8 and PRA SS2/21 for financial services.',
    answerType: 'YES_NO_PARTIAL',
    evidence: [],
    weight: 1,
    critical: true,
    level: () => 'LEGAL',
    legalRef: x => x.sectorRule || 'SECTOR',
    applies: rule('APP-ASS-015', 'A sector overlay applies (Stage 1, ASS-015).', x => has(x, 'ASS-015')),
  },
];

const SECTOR_RULES = {
  'Financial Services': 'FCA SYSC 8 / PRA SS2/21',
  Healthcare: 'Health and care data guidance',
  'Public Sector': 'Public sector security requirements',
};

/* ---------- Step 10: the context the engine receives ---------- */

/* Default start fields for the Step 10 form (the buyer can change them). */
export function startDefaults(d, vendor) {
  const countries = [
    d.buyerCountry,
    ...(d.storageCountries || []),
    ...(d.remoteAccessCountries || []),
    vendor?.country,
  ].filter(c => c && c !== 'UNKNOWN');
  return {
    assessmentType: 'initial',
    serviceScope: [d.serviceCategory, d.serviceDescription].filter(Boolean).join(': ').slice(0, 2000),
    processingRole: d.personalData === 'No' ? 'unknown' : 'processor',
    jurisdictions: [...new Set(countries)],
  };
}

/* Everything the engine needs to pick and score controls. It is stored with the questionnaire, so a later
   re-score (e.g. the monitoring job) uses the same inputs. */
export function buildContext({ d, derived, controls, vendor, start }) {
  const bc = d.buyerCountry || 'GB';
  const EEA = derived.jurisdictionPacks?.includes('EU-GDPR');
  return {
    law: bc === 'GB' ? 'UK GDPR' : EEA ? 'EU GDPR' : 'Data protection law',
    buyerCountry: bc,
    personalData: d.personalData,
    privilegedAccess: d.privilegedAccess,
    criticality: d.serviceCriticality,
    riskTier: derived.riskTier,
    sector: d.buyerSector || null,
    sectorRule: SECTOR_RULES[d.buyerSector] || null,
    ass: controls.map(c => c.id),
    buyerRequested: controls.filter(c => c.buyerRequested).map(c => c.id),
    assuranceRequested: d.assuranceRequirements || [],
    subprocessors: d.subprocessors || null,
    cloudServices: d.cloudServices || null,
    storageCountries: (d.storageCountries || []).filter(c => c !== 'UNKNOWN'),
    remoteCountries: (d.remoteAccessCountries || []).filter(c => c !== 'UNKNOWN'),
    restrictedCountries: d.restrictedCountries || [],
    targets: CONTINUITY_TARGETS[d.serviceCriticality] || CONTINUITY_TARGETS.Medium,
    insuranceMinimum: INSURANCE_MINIMUM,
    policy: CRITICAL_POLICY,
    fuller: vendor.source === 'buyer_provided' || vendor.verification_status !== 'approved',
    vendor: {
      id: vendor.id,
      name: vendor.name,
      source: vendor.source === 'buyer_provided' ? 'BUYER_PROVIDED' : 'DIRECTORY',
      verified: vendor.verification_status === 'approved',
      registrationNumber: vendor.registration_number || null,
      country: vendor.country || null,
      deliveryCountries: vendor.delivery_countries || [],
    },
    assessmentType: start.assessmentType,
    serviceScope: start.serviceScope,
    role: start.processingRole,
    jurisdictions: start.jurisdictions,
    serviceKeywords: keywords([d.serviceCategory, start.serviceScope].join(' ')),
  };
}

const STOP = new Set(
  'the and for with from that this will our your their its are all any of to in on by an a as or be is at it per staff service services support'.split(
    ' ',
  ),
);
export const keywords = text => [
  ...new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 3 && !STOP.has(w)),
  ),
];

/* ---------- Step 11: generate the control set ---------- */
const evalField = (v, x) => (typeof v === 'function' ? v(x) : v);

export function generateControlSet(x) {
  const controls = [],
    notApplicable = [];
  for (const c of CONTROL_LIBRARY) {
    const applies = !!c.applies.test(x);
    const row = {
      id: c.id,
      family: c.family,
      familyLabel: FAMILIES[c.family],
      ass: c.ass,
      question: c.question,
      help: c.help || '',
      answerType: c.answerType,
      applicability: { rule: c.applies.id, text: c.applies.text, result: applies },
      mandatory: applies,
      evidence: c.evidence,
      evidenceWhen: c.evidenceWhen || null,
      weight: c.weight,
      legalRef: evalField(c.legalRef, x),
      ruleVersion: RULE_VERSION,
      level: evalField(c.level, x),
      critical: !!evalField(c.critical, x),
      good: c.good || 'Yes',
      fuller: !!c.fuller,
      checks: {
        mfa: !!c.mfaCheck,
        subprocessors: !!c.subprocessorCheck,
        scope: !!c.scopeCheck,
        countries: c.countries || null,
        expiryCritical: !!c.expiryCritical,
      },
    };
    (applies ? controls : notApplicable).push(row);
  }
  const documents = [...new Set(controls.flatMap(c => c.evidence))]
    .filter(t => t !== 'OTHER')
    .map(t => ({
      type: t,
      label: DOCUMENT_TYPES[t].label,
      controls: controls.filter(c => c.evidence.includes(t)).map(c => c.id),
      expires: !!DOCUMENT_TYPES[t].expires,
    }));
  return {
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    controlSetVersion: CONTROL_SET_VERSION,
    ruleVersion: RULE_VERSION,
    libraryCount: CONTROL_LIBRARY.length,
    families: [...new Set(controls.map(c => c.family))],
    controls,
    notApplicable,
    documents,
    context: x,
  };
}

/* ---------- Step 13: answers ---------- */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = s => DATE.test(String(s || '')) && !isNaN(new Date(s));
const ISO = /^[A-Z]{2}$/;
const num = v => (v === '' || v == null ? null : Number(v));

/* Cleans one answer for a control. Draft answers may be incomplete, but every value must have the right type.
   Returns { value } or { error }. value = null removes the answer. */
export function cleanAnswer(control, raw = {}) {
  const explanation = String(raw.explanation ?? '')
    .trim()
    .slice(0, 2000);
  const t = ANSWER_TYPES[control.answerType];
  const out = { answer: null, explanation: explanation || null };
  if (t.options.length && raw.answer != null && raw.answer !== '') {
    if (!t.options.includes(raw.answer)) return { error: `${control.id}: choose ${t.options.join(', ')}.` };
    out.answer = raw.answer;
  }
  if (control.answerType === 'YES_NO_REGISTRATION') {
    out.registrationNumber =
      String(raw.registrationNumber ?? '')
        .trim()
        .slice(0, 60) || null;
  }
  if (control.answerType === 'YES_NO_TABLE') {
    const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 50) : [];
    out.rows = [];
    for (const r of rows) {
      const name = String(r?.name ?? '')
        .trim()
        .slice(0, 200);
      const country = String(r?.country ?? '').trim();
      const service = String(r?.service ?? '')
        .trim()
        .slice(0, 200);
      if (!name && !country && !service) continue;
      if (country && !ISO.test(country))
        return { error: `${control.id}: choose a country for each subprocessor.` };
      out.rows.push({ name, country: country || null, service });
    }
  }
  if (control.answerType === 'COUNTRIES') {
    const list = Array.isArray(raw.countries) ? raw.countries : [];
    if (list.some(c => !ISO.test(String(c))))
      return { error: `${control.id}: choose countries from the list.` };
    out.countries = [...new Set(list)].slice(0, 60);
    if (out.countries.length) out.answer = 'Provided';
  }
  if (control.answerType === 'HOURS') {
    for (const k of ['rto', 'rpo']) {
      const v = num(raw[k]);
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 8760))
        return { error: `${control.id}: enter the ${k.toUpperCase()} in hours (0 to 8,760).` };
      out[k] = v;
    }
    if (out.rto != null && out.rpo != null) out.answer = 'Provided';
  }
  if (control.answerType === 'AMOUNT_DATE') {
    if (out.answer !== 'No') {
      const amount = num(raw.amount);
      if (amount != null && (!Number.isFinite(amount) || amount <= 0))
        return { error: `${control.id}: enter the insured limit as a number.` };
      if (raw.expiresOn && !isDate(raw.expiresOn))
        return { error: `${control.id}: enter a valid expiry date.` };
      out.amount = amount;
      out.currency = /^[A-Z]{3}$/.test(String(raw.currency || '')) ? raw.currency : 'GBP';
      out.expiresOn = raw.expiresOn || null;
      if (amount != null && out.expiresOn) out.answer = 'Provided';
    }
  }
  const empty =
    !out.answer &&
    !out.explanation &&
    !out.registrationNumber &&
    !(out.rows || []).length &&
    !(out.countries || []).length &&
    out.rto == null &&
    out.rpo == null &&
    out.amount == null;
  return { value: empty ? null : out };
}

/* Is the control answered completely enough to count? (Completeness check.) */
export function isAnswered(control, v) {
  if (!v || !v.answer) return false;
  if (control.answerType === 'YES_NO_REGISTRATION' && v.answer === 'Yes') return !!v.registrationNumber;
  if (control.answerType === 'YES_NO_TABLE' && v.answer === 'Yes') return (v.rows || []).some(r => r.name);
  return true;
}

/* Step 13 output: completeness. Mandatory questions must be answered before submission. */
export function completeness(qn, answers, only = null) {
  const list = qn.controls.filter(c => !only || only.includes(c.id));
  const answered = list.filter(c => isAnswered(c, answers[c.id])).length;
  const missing = list.filter(c => c.mandatory && !isAnswered(c, answers[c.id])).map(c => c.id);
  return {
    total: list.length,
    answered,
    percent: list.length ? Math.round((answered / list.length) * 100) : 100,
    missing,
    complete: missing.length === 0,
  };
}

/* ---------- Step 14: validate and calculate the provisional score ---------- */
const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const day = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const names = list => list.map(c => countryName(c) || c).join(', ');
const norm = s =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/* The state of one evidence document today: usable, expired, unreadable, mismatch, review or rejected. */
export function evidenceState(e, today) {
  if (e.reviewStatus === 'REJECTED') return 'rejected';
  if (e.expiresOn && days(e.expiresOn, today) < 0) return 'expired';
  const maxAge = DOCUMENT_TYPES[e.docType]?.maxAgeMonths;
  if (maxAge && e.issuedOn && days(today, e.issuedOn) > maxAge * 31) return 'expired';
  if (e.reviewStatus === 'VERIFIED') return 'verified';
  if (e.processingStatus === 'UNREADABLE') return 'unreadable';
  if (e.processingStatus === 'MISMATCH') return 'mismatch';
  if (e.processingStatus === 'NEEDS_REVIEW') return 'review';
  return 'accepted';
}

/* Score one control. Returns { status, confidence, reasons: [{kind, text}], evidenceIds }. */
function assessControl(c, v, evidence, x, today) {
  const reasons = [];
  const add = (kind, text) => reasons.push({ kind, text });
  const docs = evidence.filter(e => e.controlId === c.id);
  const states = docs.map(e => ({ e, s: evidenceState(e, today) }));
  const usable = states.filter(d => d.s === 'verified' || d.s === 'accepted');
  const accepted = c.evidence.length ? usable.filter(d => c.evidence.includes(d.e.docType)) : [];
  let status;

  if (!isAnswered(c, v)) {
    add('missing', v?.answer === 'Yes' ? 'The answer is incomplete.' : 'Not answered.');
    return { status: 'UNKNOWN', confidence: 'Low', reasons, evidenceIds: docs.map(e => e.id) };
  }
  const a = v.answer;
  if (a === 'Unknown') {
    add('unknown', 'The vendor answered “Unknown”.');
    status = 'UNKNOWN';
  } else if (['Yes', 'No', 'Partial'].includes(a) && c.answerType !== 'AMOUNT_DATE') {
    if (c.good === 'either') status = 'PASS';
    else if (a === 'Partial') {
      status = 'PARTIAL';
      add('partial', 'The vendor answered “Partial”.');
    } else if (a === c.good) status = 'PASS';
    else {
      status = 'FAIL';
      add('answer', `The vendor answered “${a}”.`);
    }
  }

  // Answer-specific checks.
  if (c.answerType === 'YES_NO_REGISTRATION' && a === 'Yes') {
    const stated = x.vendor.registrationNumber;
    if (stated && norm(stated) !== norm(v.registrationNumber)) {
      status = 'REVIEW_REQUIRED';
      add(
        'mismatch',
        `Entity match: registration number “${v.registrationNumber}” differs from the vendor profile (“${stated}”).`,
      );
    }
  }
  if (c.checks.subprocessors) {
    const rows = (v.rows || []).filter(r => r.name);
    if (a === 'Yes' && x.subprocessors === 'Prohibited') {
      status = 'FAIL';
      add('answer', 'Subprocessors are engaged, but the buyer does not allow subprocessors.');
    }
    if (a === 'No' && x.cloudServices === 'Yes') {
      status = 'REVIEW_REQUIRED';
      add(
        'contradiction',
        'Subprocessor disclosure: “No” was answered, but the service uses cloud services, whose provider is normally a subprocessor.',
      );
    }
    const register = usable.find(d => d.e.docType === 'SUBPROCESSOR_REGISTER');
    if (register && a === 'No' && register.e.facts?.listsEntries) {
      status = 'REVIEW_REQUIRED';
      add(
        'contradiction',
        'Subprocessor disclosure: “No” was answered, but the register lists subprocessors.',
      );
    }
    if (register && a === 'Yes' && register.e.facts?.readable) {
      const missing = rows.filter(r => !mentions(register.e.facts, r.name));
      if (missing.length) {
        status = 'REVIEW_REQUIRED';
        add(
          'contradiction',
          `Subprocessor disclosure: ${missing.map(r => r.name).join(', ')} not found in the subprocessor register.`,
        );
      }
    }
    const outside = rows.filter(r => r.country && x.restrictedCountries.includes(r.country));
    if (outside.length) {
      status = 'FAIL';
      add(
        'answer',
        `A subprocessor is in a country the buyer restricts (${names(outside.map(r => r.country))}).`,
      );
    }
  }
  if (c.answerType === 'COUNTRIES') {
    const list = v.countries || [];
    const restricted = list.filter(k => x.restrictedCountries.includes(k));
    const expected =
      c.checks.countries === 'storage'
        ? [x.buyerCountry, ...x.storageCountries]
        : [x.buyerCountry, ...x.remoteCountries];
    const extra = list.filter(k => !expected.includes(k) && !restricted.includes(k));
    status = 'PASS';
    if (restricted.length) {
      status = 'FAIL';
      add(
        'answer',
        `Data location: ${names(restricted)} ${restricted.length === 1 ? 'is' : 'are'} restricted by the buyer.`,
      );
    } else if (extra.length) {
      status = 'REVIEW_REQUIRED';
      add(
        'location',
        `Data location: clarification of ${names(extra)} ${c.checks.countries === 'storage' ? 'hosting' : 'remote access'} (not in the buyer’s requirement).`,
      );
    }
    const flow = usable.find(d => d.e.docType === 'DATA_FLOW' && d.e.facts?.readable);
    const shown = (flow?.e.facts?.countries || []).filter(k => k !== x.buyerCountry && !list.includes(k));
    if (flow && shown.length && status !== 'FAIL') {
      status = 'REVIEW_REQUIRED';
      add(
        'location',
        `Data location: the data-flow diagram also shows ${names(shown)}; the answer does not.`,
      );
    }
  }
  if (c.answerType === 'HOURS') {
    const t = x.targets;
    const late = [];
    if (v.rto > t.rto) late.push(`RTO ${v.rto} h is above the target of ${t.rto} h`);
    if (v.rpo > t.rpo) late.push(`RPO ${v.rpo} h is above the target of ${t.rpo} h`);
    status = late.length ? 'FAIL' : 'PASS';
    if (late.length)
      add(
        'threshold',
        `Continuity: ${late.join('; ')} (provisional target for ${String(x.criticality).toLowerCase()} criticality).`,
      );
  }
  if (c.answerType === 'AMOUNT_DATE') {
    if (a === 'No') {
      status = 'FAIL';
      add('answer', 'The vendor has no insurance cover.');
    } else if (days(v.expiresOn, today) < 0) {
      status = 'FAIL';
      add('expired', `Insurance expired on ${v.expiresOn}.`);
    } else if (x.insuranceMinimum && v.amount < x.insuranceMinimum) {
      status = 'PARTIAL';
      add('threshold', `Insured limit ${v.amount} is below the minimum of ${x.insuranceMinimum}.`);
    } else status = 'PASS';
  }

  // Evidence: a positive claim needs a current, readable document of an accepted type.
  const needsEvidence =
    c.evidence.length && ['PASS', 'PARTIAL'].includes(status) && (!c.evidenceWhen || c.evidenceWhen === a);
  if (needsEvidence && !accepted.length) {
    const wanted = states.filter(d => c.evidence.includes(d.e.docType));
    const label = c.evidence
      .filter(t => t !== 'OTHER')
      .map(t => DOCUMENT_TYPES[t].label)
      .join(' or ');
    if (!wanted.length) {
      status = 'PARTIAL';
      add('evidence', `Missing evidence: ${label}.`);
    } else if (wanted.every(d => d.s === 'expired')) {
      status = c.checks.expiryCritical ? 'FAIL' : 'PARTIAL';
      add('expired', `Document validity: ${wanted.map(d => `“${d.e.fileName}”`).join(', ')} expired.`);
    } else if (wanted.some(d => d.s === 'mismatch')) {
      status = 'REVIEW_REQUIRED';
      add('mismatch', `Entity match: the document does not name ${x.vendor.name}.`);
    } else if (wanted.some(d => d.s === 'unreadable')) {
      status = 'REVIEW_REQUIRED';
      add('unreadable', 'The document could not be read: replace it or review it by hand.');
    } else if (wanted.some(d => d.s === 'review')) {
      status = 'REVIEW_REQUIRED';
      add('review', 'Evidence quality: the document needs human review.');
    } else {
      status = 'PARTIAL';
      add('evidence', `Missing evidence: ${label} (the document sent was not accepted).`);
    }
  }
  // Access control: MFA claimed, but the policy excludes privileged accounts → contradiction.
  if (c.checks.mfa && ['Yes', 'Partial'].includes(a)) {
    const contra = accepted.find(d => d.e.facts?.mfaExcludesPrivileged);
    if (contra) {
      status = 'REVIEW_REQUIRED';
      add(
        'contradiction',
        `Access control: MFA is claimed, but “${contra.e.fileName}” appears to exclude privileged accounts. Clarification requested.`,
      );
    }
  }
  // Certification scope: the certificate should cover the assessed service.
  if (c.checks.scope && status === 'PASS') {
    const cert = accepted.find(d => d.e.docType === 'CERTIFICATION' && d.e.facts?.readable);
    if (cert && cert.s !== 'verified' && !(cert.e.facts?.scopeWords || []).length) {
      status = 'PARTIAL';
      add(
        'scope',
        `Certification scope: “${cert.e.fileName}” does not mention the assessed service; check its scope.`,
      );
    }
  }
  const confidence = !c.evidence.length
    ? 'Low'
    : accepted.some(d => d.s === 'verified')
      ? 'High'
      : accepted.length
        ? 'Medium'
        : 'Low';
  return { status, confidence, reasons, evidenceIds: docs.map(e => e.id) };
}

function mentions(facts, name) {
  const words = keywords(name).filter(w => w.length > 3);
  if (!words.length || !facts.words) return true;
  return words.some(w => (facts.words || []).includes(hashWord(w)));
}
/* Documents are not kept as plain text; only short hashes of their words, for name matching. */
export const hashWord = w => crypto.createHash('sha256').update(w).digest('hex').slice(0, 10);

/* Step 14. questionnaire = the stored control set; answers = { controlId: value };
   evidence = [{ id, controlId, docType, fileName, issuedOn, expiresOn, processingStatus, reviewStatus, facts, version }]. */
export function scoreCompliance(qn, answers, evidence, today = new Date(), meta = {}) {
  const x = qn.context;
  const results = [];
  const gaps = [];
  const observations = [];
  for (const c of qn.controls) {
    const r = assessControl(c, answers[c.id], evidence, x, today);
    const pts = STATUSES[r.status].points;
    results.push({ ...r, control: c, points: pts });
    for (const reason of r.reasons) {
      gaps.push({
        id: `GAP-${String(gaps.length + 1).padStart(3, '0')}`,
        controlId: c.ass,
        questionId: c.id,
        family: c.family,
        kind: reason.kind,
        status: r.status,
        critical: c.critical && !['PASS', 'PARTIAL'].includes(r.status),
        text: `${c.id} ${c.question.replace(/\?$/, '')} — ${reason.text}`,
      });
    }
  }
  for (const e of evidence) {
    if (!e.expiresOn) continue;
    const d = days(e.expiresOn, today);
    if (d >= 0 && d <= 90)
      observations.push({
        controlId: e.controlId,
        text: `“${e.fileName}” expires in ${d} day${d === 1 ? '' : 's'} (${day(e.expiresOn)}).`,
      });
  }
  const total = results.reduce((s, r) => s + r.control.weight, 0);
  const earned = results.reduce((s, r) => s + r.control.weight * r.points, 0);
  const overall = total ? Math.round((earned / total) * 100) : 0;
  const count = s => results.filter(r => r.status === s).length;
  const counts = {
    library: qn.libraryCount,
    applicable: results.length,
    notApplicable: qn.notApplicable.length,
    pass: count('PASS'),
    partial: count('PARTIAL'),
    fail: count('FAIL'),
    unknown: count('UNKNOWN'),
    review: count('REVIEW_REQUIRED'),
  };
  counts.informationRequired = counts.unknown + counts.review;
  const critical = results.filter(r => r.control.critical && !['PASS', 'PARTIAL'].includes(r.status));
  const rating = position(overall, critical.length, counts, x.policy);

  // Areas (one per control family) and Stage 1 control scores, for the later stages.
  const pct = list => {
    const w = list.reduce((s, r) => s + r.control.weight, 0);
    return w ? Math.round((list.reduce((s, r) => s + r.control.weight * r.points, 0) / w) * 100) : 0;
  };
  const areas = Object.keys(FAMILIES)
    .map(f => {
      const list = results.filter(r => r.control.family === f);
      return list.length
        ? { id: f, label: FAMILIES[f], score: pct(list), controls: list.map(r => r.control.id) }
        : null;
    })
    .filter(Boolean);
  const controls = [...new Set(results.map(r => r.control.ass))].map(ass => {
    const list = results.filter(r => r.control.ass === ass);
    return { id: ass, score: pct(list), questions: list.map(r => ({ id: r.control.id, status: r.status })) };
  });

  // Missing-evidence list and next actions.
  const missingEvidence = [];
  for (const r of results)
    for (const reason of r.reasons)
      if (['evidence', 'expired', 'unreadable', 'mismatch'].includes(reason.kind))
        missingEvidence.push({
          controlId: r.control.id,
          documents: r.control.evidence.filter(t => t !== 'OTHER').map(t => DOCUMENT_TYPES[t].label),
          reason: reason.kind,
          text: reason.text,
        });
  const nextActions = [];
  if (critical.length)
    nextActions.push(
      x.policy === 'block'
        ? `Approval is blocked until ${critical.length} critical control${critical.length === 1 ? ' is' : 's are'} resolved: ${critical.map(r => r.control.id).join(', ')}.`
        : `Escalate ${critical.length} unresolved critical control${critical.length === 1 ? '' : 's'} to the approver: ${critical.map(r => r.control.id).join(', ')}.`,
    );
  const clarify = results.filter(r =>
    r.reasons.some(z => ['contradiction', 'location', 'mismatch'].includes(z.kind)),
  );
  if (clarify.length)
    nextActions.push(
      `Request clarification from the vendor on ${clarify.map(r => r.control.id).join(', ')}.`,
    );
  if (missingEvidence.length)
    nextActions.push(
      `Ask the vendor for ${missingEvidence.length} outstanding document${missingEvidence.length === 1 ? '' : 's'}.`,
    );
  const toReview = results.filter(r => r.reasons.some(z => ['review', 'unreadable'].includes(z.kind)));
  if (toReview.length)
    nextActions.push(`Review the evidence by hand for ${toReview.map(r => r.control.id).join(', ')}.`);
  if (counts.unknown)
    nextActions.push(`Resolve ${counts.unknown} unknown answer${counts.unknown === 1 ? '' : 's'}.`);
  nextActions.push('Continue to Stage 4 (contract review) when the open items are understood.');

  // Step 15: the 12 fields per control result.
  const at = meta.at || new Date().toISOString();
  const rows = results.map(r => {
    const v = answers[r.control.id] || null;
    const ev = evidence.filter(e => r.evidenceIds.includes(e.id));
    return {
      assessmentId: meta.assessmentId || null,
      vendorId: x.vendor.id,
      controlId: r.control.id,
      answer: v,
      evidenceIds: ev.map(e => e.id),
      evidenceVersions: ev.map(e => e.version || 1),
      ruleId: r.control.applicability.rule,
      status: r.status,
      provisionalScore: r.points == null ? null : Math.round(r.points * 100),
      confidence: r.confidence,
      gapReason: r.reasons.map(z => z.text).join(' ') || null,
      gapIds: gaps.filter(g => g.questionId === r.control.id).map(g => g.id),
      timestamp: at,
      family: r.control.family,
      critical: r.control.critical,
      weight: r.control.weight,
      level: r.control.level,
      legalRef: r.control.legalRef,
    };
  });
  for (const c of qn.notApplicable)
    rows.push({
      assessmentId: meta.assessmentId || null,
      vendorId: x.vendor.id,
      controlId: c.id,
      answer: null,
      evidenceIds: [],
      evidenceVersions: [],
      ruleId: c.applicability.rule,
      status: 'NOT_APPLICABLE',
      provisionalScore: null,
      confidence: null,
      gapReason: null,
      gapIds: [],
      timestamp: at,
      family: c.family,
      critical: false,
      weight: c.weight,
      level: c.level,
      legalRef: c.legalRef,
    });

  return {
    overall,
    rating,
    counts,
    criticalGaps: critical.map(r => ({
      controlId: r.control.id,
      status: r.status,
      text: `${r.control.id} ${r.control.question}`,
    })),
    areas,
    controls,
    results: rows,
    gaps,
    missingEvidence,
    nextActions,
    observations,
    policy: x.policy,
    rulePackVersion: RULE_VERSION,
    controlSetVersion: qn.controlSetVersion,
    questionnaireVersion: qn.questionnaireVersion,
    note: 'Provisional assurance findings from the vendor’s answers and evidence. They are a risk indicator for review, not a final legal approval or a legal conclusion. Automatic document checks are not the same as independently verified evidence.',
  };
}

/* The overall position. A numerical score never overrides a critical failure. Never says "compliant". */
export function position(score, criticalOpen, counts, policy = CRITICAL_POLICY) {
  if (criticalOpen)
    return policy === 'block'
      ? { code: 'BLOCKED', label: 'Approval blocked' }
      : { code: 'ESCALATE', label: 'Escalation required' };
  if (score >= 80 && !counts.fail && !counts.unknown && !counts.review)
    return { code: 'SATISFACTORY', label: 'Satisfactory (provisional)' };
  return { code: 'CONDITIONAL', label: 'Conditional' };
}
