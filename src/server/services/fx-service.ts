import { prisma } from "../db";
import { FxTable, parseEcbXml, type RateRecord } from "../domain/fx";
import { toDateOnly } from "../domain/dates";
import { audit } from "../infra/audit";
import { assertCan, type Actor } from "../auth/scope";
import { businessRule } from "../errors";

/** Loads rates relevant for conversions between two dates (with a staleness margin). */
export async function loadFxTable(from: Date, to: Date): Promise<FxTable> {
  const rows = await prisma.exchangeRate.findMany({
    where: { effectiveDate: { gte: new Date(from.getTime() - 15 * 86400_000), lte: to } },
  });
  const records: RateRecord[] = rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: r.rate,
    effectiveDate: r.effectiveDate,
    source: r.source,
  }));
  return new FxTable(records, "EUR");
}

export async function listRates(filter: { currency?: string; limit?: number }) {
  return prisma.exchangeRate.findMany({
    where: filter.currency ? { OR: [{ baseCurrency: filter.currency }, { quoteCurrency: filter.currency }] } : undefined,
    orderBy: [{ effectiveDate: "desc" }, { quoteCurrency: "asc" }],
    take: filter.limit ?? 200,
  });
}

export async function addManualRate(actor: Actor, input: { baseCurrency: string; quoteCurrency: string; rate: string; effectiveDate: string; justification: string }) {
  assertCan(actor, "fx:manage");
  if (input.baseCurrency === input.quoteCurrency) throw businessRule("Base and quote currency must differ");
  const rate = await prisma.exchangeRate.upsert({
    where: {
      baseCurrency_quoteCurrency_effectiveDate_source: {
        baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency,
        effectiveDate: toDateOnly(input.effectiveDate),
        source: "MANUAL",
      },
    },
    create: { ...input, effectiveDate: toDateOnly(input.effectiveDate), source: "MANUAL", createdById: actor.id },
    update: { rate: input.rate, justification: input.justification, createdById: actor.id },
  });
  await audit(actor, { action: "fx.manual_rate", entityType: "ExchangeRate", entityId: rate.id, data: { ...input } });
  return rate;
}

/** Imports the ECB daily reference rates (EUR base). Idempotent per date. */
export async function importEcbRates(fetchImpl: typeof fetch = fetch): Promise<{ date: string; count: number }> {
  const res = await fetchImpl("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ECB feed unavailable (${res.status})`);
  const parsed = parseEcbXml(await res.text());
  await prisma.$transaction(
    parsed.rates.map((r) =>
      prisma.exchangeRate.upsert({
        where: { baseCurrency_quoteCurrency_effectiveDate_source: { baseCurrency: "EUR", quoteCurrency: r.currency, effectiveDate: parsed.date, source: "ECB" } },
        create: { baseCurrency: "EUR", quoteCurrency: r.currency, rate: r.rate, effectiveDate: parsed.date, source: "ECB" },
        update: {},
      }),
    ),
  );
  await audit(null, { action: "fx.ecb_import", entityType: "ExchangeRate", entityId: parsed.date.toISOString().slice(0, 10), data: { count: parsed.rates.length } });
  return { date: parsed.date.toISOString().slice(0, 10), count: parsed.rates.length };
}
