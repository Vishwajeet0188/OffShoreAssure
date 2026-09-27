/* ============ OffshoreAssure prototype — reference data & proprietary rule base ============ */
const RULEBASE_VERSION = 'RB-2026.09.1';

const USERS = [
  { id: 'sw', name: 'Sarah Williams', role: 'Compliance Manager' },
  { id: 'dp', name: 'David Patel', role: 'Information Security Lead' },
  { id: 'ps', name: 'Priya Shah', role: 'Legal & Procurement' },
  { id: 'th', name: 'Tom Hughes', role: 'Vendor Manager' }
];

/* Jurisdiction table (engine C). Prototype data: confirm against the current ICO adequacy list before relying on it. */
const EEA = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','Ireland','Italy','Latvia','Liechtenstein','Lithuania','Luxembourg','Malta','Netherlands','Norway','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];
const JURISDICTIONS = (() => {
  const t = {};
  EEA.forEach(c => t[c] = { status: 'adequate', basis: 'EEA state covered by UK adequacy regulations' });
  [['Andorra'],['Argentina'],['Faroe Islands'],['Guernsey'],['Isle of Man'],['Israel'],['Japan','Private sector only'],['Jersey'],['New Zealand'],['Republic of Korea'],['Switzerland'],['Uruguay'],['Gibraltar']]
    .forEach(([c, n]) => t[c] = { status: 'adequate', basis: 'Covered by UK adequacy regulations' + (n ? ' (' + n + ')' : '') });
  t['Canada'] = { status: 'partial', basis: 'Adequacy covers commercial organisations subject to PIPEDA only' };
  t['United States'] = { status: 'partial', basis: 'UK Extension to the EU-US Data Privacy Framework: certified organisations only' };
  ['India','Philippines','South Africa','Vietnam','Malaysia','Sri Lanka','Egypt','Mexico','Ukraine'].forEach(c => t[c] = { status: 'none', basis: 'No UK adequacy regulations: restricted transfer' });
  t['United Kingdom'] = { status: 'domestic', basis: 'Domestic processing' };
  return t;
})();

const COUNTRY_NAMES = Object.keys(JURISDICTIONS);

/* Requirement catalogue (engine: requirement intelligence) */
const TRIGGER_TEXT = { DP: 'personal data = YES', PC: 'personal data = YES  AND  external provider', SEC: 'internal systems = YES  OR  customer information = YES', PRIV: 'privileged access = YES', INC: 'customer information = YES  OR  internal systems = YES', SUB: 'subcontractors = YES', XFER: 'processing outside UK = YES  AND  personal data = YES', SA: 'operational service outsourced' };
const REQUIREMENTS = [
  { id: 'DP',   name: 'Data Protection', weight: 1.2,
    when: s => s.personal, reason: s => 'Personal data (' + (s.dataCats.filter(d => d !== 'Confidential business information').join(', ').toLowerCase() || 'personal data') + ') will be processed by an external provider.' },
  { id: 'PC',   name: 'Processor Contract', weight: 1.0,
    when: s => s.personal, reason: s => 'The supplier will process personal data on behalf of ' + s.orgShort + ', so a written processor contract is required.' },
  { id: 'SEC',  name: 'Security & Access Control', weight: 1.2,
    when: s => s.internalSystems || s.customerInfo, reason: s => s.internalSystems ? 'The supplier requires access to ' + s.orgShort + ' systems.' : 'The supplier will access customer information.' },
  { id: 'PRIV', name: 'Privileged Access', weight: 1.0,
    when: s => s.privileged, reason: () => 'Administrative or privileged credentials will be issued to supplier staff.' },
  { id: 'INC',  name: 'Incident Management', weight: 1.0,
    when: s => s.customerInfo || s.internalSystems, reason: s => s.activities.includes('Security incident response') ? 'The supplier will perform IT incident response.' : 'The supplier will handle customer information and system access.' },
  { id: 'SUB',  name: 'Sub-processor Management', weight: 0.8,
    when: s => s.subcontractors, reason: () => 'The supplier has indicated that subcontractors or sub-processors may be used.' },
  { id: 'XFER', name: 'International Transfer', weight: 1.2,
    when: s => s.overseas && s.personal, reason: s => 'Personal data will be processed outside the UK (UK → ' + s.country + ').' },
  { id: 'SA',   name: 'Service Assurance', weight: 0.8,
    when: () => true, reason: s => /IT/.test(s.category) ? 'A critical IT service is being outsourced.' : 'A customer-facing operational service is being outsourced.' }
];

/* Clause taxonomy (engine B). Order matters: first match wins. */
const TAXONOMY = [
  { cat: 'definitions',            label: 'Definitions',            head: /^definition|^interpretation/i, relevant: false },
  { cat: 'subprocessor-change',    label: 'Sub-processor Changes',  pat: /(changes? to sub-?processors|addition or replacement of a sub-?processor|intended changes)/i, relevant: true },
  { cat: 'subprocessor-liability', label: 'Sub-processor Liability', pat: /(remain(s)? (fully )?(liable|responsible)).*(sub-?processor|subcontractor)/i, relevant: true },
  { cat: 'subprocessor-auth',      label: 'Sub-processor Authorisation', pat: /(general|specific|prior) written (authorisation|approval).*(sub-?processor|subcontractor)|(sub-?processor|subcontractor).*prior written (authorisation|approval)/i, relevant: true },
  { cat: 'subprocessor',           label: 'Sub-processors',         pat: /sub-?processor|subcontract/i, relevant: true },
  { cat: 'processing-instructions',label: 'Processing Instructions', pat: /documented instructions/i, relevant: true },
  { cat: 'subject-rights',         label: 'Data Protection',        pat: /data subjects?|rights request|data protection law/i, relevant: true },
  { cat: 'confidentiality',        label: 'Confidentiality',        pat: /confidential/i, relevant: true },
  { cat: 'incident',               label: 'Incident Notification',  pat: /security incident|personal data breach/i, relevant: true },
  { cat: 'privileged-access',      label: 'Privileged Access',      pat: /privileged|administrative (access|accounts)|multi-factor/i, relevant: true },
  { cat: 'security',               label: 'Security',               pat: /technical and organisational measures|security measures|named user accounts/i, relevant: true },
  { cat: 'data-location',          label: 'International Transfer / Data Location', pat: /(processed|accessed|stored|hosted) in|service location|data location|outside the united kingdom/i, relevant: true },
  { cat: 'deletion',               label: 'Data Deletion',          pat: /(delete|return).*(personal data|customer data)/i, relevant: true },
  { cat: 'audit',                  label: 'Audit Rights',           pat: /audit|inspection/i, relevant: true },
  { cat: 'service-levels',         label: 'Service Levels',         pat: /service levels?|availability target/i, relevant: true },
  { cat: 'bcp',                    label: 'Business Continuity',    pat: /business continuity|disaster recovery/i, relevant: true },
  { cat: 'data-categories',        label: 'Data Categories',        pat: /personal data comprises/i, relevant: false },
  { cat: 'general',                label: 'Commercial / General',   pat: /./, relevant: false }
];

/* Evidence types & how uploaded documents are classified (by filename) */
const EVIDENCE_TYPES = {
  'security-cert':   { label: 'Security certification', examples: 'ISO 27001 certificate or SOC 2 report' },
  'incident-ops':    { label: 'Operational incident-response evidence', examples: 'Incident procedure, exercise report or SOC 2 report' },
  'sub-authorisation': { label: 'Subcontractor authorisation record', examples: 'Approved subcontractor list signed by the customer' },
  'sub-contract':    { label: 'Processor–sub-processor agreement', examples: 'Signed sub-processing agreement' },
  'sub-equivalent':  { label: 'Equivalent data-protection obligations', examples: 'Flow-down clauses in the sub-processing agreement' },
  'sub-security':    { label: 'Sub-processor security evidence', examples: 'Sub-processor ISO 27001 certificate' },
  'change-notice':   { label: 'Sub-processor change notice & objection route', examples: 'Change-notification procedure' },
  'transfer-assessment': { label: 'Transfer safeguard & transfer risk assessment', examples: 'IDTA / Addendum and completed TRA' },
  'delivery-plan': { label: 'Service improvement plan', examples: 'Vendor remediation plan for the missed service level' }
};
function classifyDoc(name, subNames) {
  const n = name.toLowerCase();
  const aboutSub = (subNames || []).some(s => n.includes(s.split(' ')[0].toLowerCase()));
  const covers = []; let kind = 'policy'; let status = 'Submitted';
  if (/iso.?27001|soc.?2|certificate/.test(n)) { kind = 'certificate'; status = 'Verified'; covers.push(aboutSub ? 'sub-security' : 'security-cert'); if (/soc.?2/.test(n) && !aboutSub) covers.push('incident-ops'); }
  if (/incident|exercise/.test(n)) covers.push('incident-ops');
  if (/sub.?processor.?agreement|sub.?processing|subcontract.*agreement/.test(n)) covers.push('sub-contract', 'sub-equivalent');
  if (/change.?notice|change.?notification/.test(n)) covers.push('change-notice');
  if (/authori[sz]ation|approved.?sub/.test(n)) covers.push('sub-authorisation');
  if (/transfer|idta|addendum|\btra\b/.test(n)) covers.push('transfer-assessment');
  if (/improvement.?plan|remediation/.test(n)) covers.push('delivery-plan');
  let policy = null;
  if (/security.?policy/.test(n)) policy = 'secPolicy';
  if (/data.?protection|dp.?policy|privacy/.test(n)) policy = 'dpPolicy';
  return { kind, status, covers: [...new Set(covers)], policy };
}

/* Rule checks (engine B/C mapping). Each maps an extracted obligation or evidence item onto a requirement. */
const RULES = [
  { id: 'DP-001', req: 'DP', name: 'Processing only on documented instructions', type: 'contract', cat: ['processing-instructions'], sev: 'Medium', owner: 'ps', action: 'Add documented-instructions clause' },
  { id: 'DP-002', req: 'DP', name: 'Assistance with data-subject rights', type: 'contract', cat: ['subject-rights'], sev: 'Medium', owner: 'ps', action: 'Add data-subject assistance clause' },
  { id: 'PC-001', req: 'PC', name: 'Confidentiality duty on personnel', type: 'contract', cat: ['confidentiality'], sev: 'Medium', owner: 'ps', action: 'Add confidentiality obligation' },
  { id: 'PC-002', req: 'PC', name: 'Audit and inspection rights', type: 'contract', cat: ['audit'], sev: 'Medium', owner: 'ps', action: 'Add audit rights clause' },
  { id: 'PC-003', req: 'PC', name: 'Return or deletion at end of contract', type: 'contract', cat: ['deletion'], sev: 'Medium', owner: 'ps', action: 'Add return/deletion clause' },
  { id: 'SEC-001', req: 'SEC', name: 'Technical and organisational security measures', type: 'contract', cat: ['security'], sev: 'High', owner: 'dp', action: 'Add security measures clause' },
  { id: 'SEC-002', req: 'SEC', name: 'Independent security certification', type: 'evidence', ev: 'security-cert', sev: 'High', owner: 'dp', action: 'Obtain security certification' },
  { id: 'PRIV-001', req: 'PRIV', name: 'Privileged access controls (MFA, logging, review)', type: 'contract', cat: ['privileged-access'], sev: 'High', owner: 'dp', action: 'Add privileged access controls' },
  { id: 'INC-001', req: 'INC', name: 'Incident notification within 24 hours', type: 'contract', cat: ['incident'], sev: 'High', owner: 'ps', action: 'Amend incident notification clause', test: c => c.deadlineHours != null && c.deadlineHours <= 24, failNote: 'Notification deadline missing or longer than 24 hours' },
  { id: 'INC-002', req: 'INC', name: 'Operational incident-response evidence verified', type: 'evidence', ev: 'incident-ops', sev: 'High', owner: 'dp', action: 'Provide incident-response evidence', needVerified: s => s.sector === 'Financial Services', verifiedNote: 'Sector rule FS-OR-01: Financial Services assessments need verified (not self-declared) operational resilience evidence.' },
  { id: 'SC-001', req: 'SUB', mode: 'unnamed', name: 'Prior written approval before appointing subcontractors', type: 'contract', cat: ['subprocessor-auth'], sev: 'Medium', owner: 'ps', action: 'Add subcontractor approval clause' },
  { id: 'SC-002', req: 'SUB', mode: 'unnamed', name: 'Evidence of subcontractor authorisation', type: 'evidence', ev: 'sub-authorisation', sev: 'Medium', owner: 'sw', action: 'Confirm subcontractor authorisation' },
  { id: 'SP-001', req: 'SUB', mode: 'named', name: 'Controller authorisation (specific or general written)', type: 'contract', cat: ['subprocessor-auth'], sev: 'High', owner: 'ps', action: 'Obtain written authorisation for sub-processor' },
  { id: 'SP-002', req: 'SUB', mode: 'named', name: 'Sub-processor identified by name or approved list', type: 'extraction', sev: 'Medium', owner: 'th', action: 'Obtain sub-processor list' },
  { id: 'SP-003', req: 'SUB', mode: 'named', name: 'Change notification with opportunity to object', type: 'contract', cat: ['subprocessor-change'], sev: 'Medium', owner: 'ps', action: 'Verify sub-processor change notification mechanism', test: c => /object/i.test(c.text), failNote: 'Notice of changes identified, but no right for the customer to object', ev: 'change-notice' },
  { id: 'SP-004', req: 'SUB', mode: 'named', name: 'Written processor–sub-processor contract', type: 'evidence', ev: 'sub-contract', sev: 'High', owner: 'th', action: 'Obtain {P}–{S} sub-processing agreement' },
  { id: 'SP-005', req: 'SUB', mode: 'named', name: 'Equivalent data-protection obligations flowed down', type: 'evidence', ev: 'sub-equivalent', sev: 'High', owner: 'sw', action: 'Verify equivalent data protection obligations' },
  { id: 'SP-006', req: 'SUB', mode: 'named', name: 'Sub-processor technical and organisational measures', type: 'evidence', ev: 'sub-security', sev: 'Medium', owner: 'dp', action: 'Obtain {S} security evidence' },
  { id: 'SP-007', req: 'SUB', mode: 'named', name: 'Processor remains liable for sub-processor', type: 'contract', cat: ['subprocessor-liability'], sev: 'Medium', owner: 'ps', action: 'Add processor liability clause' },
  { id: 'XFER-001', req: 'XFER', name: 'Destination jurisdiction lookup', type: 'jurisdiction', sev: 'Low', owner: 'sw', action: '' },
  { id: 'XFER-002', req: 'XFER', name: 'Restricted-transfer gate: mechanism, contractual protection, transfer risk assessment', type: 'transfer', ev: 'transfer-assessment', sev: 'High', owner: 'sw', action: 'Verify international transfer safeguard' },
  { id: 'SA-001', req: 'SA', name: 'Service levels defined', type: 'contract', cat: ['service-levels'], sev: 'Medium', owner: 'th', action: 'Agree service levels' },
  { id: 'SA-002', req: 'SA', name: 'Business continuity commitment', type: 'contract', cat: ['bcp'], sev: 'Low', owner: 'th', action: 'Obtain business continuity commitment' }
];
const DELIVERY_RULES = [
  { id: 'DEL-001', name: 'Service-level attainment against contract target (rolling 4 weeks)', metrics: ['answer-rate', 'availability'] },
  { id: 'DEL-002', name: 'Incident notification time within contract deadline', metrics: ['incident-notify'] }
];
const SEV_RANK = { High: 3, Medium: 2, Low: 1 };
const DUE_DAYS = { High: 3, Medium: 6, Low: 10 };

/* Service-category rubric (engine A). Customer-facing support services weight personal-data handling and
   customer-contact continuity differently from managed IT services. Areas not listed fall back to RUBRIC. */
const RUBRIC_BY_CATEGORY = {
  'Customer Support': {
    DP:  [['dpPolicy', 25, 'Data protection policy', 'dpPolicy'], ['ropa', 5, 'Records of processing maintained'], ['subjectRights', 20, 'Data-subject request procedure'], ['iso', 20, 'ISO 27001', 'security-cert'], ['dpTraining', 30, 'Annual data protection training for agents']],
    PC:  [['signDpa', 50, 'Will sign processor terms'], ['auditRights', 35, 'Accepts customer audits'], ['flowDown', 15, 'Accepts flow-down to subcontractors']],
    SEC: [['iso', 40, 'ISO 27001', 'security-cert'], ['secPolicy', 30, 'Information security policy', 'secPolicy'], ['soc', 10, 'SOC / security attestation'], ['pentest', 20, 'Annual penetration test']],
    INC: [['incidentProc', 50, 'Incident response procedure', 'incident-ops'], ['notify24', 30, 'Commits to 24h notification'], ['incidentTest', 20, 'Incident exercises in last 12 months']],
    SUB: [['subList', 25, 'Subcontractor list supplied'], ['subAuthMech', 25, 'Authorisation mechanism'], ['subContract', 35, 'Subcontractor contract available', 'sub-contract'], ['subDD', 15, 'Subcontractor due diligence']],
    SA:  [['sla', 40, 'Defined SLAs'], ['bcp', 30, 'Business continuity plan'], ['cyberInsurance', 12, 'Cyber insurance'], ['reporting', 18, 'Monthly service reporting']]
  }
};
/* Evidence register by service category. Groups rule-level evidence into the items a buyer tracks.
   Categories without a template show one evidence row per rule (e.g. Customer Support / Use Case 1). */
const EVIDENCE_REGISTER_BY_CATEGORY = {
  'Managed IT Support': [
    { label: 'Processor Contract', evidence: 'Supplier agreement', rules: ['DP-001', 'DP-002', 'PC-001', 'PC-002', 'PC-003', 'SA-001', 'SA-002', 'SP-007'] },
    { label: 'Security', evidence: 'Security certification and controls', rules: ['SEC-001', 'SEC-002', 'PRIV-001', 'INC-001', 'INC-002'] },
    { label: 'Sub-processor Authorisation', rules: ['SP-001'] },
    { label: 'Sub-processor Contract', rules: ['SP-004'] },
    { label: 'Equivalent Protection', rules: ['SP-005'] },
    { label: 'Sub-processor Security', rules: ['SP-006'] },
    { label: 'Change Notification', rules: ['SP-003'] }
  ]
};
const AREA_LABELS = { 'Customer Support': { SUB: 'Subcontractor Controls', XFER: 'Data Transfer' } };

/* Vendor scoring rubric (engine A). Declared controls score 60%; evidenced controls score 100%. */
const RUBRIC = {
  DP:   [['dpPolicy', 45, 'Data protection policy', 'dpPolicy'], ['subjectRights', 15, 'Data-subject request procedure'], ['iso', 20, 'ISO 27001', 'security-cert'], ['dpTraining', 20, 'Annual data protection training']],
  PC:   [['signDpa', 60, 'Will sign processor terms'], ['auditRights', 40, 'Accepts customer audits']],
  SEC:  [['iso', 40, 'ISO 27001', 'security-cert'], ['secPolicy', 30, 'Information security policy', 'secPolicy'], ['soc', 15, 'SOC / security attestation'], ['pentest', 15, 'Annual penetration test']],
  PRIV: [['privAccess', 50, 'Privileged access controls'], ['mfa', 25, 'MFA on admin accounts'], ['accessReview', 25, 'Quarterly access review']],
  INC:  [['incidentProc', 50, 'Incident response procedure', 'incident-ops'], ['notify24', 25, 'Commits to 24h notification'], ['incidentTest', 25, 'Incident exercises in last 12 months']],
  SUB:  [['subList', 30, 'Sub-processor list supplied'], ['subAuthMech', 25, 'Authorisation mechanism'], ['subContract', 30, 'Sub-processor contract available', 'sub-contract'], ['subDD', 15, 'Sub-processor due diligence']],
  XFER: [],
  SA:   [['sla', 40, 'Defined SLAs'], ['bcp', 30, 'Business continuity plan'], ['cyberInsurance', 15, 'Cyber insurance'], ['reporting', 15, 'Monthly service reporting']]
};

/* Vendors */
const VENDORS = {
  globalassist: {
    id: 'globalassist', name: 'Global Assist Services Ltd', country: 'India', location: 'Bangalore', service: 'Customer Support', staff: 'Approximately 120',
    q: { iso: true, secPolicy: true, incidentProc: true, dpPolicy: true, usesSubs: true, xferMechanism: false, cyberInsurance: true,
         subjectRights: true, dpTraining: true, signDpa: true, auditRights: true, soc: false, pentest: true, notify24: true, incidentTest: false,
         subList: true, subAuthMech: true, subContract: false, subDD: true, dataLocation: true, encryption: true, onward: true, sla: true, bcp: true, reporting: false },
    shownQ: [['iso','ISO 27001 certification?'],['secPolicy','Information security policy?'],['incidentProc','Incident response procedure?'],['dpPolicy','Data protection policy?'],['usesSubs','Subcontractors used?'],['xferMechanism','International transfer mechanism identified?'],['cyberInsurance','Cyber insurance?']],
    docs: ['GlobalAssist_ISO27001.pdf', 'GlobalAssist_SecurityPolicy.pdf', 'GlobalAssist_IncidentProcedure.pdf'],
    contract: 'Global_Assist_Service_Agreement.pdf'
  },
  nordtech: {
    id: 'nordtech', name: 'NordTech Support Sp. z o.o.', country: 'Poland', location: 'Warsaw', service: 'Managed IT Support', staff: 'Approximately 45',
    q: { iso: true, soc: true, incidentProc: true, privAccess: true, usesSubs: true, subList: true, subAuth: 'General authorisation', subContract: false,
         secPolicy: true, dpPolicy: true, subjectRights: false, dpTraining: true, signDpa: true, auditRights: true, pentest: true, notify24: true, incidentTest: false,
         mfa: true, accessReview: false, subAuthMech: true, subDD: false, dataLocation: true, encryption: false, onward: true, sla: true, bcp: true, cyberInsurance: true, reporting: false, xferMechanism: false },
    shownQ: [['iso','ISO 27001?'],['soc','SOC / security certification?'],['incidentProc','Incident response process?'],['privAccess','Privileged access controls?'],['usesSubs','Uses sub-processors?'],['subList','Sub-processor list supplied?'],['subAuth','Sub-processor authorisation mechanism?'],['subContract','CloudOps contract available?']],
    docs: ['NordTech_ISO27001.pdf', 'NordTech_SOC2_Type2_Report.pdf'],
    contract: 'NordTech_Master_Services_Agreement.pdf'
  }
};

/* Scenario presets (fill the forms; the user still clicks through every stage) */
const SCENARIOS = {
  uc1: {
    label: 'Use Case 1 · Customer support to India',
    create: { org: 'Acme Financial Services Ltd', sector: 'Financial Services', name: 'Customer Support Outsourcing – Global Assist', category: 'Customer Support', owner: 'sw', vendorId: 'globalassist',
      description: "Acme Financial Services Ltd proposes to outsource first-line customer support to Global Assist Services Ltd. The supplier will provide customer support services from India and will require access to customer information through Acme's customer-support platform." },
    scope: { personal: true, customerInfo: true, internalSystems: true, overseas: true, subcontractors: true, confidential: true, privileged: false,
      dataCats: ['Customer names', 'Contact details', 'Customer account information', 'Customer-support records', 'Confidential business information'],
      activities: ['Answer customer enquiries', 'Access customer-support platform'] },
    transfer: { mechanism: 'Not identified', contractual: 'No', tra: 'No' },
    simulate: []
  },
  uc2: {
    label: 'Use Case 2 · IT support to Poland + sub-processor',
    create: { org: 'Acme Financial Services Ltd', sector: 'Financial Services', name: 'IT Infrastructure & Support Outsourcing', category: 'Managed IT Support', owner: 'sw', vendorId: 'nordtech',
      description: 'Acme Financial Services Ltd proposes to outsource IT infrastructure and technical support to NordTech Support Sp. z o.o. in Warsaw. NordTech staff will access UK employee and customer-related information while troubleshooting and will hold privileged access to selected systems.' },
    scope: { personal: true, customerInfo: true, internalSystems: true, overseas: true, subcontractors: true, confidential: true, privileged: true,
      dataCats: ['Employee information', 'Customer information', 'System logs', 'Credentials / privileged access'],
      activities: ['Helpdesk support', 'Infrastructure monitoring', 'Remote system administration', 'Security incident response', 'Cloud infrastructure support', 'Software maintenance'] },
    transfer: {},
    simulate: ['CloudOps_Subprocessor_Agreement.pdf', 'CloudOps_ISO27001.pdf', 'Subprocessor_Change_Notice.pdf']
  }
};

const DATA_CATS = ['Customer names', 'Contact details', 'Customer account information', 'Customer-support records', 'Customer information', 'Employee information', 'System logs', 'Credentials / privileged access', 'Confidential business information', 'Special category data'];
const ACTIVITIES = ['Answer customer enquiries', 'Access customer-support platform', 'Helpdesk support', 'Infrastructure monitoring', 'Remote system administration', 'Security incident response', 'Cloud infrastructure support', 'Software maintenance', 'Data processing / back office'];

/* Seeded portfolio for the dashboard */
const SEED_ASSESSMENTS = [
  { id: 'OA-2026-0011', issue: 'DPA incomplete', vendor: 'Pacifica Care Services', service: 'Customer Support', country: 'Philippines', risk: 'Medium', status: 'In Review', contract: true, gaps: 1 },
  { id: 'OA-2026-0001', issue: 'Security controls not evidenced', vendor: 'ABC Solutions', service: 'IT Support', country: 'Philippines', risk: 'Medium', status: 'In Review', contract: true, gaps: 1 },
  { id: 'OA-2026-0002', issue: 'International transfer: no safeguard recorded', vendor: 'XYZ Services', service: 'Data Processing', country: 'South Africa', risk: 'High', status: 'Action Required', contract: true, gaps: 2 },
  { id: 'OA-2026-0003', issue: '—', vendor: 'Harbour Contact Centres', service: 'Customer Support', country: 'Ireland', risk: 'Low', status: 'Completed', contract: true, gaps: 0 },
  { id: 'OA-2026-0004', issue: 'Sub-processor list not supplied', vendor: 'Lumen Data Ops', service: 'Back-office Processing', country: 'India', risk: 'High', status: 'Action Required', contract: true, gaps: 1 },
  { id: 'OA-2026-0005', issue: '—', vendor: 'Kestrel Cloud', service: 'Hosting', country: 'Netherlands', risk: 'Low', status: 'Completed', contract: true, gaps: 0 },
  { id: 'OA-2026-0006', issue: 'Data retention unclear', vendor: 'Brightline QA', service: 'Software Testing', country: 'Vietnam', risk: 'Medium', status: 'In Review', contract: false, gaps: 1 },
  { id: 'OA-2026-0007', issue: '—', vendor: 'Meridian Payroll', service: 'Payroll', country: 'Poland', risk: 'Low', status: 'In Review', contract: true, gaps: 0 },
  { id: 'OA-2026-0008', issue: 'Restricted transfer: TRA outstanding', vendor: 'Atlas Dev Studio', service: 'Software Development', country: 'Ukraine', risk: 'High', status: 'Action Required', contract: false, gaps: 0 },
  { id: 'OA-2026-0009', issue: 'Vendor questionnaire incomplete', vendor: 'Orchid BPO', service: 'Claims Handling', country: 'Malaysia', risk: 'Medium', status: 'Vendor Response', contract: false, gaps: 0 },
  { id: 'OA-2026-0010', issue: 'Data Privacy Framework certification unverified', vendor: 'Nimbus Analytics', service: 'Data Analytics', country: 'United States', risk: 'Medium', status: 'In Review', contract: false, gaps: 0 }
];

/* ---------- Engine D: SAMPLE / PROTOTYPE delivery feed (demonstration data, not real vendor delivery evidence) ---------- */
const DELIVERY_WEEKS = ['W31', 'W32', 'W33', 'W34', 'W35', 'W36', 'W37', 'W38', 'W39', 'W40'];
const DELIVERY_FEED = {
  globalassist: {
    source: 'Sample contact-centre telephony and ticketing export',
    series: {
      'answer-rate': [93, 92, 93, 91, 90, 89, 87, 85, 88, 91],
      'availability': null,
      'incident-notify': [null, 6, null, null, 20, null, 30, null, null, 8]
    }
  },
  nordtech: {
    source: 'Sample monitoring and service-desk export',
    series: {
      'answer-rate': null,
      'availability': [99.95, 99.97, 99.92, 99.90, 99.96, 99.94, 99.98, 99.95, 99.81, 99.93],
      'incident-notify': [4, null, null, 9, null, null, null, 5, null, null]
    }
  }
};
const DELIVERY_WINDOW_WEIGHTS = [0.4, 0.3, 0.2, 0.1]; /* most recent week first */

export { EVIDENCE_REGISTER_BY_CATEGORY, RULEBASE_VERSION, USERS, EEA, JURISDICTIONS, COUNTRY_NAMES, TRIGGER_TEXT, REQUIREMENTS, TAXONOMY, EVIDENCE_TYPES, classifyDoc, RULES, DELIVERY_RULES, SEV_RANK, DUE_DAYS, RUBRIC_BY_CATEGORY, AREA_LABELS, RUBRIC, VENDORS, SCENARIOS, DATA_CATS, ACTIVITIES, SEED_ASSESSMENTS, DELIVERY_WEEKS, DELIVERY_FEED, DELIVERY_WINDOW_WEIGHTS };
