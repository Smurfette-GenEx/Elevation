import type { Prisma, Role, ScopeType } from "@prisma/client";
import { prisma } from "../db";
import { forbidden } from "../errors";
import { rolesFor, type Permission } from "./rbac";

export interface RoleGrant {
  role: Role;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface Actor {
  id: string;
  groupId: string;
  name: string;
  email: string;
  legalEntityId: string;
  departmentId: string | null;
  costCenterId: string | null;
  countryCode: string;
  locale: string;
  roles: RoleGrant[];
}

/** Resolved organisational reach of a permission for a given actor. */
export interface AccessScope {
  all: boolean; // whole group
  entityIds: Set<string>;
  departmentIds: Set<string>;
  costCenterIds: Set<string>;
}

interface OrgIndex {
  entitiesByCountry: Map<string, string[]>;
  allEntityIds: string[];
  departmentEntity: Map<string, string>;
  costCenterEntity: Map<string, string>;
  loadedAt: number;
}

let orgCache: { groupId: string; index: OrgIndex } | null = null;
const ORG_TTL_MS = 60_000;

export function invalidateOrgCache() {
  orgCache = null;
}

async function orgIndex(groupId: string): Promise<OrgIndex> {
  if (orgCache && orgCache.groupId === groupId && Date.now() - orgCache.index.loadedAt < ORG_TTL_MS) return orgCache.index;
  const [entities, departments, costCenters] = await Promise.all([
    prisma.legalEntity.findMany({ where: { groupId }, select: { id: true, countryCode: true } }),
    prisma.department.findMany({ where: { legalEntity: { groupId } }, select: { id: true, legalEntityId: true } }),
    prisma.costCenter.findMany({ where: { legalEntity: { groupId } }, select: { id: true, legalEntityId: true } }),
  ]);
  const entitiesByCountry = new Map<string, string[]>();
  for (const e of entities) entitiesByCountry.set(e.countryCode, [...(entitiesByCountry.get(e.countryCode) ?? []), e.id]);
  const index: OrgIndex = {
    entitiesByCountry,
    allEntityIds: entities.map((e) => e.id),
    departmentEntity: new Map(departments.map((d) => [d.id, d.legalEntityId])),
    costCenterEntity: new Map(costCenters.map((c) => [c.id, c.legalEntityId])),
    loadedAt: Date.now(),
  };
  orgCache = { groupId, index };
  return index;
}

export function hasRole(actor: Actor, ...roles: Role[]): boolean {
  return actor.roles.some((r) => roles.includes(r.role));
}

export function can(actor: Actor, permission: Permission): boolean {
  return hasRole(actor, ...rolesFor(permission));
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw forbidden();
}

/** Computes the organisational reach of a permission from the actor's scoped role grants. */
export async function scopeFor(actor: Actor, permission: Permission): Promise<AccessScope> {
  const scope: AccessScope = { all: false, entityIds: new Set(), departmentIds: new Set(), costCenterIds: new Set() };
  const roles = rolesFor(permission);
  const grants = actor.roles.filter((r) => roles.includes(r.role));
  if (grants.length === 0) return scope;
  const org = await orgIndex(actor.groupId);
  for (const g of grants) {
    switch (g.scopeType) {
      case "GROUP":
        scope.all = true;
        org.allEntityIds.forEach((id) => scope.entityIds.add(id));
        break;
      case "COUNTRY":
        (org.entitiesByCountry.get(g.scopeId ?? "") ?? []).forEach((id) => scope.entityIds.add(id));
        break;
      case "LEGAL_ENTITY":
        if (g.scopeId) scope.entityIds.add(g.scopeId);
        break;
      case "DEPARTMENT":
        if (g.scopeId) scope.departmentIds.add(g.scopeId);
        break;
      case "COST_CENTER":
        if (g.scopeId) scope.costCenterIds.add(g.scopeId);
        break;
    }
  }
  return scope;
}

export function scopeIncludesEntity(scope: AccessScope, legalEntityId: string): boolean {
  return scope.all || scope.entityIds.has(legalEntityId);
}

export async function assertEntityAccess(actor: Actor, permission: Permission, legalEntityId: string) {
  const scope = await scopeFor(actor, permission);
  if (!scopeIncludesEntity(scope, legalEntityId)) throw forbidden("You are not authorised for this legal entity");
}

/** Entity ids the actor may see for a permission (for filters / dropdowns). */
export async function entityIdsFor(actor: Actor, permission: Permission): Promise<string[]> {
  const s = await scopeFor(actor, permission);
  return [...s.entityIds];
}

/**
 * Prisma filter restricting expense reports to what the actor may read:
 *  - their own reports
 *  - reports where they are (or were) an assigned approver
 *  - their direct reports' reports (line managers)
 *  - reports in departments / cost centres they manage
 *  - reports of legal entities in their finance scope (controllers, local & group finance, CFO)
 * This filter is applied server-side in every query; nothing relies on UI hiding.
 */
export async function reportReadWhere(actor: Actor): Promise<Prisma.ExpenseReportWhereInput> {
  const or: Prisma.ExpenseReportWhereInput[] = [
    { employeeId: actor.id },
    { tasks: { some: { approverId: actor.id } } },
  ];
  if (can(actor, "team:read")) or.push({ employee: { managerId: actor.id } });
  const dept = await scopeFor(actor, "department:read");
  if (dept.departmentIds.size) or.push({ employee: { departmentId: { in: [...dept.departmentIds] } } });
  if (dept.costCenterIds.size) or.push({ expenses: { some: { costCenterId: { in: [...dept.costCenterIds] } } } });
  const fin = await scopeFor(actor, "finance:read");
  if (fin.all) or.push({ legalEntity: { groupId: actor.groupId } });
  else if (fin.entityIds.size) or.push({ legalEntityId: { in: [...fin.entityIds] } });
  if (fin.departmentIds.size) or.push({ employee: { departmentId: { in: [...fin.departmentIds] } } });
  if (fin.costCenterIds.size) or.push({ expenses: { some: { costCenterId: { in: [...fin.costCenterIds] } } } });
  return { AND: [{ legalEntity: { groupId: actor.groupId } }, { OR: or }] };
}

/**
 * Filter for analytical / dashboard queries (aggregates over expenses).
 * Returns null if the actor has no analytical reach for the permission.
 */
export async function expenseAnalyticsWhere(actor: Actor, permission: Permission): Promise<Prisma.ExpenseWhereInput | null> {
  const s = await scopeFor(actor, permission);
  const or: Prisma.ExpenseWhereInput[] = [];
  if (s.all) or.push({ report: { legalEntity: { groupId: actor.groupId } } });
  if (s.entityIds.size && !s.all) or.push({ report: { legalEntityId: { in: [...s.entityIds] } } });
  if (s.departmentIds.size) or.push({ report: { employee: { departmentId: { in: [...s.departmentIds] } } } });
  if (s.costCenterIds.size) or.push({ costCenterId: { in: [...s.costCenterIds] } });
  if (permission === "dashboard:team") or.push({ report: { employee: { managerId: actor.id } } });
  return or.length ? { OR: or } : null;
}
