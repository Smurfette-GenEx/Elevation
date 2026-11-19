import { Decimal, d, type DecimalLike } from "./money";

export type Role =
  | "EMPLOYEE"
  | "LINE_MANAGER"
  | "DEPARTMENT_MANAGER"
  | "FINANCE_CONTROLLER"
  | "LOCAL_FINANCE"
  | "GROUP_FINANCE"
  | "CFO"
  | "SYSTEM_ADMIN";

export type ApproverType = "LINE_MANAGER" | "DEPARTMENT_MANAGER" | "ROLE" | "SPECIFIC_USER";

export interface StepDefinition {
  sequence: number;
  name: string;
  approverType: ApproverType;
  role: Role | null;
  userId: string | null;
  minAmount: DecimalLike;
  maxAmount: DecimalLike | null;
  requiredOnException: boolean;
  categoryCodes: string[];
  slaHours: number;
  escalateToRole: Role | null;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  priority: number;
  countryCode: string | null;
  legalEntityId: string | null;
  departmentId: string | null;
  categoryCode: string | null;
  projectId: string | null;
  costCenterId: string | null;
  thresholdCurrency: string;
  steps: StepDefinition[];
}

export interface RoutingContext {
  employeeId: string;
  countryCode: string;
  legalEntityId: string;
  departmentId: string | null;
  categoryCodes: string[];
  projectIds: string[];
  costCenterIds: string[];
  hasExceptions: boolean;
  /** report total converted to an arbitrary currency */
  totalIn: (currency: string) => Decimal;
}

export interface ResolvedApprover {
  approverId: string;
  /** when routed through a delegation, the person who would normally approve */
  originalApproverId?: string;
}

/** Returns candidate approvers in order of preference for a step definition. */
export type ApproverResolver = (step: StepDefinition) => ResolvedApprover[];

export interface PlannedTask {
  sequence: number;
  name: string;
  approverType: ApproverType;
  role: Role | null;
  approverId: string;
  originalApproverId: string | null;
  status: "WAITING" | "PENDING" | "SKIPPED";
  slaHours: number;
  escalateToRole: Role | null;
  comment: string | null;
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

function workflowMatches(w: WorkflowDefinition, ctx: RoutingContext): boolean {
  if (w.countryCode && w.countryCode !== ctx.countryCode) return false;
  if (w.legalEntityId && w.legalEntityId !== ctx.legalEntityId) return false;
  if (w.departmentId && w.departmentId !== ctx.departmentId) return false;
  if (w.categoryCode && !ctx.categoryCodes.includes(w.categoryCode)) return false;
  if (w.projectId && !ctx.projectIds.includes(w.projectId)) return false;
  if (w.costCenterId && !ctx.costCenterIds.includes(w.costCenterId)) return false;
  return true;
}

function workflowSpecificity(w: WorkflowDefinition): number {
  return [w.legalEntityId, w.departmentId, w.costCenterId, w.projectId, w.categoryCode, w.countryCode].filter(Boolean).length;
}

/** Most specific matching workflow wins; ties broken by explicit priority. */
export function selectWorkflow(workflows: WorkflowDefinition[], ctx: RoutingContext): WorkflowDefinition {
  const match = workflows
    .filter((w) => workflowMatches(w, ctx))
    .sort((a, b) => b.priority - a.priority || workflowSpecificity(b) - workflowSpecificity(a))[0];
  if (!match) throw new RoutingError("No approval workflow matches this expense report. Contact your administrator.");
  return match;
}

export function stepApplies(step: StepDefinition, total: Decimal, ctx: RoutingContext): boolean {
  if (step.categoryCodes.length && !step.categoryCodes.some((c) => ctx.categoryCodes.includes(c))) return false;
  const inBand = total.greaterThanOrEqualTo(d(step.minAmount)) && (step.maxAmount === null || total.lessThan(d(step.maxAmount)));
  return inBand || (step.requiredOnException && ctx.hasExceptions);
}

/**
 * Builds the approval chain for a report:
 *  - filters steps by amount band (in the workflow's threshold currency), category and exceptions
 *  - resolves approvers, enforcing segregation of duties (never the claimant)
 *  - auto-skips a step whose approver already approved an earlier step
 */
export function planApprovalChain(workflow: WorkflowDefinition, ctx: RoutingContext, resolve: ApproverResolver): PlannedTask[] {
  const total = ctx.totalIn(workflow.thresholdCurrency);
  const steps = [...workflow.steps].sort((a, b) => a.sequence - b.sequence).filter((s) => stepApplies(s, total, ctx));
  if (steps.length === 0) throw new RoutingError(`Workflow "${workflow.name}" produced no approval step for this report`);

  const tasks: PlannedTask[] = [];
  const approversSoFar = new Set<string>();

  for (const step of steps) {
    const candidates = resolve(step).filter((c) => c.approverId !== ctx.employeeId);
    const chosen = candidates[0];
    if (!chosen) {
      throw new RoutingError(`No eligible approver found for step "${step.name}" (self-approval is not permitted)`);
    }
    const duplicate = approversSoFar.has(chosen.approverId);
    tasks.push({
      sequence: step.sequence,
      name: step.name,
      approverType: step.approverType,
      role: step.role,
      approverId: chosen.approverId,
      originalApproverId: chosen.originalApproverId ?? null,
      status: duplicate ? "SKIPPED" : "WAITING",
      slaHours: step.slaHours,
      escalateToRole: step.escalateToRole,
      comment: duplicate ? "Skipped automatically: approver already approved an earlier step" : null,
    });
    approversSoFar.add(chosen.approverId);
  }
  const first = tasks.find((t) => t.status === "WAITING");
  if (first) first.status = "PENDING";
  return tasks;
}

// ───────────────────── Task decisions (state machine) ─────────────────────

export type TaskStatus = "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "INFO_REQUESTED" | "SKIPPED" | "CANCELLED";
export type Decision = "APPROVE" | "REJECT" | "REQUEST_INFO";

export interface TaskState {
  id: string;
  sequence: number;
  approverId: string;
  status: TaskStatus;
}

export interface DecisionOutcome {
  taskUpdates: { id: string; status: TaskStatus }[];
  reportStatus: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "INFO_REQUESTED";
  nextTaskId: string | null;
}

export class DecisionError extends Error {
  constructor(message: string, public code: "NOT_ACTIONABLE" | "NOT_APPROVER" | "SELF_APPROVAL") {
    super(message);
    this.name = "DecisionError";
  }
}

export function decide(
  tasks: TaskState[],
  taskId: string,
  actorId: string,
  employeeId: string,
  decision: Decision,
): DecisionOutcome {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "PENDING") throw new DecisionError("This approval step is not awaiting a decision", "NOT_ACTIONABLE");
  if (actorId === employeeId) throw new DecisionError("You cannot approve your own expenses", "SELF_APPROVAL");
  if (task.approverId !== actorId) throw new DecisionError("You are not the assigned approver for this step", "NOT_APPROVER");

  const ordered = [...tasks].sort((a, b) => a.sequence - b.sequence);
  if (decision === "REJECT") {
    return {
      taskUpdates: [
        { id: task.id, status: "REJECTED" },
        ...ordered.filter((t) => t.status === "WAITING").map((t) => ({ id: t.id, status: "CANCELLED" as const })),
      ],
      reportStatus: "REJECTED",
      nextTaskId: null,
    };
  }
  if (decision === "REQUEST_INFO") {
    return { taskUpdates: [{ id: task.id, status: "INFO_REQUESTED" }], reportStatus: "INFO_REQUESTED", nextTaskId: null };
  }
  const next = ordered.find((t) => t.sequence > task.sequence && t.status === "WAITING");
  return {
    taskUpdates: [{ id: task.id, status: "APPROVED" }, ...(next ? [{ id: next.id, status: "PENDING" as const }] : [])],
    reportStatus: next ? "UNDER_REVIEW" : "APPROVED",
    nextTaskId: next?.id ?? null,
  };
}

// ───────────────────────── Report status machine ─────────────────────────

export type ReportStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INFO_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "READY_FOR_PAYMENT"
  | "PAYMENT_INITIATED"
  | "PAID";

const TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  DRAFT: ["SUBMITTED", "UNDER_REVIEW"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "INFO_REQUESTED", "DRAFT"], // DRAFT = withdrawn before any decision
  UNDER_REVIEW: ["UNDER_REVIEW", "APPROVED", "REJECTED", "INFO_REQUESTED"],
  INFO_REQUESTED: ["UNDER_REVIEW", "REJECTED"],
  APPROVED: ["READY_FOR_PAYMENT"],
  REJECTED: ["DRAFT", "SUBMITTED"], // employee may rework and resubmit
  READY_FOR_PAYMENT: ["PAYMENT_INITIATED", "APPROVED"],
  PAYMENT_INITIATED: ["PAID", "READY_FOR_PAYMENT"], // failed transfer goes back to the queue
  PAID: [],
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReportStatus, to: ReportStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid report status transition ${from} -> ${to}`);
}

export const EDITABLE_STATUSES: ReportStatus[] = ["DRAFT", "REJECTED"];
export const PENDING_STATUSES: ReportStatus[] = ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"];
export const APPROVED_STATUSES: ReportStatus[] = ["APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED"];
export const PAID_STATUSES: ReportStatus[] = ["PAID"];

export { Decimal };
