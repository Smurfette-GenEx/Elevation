import { api } from "@/server/http/handler";
import { uploadReceipt } from "@/server/services/receipt-service";
import { AppError, validation } from "@/server/errors";
import { config } from "@/server/config";

export const POST = api(async ({ req, actor }) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > (config().MAX_UPLOAD_MB + 1) * 1024 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", `File exceeds ${config().MAX_UPLOAD_MB} MB`);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw validation("Missing file");
  return uploadReceipt(actor, { name: file.name, type: file.type, body: Buffer.from(await file.arrayBuffer()) });
});
