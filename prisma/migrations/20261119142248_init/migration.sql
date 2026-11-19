-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'LINE_MANAGER', 'DEPARTMENT_MANAGER', 'FINANCE_CONTROLLER', 'LOCAL_FINANCE', 'GROUP_FINANCE', 'CFO', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('GROUP', 'COUNTRY', 'LEGAL_ENTITY', 'DEPARTMENT', 'COST_CENTER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'READY_FOR_PAYMENT', 'PAYMENT_INITIATED', 'PAID');

-- CreateEnum
CREATE TYPE "AccountingStatus" AS ENUM ('NOT_READY', 'READY', 'EXPORTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PERSONAL_CARD', 'CORPORATE_CARD', 'CASH', 'BANK_TRANSFER', 'COMPANY_PAID');

-- CreateEnum
CREATE TYPE "ApproverType" AS ENUM ('LINE_MANAGER', 'DEPARTMENT_MANAGER', 'ROLE', 'SPECIFIC_USER');

-- CreateEnum
CREATE TYPE "ApprovalTaskStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'INFO_REQUESTED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PolicyRuleType" AS ENUM ('CATEGORY_MAX_PER_ITEM', 'DAILY_MEAL_ALLOWANCE', 'ACCOMMODATION_NIGHTLY_MAX', 'RECEIPT_REQUIRED_ABOVE', 'WEEKEND_EXPENSE', 'PUBLIC_HOLIDAY_EXPENSE', 'DUPLICATE_EXPENSE', 'DUPLICATE_RECEIPT', 'CATEGORY_NOT_ALLOWED', 'UNUSUAL_AMOUNT', 'BUDGET_OVERRUN', 'LATE_SUBMISSION', 'MISSING_DESCRIPTION');

-- CreateEnum
CREATE TYPE "PolicyAction" AS ENUM ('BLOCK', 'WARN', 'REQUIRE_EXCEPTION');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('OPEN', 'EXCEPTION_APPROVED', 'EXCEPTION_REJECTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FxSource" AS ENUM ('ECB', 'MANUAL', 'CORPORATE', 'IDENTITY');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'COMPLETED', 'FAILED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID', 'PARTIALLY_SETTLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "PaymentBatchStatus" AS ENUM ('DRAFT', 'INITIATED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SENT', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ErpFormat" AS ENUM ('GENERIC', 'SAP', 'ORACLE', 'DYNAMICS365', 'SAGE');

-- CreateEnum
CREATE TYPE "BudgetBasis" AS ENUM ('ACTUAL_ONLY', 'ACTUAL_AND_PENDING');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportingCurrency" CHAR(3) NOT NULL,
    "budgetBasis" "BudgetBasis" NOT NULL DEFAULT 'ACTUAL_AND_PENDING',
    "retentionYears" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "code" CHAR(2) NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL,
    "weekendDays" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[],

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "functionalCurrency" CHAR(3) NOT NULL,
    "taxId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "externalId" TEXT,
    "legalEntityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "costCenterId" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "managerId" TEXT,
    "employeeNumber" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDelegation" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMileage" BOOLEAN NOT NULL DEFAULT false,
    "isMeal" BOOLEAN NOT NULL DEFAULT false,
    "isAccommodation" BOOLEAN NOT NULL DEFAULT false,
    "requiresAttendees" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PolicyRuleType" NOT NULL,
    "countryCode" CHAR(2),
    "legalEntityId" TEXT,
    "categoryId" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "currency" CHAR(3),
    "action" "PolicyAction" NOT NULL,
    "severity" "Severity" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MileageRate" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "ratePerKm" DECIMAL(10,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,

    CONSTRAINT "MileageRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "source" "FxSource" NOT NULL,
    "createdById" TEXT,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "countryCode" CHAR(2),
    "legalEntityId" TEXT,
    "departmentId" TEXT,
    "categoryCode" TEXT,
    "projectId" TEXT,
    "costCenterId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "thresholdCurrency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStepDefinition" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverType" "ApproverType" NOT NULL,
    "role" "Role",
    "userId" TEXT,
    "minAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(19,4),
    "requiredOnException" BOOLEAN NOT NULL DEFAULT false,
    "categoryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slaHours" INTEGER NOT NULL DEFAULT 72,
    "escalateToRole" "Role",

    CONSTRAINT "ApprovalStepDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "projectId" TEXT,
    "purpose" TEXT NOT NULL,
    "destinationCountry" CHAR(2) NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "estimatedCost" DECIMAL(19,4),
    "currency" CHAR(3) NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReport" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "tripId" TEXT,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "accountingStatus" "AccountingStatus" NOT NULL DEFAULT 'NOT_READY',
    "currency" CHAR(3) NOT NULL,
    "reportingCurrency" CHAR(3) NOT NULL,
    "totalFunctional" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalReporting" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reimbursableAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "advanceApplied" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "workflowId" TEXT,
    "currentStep" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "accountingPeriod" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "expenseDate" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "grossAmount" DECIMAL(19,4) NOT NULL,
    "taxAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(19,4) NOT NULL,
    "taxRate" DECIMAL(7,4),
    "fxRateFunctional" DECIMAL(20,10) NOT NULL,
    "fxSourceFunctional" "FxSource" NOT NULL,
    "fxDateFunctional" DATE NOT NULL,
    "fxOverridden" BOOLEAN NOT NULL DEFAULT false,
    "fxOverrideReason" TEXT,
    "fxOverrideById" TEXT,
    "functionalAmount" DECIMAL(19,4) NOT NULL,
    "functionalTax" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "fxRateReporting" DECIMAL(20,10) NOT NULL,
    "fxSourceReporting" "FxSource" NOT NULL,
    "reportingAmount" DECIMAL(19,4) NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "projectId" TEXT,
    "budgetCode" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reimbursable" BOOLEAN NOT NULL DEFAULT true,
    "attendees" TEXT,
    "distanceKm" DECIMAL(10,2),
    "vehicleType" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "mileageRate" DECIMAL(10,4),
    "receiptId" TEXT,
    "receiptMissingReason" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "ocrProvider" TEXT,
    "ocrData" JSONB,
    "ocrConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyViolation" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "expenseId" TEXT,
    "ruleId" TEXT,
    "ruleType" "PolicyRuleType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "action" "PolicyAction" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ViolationStatus" NOT NULL DEFAULT 'OPEN',
    "justification" TEXT,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalTask" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverType" "ApproverType" NOT NULL,
    "role" "Role",
    "approverId" TEXT NOT NULL,
    "originalApproverId" TEXT,
    "status" "ApprovalTaskStatus" NOT NULL DEFAULT 'WAITING',
    "activatedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "comment" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalateToRole" "Role",
    "slaHours" INTEGER NOT NULL DEFAULT 72,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportComment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "tripId" TEXT,
    "purpose" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "settledAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceSettlement" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "PaymentBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paymentDate" DATE,
    "createdById" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "bankReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "month" INTEGER,
    "departmentId" TEXT,
    "costCenterId" TEXT,
    "projectId" TEXT,
    "categoryId" TEXT,
    "currency" CHAR(3) NOT NULL,
    "initialAmount" DECIMAL(19,4) NOT NULL,
    "revisedAmount" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "consumption" DECIMAL(9,4) NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAccountingConfig" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "erpFormat" "ErpFormat" NOT NULL DEFAULT 'GENERIC',
    "journalCode" TEXT NOT NULL,
    "employeePayableAccount" TEXT NOT NULL,
    "vatRecoverableAccount" TEXT NOT NULL,
    "advanceAccount" TEXT NOT NULL,
    "bankAccount" TEXT NOT NULL,
    "fxGainAccount" TEXT NOT NULL,
    "fxLossAccount" TEXT NOT NULL,
    "companyCode" TEXT,

    CONSTRAINT "EntityAccountingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "glAccount" TEXT NOT NULL,
    "analyticalAccount" TEXT,
    "vatCode" TEXT,
    "vatDeductiblePct" DECIMAL(5,2) NOT NULL DEFAULT 100,

    CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExport" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "erpFormat" "ErpFormat" NOT NULL,
    "reportCount" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "totalDebit" DECIMAL(19,4) NOT NULL,
    "totalCredit" DECIMAL(19,4) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "documentDate" DATE NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "analyticalAccount" TEXT,
    "costCenter" TEXT,
    "projectCode" TEXT,
    "vatCode" TEXT,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "txnAmount" DECIMAL(19,4),
    "txnCurrency" CHAR(3),
    "employeeRef" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_countryCode_date_key" ON "PublicHoliday"("countryCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_code_key" ON "LegalEntity"("code");

-- CreateIndex
CREATE INDEX "LegalEntity_groupId_idx" ON "LegalEntity"("groupId");

-- CreateIndex
CREATE INDEX "LegalEntity_countryCode_idx" ON "LegalEntity"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_legalEntityId_code_key" ON "BusinessUnit"("legalEntityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_legalEntityId_code_key" ON "Department"("legalEntityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_legalEntityId_code_key" ON "CostCenter"("legalEntityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE INDEX "User_legalEntityId_idx" ON "User"("legalEntityId");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "RoleAssignment_role_scopeType_scopeId_idx" ON "RoleAssignment"("role", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_role_scopeType_scopeId_key" ON "RoleAssignment"("userId", "role", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_fromUserId_startsAt_endsAt_idx" ON "ApprovalDelegation"("fromUserId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_groupId_code_key" ON "ExpenseCategory"("groupId", "code");

-- CreateIndex
CREATE INDEX "PolicyRule_groupId_type_active_idx" ON "PolicyRule"("groupId", "type", "active");

-- CreateIndex
CREATE INDEX "MileageRate_legalEntityId_vehicleType_validFrom_idx" ON "MileageRate"("legalEntityId", "vehicleType", "validFrom");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_quoteCurrency_effectiveDate_idx" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_baseCurrency_quoteCurrency_effectiveDate_sourc_key" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "effectiveDate", "source");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStepDefinition_workflowId_sequence_key" ON "ApprovalStepDefinition"("workflowId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");

-- CreateIndex
CREATE INDEX "Trip_employeeId_idx" ON "Trip"("employeeId");

-- CreateIndex
CREATE INDEX "Trip_legalEntityId_idx" ON "Trip"("legalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseReport_number_key" ON "ExpenseReport"("number");

-- CreateIndex
CREATE INDEX "ExpenseReport_employeeId_status_idx" ON "ExpenseReport"("employeeId", "status");

-- CreateIndex
CREATE INDEX "ExpenseReport_legalEntityId_status_idx" ON "ExpenseReport"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "ExpenseReport_status_submittedAt_idx" ON "ExpenseReport"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Expense_fingerprint_idx" ON "Expense"("fingerprint");

-- CreateIndex
CREATE INDEX "Expense_costCenterId_expenseDate_idx" ON "Expense"("costCenterId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_projectId_idx" ON "Expense"("projectId");

-- CreateIndex
CREATE INDEX "Expense_categoryId_expenseDate_idx" ON "Expense"("categoryId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reportId_lineNo_key" ON "Expense"("reportId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_storageKey_key" ON "Receipt"("storageKey");

-- CreateIndex
CREATE INDEX "Receipt_sha256_idx" ON "Receipt"("sha256");

-- CreateIndex
CREATE INDEX "Receipt_ownerId_idx" ON "Receipt"("ownerId");

-- CreateIndex
CREATE INDEX "PolicyViolation_reportId_idx" ON "PolicyViolation"("reportId");

-- CreateIndex
CREATE INDEX "PolicyViolation_status_severity_idx" ON "PolicyViolation"("status", "severity");

-- CreateIndex
CREATE INDEX "ApprovalTask_approverId_status_idx" ON "ApprovalTask"("approverId", "status");

-- CreateIndex
CREATE INDEX "ApprovalTask_reportId_sequence_idx" ON "ApprovalTask"("reportId", "sequence");

-- CreateIndex
CREATE INDEX "ApprovalTask_status_dueAt_idx" ON "ApprovalTask"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ReportComment_reportId_idx" ON "ReportComment"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Advance_number_key" ON "Advance"("number");

-- CreateIndex
CREATE INDEX "Advance_employeeId_status_idx" ON "Advance"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdvanceSettlement_advanceId_reportId_key" ON "AdvanceSettlement"("advanceId", "reportId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatch_reference_key" ON "PaymentBatch"("reference");

-- CreateIndex
CREATE INDEX "PaymentBatch_legalEntityId_status_idx" ON "PaymentBatch"("legalEntityId", "status");

-- CreateIndex
CREATE INDEX "Payment_reportId_idx" ON "Payment"("reportId");

-- CreateIndex
CREATE INDEX "Budget_legalEntityId_fiscalYear_idx" ON "Budget"("legalEntityId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_legalEntityId_code_fiscalYear_key" ON "Budget"("legalEntityId", "code", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAlert_budgetId_threshold_key" ON "BudgetAlert"("budgetId", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAccountingConfig_legalEntityId_key" ON "EntityAccountingConfig"("legalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_legalEntityId_categoryId_key" ON "AccountMapping"("legalEntityId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_legalEntityId_period_key" ON "AccountingPeriod"("legalEntityId", "period");

-- CreateIndex
CREATE INDEX "AccountingExport_legalEntityId_period_idx" ON "AccountingExport"("legalEntityId", "period");

-- CreateIndex
CREATE INDEX "JournalLine_exportId_idx" ON "JournalLine"("exportId");

-- CreateIndex
CREATE INDEX "JournalLine_reportId_idx" ON "JournalLine"("reportId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_legalEntityId_createdAt_idx" ON "AuditLog"("legalEntityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "Country_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDelegation" ADD CONSTRAINT "ApprovalDelegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MileageRate" ADD CONSTRAINT "MileageRate_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStepDefinition" ADD CONSTRAINT "ApprovalStepDefinition_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReport" ADD CONSTRAINT "ExpenseReport_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PolicyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalTask" ADD CONSTRAINT "ApprovalTask_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalTask" ADD CONSTRAINT "ApprovalTask_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportComment" ADD CONSTRAINT "ReportComment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceSettlement" ADD CONSTRAINT "AdvanceSettlement_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceSettlement" ADD CONSTRAINT "AdvanceSettlement_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAccountingConfig" ADD CONSTRAINT "EntityAccountingConfig_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExport" ADD CONSTRAINT "AccountingExport_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "AccountingExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ExpenseReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────── Database-level controls (defence in depth) ─────────

-- Audit log is append-only: no UPDATE or DELETE, even for the application role.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Monetary invariants
ALTER TABLE "Expense" ADD CONSTRAINT expense_amounts_non_negative
  CHECK ("grossAmount" >= 0 AND "taxAmount" >= 0 AND "netAmount" >= 0);
ALTER TABLE "Expense" ADD CONSTRAINT expense_net_plus_tax_equals_gross
  CHECK ("netAmount" + "taxAmount" = "grossAmount");
ALTER TABLE "Expense" ADD CONSTRAINT expense_fx_positive
  CHECK ("fxRateFunctional" > 0 AND "fxRateReporting" > 0);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT exchange_rate_positive CHECK ("rate" > 0);
ALTER TABLE "Advance" ADD CONSTRAINT advance_settlement_bounds
  CHECK ("amount" > 0 AND "settledAmount" >= 0 AND "settledAmount" <= "amount");
ALTER TABLE "JournalLine" ADD CONSTRAINT journal_line_one_side
  CHECK ("debit" >= 0 AND "credit" >= 0 AND NOT ("debit" > 0 AND "credit" > 0));
ALTER TABLE "Budget" ADD CONSTRAINT budget_month_range CHECK ("month" IS NULL OR "month" BETWEEN 1 AND 12);

-- A report can be in at most one non-cancelled payment at a time (prevents double payment)
CREATE UNIQUE INDEX payment_one_active_per_report ON "Payment" ("reportId") WHERE "status" <> 'FAILED';

-- Fast scoped dashboard aggregation
CREATE INDEX "ExpenseReport_legalEntityId_submittedAt_idx" ON "ExpenseReport" ("legalEntityId", "submittedAt");
