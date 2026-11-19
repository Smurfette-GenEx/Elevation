# Business rules

## Report lifecycle

```
DRAFT ──submit──▶ SUBMITTED ──▶ UNDER_REVIEW ──▶ APPROVED ──▶ READY_FOR_PAYMENT ──▶ PAYMENT_INITIATED ──▶ PAID
  ▲                  │  │            │   ▲                                     ▲               │
  │   withdraw       │  └─▶ INFO_REQUESTED (employee answers → back to review)│               │ failed transfer
  └──────────────────┘              │                                          └───────────────┘
REJECTED ◀────────────────────────────┘ (employee can rework and resubmit)
```

- Only `DRAFT` and `REJECTED` reports can be edited, and only by their owner.
- A report can be withdrawn while no step has been approved.
- On final approval, paid advances are offset first (FIFO). If nothing remains to pay, the report goes straight to `PAID`; otherwise it goes to `READY_FOR_PAYMENT`. The accounting status becomes `READY`.

## Approval routing

1. **Workflow selection:** among active workflows whose non-empty conditions all match (entity, country, department, cost center, project, category), the highest `priority` wins, then the most specific.
2. **Step selection:** a step applies when the report total, converted to the workflow's `thresholdCurrency` at submission date, is ≥ `minAmount` and < `maxAmount`. It also applies when `requiredOnException` is set and a policy exception is pending, or when the report contains one of its `categoryCodes`.
3. **Approver resolution:**

   | Approver type | Candidates, in order |
   |---|---|
   | Line manager | Line manager, then N+2, then department manager |
   | Department manager | Department manager, then the claimant's line manager, then N+2 |
   | Role | Holders of the role for the entity (entity scope, then country, then group), then holders of the step's escalation role |
   | Specific user | The named user |

   An active out-of-office delegation replaces a candidate with their delegate.
4. **Segregation of duties:** the claimant is never an approver. If no other candidate exists, submission fails with an explicit message.
5. If the same person would approve two steps, the later step is skipped automatically and recorded.

Seeded group matrix (editable under Administration → Approval workflows):

| Report total | Steps |
|---|---|
| < 100 EUR | Line manager |
| 100 – 999.99 EUR | Line manager → Finance controller |
| ≥ 1,000 EUR | Line manager → Finance controller → CFO |

The UK workflow uses GBP thresholds (85 / 850). Client entertainment adds a department-manager step.

**Delegation and escalation:**
- An approver can hand a pending step to a colleague, with a reason.
- A scheduled job escalates steps past their SLA to the escalation role, or else to the approver's manager. This happens at most twice and never to the claimant.

## Policy engine

Each rule has a type, an optional scope (entity, country, category), parameters, a control type and a severity. For each type, the most specific matching rule applies: entity beats country, which beats category; ties are broken by priority. Amount parameters are expressed in the rule's currency, and expense amounts are converted at the expense-date rate before comparison.

| Control type | Effect |
|---|---|
| `BLOCK` | Submission refused until fixed |
| `REQUIRE_EXCEPTION` | Employee justification required (≥ 10 characters). A Finance user in scope must approve the exception, with a mandatory note, before final approval; a Finance step is added to the workflow automatically. |
| `WARN` | Recorded and displayed; excluded from the compliance rate |

Rule types:
- Maximum per item by category
- Daily meal allowance (meals aggregated per day)
- Accommodation per night
- Mandatory receipt above a threshold (mileage exempt)
- Weekend (per-country weekend days)
- Public holiday (per country)
- Duplicate expense (same employee, date, amount, currency and normalised merchant, within the report or across non-rejected reports)
- Duplicate receipt file (SHA-256)
- Unauthorised category
- Unusual amount (× the 12-month category average, with a minimum sample size)
- Projected budget overrun
- Late submission
- Missing business purpose

## Multi-currency

- Each line stores its original amount and currency, plus two FX snapshots: transaction → functional currency, and transaction → group reporting currency. Each snapshot records rate, source and effective date.
- **Rate resolution:** the latest rate effective on or before the expense date, at most 10 days old. Lookup order is direct pair, then inverse, then cross rate via EUR. For the same date, the source precedence is MANUAL > CORPORATE > ECB.
- **Manual rates:** Group Finance can add manual rates (with justification and audit). ECB daily rates are imported by a scheduled job.
- **Per-line overrides:** a Finance user in the entity's scope can override the rate on a line under review.
  - A justification is required, and the claimant can never override their own lines.
  - The deviation is capped at 10 % from the reference rate; only Group Finance can exceed the cap.
  - The FX impact is computed and stored in the audit log.
- Advances are paid in the entity's functional currency, which avoids FX exposure on settlement.

## Budgets

- **Dimensions:** entity, fiscal year, optional month, department, cost center, project, category. Budgets are held in the entity's functional currency.
- **Consumption basis** (configured per group): `ACTUAL_ONLY` counts approved and paid expenses; `ACTUAL_AND_PENDING` adds pending ones.
- **Indicators:**
  - initial and revised budget
  - pending, approved and paid amounts
  - remaining budget
  - consumption %
  - forecast at completion (committed spend plus a linear run-rate for the remaining months)
  - variance
- **Alerts:** each threshold (80 / 90 / 100 %) is raised once per budget and notifies the entity's controllers and the department manager.

## Accounting

Each approved report produces a recognition journal in the entity's chart of accounts:

| Debit / credit | Account | Amount |
|---|---|---|
| Dr | Expense GL (per category mapping), with cost center, project and analytical code | Gross − recoverable VAT |
| Dr | VAT recoverable, with VAT code | Tax × deductible % |
| Cr | Employee payable | Reimbursable lines |
| Cr | Corporate-card clearing | Corporate-card and company-paid lines |
| Dr / Cr | Employee payable / Employee advances | Advance offset |

- Payment journals: Dr employee payable / Cr bank.
- Every journal is checked for balance.
- If the document's period is closed, the entry is posted in the next open period.
- Export layouts: GENERIC, SAP (BUKRS / HKONT / SHKZG …), ORACLE (GL_INTERFACE), DYNAMICS365 (general journal), SAGE. These are starting templates to be aligned with each customer's import format during implementation.
