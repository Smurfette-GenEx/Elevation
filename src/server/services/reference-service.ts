import { prisma } from "../db";
import type { Actor } from "../auth/scope";

/** Reference data for forms, limited to what the actor needs. */
export async function expenseFormReference(actor: Actor) {
  const [categories, costCenters, projects, countries, entity, mileageRates, trips] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { groupId: actor.groupId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.costCenter.findMany({ where: { legalEntityId: actor.legalEntityId, active: true }, orderBy: { code: "asc" } }),
    prisma.project.findMany({
      where: { groupId: actor.groupId, active: true, OR: [{ legalEntityId: null }, { legalEntityId: actor.legalEntityId }] },
      orderBy: { code: "asc" },
    }),
    prisma.country.findMany({ where: { groupId: actor.groupId }, orderBy: { name: "asc" } }),
    prisma.legalEntity.findUniqueOrThrow({ where: { id: actor.legalEntityId }, include: { group: true } }),
    prisma.mileageRate.findMany({ where: { legalEntityId: actor.legalEntityId, validTo: null } }),
    prisma.trip.findMany({ where: { employeeId: actor.id, status: { not: "CANCELLED" } }, orderBy: { startDate: "desc" }, take: 20 }),
  ]);
  return {
    categories,
    costCenters,
    projects,
    countries,
    functionalCurrency: entity.functionalCurrency,
    reportingCurrency: entity.group.reportingCurrency,
    defaultCostCenterId: actor.costCenterId,
    mileageRates,
    trips,
    currencies: [...new Set(["EUR", "USD", "GBP", "CHF", "JPY", "MAD", "AED", "CAD", ...countries.map((c) => c.defaultCurrency)])].sort(),
  };
}

export async function orgFilterOptions(actor: Actor, entityIds: string[] | "all") {
  const entityWhere = entityIds === "all" ? { groupId: actor.groupId } : { id: { in: entityIds } };
  const [entities, departments, costCenters, categories, countries] = await Promise.all([
    prisma.legalEntity.findMany({ where: entityWhere, orderBy: { code: "asc" } }),
    prisma.department.findMany({ where: { legalEntity: entityWhere }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { legalEntity: entityWhere }, orderBy: { code: "asc" } }),
    prisma.expenseCategory.findMany({ where: { groupId: actor.groupId }, orderBy: { sortOrder: "asc" } }),
    prisma.country.findMany({ where: { groupId: actor.groupId, legalEntities: { some: entityWhere } }, orderBy: { name: "asc" } }),
  ]);
  return { entities, departments, costCenters, categories, countries };
}
