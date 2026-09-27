# OffshoreAssure Phase 1 Functional UI Prototype

OffshoreAssure is a clickable, working prototype of an outsourcing compliance and assurance platform. It runs two demonstration scenarios end to end:

- **Use Case 1:** Acme Financial Services Ltd outsourcing customer support to Global Assist Services Ltd in Bangalore, India.
- **Use Case 2:** Acme Financial Services Ltd outsourcing managed IT support to NordTech Support Sp. z o.o. in Warsaw, Poland. NordTech uses the sub-processor CloudOps Polska Sp. z o.o.

> **Phase 1 prototype: sample data and simulated interactions.**
>
> The prototype does not provide any of the following:
> - production authentication
> - a backend or database
> - live regulatory validation
> - production AI contract analysis
> - an external AI API
> - legally valid compliance certification
>
> All organisations, suppliers and contracts are fictional.

## Technology

| Item | What is used |
| --- | --- |
| UI library | React 19 (function components, JSX) |
| Language | JavaScript / JSX (no TypeScript) |
| Build tool | Vite 8 with `@vitejs/plugin-react` |
| Routing | React Router (`react-router-dom` 7, `BrowserRouter`) |
| State | React Context (`AssessmentContext`) plus hooks (`useAssessment`, `useSyncExternalStore`), saved to the browser's `localStorage` under the key `offshoreassure-proto-v2` |
| Styling | Hand-written CSS with design tokens (`src/styles.css`, unchanged from the earlier version). No Tailwind. |
| Icons | Inline SVG line icons (`src/components/common/Icon.jsx`). No icon package. |
| Fonts | Google Fonts (Source Serif 4, Hanken Grotesk, JetBrains Mono), linked in `index.html`, with system-font fallbacks |
| Data and rules | Local prototype data and a local, rule-based engine (`src/data`, `src/engine`) |

## Architecture

```text
React presentation layer   pages/ + components/        JSX views, same markup and CSS classes as the earlier version
React state / context      context/AssessmentContext   one store: assessments, evidence, actions, audit trail, UI state
                           hooks/useAssessment         { S, a, D, route, me, act } for every component
Rule engine (pure JS)      engine/engines.js           contract parser, rule checks, scoring, transfer gate,
                                                       delivery scoring, action sync, snapshots
Local data                 data/prototype-data.js      rule base RB-2026.09.1, requirement triggers, rubrics,
                           data/sample-contracts.js    jurisdiction table, suppliers, scenarios, sample feed
Report builders            lib/report.js               key findings, traceability, text report, HTML export
Persistence                browser localStorage        key offshoreassure-proto-v2
```

The architecture has these limits:

- There is no backend, database or server-side code.
- There is no production authentication. Sign-in is simulated.
- No external AI API is called. Contract extraction is a deterministic, schema-bound parser.

Every derived value, such as scores, statuses, findings and evidence gaps, comes from `compute(assessment)` in `engine/engines.js`, a pure function.

## Requirements

- Node.js 20.19 or newer (a Vite 8 requirement)
- npm 10 or newer

## Commands

```bash
npm install        # install React, React Router and Vite
npm run dev        # start the dev server at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build at http://localhost:4173
```

`dist/` is a static single-page app. When you host it, configure the server to fall back to `index.html` for unknown paths so deep links such as `/assessment/OA-2026-0012/risk` survive a refresh. `vite dev` and `vite preview` already do this.

## Routes

| Path | Page |
| --- | --- |
| `/` | Public landing page (Home, How It Works, Solutions, About Us) |
| `/login` | Simulated sign-in |
| `/signup` | Prototype buyer registration |
| `/dashboard` | Dashboard |
| `/suppliers`, `/assessments`, `/settings/rules` | Suppliers, Assessments, Settings / Rule base |
| `/assessment/:assessmentId` | 1. Supplier discovery (create assessment) |
| `…/requirements` | 2. Requirement analysis |
| `…/compliance` | 3. Compliance engine (Engine A) |
| `…/contract` | 4. Contract extraction (Engine B) |
| `…/obligations` | 5. Obligation identification |
| `…/rule-mapping` | 6. Rule mapping, including the sub-processor assessment |
| `…/data-transfer` | 7. Jurisdiction / data transfer (Engine C) |
| `…/delivery` | 8. Delivery assurance (Engine D, sample feed) |
| `…/risk` | 9. Risk assessment |
| `…/actions` | 10. Workflow actions |
| `…/evidence` | 11. Evidence & audit |
| `…/audit-trail` | 11. Evidence & audit, opened on the Audit trail tab |
| `…/final-assessment` | 12. Final assessment |
| `…/reports` | 12. Final assessment, reached from the sidebar "Reports" module |

Stage routes behave as follows:

- A stage opened before the stage it depends on has run shows a guard message.
- An unknown assessment id shows "No assessment open".
- Browser back, forward and refresh work on every route.
- The older hash links `/#dashboard`, `/#login`, `/#signup`, `/#how-it-works`, `/#solutions` and `/#about` still work.

## Project structure

```text
offshoreassure-phase1-react/
├── index.html                    # HTML shell, fonts, #app mount point
├── package.json / package-lock.json
├── vite.config.js                # React plugin; dev 5173, preview 4173
├── public/favicon.svg
└── src/
    ├── main.jsx                  # React entry: BrowserRouter + AssessmentProvider + App
    ├── App.jsx                   # routes
    ├── styles.css                # design system (aubergine / ivory / copper)
    ├── context/AssessmentContext.jsx   # state store and actions
    ├── hooks/useAssessment.js
    ├── engine/engines.js         # pure rule engine
    ├── data/                     # prototype-data.js, sample-contracts.js
    ├── lib/                      # constants and routing map, formatters, portfolio, risk, report builders
    ├── components/
    │   ├── layout/               # AppLayout, PublicLayout, Sidebar, Topbar, AssessmentFrame, Brand
    │   ├── common/               # Icon, Badges, Charts (ring, donut), Blocks (page head, tabs, trace, engine card), ErrorBoundary
    │   ├── dashboard/            # FootprintMap, ScenarioCards
    │   ├── engines/              # EngineStrip, Sparkline
    │   ├── assessment/           # ClauseDetail, SubProcessorPanel, Reassessment
    │   └── reports/              # KeyFindings, TraceabilityTable
    └── pages/                    # Landing, Login, Signup, Dashboard, Suppliers, Assessments, RuleBase,
                                  # Assessment, Requirements, Compliance, Contract, Obligations, RuleMapping,
                                  # DataTransfer, DeliveryAssurance, Risk, Actions, Evidence, AuditTrail,
                                  # FinalAssessment, Reports
```

## What is included

**Public site**

- Landing page
- Login: simulated. It takes an email and password but does no real authentication, and it also offers "Use Demo Account".
- Sign Up: prototype buyer registration, stored in the browser only

**Application**

- Dashboard
- Suppliers
- Assessments
- Settings / Rule base
- Reset demo
- Search
- Notifications
- Role switcher

**Assurance path:** 12 stages, each gated on the stored output of the one before.

**Four operational engines**

- A: Compliance
- B: Contract
- C: Data Transfer
- D: Delivery Assurance, which uses a clearly labelled sample feed

Governance evidence (the audit trail and trace panels) and the Final Assessment are layers across the engines. They are not engines themselves.

## Running the demonstration

1. Run `npm run dev` and open http://localhost:5173. The app starts on the public landing page.
2. Click **Dashboard**, then **Reset demo** in the top bar to start clean.
3. Under **Demonstration scenarios**, click **Start this assessment** on the Use Case 1 or Use Case 2 card.
4. Follow the "Continue …" buttons through the 12 stages.

Demo sign-in addresses (any password works):

- `sarah.williams@acme.example`
- `david.patel@acme.example`
- `priya.shah@acme.example`
- `tom.hughes@acme.example`

Only the Compliance Manager (Sarah Williams) can verify evidence.

## Demonstration values (verified on this React build)

| | Use Case 1 (Global Assist, India) | Use Case 2 (NordTech + CloudOps, Poland) |
| --- | --- | --- |
| Requirements | 7 | 8 |
| Compliance engine | 76/100 (DP 85, Processor Contract 85, Security 90, Incident 80, Subcontractor Controls 65, Data Transfer 45, Service Assurance 82) | 80/100 |
| Contract | 34 clauses · 11 relevant · 9 obligations | 41 clauses · 13 relevant · 11 obligations · CloudOps Polska at clause 10.2 |
| Data transfer | UK → India · gate: Review required | UK → Poland · adequacy pathway identified; processor/sub-processor governance: additional verification required |
| Delivery (sample feed) | 75/100 · Attention · 2 alerts | 100/100 · On track |
| Risk | 3 actionable compliance issues · 1 Delivery Assurance sample-feed alert | 4 actionable compliance issues |
| Actions | 3 | 4 |
| Evidence | 14 items · 2 gaps (1 after the transfer assessment is attached) | 7 items · 3 gaps (0 after "Simulate supplier response") |
| Final status | ACTION REQUIRED | ACTION REQUIRED, then REVIEW — EVIDENCE AWAITING VERIFICATION after "Simulate supplier response" |

Delivery Assurance alerts are sample-feed alerts. They are tracked separately from compliance workflow actions, and they only become actions if you click "Raise as action".

## Final assessment outputs

- **Export Report** downloads a self-contained HTML report (`OffshoreAssure_<assessment id>_<date>.html`) built from the stored assessment state. It contains:
  - the status
  - summary figures
  - the four engines
  - key findings
  - risks
  - actions
  - evidence
  - traceability
  - reassessment
  - the audit trail

  The export is HTML, not PDF.
- **Copy report text** copies a plain-text report to the clipboard. The clipboard API needs `localhost` or HTTPS.
- **Issue assessment report** records the report as issued in the audit trail.

## Resetting state

- **Reset demo** in the app top bar clears everything:
  - all assessments
  - evidence
  - actions
  - audit entries
  - the demo sign-in role
  - Sign Up details
- To clear state by hand, delete the `offshoreassure-proto-v2` key from the browser's local storage.

## Known limitations

- **Contract extraction** is a deterministic parser that stands in for a future LLM call.
  - Uploaded contracts must be `.txt` files with numbered clauses (`7.1 Heading. Text`).
  - The two prepared samples are named `.pdf` but are text.
- **Authentication** is simulated. No passwords are stored or checked.
- **State** exists only in the current browser. There is no server and no multi-user sharing.
- **Action due dates** are relative to the day the assessment is created: +3 days for High, +6 days for Medium.
- **Jurisdiction and adequacy data** is prototype data. Confirm it against current ICO guidance before relying on it.
