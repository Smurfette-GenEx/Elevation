/**
 * Runs a scheduled job directly (alternative to POST /api/v1/jobs/:job with CRON_SECRET).
 *   npm run jobs:escalate   — escalate approvals past their SLA
 *   npm run jobs:fx         — import ECB daily reference rates
 */
import { prisma } from "../src/server/db";
import { escalateOverdueApprovals } from "../src/server/services/approval-service";
import { importEcbRates } from "../src/server/services/fx-service";

const jobs: Record<string, () => Promise<unknown>> = { escalations: escalateOverdueApprovals, "fx-rates": importEcbRates };

const name = process.argv[2];
if (!name || !jobs[name]) {
  console.error(`Usage: run-job <${Object.keys(jobs).join("|")}>`);
  process.exit(1);
}
jobs[name]()
  .then((r) => console.log(JSON.stringify({ job: name, result: r })))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
