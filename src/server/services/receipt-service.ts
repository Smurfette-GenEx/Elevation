import { prisma } from "../db";
import { sha256 } from "../domain/duplicates";
import { newStorageKey, storage, validateUpload } from "../infra/storage";
import { ocrProvider } from "../infra/ocr";
import { audit } from "../infra/audit";
import { reportReadWhere, type Actor } from "../auth/scope";
import { notFound } from "../errors";

export async function uploadReceipt(actor: Actor, file: { name: string; type: string; body: Buffer }) {
  const { mime, ext } = validateUpload(file.name, file.type, file.body);
  const hash = sha256(file.body);
  const key = newStorageKey(actor.legalEntityId, ext);
  await storage().put(key, file.body, mime);

  // Duplicate document detection (same bytes already uploaded anywhere in the group)
  const duplicate = await prisma.receipt.findFirst({
    where: { sha256: hash, owner: { groupId: actor.groupId } },
    include: { expenses: { include: { report: { select: { number: true, employeeId: true } } } } },
  });

  const receipt = await prisma.receipt.create({
    data: {
      ownerId: actor.id,
      legalEntityId: actor.legalEntityId,
      storageKey: key,
      fileName: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120),
      mimeType: mime,
      sizeBytes: file.body.length,
      sha256: hash,
      ocrStatus: ocrProvider() ? "PENDING" : "NOT_REQUESTED",
    },
  });

  let ocr = null;
  const provider = ocrProvider();
  if (provider) {
    try {
      ocr = await provider.extract(file.body, mime, file.name);
      await prisma.receipt.update({ where: { id: receipt.id }, data: { ocrStatus: "COMPLETED", ocrProvider: provider.name, ocrData: ocr as object } });
    } catch (e) {
      await prisma.receipt.update({ where: { id: receipt.id }, data: { ocrStatus: "FAILED", ocrProvider: provider.name, ocrData: { error: (e as Error).message } } });
    }
  }
  await audit(actor, { action: "receipt.uploaded", entityType: "Receipt", entityId: receipt.id, legalEntityId: actor.legalEntityId, data: { sha256: hash, size: file.body.length, duplicateOf: duplicate?.id ?? null } });

  return {
    id: receipt.id,
    fileName: receipt.fileName,
    mimeType: mime,
    ocr,
    duplicate: duplicate
      ? { receiptId: duplicate.id, usedIn: duplicate.expenses.map((e) => (e.report.employeeId === actor.id ? e.report.number : "another employee's report")) }
      : null,
  };
}

/** Records that the user reviewed and confirmed (possibly corrected) OCR data. */
export async function confirmOcr(actor: Actor, receiptId: string) {
  const res = await prisma.receipt.updateMany({ where: { id: receiptId, ownerId: actor.id }, data: { ocrStatus: "CONFIRMED", ocrConfirmedAt: new Date() } });
  if (!res.count) throw notFound("Receipt");
}

/** Returns a short-lived signed URL if the actor may see the receipt. */
export async function receiptUrl(actor: Actor, receiptId: string) {
  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });
  if (!receipt) throw notFound("Receipt");
  if (receipt.ownerId !== actor.id) {
    const visible = await prisma.expenseReport.findFirst({
      where: { AND: [await reportReadWhere(actor), { expenses: { some: { receiptId } } }] },
      select: { id: true },
    });
    if (!visible) throw notFound("Receipt");
  }
  return { url: await storage().signedUrl(receipt.storageKey, 300), mimeType: receipt.mimeType, fileName: receipt.fileName };
}
