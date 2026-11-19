import { randomBytes } from "node:crypto";
import type { Role, ScopeType } from "@prisma/client";
import { prisma } from "@/server/db";
import type { Actor } from "@/server/auth/scope";
import { invalidateOrgCache } from "@/server/auth/scope";

const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
export const iso = (offset: number) => day(offset).toISOString().slice(0, 10);

/**
 * Builds an isolated group: two entities (EUR + GBP), users for every role, policy rules,
 * the standard approval matrix (<100 LM, >=100 +FC, >=1000 +CFO) and recent FX rates.
 */
export async function buildFixture() {
  invalidateOrgCache();
  const sfx = randomBytes(3).toString("hex").toUpperCase();
  const group = await prisma.group.create({ data: { name: `Test ${sfx}`, reportingCurrency: "EUR" } });
  for (const [code, cur] of [["FR", "EUR"], ["GB", "GBP"]] as const) {
    await prisma.country.upsert({ where: { code }, create: { code, name: code, defaultCurrency: cur, groupId: group.id }, update: {} });
  }
  const e1 = await prisma.legalEntity.create({ data: { groupId: group.id, countryCode: "FR", code: `FR-${sfx}`, name: "Entity FR", functionalCurrency: "EUR" } });
  const e2 = await prisma.legalEntity.create({ data: { groupId: group.id, countryCode: "GB", code: `UK-${sfx}`, name: "Entity UK", functionalCurrency: "GBP" } });
  const d1 = await prisma.department.create({ data: { legalEntityId: e1.id, code: "SALES", name: "Sales" } });
  const d2 = await prisma.department.create({ data: { legalEntityId: e2.id, code: "SALES", name: "Sales" } });
  const cc1 = await prisma.costCenter.create({ data: { legalEntityId: e1.id, departmentId: d1.id, code: `CC1-${sfx}`, name: "CC1" } });
  const cc2 = await prisma.costCenter.create({ data: { legalEntityId: e2.id, departmentId: d2.id, code: `CC2-${sfx}`, name: "CC2" } });

  const cats = {
    meals: await prisma.expenseCategory.create({ data: { groupId: group.id, code: "MEALS", name: "Meals", isMeal: true } }),
    hotel: await prisma.expenseCategory.create({ data: { groupId: group.id, code: "HOTEL", name: "Hotel", isAccommodation: true } }),
    mileage: await prisma.expenseCategory.create({ data: { groupId: group.id, code: "MILEAGE", name: "Mileage", isMileage: true } }),
    air: await prisma.expenseCategory.create({ data: { groupId: group.id, code: "AIR", name: "Airfare" } }),
  };
  for (const e of [e1, e2]) {
    await prisma.entityAccountingConfig.create({ data: { legalEntityId: e.id, journalCode: "EXP", employeePayableAccount: "421", vatRecoverableAccount: "4456", advanceAccount: "425", bankAccount: "512", corporateCardAccount: "4671", fxGainAccount: "766", fxLossAccount: "666" } });
    await prisma.accountMapping.createMany({ data: [
      { legalEntityId: e.id, categoryId: cats.meals.id, glAccount: "6257", vatCode: "V10", vatDeductiblePct: 100 },
      { legalEntityId: e.id, categoryId: cats.hotel.id, glAccount: "6256", vatCode: "V10", vatDeductiblePct: 0 },
      { legalEntityId: e.id, categoryId: cats.mileage.id, glAccount: "6251" },
      { legalEntityId: e.id, categoryId: cats.air.id, glAccount: "6252" },
    ] });
  }
  await prisma.mileageRate.create({ data: { legalEntityId: e1.id, vehicleType: "CAR", ratePerKm: "0.60", currency: "EUR", validFrom: day(-400) } });
  const rates = [];
  for (let i = -40; i <= 0; i++) rates.push({ baseCurrency: "EUR", quoteCurrency: "GBP", rate: "0.85", effectiveDate: day(i), source: "ECB" as const }, { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.10", effectiveDate: day(i), source: "ECB" as const });
  await prisma.exchangeRate.createMany({ data: rates, skipDuplicates: true });

  await prisma.policyRule.createMany({ data: [
    { groupId: group.id, name: "Receipt", type: "RECEIPT_REQUIRED_ABOVE", action: "BLOCK", severity: "HIGH", currency: "EUR", params: { threshold: 25 } },
    { groupId: group.id, name: "Meals", type: "DAILY_MEAL_ALLOWANCE", action: "REQUIRE_EXCEPTION", severity: "MEDIUM", currency: "EUR", params: { maxAmount: 75 } },
    { groupId: group.id, name: "Dup", type: "DUPLICATE_EXPENSE", action: "REQUIRE_EXCEPTION", severity: "HIGH" },
  ] });
  await prisma.approvalWorkflow.create({ data: { groupId: group.id, name: "Standard", thresholdCurrency: "EUR", steps: { create: [
    { sequence: 1, name: "Line manager", approverType: "LINE_MANAGER", minAmount: 0, slaHours: 24 },
    { sequence: 2, name: "Finance controller", approverType: "ROLE", role: "FINANCE_CONTROLLER", minAmount: 100, requiredOnException: true, slaHours: 24, escalateToRole: "GROUP_FINANCE" },
    { sequence: 3, name: "CFO", approverType: "ROLE", role: "CFO", minAmount: 1000 },
  ] } } });

  const users: Record<string, Actor> = {};
  const mk = async (key: string, entity: typeof e1, dept: string, cc: string, roles: [Role, ScopeType, string | null][], managerKey?: string) => {
    const u = await prisma.user.create({ data: { groupId: group.id, email: `${key}-${sfx}@test.example`.toLowerCase(), name: key, legalEntityId: entity.id, departmentId: dept, costCenterId: cc, countryCode: entity.countryCode, managerId: managerKey ? users[managerKey].id : null } });
    await prisma.roleAssignment.createMany({ data: roles.map(([role, scopeType, scopeId]) => ({ userId: u.id, role, scopeType, scopeId })) });
    users[key] = { id: u.id, groupId: group.id, name: key, email: u.email, legalEntityId: entity.id, departmentId: dept, costCenterId: cc, countryCode: entity.countryCode, locale: "en-GB", roles: roles.map(([role, scopeType, scopeId]) => ({ role, scopeType, scopeId })) };
  };
  await mk("ceo", e1, d1.id, cc1.id, [["EMPLOYEE", "LEGAL_ENTITY", e1.id]]);
  await mk("cfo", e1, d1.id, cc1.id, [["CFO", "GROUP", null], ["EMPLOYEE", "LEGAL_ENTITY", e1.id]], "ceo");
  await mk("gf", e1, d1.id, cc1.id, [["GROUP_FINANCE", "GROUP", null]], "cfo");
  await mk("mgr1", e1, d1.id, cc1.id, [["LINE_MANAGER", "LEGAL_ENTITY", e1.id], ["EMPLOYEE", "LEGAL_ENTITY", e1.id]], "cfo");
  await mk("emp1", e1, d1.id, cc1.id, [["EMPLOYEE", "LEGAL_ENTITY", e1.id]], "mgr1");
  await mk("fc1", e1, d1.id, cc1.id, [["FINANCE_CONTROLLER", "LEGAL_ENTITY", e1.id], ["EMPLOYEE", "LEGAL_ENTITY", e1.id]], "gf");
  await mk("lf1", e1, d1.id, cc1.id, [["LOCAL_FINANCE", "LEGAL_ENTITY", e1.id]], "fc1");
  await mk("mgr2", e2, d2.id, cc2.id, [["LINE_MANAGER", "LEGAL_ENTITY", e2.id], ["EMPLOYEE", "LEGAL_ENTITY", e2.id]], "cfo");
  await mk("emp2", e2, d2.id, cc2.id, [["EMPLOYEE", "LEGAL_ENTITY", e2.id]], "mgr2");
  await mk("fc2", e2, d2.id, cc2.id, [["FINANCE_CONTROLLER", "LEGAL_ENTITY", e2.id], ["LOCAL_FINANCE", "LEGAL_ENTITY", e2.id]], "gf");
  await mk("admin", e1, d1.id, cc1.id, [["SYSTEM_ADMIN", "GROUP", null]]);
  await prisma.department.update({ where: { id: d1.id }, data: { managerId: users.mgr1.id } });

  let receiptN = 0;
  const receipt = async (owner: Actor) =>
    (await prisma.receipt.create({ data: { ownerId: owner.id, legalEntityId: owner.legalEntityId, storageKey: `test/${sfx}/${++receiptN}-${randomBytes(4).toString("hex")}.pdf`, fileName: "r.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: randomBytes(32).toString("hex") } })).id;

  const line = (a: Actor, o: Partial<{ cat: string; amount: string; currency: string; date: number; receipt: string | null; merchant: string; tax: string }> = {}) => ({
    expenseDate: iso(o.date ?? -3), categoryId: o.cat ?? cats.air.id, merchant: o.merchant ?? `Merchant ${Math.random()}`, description: "Client visit travel",
    countryCode: a.countryCode, currency: o.currency ?? (a.legalEntityId === e1.id ? "EUR" : "GBP"), grossAmount: o.amount ?? "50.00", taxAmount: o.tax ?? "0",
    costCenterId: a.costCenterId!, paymentMethod: "PERSONAL_CARD" as const, receiptId: o.receipt === undefined ? null : o.receipt,
  });

  return { group, e1, e2, cc1, cc2, d1, cats, users, receipt, line, sfx };
}
