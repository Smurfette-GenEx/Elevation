# Security, privacy & data governance

## Authentication & sessions

- Passwords: bcrypt (cost 12), minimum 12 characters mixing upper case, lower case and digits.
- Constant-time handling of unknown accounts (no user enumeration).
- Lockout for 15 minutes after 5 failures, plus IP and account rate limiting on login.
- Sessions are opaque 256-bit tokens. Only their SHA-256 hash is stored, and the cookie is `HttpOnly`, `SameSite=Lax` and `Secure` in production. Sessions expire (12 h by default) and are revoked when a user is deactivated or their password changes.
- Future SSO: Microsoft Entra ID via OIDC (see `DEPLOYMENT.md`).

## Authorization

- **Two levels:**
  - a permission matrix (`src/server/auth/rbac.ts`) says what a role may do;
  - the scope engine (`src/server/auth/scope.ts`) says where: group, country, legal entity, department or cost center.
- **Enforced in the service layer for every read and write**, including dashboard SQL aggregation. The UI only hides what the server already refuses. Records outside the actor's scope return 404 so their existence is not revealed.
- **Segregation of duties:**
  - no self-approval;
  - no exception decision, FX override or advance approval on one's own items;
  - nobody can delegate an approval to the claimant;
  - payment users cannot select their own reports;
  - administrators cannot grant themselves extra roles.
- **The System Administrator role has no access to expense data.** It manages users and settings only.
- **Isolation level:** tenant and legal-entity isolation is applied by the application data-access layer, and integration tests prove cross-entity denial. PostgreSQL row-level security is not enabled. For defence in depth in a shared-database, multi-tenant SaaS deployment, add RLS policies on `groupId` / `legalEntityId`, with the actor context set per transaction.

## Web security (OWASP Top 10)

| Risk | Control |
|---|---|
| Injection | Prisma parameterised queries; raw SQL only through tagged `Prisma.sql` templates |
| Broken access control | Server-side scope engine, 404 on out-of-scope records, integration tests |
| CSRF | `SameSite=Lax` cookies plus an Origin/Referer check on every mutating API call |
| XSS | React escaping, strict CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), no `dangerouslySetInnerHTML` |
| Security misconfiguration | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`, environment validated at boot |
| Insecure uploads | Extension, declared MIME type and magic bytes must agree (PDF/JPEG/PNG only), size limit, random storage keys, path-traversal guard, files served with `nosniff` and a restrictive CSP |
| Data exposure | Receipts in private storage, served only through 5-minute signed URLs **and** a valid session, with a visibility check per receipt |
| Spreadsheet injection | CSV cells starting with `= + - @` are neutralised |
| Mass assignment | All inputs validated by Zod schemas; totals always recomputed server-side |
| Race conditions | Row locks on submission, approval and export; optimistic versioning; DB constraints (one active payment per report) |

## Audit trail

Every significant action is recorded with actor, entity, timestamp, IP (for logins) and before/after data:
- logins
- report creation, submission, withdrawal
- approvals and delegations
- exception decisions and FX overrides
- budgets
- payments
- accounting exports and downloads
- user, role, policy and workflow changes
- GDPR operations

The `AuditLog` table is append-only: a trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`.

## Encryption

- In transit: TLS at the load balancer (HSTS) and `sslmode=require` to PostgreSQL.
- At rest: managed database encryption and S3 server-side encryption (`AES256`, or KMS keys via bucket policy).

## Privacy (GDPR)

- **Data minimisation:** the employee directory used by pickers exposes only name and entity.
- **Right of access:** each user can download their personal data from the Notifications page (`GET /api/v1/me/personal-data`). Administrators can export it for any user.
- **Right to erasure:** pseudonymisation replaces name and email, removes credentials, sessions and notifications. Financial records are kept for the legal accounting retention period (typically 10 years: Code de commerce L123-22 in France, 6 years in the UK). Erasure is refused while reports or payments are still open.
- **Retention:** `Group.retentionYears` (default 10). Once it has passed, purge receipts and pseudonymise remaining personal fields with a scheduled job, after legal sign-off per country.
- **International transfers:** consolidated Group Finance access implies intra-group transfers. Cover them with intra-group agreements or Standard Contractual Clauses.
- Recommended: a DPIA before go-live, plus records of processing (Art. 30).
