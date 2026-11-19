/**
 * Demo seed for a fictional multinational group ("Atlas Group").
 * Historical activity is generated THROUGH THE REAL SERVICES (submission, policy engine,
 * approval routing, exception decisions, payments) so the demo data obeys the same
 * business rules as production usage.
 *
 * Usage: npm run db:seed   (expects an empty, migrated database)
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Role, ScopeType } from "@prisma/client";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth/credentials";
import type { Actor } from "../src/server/auth/scope";
import { sha256 } from "../src/server/domain/duplicates";
import { storage } from "../src/server/infra/storage";
import { createReport, saveExpenseLine, submitReport, previewPolicies, respondToInfoRequest } from "../src/server/services/report-service";
import { decideTask, decideException } from "../src/server/services/approval-service";
import { roleHoldersForEntity } from "../src/server/services/routing-service";
import { createBatch, initiateBatch, completeBatch } from "../src/server/services/payment-service";
import { requestAdvance, decideAdvance, markAdvancePaid, createTrip } from "../src/server/services/advance-service";
import type { ExpenseLineInput } from "../src/server/validation";

const PASSWORD = "Expense!2026demo";
const TODAY = new Date();
const YEAR = TODAY.getUTCFullYear();

// Deterministic PRNG so every seed produces the same dataset
let seedState = 20260101;
const rand = () => {
  seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  if (await prisma.group.count()) {
    console.error("Database already seeded. Reset it first (npm run db:reset).");
    process.exit(1);
  }
  console.time("seed");

  // ───────────── Group & countries ─────────────
  const group = await prisma.group.create({ data: { name: "Atlas Group", reportingCurrency: "EUR", budgetBasis: "ACTUAL_AND_PENDING" } });
  const countries = [
    { code: "FR", name: "France", defaultCurrency: "EUR", weekendDays: [0, 6] },
    { code: "GB", name: "United Kingdom", defaultCurrency: "GBP", weekendDays: [0, 6] },
    { code: "US", name: "United States", defaultCurrency: "USD", weekendDays: [0, 6] },
    { code: "MA", name: "Morocco", defaultCurrency: "MAD", weekendDays: [0, 6] },
    { code: "AE", name: "United Arab Emirates", defaultCurrency: "AED", weekendDays: [0, 6] },
    { code: "DE", name: "Germany", defaultCurrency: "EUR", weekendDays: [0, 6] },
  ];
  await prisma.country.createMany({ data: countries.map((c) => ({ ...c, groupId: group.id })) });

  const holidays: Record<string, [string, string][]> = {
    FR: [["01-01", "Jour de l'an"], ["04-06", "Lundi de Pâques"], ["05-01", "Fête du Travail"], ["05-08", "Victoire 1945"], ["05-14", "Ascension"], ["05-25", "Lundi de Pentecôte"], ["07-14", "Fête nationale"], ["08-15", "Assomption"], ["11-01", "Toussaint"], ["11-11", "Armistice"], ["12-25", "Noël"]],
    GB: [["01-01", "New Year's Day"], ["04-03", "Good Friday"], ["04-06", "Easter Monday"], ["05-04", "Early May bank holiday"], ["05-25", "Spring bank holiday"], ["08-31", "Summer bank holiday"], ["12-25", "Christmas Day"], ["12-28", "Boxing Day (substitute)"]],
    US: [["01-01", "New Year's Day"], ["01-19", "Martin Luther King Jr. Day"], ["02-16", "Presidents' Day"], ["05-25", "Memorial Day"], ["06-19", "Juneteenth"], ["07-03", "Independence Day (observed)"], ["09-07", "Labor Day"], ["11-26", "Thanksgiving"], ["12-25", "Christmas Day"]],
    MA: [["01-01", "Nouvel an"], ["01-11", "Manifeste de l'indépendance"], ["05-01", "Fête du travail"], ["07-30", "Fête du Trône"], ["08-14", "Oued Eddahab"], ["08-20", "Révolution du Roi et du Peuple"], ["08-21", "Fête de la jeunesse"], ["11-06", "Marche verte"], ["11-18", "Fête de l'indépendance"]],
    AE: [["01-01", "New Year's Day"], ["12-02", "National Day"], ["12-03", "National Day"]],
    DE: [["01-01", "Neujahr"], ["04-03", "Karfreitag"], ["04-06", "Ostermontag"], ["05-01", "Tag der Arbeit"], ["10-03", "Tag der Deutschen Einheit"], ["12-25", "Weihnachten"]],
  };
  await prisma.publicHoliday.createMany({ data: Object.entries(holidays).flatMap(([cc, list]) => list.map(([md, name]) => ({ countryCode: cc, date: new Date(`${YEAR}-${md}T00:00:00Z`), name }))) });

  // ───────────── FX rates: EUR-based business-day series (ECB-like) ─────────────
  const base: Record<string, number> = { USD: 1.085, GBP: 0.845, MAD: 10.82, AED: 3.985, CHF: 0.94, JPY: 162.5, CAD: 1.49 };
  const fxRows: { baseCurrency: string; quoteCurrency: string; rate: string; effectiveDate: Date; source: "ECB" }[] = [];
  for (let t = Date.UTC(YEAR - 1, 11, 1); t <= TODAY.getTime(); t += 86400_000) {
    const day = new Date(t);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    for (const [cur, r] of Object.entries(base)) {
      base[cur] = r * (1 + (rand() - 0.5) * 0.006);
      fxRows.push({ baseCurrency: "EUR", quoteCurrency: cur, rate: base[cur].toFixed(cur === "JPY" ? 3 : 5), effectiveDate: day, source: "ECB" });
    }
  }
  await prisma.exchangeRate.createMany({ data: fxRows });

  // ───────────── Legal entities & organisation ─────────────
  const entityDefs = [
    { code: "FR01", name: "Atlas France SAS", countryCode: "FR", functionalCurrency: "EUR", taxId: "FR12345678901" },
    { code: "UK01", name: "Atlas UK Ltd", countryCode: "GB", functionalCurrency: "GBP", taxId: "GB123456789" },
    { code: "US01", name: "Atlas Americas Inc.", countryCode: "US", functionalCurrency: "USD", taxId: "12-3456789" },
    { code: "MA01", name: "Atlas Maroc SARL", countryCode: "MA", functionalCurrency: "MAD", taxId: "IF-40123456" },
    { code: "AE01", name: "Atlas Middle East FZ-LLC", countryCode: "AE", functionalCurrency: "AED", taxId: "TRN100123456700003" },
  ];
  const E: Record<string, { id: string; code: string; countryCode: string; functionalCurrency: string }> = {};
  const D: Record<string, string> = {}; // "FR01:SALES" -> department id
  const CC: Record<string, string> = {}; // "FR01:CC-SAL" -> cost center id
  const deptDefs = [
    { code: "SALES", name: "Sales", cc: "SAL" },
    { code: "ENG", name: "Engineering", cc: "ENG" },
    { code: "FIN", name: "Finance & Administration", cc: "FIN" },
    { code: "MKT", name: "Marketing", cc: "MKT" },
  ];
  for (const def of entityDefs) {
    const e = await prisma.legalEntity.create({ data: { ...def, groupId: group.id } });
    E[def.code] = e;
    const bu = await prisma.businessUnit.create({ data: { legalEntityId: e.id, code: "CORE", name: "Core business" } });
    for (const dd of deptDefs) {
      const dept = await prisma.department.create({ data: { legalEntityId: e.id, businessUnitId: bu.id, code: dd.code, name: dd.name } });
      D[`${def.code}:${dd.code}`] = dept.id;
      const cc = await prisma.costCenter.create({ data: { legalEntityId: e.id, departmentId: dept.id, code: `${def.code.slice(0, 2)}-${dd.cc}-100`, name: `${dd.name} ${def.code}` } });
      CC[`${def.code}:${dd.cc}`] = cc.id;
    }
  }
  const projects = {
    ORION: await prisma.project.create({ data: { groupId: group.id, code: "PRJ-ORION", name: "Orion ERP rollout" } }),
    NOVA: await prisma.project.create({ data: { groupId: group.id, legalEntityId: E.FR01.id, code: "PRJ-NOVA", name: "Nova client programme (FR)" } }),
    ATLANTIC: await prisma.project.create({ data: { groupId: group.id, legalEntityId: E.US01.id, code: "PRJ-ATLANTIC", name: "Atlantic expansion (US)" } }),
  };

  // ───────────── Categories ─────────────
  const catDefs = [
    { code: "TRAVEL", name: "Business Travel" },
    { code: "HOTEL", name: "Accommodation", isAccommodation: true },
    { code: "AIR", name: "Airfare" },
    { code: "TRANSPORT", name: "Transportation (taxi, train, parking)" },
    { code: "FUEL", name: "Fuel" },
    { code: "MILEAGE", name: "Mileage", isMileage: true },
    { code: "MEALS", name: "Meals", isMeal: true },
    { code: "CLIENT_ENT", name: "Client Entertainment", isMeal: true, requiresAttendees: true },
    { code: "OFFICE", name: "Office Supplies" },
    { code: "TELECOM", name: "Telecommunications" },
    { code: "TRAINING", name: "Training" },
    { code: "SOFTWARE", name: "Software and Subscriptions" },
    { code: "PRO_SERVICES", name: "Professional Services" },
    { code: "OTHER", name: "Other Expenses" },
  ];
  const C: Record<string, { id: string; name: string }> = {};
  for (const [i, c] of catDefs.entries()) C[c.code] = await prisma.expenseCategory.create({ data: { groupId: group.id, sortOrder: i, ...c } });

  // ───────────── Accounting configuration (different charts of accounts per entity) ─────────────
  const charts: Record<string, { cfg: Record<string, string>; erp: "SAP" | "SAGE" | "ORACLE" | "DYNAMICS365" | "GENERIC"; map: Record<string, [string, string | null, number]> }> = {
    FR01: {
      erp: "SAGE",
      cfg: { journalCode: "NDF", employeePayableAccount: "421000", vatRecoverableAccount: "445660", advanceAccount: "425000", bankAccount: "512000", corporateCardAccount: "467100", fxGainAccount: "766000", fxLossAccount: "666000" },
      map: { TRAVEL: ["625100", "FR-V20", 100], HOTEL: ["625600", "FR-V10", 0], AIR: ["625100", "FR-V00", 0], TRANSPORT: ["625100", "FR-V10", 100], FUEL: ["606140", "FR-V20", 80], MILEAGE: ["625110", null, 0], MEALS: ["625700", "FR-V10", 100], CLIENT_ENT: ["625710", "FR-V10", 100], OFFICE: ["606400", "FR-V20", 100], TELECOM: ["626000", "FR-V20", 100], TRAINING: ["618500", "FR-V20", 100], SOFTWARE: ["651100", "FR-V20", 100], PRO_SERVICES: ["622600", "FR-V20", 100], OTHER: ["628100", "FR-V20", 100] },
    },
    UK01: {
      erp: "DYNAMICS365",
      cfg: { journalCode: "EXP", employeePayableAccount: "2210", vatRecoverableAccount: "2202", advanceAccount: "1150", bankAccount: "1200", corporateCardAccount: "2215", fxGainAccount: "7900", fxLossAccount: "7905" },
      map: { TRAVEL: ["7400", "T1", 100], HOTEL: ["7410", "T1", 100], AIR: ["7400", "T0", 0], TRANSPORT: ["7400", "T0", 0], FUEL: ["7300", "T1", 100], MILEAGE: ["7305", null, 0], MEALS: ["7402", "T1", 100], CLIENT_ENT: ["7403", "T9", 0], OFFICE: ["7500", "T1", 100], TELECOM: ["7550", "T1", 100], TRAINING: ["7610", "T1", 100], SOFTWARE: ["7620", "T1", 100], PRO_SERVICES: ["7600", "T1", 100], OTHER: ["8200", "T1", 100] },
    },
    US01: {
      erp: "ORACLE",
      cfg: { journalCode: "T&E", employeePayableAccount: "21500", vatRecoverableAccount: "14300", advanceAccount: "13200", bankAccount: "10100", corporateCardAccount: "21510", fxGainAccount: "79100", fxLossAccount: "79200" },
      map: { TRAVEL: ["64100", null, 0], HOTEL: ["64110", null, 0], AIR: ["64120", null, 0], TRANSPORT: ["64130", null, 0], FUEL: ["64140", null, 0], MILEAGE: ["64150", null, 0], MEALS: ["64200", null, 0], CLIENT_ENT: ["64210", null, 0], OFFICE: ["65100", null, 0], TELECOM: ["65200", null, 0], TRAINING: ["66100", null, 0], SOFTWARE: ["65300", null, 0], PRO_SERVICES: ["67100", null, 0], OTHER: ["69900", null, 0] },
    },
    MA01: {
      erp: "SAP",
      cfg: { journalCode: "KR", employeePayableAccount: "4432000", vatRecoverableAccount: "3455200", advanceAccount: "3431000", bankAccount: "5141000", corporateCardAccount: "4488000", fxGainAccount: "7331000", fxLossAccount: "6331000" },
      map: { TRAVEL: ["6143100", "V1", 100], HOTEL: ["6143200", "V0", 0], AIR: ["6143100", "V0", 0], TRANSPORT: ["6143300", "V1", 100], FUEL: ["6122500", "V0", 0], MILEAGE: ["6143400", null, 0], MEALS: ["6143600", "V0", 0], CLIENT_ENT: ["6143700", "V0", 0], OFFICE: ["6125200", "V1", 100], TELECOM: ["6145500", "V1", 100], TRAINING: ["6148100", "V1", 100], SOFTWARE: ["6135100", "V1", 100], PRO_SERVICES: ["6136100", "V1", 100], OTHER: ["6185000", "V1", 100] },
    },
    AE01: {
      erp: "GENERIC",
      cfg: { journalCode: "EXP", employeePayableAccount: "2300", vatRecoverableAccount: "1450", advanceAccount: "1350", bankAccount: "1100", corporateCardAccount: "2310", fxGainAccount: "4900", fxLossAccount: "5900" },
      map: { TRAVEL: ["6100", "SR", 100], HOTEL: ["6110", "SR", 100], AIR: ["6120", "ZR", 0], TRANSPORT: ["6130", "EX", 0], FUEL: ["6140", "SR", 100], MILEAGE: ["6150", null, 0], MEALS: ["6200", "SR", 100], CLIENT_ENT: ["6210", "BL", 0], OFFICE: ["6300", "SR", 100], TELECOM: ["6400", "SR", 100], TRAINING: ["6500", "SR", 100], SOFTWARE: ["6600", "SR", 100], PRO_SERVICES: ["6700", "SR", 100], OTHER: ["6900", "SR", 100] },
    },
  };
  for (const [code, chart] of Object.entries(charts)) {
    await prisma.entityAccountingConfig.create({ data: { legalEntityId: E[code].id, erpFormat: chart.erp, companyCode: code === "MA01" ? "MA10" : code, ...(chart.cfg as { journalCode: string; employeePayableAccount: string; vatRecoverableAccount: string; advanceAccount: string; bankAccount: string; corporateCardAccount: string; fxGainAccount: string; fxLossAccount: string }) } });
    await prisma.accountMapping.createMany({
      data: Object.entries(chart.map).map(([cat, [gl, vat, pct]]) => ({ legalEntityId: E[code].id, categoryId: C[cat].id, glAccount: gl, analyticalAccount: cat.slice(0, 4), vatCode: vat, vatDeductiblePct: pct })),
    });
    // Close periods older than 2 months to demonstrate posting into the next open period
    for (let m = 1; m <= TODAY.getUTCMonth() - 1; m++) {
      await prisma.accountingPeriod.create({ data: { legalEntityId: E[code].id, period: `${YEAR}-${String(m).padStart(2, "0")}`, status: "CLOSED", closedAt: new Date() } });
    }
  }

  // ───────────── Mileage rates ─────────────
  await prisma.mileageRate.createMany({
    data: [
      { legalEntityId: E.FR01.id, vehicleType: "CAR", ratePerKm: "0.636", currency: "EUR", validFrom: new Date(`${YEAR}-01-01`) },
      { legalEntityId: E.FR01.id, vehicleType: "MOTORBIKE", ratePerKm: "0.395", currency: "EUR", validFrom: new Date(`${YEAR}-01-01`) },
      { legalEntityId: E.UK01.id, vehicleType: "CAR", ratePerKm: "0.28", currency: "GBP", validFrom: new Date(`${YEAR}-01-01`) },
      { legalEntityId: E.US01.id, vehicleType: "CAR", ratePerKm: "0.435", currency: "USD", validFrom: new Date(`${YEAR}-01-01`) },
      { legalEntityId: E.MA01.id, vehicleType: "CAR", ratePerKm: "3.00", currency: "MAD", validFrom: new Date(`${YEAR}-01-01`) },
      { legalEntityId: E.AE01.id, vehicleType: "CAR", ratePerKm: "1.20", currency: "AED", validFrom: new Date(`${YEAR}-01-01`) },
    ],
  });

  // ───────────── Policy rules ─────────────
  type RuleDef = { name: string; type: string; action: string; severity: string; params?: object; currency?: string | null; categoryId?: string; legalEntityId?: string; countryCode?: string; priority?: number };
  const rule = (r: RuleDef) => Object.assign({ groupId: group.id, params: {}, currency: "EUR" as string | null }, r);
  await prisma.policyRule.createMany({
    data: [
      rule({ name: "Receipt mandatory above 25 EUR", type: "RECEIPT_REQUIRED_ABOVE", action: "BLOCK", severity: "HIGH", params: { threshold: 25 } }),
      rule({ name: "UK receipt threshold", type: "RECEIPT_REQUIRED_ABOVE", action: "BLOCK", severity: "HIGH", params: { threshold: 20 }, currency: "GBP", legalEntityId: E.UK01.id }),
      rule({ name: "Daily meal allowance", type: "DAILY_MEAL_ALLOWANCE", action: "REQUIRE_EXCEPTION", severity: "MEDIUM", params: { maxAmount: 75 } }),
      rule({ name: "US daily meal allowance", type: "DAILY_MEAL_ALLOWANCE", action: "REQUIRE_EXCEPTION", severity: "MEDIUM", params: { maxAmount: 95 }, currency: "USD", legalEntityId: E.US01.id }),
      rule({ name: "Hotel nightly cap", type: "ACCOMMODATION_NIGHTLY_MAX", action: "REQUIRE_EXCEPTION", severity: "MEDIUM", params: { maxAmount: 180 } }),
      rule({ name: "UK hotel nightly cap", type: "ACCOMMODATION_NIGHTLY_MAX", action: "REQUIRE_EXCEPTION", severity: "MEDIUM", params: { maxAmount: 210 }, currency: "GBP", legalEntityId: E.UK01.id }),
      rule({ name: "Client entertainment per event", type: "CATEGORY_MAX_PER_ITEM", action: "REQUIRE_EXCEPTION", severity: "HIGH", params: { maxAmount: 500 }, categoryId: C.CLIENT_ENT.id }),
      rule({ name: "Office supplies per purchase", type: "CATEGORY_MAX_PER_ITEM", action: "WARN", severity: "LOW", params: { maxAmount: 250 }, categoryId: C.OFFICE.id }),
      rule({ name: "Weekend expense", type: "WEEKEND_EXPENSE", action: "WARN", severity: "LOW" }),
      rule({ name: "Public holiday expense", type: "PUBLIC_HOLIDAY_EXPENSE", action: "WARN", severity: "LOW" }),
      rule({ name: "Duplicate expense", type: "DUPLICATE_EXPENSE", action: "REQUIRE_EXCEPTION", severity: "HIGH" }),
      rule({ name: "Duplicate receipt document", type: "DUPLICATE_RECEIPT", action: "BLOCK", severity: "CRITICAL" }),
      rule({ name: "Unusual amount vs category average", type: "UNUSUAL_AMOUNT", action: "WARN", severity: "MEDIUM", params: { multiplier: 3, minSamples: 8 } }),
      rule({ name: "Budget overrun", type: "BUDGET_OVERRUN", action: "REQUIRE_EXCEPTION", severity: "HIGH" }),
      rule({ name: "Late submission (> 90 days)", type: "LATE_SUBMISSION", action: "WARN", severity: "MEDIUM", params: { maxDaysAfter: 90 } }),
      rule({ name: "Business purpose required", type: "MISSING_DESCRIPTION", action: "BLOCK", severity: "LOW", params: { minLength: 5 } }),
      rule({ name: "Software must go through procurement (MA)", type: "CATEGORY_NOT_ALLOWED", action: "BLOCK", severity: "MEDIUM", categoryId: C.SOFTWARE.id, legalEntityId: E.MA01.id }),
    ] as never,
  });

  // ───────────── Users ─────────────
  const pw = await hashPassword(PASSWORD);
  type UDef = { key: string; name: string; entity: string; dept: string; cc: string; manager?: string; roles: [Role, ScopeType, string | null][]; emp?: string };
  const users: UDef[] = [
    { key: "admin", name: "Sam Okafor", entity: "FR01", dept: "FIN", cc: "FIN", roles: [["SYSTEM_ADMIN", "GROUP", null]] },
    { key: "ceo", name: "Antoine Royer", entity: "FR01", dept: "FIN", cc: "FIN", roles: [["LINE_MANAGER", "GROUP", null], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "cfo", name: "Hélène Marchand", entity: "FR01", dept: "FIN", cc: "FIN", manager: "ceo", roles: [["CFO", "GROUP", null], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "groupfin", name: "Daniel Weiss", entity: "FR01", dept: "FIN", cc: "FIN", manager: "cfo", roles: [["GROUP_FINANCE", "GROUP", null], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "fc.fr", name: "Nadia Benali", entity: "FR01", dept: "FIN", cc: "FIN", manager: "groupfin", roles: [["FINANCE_CONTROLLER", "LEGAL_ENTITY", "FR01"], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "fin.fr", name: "Julien Robert", entity: "FR01", dept: "FIN", cc: "FIN", manager: "fc.fr", roles: [["LOCAL_FINANCE", "LEGAL_ENTITY", "FR01"], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "dm.sales.fr", name: "Marc Lefèvre", entity: "FR01", dept: "SALES", cc: "SAL", manager: "cfo", roles: [["DEPARTMENT_MANAGER", "DEPARTMENT", "FR01:SALES"], ["LINE_MANAGER", "LEGAL_ENTITY", "FR01"], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "manager.fr", name: "Claire Dubois", entity: "FR01", dept: "SALES", cc: "SAL", manager: "dm.sales.fr", roles: [["LINE_MANAGER", "LEGAL_ENTITY", "FR01"], ["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "employee.fr", name: "Lucas Martin", entity: "FR01", dept: "SALES", cc: "SAL", manager: "manager.fr", roles: [["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "employee2.fr", name: "Inès Garcia", entity: "FR01", dept: "ENG", cc: "ENG", manager: "manager.fr", roles: [["EMPLOYEE", "LEGAL_ENTITY", "FR01"]] },
    { key: "fc.uk", name: "Oliver Bennett", entity: "UK01", dept: "FIN", cc: "FIN", manager: "groupfin", roles: [["FINANCE_CONTROLLER", "LEGAL_ENTITY", "UK01"], ["LOCAL_FINANCE", "LEGAL_ENTITY", "UK01"], ["EMPLOYEE", "LEGAL_ENTITY", "UK01"]] },
    { key: "manager.uk", name: "Priya Shah", entity: "UK01", dept: "MKT", cc: "MKT", manager: "cfo", roles: [["LINE_MANAGER", "LEGAL_ENTITY", "UK01"], ["EMPLOYEE", "LEGAL_ENTITY", "UK01"]] },
    { key: "employee.uk", name: "James Carter", entity: "UK01", dept: "MKT", cc: "MKT", manager: "manager.uk", roles: [["EMPLOYEE", "LEGAL_ENTITY", "UK01"]] },
    { key: "fc.us", name: "Maria Lopez", entity: "US01", dept: "FIN", cc: "FIN", manager: "groupfin", roles: [["FINANCE_CONTROLLER", "LEGAL_ENTITY", "US01"], ["LOCAL_FINANCE", "LEGAL_ENTITY", "US01"], ["EMPLOYEE", "LEGAL_ENTITY", "US01"]] },
    { key: "manager.us", name: "Ethan Brooks", entity: "US01", dept: "SALES", cc: "SAL", manager: "cfo", roles: [["LINE_MANAGER", "LEGAL_ENTITY", "US01"], ["EMPLOYEE", "LEGAL_ENTITY", "US01"]] },
    { key: "employee.us", name: "Ava Thompson", entity: "US01", dept: "SALES", cc: "SAL", manager: "manager.us", roles: [["EMPLOYEE", "LEGAL_ENTITY", "US01"]] },
    { key: "fc.ma", name: "Youssef El Amrani", entity: "MA01", dept: "FIN", cc: "FIN", manager: "groupfin", roles: [["FINANCE_CONTROLLER", "COUNTRY", "MA"], ["LOCAL_FINANCE", "LEGAL_ENTITY", "MA01"], ["EMPLOYEE", "LEGAL_ENTITY", "MA01"]] },
    { key: "manager.ma", name: "Salma Idrissi", entity: "MA01", dept: "ENG", cc: "ENG", manager: "cfo", roles: [["LINE_MANAGER", "LEGAL_ENTITY", "MA01"], ["EMPLOYEE", "LEGAL_ENTITY", "MA01"]] },
    { key: "employee.ma", name: "Karim Tazi", entity: "MA01", dept: "ENG", cc: "ENG", manager: "manager.ma", roles: [["EMPLOYEE", "LEGAL_ENTITY", "MA01"]] },
    { key: "manager.ae", name: "Omar Haddad", entity: "AE01", dept: "SALES", cc: "SAL", manager: "cfo", roles: [["LINE_MANAGER", "LEGAL_ENTITY", "AE01"], ["FINANCE_CONTROLLER", "LEGAL_ENTITY", "AE01"], ["LOCAL_FINANCE", "LEGAL_ENTITY", "AE01"], ["EMPLOYEE", "LEGAL_ENTITY", "AE01"]] },
    { key: "employee.ae", name: "Layla Nasser", entity: "AE01", dept: "SALES", cc: "SAL", manager: "manager.ae", roles: [["EMPLOYEE", "LEGAL_ENTITY", "AE01"]] },
  ];
  const U: Record<string, { id: string }> = {};
  for (const [i, u] of users.entries()) {
    const ent = E[u.entity];
    U[u.key] = await prisma.user.create({
      data: {
        groupId: group.id, email: `${u.key}@atlas-group.example`, name: u.name, passwordHash: pw, legalEntityId: ent.id, departmentId: D[`${u.entity}:${u.dept}`],
        costCenterId: CC[`${u.entity}:${u.cc}`], countryCode: ent.countryCode, employeeNumber: `E${String(1000 + i)}`, locale: ent.countryCode === "US" ? "en-US" : ent.countryCode === "FR" ? "fr-FR" : "en-GB",
      },
    });
  }
  for (const u of users) {
    if (u.manager) await prisma.user.update({ where: { id: U[u.key].id }, data: { managerId: U[u.manager].id } });
    await prisma.roleAssignment.createMany({
      data: u.roles.map(([role, scopeType, scope]) => ({
        userId: U[u.key].id, role, scopeType,
        scopeId: scopeType === "LEGAL_ENTITY" ? E[scope!].id : scopeType === "DEPARTMENT" ? D[scope!] : scope,
      })),
    });
  }
  // Department managers
  for (const code of Object.keys(E)) {
    const mgr = { FR01: "dm.sales.fr", UK01: "manager.uk", US01: "manager.us", MA01: "manager.ma", AE01: "manager.ae" }[code]!;
    await prisma.department.update({ where: { id: D[`${code}:SALES`] }, data: { managerId: U[mgr].id } });
  }
  await prisma.department.update({ where: { id: D["FR01:ENG"] }, data: { managerId: U["manager.fr"].id } });

  // ───────────── Approval workflows (thresholds configurable, never hardcoded) ─────────────
  await prisma.approvalWorkflow.create({
    data: {
      groupId: group.id, name: "Group standard approval", description: "< 100 EUR: line manager · 100–1,000 EUR: + finance controller · > 1,000 EUR: + CFO",
      thresholdCurrency: "EUR", priority: 0,
      steps: { create: [
        { sequence: 1, name: "Line manager", approverType: "LINE_MANAGER", minAmount: 0, slaHours: 48 },
        { sequence: 2, name: "Finance controller", approverType: "ROLE", role: "FINANCE_CONTROLLER", minAmount: 100, requiredOnException: true, slaHours: 72, escalateToRole: "GROUP_FINANCE" },
        { sequence: 3, name: "CFO", approverType: "ROLE", role: "CFO", minAmount: 1000, slaHours: 96 },
      ] },
    },
  });
  await prisma.approvalWorkflow.create({
    data: {
      groupId: group.id, name: "UK approval (GBP thresholds)", legalEntityId: E.UK01.id, thresholdCurrency: "GBP", priority: 10,
      steps: { create: [
        { sequence: 1, name: "Line manager", approverType: "LINE_MANAGER", minAmount: 0, slaHours: 48 },
        { sequence: 2, name: "Finance controller", approverType: "ROLE", role: "FINANCE_CONTROLLER", minAmount: 85, requiredOnException: true, slaHours: 72, escalateToRole: "GROUP_FINANCE" },
        { sequence: 3, name: "CFO", approverType: "ROLE", role: "CFO", minAmount: 850, slaHours: 96 },
      ] },
    },
  });
  await prisma.approvalWorkflow.create({
    data: {
      groupId: group.id, name: "Client entertainment (adds department head)", categoryCode: "CLIENT_ENT", thresholdCurrency: "EUR", priority: 5,
      steps: { create: [
        { sequence: 1, name: "Line manager", approverType: "LINE_MANAGER", minAmount: 0, slaHours: 48 },
        { sequence: 2, name: "Department manager", approverType: "DEPARTMENT_MANAGER", minAmount: 0, categoryCodes: ["CLIENT_ENT"], slaHours: 48 },
        { sequence: 3, name: "Finance controller", approverType: "ROLE", role: "FINANCE_CONTROLLER", minAmount: 100, requiredOnException: true, slaHours: 72, escalateToRole: "GROUP_FINANCE" },
        { sequence: 4, name: "CFO", approverType: "ROLE", role: "CFO", minAmount: 1000, slaHours: 96 },
      ] },
    },
  });

  // ───────────── Budgets FY ─────────────
  const budgetDefs: [string, string, string, string | null, string | null, string | null, number][] = [
    ["FR01", "FR-SALES-TE", "Sales travel & entertainment", "SALES", null, null, 26000],
    ["FR01", "FR-ENG-TE", "Engineering T&E", "ENG", null, null, 9000],
    ["FR01", "FR-NOVA", "Nova programme", null, null, "NOVA", 3500],
    ["FR01", "FR-MEALS", "Meals (entity-wide)", null, "MEALS", null, 7500],
    ["UK01", "UK-MKT-TE", "Marketing T&E", "MKT", null, null, 14000],
    ["US01", "US-SALES-TE", "Sales T&E", "SALES", null, null, 42000],
    ["US01", "US-ATLANTIC", "Atlantic expansion", null, null, "ATLANTIC", 15000],
    ["MA01", "MA-ENG-TE", "Engineering T&E", "ENG", null, null, 95000],
    ["AE01", "AE-SALES-TE", "Sales T&E", "SALES", null, null, 70000],
  ];
  for (const [ent, code, name, dept, cat, proj, amount] of budgetDefs) {
    await prisma.budget.create({
      data: {
        legalEntityId: E[ent].id, code, name, fiscalYear: YEAR, currency: E[ent].functionalCurrency, initialAmount: amount,
        departmentId: dept ? D[`${ent}:${dept}`] : null, categoryId: cat ? C[cat].id : null, projectId: proj ? projects[proj as keyof typeof projects].id : null,
      },
    });
  }

  // ───────────── Activity through the real services ─────────────
  const actors: Record<string, Actor> = {};
  const actorOf = async (key: string): Promise<Actor> => {
    if (actors[key]) return actors[key];
    const u = await prisma.user.findUniqueOrThrow({ where: { id: U[key].id }, include: { roles: true } });
    return (actors[key] = { id: u.id, groupId: u.groupId, name: u.name, email: u.email, legalEntityId: u.legalEntityId, departmentId: u.departmentId, costCenterId: u.costCenterId, countryCode: u.countryCode, locale: u.locale, roles: u.roles.map((r) => ({ role: r.role, scopeType: r.scopeType, scopeId: r.scopeId })) });
  };

  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica).catch(() => null);
  void font;
  let receiptNo = 0;
  async function receipt(ownerKey: string, merchant: string, date: string, amount: string, currency: string) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 420]);
    const f = await doc.embedFont(StandardFonts.Courier);
    const lines = [merchant.toUpperCase(), "", `Date: ${date}`, `Receipt #${100000 + ++receiptNo}`, "", `TOTAL ${amount} ${currency}`, "", "Thank you"];
    lines.forEach((l, i) => page.drawText(l.replace(/[^\x20-\x7E]/g, "?"), { x: 24, y: 380 - i * 18, size: 11, font: f }));
    const body = Buffer.from(await doc.save());
    const owner = await actorOf(ownerKey);
    const key = `receipts/${owner.legalEntityId}/seed/${receiptNo}.pdf`;
    await storage().put(key, body, "application/pdf");
    const r = await prisma.receipt.create({ data: { ownerId: owner.id, legalEntityId: owner.legalEntityId, storageKey: key, fileName: `${merchant.replace(/\W+/g, "_")}_${date}_${amount}_${currency}.pdf`, mimeType: "application/pdf", sizeBytes: body.length, sha256: sha256(body), ocrStatus: "CONFIRMED", ocrProvider: "mock", ocrData: { merchant, date, total: amount, currency, tax: null, confidence: 0.8 }, ocrConfirmedAt: new Date() } });
    return r.id;
  }

  type LineSpec = { cat: string; merchant: string; desc: string; amount: number; currency?: string; date: Date; taxRate?: number; nights?: number; method?: ExpenseLineInput["paymentMethod"]; country?: string; project?: string; attendees?: string; km?: number; noReceipt?: boolean };
  const merchants: Record<string, string[]> = {
    TRAVEL: ["SNCF Connect", "Eurostar", "Trainline"], HOTEL: ["Novotel", "Hilton Garden Inn", "Mercure", "Marriott Courtyard"], AIR: ["Air France", "British Airways", "Delta", "Royal Air Maroc", "Emirates"],
    TRANSPORT: ["G7 Taxi", "Uber", "Q-Park", "RATP"], FUEL: ["TotalEnergies", "Shell", "BP"], MEALS: ["Brasserie Lipp", "Pret A Manger", "Le Pain Quotidien", "Chipotle", "Café Clock"],
    CLIENT_ENT: ["Le Grand Véfour", "The Ivy", "Nobu", "La Sqala"], OFFICE: ["Bureau Vallée", "Staples", "Ryman"], TELECOM: ["Orange", "Vodafone", "AT&T"], TRAINING: ["Udemy Business", "Coursera", "CNAM"],
    SOFTWARE: ["Figma", "Atlassian", "Notion Labs"], PRO_SERVICES: ["Translation Pro", "Legal Advisory LLP"], OTHER: ["La Poste", "FedEx"],
  };
  const amounts: Record<string, [number, number]> = { TRAVEL: [40, 220], HOTEL: [110, 520], AIR: [180, 900], TRANSPORT: [12, 65], FUEL: [45, 95], MEALS: [14, 48], CLIENT_ENT: [120, 650], OFFICE: [15, 180], TELECOM: [20, 60], TRAINING: [90, 600], SOFTWARE: [12, 80], PRO_SERVICES: [200, 900], OTHER: [8, 60] };
  const vat: Record<string, Record<string, number>> = { FR01: { MEALS: 10, CLIENT_ENT: 10, HOTEL: 10, TRAVEL: 10, TRANSPORT: 10, DEFAULT: 20 }, UK01: { DEFAULT: 20, TRANSPORT: 0, AIR: 0 }, US01: { DEFAULT: 0 }, MA01: { DEFAULT: 20, HOTEL: 10, MEALS: 10 }, AE01: { DEFAULT: 5, AIR: 0 } };

  const fxFor = (ent: string) => E[ent].functionalCurrency;
  const toLocal = (eurAmount: number, cur: string) => Math.round(eurAmount * ({ EUR: 1, GBP: 0.85, USD: 1.08, MAD: 10.8, AED: 3.98 } as Record<string, number>)[cur] * 100) / 100;

  async function makeReport(empKey: string, title: string, specs: LineSpec[], opts: { submit?: boolean; tripId?: string } = {}) {
    const emp = await actorOf(empKey);
    const entCode = Object.keys(E).find((k) => E[k].id === emp.legalEntityId)!;
    const report = await createReport(emp, { title, purpose: title, tripId: opts.tripId ?? null });
    for (const s of specs) {
      const cur = s.currency ?? fxFor(entCode);
      const d = s.date > TODAY ? TODAY : s.date;
      const amount = s.amount.toFixed(2);
      const isMileage = s.cat === "MILEAGE";
      const receiptId = isMileage || s.noReceipt ? null : await receipt(empKey, s.merchant, iso(d), amount, cur);
      await saveExpenseLine(emp, report.id, null, {
        expenseDate: iso(d), categoryId: C[s.cat].id, merchant: s.merchant, description: s.desc, countryCode: s.country ?? emp.countryCode, currency: cur,
        grossAmount: isMileage ? undefined : amount, taxRate: isMileage ? undefined : (vat[entCode][s.cat] ?? vat[entCode].DEFAULT), costCenterId: emp.costCenterId!,
        projectId: s.project ? projects[s.project as keyof typeof projects].id : null, paymentMethod: s.method ?? "PERSONAL_CARD", attendees: s.attendees ?? null,
        nights: s.nights ?? null, receiptId, receiptMissingReason: s.noReceipt ? "Receipt lost" : null,
        mileage: isMileage ? { distanceKm: String(s.km ?? 120), vehicleType: "CAR", fromLocation: "Office", toLocation: "Client site" } : null,
      });
    }
    if (opts.submit === false) return report.id;
    const preview = await previewPolicies(emp, report.id);
    const justifications = Object.fromEntries(preview.exceptions.map((f) => [f.key, "Business need agreed with my manager in advance (client meeting)."]));
    const current = await prisma.expenseReport.findUniqueOrThrow({ where: { id: report.id } });
    await submitReport(emp, report.id, { version: current.version, justifications });
    return report.id;
  }

  /** Runs the approval chain. stopAt: number of approvals to perform (Infinity = full). */
  async function approve(reportId: string, stopAt = Infinity) {
    let done = 0;
    while (done < stopAt) {
      const r = await prisma.expenseReport.findUniqueOrThrow({ where: { id: reportId }, include: { tasks: true, violations: true } });
      const task = r.tasks.find((t) => t.status === "PENDING");
      if (!task) return;
      const approver = await prisma.user.findUniqueOrThrow({ where: { id: task.approverId }, include: { roles: true } });
      const a: Actor = { id: approver.id, groupId: approver.groupId, name: approver.name, email: approver.email, legalEntityId: approver.legalEntityId, departmentId: approver.departmentId, costCenterId: approver.costCenterId, countryCode: approver.countryCode, locale: approver.locale, roles: approver.roles.map((x) => ({ role: x.role, scopeType: x.scopeType, scopeId: x.scopeId })) };
      // Finance decides open exceptions at its step
      if (task.role === "FINANCE_CONTROLLER") {
        for (const v of r.violations.filter((x) => x.action === "REQUIRE_EXCEPTION" && x.status === "OPEN")) {
          await decideException(a, v.id, true, "Justification accepted: pre-approved client engagement.");
        }
      }
      const isLast = r.tasks.filter((t) => t.status === "WAITING").length === 0;
      const stillOpen = await prisma.policyViolation.findMany({ where: { reportId, action: "REQUIRE_EXCEPTION", status: "OPEN" } });
      if (isLast && stillOpen.length) {
        // exceptions must be decided by finance before the final approval
        const [fcId] = (await roleHoldersForEntity("FINANCE_CONTROLLER", r.legalEntityId)).filter((u) => u !== r.employeeId);
        if (fcId) for (const v of stillOpen) await decideException(await actorFromId(fcId), v.id, true, "Exception reviewed and accepted by finance.");
      }
      await decideTask(a, task.id, "APPROVE", null);
      done++;
    }
  }
  async function actorFromId(id: string): Promise<Actor> {
    const key = Object.keys(U).find((k) => U[k].id === id)!;
    return actorOf(key);
  }

  const months = Array.from({ length: TODAY.getUTCMonth() + 1 }, (_, i) => i); // 0..current
  const dayIn = (m: number, d: number) => {
    const max = m === TODAY.getUTCMonth() ? Math.max(1, TODAY.getUTCDate() - 2) : 28;
    return new Date(Date.UTC(YEAR, m, Math.min(d, max)));
  };
  const travellers = ["employee.fr", "employee2.fr", "manager.fr", "employee.uk", "employee.us", "manager.us", "employee.ma", "employee.ae", "dm.sales.fr"];
  const paidBatches: Record<string, string[]> = {};
  console.log("Generating historical activity…");
  for (const m of months) {
    for (const key of travellers) {
      if (rand() < 0.15) continue;
      const emp = await actorOf(key);
      const ent = Object.keys(E).find((k) => E[k].id === emp.legalEntityId)!;
      const cur = fxFor(ent);
      const day = Math.floor(between(3, 24));
      const specs: LineSpec[] = [];
      const cats = ["HOTEL", "MEALS", "TRANSPORT", "MEALS", "TRAVEL", "AIR", "OFFICE", "TELECOM", "CLIENT_ENT", "FUEL", "MILEAGE"];
      const n = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const cat = pick(cats);
        const [lo, hi] = amounts[cat] ?? [20, 100];
        const foreign = rand() < 0.2 && ent !== "AE01";
        const lineCur = foreign ? pick(["EUR", "USD", "GBP"].filter((c) => c !== cur)) : cur;
        const date = dayIn(m, day + i);
        // Avoid weekends for most lines (they still appear occasionally as warnings)
        if ((date.getUTCDay() === 0 || date.getUTCDay() === 6) && rand() < 0.8) date.setUTCDate(date.getUTCDate() + (date.getUTCDay() === 6 ? 2 : 1));
        if (date > TODAY) date.setTime(TODAY.getTime() - 86400_000 * 2);
        specs.push({
          cat, merchant: cat === "MILEAGE" ? "Personal vehicle" : pick(merchants[cat]), desc: cat === "CLIENT_ENT" ? "Dinner with prospect to close Q-deal" : `${C[cat].name} — client visit`,
          amount: toLocal(between(lo, hi), lineCur), currency: lineCur, date, nights: cat === "HOTEL" ? 1 + Math.floor(rand() * 3) : undefined,
          attendees: cat === "CLIENT_ENT" ? "2 client representatives (ACME Corp)" : undefined, km: cat === "MILEAGE" ? Math.round(between(30, 400)) : undefined,
          project: ent === "FR01" && rand() < 0.3 ? "NOVA" : ent === "US01" && rand() < 0.3 ? "ATLANTIC" : rand() < 0.1 ? "ORION" : undefined,
          method: rand() < 0.2 ? "CORPORATE_CARD" : "PERSONAL_CARD",
        });
        if (cat === "HOTEL" && specs.at(-1)!.nights) specs.at(-1)!.amount = Math.round(specs.at(-1)!.amount * specs.at(-1)!.nights! * 0.9 * 100) / 100;
      }
      const monthName = new Date(Date.UTC(YEAR, m, 1)).toLocaleString("en-GB", { month: "long" });
      const id = await makeReport(key, `${monthName} ${YEAR} business expenses`, specs).catch((e) => { console.warn(`  skipped ${key} ${monthName}: ${e.message}`); return null; });
      if (!id) continue;
      const age = TODAY.getUTCMonth() - m;
      if (age >= 2) await approve(id);
      else if (age === 1) await approve(id, rand() < 0.6 ? Infinity : 1);
      else if (rand() < 0.4) await approve(id, 1);
      const r = await prisma.expenseReport.findUniqueOrThrow({ where: { id } });
      if (r.status === "READY_FOR_PAYMENT" && age >= 2) (paidBatches[r.legalEntityId] ??= []).push(id);
      // Backdate lifecycle timestamps for realistic cycle-time KPIs
      const last = await prisma.expense.aggregate({ where: { reportId: id }, _max: { expenseDate: true } });
      const submittedAt = new Date(Math.min(last._max.expenseDate!.getTime() + between(2, 9) * 86400_000, TODAY.getTime() - 86400_000));
      await prisma.expenseReport.update({ where: { id }, data: { submittedAt, approvedAt: r.approvedAt ? new Date(Math.min(submittedAt.getTime() + between(1, 6) * 86400_000, TODAY.getTime())) : null } });
      await prisma.approvalTask.updateMany({ where: { reportId: id, status: "PENDING" }, data: { activatedAt: new Date(Math.max(submittedAt.getTime(), TODAY.getTime() - between(0.2, 9) * 86400_000)) } });
    }
  }

  // Seeding submits historical reports "today"; drop late-submission warnings that are artefacts of
  // that (expense submitted within 90 days of its date once timestamps are backdated).
  await prisma.$executeRaw`
    DELETE FROM "PolicyViolation" v USING "Expense" e, "ExpenseReport" r
    WHERE v."expenseId" = e.id AND r.id = v."reportId" AND v."ruleType" = 'LATE_SUBMISSION'
      AND r."submittedAt" - e."expenseDate" <= interval '90 days'`;

  console.log("Paying older reports…");
  const financeOf: Record<string, string> = { [E.FR01.id]: "fin.fr", [E.UK01.id]: "fc.uk", [E.US01.id]: "fc.us", [E.MA01.id]: "fc.ma", [E.AE01.id]: "manager.ae" };
  for (const [entityId, ids] of Object.entries(paidBatches)) {
    const fin = await actorOf(financeOf[entityId]);
    // Exclude the paying user's own reports would be a control in the UI; here all are employees' reports
    const batch = await createBatch(fin, { legalEntityId: entityId, reportIds: ids, paymentDate: iso(TODAY) });
    await initiateBatch(fin, batch.id);
    const payments = await prisma.payment.findMany({ where: { batchId: batch.id } });
    await completeBatch(fin, batch.id, payments.map((p, i) => ({ paymentId: p.id, status: "PAID" as const, bankReference: `SEPA-${batch.reference.slice(-5)}-${i + 1}` })));
    for (const p of payments) {
      const r = await prisma.expenseReport.findUniqueOrThrow({ where: { id: p.reportId } });
      await prisma.expenseReport.update({ where: { id: r.id }, data: { paidAt: new Date(Math.min((r.approvedAt ?? TODAY).getTime() + between(3, 12) * 86400_000, TODAY.getTime())) } });
    }
  }

  // ───────────── Curated demo scenarios ─────────────
  console.log("Creating demo scenarios…");
  const recent = (daysAgo: number) => new Date(TODAY.getTime() - daysAgo * 86400_000);
  const weekday = (daysAgo: number) => { const d = recent(daysAgo); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1); return d; };

  // 1) Draft with lines, ready to submit (employee.fr)
  const trip = await createTrip(await actorOf("employee.fr"), { purpose: "Client workshops in London", destinationCountry: "GB", destinationCity: "London", startDate: iso(weekday(6)), endDate: iso(weekday(4)), estimatedCost: "1500", projectId: projects.NOVA.id });
  await makeReport("employee.fr", "London client workshops", [
    { cat: "TRAVEL", merchant: "Eurostar", desc: "Paris–London return, client workshops", amount: 248, date: weekday(6), country: "GB" },
    { cat: "HOTEL", merchant: "Hilton Garden Inn", desc: "2 nights near client office", amount: 398, currency: "GBP", nights: 2, date: weekday(5), country: "GB", project: "NOVA" },
    { cat: "MEALS", merchant: "Pret A Manger", desc: "Lunch during workshop", amount: 14.5, currency: "GBP", date: weekday(5), country: "GB" },
  ], { submit: false, tripId: trip.id });

  // 2) Pending with line manager, contains an exception (meal allowance exceeded)
  await makeReport("employee.fr", "Lyon customer visit", [
    { cat: "MEALS", merchant: "Brasserie Georges", desc: "Lunch with customer project team", amount: 58, date: weekday(3) },
    { cat: "MEALS", merchant: "Café des Fédérations", desc: "Dinner with customer project team", amount: 46, date: weekday(3) },
    { cat: "TRAVEL", merchant: "SNCF Connect", desc: "Paris–Lyon return", amount: 132, date: weekday(3) },
  ]);

  // 3) Information requested from employee2.fr
  const infoId = await makeReport("employee2.fr", "Engineering conference", [
    { cat: "TRAINING", merchant: "DevConf Paris", desc: "Conference ticket", amount: 450, date: weekday(10) },
    { cat: "TRANSPORT", merchant: "Uber", desc: "Venue transfer", amount: 23.4, date: weekday(10) },
  ]);
  {
    const t = await prisma.approvalTask.findFirstOrThrow({ where: { reportId: infoId, status: "PENDING" } });
    await decideTask(await actorFromId(t.approverId), t.id, "REQUEST_INFO", "Please attach the agenda showing which sessions were relevant to your project.");
  }

  // 4) Large report awaiting finance controller then CFO (client entertainment, foreign currency)
  const bigId = await makeReport("dm.sales.fr", "New York strategic account visit", [
    { cat: "AIR", merchant: "Air France", desc: "CDG–JFK return, strategic account", amount: 1180, date: weekday(9), country: "US" },
    { cat: "HOTEL", merchant: "Marriott Courtyard", desc: "3 nights Manhattan", amount: 845, currency: "USD", nights: 3, date: weekday(8), country: "US" },
    { cat: "CLIENT_ENT", merchant: "Nobu", desc: "Dinner with ACME executive committee", amount: 690, currency: "USD", date: weekday(7), country: "US", attendees: "ACME CEO, CFO and COO" },
  ]);
  await approve(bigId, 2); // CFO -> line manager; department manager step; then finance pending

  // 5) Self-approval protection showcase: the CFO's own report is routed to someone else
  await makeReport("cfo", "Board meeting travel", [
    { cat: "TRAVEL", merchant: "SNCF Connect", desc: "Paris–Bordeaux for board meeting", amount: 156, date: weekday(5) },
    { cat: "HOTEL", merchant: "Mercure", desc: "1 night Bordeaux", amount: 142, nights: 1, date: weekday(5) },
  ]);

  // 6) Advances: a paid advance for employee.us partially settled by the next approved report
  {
    const emp = await actorOf("employee.us");
    const adv = await requestAdvance(emp, { amount: "800", purpose: "Trade show Chicago — on-site costs" });
    await decideAdvance(await actorOf("manager.us"), adv.id, true);
    await markAdvancePaid(await actorOf("fc.us"), adv.id, "ACH-778812");
    const rid = await makeReport("employee.us", "Chicago trade show", [
      { cat: "HOTEL", merchant: "Hilton Garden Inn", desc: "2 nights trade show", amount: 389, nights: 2, date: weekday(12) },
      { cat: "MEALS", merchant: "Chipotle", desc: "Booth staff lunch", amount: 42.8, date: weekday(12) },
    ]);
    await approve(rid);
    await requestAdvance(await actorOf("employee.fr"), { amount: "600", purpose: "Upcoming Casablanca customer trip" });
  }

  // 7) INFO response cycle demonstration on UK, delegation for manager.fr
  await prisma.approvalDelegation.create({ data: { fromUserId: U["dm.sales.fr"].id, toUserId: U["manager.fr"].id, startsAt: recent(1), endsAt: new Date(TODAY.getTime() + 10 * 86400_000), reason: "Annual leave" } });
  const ukId = await makeReport("employee.uk", "Manchester campaign launch", [
    { cat: "TRAVEL", merchant: "Trainline", desc: "London–Manchester return", amount: 96, date: weekday(4) },
    { cat: "MEALS", merchant: "Pret A Manger", desc: "Lunch with agency", amount: 18.2, date: weekday(4) },
  ]);
  {
    const t = await prisma.approvalTask.findFirstOrThrow({ where: { reportId: ukId, status: "PENDING" } });
    await decideTask(await actorFromId(t.approverId), t.id, "REQUEST_INFO", "Which campaign code should this be charged to?");
    await respondToInfoRequest(await actorOf("employee.uk"), ukId, "Campaign MKT-Q4-NORTH, agreed with Priya last week.");
  }

  await prisma.notification.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 1000) }, type: { in: ["REPORT_SUBMITTED"] } }, data: { readAt: new Date() } });

  const counts = await prisma.expenseReport.groupBy({ by: ["status"], _count: { _all: true } });
  console.table(counts.map((c) => ({ status: c.status, reports: c._count._all })));
  console.log(`\nDemo users (password for all: ${PASSWORD}):`);
  console.table(users.map((u) => ({ email: `${u.key}@atlas-group.example`, name: u.name, entity: u.entity, roles: u.roles.map((r) => r[0]).join(", ") })));
  console.timeEnd("seed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
