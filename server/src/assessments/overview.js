/*
 * Buyer dashboard overview (GET /api/assessments/overview).
 *
 * One request that gathers what the dashboard shows, all from saved records:
 *   - headline figures: vendors, on track / attention / high risk, open actions, average score
 *   - assessments by service, with the average compliance score
 *   - the outsourcing footprint: every country the service is delivered or hosted from
 *   - recent activity from the assessment timelines
 *   - the open risks from the latest risk registers, with their action status
 *   - the latest compliance assessments
 *
 * Words follow the client's dashboard demo: an assessment is "Compliant",
 * "Attention", "High Risk", or "In Progress" (no risk register or report yet).
 */
import { query } from '../db.js';
import { countryName } from '../reference/countries.js';

const day = value =>
  value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : null;
const actionCode = number => `ACT-${String(number).padStart(2, '0')}`;

const RATING_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/* The period picker on the dashboard: assessments started in the last N days, or all. */
export const PERIODS = { all: null, 30: 30, 90: 90, 365: 365 };

// OffshoreAssure is for UK buyers; a requirement can name another home country.
const DEFAULT_HOME_COUNTRY = 'GB';
const OPEN_STATUSES = ['PROPOSED', 'OPEN', 'RETURNED', 'SUBMITTED'];

/*
 * Where an assessment stands, in one word. The Stage 9 report decides when there is one;
 * otherwise the highest rating in the latest risk register; otherwise it is still in progress.
 */
export function standing({ reportPosition, riskRating }) {
  if (reportPosition) {
    if (reportPosition === 'ACTION_REQUIRED') return 'HIGH_RISK';
    if (reportPosition === 'IN_REMEDIATION') return 'ATTENTION';
    return 'ON_TRACK';
  }

  if (!riskRating) return 'IN_PROGRESS';
  if (riskRating === 'CRITICAL' || riskRating === 'HIGH') return 'HIGH_RISK';
  if (riskRating === 'MEDIUM') return 'ATTENTION';
  return 'ON_TRACK';
}

export const STANDING_LABEL = {
  ON_TRACK: 'Compliant',
  ATTENTION: 'Attention',
  HIGH_RISK: 'High Risk',
  IN_PROGRESS: 'In Progress',
};

export async function buyerOverview(buyerId, userId, period = 'all') {
  const days = PERIODS[period] ?? null;

  const { rows: assessments } = await query(
    `SELECT a.id, a.reference, a.service_code, a.risk_tier, a.created_at,
            r.title, r.data AS requirement,
            v.name AS vendor_name, v.country AS vendor_country,
            (SELECT cr.overall_score
               FROM compliance_results cr
               JOIN compliance_assessments c ON c.id = cr.compliance_id
              WHERE c.assessment_id = a.id
              ORDER BY cr.version DESC
              LIMIT 1) AS score,
            (SELECT cr.rating
               FROM compliance_results cr
               JOIN compliance_assessments c ON c.id = cr.compliance_id
              WHERE c.assessment_id = a.id
              ORDER BY cr.version DESC
              LIMIT 1) AS score_rating,
            (SELECT cr.overall_score
               FROM compliance_results cr
               JOIN compliance_assessments c ON c.id = cr.compliance_id
              WHERE c.assessment_id = a.id AND cr.created_at <= now() - interval '30 days'
              ORDER BY cr.version DESC
              LIMIT 1) AS score_month_ago,
            (SELECT g.overall ->> 'rating'
               FROM risk_registers g
              WHERE g.assessment_id = a.id
              ORDER BY g.version DESC
              LIMIT 1) AS risk_rating,
            (SELECT p.position ->> 'code'
               FROM report_versions p
              WHERE p.assessment_id = a.id
              ORDER BY p.version DESC
              LIMIT 1) AS report_position
       FROM assessments a
       JOIN requirements r ON r.id = a.requirement_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE a.buyer_id = $1
        AND ($2::int IS NULL OR a.created_at >= now() - make_interval(days => $2::int))
      ORDER BY a.created_at DESC`,
    [buyerId, days],
  );

  const ids = assessments.map(a => a.id);

  const { rows: actions } = ids.length
    ? await query(
        `SELECT assessment_id, number, theme, title, owner, status, due_on
           FROM remediation_actions
          WHERE assessment_id = ANY($1)`,
        [ids],
      )
    : { rows: [] };

  const {
    rows: [drafts],
  } = await query(`SELECT count(*)::int AS n FROM requirements WHERE created_by = $1 AND status = 'draft'`, [
    userId,
  ]);

  return {
    period: days ? String(days) : 'all',
    figures: figuresFor(assessments, actions, drafts.n),
    byService: byService(assessments),
    footprint: footprint(assessments),
    activity: await recentActivity(ids),
    openRisks: await openRisks(assessments, actions),
    recentAssessments: assessments.slice(0, 5).map(a => ({
      reference: a.reference,
      title: a.title,
      vendor: a.vendor_name,
      service: a.requirement?.serviceCategory || a.service_code,
      country: a.vendor_country ? { code: a.vendor_country, name: countryName(a.vendor_country) } : null,
      standing: standing({ reportPosition: a.report_position, riskRating: a.risk_rating }),
      score: a.score,
    })),
    standingLabels: STANDING_LABEL,
  };
}

function figuresFor(assessments, actions, drafts) {
  const count = wanted =>
    assessments.filter(
      a => standing({ reportPosition: a.report_position, riskRating: a.risk_rating }) === wanted,
    ).length;

  const scored = assessments.filter(a => a.score !== null);
  const vendors = new Set(assessments.map(a => a.vendor_name).filter(Boolean));
  const average = list =>
    list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null;

  // Vendors first chosen in the last 30 days (not in any older assessment).
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const olderVendors = new Set(
    assessments
      .filter(a => new Date(a.created_at).getTime() < monthAgo)
      .map(a => a.vendor_name)
      .filter(Boolean),
  );
  const newVendors = [...vendors].filter(name => !olderVendors.has(name)).length;

  // Average score now against the average a month ago (only when there was a score then).
  const averageScore = average(scored.map(a => a.score));
  const averageMonthAgo = average(assessments.map(a => a.score_month_ago).filter(score => score !== null));

  return {
    assessments: assessments.length,
    vendors: vendors.size,
    drafts,
    onTrack: count('ON_TRACK'),
    attention: count('ATTENTION'),
    highRisk: count('HIGH_RISK'),
    inProgress: count('IN_PROGRESS'),
    actionsOpen: actions.filter(x => OPEN_STATUSES.includes(x.status)).length,
    actionsWaitingForYou: actions.filter(x => x.status === 'SUBMITTED' || x.status === 'PROPOSED').length,
    averageScore,
    newVendorsThisMonth: newVendors,
    scoreChangeThisMonth:
      averageScore !== null && averageMonthAgo !== null ? averageScore - averageMonthAgo : null,
  };
}

/* Assessments grouped by the service being outsourced, with the average compliance score of each. */
function byService(assessments) {
  const groups = new Map();

  for (const a of assessments) {
    const service = a.requirement?.serviceCategory || a.service_code;
    const group = groups.get(service) || { service, count: 0, scores: [] };
    group.count += 1;
    if (a.score !== null) group.scores.push(a.score);
    groups.set(service, group);
  }

  return [...groups.values()]
    .map(g => ({
      service: g.service,
      count: g.count,
      averageScore: g.scores.length
        ? Math.round(g.scores.reduce((s, x) => s + x, 0) / g.scores.length)
        : null,
    }))
    .sort((x, y) => y.count - x.count);
}

/*
 * Every country involved: the buyer's own country (head office), where data is stored,
 * where it is accessed from, and where the selected vendor is registered.
 */
function footprint(assessments) {
  const countries = new Map();

  function add(code, role, reference) {
    if (!code || code.length !== 2) return;
    const entry = countries.get(code) || {
      code,
      name: countryName(code),
      roles: new Set(),
      assessments: new Set(),
    };
    entry.roles.add(role);
    entry.assessments.add(reference);
    countries.set(code, entry);
  }

  // Before the first assessment the map still shows where the buyer is.
  if (!assessments.length) {
    return [
      {
        code: DEFAULT_HOME_COUNTRY,
        name: countryName(DEFAULT_HOME_COUNTRY),
        roles: ['Head office'],
        assessments: 0,
      },
    ];
  }

  for (const a of assessments) {
    const data = a.requirement || {};
    add(data.buyerCountry || DEFAULT_HOME_COUNTRY, 'Head office', a.reference);
    for (const code of data.storageCountries || []) add(code, 'Data storage', a.reference);
    for (const code of data.remoteAccessCountries || []) add(code, 'Remote access', a.reference);
    add(a.vendor_country, 'Vendor', a.reference);
  }

  return [...countries.values()]
    .map(c => ({ code: c.code, name: c.name, roles: [...c.roles], assessments: c.assessments.size }))
    .sort((x, y) => y.assessments - x.assessments || x.name.localeCompare(y.name));
}

/* The latest events from the timelines of the buyer's assessments. */
async function recentActivity(ids) {
  if (!ids.length) return [];

  const { rows } = await query(
    `SELECT t.title, t.at, t.stage, t.step, a.reference, v.name AS vendor_name, v.country AS vendor_country
       FROM assessment_timeline t
       JOIN assessments a ON a.id = t.assessment_id
       LEFT JOIN organisations v ON v.id = a.selected_vendor_id
      WHERE t.assessment_id = ANY($1) AND t.kind = 'event' AND t.at IS NOT NULL
      ORDER BY t.at DESC, t.id DESC
      LIMIT 6`,
    [ids],
  );

  return rows.map(r => ({
    title: r.title,
    at: r.at,
    stage: r.stage,
    step: r.step,
    reference: r.reference,
    vendor: r.vendor_name,
    vendorCountry: r.vendor_country ? countryName(r.vendor_country) : null,
  }));
}

/*
 * Risks still open in the latest risk register of each assessment, highest first.
 * The status and due date come from the risk's actions in Stage 8.
 */
async function openRisks(assessments, actions) {
  const ids = assessments.map(a => a.id);
  if (!ids.length) return [];

  const { rows: registers } = await query(
    `SELECT DISTINCT ON (assessment_id) assessment_id, version, risks
       FROM risk_registers
      WHERE assessment_id = ANY($1)
      ORDER BY assessment_id, version DESC`,
    [ids],
  );

  const byId = new Map(assessments.map(a => [a.id, a]));
  const list = [];

  for (const register of registers) {
    const assessment = byId.get(register.assessment_id);

    for (const risk of register.risks) {
      const mine = actions.filter(x => x.assessment_id === register.assessment_id && x.theme === risk.theme);
      const open = mine.filter(x => OPEN_STATUSES.includes(x.status));

      // Closed or accepted everywhere: no longer open.
      if (mine.length && !open.length) continue;

      const dueDates = open
        .map(x => day(x.due_on))
        .filter(Boolean)
        .sort();
      // "In progress" once an agreed action is being worked on; "Open" until then.
      const working = open.some(x => ['OPEN', 'RETURNED', 'SUBMITTED'].includes(x.status));
      const status = working ? 'In progress' : 'Open';

      list.push({
        id: risk.id,
        reference: assessment.reference,
        vendor: assessment.vendor_name,
        vendorCountry: assessment.vendor_country,
        issue: risk.title,
        rating: risk.rating,
        score: risk.score,
        dueOn: dueDates[0] || null,
        status,
        actions: open.map(x => actionCode(x.number)),
      });
    }
  }

  return list.sort((x, y) => RATING_RANK[y.rating] - RATING_RANK[x.rating] || y.score - x.score).slice(0, 5);
}
