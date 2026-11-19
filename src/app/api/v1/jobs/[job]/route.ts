import { timingSafeEqual } from "node:crypto";
import { publicApi } from "@/server/http/handler";
import { config } from "@/server/config";
import { AppError, notFound } from "@/server/errors";
import { escalateOverdueApprovals } from "@/server/services/approval-service";
import { importEcbRates } from "@/server/services/fx-service";

/** Scheduled jobs, called by an external scheduler (Kubernetes CronJob, cloud scheduler) with a bearer secret. */
export const POST = publicApi(async ({ req, params }) => {
  const secret = config().CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!secret || given.length !== Buffer.byteLength(secret) || !timingSafeEqual(given, Buffer.from(secret))) throw new AppError("UNAUTHENTICATED", "Invalid job credentials");
  switch (params.job) {
    case "escalations": return escalateOverdueApprovals();
    case "fx-rates": return importEcbRates();
    default: throw notFound("Job");
  }
}, { csrf: false });
