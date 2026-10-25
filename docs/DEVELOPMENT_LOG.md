# OffshoreAssure — Development Log

This is the running record of the OffshoreAssure build, from the Phase 1 prototype to completion. It is updated after every step. Use it to check where the project stands, what was decided and why, and what is waiting on the client.

- **Client:** ABC (contact: Moumita Saha Choudhury)
- **Delivered by:** Novtek Consulting. Senior: Mukesh Bansal. Developer: Vishwajeet Kumar.
- **Repository:** `Vishwajeet0188/OffShoreAssure`. Web app in `frontend/` (renamed from `offshoreassure/` on 23 Oct), API in `server/`.
- **Live prototype:** https://off-shore-assure.vercel.app (the Phase 1 prototype, from `main`)
- **Branches:** one branch per stage, each built on the one before.
  - `stage-0-3`: Stages 0–3 (pushed 23 Oct)
  - `ui-brand-updates`: brand colours, background `#FAF5EC`, site extras (pushed 24 Oct)
  - `stage-2-vendor-routes`: Stage 2 rewritten to the client's v2 spec (pushed 24 Oct)
  - `stage-4-contract-analysis`, `stage-5-obligation-extraction`, `stage-6-transfer-assessment`: rebuilt on `stage-2-vendor-routes` on 25 Oct (local; not pushed yet)
  - `stage-7-risk-identification`: Stage 7 (current work, built on Stage 6)
  - `main` stays on the Phase 1 prototype until the client is ready.
- **Last updated:** 25 Oct 2026, after Stage 7 (Risk identification complete)

---

## 1. Where we are

### In plain words
- **Done:** sign-up and login for buyers and vendors, the admin console, the public website, and **Stages 1–7**. A buyer describes the service and gets an Assessment ID with an "Information Required" summary, selects a verified vendor with a recorded reason, and sends that vendor a compliance questionnaire. The vendor answers it and uploads evidence; the buyer gets a provisional score with the gaps. The buyer then uploads the contract, and OffshoreAssure lists every clause and shows which important topics are covered or missing. OffshoreAssure then lists every obligation in the contract (who must do what, by when), checks it against the rules and shows the gaps; the vendor sees its own obligations. Finally it maps every route the data takes out of the UK and checks each one (adequacy, contract safeguard, risk assessment), with the questions to resolve.
- **Also done (Stage 7):** every gap from Stages 1–6 is brought into one risk register, scored likelihood × impact, with the reason for each score and a link to where each finding came from.
- **Next:** **Stage 8 — Remediation.** Turn each risk into an action for the buyer or vendor, collect proof, and re-check.
- **Live site:** https://off-shore-assure.vercel.app runs `stage-0-3` (Vercel website, Render API, Neon database).
- **Waiting on the client:** rule questions for Stages 1–6 (see section 5). The build uses provisional rules until they answer.

| Stage (sequence diagram) | Steps | Status |
|---|---|---|
| 0 · Registration, roles and admin | — | ✅ Done |
| 1 · Requirement | 1–4 | ✅ Done (21 Oct) |
| 2 · Vendor selection | 5–9 | ✅ Done (21 Oct) |
| 3 · Compliance assessment | 10–16 | ✅ Done (22 Oct) |
| 4 · Contract analysis | 17–20 | ✅ Done (23 Oct) |
| 5 · Obligation extraction | 21–24 | ✅ Done (23 Oct) |
| 6 · Transfer assessment | 25–28 | ✅ Done (23 Oct) |
| **7 · Risk identification** | 29–32 | ✅ **Done (25 Oct)** |
| **8 · Remediation** | 33–38 | ⏭️ **Next** |
| 9 · Monitoring and audit | 39–43 | ⬜ Not started |

### Stage 1 step by step

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 1 | Submit outsourcing requirement | Buyer → Engine | The buyer fills in a 32-question form (can save a draft) | ✅ Done |
| 2 | Validate fields and create Assessment ID | Engine | The system checks the answers and gives an ID like `OA-UK-2026-000001` | ✅ Done |
| 3 | Save requirement profile and timeline | Engine → Evidence Record | The answers are saved as a locked version (v1.0); corrections make v1.1, v1.2 … | ✅ Done |
| 4 | Requirement profile and gaps | Engine → Buyer | The "Information Required" box: what is known, what is missing, what happens next | ✅ Done |

### Stage 2 step by step (updated to the client's v2 spec, 23 Oct 2026)

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 5 | Search, select or add a vendor | Buyer → Engine | Three ways: search the OffshoreAssure directory (15 inputs), reuse a vendor our organisation added before, or add our own vendor (25 fields) | ✅ Done |
| 6 | Match service, location and scope | Engine | Each vendor is checked on 9 points (identity, service, delivery country, data access locations, certifications, subprocessors, contract, buyer restrictions, assurance readiness) | ✅ Done |
| 7 | Candidate list and comparison | Engine → Buyer | Directory vendors are ranked by a weighted fit score; a buyer-added or reused vendor gets a single summary, never a rank | ✅ Done |
| 8 | Confirm selected vendor | Buyer → Engine | 8 inputs (vendor, source, decision, reason, approver, exception reason, time). Result: Selected pending assessment, Conditionally selected, or Selection blocked | ✅ Done |
| 9 | Save selection and decision rationale | Engine → Evidence Record | Vendor Selection Record v1.0 with 12 stored fields, locked; Stage 3 starts | ✅ Done |

### Stage 3 step by step

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 10 | Start compliance assessment | Buyer → Engine | The buyer starts it for the selected vendor (the vendor is then locked in) | ✅ Done |
| 11 | Generate control set and questionnaire | Engine | Questions are built from the controls that apply (e.g. 15 controls, 31 questions) | ✅ Done |
| 12 | Request answers and evidence | Engine → Vendor | The vendor is emailed and sees the questionnaire, due in 14 days | ✅ Done |
| 13 | Submit policies, certificates and answers | Vendor → Engine | Yes / Partly / No + comment; documents per control (certificates need an expiry date) | ✅ Done |
| 14 | Validate and calculate provisional score | Engine | Score per control, per area and overall (out of 100), with a band | ✅ Done |
| 15 | Save responses, evidence and gaps | Engine → Evidence Record | Locked result v1 with a fingerprint | ✅ Done |
| 16 | Assessment results and missing items | Engine → Buyer | The buyer sees the score, the gaps, the answers and the documents | ✅ Done |

### Stage 4 step by step

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 17 | Upload or select contract | Buyer → Engine | The buyer uploads the contract (PDF, Word or text) | ✅ Done |
| 18 | Extract text and identify clauses | Engine | The text is read, split into numbered clauses, and each clause is linked to topics (data protection, security, breach notice …) | ✅ Done |
| 19 | Save original file and extraction | Engine → Evidence Record | The original file (encrypted) and the analysis are saved and locked; a new upload becomes v2 | ✅ Done |
| 20 | Contract analysis and clause list | Engine → Buyer | The buyer sees the totals, the topics found or missing, and every clause | ✅ Done |

### Stage 5 step by step

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 21 | Extract obligations and parties | Engine | Each clause is read sentence by sentence; "shall/must" = obligation, "shall not" = prohibition, "may" = right; who it applies to, deadline, how often, condition | ✅ Done |
| 22 | Map clauses to requirements and rules | Engine | Each obligation is linked to its topics, the controls (ASS-xxx) and 9 rules (UK GDPR processor terms + service levels); rules with no obligation are gaps | ✅ Done |
| 23 | Obligations, sources and confidence | Engine → Buyer | The register: who, what, when, source clause, confidence, with filters | ✅ Done |
| 24 | Save obligation register and rule trace | Engine → Evidence Record | Saved as a locked version with a fingerprint; a new contract version gives v2 | ✅ Done |

### Stage 6 step by step

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 25 | Map data flows and transfer routes | Engine | One route per destination, from where data is stored, accessed from, where the vendor delivers from, and sub-processors | ✅ Done |
| 26 | Check recipients, roles and safeguards | Engine | For each route: restricted country? who receives it (processor / sub-processor)? UK adequacy? a contract safeguard (IDTA, Addendum) that allows that country? transfer risk assessment? vendor's Stage 3 answers | ✅ Done |
| 27 | Transfer findings and questions | Engine → Buyer | Status per route, findings, and the questions for the buyer and for the vendor | ✅ Done |
| 28 | Save route-by-route assessment | Engine → Evidence Record | Saved as a locked version with the inputs it used and a fingerprint | ✅ Done |

### Stage 7 step by step

| Step | Title (diagram) | Who | What it means in simple words | Status |
|---|---|---|---|---|
| 29 | Consolidate risks and gaps | Engine | Every gap from Stages 1–6 is collected and grouped by subject (sub-processors, transfers, security …), so one subject = one risk | ✅ Done |
| 30 | Apply scoring and evidence rules | Engine | Likelihood (1–5) × impact (1–5) = score (1–25); good Stage 3 evidence lowers the likelihood, sensitive data or a critical service raises the impact | ✅ Done |
| 31 | Risk register and rationale | Engine → Buyer | The buyer sees the risks highest first, a 5 × 5 grid, the reason for each score and a link to each source | ✅ Done |
| 32 | Save risk snapshot and linked sources | Engine → Evidence Record | Saved as a locked version with the versions of every source it read | ✅ Done |

### Stage completion notes
Short notes written when a stage is finished: what it does, how to check it, and what comes next.

- **Stage 7 — Risk identification (completed 25 Oct 2026, branch `stage-7-risk-identification`).**
  - *What it does:* brings every gap from Stages 1–6 into one risk register, one risk per subject, scored likelihood × impact with the reason written out and each finding linked to its stage.
  - *How to check:* buyer → Transfer assessment → **Open risk register** (or sidebar **7 · Risk identification**) → **Build risk register** → open a risk to see "Why this score" and its sources.
  - *Next:* Stage 8, Remediation.

- **Stage 6 — Transfer assessment (completed 23 Oct 2026, branch `stage-6-transfer-assessment`).**
  - *What it does:* lists every route personal data takes out of the UK and checks each one: restricted countries, who receives it, UK adequacy, the contract's transfer safeguard, the need for a transfer risk assessment, and the vendor's Stage 3 answers. Shows the findings and the questions to resolve.
  - *How to check:* buyer → Obligations → **Open transfer assessment** (or sidebar **6 · Transfer assessment**) → **Run transfer assessment** → open a route to see its checks.
  - *Next:* Stage 7, Risk identification.

- **Stage 5 — Obligation extraction (completed 23 Oct 2026, branch `stage-5-obligation-extraction`).**
  - *What it does:* turns the contract clauses into an obligation register (who must do what, by when), links each obligation to the controls and rules, and lists the rules no obligation covers. The vendor sees its own obligations.
  - *How to check:* buyer → Contract analysis → **Open obligations** (or sidebar **5 · Obligation extraction**) → **Extract obligations**. Vendor → sidebar **Obligations** → **View**.
  - *Next:* Stage 6, Transfer assessment.

- **Stage 4 — Contract analysis (completed 23 Oct 2026, branch `stage-4-contract-analysis`).**
  - *What it does:* the buyer uploads the contract with the selected vendor; OffshoreAssure reads it, lists every clause, links each clause to topics, picks out time limits and figures, and lists the expected topics it could not find.
  - *How to check:* buyer → sidebar **Contract analysis** → open the assessment (the vendor must have submitted Stage 3) → **Choose contract file** → see the totals, Topics, "Not found" and the Clause list. Upload again with a reason to make v2.
  - *Next:* Stage 5, Obligation extraction.

- **Stage 3 — Compliance assessment (completed 22 Oct 2026).**
  - *What it does:* the selected vendor answers a questionnaire built from the applicable controls and uploads evidence; OffshoreAssure scores it and lists the gaps for the buyer.
  - *How to check:* buyer → sidebar **Compliance assessment** → open the assessment → **Start compliance assessment**. Vendor → **Assessments** → **Compliance questionnaires** → **Start** → answer, upload a certificate with its expiry date → **Submit**. Buyer → refresh: score ring, area bars, gaps, answers by control.
  - *Next:* Stage 4, Contract analysis.

- **Stage 2 — Vendor selection (completed 21 Oct 2026).**
  - *What it does:* the buyer finds and compares vendors for an assessment and records the chosen vendor with the reason; the vendor is emailed and sees the assessment in their portal.
  - *How to check:* sidebar → **Vendor selection** → open an assessment → search → **Add to shortlist** → compare → pick a vendor, write the reason → **Confirm vendor**. Then sign in as that vendor → **Assessments**: the assessment is under "Selected as vendor".
  - *Next:* Stage 3, Compliance assessment.

- **Stage 1 — Requirement (completed 21 Oct 2026).**
  - *What it does:* the buyer describes the service; OffshoreAssure validates it, gives it an Assessment ID, saves a locked profile, and shows the "Information Required" box.
  - *How to check:* Requirement → New requirement → "Fill example" (dev only) → Submit. The page shows the box at the top, then the Step 2 result and the Step 3 profile. The dashboard shows Stage 1 as "Complete · available".
  - *Next:* Stage 2, Vendor selection.

### UI update branch `ui-brand-updates` (23 Oct 2026)
Built on `stage-0-3` (the live version), so the website and Stages 0–3 can be updated and pushed without Stages 4–6.
- **Brand colours** from the client's design: Aubergine `#30233F`, Copper `#D66A4A`, Sage `#71806A`, Charcoal `#242329`; status Compliant `#71806A`, Attention `#C48342`, High risk `#AF4343`.
- **Page background `#FAF5EC`** (as chosen); cards slightly lighter (`#FFFDF9`) so they still stand out; the home-page hero tint is softer so the background reads as the true colour.
- **Site extras:** dark mode toggle, cookie notice, site search (Ctrl+K), back to top, loading spinner, scroll progress bar, copy button for the Assessment ID, print stylesheet, skip to content, UTM capture at sign-up (admin sees "Came from"), confirmation dialogs before deactivating or removing, last updated date in the footer, floating "Contact us" button. Already there: mobile menu, hover states, sticky headers, password eye, form success/error states, expandable FAQ.
- Database: `014_signup_source.sql` (adds `users.signup_source`).
- Tests: API 52; browser Stage 0 49, Stage 1 48, roles 31, Stage 2 22, Stage 3 20, website 24, extras 24. All pass.

## 2. Source documents (the specification)

Development follows only these documents:

1. **Sequence diagram:** 9 stages, 43 steps, 4 lanes (Buyer, OffshoreAssure Engine, Offshore Vendor, Evidence Record). It sets the order of work.
2. **"Offshore Assure – Stage 1 Inputs and Logics"** (Moumita, received 19 Oct 2026). Defines the 32 input fields, the 15 system fields, the 15 stored fields, the 10 output fields, controls ASS-001 to ASS-015, the boundary rules and the worked example (UK Company Ltd, IT Support).
3. **Earlier client documents** used for the prototype: Technical Architecture, Functional UI Prototype Flow, Use Case 1, Use Case 2.
4. **Mukesh's instructions:** for example, Stage 0 should register customers "the similar way as ScotWarm" and show registered users in the system.

Specifications for Stages 2–9 (field lists, rules) will come from the client stage by stage, in the same format as the Stage 1 PDF.

---

## 3. Journey log (chronological)

### Phase 1 — Functional prototype (Sept–Oct 2026)
- Built a clickable prototype from the client documents: four "engines" (Compliance, Contract, Data Transfer, Delivery Assurance), Use Case 1 and Use Case 2 sample data, and a final assessment.
- Migrated it to React 19 + Vite 8 + React Router 7. Verified all 68 Use Case steps against the earlier build.
- Deployed to Vercel from GitHub (`main`, Root Directory `offshoreassure`). Cleaned the repository so it contains only the `offshoreassure/` app.
- Wrote a functional work plan (PDF) for the development team.

### Moving to development (Oct 2026)
- Mukesh shared the sequence diagram and asked to start with customer (user) creation, done the ScotWarm way.
- Sent Mukesh the registration queries (6) and the Stage 1 queries (7), with proposed defaults.
- 19 Oct: received the Stage 1 PDF and the instruction to start development.
- Agreed stack: **Node.js + Express + PostgreSQL** API, React web app. Order: Stage 0, then Stage 1.

### Stage 0 — Customer registration and admin (20 Oct 2026) ✅
- **Registration (ScotWarm pattern):** email + password → Register → popup for the 6-digit emailed code → account created → Complete profile (name, organisation, sector, role, phone) → Dashboard.
- **Also built:** login, logout, forgot/reset password using the same popup, and route guards.
- **Security:**
  - bcrypt passwords
  - codes stored as HMAC hashes (10-minute expiry, 5 attempts, 60-second resend)
  - lockout after 5 failed sign-ins (15 minutes)
  - httpOnly session cookie (8 hours)
  - rate limiting
- **Audit log:** append-only, enforced by a database trigger.
- **Email:** Brevo SMTP (`smtp-relay.brevo.com:587`). Gmail app passwords failed; Brevo works.
- **Admin console:** a separate workspace from the buyer app.
  - Overview: KPIs, 14-day registrations chart, sectors, activity.
  - Buyer organisations and buyer users, with a detail page showing the full history.
  - Admin team: add an admin, who then sets their own password through "Forgot password". The last active admin cannot be removed.
  - Audit log, with filters and CSV export.
  - Platform settings, read-only.
  - Pages for later stages show "Available from Stage X" and no sample data.

### Stage 1 · Step 1 — Submit outsourcing requirement (20 Oct 2026) ✅
- **The form:** 32 fields in 6 groups — Buyer 5, Service 7, Commercial & geography 6, Personal data 6, Access/locations/suppliers 6, Assurance 2.
  - Prefilled from the buyer's profile.
  - A searchable picker covers all 249 ISO countries, with an "Unknown" option for storage and remote-access locations.
- **Drafts:** a draft can be saved at any time. Invalid values (bad date, bad UK company number, unsupported file) are rejected.
- **Submit:** blocked with a clickable list of missing answers, and the answers stay saved as a draft.
- **Conditional rules (our defaults, pending the client):**
  - UK company number required when the buyer country is GB
  - start date required when a duration is given
  - currency required when a budget is given
  - personal-data details shown when the answer is Yes or Unknown, and required when Yes
  - storage locations required when personal data is Yes
  - remote-access countries required for Remote or Hybrid delivery
  - systems accessed required for privileged or remote access
- **Boundary flags:** country conflicts, unknown personal data or locations, unknown privileged access, and "enhanced assessment" for a Critical service or special-category or criminal-offence data.
- **Documents:** 6 optional supporting documents (PDF, Office, CSV, images, TXT; up to 10 MB). A SHA-256 fingerprint is recorded for each.

### Clean development build (20 Oct 2026) ✅
- Removed all Phase 1 prototype data and pages from the app:
  - sample portfolio
  - Use Cases
  - persona switcher
  - Reset demo
  - engine pages
  - the browser store
- The buyer workspace now follows the diagram: Dashboard + 9 stages. Stages not yet built show their steps as "Not available yet".
- The landing page was rewritten without sample numbers.
- The prototype remains in git history and on the live Vercel site until the development branch is pushed.

### Stage 1 · Step 2 — Validate fields and create Assessment ID (20 Oct 2026) ✅
- On **Submit**, the engine validates the requirement and creates the **Assessment ID** `OA-UK-<year>-NNNNNN`. The ID is sequential per country and year, and generated once.
- **The 15 system fields are stored:**
  - Assessment ID (UUID + readable), Buyer ID (organisation), requirement version 1.0, created at, created by
  - service code, data classification, preliminary risk tier, jurisdiction pack IDs, rule pack version
  - vendor assessment, contract review and transfer review required (yes/no)
  - validation status (VALID / INCOMPLETE / INVALID) and missing fields with reasons
- **Engine checks:**
  - schema, required and conditional fields, formats, country codes
  - contradictory answers (reported, not blocking)
  - possible duplicates (same title and service in the last 30 days)
  - permissions (the buyer must belong to the organisation)
  - **idempotency:** a repeated request returns the same assessment and never creates a duplicate
- **Legal applicability screening:** UK GDPR Arts. 5, 6, 9, 10, 28, 30, 32, Chapter V, DPA 2018, plus sector overlays. Clearly labelled as *not a final legal determination*, to be cross-checked by the legal team.
- **APIs (names from the spec):** `POST /api/assessments/validate` (dry run, nothing saved) and `POST /api/assessments`. Both return the spec's output format (`assessment_id`, `validation_status`, `service`, `personal_data`, …).
- **Buyer view:** after submitting, the buyer sees the Assessment ID, every derived value with its reason, packs, provisions, clarifications and answers to check. The requirement list shows the Assessment ID and risk tier.
- **Admin:** the Assessments page is now live, covering all buyers, with risk-tier counts, search and a detail view.
- **Organisations:** buyers are now linked to an organisation record (Buyer ID). Colleagues in the same organisation see each other's assessments; drafts stay private.

### Role labelling in the buyer portal (20 Oct 2026) ✅
- Buyer testing showed it was unclear which role the dashboard belongs to. Added:
  - a bold **BUYER** badge in the top bar, with "Buyer portal · the organisation outsourcing a service"
  - a **BUYER PORTAL** label in the sidebar
  - a "You are signed in as a buyer" note on the dashboard, explaining that vendors (suppliers) get a separate vendor portal from Stages 2–3 and that the OffshoreAssure team uses the admin console
- Page headings now start with "Buyer ·".
- Verified on the user's machine: Stage 1 Steps 1–2 work end to end (OA-UK-2026-000001 created, Valid, High risk, all three reviews required).

### Sidebar fix (20 Oct 2026) ✅
- Removed the sidebar's horizontal and vertical scrollbars:
  - tighter spacing
  - the tagline is hidden in the app sidebar
  - long labels never push the width
- The full sidebar now fits at 1366×650 and larger. A thin scrollbar appears only on very short screens.

### Stage 1 · Step 3 — Save requirement profile and timeline (20 Oct 2026) ✅
- **Profile v1.0 on submit:** right after the Assessment ID is created, the engine saves **Requirement Profile v1.0** with the 15 stored fields:
  - Profile ID, Assessment ID, profile version
  - original submission (JSON) and normalised requirement (machine-readable JSON)
  - rule-pack IDs and versions
  - applicable control IDs
  - created at and created by
  - source documents and their SHA-256 hashes
  - validation findings (pass / fail / unknown per check)
  - missing information
  - previous version
  - also stored: a SHA-256 fingerprint of the whole profile
- **Applicable controls:** ASS-001 to ASS-015, each with the reason it applies and a mark when the buyer asked for it (e.g. MFA → ASS-003). The rules are provisional, pending the client's control-applicability mapping, and kept in `server/src/engine/controls.js`.
- **Initial assessment timeline:**
  - Steps 1–3 done, with their times
  - Step 4 marked "Next"
  - Stages 2–9 shown as later stages, with no invented dates (milestone dates are still an open question)
- **Audit event:** "Requirement profile saved".
- **Boundary — immutability:**
  - A saved profile cannot be changed or deleted; a database trigger blocks it.
  - **Correct answers** opens the form in correction mode and asks for a reason. Saving creates **v1.1** (then v1.2, …), linked to the previous version. The Assessment ID stays the same, and its derived fields (risk tier, reviews, packs) follow the latest version.
  - Earlier versions stay viewable. A correction with no actual change is refused.
- **Boundary — encryption:** documents uploaded from now on are encrypted at rest (AES-256-GCM) and decrypted on download. Production needs `STORAGE_ENCRYPTION_KEY` in `server/.env`; development derives a key automatically. Files uploaded before this change are marked as not encrypted.
- **Still to define:** a documented retention period for evidence (to ask the client).
- **Admin:** the assessment detail shows the same profile, versions and timeline.
- Verified on the user's machine: correcting OA-UK-2026-000001 (special-category data → Yes) created v1.1. The ID stayed the same, the risk changed High → Critical, and the classification became Special category. A correction with no change was refused. The "Fill example" button is hidden in correction mode.

### Branded emails (21 Oct 2026) ✅
- The verification-code and password-reset emails now use the branded OffshoreAssure design:
  - aubergine header with the OffshoreAssure wordmark, plus a copper accent line
  - the code in a highlighted box, with its expiry time
  - a security tip, a sign-off and a footer
- Inbox preview text and a plain-text version are included.
- The admin-team invitation uses the same layout, with a **Set your password** button.
- Layout code: `server/src/mailer.js` (one shared layout, wording in `EMAIL_TEMPLATES`).
- To test:
  - `npm run test:email -- you@example.com` (verification)
  - `npm run test:email -- you@example.com reset` (reset)

### Roles: buyer and vendor sign-up, vendor portal, vendor verification (21 Oct 2026) ✅
- **Why:** the project has three roles, and **vendor and supplier are the same role**. The client's **Technical Architecture** ("End to End User Journey", Offshore vendor lane) says the vendor *"holds a reusable profile … presented to any UK buyer on the platform"* and *"builds a track record"*, with a *"vendor onboarding questionnaire"* as an input. So vendors are platform members with their own account and company profile. Stage 1 control **ASS-001** (Legal Entity Verification) gives the verification step.
- **Sign-up:**
  - The page asks "I am registering as **a buyer**" or "**a vendor (supplier)**". The server stores the role on the account; the browser cannot change it later, and "admin" can never be chosen.
  - `/signup?role=vendor` preselects vendor, and the landing page links to it.
- **Vendor onboarding:**
  1. After email verification, **Set up your company profile**: about you (name, role, phone) and the company (legal name, registration number, country of registration, services provided, countries delivered from, website, description).
  2. The company starts as **Pending verification**.
  3. A company name already registered by another vendor can't be claimed; colleagues will join by invitation later.
  4. Changing the legal name, registration number or country of a verified company sends it back to pending.
- **Vendor portal** (`/vendor`, purple VENDOR label):
  - verification status card (pending / verified / not verified, with the reason)
  - company profile summary and edit page
  - the vendor's part of the journey from the Technical Architecture: Company profile (Stage 2), Assessments (3, steps 12–13), Obligations (5), Scoped access (6), Actions (8, steps 34–35), Track record (9, step 43)
  - pages not built yet show the stage's steps, with the vendor's own steps marked "You"
- **Admin console → Vendors** (replaces the Stage 2–3 placeholder):
  - pending / verified / not verified tabs and counts
  - a detail page with the company profile, the vendor's users and the history
  - **Verify vendor** or **Mark as not verified**; a reason is required and shown to the vendor
  - the vendor's users are emailed in the branded layout
  - an Overview tile shows "Vendors to verify"
- **Access is enforced on the server:**
  - buyer APIs (requirements, assessments) reject vendors and admins
  - admin APIs reject buyers and vendors
  - each role lands in its own portal after login, and opening another portal's address redirects back
  - admins are still only created by the seed command or Admin team
- **Database:** `005_roles_vendors.sql` adds:
  - `users.role` (buyer / vendor / admin)
  - `organisations.kind` (buyer / vendor) and the vendor company fields
  - verification status, note, by and at
- **Known gap (fixed 21 Oct, see below):** a buyer could join an existing buyer organisation just by typing its name.

### Buyer organisation membership (21 Oct 2026) ✅
- **Problem fixed:** anyone could join an existing buyer organisation by typing its name and then see its requirements and assessments.
- **How it works now:**
  - The first person to register an organisation becomes its **Owner**.
  - Anyone else who registers with the same organisation name is **Waiting for approval**. Their dashboard says "Waiting for <organisation> to approve you", with a "Change organisation" button. They can open only the Dashboard and the Organisation page; the requirement and assessment API refuses them (403 `membership_pending`).
  - The owner gets an email and sees the request under **Sidebar → Organisation → Requests to join**, with Approve / Reject. An admin can do the same under **Admin → Buyers**, which now shows each person's access and an "N waiting" badge.
  - Approved or rejected users get an email. Every request and decision is in the audit log (`organisation.join_requested`, `organisation.member_approved`, `organisation.member_rejected`).
  - A rejected user can change their organisation from the dashboard.
- **Database:** `006_org_membership.sql` adds `membership` (owner / member / pending / rejected), `membership_decided_by`, `membership_decided_at`. Existing data: the earliest user of each organisation becomes its owner, everyone else a member.
- **API:** `GET /api/organisation`, `PATCH /api/organisation/members/:userId`, `PATCH /api/admin/buyers/members/:userId`.
- **Tests:** API 34; browser 49 / 41 / 30, all pass (the roles run now covers a join request, the blocked pending member, and owner approval).

### Stage 7 — Risk identification, Steps 29–32 (25 Oct 2026) ✅ — Stage 7 complete
- **When:** after the transfer assessment (Stage 6) is saved. It runs again only when a source changes (requirement, selection, compliance result, contract, obligations or transfers).
- **Step 29 · Consolidate:** reads the latest saved result of each stage:
  - Stage 1: answers still "Unknown"
  - Stage 2: open conditions and accepted exceptions of a conditional selection
  - Stage 3: "No" and "Partly" answers, "Yes" without evidence, expired certificates
  - Stage 4: expected contract topics not found
  - Stage 5: rules with no obligation
  - Stage 6: routes that are not permitted, missing a safeguard, need a risk assessment or need information
  - Each finding goes under one of 15 subjects (international transfers, data protection terms, information security, breach handling, sub-processors, vendor identity, staff and confidentiality, data return and deletion, business continuity, sector rules, audit, service levels, insurance, general contract terms, unconfirmed requirement details). One subject = one risk, with all its findings.
- **Step 30 · Score (5 × 5):**
  - *Likelihood* from the worst finding: not permitted 5, missing or failed 4, partly in place 3, not confirmed 3; +1 when two or more stages point at it; −1 when the vendor scored 80+ on that subject's controls in Stage 3.
  - *Impact* from the subject (e.g. transfers, data protection, security 4; sub-processors, continuity 3; audit, service levels 2); +1 for special-category or criminal-offence data on a data subject; +1 for a Critical service; never above 5.
  - *Score* = likelihood × impact. Bands: **Low** 1–4, **Medium** 5–9, **High** 10–19, **Critical** 20–25.
  - Each risk also shows the evidence held (Evidence held / Partly evidenced / No evidence / Not assessed) and who must act (buyer, vendor or both).
- **Step 31 · Shown to the buyer:** totals, the highest rating, a 5 × 5 grid, and the register highest score first. Open a risk to see "Why this score" in plain words and each finding with a link back to its stage. Filters: rating, vendor to act, you to act.
- **Step 32 · Saved:** register v1 with the version of each source and a fingerprint; locked in the database; a change in an earlier stage allows v2. Timeline steps 29–32; Stage 8 becomes "Next"; audit "Risk register saved". Admin sees a Stage 7 panel.
- Rules are provisional (rule pack `RP-2026.10-S7-draft`, `server/src/engine/risks.js`). Never says "compliant".
- **Also on 25 Oct:** Stages 4, 5 and 6 were rebuilt on top of the new Stage 2 (`stage-2-vendor-routes`) so the whole chain uses the v2 vendor selection and the `#FAF5EC` background.
- **Database:** `016_stage7_risks.sql` (risk_registers, append-only).
- **Tests:** API 79 (Stage 7: 5 new); browser: every stage run passes, plus a new Stage 7 run with 16 checks.

### Stage 2 rewritten to the client's v2 spec — three routes (23 Oct 2026) ✅
Source: *Offshore Assure – Stage 2 Inputs and Outputs (2).pdf*. Branch: `stage-2-vendor-routes` (made from `ui-brand-updates`).
- **Step 5 — vendor_selection_mode** (`DIRECTORY_SEARCH`, `EXISTING_VENDOR`, `ADD_NEW_VENDOR`), shown as three cards:
  - **Route A · Search the directory:** 15 inputs (Assessment ID, search text, service category, supplier countries or "Any country", delivery model, industry experience, minimum staff, minimum years operating, certification preferences, assurance threshold, insurance + currency, support hours, languages, budget range + currency, subprocessor restrictions). Service and countries start from the requirement. Only self-registered, verified vendors are listed. A vendor that has **not stated** something is kept and labelled "Not stated"; only a stated value that fails a filter hides it. Vendors in a restricted country stay visible as **Excluded**. Every search is recorded.
  - **Route B · Add our own vendor:** the 25 onboarding fields in 5 groups (legal identity, contact, service and locations, relationship and data, documents and status). Checks: registration number format for UK, India, Ireland and Poland; postcode must suit the registered country; phone in international format; description 20–3,000 characters; remote access countries required when personal-data access is Yes/Unknown; hosting countries required for cloud or data-processing services. Existing contract and DPA upload as PDF or DOCX (encrypted). The vendor is created as **BUYER_PROVIDED** and **UNVERIFIED**; no certificate or signed DPA is needed. Duplicates are caught (the organisation's own vendors, and directory vendors with the same name or registration).
  - **Route C · Existing vendor:** choose a vendor the organisation added or selected before, give the service scope and review reason, optionally update the contact (makes a new profile version). The engine reports **material changes** since the last selection.
- **Step 6 — VendorFitAssessment** (`server/src/engine/vendorFit.js`): 9 checks with reasons, eligibility (Eligible / Eligible with gaps / Excluded), matched requirements, missing information, review status (Verified / Preliminary, unverified). Missing information is never treated as a failure; restricted countries and a rejected verification are hard exclusions.
- **Step 7:** directory candidates ranked by the example weights (service 30%, security 25%, geography 20%, sector 15%, commercial 10%) with the rationale written out; marked "not a legal compliance score". Buyer-added and reused vendors get a single-vendor summary with "Required before approval".
- **Step 8:** decision "Select" or "Select with conditions"; the approver must be an active member, and an **owner** for High/Critical services; an exception reason is needed when the vendor fails part of the requirement; blocked vendors are refused (and audited) without being saved.
- **Step 9 — Vendor Selection Record v1.0:** selection ID, assessment ID, vendor ID, source (DIRECTORY / EXISTING / BUYER_PROVIDED), selection criteria, comparison reference (fingerprint), rationale, approver, exceptions, timestamp, vendor profile version, plus status, decision and conditions. Locked; changing vendor makes v2.0.
- **Buyer-added vendor → Stage 3:** the contact email is invited to register. When that person registers as a vendor with the same email, they take over the company record, so the selection and the Stage 3 questionnaire reach them.
- **Vendor profile:** optional "Directory details" (delivery model, support hours, staff, year started, insurance, minimum contract, subprocessors, industries, certifications, languages). Every profile change is kept as a version.
- The old "Invite a vendor" box is replaced by Route B; invitations already sent still link up when the vendor registers.
- **Database:** `015_stage2_vendor_routes.sql`. **Tests:** API 57 (Stage 2: 13); browser Stage 2 29, plus Stage 0 49, website 24, Stage 1 48, roles 31, Stage 3 20, extras 24. All pass.

### Stage 2 — Vendor selection, Steps 5–9 (21 Oct 2026) ✅ — Stage 2 complete
- **Where:** sidebar **Vendor selection** (Stage 2). It lists the organisation's assessments and, for each, "Not started", "N on shortlist" or the selected vendor. Also reachable from the Information Required box ("Open vendor selection").
- **Step 5 — Search or invite:**
  - Only vendors **verified by OffshoreAssure** appear in search. Filters: name/description, service, country they deliver from.
  - **Invite a vendor** by email (company name + email + optional message). The email links to vendor sign-up with the email filled in. When that company registers, it is linked to the assessment and put on the shortlist automatically. A company already on OffshoreAssure is linked at once. Buyer or admin emails cannot be invited.
- **Step 6 — Match (the engine):** every vendor is checked against the requirement on 5 points, each with its reason:
  1. Verified by OffshoreAssure
  2. Provides the requested service
  3. Delivers from a preferred country
  4. Does not deliver from a restricted country
  5. Covers the countries the service is accessed from (and doesn't add extra countries)
  - Result: **Good match** (all yes), **Partial match** (some "partly"), **Not a match** (wrong service or a restricted country). Best matches are listed first.
  - Rules are provisional (rule pack `RP-2026.10-S2-draft`, file `server/src/engine/matching.js`) because the client has not sent a Stage 2 specification yet.
- **Step 7 — Shortlist and comparison:** a table with the vendors side by side, one column per check. Vendors can be removed (except the selected one).
- **Step 8 — Confirm:**
  - Pick one shortlisted vendor and write the reason (at least 20 characters).
  - A Partial or Not-a-match vendor lists its issues and needs the tick "I accept these issues".
  - An unverified vendor (for example an invited company still waiting for verification) cannot be selected.
  - Blocked while the requirement has contradictory answers (Stage 1 status "Information required").
- **Step 9 — Saved to the evidence record:**
  - Locked record: vendor profile at that time, match result, shortlist, reason, accepted issues, who and when, fingerprint (SHA-256). The database refuses edits and deletes.
  - **Change vendor** creates v2 (needs a reason), linked to v1; earlier selections stay visible.
  - Timeline: "Step 8 · Vendor selected", "Step 9 · Selection and decision rationale saved"; Stage 3 becomes "Next".
  - The selected vendor's users get an email. Audit events: shortlisted, removed, invited, invited vendor registered, vendor selected, vendor changed.
- **Vendor portal:** new **Assessments** page with "Selected as vendor" and "Invitations". A vendor only sees the assessment reference, buyer, service and criticality, not the buyer's full answers or the other candidates.
- **Admin:** assessment detail shows the Stage 2 panel (selected vendor, reason, shortlist); the assessments list has a Vendor column; vendor detail lists the buyer assessments that vendor is on.
- **Database:** `007_stage2_vendor_selection.sql` (vendor_invitations, vendor_shortlist, vendor_selections, and the selected vendor on each assessment).
- **Tests:** API 45 (Stage 2: 8 new); browser 49 / 47 / 31 / 22 (new Stage 2 run). All pass.

### Feedback only from registered users (23 Oct 2026)
- The feedback form is shown to everyone, but only signed-in **buyers and vendors** can send it. Anyone else who presses "Send feedback" sees "Please register yourself first, then you can send feedback." with links to Create an account and Log in; what they typed is kept. Admins are pointed to Admin → Feedback.
- Signed-in users do not type a name or email: both come from the account (the name from the profile). Reviews show that name and the role (Buyer / Vendor), never the email.
- The server also refuses feedback without a session (401) and from admin accounts (403). The bot trap field is no longer needed and was removed.
- Files: `server/src/feedback/routes.js`, `frontend/src/pages/site/parts.jsx`, `frontend/src/pages/site/Home.jsx`, `server/test/site.test.js` (committed on `stage-0-3`, merged into Stage 4).

### Friendlier messages when the service is unreachable (23 Oct 2026)
- Users no longer see technical text such as "Make sure the API is running (cd server, npm run dev)". Every page now shows: "We could not connect to OffshoreAssure just now. Please try again in a moment."
- The technical hint is written to the browser console in development only.
- All requests go through one place (`frontend/src/lib/api.js`: `api`, `readResponse`, `unavailableError`), including the file uploads (requirement documents, vendor evidence, contracts).
- The "Development build" label in the sidebar is shown only in development.

### Stage 6 — Transfer assessment, Steps 25–28 (23 Oct 2026) ✅ — Stage 6 complete
- **When:** after the obligations are extracted (Stage 5). It reads the requirement (Stage 1), the selected vendor's delivery countries (Stage 2), the vendor's transfer answers (Stage 3, ASS-005), the contract's transfer clause (Stage 4) and the obligation register (Stage 5). It runs again only when one of those changes.
- **Step 25 · Routes:** one route per destination: data storage locations (cloud hosting provider as sub-processor when cloud services are used), remote access countries, the vendor's delivery centres, and "sub-processors (location not confirmed)" when sub-processors are allowed.
- **Step 26 · Checks per route**, with a status:
  - *Stays in the UK* (no restricted transfer)
  - *Not permitted* (the buyer listed it as a restricted country)
  - *Covered by UK adequacy* (EEA, Switzerland, Japan, Korea, New Zealand, Israel, Canada, US and others; some only with a condition, e.g. US only for certified organisations)
  - *Safeguard in contract · risk assessment needed* (IDTA / UK Addendum named and the country allowed)
  - *Safeguard missing* (no safeguard, or the contract only allows other countries)
  - *Information needed* (location or recipient not confirmed)
- **Step 27 · Findings and questions:** the most serious status overall, the findings, and the questions split into "for you (the buyer)" and "for the vendor" (e.g. "Provide the transfer risk assessment for United Kingdom → India"). These become actions in Stage 8.
- **Step 28 · Saved:** locked version with the input versions and a fingerprint; timeline steps 25–28; Stage 7 becomes "Next"; audit "Transfer assessment saved". Admin sees a Stage 6 panel.
- Rules and the adequacy list are provisional (rule pack `RP-2026.10-S6-draft`, `server/src/engine/transfers.js`); the adequacy list must be checked against the ICO's current list. Never says "compliant".
- **Database:** `013_stage6_transfers.sql` (transfer_assessments, append-only).
- **Tests:** API 68 (Stage 6: 5 new); browser 49 / 48 / 31 / 22 / 20 / 19 / 15 / 24, and a new Stage 6 run with 12 checks. All pass.

### Stage 5 — Obligation extraction, Steps 21–24 (23 Oct 2026) ✅ — Stage 5 complete
- **When:** once the contract has been analysed (Stage 4). The buyer clicks **Extract obligations**; it runs again only when a newer contract version is uploaded.
- **Step 21 · Extract:**
  - Each clause is split into sentences. "shall", "must", "will", "agrees to" = **Obligation**; "shall not", "must not" = **Prohibition**; "may", "is entitled to" = **Right**.
  - **Who:** the words before the verb. The contract's defined names (e.g. *UK Company Ltd (the "Customer")*) and common words (Supplier, Provider, Processor / Customer, Client, Controller) decide Vendor or Buyer; "either party / each party" = Both.
  - **When:** deadlines ("within 24 hours", "without undue delay"), how often ("each month", "once in any 12 month period") and conditions ("On termination").
  - **Confidence:** High (party and topic known), Medium (party known), Low (party unclear).
- **Step 22 · Map:** each obligation gets the topics of its clause, the controls (ASS-xxx) and the requirement's own controls. 9 rules are checked: documented instructions, confidentiality, security measures, sub-processors, breach notification, international transfers, audit rights, return/deletion (UK GDPR Art. 28, 32, 33, Chapter V) and service levels. A rule with no obligation is a **gap** when it applies to the requirement.
- **Step 23 · Shown to the buyer:** counts by type and party, gaps, the rule trace (each rule → the obligations covering it), and the register table with filters (party, topic, search).
- **Step 24 · Saved:** register v1 with a fingerprint, locked in the database; a new contract version gives v2, and earlier versions stay viewable. Timeline steps 21–24; Stage 6 becomes "Next"; audit event "Obligations extracted".
- **Vendor portal:** new **Obligations** page (sidebar). The vendor sees only its own obligations and the shared ones, grouped by topic, in plain words ("Must", "Must not", "May") with the clause and deadline. The buyer's own rights (e.g. audit) are not shown as vendor obligations.
- **Admin:** a Stage 5 panel on the assessment.
- Rules are provisional (rule pack `RP-2026.10-S5-draft`, file `server/src/engine/obligations.js`). Not a legal opinion.
- **Database:** `012_stage5_obligations.sql` (obligation_registers, append-only).
- **Tests:** API 63 (Stage 5: 6 new); browser 49 / 48 / 31 / 22 / 20 / 19 / 24, and a new Stage 5 run with 15 checks. All pass.

### Home page reviews always shown (23 Oct 2026)
- The scrolling reviews section on the home page was hidden whenever there were no published reviews, or the API could not be reached (for example on the Vercel preview without a hosted API). It now always shows: the scrolling cards when there are reviews, otherwise a short "No reviews yet" box with a link to the feedback form.
- File: `frontend/src/pages/site/parts.jsx` (committed on `stage-0-3`, then merged into `stage-4-contract-analysis`).

### Branches and folder rename (23 Oct 2026)
- The web app folder was renamed from `offshoreassure/` to `frontend/`.
- Stages 0–3 were committed and pushed on the branch `stage-0-3`; the old prototype files were removed in that commit. `main` is unchanged (live prototype).
- Stage 4 is built on a new branch, `stage-4-contract-analysis`, created from `stage-0-3`.
- A root `.gitignore` keeps `.env`, `node_modules`, `.vscode`, `Claude outputs` and spreadsheets out of git.
- From Stage 4 the code is written in a plainer style: clear names, short functions, comments only where the reason is not obvious.

### Stage 4 — Contract analysis, Steps 17–20 (23 Oct 2026) ✅ — Stage 4 complete
- **When:** available once a vendor is selected (Stage 2) and has submitted its compliance answers (Stage 3), following the diagram order.
- **Step 17 · Upload:** PDF (with text), Word (.docx) or plain text, up to 15 MB, with an optional label (e.g. "Signed copy"). A scanned PDF without text is refused with a clear message.
- **Step 18 · Extract and identify:**
  - The text is read page by page and split into numbered clauses (`4.`, `4.1`, `Clause 7` …); the section heading is carried to its sub-clauses. With no numbering, it falls back to paragraphs.
  - Each clause is checked against 14 topics, each linked to the assurance controls: data protection (ASS-004), security (ASS-002/003/009), breach notification (ASS-007), sub-processors (ASS-006), international transfers (ASS-005), audit rights (ASS-013), return and deletion (ASS-014), service levels (ASS-012), business continuity (ASS-008), confidentiality (ASS-010), insurance (ASS-011), liability, termination, governing law.
  - Confidence High / Medium / Low, with the words it matched on.
  - Key terms: time limits ("within 24 hours"), percentages ("99.5%"), money amounts.
  - **Not found:** the core topics for personal data, plus any topic linked to a control that applies to this requirement, are listed when no clause covers them ("Check the contract and its schedules manually").
  - Rules are provisional (rule pack `RP-2026.10-S4-draft`, file `server/src/engine/clauses.js`).
- **Step 19 · Saved:** the original file (encrypted, SHA-256), the extracted-text fingerprint and the full analysis, locked in the database. A new upload needs a reason and becomes v2; earlier versions stay and can be viewed.
- **Step 20 · Shown to the buyer:** file details and download, 4 totals, "Not found" list, Topics grid with clause numbers, and the Clause list (filter by topic, search, open a clause to read it). The page says it is a reading aid, not a legal opinion or compliance conclusion.
- **Timeline and audit:** steps 17–20 on the timeline, Stage 5 becomes "Next"; audit events "Contract uploaded", "New contract version uploaded", "Contract analysed". Admin sees a Stage 4 panel on the assessment.
- **Database:** `011_stage4_contracts.sql` (contract_documents, contract_analyses; both append-only).
- **New libraries (server):** `unpdf` (PDF text) and `mammoth` (Word text). Run `npm install` in `server` after pulling.
- **Tests:** API 57 (Stage 4: 6 new); browser 49 / 48 / 31 / 22 / 20 / 22, and a new Stage 4 run with 19 checks. All pass.

### Stage 3 — Compliance assessment, Steps 10–16 (22 Oct 2026) ✅ — Stage 3 complete
- **Buyer (sidebar → Compliance assessment):** a list of assessments with their status; for one assessment:
  - **Start** (step 10) once a vendor is selected and the requirement has no contradictions. After starting, the vendor cannot be changed in Stage 2.
  - The **questionnaire** (step 11) is built from the assurance controls that apply (from the requirement profile): 2–3 plain questions per control, each saying which evidence backs it.
  - The **vendor is emailed** (step 12); the buyer sees "Waiting for the vendor" with a progress bar and a preview of the questions.
  - **Results** (step 16): a score ring (overall /100) with a band, a bar for each area (Company and governance, Information security, Data protection, Data transfer, Subcontractor controls, Incident management, Business continuity, People, Service and audit), observations, **missing items and gaps** (answered No, Partly, evidence missing, expired), and **answers by control** with the vendor's comments and documents (downloadable). "Next: Stage 4".
- **Vendor (Assessments → Compliance questionnaires):** answer each question **Yes / Partly / No**, with an optional comment; answers **save automatically**; upload documents per control (certificate, policy, report, insurance, register, other). Certificates and insurance need the **expiry date**. **Submit** asks for confirmation and is refused until every question is answered (the missing ones are highlighted). After submitting, the answers are locked and the vendor sees its provisional score and gaps.
- **Scoring (step 14), provisional:** Yes = 100, Partly = 50, No = 0. A "Yes" that needs evidence counts as 50 until a valid document is uploaded; an expired certificate does not count (and is listed as a gap); one expiring within 90 days is noted. Control = average of its questions; area = average of its controls; overall = average of all controls. Bands: **Strong** (80+), **Adequate, with gaps** (60–79), **Weak** (40–59), **Insufficient** (below 40). It never says "compliant"; the page says it is a risk indicator, not a compliance or legal conclusion. Based on the Use Case 1 prototype (area scores + overall /100).
- **Saved (step 15):** the result (scores, gaps, observations), a copy of the answers and the evidence list (names, types, SHA-256, expiry) are saved as **result v1** with a fingerprint; the database refuses edits and deletes. Documents are encrypted at rest.
- **Timeline and audit:** steps 10–16 are on the assessment timeline; Stage 4 becomes "Next". Audit: started, answers saved, evidence uploaded/removed, submitted. Emails: questionnaire to the vendor; "results are ready" to the buyer's organisation.
- **Admin:** the assessment page shows a Stage 3 panel (score, area bars, gaps).
- **Website:** How It Works now says three stages are live; "Vendor compliance assessment" is marked "Available now" on Solutions.
- **Fixed during testing:** choosing the same file again after a refused upload (e.g. missing expiry date) now works; certificate dates are stored as plain calendar dates (no time-zone shift).
- **Rules file:** `server/src/engine/questionnaire.js` (rule pack `RP-2026.10-S3-draft`). **Database:** `010_stage3_compliance.sql`.
- **Tests:** API 51 (Stage 3: 4 new); browser: Stage 3 run 20 checks; all other runs pass.

### Home page sections redesign (22 Oct 2026) ✅
Each section below the hero now has its own layout instead of the same "centred heading + four equal cards":
- **Who takes part:** numbered cards (01–04) with a coloured top edge and small arrows showing the flow from buyer to evidence record.
- **The challenge:** a dark band; Data, Contracts, Compliance and Delivery flow into **"One traceable assessment"**.
- **What OffshoreAssure does:** a "bento" grid with one large dark featured card ("Understand what you need" → see the nine stages) and three supporting cards.
- **Four simple steps:** a connected timeline with large numbered circles.
- **Who it is for:** two contrasting cards (dark for buyers, warm light for vendors).
- **Why OffshoreAssure, FAQ, Feedback:** split layouts with the heading (and a button, a "Still have a question?" box, or three short promises) on the left and the content on the right.
- **Get started band:** slowly turning dashed rings that echo the assessment ring.
- **How It Works:** the nine stages are joined by a vertical line, with live stages in copper.
- All work on phones (sections stack), keep the hover and scroll effects, and stay still with "reduce motion".

### Home page hero redesign (22 Oct 2026) ✅
- **Heading area:** the heading with **"outsourced"** highlighted in copper with an animated underline, a shorter intro, the two buttons, and three ticks (verified vendors only, evidence for every result, built for UK organisations). No label pill above the heading.
- **Illustration made for OffshoreAssure** (original SVG drawn in code; no stock images, nothing loaded from outside): a globe with the **UK buyer** linked to offshore delivery locations (Poland, India, Philippines, Brazil) by flowing lines with travelling dots, surrounded by the **assessment ring**: the nine stages light up one after another, a progress line moves round to the current stage, and its name is shown underneath ("Stage 5 of 9 · Obligation extraction"). No floating cards (Vishwajeet asked for a design that does not repeat the previous project).
- **"Who takes part"** is a row of four cards just below the hero, with the register links.
- With "reduce motion" everything is still. File: `frontend/src/pages/site/HeroScene.jsx`.

### Website motion and hover effects (22 Oct 2026) ✅
- **Hover:** cards lift slightly with a soft shadow and a copper edge; their icon turns copper and tilts; step numbers grow; problem items slide; chips and badges highlight; buttons lift and their arrows nudge forward; menu links get a copper underline (also marks the current page); footer links slide.
- **Scroll:** sections and cards fade up gently as they come into view, one after another. Anything already on screen is shown straight away, and nothing stays hidden.
- **Page load:** the hero text and the "Who takes part" card rise in; the page-hero glow drifts slowly.
- **Accessibility:** with "reduce motion" switched on in the computer's settings, all movement is turned off. On touch screens the lift is skipped.
- Only CSS and a small scroll helper in `PublicLayout.jsx`; no new libraries. All tests pass.

### Review cards + new footer (21 Oct 2026) ✅
- Review cards are a little wider and now show the **full name** as the sender typed it (the permission text says so). The email is still never shown.
- **New footer**, in a standard production layout: logo and short description with three trust badges (encrypted documents, full audit trail, built for UK organisations); link columns **Platform** (How It Works, Solutions, Home), **Company** (About Us, Send feedback, Contact us) and **Get started** (register as buyer / vendor, login; "Your account" when signed in); a bottom bar with © year, the "not legal advice" note and a **Back to top** button. Works on phones (columns stack).
- Tests: API 47; website browser run 22 checks.

### Public reviews on the home page (21 Oct 2026) ✅
- **What:** feedback can now appear on the home page as **review cards that scroll from right to left** ("What people say"). The cards pause when the mouse is over them; for people who turn on "reduce motion" they become a normal sideways list.
- **Two safeguards, so nothing is shown by mistake:**
  1. The sender ticks **"You can show my feedback on the OffshoreAssure website"** (off by default; only for feedback and ideas).
  2. An admin clicks **Publish** in **Admin → Website feedback** (and can **Remove** it again). Without the sender's permission there is no Publish button, and the database also refuses it.
- **Privacy:** only the first name and initial are shown (e.g. "Priya S.") with "Buyer", "Vendor" or "Visitor"; never the email.
- **Real reviews only:** no sample or invented reviews. If nothing is published, the section is hidden.
- **Database:** `009_feedback_reviews.sql`. **API:** `GET /api/feedback/public`; `PATCH /api/admin/feedback/:id { published }`. Audit: "Review published / removed".
- **Tests:** API 47; website browser run 20 checks (consent, publish, scrolling cards); all other runs unchanged and passing.

### Public website: separate pages + feedback (21 Oct 2026) ✅
Requested by Vishwajeet before starting Stage 3: make the user-facing site clear, with a page for each menu item, in simple UK English.
- **Menu:** Home · How It Works · **Solutions** (new) · About Us. Each is now its own page (`/`, `/how-it-works`, `/solutions`, `/about`), and the current page is highlighted. The mobile menu works the same way.
- **Home:** overview, who takes part, what OffshoreAssure does (4 cards), the process in 4 simple steps, who it is for (buyers and vendors), why use it, 5 frequently asked questions, a **feedback form**, and a "Ready to get started?" band.
- **How It Works:** the nine stages in plain words (what happens and who does it), with an honest "Available now" / "Coming soon" label; the buyer's and the vendor's journey step by step; how information is kept safe and traceable; the "not legal advice" note.
- **Solutions:** the common problems, six connected solutions (each with "How it helps" and its availability), benefits for buyers and vendors, and the services covered.
- **About Us:** why OffshoreAssure exists, the mission, four values, what OffshoreAssure is not, and how to get in touch.
- **Feedback:** anyone can send feedback, a question, a problem or an idea, with an optional 1–5 star rating and optional name/email. Messages are saved and the team reads them in **Admin → Website feedback** (mark as read/unread). Spam protection: a hidden honeypot field and a limit of 10 messages an hour.
- **No invented content:** no customer testimonials, figures, prices or company history were made up. Feedback is collected from real users instead.
- **Database:** `008_feedback.sql`. **API:** `POST /api/feedback`, `GET/PATCH /api/admin/feedback`.
- **Tests:** API 46 (new website test); browser 49 / 48 / 31 / 22, plus a new website run with 15 checks (each page, navigation, feedback, admin view, mobile). All pass.
- The old single landing page (`frontend/src/pages/Landing.jsx`) is no longer used and can be deleted.

### Stage 2 checked on the user's machine + 4 small fixes (21 Oct 2026) ✅
- **Checked by Vishwajeet, step by step:** two vendors (Vendor A Test Ltd, Demo) verified by the admin; search showed only verified vendors with Good/Partial match and reasons; shortlist and comparison; the confirm rules (reason needed, "I accept these issues" for a partial match); selection v1 (Demo), then change to v2 (Vendor A) with "Earlier selections"; Demo stopped seeing the assessment and Vendor A started seeing it; admin saw the Vendor column, the Stage 2 panel and the timeline.
- **Fixed after the check:**
  1. The "Information Required" box now follows Stage 2: once a vendor is chosen, the status says **"Vendor selected · compliance assessment next"** and the Stage 2 action shows **Done · Vendor selected: …**.
  2. Admin Stage 2 panel: accepted issues now read "Preferred country, Access countries" (not internal codes).
  3. The assessment timeline is always in diagram order (stage, then step). Before, an assessment created before Step 4 existed showed Step 4 after Steps 8–9.
  4. Admin tabs (e.g. Vendors: Pending / Verified / …) no longer show small scroll arrows.
- **Tests:** API 45 (Stage 2 test extended); browser 49 / 47 / 31 / 22. All pass.

### Stage 1 · Step 4 — Requirement profile and gaps (21 Oct 2026) ✅ — Stage 1 complete
- **What the buyer sees:** right after submitting, an **"Information Required"** box at the top of the requirement page (the format given in the Stage 1 PDF). It shows the 10 output fields:
  1. Assessment ID
  2. Service
  3. Buyer
  4. Jurisdictions (where data is stored or accessed from, plus the rule packs)
  5. Data classification
  6. Assurance controls that apply (ASS-001 … ASS-015)
  7. Initial risk tier (and whether it is provisional)
  8. **Missing information**, in two groups:
     - *To confirm by you:* answers marked "Unknown" and answers that contradict each other
     - *Evidence to collect in later stages:* e.g. "Final cloud hosting and backup locations", "Confirmed legal entities providing India and Philippines support", "Complete subprocessor chain" (the PDF's examples)
  9. **Required next actions**, each tagged with its stage (select a vendor → vendor assessment → contract review → transfer assessment …)
  10. **Current status**, one of:
     - *Information required* (answers contradict each other: correct them first)
     - *Ready for vendor selection · preliminary* (some answers are "Unknown")
     - *Ready for vendor selection* (only later-stage evidence outstanding, or nothing missing)
- **Boundary from the PDF:** the profile can be ready for vendor selection while later evidence is outstanding, but it is **never shown as compliant**. The box says so.
- **Corrections:** "Correct answers" creates a new profile version and the box updates straight away (timeline: "Requirement profile and gaps updated (v1.1)").
- **Timeline and audit:** Step 4 is now marked done on the assessment timeline and Stage 2 shows as "Next". The audit log records "Information Required issued".
- **Also:** an API for it, `GET /api/assessments/:ref/summary`; admins see the same box in Admin → Assessments.
- **Small UI fix:** the organisation name in the top bar is bigger (serif, 20px), as requested.
- **Tests:** API 37; browser 49 / 47 / 30. All pass.

### Password show/hide + roles verified (21 Oct 2026) ✅
- Every password field (Sign up, Login, Forgot password) now has an eye button to show or hide what was typed.
- Verified on the user's machine:
  - a buyer account (no verification needed)
  - a vendor account ("Demo", Australia), which appeared in Admin → Vendors as **Pending verification** with its company profile, user and history
  - a new admin added through Admin team, who set their password through Forgot password and signed in
  - the admin verified "Demo": the vendor portal now shows **Verified** ("verified on 21 Oct 10:43 … can now be presented to UK buyers"), and the verification email arrived. The vendor flow works end to end.

---

## 4. Decisions

| Date | Decision | Why |
|---|---|---|
| Oct 2026 | Node + Express + PostgreSQL API | Agreed with Vishwajeet; suits the audit and versioning needs |
| Oct 2026 | Build stage by stage, following the sequence diagram | Client's development plan |
| 20 Oct | Admin console separate from the buyer and vendor apps | Admin oversees both parties |
| 20 Oct | Three roles: Buyer, Vendor (= supplier, same party), Admin, each with its own clearly labelled portal | From the diagram lanes |
| 22 Oct | Stage 3: questionnaire per applicable control; Yes/Partly/No scoring with evidence rules; area + overall score /100 with bands; vendor locked once started; result append-only | Sequence diagram steps 10–16 + Use Case 1 prototype scoring. Provisional until the client's Stage 3 spec |
| 21 Oct | Stage 2: only verified vendors are searchable or selectable; invited unverified vendors can be shortlisted; weak matches need explicit acceptance; selections are append-only | Technical Architecture (verified, reusable vendor profile) + diagram Step 9 "save selection and decision rationale". Match rules provisional until the client's Stage 2 spec |
| 21 Oct | Step 4 statuses: "Information required" / "Ready for vendor selection · preliminary" / "Ready for vendor selection"; never "compliant" | Stage 1 PDF boundary for Step 4. Which items count as missing is provisional (rule pack RP-2026.10-S1-draft, `server/src/engine/gaps.js`) |
| 21 Oct | First registrant of a buyer organisation is its owner; others join only after the owner (or an admin) approves | Stops anyone joining an organisation by typing its name. Invitations can be added later |
| 21 Oct | Buyers and vendors both self-register (role chosen at sign-up); vendor companies need OffshoreAssure verification before buyers see them; admins are created internally only | Technical Architecture: vendor "holds a reusable profile presented to any UK buyer"; ASS-001 Legal Entity Verification. Adjust if the client says otherwise |
| 20 Oct | No static or sample data in the development build | Instruction from Vishwajeet |
| 20 Oct | "Fill example" button only on the local dev server | Useful for testing; excluded from builds |
| 20 Oct | Contradictions are reported, not blocking | The spec says "flag"; the buyer corrects them |
| 20 Oct | Risk tier, classification and packs live in one rule file (`server/src/engine/rulepack.js`, version `RP-2026.10-S1-draft`) | Easy to change when the client confirms; the version is recorded on every assessment |
| 20 Oct | Push everything to the branch at the end, not to `main` | `main` serves the live prototype; the API is not hosted yet |

### Provisional rules in use (rule pack RP-2026.10-S1-draft)
- **Data classification:**
  - Special category if special-category or criminal-offence data = Yes.
  - Personal if personal data = Yes or Unknown.
  - Confidential if privileged access or a High/Critical service.
  - Internal otherwise.
- **Preliminary risk tier:**
  - Critical: special-category or criminal-offence data, or a Critical service with personal data.
  - High: personal data + processed or accessed outside the buyer's country + privileged access, or a Critical service.
  - Medium: personal data, offshore privileged access, or a High-criticality service.
  - Low otherwise.
  - Marked *provisional* when key answers are Unknown.
- **Reviews:**
  - Transfer review required when personal data may be stored in or accessed from outside the buyer's country.
  - Contract review required for personal data, permitted subprocessors, High/Critical services or Financial Services.
  - Vendor assessment required unless the service is Low criticality with no personal data, no privileged access and no offshore processing.
- **Packs:**
  - UK-GDPR and UK-DPA-2018 (UK buyer)
  - UK-GDPR-CHAPTER-V (transfers)
  - COUNTRY-xx for each processing country
  - sector overlay: FCA/PRA, Health or Public
  - CLOUD-SERVICES

---

## 5. Waiting on the client / Mukesh

| # | Question | Raised | Blocks |
|---|---|---|---|
| 1 | 6 registration queries (approval, delete account, code rules, …) | Oct 2026 | Nothing (defaults in use) |
| 2 | 7 Stage 1 queries: risk tier rules, data classification list, control applicability, conditional fields, timeline milestones, whether documents are optional, legal reviewer | 20 Oct | Final rules for Steps 2–4 (defaults in use) |
| 3 | **Vendor sign-up:** built per the Technical Architecture (self-registration + OffshoreAssure verification; buyer invitations in Stage 2). Needs Mukesh to confirm | 21 Oct | Nothing (built; adjust if needed) |
| 4 | **Delivery Assurance** was in the prototype but is not in the diagram. Drop it, or include it under Stage 9? | 20 Oct | Stage 9 scope |
| 5 | Revised Step 5 (Stage 2) specification from Moumita. Stage 2 is built with provisional match rules; this will confirm or adjust them | Oct 2026 | Final Stage 2 match rules |
| 8 | Stage 3 questionnaire questions per control (ASS-001 … ASS-015), evidence rules, scoring weights and bands, response deadline | 21 Oct | Final Stage 3 rules (provisional ones are built and in use) |
| 9 | Stage 4: which clause topics to look for, which are mandatory, and whether the contract must wait for Stage 3 | 23 Oct | Final Stage 4 rules (provisional ones are built and in use) |
| 10 | Stage 5: which rules each obligation is checked against, obligation categories, and how deadlines and frequencies are recorded | 23 Oct | Final Stage 5 rules (provisional ones are built and in use) |
| 11 | Stage 6: the transfer rules (adequacy list to use, IDTA / Addendum, transfer risk assessment questions, how to treat sub-processors with unknown locations) | 23 Oct | Final Stage 6 rules (provisional ones are built and in use) |
| 6 | Production hosting (UK region) for the API and database | Oct 2026 | Going live |
| 7 | Evidence retention period (how long requirement documents and profiles are kept) | 20 Oct | Retention policy (Step 3 boundary) |

---

## 6. How to run locally

```powershell
# 1. Database (PostgreSQL 16, local install or docker compose up -d)
#    database: offshoreassure, user/password: oa / oa

# 2. API
cd server
npm install
copy .env.example .env          # then fill SMTP_* (Brevo) and secrets
npm run dev                     # applies database migrations automatically, http://localhost:4000/api
npm run seed:admin              # once: ADMIN_EMAIL / ADMIN_PASSWORD env vars

# 3. Web app
cd ..\offshoreassure
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :4000)
```

- **Buyer:** sign up with any email you can open, or use the code shown on screen in development.
- **Admin:** the seeded admin account opens `/admin`.

---

## 7. Tests

| Suite | Count | Last result |
|---|---|---|
| API (`server`, `npm test`) | 79 (Stage 0: 13, Stage 1: 19, Roles: 5, Stage 2: 13, Stage 3: 4, Stage 4: 6, Stage 5: 6, Stage 6: 5, Stage 7: 5, Website: 2, Sign-up source: 1) | ✅ all pass |
| Browser, Stage 0 + admin console | 49 checks | ✅ all pass |
| Browser, Stage 1 (Steps 1–4) + clean build | 48 checks | ✅ all pass |
| Browser, roles (buyer / vendor / admin / membership) | 31 checks | ✅ all pass |
| Browser, Stage 2 vendor selection (v2) | 29 checks | ✅ all pass |
| Browser, Stage 3 compliance assessment | 20 checks | ✅ all pass |
| Browser, Stage 4 contract analysis | 19 checks | ✅ all pass |
| Browser, Stage 5 obligation extraction | 15 checks | ✅ all pass |
| Browser, Stage 6 transfer assessment | 12 checks | ✅ all pass |
| Browser, Stage 7 risk identification | 16 checks | ✅ all pass |
| Browser, public website pages, feedback, reviews + footer | 24 checks | ✅ all pass |
| Browser, site extras (dark mode, search, cookie notice …) | 24 checks | ✅ all pass |

---

## 8. Code map

| Area | Location |
|---|---|
| Database migrations | `server/migrations/001_stage0_users.sql`, `002_stage1_requirements.sql`, `003_stage1_assessments.sql`, `004_stage1_profiles.sql`, `005_roles_vendors.sql`, `006_org_membership.sql`, `007_stage2_vendor_selection.sql`, `008_feedback.sql`, `009_feedback_reviews.sql`, `010_stage3_compliance.sql` |
| Auth, sessions, audit | `server/src/auth/*`, `server/src/audit.js` |
| Admin API | `server/src/admin/routes.js` |
| Stage 1 fields and validation (single source of truth) | `server/src/requirements/fields.js` |
| Stage 1 requirement API | `server/src/requirements/routes.js` |
| Stage 1 Step 2 engine rules | `server/src/engine/rulepack.js` |
| Assessments (Step 2) | `server/src/assessments/service.js`, `routes.js` |
| Stage 7 risk identification | `server/src/risks/routes.js` (API), `server/src/engine/risks.js` (themes, scoring, bands); `frontend/src/pages/Risks.jsx`, `src/lib/risks.js` |
| Stage 6 transfer assessment | `server/src/transfers/routes.js` (API), `server/src/engine/transfers.js` (routes, adequacy, checks); `frontend/src/pages/Transfers.jsx`, `src/lib/transfers.js` |
| Stage 5 obligation extraction | `server/src/obligations/routes.js` (buyer + vendor APIs), `server/src/engine/obligations.js` (extraction and rules); `frontend/src/pages/Obligations.jsx`, `src/pages/vendor/VendorObligations.jsx`, `src/lib/obligations.js` |
| Stage 4 contract analysis | `server/src/contracts/routes.js` (APIs), `server/src/contracts/extract.js` (PDF/Word text), `server/src/engine/clauses.js` (clause rules); `frontend/src/pages/ContractAnalysis.jsx`, `src/lib/contracts.js` |
| Stage 3 compliance assessment | `server/src/compliance/routes.js` (buyer + vendor APIs), `server/src/engine/questionnaire.js` (questions, evidence, scoring); `frontend/src/pages/Compliance.jsx`, `src/pages/vendor/VendorQuestionnaire.jsx`, `src/lib/compliance.js` |
| Public website pages and feedback | `frontend/src/pages/site/*` (Home, HowItWorks, Solutions, About, parts), `src/components/layout/PublicLayout.jsx`, `src/pages/admin/AdminFeedback.jsx`; server `src/feedback/routes.js` |
| Stage 2 vendor selection | `server/src/selection/routes.js` (APIs + vendor portal), `server/src/selection/vendorFields.js` (the 15 + 25 fields), `server/src/selection/vendors.js`, `server/src/engine/vendorFit.js` (fit rules); `frontend/src/pages/VendorSelection.jsx`, `src/pages/vendor/VendorAssessments.jsx`, `src/lib/selection.js` |
| Information Required box (Step 4) | `server/src/engine/gaps.js`, `server/src/assessments/profile.js` (`issueSummary`, `buildSummary`); `frontend/src/components/requirements/InformationRequired.jsx` |
| Profile, controls, timeline (Step 3) | `server/src/assessments/profile.js`, `server/src/engine/controls.js`, `server/src/storage.js` (encryption) |
| Stage map (9 stages, 43 steps, built steps) | `frontend/src/lib/stages.js` |
| Buyer pages | `frontend/src/pages/Dashboard.jsx`, `Requirements.jsx`, `RequirementForm.jsx`, `StagePage.jsx` |
| Admin console | `frontend/src/components/admin/AdminLayout.jsx`, `frontend/src/pages/admin/*` |
| Roles and vendor portal | `frontend/src/lib/roles.js`, `src/pages/vendor/*`, `src/components/auth/VendorProfileForm.jsx`, `src/pages/admin/AdminVendors.jsx`; server: `auth/routes.js` (`saveVendorProfile`), `admin/routes.js` (vendors), `auth/session.js` (`requireRole`) |
| Buyer organisation membership | `server/src/organisation/routes.js`, `server/src/assessments/service.js` (`membershipFor`, `requireActiveMembership`); `frontend/src/pages/Organisation.jsx`, `src/lib/membership.js` |

---

## 9. Next

1. **Stage 8 · Remediation (Steps 33–38):**
   - Step 33: the buyer approves or assigns an action for each risk
   - Step 34: the vendor is asked for corrections and missing documents
   - Step 35: the vendor submits evidence and a response
   - Step 36: the affected checks run again
   - Step 37: action and reassessment history saved
   - Step 38: updated status and outstanding actions shown to the buyer
2. Needed from the client for Stage 7–8: the risk scoring method (scale and bands), who owns each risk, and action deadlines.
