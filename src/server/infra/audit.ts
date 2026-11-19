import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import type { Actor } from "../auth/scope";

export interface AuditEntry {
  action: string; // e.g. "report.submitted", "fx.override", "user.role_granted"
  entityType: string;
  entityId: string;
  legalEntityId?: string | null;
  data?: Prisma.InputJsonValue;
}

/** Writes to the append-only audit log (UPDATE/DELETE are blocked by a DB trigger). */
export async function audit(actor: Pick<Actor, "id" | "groupId"> | null, entry: AuditEntry, tx: Tx = prisma, ip?: string | null) {
  const groupId = actor?.groupId ?? (await tx.group.findFirstOrThrow({ select: { id: true } })).id;
  await tx.auditLog.create({
    data: {
      groupId,
      actorId: actor?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      legalEntityId: entry.legalEntityId ?? null,
      data: entry.data,
      ip: ip ?? null,
    },
  });
}
