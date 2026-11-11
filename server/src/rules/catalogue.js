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
  RULE_VERSION as S3_RULE_VERSION,
  CONTROL_LIBRARY,
  FAMILIES,
  ANSWER_TYPES,
  DOCUMENT_TYPES,
  STATUSES,
  CONTINUITY_TARGETS,
  CRITICAL_POLICY,
} from '../engine/assurance.js';
import { S4_RULE_PACK, TOPICS, CATEGORIES } from '../engine/clauses.js';
import { S5_RULE_PACK, RULES } from '../engine/obligations.js';
import { S6_RULE_PACK, ADEQUACY, ROUTE_STATUS } from '../engine/transfers.js';
import { S7_RULE_PACK, THEMES, SEVERITY, RATINGS } from '../engine/risks.js';
import { S8_RULE_PACK, DUE_DAYS } from '../engine/remediation.js';
import { S9_RULE_PACK, REVIEW_MONTHS, EXPIRY_WARNING_DAYS } from '../engine/report.js';
import { countryName } from '../reference/countries.js';

const table = (title, columns, rows, note = null) => ({ title, columns, rows, note });

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
      version: S3_RULE_VERSION,
      file: 'engine/assurance.js',
      tables: [
        table(
          'Control library',
          [
            'Control ID',
            'Family',
            'Question',
            'Answer type',
            'Applicability rule',
            'Mandatory',
            'Evidence',
            'Weight',
            'Legal reference',
            'Rule version',
          ],
          CONTROL_LIBRARY.map(c => [
            `${c.id} (${c.ass})`,
            FAMILIES[c.family],
            c.question,
            ANSWER_TYPES[c.answerType].label,
            `${c.applies.id}: ${c.applies.text}`,
            'Yes, when it applies',
            c.evidence.map(t => DOCUMENT_TYPES[t].label).join('; ') || '—',
            String(c.weight),
            typeof c.legalRef === 'function'
              ? c.legalRef({ law: 'UK GDPR', personalData: 'Yes' })
              : c.legalRef,
            S3_RULE_VERSION,
          ]),
          `${CONTROL_LIBRARY.length} controls. Only the controls whose rule applies are activated; the rest are NOT APPLICABLE, which is different from UNANSWERED. Questions marked by the APP-UNVERIFIED rule are added for a vendor with no previously verified evidence (buyer-added or not yet approved).`,
        ),
        table(
          'Status points',
          ['Status', 'Points'],
          Object.entries(STATUSES).map(([, v]) => [
            v.label,
            v.points == null ? 'Left out of the score' : String(v.points),
          ]),
          'Score = weighted points of the applicable controls ÷ their total weight × 100. NOT APPLICABLE controls are left out of the denominator. UNKNOWN and missing evidence stay visible as gaps.',
        ),
        table(
          'Overall position',
          ['Position', 'When'],
          [
            [
              'Escalation required',
              `A critical control is FAIL, UNKNOWN or REVIEW REQUIRED (policy: ${CRITICAL_POLICY}; with "block" the label is "Approval blocked"). The score never overrides this.`,
            ],
            [
              'Satisfactory (provisional)',
              'Score 80 or more, and no FAIL, UNKNOWN or REVIEW REQUIRED controls',
            ],
            ['Conditional', 'Any other result'],
          ],
          'Provisional findings only. Never a final legal approval, and never called "compliant".',
        ),
        table(
          'Continuity targets (provisional)',
          ['Service criticality', 'RTO (hours)', 'RPO (hours)'],
          Object.entries(CONTINUITY_TARGETS).map(([k, t]) => [k, String(t.rto), String(t.rpo)]),
        ),
        table(
          'Documents requested by control',
          ['Document', 'Expiry date needed'],
          Object.values(DOCUMENT_TYPES).map(t => [
            t.label,
            t.expires ? 'Yes' : t.maxAgeMonths ? `Issued in the last ${t.maxAgeMonths} months` : 'No',
          ]),
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
          'Clause categories',
          ['Clause ID', 'Clause name', 'What to check', 'Applies as', 'The text must show'],
          CATEGORIES.map(c => [
            c.id,
            c.name,
            c.check,
            c.group === 'ART28'
              ? `UK GDPR Art. ${c.article} (controller–processor only)`
              : c.group === 'TRANSFER'
                ? 'UK GDPR Chapter V (when data leaves the UK)'
                : 'Contract term (not statutory)',
            c.requires.map(r => r.label).join('; '),
          ]),
          'Each category becomes a finding: FOUND, PARTIAL, MISSING, NOT APPLICABLE or HUMAN REVIEW. A heading alone is not proof, and nothing is reported missing when the text could not be read well enough.',
        ),
        table(
          'Clause topics (tags used by Stages 5 and 6)',
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
