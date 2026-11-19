# Architecture

## Overview

The platform is a modular monolith on Next.js 15 (App Router). Pages and the REST API run in the same
process and call the same application services, so there is exactly one authorization path.

```
src/
  server/
    domain/        Pure business rules: money, FX, policy engine, approval engine, budgets,
                   accounting, ERP layouts, duplicate detection, receipt parsing. No I/O.
    services/      Use cases: load data, authorize, call domain rules, persist, audit, notify.
    auth/          Sessions, RBAC permission matrix, scope engine (role x organisational scope).
    infra/         Adapters: storage (local / S3), OCR (mock / Azure), email (console / SMTP),
                   audit log, rate limiting.
    http/          API wrapper: session, CSRF origin check, Zod validation, error mapping.
    validation.ts  Zod schemas for every API input.
  app/
    api/v1/        Thin REST route handlers (parse → service → JSON).
    (app)/         Authenticated pages (server components call services directly).
    login/
  components/      UI kit (shadcn-style primitives on Tailwind 4) and app components.
prisma/            Schema, migrations (with DB triggers and CHECK constraints), demo seed.
tests/             unit/ (domain), integration/ (services + PostgreSQL), e2e/ (Playwright).
```

## Key decisions

| Decision | Why |
|---|---|
| **Next.js monolith, not a separate NestJS backend** | One team, one deployable, one authorization path. The `domain/` + `services/` layers have no dependency on Next.js, so they can move behind a separate API later without rewriting business logic. |
| **Pure domain layer** | Financial rules (rounding, FX, routing, budgets, journals) are deterministic functions, unit-tested without a database. |
| **Prisma 6 + PostgreSQL 16** | Mature, typed access with versioned migrations. Prisma 7/8 were available but introduce breaking changes with no benefit here. |
| **Decimal everywhere** | `Decimal(19,4)` amounts, `Decimal(20,10)` rates and `decimal.js` in code; no floating point in financial logic. Rounding follows ISO 4217 minor units (JPY 0, KWD 3…). |
| **FX snapshots on every line** | Rate, source and effective date are stored with the converted amounts; the original amount is never modified. New rates never change past conversions. |
| **Data-driven workflows and policies** | Thresholds, steps, roles and rules live in the database and are edited from the administration UI. Nothing is hardcoded. |
| **Budget consumption computed from live status** | Each expense counts in exactly one bucket (pending / approved / paid) derived from its report's current status. No running counters, so double counting cannot happen. |
| **Opaque DB sessions** instead of JWT | Immediate revocation (deactivation, password change), no token leakage risk; SSO can plug into `createSession`. |
| **Ports & adapters for OCR, storage, email** | Providers are swapped by configuration (`OCR_PROVIDER`, `STORAGE_DRIVER`, `EMAIL_DRIVER`). |
| **Raw SQL only for aggregation** | Dashboards and budget cubes aggregate in PostgreSQL with parameterised `Prisma.sql`; the scope engine's restrictions are translated into the same SQL. |

## Request flow

1. The middleware redirects browsers without a session cookie to `/login`. This is a convenience only.
2. The `api()` wrapper checks Origin/Referer on mutations (CSRF), loads the session and rate-limits mutations.
3. The route validates input with Zod and calls a service.
4. The service checks the permission (`assertCan`) and the organisational scope (`scopeFor` / `reportReadWhere`). Out-of-scope records are reported as *not found*.
5. Mutations run in a transaction. Row locks (`SELECT … FOR UPDATE`) protect submission, approval and export, and an optimistic `version` field detects concurrent edits.
6. The audit log entry and in-app notifications are written in the same transaction; emails are sent after commit.

## Data model highlights

- `RoleAssignment(role, scopeType, scopeId)`: a user can be a Finance Controller for FR01 and an Employee elsewhere.
- `ExpenseReport` holds functional-currency totals, advance offset and net payable, recomputed server-side.
- `Expense` keeps the original amount and currency, both FX snapshots, analytical dimensions, mileage data, receipt and duplicate fingerprint.
- `ApprovalTask` is one row per step instance (waiting / pending / approved / skipped …), with SLA, delegation and escalation data.
- `PolicyViolation` stores the employee justification and the Finance decision.
- `JournalLine` rows are persisted per export, so files can be regenerated identically and nothing is exported twice.
- Database-level controls: append-only `AuditLog` (trigger), `net + tax = gross`, positive FX rates, one-sided journal lines, at most one active payment per report (partial unique index).

## Testing strategy

| Level | Scope | Count |
|---|---|---|
| Unit (`tests/unit`) | FX resolution & staleness, rounding, every policy rule type, routing & SoD, task state machine, budget maths, journals & ERP layouts, CSV injection, OCR text parsing, mileage | 42 |
| Integration (`tests/integration`) | Full lifecycle to payment and export, thresholds in foreign currency, blocking & exception controls, duplicates, SoD, info-request loop, concurrency, FX override, cross-entity isolation, audit immutability, advances, budgets, escalation | 12 |
| End-to-end (`tests/e2e`) | Browser: create → submit → approve; access denial | 2 |

The demo seed also exercises the real services (≈90 reports through submission, policy checks, approvals, exceptions and payments).
