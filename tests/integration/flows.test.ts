import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { createReport, saveExpenseLine, submitReport, getReportDetail, listReports, overrideFxRate, withdrawReport } from "@/server/services/report-service";
import { decideTask, decideException, escalateOverdueApprovals, reassignTask } from "@/server/services/approval-service";
import { createBatch, initiateBatch, completeBatch } from "@/server/services/payment-service";
import { createExport, renderExport } from "@/server/services/accounting-service";
import { requestAdvance, decideAdvance, markAdvancePaid } from "@/server/services/advance-service";
import { listBudgets, upsertBudget } from "@/server/services/budget-service";
import { analytics } from "@/server/services/dashboard-service";
import type { Actor } from "@/server/auth/scope";
import { buildFixture } from "./fixture";

type F = Awaited<ReturnType<typeof buildFixture>>;
let f: F;
beforeAll(async () => { f = await buildFixture(); });

async function draft(a: Actor, lines: Parameters<typeof saveExpenseLine>[3][], title = "Test report") {
  const r = await createReport(a, { title });
  for (const l of lines) await saveExpenseLine(a, r.id, null, l);
  return r.id;
}
async function submit(a: Actor, id: string, justifications: Record<string, string> = {}) {
  const r = await prisma.expenseReport.findUniqueOrThrow({ where: { id } });
  return submitReport(a, id, { version: r.version, justifications });
}
const pendingTask = (reportId: string) => prisma.approvalTask.findFirstOrThrow({ where: { reportId, status: "PENDING" } });
const expectAppError = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(code));
};

describe("expense lifecycle", () => {
  it("draft → submit → approve → pay → export, with exactly-once accounting", async () => {
    const { users: u } = f;
    const id = await draft(u.emp1, [
      f.line(u.emp1, { amount: "40.00", receipt: await f.receipt(u.emp1) }),
      { ...f.line(u.emp1, { cat: f.cats.mileage.id }), grossAmount: undefined, mileage: { distanceKm: "50", vehicleType: "CAR", fromLocation: "A", toLocation: "B" } },
    ]);
    let r = await prisma.expenseReport.findUniqueOrThrow({ where: { id } });
    expect(r.totalFunctional.toFixed(2)).toBe("70.00"); // 40 + 50km * 0.60

    await submit(u.emp1, id);
    const tasks = await prisma.approvalTask.findMany({ where: { reportId: id } });
    expect(tasks.map((t) => t.approverId)).toEqual([u.mgr1.id]); // < 100 EUR: line manager only

    await decideTask(u.mgr1, tasks[0].id, "APPROVE", null);
    r = await prisma.expenseReport.findUniqueOrThrow({ where: { id } });
    expect(r.status).toBe("READY_FOR_PAYMENT");
    expect(r.accountingStatus).toBe("READY");

    const batch = await createBatch(u.lf1, { legalEntityId: f.e1.id, reportIds: [id], paymentDate: new Date().toISOString().slice(0, 10) });
    await expectAppError(createBatch(u.lf1, { legalEntityId: f.e1.id, reportIds: [id], paymentDate: new Date().toISOString().slice(0, 10) }), "CONFLICT"); // no double payment
    await initiateBatch(u.lf1, batch.id);
    const pay = await prisma.payment.findFirstOrThrow({ where: { batchId: batch.id } });
    await completeBatch(u.lf1, batch.id, [{ paymentId: pay.id, status: "PAID", bankReference: "B-1" }]);
    expect((await prisma.expenseReport.findUniqueOrThrow({ where: { id } })).status).toBe("PAID");

    const exp = await createExport(u.lf1, f.e1.id, "EXPENSES");
    expect(exp.totalDebit.toFixed(2)).toBe(exp.totalCredit.toFixed(2));
    await expectAppError(createExport(u.lf1, f.e1.id, "EXPENSES"), "BUSINESS_RULE"); // already exported
    const csv = await renderExport(u.lf1, exp.id, "csv");
    expect(csv.body.toString()).toContain("421");
    const pexp = await createExport(u.lf1, f.e1.id, "PAYMENTS");
    expect(pexp.totalDebit.toFixed(2)).toBe("70.00");
  });

  it("routes by configurable amount thresholds (≥100 adds FC, ≥1000 adds CFO) using group currency", async () => {
    const { users: u } = f;
    const mid = await draft(u.emp1, [f.line(u.emp1, { amount: "150", receipt: await f.receipt(u.emp1) })]);
    await submit(u.emp1, mid);
    expect((await prisma.approvalTask.findMany({ where: { reportId: mid }, orderBy: { sequence: "asc" } })).map((t) => t.approverId)).toEqual([u.mgr1.id, u.fc1.id]);
    // UK employee: 900 GBP ≈ 1058.82 EUR -> CFO step required; FC resolved for the UK entity
    const big = await draft(u.emp2, [f.line(u.emp2, { amount: "900", receipt: await f.receipt(u.emp2) })]);
    await submit(u.emp2, big);
    expect((await prisma.approvalTask.findMany({ where: { reportId: big }, orderBy: { sequence: "asc" } })).map((t) => t.approverId)).toEqual([u.mgr2.id, u.fc2.id, u.cfo.id]);
  });

  it("blocks submission on blocking findings and requires justification for exceptions", async () => {
    const { users: u } = f;
    const noReceipt = await draft(u.emp1, [f.line(u.emp1, { amount: "60" })]);
    await expectAppError(submit(u.emp1, noReceipt), "BUSINESS_RULE");

    const meals = await draft(u.emp1, [f.line(u.emp1, { cat: f.cats.meals.id, amount: "90", receipt: await f.receipt(u.emp1) })]);
    await expectAppError(submit(u.emp1, meals), "BUSINESS_RULE"); // missing justification
    await submit(u.emp1, meals, { [`DAILY_MEAL_ALLOWANCE:${(await prisma.expense.findFirstOrThrow({ where: { reportId: meals } })).id}`]: "Team dinner after client workshop" });
    // exception forces finance review even below 100 EUR
    const chain = await prisma.approvalTask.findMany({ where: { reportId: meals }, orderBy: { sequence: "asc" } });
    expect(chain.map((t) => t.approverId)).toEqual([u.mgr1.id, u.fc1.id]);
    await decideTask(u.mgr1, chain[0].id, "APPROVE", null);
    await expectAppError(decideTask(u.fc1, chain[1].id, "APPROVE", null), "BUSINESS_RULE"); // exception still open
    const v = await prisma.policyViolation.findFirstOrThrow({ where: { reportId: meals, action: "REQUIRE_EXCEPTION" } });
    await expectAppError(decideException(u.fc1, v.id, true, ""), "VALIDATION"); // justification mandatory
    await decideException(u.fc1, v.id, true, "Accepted: documented client event");
    await decideTask(u.fc1, chain[1].id, "APPROVE", null);
    expect((await prisma.expenseReport.findUniqueOrThrow({ where: { id: meals } })).status).toBe("READY_FOR_PAYMENT");
  });

  it("detects duplicate expenses across reports", async () => {
    const { users: u } = f;
    const a = await draft(u.emp1, [f.line(u.emp1, { amount: "20", merchant: "Same Cafe", date: -5 })]);
    await submit(u.emp1, a);
    const b = await draft(u.emp1, [f.line(u.emp1, { amount: "20.00", merchant: "SAME CAFE", date: -5 })]);
    await expectAppError(submit(u.emp1, b), "BUSINESS_RULE");
  });

  it("enforces segregation of duties", async () => {
    const { users: u } = f;
    const id = await draft(u.fc1, [f.line(u.fc1, { amount: "300", receipt: await f.receipt(u.fc1) })]);
    await submit(u.fc1, id);
    const chain = await prisma.approvalTask.findMany({ where: { reportId: id }, orderBy: { sequence: "asc" } });
    // The FC is never routed their own claim: line manager step -> their manager (Group Finance);
    // the FC step falls back to the escalation role and is auto-skipped as the same person already approved.
    expect(chain.every((t) => t.approverId !== u.fc1.id)).toBe(true);
    expect(chain.map((t) => [t.approverId, t.status])).toEqual([[u.gf.id, "PENDING"], [u.gf.id, "SKIPPED"]]);
    await expectAppError(decideTask(u.fc1, chain[0].id, "APPROVE", null), "FORBIDDEN");
    await expectAppError(decideTask(u.emp1, chain[0].id, "APPROVE", null), "FORBIDDEN");
    await expectAppError(reassignTask(u.gf, chain[0].id, u.fc1.id, "back to claimant"), "BUSINESS_RULE");
  });

  it("supports request-info loop, withdrawal and optimistic concurrency", async () => {
    const { users: u } = f;
    const id = await draft(u.emp1, [f.line(u.emp1, { amount: "15" })]);
    const stale = (await prisma.expenseReport.findUniqueOrThrow({ where: { id } })).version - 1;
    await expectAppError(submitReport(u.emp1, id, { version: stale, justifications: {} }), "CONFLICT");
    await submit(u.emp1, id);
    await withdrawReport(u.emp1, id);
    expect((await prisma.expenseReport.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
    await submit(u.emp1, id);
    const t = await pendingTask(id);
    await decideTask(u.mgr1, t.id, "REQUEST_INFO", "Which client?");
    expect((await prisma.expenseReport.findUniqueOrThrow({ where: { id } })).status).toBe("INFO_REQUESTED");
    const { respondToInfoRequest } = await import("@/server/services/report-service");
    await respondToInfoRequest(u.emp1, id, "ACME");
    await decideTask(u.mgr1, t.id, "REJECT", "Not a business expense");
    expect((await prisma.expenseReport.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
  });
});

describe("multi-currency", () => {
  it("keeps original amounts and applies audited, capped FX overrides", async () => {
    const { users: u } = f;
    const id = await draft(u.emp1, [f.line(u.emp1, { amount: "110.00", currency: "USD", receipt: await f.receipt(u.emp1) })]);
    const line = await prisma.expense.findFirstOrThrow({ where: { reportId: id } });
    expect(line.functionalAmount.toFixed(2)).toBe("100.00"); // 110 USD / 1.10
    expect(line.fxSourceFunctional).toBe("ECB");
    await submit(u.emp1, id);
    await expectAppError(overrideFxRate(u.fc1, id, line.id, { rate: "1.5", reason: "way off market rate" }), "BUSINESS_RULE"); // > 10% deviation
    await expectAppError(overrideFxRate(u.emp1, id, line.id, { rate: "0.92", reason: "my own report rate" }), "FORBIDDEN");
    const res = await overrideFxRate(u.fc1, id, line.id, { rate: "0.92", reason: "Card statement shows bank rate" });
    expect(res.impact).toBe("1.20");
    const after = await prisma.expense.findUniqueOrThrow({ where: { id: line.id } });
    expect(after.grossAmount.toFixed(2)).toBe("110.00");
    expect(after.functionalAmount.toFixed(2)).toBe("101.20");
    expect(await prisma.auditLog.count({ where: { action: "fx.override", entityId: line.id } })).toBe(1);
  });
});

describe("data isolation", () => {
  it("restricts reads to organisational scope and hides out-of-scope records", async () => {
    const { users: u } = f;
    const frReport = (await prisma.expenseReport.findFirstOrThrow({ where: { legalEntityId: f.e1.id, status: { not: "DRAFT" } } })).id;
    await expectAppError(getReportDetail(u.fc2, frReport), "NOT_FOUND");
    await expectAppError(getReportDetail(u.emp2, frReport), "NOT_FOUND");
    await expectAppError(getReportDetail(u.admin, frReport), "NOT_FOUND"); // admins have no financial access
    expect((await getReportDetail(u.gf, frReport)).report.id).toBe(frReport); // group finance: consolidated
    const ukList = await listReports(u.fc2, {});
    expect(ukList.items.every((r) => r.legalEntityId === f.e2.id)).toBe(true);
    const mgrList = await listReports(u.mgr1, {});
    expect(mgrList.items.every((r) => [u.mgr1.id, u.emp1.id].includes(r.employeeId) || r.legalEntityId === f.e1.id)).toBe(true);
    await expectAppError(createExport(u.fc2, f.e1.id, "EXPENSES"), "FORBIDDEN");
    await expectAppError(analytics(u.emp1, "dashboard:finance", { from: "2026-01-01", to: "2026-12-31" }), "FORBIDDEN");
  });

  it("makes the audit log append-only at database level", async () => {
    const log = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
});

describe("advances, budgets and escalation", () => {
  it("offsets paid advances against approved reports", async () => {
    const { users: u } = f;
    const adv = await requestAdvance(u.emp1, { amount: "30", purpose: "Trip float" });
    await expectAppError(decideAdvance(u.emp1, adv.id, true), "FORBIDDEN");
    await decideAdvance(u.mgr1, adv.id, true);
    await markAdvancePaid(u.lf1, adv.id, "ACH-1");
    const id = await draft(u.emp1, [f.line(u.emp1, { amount: "24", merchant: "Advance test" })]);
    await submit(u.emp1, id);
    await decideTask(u.mgr1, (await pendingTask(id)).id, "APPROVE", null);
    const r = await prisma.expenseReport.findUniqueOrThrow({ where: { id } });
    expect(r.advanceApplied.toFixed(2)).toBe("24.00");
    expect(r.netPayable.toFixed(2)).toBe("0.00");
    expect(r.status).toBe("PAID");
    const a = await prisma.advance.findUniqueOrThrow({ where: { id: adv.id } });
    expect(a.status).toBe("PARTIALLY_SETTLED");
  });

  it("computes budget consumption from live statuses without double counting", async () => {
    const { users: u } = f;
    await upsertBudget(u.fc1, { legalEntityId: f.e1.id, code: "BUD", name: "CC1 budget", fiscalYear: new Date().getUTCFullYear(), costCenterId: f.cc1.id, initialAmount: "100000" });
    const [b] = (await listBudgets(u.fc1, { fiscalYear: new Date().getUTCFullYear(), legalEntityId: f.e1.id })).filter((x) => x.budget.code === "BUD");
    const lines = await prisma.expense.findMany({ where: { costCenterId: f.cc1.id, report: { status: { notIn: ["DRAFT", "REJECTED"] } }, expenseDate: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)) } } });
    const total = lines.reduce((acc, l) => acc + Number(l.functionalAmount), 0);
    expect(b.indicators.pending.plus(b.indicators.approved).plus(b.indicators.paid).toNumber()).toBeCloseTo(total, 2);
  });

  it("escalates overdue approvals to the escalation role, never to the claimant", async () => {
    const { users: u } = f;
    const id = await draft(u.emp1, [f.line(u.emp1, { amount: "200", receipt: await f.receipt(u.emp1), merchant: "Escalation" })]);
    await submit(u.emp1, id);
    await decideTask(u.mgr1, (await pendingTask(id)).id, "APPROVE", null);
    const fcTask = await pendingTask(id);
    await prisma.approvalTask.update({ where: { id: fcTask.id }, data: { dueAt: new Date(Date.now() - 3600_000) } });
    await escalateOverdueApprovals();
    const after = await prisma.approvalTask.findUniqueOrThrow({ where: { id: fcTask.id } });
    expect(after.approverId).toBe(u.gf.id);
    expect(after.originalApproverId).toBe(u.fc1.id);
    expect(after.escalationLevel).toBe(1);
  });
});
