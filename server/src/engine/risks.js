/*
 * Stage 7 – Risk identification (steps 29 and 30).
 *
 * Step 29: bring together every gap found so far — unconfirmed requirement
 * answers (Stage 1), selection conditions (Stage 2), questionnaire gaps
 * (Stage 3), contract topics not found (Stage 4), rules with no obligation
 * (Stage 5) and transfer routes that need action (Stage 6). Findings about the
 * same subject become ONE risk, so the buyer sees "Sub-processors" once with
 * all its sources, not five separate lines.
 *
 * Step 30: score each risk on a 5 × 5 scale. Likelihood comes from how bad the
 * worst finding is, raised when two or more stages point at it and lowered when
 * the vendor has shown good evidence for it. Impact comes from the subject,
 * raised for sensitive data and critical services. Score = likelihood × impact.
 *
 * The themes, levels and bands are PROVISIONAL (rule pack RP-2026.10-S7-draft)
 * until the client sends the Stage 7 specification. The register helps the
 * buyer decide what to fix first. It is not a legal or compliance conclusion.
 */
import { missingItems } from './gaps.js';

export const S7_RULE_PACK = 'RP-2026.10-S7-draft';

export const RISK_NOTE =
  'Risks are drawn automatically from the earlier stages and scored with provisional rules. Use the register to decide what to fix first. It is not a legal or compliance conclusion.';

/*
 * The subjects a risk can be about. Each lists the controls (ASS-xxx), contract
 * topics (Stage 4) and rules (Stage 5) that belong to it, and a starting impact
 * from 1 (minor) to 5 (severe).
 */
export const THEMES = [
  {
    id: 'transfers',
    name: 'International data transfers',
    impact: 4,
    controls: ['ASS-005'],
    topics: ['international_transfer'],
    rules: ['R-TRF-01'],
  },
  {
    id: 'data_protection',
    name: 'Data protection terms',
    impact: 4,
    controls: ['ASS-004'],
    topics: ['data_protection'],
    rules: ['R-DP-01'],
  },
  {
    id: 'security',
    name: 'Information security',
    impact: 4,
    controls: ['ASS-002', 'ASS-003', 'ASS-009'],
    topics: ['security'],
    rules: ['R-SEC-01'],
  },
  {
    id: 'incidents',
    name: 'Breach and incident handling',
    impact: 4,
    controls: ['ASS-007'],
    topics: ['breach_notification'],
    rules: ['R-BRE-01'],
  },
  {
    id: 'subprocessors',
    name: 'Sub-processors',
    impact: 3,
    controls: ['ASS-006'],
    topics: ['subprocessors'],
    rules: ['R-SUB-01'],
  },
  {
    id: 'identity',
    name: 'Vendor identity and verification',
    impact: 3,
    controls: ['ASS-001'],
    topics: [],
    rules: [],
  },
  {
    id: 'people',
    name: 'Staff and confidentiality',
    impact: 3,
    controls: ['ASS-010'],
    topics: ['confidentiality'],
    rules: ['R-DP-02'],
  },
  {
    id: 'exit',
    name: 'Data return and deletion',
    impact: 3,
    controls: ['ASS-014'],
    topics: ['return_deletion'],
    rules: ['R-EXIT-01'],
  },
  {
    id: 'continuity',
    name: 'Business continuity',
    impact: 3,
    controls: ['ASS-008'],
    topics: ['business_continuity'],
    rules: [],
  },
  { id: 'sector', name: 'Sector rules', impact: 3, controls: ['ASS-015'], topics: [], rules: [] },
  {
    id: 'audit',
    name: 'Audit and oversight',
    impact: 2,
    controls: ['ASS-013'],
    topics: ['audit_rights'],
    rules: ['R-AUD-01'],
  },
  {
    id: 'service',
    name: 'Service levels and delivery',
    impact: 2,
    controls: ['ASS-012'],
    topics: ['service_levels'],
    rules: ['R-SLA-01'],
  },
  {
    id: 'insurance',
    name: 'Insurance cover',
    impact: 2,
    controls: ['ASS-011'],
    topics: ['insurance'],
    rules: [],
  },
  {
    id: 'contract_terms',
    name: 'General contract terms',
    impact: 2,
    controls: [],
    topics: ['liability', 'termination', 'governing_law'],
    rules: [],
  },
  {
    id: 'requirement',
    name: 'Unconfirmed requirement details',
    impact: 2,
    controls: [],
    topics: [],
    rules: [],
  },
];

// Themes that are about personal data: sensitive data raises their impact.
const DATA_THEMES = ['transfers', 'data_protection', 'security', 'incidents', 'subprocessors', 'exit'];

/* How serious a single finding is, and the likelihood it starts from. */
export const SEVERITY = {
  blocker: { label: 'Not permitted', likelihood: 5, rank: 4 },
  fail: { label: 'Missing or failed', likelihood: 4, rank: 3 },
  gap: { label: 'Partly in place', likelihood: 3, rank: 2 },
  unknown: { label: 'Not confirmed', likelihood: 3, rank: 1 },
};

/* Score bands on the 5 × 5 scale (1–25). */
export const RATINGS = [
  { code: 'CRITICAL', label: 'Critical', min: 20, tone: 'coral' },
  { code: 'HIGH', label: 'High', min: 10, tone: 'coral' },
  { code: 'MEDIUM', label: 'Medium', min: 5, tone: 'amber' },
  { code: 'LOW', label: 'Low', min: 1, tone: 'sage' },
];
export const ratingFor = score => RATINGS.find(r => score >= r.min);

const themeById = id => THEMES.find(t => t.id === id);
const themeForControl = id => THEMES.find(t => t.controls.includes(id))?.id || 'requirement';
const themeForTopic = id => THEMES.find(t => t.topics.includes(id))?.id || 'contract_terms';
const themeForRule = id => THEMES.find(t => t.rules.includes(id))?.id || 'contract_terms';

// Stage 1 answers that belong to a theme other than "unconfirmed requirement details".
const FIELD_THEMES = {
  storageCountries: 'transfers',
  remoteAccessCountries: 'transfers',
  subprocessors: 'subprocessors',
  privilegedAccess: 'security',
  personalData: 'data_protection',
  specialCategory: 'data_protection',
  criminalOffence: 'data_protection',
  dataSubjectCategories: 'data_protection',
  personalDataCategories: 'data_protection',
};

// Stage 2 fit checks → themes.
const FIT_THEMES = {
  identity: 'identity',
  service: 'service',
  delivery: 'transfers',
  access: 'transfers',
  certifications: 'security',
  subprocessors: 'subprocessors',
  contract: 'contract_terms',
  restrictions: 'transfers',
  readiness: 'identity',
};

// Stage 6 route statuses that are findings, and how serious each is.
const ROUTE_SEVERITY = {
  NOT_PERMITTED: 'blocker',
  SAFEGUARD_MISSING: 'fail',
  INFORMATION_NEEDED: 'unknown',
  SAFEGUARD_TRA_NEEDED: 'gap',
  ADEQUATE_CHECK: 'unknown',
};

/**
 * Step 29: every finding from Stages 1–6, each tagged with its theme and source.
 *
 * @param {object} sources
 *   requirement   Stage 1 answers
 *   selection     latest Vendor Selection Record ({ version, status, fit })
 *   compliance    latest Stage 3 result ({ version, result: { gaps, controls } })
 *   contract      latest Stage 4 analysis ({ version, notFound })
 *   obligations   latest Stage 5 register ({ version, gaps })
 *   transfers     latest Stage 6 assessment ({ version, routes })
 */
export function collectFindings({
  requirement = {},
  selection = null,
  compliance = null,
  contract = null,
  obligations = null,
  transfers = null,
}) {
  const findings = [];
  const add = (theme, finding) => findings.push({ theme, ...finding });

  // Stage 1: answers the buyer has not confirmed yet.
  for (const item of missingItems(requirement).filter(i => i.kind === 'answer')) {
    add(FIELD_THEMES[item.field] || 'requirement', {
      stage: 1,
      source: 'Requirement',
      ref: item.field,
      severity: 'unknown',
      owner: 'Buyer',
      text: item.text,
    });
  }

  // Stage 2: a conditional selection carries its open checks forward.
  if (selection?.fit && selection.status === 'CONDITIONALLY_SELECTED') {
    for (const e of selection.fit.exceptions || []) {
      add(FIT_THEMES[e.id] || 'requirement', {
        stage: 2,
        source: 'Vendor selection',
        ref: e.check,
        severity: 'fail',
        owner: 'Buyer',
        text: `Accepted as an exception at selection: ${e.detail}`,
      });
    }
    for (const m of selection.fit.missing || []) {
      add(FIT_THEMES[m.id] || 'requirement', {
        stage: 2,
        source: 'Vendor selection',
        ref: m.check,
        severity: 'unknown',
        owner: 'Vendor',
        text: `${m.check}: ${m.detail}`,
      });
    }
  }

  // Stage 3: questionnaire answers and evidence.
  for (const gap of compliance?.result?.gaps || []) {
    const severity = gap.kind === 'answer' || gap.kind === 'expired' ? 'fail' : 'gap';
    add(themeForControl(gap.controlId), {
      stage: 3,
      source: 'Compliance assessment',
      ref: gap.questionId || gap.controlId,
      control: gap.controlId,
      severity,
      owner: 'Vendor',
      text: gap.text,
    });
  }

  // Stage 4: topics the contract should cover but does not.
  for (const topic of contract?.notFound || []) {
    add(themeForTopic(topic.topicId), {
      stage: 4,
      source: 'Contract analysis',
      ref: topic.name,
      severity: 'fail',
      owner: 'Buyer',
      text: topic.text,
    });
  }

  // Stage 5: rules with no obligation in the contract.
  for (const gap of obligations?.gaps || []) {
    add(themeForRule(gap.ruleId), {
      stage: 5,
      source: 'Obligation extraction',
      ref: gap.ruleId,
      severity: 'fail',
      owner: 'Buyer',
      text: `${gap.text} (${gap.source})`,
    });
  }

  // Stage 6: transfer routes that still need action.
  for (const route of transfers?.routes || []) {
    const severity = ROUTE_SEVERITY[route.status];
    if (!severity) continue;
    const theme = route.uses?.includes('Sub-processors') ? 'subprocessors' : 'transfers';
    add(theme, {
      stage: 6,
      source: 'Transfer assessment',
      ref: route.id,
      severity,
      owner: severity === 'unknown' || severity === 'gap' ? 'Vendor' : 'Buyer',
      text: `${route.fromName} → ${route.toName}: ${route.statusLabel.toLowerCase()}.`,
    });
  }

  return findings;
}

/**
 * Step 30: one scored risk per theme that has findings.
 *
 * @param {Array} findings          from collectFindings
 * @param {object} requirement      Stage 1 answers (for the impact)
 * @param {Array} complianceControls Stage 3 control scores (for evidence held)
 */
export function scoreRisks(findings, requirement = {}, complianceControls = []) {
  const sensitive = requirement.specialCategory === 'Yes' || requirement.criminalOffence === 'Yes';
  const critical = requirement.serviceCriticality === 'Critical';

  const byTheme = new Map();
  for (const f of findings) {
    if (!byTheme.has(f.theme)) byTheme.set(f.theme, []);
    byTheme.get(f.theme).push(f);
  }

  const risks = [...byTheme.entries()].map(([themeId, items]) => {
    const theme = themeById(themeId);
    const worst = items.reduce((a, b) => (SEVERITY[b.severity].rank > SEVERITY[a.severity].rank ? b : a));
    const stages = [...new Set(items.map(i => i.stage))].sort();

    // Evidence held: the vendor's Stage 3 score for this theme's controls.
    const scored = complianceControls.filter(c => theme.controls.includes(c.id));
    const evidenceScore = scored.length
      ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
      : null;
    const evidence =
      evidenceScore === null
        ? 'Not assessed'
        : evidenceScore >= 80
          ? 'Evidence held'
          : evidenceScore >= 50
            ? 'Partly evidenced'
            : 'No evidence';

    // Likelihood: the worst finding, +1 when two or more stages agree, −1 when good evidence is held.
    const why = [];
    let likelihood = SEVERITY[worst.severity].likelihood;
    why.push(
      `likelihood ${likelihood} because the worst finding is "${SEVERITY[worst.severity].label.toLowerCase()}" (${worst.source})`,
    );
    if (stages.length >= 2 && likelihood < 5) {
      likelihood += 1;
      why.push(`+1 because ${stages.length} stages point at it`);
    }
    if (evidence === 'Evidence held' && worst.severity !== 'blocker' && likelihood > 1) {
      likelihood -= 1;
      why.push('−1 because the vendor showed good evidence in Stage 3');
    }

    // Impact: the theme's starting impact, +1 for sensitive data on a data theme, +1 for a critical service.
    let impact = theme.impact;
    why.push(`impact ${impact} for ${theme.name.toLowerCase()}`);
    if (sensitive && DATA_THEMES.includes(theme.id) && impact < 5) {
      impact += 1;
      why.push('+1 for special-category or criminal-offence data');
    }
    if (critical && impact < 5) {
      impact += 1;
      why.push('+1 for a critical service');
    }

    const score = likelihood * impact;
    const owners = [...new Set(items.map(i => i.owner))];
    return {
      theme: theme.id,
      title: theme.name,
      likelihood,
      impact,
      score,
      rating: ratingFor(score).code,
      evidence,
      evidenceScore,
      actionBy: owners.length > 1 ? 'Both' : owners[0],
      stages,
      controls: theme.controls,
      rationale: why.join('; ') + `. Score ${likelihood} × ${impact} = ${score}.`,
      findings: items.map(({ theme: _t, ...rest }) => rest),
    };
  });

  return risks
    .sort((a, b) => b.score - a.score || b.likelihood - a.likelihood || a.title.localeCompare(b.title))
    .map((risk, i) => ({ id: `RSK-${String(i + 1).padStart(2, '0')}`, ...risk }));
}

/* Steps 29–30 together, with the totals and 5 × 5 grid shown to the buyer (step 31). */
export function buildRiskRegister(sources) {
  const findings = collectFindings(sources);
  const risks = scoreRisks(findings, sources.requirement, sources.compliance?.result?.controls || []);

  const grid = Array.from({ length: 5 }, () => Array(5).fill(0)); // grid[likelihood-1][impact-1]
  for (const r of risks) grid[r.likelihood - 1][r.impact - 1] += 1;

  const count = code => risks.filter(r => r.rating === code).length;
  const top = risks[0];
  return {
    rulePackVersion: S7_RULE_PACK,
    overall: top
      ? { rating: top.rating, label: ratingFor(top.score).label }
      : { rating: 'NONE', label: 'No risks found' },
    totals: {
      risks: risks.length,
      findings: findings.length,
      critical: count('CRITICAL'),
      high: count('HIGH'),
      medium: count('MEDIUM'),
      low: count('LOW'),
      vendorActions: risks.filter(r => r.actionBy !== 'Buyer').length,
      buyerActions: risks.filter(r => r.actionBy !== 'Vendor').length,
    },
    grid,
    risks,
    note: RISK_NOTE,
  };
}
