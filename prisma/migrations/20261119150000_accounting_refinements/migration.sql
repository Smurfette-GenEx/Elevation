-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('EXPENSES', 'PAYMENTS');

-- AlterTable
ALTER TABLE "AccountingExport" ADD COLUMN     "kind" "ExportKind" NOT NULL DEFAULT 'EXPENSES';

-- AlterTable
ALTER TABLE "EntityAccountingConfig" ADD COLUMN     "corporateCardAccount" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "nights" INTEGER;

-- AlterTable
ALTER TABLE "ExpenseReport" ADD COLUMN     "paymentExportedAt" TIMESTAMP(3);

