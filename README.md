# OffshoreAssure

**A Third-Party Risk, Compliance & Outsourcing Assessment Platform**

OffshoreAssure is a web-based platform designed to help organisations manage outsourcing arrangements, evaluate third-party vendors, assess compliance risks, analyse contracts, and maintain an evidence-backed audit trail.

The platform provides a structured, nine-stage assessment workflow covering the outsourcing lifecycle, from initial service requirements to ongoing risk monitoring and audit reporting.

**Developed by:** Novtek Consulting  
**Project:** OffshoreAssure  
**Project Type:** Full-Stack Web Application  
**Status:** Active Development / Testing

---

## Project Overview

Organisations working with external service providers need to understand the risks associated with outsourcing, particularly when personal data, international transfers, regulatory obligations, and contractual responsibilities are involved.

OffshoreAssure brings these activities together in a single platform.

It allows organisations to:

- Create and manage outsourcing assessments.
- Search, shortlist, and select vendors.
- Conduct vendor compliance assessments.
- Upload and analyse contractual documents.
- Extract and track contractual obligations.
- Assess international data-transfer risks.
- Identify and prioritise compliance risks.
- Manage remediation actions and supporting evidence.
- Generate assessment reports and maintain audit records.

The platform is designed to support structured decision-making and human compliance review. Automated assessment results are not final legal determinations.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, JavaScript, JSX, Vite 8 |
| Routing | React Router 7 |
| Styling | CSS |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL |
| Authentication | Session-based authentication, password hashing, role-based access |
| Email | Nodemailer, SMTP |
| Document Processing | Text extraction and PDF generation |
| Testing | Node.js test runner, API tests, browser workflow testing |
| Version Control | Git and GitHub |

## Platform Architecture

OffshoreAssure follows a three-layer architecture:

**Frontend (React)**

Handles user interfaces, dashboards, forms, navigation, assessment workflows, and results presentation.

**Backend (Node.js + Express)**

Handles authentication, authorisation, validation, business rules, assessment processing, document management, notifications, and API requests.

**Database (PostgreSQL)**

Stores users, organisations, assessments, vendors, contract records, obligations, evidence metadata, risk findings, remediation actions, and audit history.

```text
                    OffshoreAssure
                          |
                   React Frontend
                          |
                    REST API
                          |
                  Express Backend
                    /     |     \
            Assessment  Auth   Documents
              Engine
                    \     |     /
                     PostgreSQL
```

## User Roles

### Buyer

The buyer represents an organisation outsourcing a service.

Buyers can create requirements, select vendors, review compliance submissions, analyse contracts, assess risks, manage remediation actions, and generate reports.

### Vendor

Vendors are external service providers participating in assessments.

They can view assigned assessments, answer compliance questionnaires, upload evidence, review their contractual obligations, and respond to remediation actions.

### Administrator

Administrators manage platform-level operations, including user and vendor administration, verification workflows, assessment oversight, and administrative reporting.

## Nine-Stage Assessment Workflow

The core of OffshoreAssure is its structured nine-stage workflow.

### Stage 1 — Requirement Definition

The buyer creates an outsourcing requirement by providing information about the service, data processing, operating locations, and relevant business conditions.

**Key capabilities:**
- Requirement form and validation
- Unique Assessment ID generation
- Service classification and preliminary risk identification
- Requirement versioning
- Information-required summary

### Stage 2 — Vendor Selection

The buyer identifies and evaluates suitable vendors based on the outsourcing requirement.

**Key capabilities:**
- Vendor search and filtering
- Vendor shortlisting
- Vendor comparison
- Selection with a recorded justification
- Vendor invitation and notification

### Stage 3 — Compliance Assessment

The selected vendor completes a structured compliance questionnaire and provides supporting evidence.

**Key capabilities:**
- Control-based questionnaires
- Vendor responses
- Supporting document uploads
- Provisional compliance scoring
- Identification of compliance gaps
- Buyer review of submitted information

### Stage 4 — Contract Analysis

The buyer uploads the outsourcing contract for structured analysis.

**Key capabilities:**
- Contract document processing
- Clause identification
- Contract topic mapping
- Identification of dates and financial figures
- Missing contractual topic detection
- Contract version history

### Stage 5 — Obligation Extraction

The system extracts contractual obligations and links them to relevant compliance controls.

**Key capabilities:**
- Obligation identification
- Responsibility assignment
- Deadline and frequency extraction
- Mapping obligations to rules and controls
- Identification of uncovered requirements
- Vendor visibility of relevant obligations

### Stage 6 — Transfer Assessment

The platform evaluates international personal-data transfer arrangements using information collected in earlier stages.

**Key capabilities:**
- Identification of transfer routes and destinations
- Restricted-country checks
- UK adequacy assessment
- Contractual safeguard checks
- Identification of transfer risk assessment requirements
- Findings and clarification questions
- Versioned assessment records

### Stage 7 — Risk Identification

Findings from earlier assessment stages are consolidated into a risk register.

**Key capabilities:**
- Consolidated risk identification
- Likelihood and impact scoring
- Risk prioritisation
- Explanations for calculated scores
- Traceability to underlying assessment findings

### Stage 8 — Remediation

The buyer and vendor work together to address identified risks.

**Key capabilities:**
- Remediation action creation
- Action ownership and deadlines
- Vendor responses
- Supporting evidence submission
- Buyer approval or return for further action
- Residual risk reassessment

### Stage 9 — Monitoring and Audit

The platform supports continued oversight after the initial assessment.

**Key capabilities:**
- Assessment reporting
- Evidence-backed audit records
- Audit pack generation
- Certificate expiry monitoring
- Overdue action monitoring
- Change tracking and assessment history

## Additional Features

Beyond the nine-stage assessment workflow, OffshoreAssure includes:

- Buyer and vendor registration
- Email verification
- Secure login and password reset
- Role-specific dashboards
- Vendor administration and verification
- Public-facing website
- Contact and support functionality
- User feedback and reviews
- Responsive navigation
- Mobile-friendly interfaces
- Cookie consent functionality
- Email notifications
- Document upload and management

## Project Structure

```text
OffShoreAssure/
|
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- pages/
|   |   |-- lib/
|   |   |-- ...
|   |
|   |-- package.json
|
|-- server/
|   |-- src/
|   |   |-- engine/
|   |   |-- ...
|   |
|   |-- migrations/
|   |-- test/
|   |-- package.json
|   |-- .env.example
|
|-- docs/
|-- docker-compose.yml
|-- README.md
```

**Directory descriptions**

- `frontend/` — React application and user interfaces.
- `frontend/src/components/` — Reusable interface components.
- `frontend/src/pages/` — Public pages, buyer workflows, vendor pages, and administration.
- `frontend/src/lib/` — Shared utilities and API helpers.
- `server/` — Backend application and API services.
- `server/src/engine/` — Assessment processing and business rules.
- `server/migrations/` — Versioned PostgreSQL database migrations.
- `server/test/` — Backend and API tests.
- `docs/` — Project documentation and development records.

## Getting Started

### Prerequisites

Before running OffshoreAssure locally, ensure you have:

- Node.js 20.19 or newer
- PostgreSQL 14 or newer
- npm
- Git
- An SMTP configuration for email-dependent functionality

### 1. Clone the Repository

```bash
git clone https://github.com/Vishwajeet0188/OffShoreAssure.git
cd OffShoreAssure
```

### 2. Configure the Backend

```bash
cd server
npm install
```

Create the environment configuration from the supplied example:

```bash
cp .env.example .env
```

Configure the required database, authentication, email, and document-storage settings.

Use the repository's existing environment example for the exact variable names.

### 3. Set Up PostgreSQL

Create the development database and configure the connection in `server/.env`.

Run the database migration command documented in the server's package scripts.

If required, initialise the administrator account using the repository's documented seed procedure.

### 4. Start the Backend

```bash
npm run dev
```

### 5. Start the Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite.

Ensure the frontend API configuration points to the running backend.

## Testing and Quality Assurance

OffshoreAssure uses API tests and browser-based workflow checks to validate core functionality.

Testing areas include:

- Authentication and authorisation
- Buyer and vendor registration
- Requirement validation
- Vendor selection
- Compliance questionnaires
- Contract analysis
- Obligation extraction
- Transfer assessment
- Risk identification
- Remediation actions
- Monitoring and reporting
- Document handling
- Role-based access
- End-to-end assessment workflows

The development records include successful API and browser tests for individual stages.

**Note:** Historical test results do not replace running the complete test suite against the current release branch.

## Security Considerations

The platform incorporates security controls appropriate to its role in handling assessment records and supporting documents.

These include:

- Password hashing
- Email verification and password recovery controls
- Role-based access restrictions
- Server-side request validation
- Session protection
- Document encryption at rest where configured
- Versioned assessment records
- Document fingerprints
- Audit history
- Restricted access to organisation-specific information

Production deployment requires appropriate secrets management, database protection, backup procedures, encryption-key configuration, and security testing.

**Never commit `.env` files, credentials, authentication secrets, or production encryption keys to the repository.**

## Development Status

The project has implemented the nine-stage assessment workflow in development branches, alongside the core authentication, administration, and public website functionality.

The main branch has historically been maintained separately as the Phase 1 prototype while later features were developed and tested.

### Current Focus

- Workflow validation and regression testing
- Client review and feedback
- Assessment rule verification
- User interface improvements
- Production readiness checks
- Release preparation

Regulatory rule packs, assessment mappings, hosting requirements, and retention settings require appropriate review and approval before production reliance.

## Live Prototype

**Website:** https://off-shore-assure.vercel.app

This link refers to the Phase 1 prototype recorded in the project development documentation. Features available on the live deployment may differ from those implemented in development branches.

## Documentation

Additional project documentation covers:

- Requirements and specifications
- Design-based workflow
- Implementation approach
- Testing and quality assurance
- Development history

Refer to the `docs/` directory and the project development log for implementation details and historical decisions.

## Contributing

Development contributions should follow the existing project architecture and branch workflow.

Before submitting changes:

1. Review the relevant requirements.
2. Follow existing coding conventions.
3. Keep backend rules separate from frontend presentation.
4. Add or update tests for changed functionality.
5. Validate database migrations.
6. Avoid committing sensitive information.
7. Document significant implementation changes.

## Project Ownership

**Project:** OffshoreAssure  
**Development Organisation:** Novtek Consulting  
**Developer:** Vishwajeet Kumar

This project is developed for a client engagement. Source code, project documentation, and deployment permissions are subject to the applicable project and organisational agreements.

## Disclaimer

OffshoreAssure is intended to support outsourcing governance, third-party risk management, and compliance assessment processes.

Its automated findings, risk scores, contract analysis, and regulatory mappings are decision-support outputs and should be reviewed by appropriately qualified personnel.

The platform does not independently certify legal or regulatory compliance.

---

**OffshoreAssure — Structured Outsourcing Assessment, Risk Management and Compliance Oversight.**
