import { prisma, type Tx } from "../db";
import { email } from "../infra/email";
import { config } from "../config";

export const NOTIFICATION_TYPES = {
  REPORT_SUBMITTED: "Expense report submitted",
  APPROVAL_PENDING: "Approval pending",
  REPORT_APPROVED: "Expense report approved",
  REPORT_REJECTED: "Expense report rejected",
  INFO_REQUESTED: "Additional information requested",
  REIMBURSEMENT_INITIATED: "Reimbursement initiated",
  PAYMENT_COMPLETED: "Payment completed",
  POLICY_VIOLATION: "Policy violation",
  BUDGET_THRESHOLD: "Budget threshold exceeded",
  APPROVAL_ESCALATED: "Approval escalated",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

/**
 * Creates in-app notifications (inside the caller's transaction, so they are only visible
 * if the business change commits) and returns a function that sends the emails afterwards.
 */
export async function notify(input: NotifyInput, tx: Tx = prisma): Promise<() => Promise<void>> {
  const ids = [...new Set(input.userIds)].filter(Boolean);
  if (!ids.length) return async () => {};
  const [users, prefs] = await Promise.all([
    tx.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, email: true } }),
    tx.notificationPreference.findMany({ where: { userId: { in: ids }, type: input.type } }),
  ]);
  const prefOf = new Map(prefs.map((p) => [p.userId, p]));
  const inApp = users.filter((u) => prefOf.get(u.id)?.inApp ?? true);
  const byEmail = users.filter((u) => prefOf.get(u.id)?.email ?? true);
  if (inApp.length) {
    await tx.notification.createMany({
      data: inApp.map((u) => ({ userId: u.id, type: input.type, title: input.title, body: input.body, link: input.link ?? null, emailedAt: byEmail.some((b) => b.id === u.id) ? new Date() : null })),
    });
  }
  return async () => {
    const link = input.link ? `\n\nOpen: ${config().APP_URL}${input.link}` : "";
    await Promise.allSettled(byEmail.map((u) => email().send({ to: u.email, subject: input.title, text: `${input.body}${link}` })));
  };
}

export async function runAfterCommit(senders: (() => Promise<void>)[]) {
  await Promise.allSettled(senders.map((s) => s()));
}

export async function listNotifications(userId: string, limit = 50) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(userId: string, ids: string[] | "all") {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

export async function getPreferences(userId: string) {
  const prefs = await prisma.notificationPreference.findMany({ where: { userId } });
  return Object.keys(NOTIFICATION_TYPES).map((type) => {
    const p = prefs.find((x) => x.type === type);
    return { type, label: NOTIFICATION_TYPES[type as NotificationType], inApp: p?.inApp ?? true, email: p?.email ?? true };
  });
}

export async function setPreferences(userId: string, prefs: { type: string; inApp: boolean; email: boolean }[]) {
  const valid = prefs.filter((p) => p.type in NOTIFICATION_TYPES);
  await prisma.$transaction(
    valid.map((p) =>
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: p.type } },
        create: { userId, ...p },
        update: { inApp: p.inApp, email: p.email },
      }),
    ),
  );
}
