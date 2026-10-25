/* The nine stages and 43 steps of the OffshoreAssure sequence diagram (client's development plan).
   `built` lists the steps that are live; everything else is shown as "not available yet". */
export const ACTORS = { B: 'Buyer', E: 'OffshoreAssure engine', V: 'Offshore vendor', R: 'Evidence record' };

export const STAGES = [
  { n: 1, slug: 'requirement', title: 'Requirement', icon: 'clipboard', path: '/requirements',
    summary: 'Describe the service you plan to outsource. OffshoreAssure validates it, creates the Assessment ID and shows the gaps.',
    steps: [[1, 'Submit outsourcing requirement', 'B', 'E'], [2, 'Validate fields and create Assessment ID', 'E', 'E'], [3, 'Save requirement profile and timeline', 'E', 'R'], [4, 'Requirement profile and gaps', 'E', 'B']] },
  { n: 2, slug: 'vendor-selection', title: 'Vendor selection', icon: 'users', path: '/vendor-selection',
    summary: 'Search for vendors, compare candidates on service, location and scope, and record the selection with its rationale.',
    steps: [[5, 'Search or select vendor', 'B', 'E'], [6, 'Match service, location and scope', 'E', 'E'], [7, 'Candidate list and comparison', 'E', 'B'], [8, 'Confirm selected vendor', 'B', 'E'], [9, 'Save selection and decision rationale', 'E', 'R']] },
  { n: 3, slug: 'compliance-assessment', title: 'Compliance assessment', icon: 'shield', path: '/compliance',
    summary: 'Generate the control set and questionnaire, collect the vendor’s policies, certificates and answers, and calculate a provisional score.',
    steps: [[10, 'Start compliance assessment', 'B', 'E'], [11, 'Generate control set and questionnaire', 'E', 'E'], [12, 'Request answers and evidence', 'E', 'V'], [13, 'Submit policies, certificates and answers', 'V', 'E'],
      [14, 'Validate and calculate provisional score', 'E', 'E'], [15, 'Save responses, evidence and gaps', 'E', 'R'], [16, 'Assessment results and missing items', 'E', 'B']] },
  { n: 4, slug: 'contract-analysis', title: 'Contract analysis', icon: 'file', path: '/contract',
    summary: 'Upload the contract with the selected vendor; OffshoreAssure extracts the text, identifies the clauses and shows which topics are covered.',
    steps: [[17, 'Upload or select contract', 'B', 'E'], [18, 'Extract text and identify clauses', 'E', 'E'], [19, 'Save original file and extraction', 'E', 'R'], [20, 'Contract analysis and clause list', 'E', 'B']] },
  { n: 5, slug: 'obligation-extraction', title: 'Obligation extraction', icon: 'list', path: '/obligations',
    summary: 'Extract obligations and parties from the contract clauses, map them to the requirement’s controls and rules, and save the obligation register.',
    steps: [[21, 'Extract obligations and parties', 'E', 'E'], [22, 'Map clauses to requirements and rules', 'E', 'E'], [23, 'Obligations, sources and confidence', 'E', 'B'], [24, 'Save obligation register and rule trace', 'E', 'R']] },
  { n: 6, slug: 'transfer-assessment', title: 'Transfer assessment', icon: 'globe', path: '/transfers',
    summary: 'Map data flows and transfer routes, and check recipients, roles and safeguards route by route.',
    steps: [[25, 'Map data flows and transfer routes', 'E', 'E'], [26, 'Check recipients, roles and safeguards', 'E', 'E'], [27, 'Transfer findings and questions', 'E', 'B'], [28, 'Save route-by-route assessment', 'E', 'R']] },
  { n: 7, slug: 'risk-identification', title: 'Risk identification', icon: 'alert',
    summary: 'Consolidate risks and gaps, apply scoring and evidence rules, and produce the risk register with its rationale.',
    steps: [[29, 'Consolidate risks and gaps', 'E', 'E'], [30, 'Apply scoring and evidence rules', 'E', 'E'], [31, 'Risk register and rationale', 'E', 'B'], [32, 'Save risk snapshot and linked sources', 'E', 'R']] },
  { n: 8, slug: 'remediation', title: 'Remediation', icon: 'flow',
    summary: 'Approve or assign actions, request corrections from the vendor and re-run the affected checks.',
    steps: [[33, 'Approve or assign actions', 'B', 'E'], [34, 'Request corrections and missing documents', 'E', 'V'], [35, 'Submit evidence and response', 'V', 'E'], [36, 'Re-run affected checks', 'E', 'E'],
      [37, 'Save action and reassessment history', 'E', 'R'], [38, 'Updated status and outstanding actions', 'E', 'B']] },
  { n: 9, slug: 'monitoring-audit', title: 'Monitoring and audit', icon: 'report',
    summary: 'Generate the evidence-backed report with its audit trail, and keep monitoring changes and renewals.',
    steps: [[39, 'Generate report or continue monitoring', 'B', 'E'], [40, 'Compile report and audit trail', 'E', 'E'], [41, 'Save report version and full history', 'E', 'R'], [42, 'Evidence-backed assessment report', 'E', 'B'], [43, 'Ongoing requests, changes and renewals', 'E', 'V']] }
];

/* Steps that are live in this build. */
export const BUILT_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
export const stageStatus = s => {
  const done = s.steps.filter(([n]) => BUILT_STEPS.includes(n)).length;
  return done === 0 ? 'not-started' : done === s.steps.length ? 'available' : 'partial';
};
export const stageBySlug = slug => STAGES.find(s => s.slug === slug);

/* The vendor's part in the assessment (Technical Architecture, "End to End User Journey", Offshore vendor lane),
   with the matching steps of the sequence diagram where the vendor is involved. */
export const VENDOR_JOURNEY = [
  { stage: 2, slug: 'company-profile', title: 'Company profile', icon: 'building', path: '/vendor/profile',
    text: 'Hold one reusable, verified company profile that can be presented to any UK buyer on the platform.', steps: [] },
  { stage: 3, slug: 'assessments', title: 'Assessments', icon: 'shield', path: '/vendor/assessments',
    text: 'See buyers that invited or selected your company; then answer the buyer’s questionnaire and upload certificates, policies and insurance evidence (Stage 3).', steps: [12, 13] },
  { stage: 5, slug: 'obligations', title: 'Obligations', icon: 'list', path: '/vendor/obligations',
    text: 'See the obligations drawn from the signed agreement, stated plainly.', steps: [] },
  { stage: 6, slug: 'access', title: 'Scoped access', icon: 'globe',
    text: 'Receive the access the current assessment supports, with the reason for any limit.', steps: [] },
  { stage: 8, slug: 'actions', title: 'Actions', icon: 'flow',
    text: 'Receive correction requests, supply renewed certificates or corrected terms, and close the action.', steps: [34, 35] },
  { stage: 9, slug: 'track-record', title: 'Track record', icon: 'report',
    text: 'Build a verified delivery and compliance history that strengthens your next UK bid; respond to ongoing requests and renewals.', steps: [43] }
];
export const vendorJourneyBySlug = slug => VENDOR_JOURNEY.find(j => j.slug === slug);
