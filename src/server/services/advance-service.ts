import { prisma } from "../db";
import { d, roundMoney } from "../domain/money";
import { toDateOnly } from "../domain/dates";
import { can, scopeFor, scopeIncludesEntity, type Actor } from "../auth/scope";
import { businessRule, forbidden, notFound, validation } from "../errors";
import { audit } from "../infra/audit";
import { notify, runAfterCommit } from "./notification-service";

export async function requestAdvance(actor: Actor, input: { amount: string; purpose: string; tripId?: string | null }) {
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: actor.legalEntityId } });
  if (input.tripId && !(await prisma.trip.findFirst({ where: { id: input.tripId, employeeId: actor.id } }))) throw validation("Unknown trip");
  const amount = roundMoney(input.amount, entity.functionalCurrency);
  if (amount.lessThanOrEqualTo(0)) throw validation("Amount must be positive");
  const count = await prisma.advance.count({ where: { legalEntityId: entity.id } });
  const advance = await prisma.advance.create({
    data: {
      number: `ADV-${entity.code}-${String(count + 1).padStart(5, "0")}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
      employeeId: actor.id,
      legalEntityId: entity.id,
      tripId: input.tripId ?? null,
      purpose: input.purpose,
      amount,
      currency: entity.functionalCurrency, // advances are paid in the entity currency (no FX exposure)
    },
  });
  await audit(actor, { action: "advance.requested", entityType: "Advance", entityId: advance.id, legalEntityId: entity.id, data: { amount: amount.toFixed(2) } });
  const manager = (await prisma.user.findUnique({ where: { id: actor.id } }))?.managerId;
  if (manager) await runAfterCommit([await notify({ userIds: [manager], type: "APPROVAL_PENDING", title: `Advance request ${advance.number}`, body: `${actor.name} requests ${amount.toFixed(2)} ${advance.currency}: ${input.purpose}`, link: "/advances" })]);
  return advance;
}

export async function listAdvances(actor: Actor) {
  const finance = await scopeFor(actor, "advance:approve");
  return prisma.advance.findMany({
    where: {
      OR: [
        { employeeId: actor.id },
        { employee: { managerId: actor.id } },
        ...(finance.all ? [{ legalEntity: { groupId: actor.groupId } }] : finance.entityIds.size ? [{ legalEntityId: { in: [...finance.entityIds] } }] : []),
      ],
    },
    include: { employee: { select: { name: true } }, settlements: { include: { report: { select: { number: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function loadForDecision(actor: Actor, id: string) {
  const adv = await prisma.advance.findUnique({ where: { id }, include: { employee: true } });
  if (!adv) throw notFound("Advance");
  if (adv.employeeId === actor.id) throw forbidden("You cannot act on your own advance");
  return adv;
}

export async function decideAdvance(actor: Actor, id: string, approve: boolean) {
  const adv = await loadForDecision(actor, id);
  const scope = await scopeFor(actor, "advance:approve");
  const isManager = adv.employee.managerId === actor.id;
  if (!isManager && !(can(actor, "advance:approve") && scopeIncludesEntity(scope, adv.legalEntityId) && !scope.departmentIds.size)) throw forbidden();
  if (adv.status !== "REQUESTED") throw businessRule("Advance already decided");
  await prisma.advance.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", approvedById: actor.id } });
  await audit(actor, { action: approve ? "advance.approved" : "advance.rejected", entityType: "Advance", entityId: id, legalEntityId: adv.legalEntityId });
  await runAfterCommit([await notify({ userIds: [adv.employeeId], type: approve ? "REPORT_APPROVED" : "REPORT_REJECTED", title: `Advance ${adv.number} ${approve ? "approved" : "rejected"}`, body: `${d(adv.amount).toFixed(2)} ${adv.currency}`, link: "/advances" })]);
}

export async function markAdvancePaid(actor: Actor, id: string, paymentRef: string) {
  const adv = await loadForDecision(actor, id);
  const scope = await scopeFor(actor, "payment:manage");
  if (!scopeIncludesEntity(scope, adv.legalEntityId)) throw forbidden();
  if (adv.status !== "APPROVED") throw businessRule("Only approved advances can be paid");
  await prisma.advance.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), paymentRef } });
  await audit(actor, { action: "advance.paid", entityType: "Advance", entityId: id, legalEntityId: adv.legalEntityId, data: { paymentRef } });
  await runAfterCommit([await notify({ userIds: [adv.employeeId], type: "PAYMENT_COMPLETED", title: `Advance ${adv.number} paid`, body: `${d(adv.amount).toFixed(2)} ${adv.currency} (ref. ${paymentRef}). It will be offset against your next approved expense reports.`, link: "/advances" })]);
}

// ───────── Trips ─────────
export async function createTrip(actor: Actor, input: { purpose: string; destinationCountry: string; destinationCity: string; startDate: string; endDate: string; estimatedCost?: string | null; projectId?: string | null }) {
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: actor.legalEntityId } });
  const trip = await prisma.trip.create({
    data: {
      employeeId: actor.id,
      legalEntityId: entity.id,
      purpose: input.purpose,
      destinationCountry: input.destinationCountry,
      destinationCity: input.destinationCity,
      startDate: toDateOnly(input.startDate),
      endDate: toDateOnly(input.endDate),
      estimatedCost: input.estimatedCost ?? null,
      currency: entity.functionalCurrency,
      projectId: input.projectId ?? null,
    },
  });
  await audit(actor, { action: "trip.created", entityType: "Trip", entityId: trip.id, legalEntityId: entity.id });
  return trip;
}

export async function listTrips(actor: Actor) {
  return prisma.trip.findMany({
    where: { OR: [{ employeeId: actor.id }, { employee: { managerId: actor.id } }] },
    include: { employee: { select: { name: true } }, reports: { select: { id: true, number: true, status: true, totalFunctional: true } }, advances: { select: { number: true, amount: true, status: true } } },
    orderBy: { startDate: "desc" },
    take: 100,
  });
}
