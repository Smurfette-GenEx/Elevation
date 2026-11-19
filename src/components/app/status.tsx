import { Badge } from "@/components/ui/badge";

const REPORT: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SUBMITTED: { label: "Submitted", variant: "default" },
  UNDER_REVIEW: { label: "Under review", variant: "default" },
  INFO_REQUESTED: { label: "Info requested", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  READY_FOR_PAYMENT: { label: "Ready for payment", variant: "success" },
  PAYMENT_INITIATED: { label: "Payment initiated", variant: "success" },
  PAID: { label: "Paid", variant: "outline" },
};

export function ReportStatusBadge({ status }: { status: string }) {
  const s = REPORT[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const v = severity === "CRITICAL" || severity === "HIGH" ? "destructive" : severity === "MEDIUM" ? "warning" : "secondary";
  return <Badge variant={v}>{severity.toLowerCase()}</Badge>;
}

export function ActionBadge({ action }: { action: string }) {
  const map: Record<string, ["destructive" | "warning" | "secondary", string]> = { BLOCK: ["destructive", "Blocking"], REQUIRE_EXCEPTION: ["warning", "Exception required"], WARN: ["secondary", "Warning"] };
  const [v, l] = map[action] ?? ["secondary", action];
  return <Badge variant={v}>{l}</Badge>;
}

export function GenericBadge({ value }: { value: string }) {
  const good = ["APPROVED", "PAID", "SETTLED", "COMPLETED", "EXCEPTION_APPROVED", "OPEN_PERIOD"];
  const bad = ["REJECTED", "FAILED", "EXCEPTION_REJECTED", "CANCELLED"];
  const warn = ["REQUESTED", "PENDING", "INITIATED", "PARTIALLY_SETTLED", "INFO_REQUESTED", "DRAFT", "SENT"];
  const v = good.includes(value) ? "success" : bad.includes(value) ? "destructive" : warn.includes(value) ? "warning" : "secondary";
  return <Badge variant={v}>{value.replaceAll("_", " ").toLowerCase()}</Badge>;
}
