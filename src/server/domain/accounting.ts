import { Decimal, d, roundMoney, sum, type DecimalLike } from "./money";
import { nextPeriod } from "./dates";

export interface EntityAccounts {
  journalCode: string;
  employeePayableAccount: string;
  vatRecoverableAccount: string;
  advanceAccount: string;
  bankAccount: string;
  corporateCardAccount: string;
  fxGainAccount: string;
  fxLossAccount: string;
}

export interface CategoryMapping {
  glAccount: string;
  analyticalAccount: string | null;
  vatCode: string | null;
  vatDeductiblePct: DecimalLike; // 0..100
}

export interface JournalExpenseLine {
  lineNo: number;
  categoryId: string;
  categoryName: string;
  description: string;
  merchant: string;
  functionalAmount: DecimalLike; // gross in functional currency
  functionalTax: DecimalLike; // tax in functional currency
  txnAmount: DecimalLike;
  txnCurrency: string;
  costCenterCode: string;
  projectCode: string | null;
  reimbursable: boolean;
}

export interface JournalReport {
  reportId: string;
  reportNumber: string;
  employeeRef: string;
  currency: string; // functional
  documentDate: Date;
  advanceApplied: DecimalLike;
  lines: JournalExpenseLine[];
}

export interface JournalEntryLine {
  lineNo: number;
  account: string;
  analyticalAccount: string | null;
  costCenter: string | null;
  projectCode: string | null;
  vatCode: string | null;
  description: string;
  debit: Decimal;
  credit: Decimal;
  currency: string;
  txnAmount: Decimal | null;
  txnCurrency: string | null;
  employeeRef: string | null;
}

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

/**
 * Expense recognition journal for one approved report:
 *   Dr Expense GL           (gross − recoverable VAT)   per line, with cost centre / project / analytics
 *   Dr VAT recoverable       (deductible share of VAT)  per line with VAT code
 *   Cr Employee payable      (reimbursable lines)
 *   Cr Corporate card clearing (non-reimbursable lines: corporate card / company paid)
 *   Dr Employee payable / Cr Employee advances (advance settlement)
 * Balanced by construction: every line's debit legs sum exactly to its functional gross.
 */
export function buildExpenseJournal(
  report: JournalReport,
  accounts: EntityAccounts,
  mappingFor: (categoryId: string) => CategoryMapping | undefined,
): JournalEntryLine[] {
  const cur = report.currency;
  const out: JournalEntryLine[] = [];
  let n = 0;
  const push = (l: Omit<JournalEntryLine, "lineNo" | "currency">) => out.push({ ...l, lineNo: ++n, currency: cur });

  let reimbursable = new Decimal(0);
  let corporate = new Decimal(0);

  for (const line of report.lines) {
    const mapping = mappingFor(line.categoryId);
    if (!mapping) throw new AccountingError(`No GL mapping configured for category "${line.categoryName}"`);
    const gross = roundMoney(line.functionalAmount, cur);
    const tax = roundMoney(line.functionalTax, cur);
    const recoverable = roundMoney(tax.times(d(mapping.vatDeductiblePct)).dividedBy(100), cur);
    const expense = gross.minus(recoverable);
    const text = `${report.reportNumber} L${line.lineNo} ${line.merchant}`.slice(0, 60);
    const foreign = line.txnCurrency !== cur;

    push({
      account: mapping.glAccount,
      analyticalAccount: mapping.analyticalAccount,
      costCenter: line.costCenterCode,
      projectCode: line.projectCode,
      vatCode: mapping.vatCode,
      description: text,
      debit: expense,
      credit: new Decimal(0),
      txnAmount: foreign ? d(line.txnAmount) : null,
      txnCurrency: foreign ? line.txnCurrency : null,
      employeeRef: null,
    });
    if (recoverable.greaterThan(0)) {
      push({
        account: accounts.vatRecoverableAccount,
        analyticalAccount: null,
        costCenter: null,
        projectCode: null,
        vatCode: mapping.vatCode,
        description: `VAT ${text}`.slice(0, 60),
        debit: recoverable,
        credit: new Decimal(0),
        txnAmount: null,
        txnCurrency: null,
        employeeRef: null,
      });
    }
    if (line.reimbursable) reimbursable = reimbursable.plus(gross);
    else corporate = corporate.plus(gross);
  }

  if (reimbursable.greaterThan(0)) {
    push({
      account: accounts.employeePayableAccount,
      analyticalAccount: null,
      costCenter: null,
      projectCode: null,
      vatCode: null,
      description: `${report.reportNumber} employee payable`,
      debit: new Decimal(0),
      credit: reimbursable,
      txnAmount: null,
      txnCurrency: null,
      employeeRef: report.employeeRef,
    });
  }
  if (corporate.greaterThan(0)) {
    push({
      account: accounts.corporateCardAccount,
      analyticalAccount: null,
      costCenter: null,
      projectCode: null,
      vatCode: null,
      description: `${report.reportNumber} corporate card / company paid`,
      debit: new Decimal(0),
      credit: corporate,
      txnAmount: null,
      txnCurrency: null,
      employeeRef: report.employeeRef,
    });
  }

  const advance = roundMoney(report.advanceApplied, cur);
  if (advance.greaterThan(0)) {
    push({
      account: accounts.employeePayableAccount,
      analyticalAccount: null,
      costCenter: null,
      projectCode: null,
      vatCode: null,
      description: `${report.reportNumber} advance settlement`,
      debit: advance,
      credit: new Decimal(0),
      txnAmount: null,
      txnCurrency: null,
      employeeRef: report.employeeRef,
    });
    push({
      account: accounts.advanceAccount,
      analyticalAccount: null,
      costCenter: null,
      projectCode: null,
      vatCode: null,
      description: `${report.reportNumber} advance settlement`,
      debit: new Decimal(0),
      credit: advance,
      txnAmount: null,
      txnCurrency: null,
      employeeRef: report.employeeRef,
    });
  }

  assertBalanced(out);
  return out;
}

/** Reimbursement payment journal: Dr Employee payable / Cr Bank. */
export function buildPaymentJournal(
  p: { reportNumber: string; employeeRef: string; amount: DecimalLike; currency: string; bankReference: string | null },
  accounts: EntityAccounts,
): JournalEntryLine[] {
  const amt = roundMoney(p.amount, p.currency);
  if (amt.lessThanOrEqualTo(0)) return [];
  const base = { analyticalAccount: null, costCenter: null, projectCode: null, vatCode: null, currency: p.currency, txnAmount: null, txnCurrency: null };
  const text = `${p.reportNumber} reimbursement ${p.bankReference ?? ""}`.trim();
  const out: JournalEntryLine[] = [
    { ...base, lineNo: 1, account: accounts.employeePayableAccount, description: text, debit: amt, credit: new Decimal(0), employeeRef: p.employeeRef },
    { ...base, lineNo: 2, account: accounts.bankAccount, description: text, debit: new Decimal(0), credit: amt, employeeRef: null },
  ];
  assertBalanced(out);
  return out;
}

export function assertBalanced(lines: JournalEntryLine[]): void {
  const dr = sum(lines.map((l) => l.debit));
  const cr = sum(lines.map((l) => l.credit));
  if (!dr.equals(cr)) throw new AccountingError(`Unbalanced journal: debit ${dr.toFixed(4)} ≠ credit ${cr.toFixed(4)}`);
}

/**
 * Accounting period validation: post in the period of the document date when open,
 * otherwise in the next open period (standard practice for late approvals).
 */
export function resolvePostingPeriod(
  documentPeriod: string,
  periods: { period: string; status: "OPEN" | "CLOSED" }[],
  maxLookahead = 12,
): string {
  const status = new Map(periods.map((p) => [p.period, p.status]));
  let p = documentPeriod;
  for (let i = 0; i <= maxLookahead; i++) {
    if (status.get(p) !== "CLOSED") return p; // unknown periods are treated as open
    p = nextPeriod(p);
  }
  throw new AccountingError(`No open accounting period found from ${documentPeriod}`);
}
