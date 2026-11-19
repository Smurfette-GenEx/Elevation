import { z } from "zod";

const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,13}(\.\d{1,4})?$/.test(v), "Must be a positive amount with at most 4 decimals");
const currency = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 currency code expected");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const id = z.string().min(1).max(40);
const text = (max: number) => z.string().trim().max(max);

export const createReportSchema = z.object({
  title: text(120).min(3),
  purpose: text(500).optional().nullable(),
  tripId: id.optional().nullable(),
});

export const updateReportSchema = createReportSchema.partial().extend({ version: z.number().int() });

export const expenseLineSchema = z
  .object({
    expenseDate: isoDate,
    categoryId: id,
    merchant: text(120).min(1),
    description: text(500).min(1),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    currency,
    grossAmount: money.optional(),
    taxAmount: money.optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    costCenterId: id,
    projectId: id.optional().nullable(),
    budgetCode: text(40).optional().nullable(),
    paymentMethod: z.enum(["PERSONAL_CARD", "CORPORATE_CARD", "CASH", "BANK_TRANSFER", "COMPANY_PAID"]),
    attendees: text(500).optional().nullable(),
    nights: z.coerce.number().int().min(1).max(60).optional().nullable(),
    receiptId: id.optional().nullable(),
    receiptMissingReason: text(300).optional().nullable(),
    mileage: z
      .object({
        distanceKm: money,
        vehicleType: z.string().min(1).max(20),
        fromLocation: text(120).min(1),
        toLocation: text(120).min(1),
      })
      .optional()
      .nullable(),
  })
  .refine((v) => v.mileage || v.grossAmount, { message: "Amount is required", path: ["grossAmount"] });

export type ExpenseLineInput = z.infer<typeof expenseLineSchema>;

export const submitSchema = z.object({
  version: z.number().int(),
  // justification per violation key "<ruleType>:<expenseId|report>"
  justifications: z.record(z.string(), text(1000)).default({}),
});

export const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_INFO"]),
  comment: text(2000).optional().nullable(),
}).refine((v) => v.decision === "APPROVE" || (v.comment && v.comment.length >= 3), {
  message: "A comment is required when rejecting or requesting information",
  path: ["comment"],
});

export const exceptionDecisionSchema = z.object({
  approve: z.boolean(),
  note: text(1000).min(5, "A justification of at least 5 characters is mandatory"),
});

export const fxOverrideSchema = z.object({
  rate: z.string().regex(/^\d{1,10}(\.\d{1,10})?$/),
  reason: text(500).min(10, "Explain the override (min. 10 characters)"),
});

export const manualRateSchema = z.object({
  baseCurrency: currency,
  quoteCurrency: currency,
  rate: z.string().regex(/^\d{1,10}(\.\d{1,10})?$/),
  effectiveDate: isoDate,
  justification: text(500).min(10),
});

export const delegationSchema = z.object({
  toUserId: id,
  startsAt: isoDate,
  endsAt: isoDate,
  reason: text(300).optional().nullable(),
});

export const reassignSchema = z.object({ toUserId: id, reason: text(300).min(5) });

export const commentSchema = z.object({ body: text(2000).min(1) });

export const advanceSchema = z.object({
  amount: money,
  purpose: text(300).min(5),
  tripId: id.optional().nullable(),
});

export const tripSchema = z.object({
  purpose: text(300).min(5),
  destinationCountry: z.string().regex(/^[A-Z]{2}$/),
  destinationCity: text(80).min(1),
  startDate: isoDate,
  endDate: isoDate,
  estimatedCost: money.optional().nullable(),
  projectId: id.optional().nullable(),
}).refine((v) => v.endDate >= v.startDate, { message: "End date must be after start date", path: ["endDate"] });

export const budgetSchema = z.object({
  legalEntityId: id,
  code: text(40).min(1),
  name: text(120).min(1),
  fiscalYear: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  departmentId: id.nullable().optional(),
  costCenterId: id.nullable().optional(),
  projectId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  initialAmount: money,
  revisedAmount: money.nullable().optional(),
});

export const paymentBatchSchema = z.object({
  legalEntityId: id,
  reportIds: z.array(id).min(1).max(500),
  paymentDate: isoDate,
});

export const completeBatchSchema = z.object({
  results: z.array(z.object({ paymentId: id, status: z.enum(["PAID", "FAILED"]), bankReference: text(60).optional().nullable() })).min(1),
});

export const exportSchema = z.object({ legalEntityId: id, kind: z.enum(["EXPENSES", "PAYMENTS"]) });

export const policyRuleSchema = z.object({
  name: text(120).min(3),
  type: z.enum(["CATEGORY_MAX_PER_ITEM", "DAILY_MEAL_ALLOWANCE", "ACCOMMODATION_NIGHTLY_MAX", "RECEIPT_REQUIRED_ABOVE", "WEEKEND_EXPENSE", "PUBLIC_HOLIDAY_EXPENSE", "DUPLICATE_EXPENSE", "DUPLICATE_RECEIPT", "CATEGORY_NOT_ALLOWED", "UNUSUAL_AMOUNT", "BUDGET_OVERRUN", "LATE_SUBMISSION", "MISSING_DESCRIPTION"]),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  legalEntityId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  currency: currency.nullable().optional(),
  action: z.enum(["BLOCK", "WARN", "REQUIRE_EXCEPTION"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});

const role = z.enum(["EMPLOYEE", "LINE_MANAGER", "DEPARTMENT_MANAGER", "FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE", "CFO", "SYSTEM_ADMIN"]);

export const workflowStepSchema = z.object({
  sequence: z.number().int().min(1),
  name: text(80).min(1),
  approverType: z.enum(["LINE_MANAGER", "DEPARTMENT_MANAGER", "ROLE", "SPECIFIC_USER"]),
  role: role.nullable().optional(),
  userId: id.nullable().optional(),
  minAmount: money.default("0"),
  maxAmount: money.nullable().optional(),
  requiredOnException: z.boolean().default(false),
  categoryCodes: z.array(z.string()).default([]),
  slaHours: z.number().int().min(1).max(24 * 30).default(72),
  escalateToRole: role.nullable().optional(),
}).refine((s) => s.approverType !== "ROLE" || s.role, { message: "Role is required for ROLE steps", path: ["role"] })
  .refine((s) => s.approverType !== "SPECIFIC_USER" || s.userId, { message: "User is required", path: ["userId"] });

export const workflowSchema = z.object({
  name: text(120).min(3),
  description: text(500).nullable().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  legalEntityId: id.nullable().optional(),
  departmentId: id.nullable().optional(),
  categoryCode: z.string().nullable().optional(),
  projectId: id.nullable().optional(),
  costCenterId: id.nullable().optional(),
  priority: z.number().int().default(0),
  thresholdCurrency: currency,
  active: z.boolean().default(true),
  steps: z.array(workflowStepSchema).min(1).max(10),
});

export const userSchema = z.object({
  email: z.string().email().max(200),
  name: text(120).min(2),
  legalEntityId: id,
  departmentId: id.nullable().optional(),
  costCenterId: id.nullable().optional(),
  managerId: id.nullable().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  employeeNumber: text(40).nullable().optional(),
  active: z.boolean().default(true),
  password: z.string().min(12).max(200).optional(),
  roles: z.array(z.object({ role, scopeType: z.enum(["GROUP", "COUNTRY", "LEGAL_ENTITY", "DEPARTMENT", "COST_CENTER"]), scopeId: z.string().nullable() })).default([]),
});

export const notificationPrefSchema = z.object({
  prefs: z.array(z.object({ type: z.string().min(1).max(60), inApp: z.boolean(), email: z.boolean() })),
});
