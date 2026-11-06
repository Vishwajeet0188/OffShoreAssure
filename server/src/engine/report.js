/*
 * Stage 9 – Monitoring and audit (steps 40 and 43).
 *
 * Step 40: put the latest saved record of every stage into one report, with
 * the audit trail and an index of every document and record fingerprint, so a
 * reviewer can trace each statement back to its evidence.
 *
 * Step 43: keep watching after the report: certificates and insurance that
 * expire, actions that are overdue, records that changed since the report, and
 * the next periodic review. Renewals become requests to the vendor.
 *
 * The review intervals and warning periods are PROVISIONAL (rule pack
 * RP-2026.10-S9-draft) until the client sends the Stage 9 specification.
 * The report never says "compliant": it states the position and what is open.
 */
export const S9_RULE_PACK = 'RP-2026.10-S9-draft';

export const REPORT_NOTE =
  'This report brings together the saved records of each stage with their evidence. It supports a decision; it is not a legal opinion or a compliance certificate.';

/* Months until the next full review, by the requirement's risk tier. */
export const REVIEW_MONTHS = { CRITICAL: 3, HIGH: 6, MEDIUM: 12, LOW: 24 };
/* Warn this many days before a certificate or insurance expires. */
export const EXPIRY_WARNING_DAYS = 90;

const DAY = 86400000;
const iso = d => new Date(d).toISOString().slice(0, 10);
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return iso(d);
};

/* The overall position stated in the report (never "compliant"). */
export function assessmentPosition({ residual, actions }) {
  const open = actions.filter(a => ['PROPOSED', 'OPEN', 'RETURNED', 'SUBMITTED'].includes(a.status)).length;
  const accepted = actions.filter(a => a.status === 'RISK_ACCEPTED').length;
  const remaining = residual?.overall?.rating || 'NONE';
  if (['CRITICAL', 'HIGH'].includes(remaining) && open) {
    return {
      code: 'ACTION_REQUIRED',
      label: 'Action required',
      detail: `${open} action${open === 1 ? '' : 's'} still open and the remaining highest risk is ${remaining.toLowerCase()}.`,
    };
  }
  if (open)
    return {
      code: 'IN_REMEDIATION',
      label: 'In remediation',
      detail: `${open} action${open === 1 ? '' : 's'} still open. The remaining highest risk is ${remaining.toLowerCase()}.`,
    };
  if (accepted)
    return {
      code: 'RISKS_ACCEPTED',
      label: 'Open items closed; some risks accepted',
      detail: `Every action is closed or accepted. ${accepted} risk${accepted === 1 ? ' was' : 's were'} accepted by the buyer with a recorded reason.`,
    };
  return {
    code: 'ACTIONS_CLOSED',
    label: 'All actions closed',
    detail: `Every action from the risk register is closed. The remaining highest risk is ${remaining === 'NONE' ? 'none' : remaining.toLowerCase()}.`,
  };
}

/**
 * Step 40: the report content. `s` holds the latest saved record of each stage (see reports/routes.js).
 */
export function compileReport(s) {
  const position = assessmentPosition({
    residual: s.remediation?.residual,
    actions: s.remediation?.actions || [],
  });
  const sections = [
    {
      stage: 1,
      title: 'Requirement',
      summary: `${s.requirement.title} · ${s.requirement.service} · ${s.requirement.criticality} criticality · risk tier ${s.requirement.riskTier.toLowerCase()}.`,
      facts: [
        ['Profile version', 'v' + s.requirement.version],
        ['Personal data', s.requirement.personalData],
        ['Data classification', s.requirement.classification],
        ['Processing countries', s.requirement.countries.join(', ') || 'None outside the buyer country'],
      ],
      record: s.requirement.sha256,
    },
    s.selection && {
      stage: 2,
      title: 'Vendor selection',
      summary: `${s.selection.vendor} selected (${(s.selection.status || 'SELECTED').toLowerCase().replace(/_/g, ' ')}), Vendor Selection Record v${s.selection.version}.0.`,
      facts: [
        ['Source', s.selection.source || 'DIRECTORY'],
        ['Reason', s.selection.rationale],
        ['Conditions', String(s.selection.conditions)],
      ],
      record: s.selection.sha256,
    },
    s.compliance && {
      stage: 3,
      title: 'Compliance assessment',
      summary: `Provisional score ${s.compliance.overall}/100 (${s.compliance.rating.toLowerCase()}), ${s.compliance.gaps} gap${s.compliance.gaps === 1 ? '' : 's'}, ${s.compliance.evidence} document${s.compliance.evidence === 1 ? '' : 's'}.`,
      facts: s.compliance.areas.map(a => [a.label, `${a.score}/100`]),
      record: s.compliance.sha256,
    },
    s.contract && {
      stage: 4,
      title: 'Contract analysis',
      summary: `Contract v${s.contract.version} (${s.contract.fileName}): ${s.contract.clauses} clauses, ${s.contract.notFound.length} expected topic${s.contract.notFound.length === 1 ? '' : 's'} not found.`,
      facts: s.contract.notFound.map(t => ['Not found', t]),
      record: s.contract.sha256,
    },
    s.obligations && {
      stage: 5,
      title: 'Obligation extraction',
      summary: `${s.obligations.total} obligations, prohibitions and rights; ${s.obligations.rulesCovered} of ${s.obligations.rulesTotal} rules covered.`,
      facts: s.obligations.gaps.map(g => ['Gap', g]),
      record: s.obligations.sha256,
    },
    s.transfers && {
      stage: 6,
      title: 'Transfer assessment',
      summary: `${s.transfers.routes.length} data route${s.transfers.routes.length === 1 ? '' : 's'}; most serious: ${s.transfers.overall.toLowerCase()}.`,
      facts: s.transfers.routes.map(r => [r.route, r.status]),
      record: s.transfers.sha256,
    },
    s.risks && {
      stage: 7,
      title: 'Risk identification',
      summary: `${s.risks.totals.risks} risks from ${s.risks.totals.findings} findings (register v${s.risks.version}); highest ${s.risks.overall.toLowerCase()}.`,
      facts: s.risks.top.map(r => [r.id + ' · ' + r.title, `${r.score} · ${r.rating.toLowerCase()}`]),
      record: s.risks.sha256,
    },
    s.remediation && {
      stage: 8,
      title: 'Remediation',
      summary: `${s.remediation.actions.length} actions: ${s.remediation.residual.totals.closed} closed, ${s.remediation.residual.totals.accepted} risks accepted, ${s.remediation.residual.totals.open + s.remediation.residual.totals.awaitingReview + s.remediation.residual.totals.proposed} open. Remaining highest risk: ${s.remediation.residual.overall.label.toLowerCase()}.`,
      facts: s.remediation.residual.risks.map(r => [
        r.id + ' · ' + r.title,
        `${r.original.score} → ${r.score} (${r.status.toLowerCase().replace('_', ' ')})`,
      ]),
      record: s.remediation.sha256,
    },
  ].filter(Boolean);

  return {
    rulePackVersion: S9_RULE_PACK,
    assessment: s.assessment,
    position,
    sections,
    acceptedRisks: (s.remediation?.actions || [])
      .filter(a => a.status === 'RISK_ACCEPTED')
      .map(a => ({ code: a.code, title: a.title, reason: a.buyerNote })),
    openActions: (s.remediation?.actions || [])
      .filter(a => ['PROPOSED', 'OPEN', 'RETURNED', 'SUBMITTED'].includes(a.status))
      .map(a => ({ code: a.code, title: a.title, owner: a.owner, status: a.statusLabel, dueOn: a.dueOn })),
    evidence: s.evidence,
    auditTrail: { events: s.audit.length, first: s.audit[0]?.at || null, last: s.audit.at(-1)?.at || null },
    nextReviewOn: addMonths(s.generatedAt, REVIEW_MONTHS[s.requirement.riskTier] || 12),
    note: REPORT_NOTE,
  };
}

/**
 * Step 43: what needs attention now.
 *
 * @param {object} m
 *   evidence     Stage 3 documents with expiresOn
 *   actions      Stage 8 actions (shaped)
 *   lastReport   { version, createdAt, inputs } or null
 *   inputs       the current versions of every stage record
 *   riskTier     requirement risk tier
 *   requested    Map of monitoring key → the action already sent to the vendor for it
 */
export function monitoringItems({
  evidence = [],
  actions = [],
  lastReport = null,
  inputs = {},
  riskTier = 'MEDIUM',
  requested = new Map(),
  today = new Date(),
}) {
  const items = [];
  const now = today.getTime();

  for (const e of evidence) {
    if (!e.expiresOn) continue;
    const days = Math.round((new Date(e.expiresOn).getTime() - now) / DAY);
    if (days > EXPIRY_WARNING_DAYS) continue;
    const key = `renew:${e.id}`;
    const request = requested.get(key); // the action already sent for it, if any
    const renewed = request?.status === 'CLOSED';
    const what = e.type === 'insurance' ? 'insurance certificate' : 'certificate';
    items.push({
      key,
      kind: 'renewal',
      owner: 'vendor',
      canRequest: !request,
      severity: renewed ? 'low' : days < 0 ? 'high' : 'medium',
      request: request
        ? { code: request.code, status: request.status, statusLabel: request.statusLabel }
        : null,
      title:
        days < 0
          ? `${e.fileName} expired on ${e.expiresOn}`
          : `${e.fileName} expires on ${e.expiresOn} (in ${days} day${days === 1 ? '' : 's'})`,
      detail: renewed
        ? `The renewed ${what} was received and checked (${request.code}).`
        : request
          ? `Renewal requested from the vendor (${request.code} · ${request.statusLabel.toLowerCase()}).`
          : `Ask the vendor for the renewed ${what} (control ${e.controlId}).`,
      dueOn: iso(Math.max(now + 14 * DAY, Math.min(new Date(e.expiresOn).getTime(), now + 30 * DAY))),
    });
  }

  for (const a of actions) {
    if (a.dueOn && ['OPEN', 'RETURNED'].includes(a.status) && a.dueOn < iso(now)) {
      items.push({
        key: `overdue:${a.code}`,
        kind: 'overdue',
        severity: 'high',
        owner: a.owner,
        canRequest: false,
        title: `${a.code} is overdue (due ${a.dueOn})`,
        detail: `${a.title}. Chase it in Stage 8 · Remediation.`,
      });
    }
  }

  if (lastReport) {
    const changed = Object.keys(inputs).filter(k => inputs[k] !== lastReport.inputs?.[k]);
    if (changed.length)
      items.push({
        key: 'changed',
        kind: 'change',
        severity: 'medium',
        owner: 'buyer',
        canRequest: false,
        title: `Records changed since report v${lastReport.version}.0`,
        detail: `Changed: ${changed.join(', ')}. Generate the report again to bring it up to date.`,
      });
    const reviewOn = addMonths(lastReport.createdAt, REVIEW_MONTHS[riskTier] || 12);
    const days = Math.round((new Date(reviewOn).getTime() - now) / DAY);
    items.push({
      key: 'review',
      kind: 'review',
      severity: days < 0 ? 'high' : days <= 30 ? 'medium' : 'low',
      owner: 'buyer',
      canRequest: false,
      title: days < 0 ? `Periodic review overdue since ${reviewOn}` : `Next periodic review on ${reviewOn}`,
      detail: `Every ${REVIEW_MONTHS[riskTier] || 12} months for a ${riskTier.toLowerCase()} risk tier: confirm the requirement, re-run the questionnaire and the contract checks.`,
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
