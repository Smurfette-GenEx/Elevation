import { prisma } from "../db";
import { d, sum, Decimal } from "../domain/money";
import { toDateOnly } from "../domain/dates";
import { assertEntityAccess, entityIdsFor, scopeFor, scopeIncludesEntity, type Actor, assertCan } from "../auth/scope";
import { businessRule, conflict, notFound, validation } from "../errors";
import { audit } from "../infra/audit";
import { notify, runAfterCommit } from "./notification-service";

export async function listPayableReports(actor: Actor, legalEntityId?: string) {
  assertCan(actor, "payment:manage");
  const ids = await entityIdsFor(actor, "payment:manage");
  return prisma.expenseReport.findMany({
    where: { status: "READY_FOR_PAYMENT", legalEntityId: legalEntityId ? { in: ids.filter((i) => i === legalEntityId) } : { in: ids } },
    include: { employee: { select: { name: true, employeeNumber: true } }, legalEntity: { select: { code: true } } },
    orderBy: { approvedAt: "asc" },
  });
}

export async function listBatches(actor: Actor) {
  assertCan(actor, "payment:manage");
  const ids = await entityIdsFor(actor, "payment:manage");
  return prisma.paymentBatch.findMany({
    where: { legalEntityId: { in: ids } },
    include: { legalEntity: { select: { code: true } }, payments: { include: { report: { select: { number: true, employee: { select: { name: true } } } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function createBatch(actor: Actor, input: { legalEntityId: string; reportIds: string[]; paymentDate: string }) {
  await assertEntityAccess(actor, "payment:manage", input.legalEntityId);
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: input.legalEntityId } });
  return prisma.$transaction(async (tx) => {
    const reports = await tx.expenseReport.findMany({ where: { id: { in: input.reportIds }, legalEntityId: input.legalEntityId, status: "READY_FOR_PAYMENT" } });
    if (reports.length !== input.reportIds.length) throw businessRule("Some reports are not ready for payment or belong to another entity");
    const busy = await tx.payment.findFirst({ where: { reportId: { in: input.reportIds }, status: { not: "FAILED" } } });
    if (busy) throw conflict("A selected report is already in another payment batch");
    if (reports.some((r) => r.currency !== entity.functionalCurrency)) throw businessRule("All payments in a batch must be in the entity currency");
    const reference = `PAY-${entity.code}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const total = sum(reports.map((r) => r.netPayable));
    const batch = await tx.paymentBatch.create({
      data: {
        reference,
        legalEntityId: entity.id,
        currency: entity.functionalCurrency,
        totalAmount: total,
        paymentDate: toDateOnly(input.paymentDate),
        createdById: actor.id,
        payments: { create: reports.map((r) => ({ reportId: r.id, amount: r.netPayable, currency: r.currency })) },
      },
    });
    await audit(actor, { action: "payment.batch_created", entityType: "PaymentBatch", entityId: batch.id, legalEntityId: entity.id, data: { reference, count: reports.length, total: total.toFixed(2) } }, tx);
    return batch;
  });
}

async function loadBatch(actor: Actor, batchId: string) {
  const batch = await prisma.paymentBatch.findUnique({ where: { id: batchId }, include: { payments: { include: { report: true } } } });
  if (!batch) throw notFound("Payment batch");
  const scope = await scopeFor(actor, "payment:manage");
  if (!scopeIncludesEntity(scope, batch.legalEntityId)) throw notFound("Payment batch");
  return batch;
}

/** Marks the batch as transmitted to the bank. Segregation: the creator cannot release it alone if configured otherwise. */
export async function initiateBatch(actor: Actor, batchId: string) {
  const batch = await loadBatch(actor, batchId);
  if (batch.status !== "DRAFT") throw businessRule("Only draft batches can be initiated");
  const senders: (() => Promise<void>)[] = [];
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.paymentBatch.update({ where: { id: batchId }, data: { status: "INITIATED", initiatedAt: now } });
    await tx.payment.updateMany({ where: { batchId }, data: { status: "SENT" } });
    const moved = await tx.expenseReport.updateMany({ where: { id: { in: batch.payments.map((p) => p.reportId) }, status: "READY_FOR_PAYMENT" }, data: { status: "PAYMENT_INITIATED" } });
    if (moved.count !== batch.payments.length) throw conflict("A report in the batch changed status; rebuild the batch");
    await audit(actor, { action: "payment.batch_initiated", entityType: "PaymentBatch", entityId: batchId, legalEntityId: batch.legalEntityId }, tx);
    senders.push(await notify({
      userIds: batch.payments.map((p) => p.report.employeeId),
      type: "REIMBURSEMENT_INITIATED",
      title: "Reimbursement initiated",
      body: `Your reimbursement has been sent to the bank (batch ${batch.reference}).`,
      link: "/expenses",
    }, tx));
  });
  await runAfterCommit(senders);
}

/** Records bank results per payment; failed transfers return the report to the payment queue. */
export async function completeBatch(actor: Actor, batchId: string, results: { paymentId: string; status: "PAID" | "FAILED"; bankReference?: string | null }[]) {
  const batch = await loadBatch(actor, batchId);
  if (batch.status !== "INITIATED") throw businessRule("Only initiated batches can be completed");
  const byId = new Map(batch.payments.map((p) => [p.id, p]));
  if (results.some((r) => !byId.has(r.paymentId))) throw validation("Unknown payment in results");
  if (new Set(results.map((r) => r.paymentId)).size !== batch.payments.length) throw validation("Provide a result for every payment in the batch");
  const senders: (() => Promise<void>)[] = [];
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    for (const r of results) {
      const p = byId.get(r.paymentId)!;
      // Reconciliation: paid amount must match the approved net payable
      if (r.status === "PAID" && !d(p.amount).equals(d(p.report.netPayable))) throw businessRule(`Payment for ${p.report.number} does not match the approved amount`);
      await tx.payment.update({ where: { id: p.id }, data: { status: r.status, bankReference: r.bankReference ?? null, paidAt: r.status === "PAID" ? now : null } });
      await tx.expenseReport.update({ where: { id: p.reportId }, data: r.status === "PAID" ? { status: "PAID", paidAt: now } : { status: "READY_FOR_PAYMENT" } });
      if (r.status === "PAID") {
        senders.push(await notify({ userIds: [p.report.employeeId], type: "PAYMENT_COMPLETED", title: `${p.report.number} paid`, body: `${d(p.amount).toFixed(2)} ${p.currency} has been paid${r.bankReference ? ` (ref. ${r.bankReference})` : ""}.`, link: `/expenses/${p.reportId}` }, tx));
      }
    }
    await tx.paymentBatch.update({ where: { id: batchId }, data: { status: "COMPLETED", completedAt: now } });
    await audit(actor, { action: "payment.batch_completed", entityType: "PaymentBatch", entityId: batchId, legalEntityId: batch.legalEntityId, data: { results } }, tx);
  });
  await runAfterCommit(senders);
}

/** Approved vs paid reconciliation per report for an entity. */
export async function reconciliation(actor: Actor, legalEntityId: string) {
  await assertEntityAccess(actor, "payment:manage", legalEntityId);
  const reports = await prisma.expenseReport.findMany({
    where: { legalEntityId, status: { in: ["READY_FOR_PAYMENT", "PAYMENT_INITIATED", "PAID"] } },
    include: { payments: true, employee: { select: { name: true } } },
    orderBy: { approvedAt: "desc" },
    take: 500,
  });
  return reports.map((r) => {
    const paid = sum(r.payments.filter((p) => p.status === "PAID").map((p) => p.amount));
    const diff = d(r.netPayable).minus(paid);
    return { id: r.id, number: r.number, employee: r.employee.name, status: r.status, approved: d(r.netPayable), paid, difference: diff, currency: r.currency, reconciled: r.status === "PAID" ? diff.isZero() : null };
  });
}

export { Decimal };
