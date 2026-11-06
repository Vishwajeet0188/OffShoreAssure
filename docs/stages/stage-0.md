# Stage 0 – Customer registration and admin

**Status:** built and tested locally on 20 Oct 2026. It is waiting for Mukesh's confirmation on the 6 registration queries, and the API is not yet hosted.

## Scope

This stage follows Mukesh's instruction: *"user (customer) creation workflow, the similar way as ScotWarm, and show registered user in system"*. Registration follows the ScotWarm pattern:

1. The user enters an email and password and clicks **Register**.
2. A 6-digit code is emailed and a verification popup opens.
3. Once the code is verified, the account is created and the user is signed in.
4. The user completes their profile: name, organisation, sector and role.
5. The user lands on the Dashboard.

**Also built:**

- login, logout and forgot password (using the same code popup)
- route guards
- the admin-only Registered Users page
- an audit trail of every registration, login and admin action

## Built

| Area | Files |
| --- | --- |
| API | `server/src/auth/*`, `server/src/admin/routes.js`, `server/src/audit.js`, `server/migrations/001_stage0_users.sql` |
| Screens | `offshoreassure/src/pages/Signup.jsx`, `Login.jsx`, `ForgotPassword.jsx`, `CompleteProfile.jsx`, `pages/admin/RegisteredUsers.jsx` |
| Popup and guards | `offshoreassure/src/components/auth/VerifyCodeModal.jsx`, `Guards.jsx` |
| Session | `offshoreassure/src/context/AuthContext.jsx`, `src/lib/api.js` |
| Navigation | Sidebar: "Registered Users" (admin only). Top bar and landing page: "Sign out". |

## Done-when checks

| Check | Result |
| --- | --- |
| Register → code → verify → profile → dashboard on a real database | ✅ |
| Duplicate email; wrong, expired and too-many codes; resend; password mismatch | ✅ |
| Login, wrong-password message, lockout, forgot and reset password, session survives refresh | ✅ |
| Admin sees new users, search and filter, activate and deactivate; customers cannot open the page or the API | ✅ |
| Every step written to the audit trail; audit rows cannot be edited | ✅ |
| Prototype Stages 1–12 unchanged once signed in (68-step text comparison) | ✅ |

## Open queries (email to Mukesh, 19 Oct)

| # | Query | Current default |
| --- | --- | --- |
| 1 | Who registers | Buyers. Vendor accounts are added in Stage 3. |
| 2 | Profile after registration | Yes: name, organisation, sector, role, phone |
| 3 | Admin approval | Off (`REQUIRE_ADMIN_APPROVAL=false`) |
| 4 | Admin actions | Activate and deactivate. Delete is pending. |
| 5 | Backend and email service | Local Express + PostgreSQL, SMTP-ready |
| 6 | Code rules | 6 digits, 10 minutes, 5 attempts, resend after 60 seconds |

## Important

The live Vercel site has no API yet. Keep this work on the `stage-0-registration` branch until the API is hosted (UK region). If it is merged to `main` first, sign-in on the live site stops working.
