# Group Expense Platform

International expense management for a multinational group operating through several legal entities.
Employees submit expense claims; managers, controllers and finance teams approve them through a
configurable workflow. Expenses are checked against configurable policies and budgets, reimbursed
in payment batches and exported as balanced journals to each entity's ERP. Group Finance and the
CFO see consolidated dashboards across all subsidiaries.

| Area | What is implemented |
|---|---|
| Organisation | Group → countries → legal entities → business units → departments → cost centers, projects, employees |
| Access control | 8 roles, each granted on a scope (group, country, entity, department, cost center); enforced server-side on every query |
| Expenses | Reports with multiple lines, drafts, receipts (PDF/JPG/PNG), OCR prefill with user confirmation, mileage, trips, advances |
| Multi-currency | Original amount kept forever; FX snapshot (rate, source, date) to functional and group currency; audited manual overrides; ECB import |
| Approvals | Data-driven workflows (amount bands per currency, entity, country, category, department, project, cost center); delegation, out-of-office, SLA escalation, request info, segregation of duties |
| Policy & control | 13 configurable rule types, each a blocking control, a warning or an exception requiring Finance approval with mandatory justification |
| Budgets | Multi-dimensional budgets, pending/approved/paid buckets without double counting, forecast at completion, 80/90/100 % alerts |
| Accounting | Per-entity chart of accounts, VAT codes & deductibility, employee payable, corporate-card clearing, advances, period closing; CSV/Excel exports in SAP / Oracle / Dynamics 365 / Sage / generic layouts |
| Reimbursement | Payment batches, release to bank, bank results, failed-payment requeue, reconciliation, advance offsetting |
| Reporting | Dashboards per profile with filters (period, country, entity, department, cost center, category, currency); Excel and PDF export |
| Notifications | In-app and email, configurable per user and event |
| Governance | Append-only audit log (database trigger), GDPR erasure (pseudonymisation) and personal data export |

## Quick start (local)

Requirements: Node.js ≥ 20.11, PostgreSQL 16.

```bash
cp .env.example .env          # then set APP_SECRET (openssl rand -base64 48)
npm ci
npx prisma migrate deploy
npm run db:seed               # optional demo data (fictional "Atlas Group")
npm run dev                   # http://localhost:3000
```

With Docker:

```bash
APP_SECRET=$(openssl rand -base64 48) docker compose up --build
APP_SECRET=... docker compose run --rm seed     # optional demo data
```

### Demo accounts

Password for every account: `Expense!2026demo` (demo data only).

| Email | Profile |
|---|---|
| `employee.fr@atlas-group.example` | Employee (France) — has a draft and a report in approval |
| `manager.fr@atlas-group.example` | Line manager — pending approvals |
| `dm.sales.fr@atlas-group.example` | Department manager (Sales FR) |
| `fc.fr@atlas-group.example` | Finance controller FR01 — exceptions to decide |
| `fin.fr@atlas-group.example` | Local finance FR01 — payments, accounting exports |
| `fc.uk@`, `fc.us@`, `fc.ma@` … | Local finance controllers per entity |
| `groupfin@atlas-group.example` | Group Finance — consolidated view, policies, workflows, FX |
| `cfo@atlas-group.example` | CFO — executive dashboard |
| `admin@atlas-group.example` | System administrator (no access to financial data, by design) |

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop / build / run |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm test` | Unit tests (domain rules, no database) |
| `npm run test:integration` | Service tests against PostgreSQL (`TEST_DATABASE_URL`, default `expense_test`; the schema is reset) |
| `npm run test:e2e` | Playwright browser tests (needs a seeded database) |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load demo data into an empty database |
| `npm run jobs:escalate` / `jobs:fx` | Run scheduled jobs (also available over HTTP, see deployment guide) |

## Documentation

- [Architecture & technical decisions](docs/ARCHITECTURE.md)
- [Business rules (workflow, policies, FX, budgets, accounting)](docs/BUSINESS-RULES.md)
- [REST API (OpenAPI 3.1)](docs/openapi.yaml)
- [Deployment & operations](docs/DEPLOYMENT.md)
- [Security, privacy & data governance](docs/SECURITY.md)
