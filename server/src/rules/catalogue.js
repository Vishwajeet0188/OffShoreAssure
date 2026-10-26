/*
 * Admin · Rule base (prototype runbook "Settings → Rule base: rule tables shown";
 * Technical Architecture "proprietary rule base, authored and maintained in house").
 *
 * The rules themselves live in server/src/engine/*.js, one file per stage, each
 * with its own rule-pack version that is saved with every result. This file only
 * reads them and lays them out as tables, so the page always shows exactly what
 * the engines apply. Nothing here can change a rule: changes are made in the
 * engine files and released as a new rule-pack version.
 */
import { RULE_PACK_VERSION, SERVICE_CODES, CLASSIFICATIONS } from '../engine/rulepack.js';
import { CONTROLS } from '../engine/controls.js';
import { FIT_RULE_PACK, WEIGHTS } from '../engine/vendorFit.js';
import {
  S3_RULE_PACK,
  ANSWER_POINTS,
  AREAS,
  CONTROL_QUESTIONS,
  EVIDENCE_TYPES,
  EXPIRING,
} from '../engine/questionnaire.js';
import { S4_RULE_PACK, TOPICS } from '../engine/clauses.js';
import { S5_RULE_PACK, RULES } from '../engine/obligations.js';
import { S6_RULE_PACK, ADEQUACY, ROUTE_STATUS } from '../engine/transfers.js';
import { S7_RULE_PACK, THEMES, SEVERITY, RATINGS } from '../engine/risks.js';
import { S8_RULE_PACK, DUE_DAYS } from '../engine/remediation.js';
import { S9_RULE_PACK, REVIEW_MONTHS, EXPIRY_WARNING_DAYS } from '../engine/report.js';
import { countryName } from '../reference/countries.js';

const table = (title, columns, rows, note = null) => ({ title, columns, rows, note });
const controlName = Object.fromEntries(CONTROLS.map(c => [c.id, c.name]));

/*
 * Stage 1 risk tier and classification rules, in words. They mirror derive() in
 * engine/rulepack.js; if that function changes, change these lines with it.
 */
const TIER_RULES = [
  ['Critical', 'Special-category or criminal-offence data; or a Critical service with personal data'],
  [
    'High',
    'Personal data + processed or accessed outside the buyer’s country + privileged access; or a Critical service',
  ],
  ['Medium', 'Personal data; or offshore privileged access; or a High-criticality service'],
  ['Low', 'Anything else'],
];
const CLASSIFICATION_RULES = [
  ['SPECIAL_CATEGORY', 'Special-category or criminal-offence data = Yes'],
  ['PERSONAL', 'Personal data = Yes or Unknown'],
  ['CONFIDENTIAL', 'Privileged access, or a High/Critical service'],
  ['INTERNAL', 'Anything else'],
];

export function ruleCatalogue() {
  return [
    {
      stage: 1,
      title: 'Requirement',
      version: RULE_PACK_VERSION,
      file: 'engine/rulepack.js, engine/controls.js',
      tables: [
        table(
          'Assurance controls',
          ['Control', 'Name', 'What it verifies'],
          CONTROLS.map(c => [c.id, c.name, c.verifies]),
        ),
        table('Preliminary risk tier', ['Tier', 'When'], TIER_RULES),
        table(
          'Data classification',
          ['Class', 'When'],
          CLASSIFICATION_RULES.filter(([c]) => CLASSIFICATIONS.includes(c)),
        ),
        table('Service codes', ['Service', 'Code'], Object.entries(SERVICE_CODES)),
      ],
    },
    {
      stage: 2,
      title: 'Vendor selection',
      version: FIT_RULE_PACK,
      file: 'engine/vendorFit.js',
      tables: [
        table(
          'Fit score weights',
          ['Criterion', 'Weight'],
          WEIGHTS.map(w => [w.criterion, `${w.weight}%`]),
          'Only directory vendors are ranked. A vendor the buyer adds itself gets a summary, never a rank.',
        ),
      ],
    },
    {
      stage: 3,
      title: 'Compliance assessment',
      version: S3_RULE_PACK,
      file: 'engine/questionnaire.js',
      tables: [
        table(
          'Answer points',
          ['Answer', 'Points'],
          Object.entries(ANSWER_POINTS).map(([a, p]) => [a, String(p)]),
          '“Yes” that needs evidence counts as 50 until a valid document is uploaded. An expired certificate or insurance does not count.',
        ),
        table(
          'Score bands',
          ['Band', 'Score'],
          [
            ['Strong', '80–100'],
            ['Adequate, with gaps', '60–79'],
            ['Weak', '40–59'],
            ['Insufficient', '0–39'],
          ],
        ),
        table(
          'Scoring areas',
          ['Area', 'Controls'],
          AREAS.map(([, label, ids]) => [label, ids.join(', ')]),
        ),
        table(
          'Questions',
          ['Control', 'Question', 'Evidence'],
          Object.entries(CONTROL_QUESTIONS).flatMap(([id, qs]) =>
            qs.map(q => [
              `${id} ${controlName[id] || ''}`.trim(),
              q.text,
              q.evidence ? EVIDENCE_TYPES[q.evidence] || q.evidence : '—',
            ]),
          ),
        ),
        table(
          'Documents that expire',
          ['Type'],
          EXPIRING.map(t => [EVIDENCE_TYPES[t]]),
        ),
      ],
    },
    {
      stage: 4,
      title: 'Contract analysis',
      version: S4_RULE_PACK,
      file: 'engine/clauses.js',
      tables: [
        table(
          'Clause topics',
          ['Topic', 'Controls', 'Words it looks for'],
          TOPICS.map(t => [
            t.name,
            (t.controls || []).join(', ') || '—',
            [...(t.headingWords || []), ...(t.phrases || [])].slice(0, 8).join(', '),
          ]),
        ),
      ],
    },
    {
      stage: 5,
      title: 'Obligation extraction',
      version: S5_RULE_PACK,
      file: 'engine/obligations.js',
      tables: [
        table(
          'Rules obligations are checked against',
          ['Rule', 'Who', 'Rule text', 'Source'],
          RULES.map(r => [r.id, r.party, r.text, r.source]),
        ),
        table(
          'Monitored obligations',
          ['Item', 'Rule'],
          [
            [
              'Monitored',
              'An obligation or prohibition with a deadline or a repeat (e.g. “within 24 hours”, “each month”)',
            ],
            ['Trigger', 'The condition; else the deadline; else how often'],
            [
              'Consequence',
              'A remedy in the same clause or section (service credits, termination, liability …); else a general breach term; else “Not stated”',
            ],
            ['Missed', 'Reported by the buyer; becomes a Stage 8 action due in 14 days'],
          ],
        ),
      ],
    },
    {
      stage: 6,
      title: 'Transfer assessment',
      version: S6_RULE_PACK,
      file: 'engine/transfers.js',
      tables: [
        table(
          'UK adequacy list',
          ['Country', 'Condition'],
          Object.entries(ADEQUACY).map(([code, condition]) => [countryName(code), condition || 'None']),
        ),
        table(
          'Route results',
          ['Result'],
          Object.values(ROUTE_STATUS)
            .sort((a, b) => b.rank - a.rank)
            .map(s => [s.label]),
        ),
      ],
    },
    {
      stage: 7,
      title: 'Risk identification',
      version: S7_RULE_PACK,
      file: 'engine/risks.js',
      tables: [
        table(
          'Risk subjects',
          ['Subject', 'Impact (1–5)', 'Controls'],
          THEMES.map(t => [t.name, String(t.impact), (t.controls || []).join(', ') || '—']),
        ),
        table(
          'Likelihood from the finding',
          ['Finding', 'Likelihood (1–5)'],
          Object.values(SEVERITY).map(s => [s.label, String(s.likelihood)]),
          '+1 when two or more stages agree; −1 when the vendor’s evidence scored 80 or more. Impact +1 for sensitive data on a data subject, +1 for a Critical service. Capped at 5.',
        ),
        table(
          'Rating bands (likelihood × impact)',
          ['Rating', 'Score from'],
          RATINGS.map(r => [r.label, String(r.min)]),
        ),
      ],
    },
    {
      stage: 8,
      title: 'Remediation',
      version: S8_RULE_PACK,
      file: 'engine/remediation.js',
      tables: [
        table(
          'Action due dates',
          ['Risk rating', 'Days'],
          Object.entries(DUE_DAYS).map(([r, d]) => [r[0] + r.slice(1).toLowerCase(), String(d)]),
        ),
        table(
          'Remaining risk',
          ['When', 'Effect'],
          [
            ['All of a risk’s actions closed', 'Likelihood 1 (fixed)'],
            ['Some closed', 'Likelihood −1 (partly fixed)'],
            ['Risk accepted', 'Unchanged, marked accepted'],
          ],
        ),
      ],
    },
    {
      stage: 9,
      title: 'Monitoring and audit',
      version: S9_RULE_PACK,
      file: 'engine/report.js, monitoring/job.js',
      tables: [
        table(
          'Periodic review',
          ['Risk tier', 'Every'],
          Object.entries(REVIEW_MONTHS).map(([t, m]) => [t[0] + t.slice(1).toLowerCase(), `${m} months`]),
        ),
        table(
          'Expiry and renewals',
          ['Rule', 'Value'],
          [
            ['Warn before a certificate or insurance expires', `${EXPIRY_WARNING_DAYS} days`],
            ['Ask the vendor for the renewal automatically', '30 days before expiry'],
            ['Automatic checks', 'Once a day: re-score, rebuild the risk register, request renewals'],
          ],
        ),
        table(
          'Report position',
          ['Position', 'When'],
          [
            ['Action required', 'Actions still open and the remaining highest risk is High or Critical'],
            ['In remediation', 'Actions still open'],
            [
              'Open items closed; some risks accepted',
              'Every action closed or accepted, at least one accepted',
            ],
            ['All actions closed', 'Every action closed'],
          ],
        ),
      ],
    },
  ];
}
