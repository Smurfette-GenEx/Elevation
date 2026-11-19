import { isoDate } from "./dates";

export type ErpFormat = "GENERIC" | "SAP" | "ORACLE" | "DYNAMICS365" | "SAGE";

export interface ExportLine {
  entityCode: string;
  companyCode: string | null;
  journalCode: string;
  period: string;
  documentDate: Date;
  documentNumber: string;
  lineNo: number;
  account: string;
  analyticalAccount: string | null;
  costCenter: string | null;
  projectCode: string | null;
  vatCode: string | null;
  description: string;
  debit: string;
  credit: string;
  currency: string;
  txnAmount: string | null;
  txnCurrency: string | null;
  employeeRef: string | null;
}

export interface Layout {
  headers: string[];
  row: (l: ExportLine) => (string | number | null)[];
}

const signed = (l: ExportLine) => (Number(l.debit) > 0 ? l.debit : `-${l.credit}`);

/**
 * Column layouts for common ERP import templates. They follow the field semantics of
 * each ERP's standard journal import (SAP FI document upload, Oracle GL_INTERFACE,
 * D365 general journal entity, Sage journal import) and are meant to be adapted to the
 * customer's exact template during implementation.
 */
export const LAYOUTS: Record<ErpFormat, Layout> = {
  GENERIC: {
    headers: ["Entity", "Journal", "Period", "DocumentDate", "Document", "Line", "Account", "Analytical", "CostCenter", "Project", "VATCode", "Description", "Debit", "Credit", "Currency", "TxnAmount", "TxnCurrency", "EmployeeRef"],
    row: (l) => [l.entityCode, l.journalCode, l.period, isoDate(l.documentDate), l.documentNumber, l.lineNo, l.account, l.analyticalAccount, l.costCenter, l.projectCode, l.vatCode, l.description, l.debit, l.credit, l.currency, l.txnAmount, l.txnCurrency, l.employeeRef],
  },
  SAP: {
    headers: ["BUKRS", "BLART", "BUDAT", "BLDAT", "MONAT", "XBLNR", "BUZEI", "HKONT", "SHKZG", "WRBTR", "WAERS", "KOSTL", "PS_POSID", "MWSKZ", "SGTXT", "PERNR"],
    row: (l) => [l.companyCode ?? l.entityCode, l.journalCode, isoDate(l.documentDate).replaceAll("-", ""), isoDate(l.documentDate).replaceAll("-", ""), l.period.slice(5), l.documentNumber, l.lineNo, l.account, Number(l.debit) > 0 ? "S" : "H", Number(l.debit) > 0 ? l.debit : l.credit, l.currency, l.costCenter, l.projectCode, l.vatCode, l.description, l.employeeRef],
  },
  ORACLE: {
    headers: ["LEDGER_NAME", "ACCOUNTING_DATE", "USER_JE_SOURCE_NAME", "USER_JE_CATEGORY_NAME", "CURRENCY_CODE", "SEGMENT1", "SEGMENT2", "SEGMENT3", "SEGMENT4", "ENTERED_DR", "ENTERED_CR", "REFERENCE1", "REFERENCE10", "PERIOD_NAME"],
    row: (l) => [l.entityCode, isoDate(l.documentDate), "Expenses", l.journalCode, l.currency, l.companyCode ?? l.entityCode, l.account, l.costCenter, l.projectCode, Number(l.debit) > 0 ? l.debit : null, Number(l.credit) > 0 ? l.credit : null, l.documentNumber, l.description, l.period],
  },
  DYNAMICS365: {
    headers: ["JOURNALNAME", "TRANSDATE", "VOUCHER", "LINENUM", "ACCOUNTTYPE", "ACCOUNTDISPLAYVALUE", "DEBITAMOUNT", "CREDITAMOUNT", "CURRENCYCODE", "TAXITEMGROUP", "TEXT", "DEFAULTDIMENSIONDISPLAYVALUE", "DATAAREAID"],
    row: (l) => [l.journalCode, isoDate(l.documentDate), l.documentNumber, l.lineNo, "Ledger", [l.account, l.costCenter, l.projectCode].filter(Boolean).join("-"), Number(l.debit) > 0 ? l.debit : "0", Number(l.credit) > 0 ? l.credit : "0", l.currency, l.vatCode, l.description, [l.costCenter, l.projectCode].filter(Boolean).join("-"), l.companyCode ?? l.entityCode],
  },
  SAGE: {
    headers: ["JournalCode", "Date", "Account", "Reference", "Label", "Debit", "Credit", "Analytical", "Currency", "Amount"],
    row: (l) => [l.journalCode, isoDate(l.documentDate).split("-").reverse().join("/"), l.account, l.documentNumber, l.description, l.debit, l.credit, l.analyticalAccount ?? l.costCenter, l.currency, signed(l)],
  },
};
