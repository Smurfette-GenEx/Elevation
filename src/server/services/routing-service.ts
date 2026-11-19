import type { Role } from "@prisma/client";
import { prisma, type Tx } from "../db";
import type { ApproverResolver, ResolvedApprover, StepDefinition, WorkflowDefinition } from "../domain/approval-engine";

/** Active delegation for a user at a point in time (out-of-office). */
export async function activeDelegate(userId: string, at = new Date(), tx: Tx = prisma): Promise<string | null> {
  const del = await tx.approvalDelegation.findFirst({
    where: { fromUserId: userId, active: true, startsAt: { lte: at }, endsAt: { gte: at } },
    orderBy: { createdAt: "desc" },
  });
  return del?.toUserId ?? null;
}

/**
 * Users holding a role whose scope covers a legal entity, most specific first
 * (entity-level controller before a country-level one before group-wide).
 */
export async function roleHoldersForEntity(role: Role, legalEntityId: string, tx: Tx = prisma): Promise<string[]> {
  const entity = await tx.legalEntity.findUniqueOrThrow({ where: { id: legalEntityId } });
  const grants = await tx.roleAssignment.findMany({
    where: {
      role,
      user: { active: true },
      OR: [
        { scopeType: "LEGAL_ENTITY", scopeId: legalEntityId },
        { scopeType: "COUNTRY", scopeId: entity.countryCode },
        { scopeType: "GROUP" },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const rank = { LEGAL_ENTITY: 0, COUNTRY: 1, GROUP: 2, DEPARTMENT: 3, COST_CENTER: 3 } as const;
  return [...new Set(grants.sort((a, b) => rank[a.scopeType] - rank[b.scopeType]).map((g) => g.userId))];
}

export async function buildResolver(
  employee: { id: string; managerId: string | null; departmentId: string | null },
  legalEntityId: string,
  workflow: WorkflowDefinition,
  tx: Tx = prisma,
): Promise<ApproverResolver> {
  // Pre-resolve candidates for all steps (resolver itself must be synchronous)
  const dept = employee.departmentId ? await tx.department.findUnique({ where: { id: employee.departmentId } }) : null;
  const manager = employee.managerId ? await tx.user.findUnique({ where: { id: employee.managerId } }) : null;
  const byStep = new Map<number, ResolvedApprover[]>();

  for (const step of workflow.steps) {
    let raw: string[] = [];
    switch (step.approverType) {
      case "LINE_MANAGER":
        // Fallback chain: line manager -> manager's manager -> department manager
        raw = [employee.managerId, manager?.managerId, dept?.managerId].filter((x): x is string => !!x);
        break;
      case "DEPARTMENT_MANAGER":
        // If the claimant IS the department manager, fall back to their own line manager, then N+2
        raw = [dept?.managerId, employee.managerId, manager?.managerId].filter((x): x is string => !!x);
        break;
      case "ROLE":
        // Role holders for the entity (most specific first), then the step's escalation role as a
        // fallback — e.g. when the only controller in scope is the claimant themself.
        raw = [
          ...(step.role ? await roleHoldersForEntity(step.role, legalEntityId, tx) : []),
          ...(step.escalateToRole ? await roleHoldersForEntity(step.escalateToRole, legalEntityId, tx) : []),
        ];
        break;
      case "SPECIFIC_USER":
        raw = step.userId ? [step.userId] : [];
        break;
    }
    const resolved: ResolvedApprover[] = [];
    for (const userId of raw) {
      const delegate = await activeDelegate(userId, new Date(), tx);
      // A delegate must never be the claimant; in that case keep the original approver
      if (delegate && delegate !== employee.id) resolved.push({ approverId: delegate, originalApproverId: userId });
      else resolved.push({ approverId: userId });
    }
    byStep.set(step.sequence, resolved);
  }
  return (step: StepDefinition) => byStep.get(step.sequence) ?? [];
}

export async function loadWorkflows(groupId: string, tx: Tx = prisma): Promise<WorkflowDefinition[]> {
  const rows = await tx.approvalWorkflow.findMany({ where: { groupId, active: true }, include: { steps: true } });
  return rows.map((w) => ({
    id: w.id, name: w.name, priority: w.priority, countryCode: w.countryCode, legalEntityId: w.legalEntityId,
    departmentId: w.departmentId, categoryCode: w.categoryCode, projectId: w.projectId, costCenterId: w.costCenterId,
    thresholdCurrency: w.thresholdCurrency,
    steps: w.steps.map((s) => ({
      sequence: s.sequence, name: s.name, approverType: s.approverType, role: s.role, userId: s.userId, minAmount: s.minAmount,
      maxAmount: s.maxAmount, requiredOnException: s.requiredOnException, categoryCodes: s.categoryCodes, slaHours: s.slaHours,
      escalateToRole: s.escalateToRole,
    })),
  }));
}
