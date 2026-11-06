/*
 * Stage 8 – Remediation (steps 33 and 36).
 *
 * Step 33: every risk in the latest risk register (Stage 7) becomes a proposed
 * action. A risk that needs work from both sides becomes two actions, one for
 * the vendor and one for the buyer. Each action lists what is needed, in plain
 * words, and gets a due date from the risk's rating.
 *
 * Step 36: when an action is closed or a risk is accepted, the engine works out
 * the remaining ("residual") risk and lists the earlier checks that should be
 * run again (for example the contract analysis after a new contract version).
 *
 * The due dates and the residual rules are PROVISIONAL (rule pack
 * RP-2026.10-S8-draft) until the client sends the Stage 8 specification.
 */
import { ratingFor } from './risks.js';

export const S8_RULE_PACK = 'RP-2026.10-S8-draft';

export const REMEDIATION_NOTE =
  'Actions come from the risk register and are checked by the buyer. A closed action lowers the remaining risk; it is not a compliance conclusion.';

/* Days to complete an action, by the risk's rating. */
export const DUE_DAYS = { CRITICAL: 7, HIGH: 14, MEDIUM: 30, LOW: 60 };

/* Where an action is in its life. */
export const ACTION_STATUS = {
  PROPOSED: { label: 'Proposed', open: true },
  OPEN: { label: 'Open', open: true },
  RETURNED: { label: 'Returned for more', open: true },
  SUBMITTED: { label: 'Waiting for your review', open: true },
  CLOSED: { label: 'Closed', open: false },
  RISK_ACCEPTED: { label: 'Risk accepted', open: false },
};

/* What to ask for, by the stage a finding came from. */
const ASK = {
  1: { buyer: f => `Confirm the answer in the requirement: ${f.text}` },
  2: {
    vendor: f => `Confirm and evidence: ${f.text}`,
    buyer: f => `Review the selection condition: ${f.text}`,
  },
  3: { vendor: f => `Fix the gap and upload evidence: ${f.text}` },
  4: { buyer: f => `Add or point to the contract clause: ${f.text}` },
  5: { buyer: f => `Add the missing obligation to the contract: ${f.text}` },
  6: {
    vendor: f => `Provide what is needed for this transfer route: ${f.text}`,
    buyer: f => `Decide on this transfer route: ${f.text}`,
  },
};
const askFor = (f, owner) => (ASK[f.stage]?.[owner] || (x => x.text))(f);

// Stages whose saved result must be run again once an action from them is done.
const RECHECK = {
  1: 'Correct the requirement answers (Stage 1)',
  3: 'Re-score the compliance answers and evidence (Stage 3)',
  4: 'Upload the updated contract (Stage 4)',
  5: 'Extract the obligations again (Stage 5)',
  6: 'Run the transfer assessment again (Stage 6)',
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Step 33: the proposed actions for a risk register.
 *
 * @param {Array} risks       risks from the Stage 7 register
 * @param {Date}  today
 * @param {Set}   alreadyPlanned  'theme:owner' keys that already have an action (when the plan is updated
 *                              from a newer register, risk numbers can change but the subjects do not)
 */
export function proposeActions(risks, today = new Date(), alreadyPlanned = new Set()) {
  const actions = [];
  for (const risk of risks) {
    for (const owner of ['vendor', 'buyer']) {
      if (alreadyPlanned.has(`${risk.theme}:${owner}`)) continue;
      // A finding the vendor must act on goes to the vendor; everything else to the buyer.
      const findings = risk.findings.filter(f =>
        owner === 'vendor' ? f.owner === 'Vendor' : f.owner !== 'Vendor',
      );
      if (!findings.length) continue;
      const requests = [...new Set(findings.map(f => askFor(f, owner)))];
      actions.push({
        riskId: risk.id,
        theme: risk.theme,
        title:
          owner === 'vendor'
            ? `${risk.title}: evidence and fixes from the vendor`
            : `${risk.title}: decisions and contract changes`,
        owner,
        requests,
        needsDocument:
          owner === 'vendor'
            ? findings.some(f => [3, 6].includes(f.stage))
            : findings.some(f => [4, 5].includes(f.stage)),
        sourceStages: [...new Set(findings.map(f => f.stage))].sort(),
        rating: risk.rating,
        score: risk.score,
        likelihood: risk.likelihood,
        impact: risk.impact,
        suggestedDueOn: addDays(today, DUE_DAYS[risk.rating] || 30),
      });
    }
  }
  return actions;
}

/**
 * Step 36: the remaining risk after the actions taken so far, and the checks to run again.
 *
 * Closed actions lower the likelihood: all of a risk's actions closed → likelihood 1;
 * some closed → one step lower. An accepted risk keeps its score but is marked accepted.
 */
export function residualRisks(risks, actions, today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);

  const residual = risks.map(risk => {
    const mine = actions.filter(a => a.theme === risk.theme);
    const closed = mine.filter(a => a.status === 'CLOSED').length;
    const accepted = mine.some(a => a.status === 'RISK_ACCEPTED');
    let likelihood = risk.likelihood;
    let status = 'OPEN';
    if (accepted) status = 'ACCEPTED';
    else if (mine.length && closed === mine.length) {
      likelihood = 1;
      status = 'MITIGATED';
    } else if (closed > 0) {
      likelihood = Math.max(1, likelihood - 1);
      status = 'PART_MITIGATED';
    }

    const score = likelihood * risk.impact;
    return {
      id: risk.id,
      title: risk.title,
      theme: risk.theme,
      status,
      original: { likelihood: risk.likelihood, impact: risk.impact, score: risk.score, rating: risk.rating },
      likelihood,
      impact: risk.impact,
      score,
      rating: ratingFor(score).code,
      actions: mine.length,
      closedActions: closed,
    };
  });

  const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of residual) if (r.status !== 'MITIGATED') grid[r.likelihood - 1][r.impact - 1] += 1;

  const count = status => actions.filter(a => a.status === status).length;
  const open = actions.filter(a => ACTION_STATUS[a.status]?.open && a.status !== 'PROPOSED');
  const overdue = open.filter(
    a => a.dueOn && String(a.dueOn).slice(0, 10) < todayIso && a.status !== 'SUBMITTED',
  );

  const recheck = [...new Set(actions.filter(a => a.status === 'CLOSED').flatMap(a => a.sourceStages || []))]
    .filter(stage => RECHECK[stage])
    .sort()
    .map(stage => ({ stage, text: RECHECK[stage] }));

  const live = residual.filter(r => r.status !== 'MITIGATED');
  const top = [...live].sort((a, b) => b.score - a.score)[0];
  return {
    rulePackVersion: S8_RULE_PACK,
    risks: residual,
    grid,
    overall: top
      ? { rating: top.rating, label: ratingFor(top.score).label }
      : { rating: 'NONE', label: 'No open risks' },
    totals: {
      actions: actions.length,
      proposed: count('PROPOSED'),
      open: count('OPEN') + count('RETURNED'),
      awaitingReview: count('SUBMITTED'),
      overdue: overdue.length,
      closed: count('CLOSED'),
      accepted: count('RISK_ACCEPTED'),
      mitigatedRisks: residual.filter(r => r.status === 'MITIGATED').length,
      openRisks: live.length,
    },
    recheck,
    note: REMEDIATION_NOTE,
  };
}

/* Step 35: the automatic checks on a response before it reaches the buyer. */
export function checkSubmission(action, response, evidenceCount) {
  const problems = [];
  if (!response || response.trim().length < 10)
    problems.push('Explain what was done in at least 10 characters.');
  if (action.needs_document && evidenceCount === 0) problems.push('Upload at least one document as proof.');
  return problems;
}
