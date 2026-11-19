# Deployment & operations

## Runtime components

| Component | Notes |
|---|---|
| Application | Docker image (`Dockerfile`, Next.js standalone output, non-root user, tini, health check on `/api/v1/health`). Stateless: scale horizontally. |
| PostgreSQL 16 | Managed service recommended (Azure Database for PostgreSQL, AWS RDS, Cloud SQL) with TLS, PITR backups, high availability. |
| Object storage | `STORAGE_DRIVER=s3` (S3 or any S3-compatible store) with a **private** bucket, server-side encryption, versioning and no public access. Local storage is for development and single-node use only. |
| Scheduler | Calls the job endpoints (see below). |
| SMTP relay | `EMAIL_DRIVER=smtp`, `SMTP_URL=smtps://user:pass@host:465`. |

## Configuration

Every setting comes from environment variables (`.env.example` lists them all) and is validated at startup.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Add `?sslmode=require` in production. |
| `APP_URL` | Public HTTPS origin. Used for CSRF origin checks and email links. |
| `APP_SECRET` | ≥ 32 random bytes; signs file URLs. Store in a secret manager and rotate yearly (rotation invalidates outstanding file links only). |
| `CRON_SECRET` | Bearer token for job endpoints. |
| `SESSION_TTL_HOURS` | Default 12. |
| `MAX_UPLOAD_MB` | Default 10. |
| `OCR_PROVIDER=azure` | Requires `AZURE_DI_ENDPOINT` and `AZURE_DI_KEY`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | Credentials come from the platform identity (IAM role / workload identity), never from variables. |

## Release procedure

1. CI (`.github/workflows/ci.yml`) runs:
   1. typecheck and lint
   2. unit and integration tests against PostgreSQL
   3. seed, build and end-to-end tests
   4. Docker build
2. Run migrations once per release: `npx prisma migrate deploy`, e.g. as a Kubernetes Job or release command.
   - The image entrypoint runs them by default (`RUN_MIGRATIONS=true`). Disable that when several replicas start together.
   - Migrations are forward-only. Review generated SQL; destructive changes require an expand → migrate → contract sequence.
3. Roll out the new image (rolling update; the health check gates traffic).

## Scheduled jobs

| Job | Frequency | Command |
|---|---|---|
| Approval escalation | hourly | `POST /api/v1/jobs/escalations` with `Authorization: Bearer $CRON_SECRET` |
| ECB FX import | weekdays ~16:30 CET | `POST /api/v1/jobs/fx-rates` (same header) |

Both can also be run in-cluster: `npm run jobs:escalate`, `npm run jobs:fx`.

## Single sign-on (Microsoft Entra ID)

The user model has `externalId` (Entra object id) and sessions are created by `createSession(userId)`. To enable SSO:

1. Register an app in Entra ID (redirect URI `https://<app>/api/v1/auth/entra/callback`) and set `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET`.
2. Add an OIDC authorization-code + PKCE route pair. On callback, validate the ID token (issuer, audience, nonce), map `oid` to `User.externalId` (just-in-time provisioning optional), and call `createSession`.
3. Optionally map Entra groups to `RoleAssignment` through a scheduled sync.
4. Turn off password login for SSO users by leaving `passwordHash` empty.

## Backup & recovery

- **Database:** PITR (continuous WAL archiving) with 35-day retention, plus a daily logical dump (`pg_dump -Fc`) to a separate account or region, encrypted. Target RPO ≤ 15 min, RTO ≤ 4 h.
- **Receipts:** bucket versioning, cross-region replication and a lifecycle rule aligned with the retention policy.
- **Restore drill** (quarterly):
  1. Restore to a new instance, run `prisma migrate status`, and start the app against it.
  2. Check sample reports, receipts (signed URLs) and audit-log continuity.
- The audit log cannot be truncated by the application role. Restores must therefore come from backups, never from manual edits.

## Monitoring

- Health: `GET /api/v1/health` (checks database connectivity).
- Logs: structured stdout; ship to your log platform. Unhandled API errors are logged with a generic client message (no stack traces are exposed).
- **Suggested alerts:**
  - 5xx rate
  - p95 latency
  - DB connections
  - failed job runs
  - ECB import missing for more than 2 business days (conversions use a 10-day staleness limit and then fail)
  - pending approvals past SLA

## Scaling notes

- The in-memory login rate limiter is per instance. With several replicas, back `rateLimit()` with Redis.
- Dashboards aggregate in SQL over indexed columns. For very large volumes (tens of millions of lines), add materialised views refreshed by a job, keeping the same scope filters.
