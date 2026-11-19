import { describe, it, expect } from "vitest";
import { selectWorkflow, planApprovalChain, decide, RoutingError, DecisionError, canTransition, type WorkflowDefinition, type RoutingContext, type StepDefinition } from "@/server/domain/approval-engine";
import { d } from "@/server/domain/money";

const step = (p: Partial<StepDefinition> & Pick<StepDefinition, "sequence" | "name" | "approverType">): StepDefinition => ({
  role: null, userId: null, minAmount: "0", maxAmount: null, requiredOnException: false, categoryCodes: [], slaHours: 48, escalateToRole: null, ...p,
});
// The example matrix from the specification
const groupDefault: WorkflowDefinition = {
  id: "wf-group", name: "Group default", priority: 0, countryCode: null, legalEntityId: null, departmentId: null, categoryCode: null, projectId: null, costCenterId: null, thresholdCurrency: "EUR",
  steps: [
    step({ sequence: 1, name: "Line manager", approverType: "LINE_MANAGER" }),
    step({ sequence: 2, name: "Finance controller", approverType: "ROLE", role: "FINANCE_CONTROLLER", minAmount: "100", requiredOnException: true }),
    step({ sequence: 3, name: "CFO", approverType: "ROLE", role: "CFO", minAmount: "1000" }),
  ],
};
const ukWorkflow: WorkflowDefinition = { ...groupDefault, id: "wf-uk", name: "UK", legalEntityId: "UK01", steps: [step({ sequence: 1, name: "LM", approverType: "LINE_MANAGER" })] };

const ctx = (total: string, over: Partial<RoutingContext> = {}): RoutingContext => ({
  employeeId: "emp", countryCode: "FR", legalEntityId: "FR01", departmentId: "d1", categoryCodes: ["MEALS"], projectIds: [], costCenterIds: ["cc1"], hasExceptions: false,
  totalIn: () => d(total), ...over,
});
const resolver = (map: Record<string, string[]>) => (s: StepDefinition) => (map[s.role ?? s.approverType] ?? []).map((approverId) => ({ approverId }));
const people = resolver({ LINE_MANAGER: ["mgr"], FINANCE_CONTROLLER: ["fc"], CFO: ["cfo"] });

describe("approval routing", () => {
  it("selects the most specific workflow", () => {
    expect(selectWorkflow([groupDefault, ukWorkflow], ctx("10")).id).toBe("wf-group");
    expect(selectWorkflow([groupDefault, ukWorkflow], ctx("10", { legalEntityId: "UK01" })).id).toBe("wf-uk");
  });
  it.each([
    ["50", ["mgr"]],
    ["100", ["mgr", "fc"]],
    ["999.99", ["mgr", "fc"]],
    ["1000", ["mgr", "fc", "cfo"]],
  ])("routes a %s EUR report to %j", (total, expected) => {
    const chain = planApprovalChain(groupDefault, ctx(total), people);
    expect(chain.map((t) => t.approverId)).toEqual(expected);
    expect(chain[0].status).toBe("PENDING");
    expect(chain.slice(1).every((t) => t.status === "WAITING")).toBe(true);
  });
  it("adds finance review when a policy exception is pending, regardless of amount", () => {
    expect(planApprovalChain(groupDefault, ctx("20", { hasExceptions: true }), people).map((t) => t.approverId)).toEqual(["mgr", "fc"]);
  });
  it("never routes to the claimant (segregation of duties) and falls back to next candidate", () => {
    const chain = planApprovalChain(groupDefault, ctx("2000", { employeeId: "cfo" }), resolver({ LINE_MANAGER: ["mgr"], FINANCE_CONTROLLER: ["fc"], CFO: ["cfo", "groupfin"] }));
    expect(chain.map((t) => t.approverId)).toEqual(["mgr", "fc", "groupfin"]);
    expect(() => planApprovalChain(groupDefault, ctx("2000", { employeeId: "cfo" }), people)).toThrow(RoutingError);
  });
  it("auto-skips a step when the same person already approves an earlier step", () => {
    const chain = planApprovalChain(groupDefault, ctx("500"), resolver({ LINE_MANAGER: ["fc"], FINANCE_CONTROLLER: ["fc"] }));
    expect(chain.map((t) => t.status)).toEqual(["PENDING", "SKIPPED"]);
  });
});

describe("approval decisions", () => {
  const tasks = () => [
    { id: "t1", sequence: 1, approverId: "mgr", status: "PENDING" as const },
    { id: "t2", sequence: 2, approverId: "fc", status: "WAITING" as const },
  ];
  it("advances to the next step then approves the report", () => {
    const o = decide(tasks(), "t1", "mgr", "emp", "APPROVE");
    expect(o.reportStatus).toBe("UNDER_REVIEW");
    expect(o.nextTaskId).toBe("t2");
    const final = decide([{ ...tasks()[0], status: "APPROVED" }, { ...tasks()[1], status: "PENDING" }], "t2", "fc", "emp", "APPROVE");
    expect(final.reportStatus).toBe("APPROVED");
  });
  it("rejection cancels remaining steps", () => {
    const o = decide(tasks(), "t1", "mgr", "emp", "REJECT");
    expect(o.reportStatus).toBe("REJECTED");
    expect(o.taskUpdates).toContainEqual({ id: "t2", status: "CANCELLED" });
  });
  it("blocks self-approval, wrong approver and non-pending steps", () => {
    expect(() => decide(tasks(), "t1", "emp", "emp", "APPROVE")).toThrow(DecisionError);
    expect(() => decide(tasks(), "t1", "fc", "emp", "APPROVE")).toThrow(/not the assigned approver/);
    expect(() => decide(tasks(), "t2", "fc", "emp", "APPROVE")).toThrow(/not awaiting/);
  });
  it("enforces the report status machine", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false);
    expect(canTransition("APPROVED", "READY_FOR_PAYMENT")).toBe(true);
    expect(canTransition("PAID", "DRAFT")).toBe(false);
  });
});
