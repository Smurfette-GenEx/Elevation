import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { assertCan, can, entityIdsFor, invalidateOrgCache, type Actor } from "../auth/scope";
import { hashPassword, revokeAllSessions, validatePasswordStrength } from "../auth/credentials";
import { businessRule, forbidden, notFound, validation } from "../errors";
import { audit } from "../infra/audit";
import type { z } from "zod";
import type { policyRuleSchema, userSchema, workflowSchema } from "../validation";

// ───────────── Users & roles ─────────────

export async function listUsers(actor: Actor, q?: string) {
  assertCan(actor, "user:manage");
  return prisma.user.findMany({
    where: { groupId: actor.groupId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { roles: true, legalEntity: { select: { code: true } }, department: { select: { name: true } }, manager: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
}

/** Directory used for delegation pickers: name + entity only (no sensitive fields). */
export async function userDirectory(actor: Actor, q: string) {
  return prisma.user.findMany({
    where: { groupId: actor.groupId, active: true, anonymizedAt: null, id: { not: actor.id }, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { startsWith: q, mode: "insensitive" } }] },
    select: { id: true, name: true, legalEntity: { select: { code: true } } },
    take: 20,
  });
}

async function validateOrgRefs(actor: Actor, input: z.infer<typeof userSchema>) {
  const entity = await prisma.legalEntity.findFirst({ where: { id: input.legalEntityId, groupId: actor.groupId } });
  if (!entity) throw validation("Unknown legal entity");
  if (input.departmentId && !(await prisma.department.findFirst({ where: { id: input.departmentId, legalEntityId: entity.id } }))) throw validation("Department must belong to the user's legal entity");
  if (input.costCenterId && !(await prisma.costCenter.findFirst({ where: { id: input.costCenterId, legalEntityId: entity.id } }))) throw validation("Cost center must belong to the user's legal entity");
  if (input.managerId && !(await prisma.user.findFirst({ where: { id: input.managerId, groupId: actor.groupId } }))) throw validation("Unknown manager");
}

export async function saveUser(actor: Actor, userId: string | null, input: z.infer<typeof userSchema>) {
  assertCan(actor, "user:manage");
  await validateOrgRefs(actor, input);
  if (userId && input.managerId === userId) throw validation("A user cannot be their own manager");
  if (input.password) {
    const weak = validatePasswordStrength(input.password);
    if (weak) throw validation(weak);
  }
  // Prevent privilege escalation: an admin cannot grant themselves financial roles
  if (userId === actor.id && input.roles.some((r) => r.role !== "SYSTEM_ADMIN" && r.role !== "EMPLOYEE" && !actor.roles.some((a) => a.role === r.role))) {
    throw forbidden("You cannot grant additional roles to yourself");
  }
  const data = {
    email: input.email.toLowerCase(),
    name: input.name,
    legalEntityId: input.legalEntityId,
    departmentId: input.departmentId ?? null,
    costCenterId: input.costCenterId ?? null,
    managerId: input.managerId ?? null,
    countryCode: input.countryCode,
    employeeNumber: input.employeeNumber ?? null,
    active: input.active,
    ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
  };
  const before = userId ? await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } }) : null;
  if (userId && !before) throw notFound("User");
  const user = await prisma.$transaction(async (tx) => {
    const u = userId ? await tx.user.update({ where: { id: userId }, data }) : await tx.user.create({ data: { ...data, groupId: actor.groupId } });
    await tx.roleAssignment.deleteMany({ where: { userId: u.id } });
    const roles = input.roles.length ? input.roles : [{ role: "EMPLOYEE" as const, scopeType: "LEGAL_ENTITY" as const, scopeId: input.legalEntityId }];
    await tx.roleAssignment.createMany({ data: roles.map((r) => ({ userId: u.id, role: r.role, scopeType: r.scopeType, scopeId: r.scopeType === "GROUP" ? null : r.scopeId })) });
    await audit(actor, {
      action: userId ? "user.updated" : "user.created",
      entityType: "User",
      entityId: u.id,
      legalEntityId: u.legalEntityId,
      data: { rolesBefore: before?.roles.map((r) => `${r.role}@${r.scopeType}:${r.scopeId ?? "*"}`) ?? [], rolesAfter: roles.map((r) => `${r.role}@${r.scopeType}:${r.scopeId ?? "*"}`), active: u.active, passwordChanged: !!input.password },
    }, tx);
    return u;
  });
  if (before && (!input.active || input.password)) await revokeAllSessions(user.id);
  return user;
}

/** GDPR right to erasure: pseudonymise personal data while keeping financial records (legal retention). */
export async function anonymizeUser(actor: Actor, userId: string) {
  assertCan(actor, "user:manage");
  const user = await prisma.user.findFirst({ where: { id: userId, groupId: actor.groupId } });
  if (!user) throw notFound("User");
  const open = await prisma.expenseReport.count({ where: { employeeId: userId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED"] } } });
  if (open) throw businessRule("User still has open expense reports or pending payments");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name: `Former employee ${userId.slice(-6)}`, email: `anonymized+${userId}@invalid.local`, passwordHash: null, externalId: null, active: false, anonymizedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await audit(actor, { action: "user.anonymized", entityType: "User", entityId: userId, legalEntityId: user.legalEntityId }, tx);
  });
}

/** GDPR right of access: personal data export for a user (JSON). */
export async function exportPersonalData(actor: Actor, userId: string) {
  if (actor.id !== userId) assertCan(actor, "user:manage");
  const user = await prisma.user.findFirst({
    where: { id: userId, groupId: actor.groupId },
    select: { id: true, email: true, name: true, employeeNumber: true, countryCode: true, locale: true, createdAt: true, lastLoginAt: true, roles: { select: { role: true, scopeType: true, scopeId: true } } },
  });
  if (!user) throw notFound("User");
  const reports = await prisma.expenseReport.findMany({ where: { employeeId: userId }, include: { expenses: { select: { expenseDate: true, merchant: true, description: true, grossAmount: true, currency: true, attendees: true } } } });
  await audit(actor, { action: "user.data_exported", entityType: "User", entityId: userId });
  return { exportedAt: new Date().toISOString(), user, reports };
}

// ───────────── Organisation reference ─────────────

export async function orgOverview(actor: Actor) {
  if (!can(actor, "org:manage") && !can(actor, "user:manage") && !can(actor, "policy:manage") && !can(actor, "workflow:manage")) throw forbidden();
  return prisma.legalEntity.findMany({
    where: { groupId: actor.groupId },
    include: { country: true, departments: { include: { manager: { select: { name: true } } } }, costCenters: true, accountingConfig: true, _count: { select: { users: true } } },
    orderBy: { code: "asc" },
  });
}

// ───────────── Policies ─────────────

export async function listPolicyRules(actor: Actor) {
  if (!can(actor, "policy:manage") && !can(actor, "finance:read")) throw forbidden();
  return prisma.policyRule.findMany({ where: { groupId: actor.groupId }, include: { category: { select: { name: true } } }, orderBy: [{ type: "asc" }, { priority: "desc" }] });
}

export async function savePolicyRule(actor: Actor, id: string | null, input: z.infer<typeof policyRuleSchema>) {
  assertCan(actor, "policy:manage");
  if (input.legalEntityId && !(await prisma.legalEntity.findFirst({ where: { id: input.legalEntityId, groupId: actor.groupId } }))) throw validation("Unknown entity");
  if (input.categoryId && !(await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, groupId: actor.groupId } }))) throw validation("Unknown category");
  const data = { ...input, params: input.params as Prisma.InputJsonValue, countryCode: input.countryCode ?? null, legalEntityId: input.legalEntityId ?? null, categoryId: input.categoryId ?? null, currency: input.currency ?? null };
  const before = id ? await prisma.policyRule.findFirst({ where: { id, groupId: actor.groupId } }) : null;
  if (id && !before) throw notFound("Policy rule");
  const rule = id ? await prisma.policyRule.update({ where: { id }, data }) : await prisma.policyRule.create({ data: { ...data, groupId: actor.groupId } });
  await audit(actor, { action: id ? "policy.updated" : "policy.created", entityType: "PolicyRule", entityId: rule.id, data: { before: before ? { ...before, createdAt: undefined, updatedAt: undefined } : null, after: input } as Prisma.InputJsonValue });
  return rule;
}

// ───────────── Workflows ─────────────

export async function listWorkflows(actor: Actor) {
  if (!can(actor, "workflow:manage") && !can(actor, "finance:read")) throw forbidden();
  return prisma.approvalWorkflow.findMany({ where: { groupId: actor.groupId }, include: { steps: { orderBy: { sequence: "asc" } } }, orderBy: [{ active: "desc" }, { priority: "desc" }] });
}

export async function saveWorkflow(actor: Actor, id: string | null, input: z.infer<typeof workflowSchema>) {
  assertCan(actor, "workflow:manage");
  const seqs = input.steps.map((s) => s.sequence);
  if (new Set(seqs).size !== seqs.length) throw validation("Step sequences must be unique");
  const { steps, ...wf } = input;
  const data = { ...wf, countryCode: wf.countryCode ?? null, legalEntityId: wf.legalEntityId ?? null, departmentId: wf.departmentId ?? null, categoryCode: wf.categoryCode ?? null, projectId: wf.projectId ?? null, costCenterId: wf.costCenterId ?? null, description: wf.description ?? null };
  const stepData = steps.map((s) => ({ ...s, role: s.role ?? null, userId: s.userId ?? null, maxAmount: s.maxAmount ?? null, escalateToRole: s.escalateToRole ?? null }));
  const saved = await prisma.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.approvalWorkflow.findFirst({ where: { id, groupId: actor.groupId } });
      if (!existing) throw notFound("Workflow");
      await tx.approvalStepDefinition.deleteMany({ where: { workflowId: id } });
      return tx.approvalWorkflow.update({ where: { id }, data: { ...data, steps: { create: stepData } } });
    }
    return tx.approvalWorkflow.create({ data: { ...data, groupId: actor.groupId, steps: { create: stepData } } });
  });
  await audit(actor, { action: id ? "workflow.updated" : "workflow.created", entityType: "ApprovalWorkflow", entityId: saved.id, data: input as unknown as Prisma.InputJsonValue });
  invalidateOrgCache();
  return saved;
}

// ───────────── Audit log ─────────────

export async function queryAuditLog(actor: Actor, filter: { entityType?: string; entityId?: string; actorId?: string; action?: string; take?: number }) {
  assertCan(actor, "audit:read");
  const ids = await entityIdsFor(actor, "audit:read");
  return prisma.auditLog.findMany({
    where: {
      groupId: actor.groupId,
      OR: [{ legalEntityId: null }, { legalEntityId: { in: ids } }],
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 200, 1000),
  });
}
