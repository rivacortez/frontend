import { backendFetch } from "../../utils/backend";

interface Envelope<T> {
  success: boolean;
  data: T;
}

type Money = string;

/** Status of a cost metric against its benchmark band. */
export type CostStatus = "good" | "warning" | "high";

/**
 * Benchmark thresholds included in the prime-cost report.
 *
 * All fields are Prisma `Decimal` columns on the backend, which NestJS
 * serializes to JSON as decimal **strings** (e.g. `"60.00"`) to avoid
 * floating-point precision loss in transit — the same convention already
 * used for money fields elsewhere in this file. They previously were
 * (incorrectly) typed as `number` here even though the backend always sent
 * strings, which let `Array.prototype`-less consumers call `.toFixed()`
 * directly on them and crash at runtime (see prime-cost.vue `fmtPct`).
 * Convert with `toNumber`/`num()` before doing arithmetic or formatting.
 */
export interface PrimeCostBenchmarks {
  primeCostGoodMax: Money;
  primeCostWarningMax: Money;
  foodCostGoodMin: Money;
  foodCostGoodMax: Money;
  laborCostGoodMin: Money;
  laborCostGoodMax: Money;
  foodCostStatus: CostStatus;
  laborCostStatus: CostStatus;
}

/**
 * Full payload of GET /api/reports/prime-cost.
 * ALL numeric fields (money and percentages alike — foodCostPct, laborCostPct,
 * primeCostPct included) are decimal strings (PEN / Prisma `Decimal`), never
 * plain `number`. Only `period` and `status` are non-numeric. Consumers must
 * coerce with `toNumber`/`num()` before formatting or arithmetic.
 */
export interface PrimeCostReportView {
  period: string;
  revenue: Money;
  foodCost: Money;
  foodCostPct: Money;
  laborCost: Money;
  laborCostPct: Money;
  primeCost: Money;
  primeCostPct: Money;
  status: CostStatus;
  benchmarks: PrimeCostBenchmarks;
}

// E07 · Prime Cost · Proxy autenticado → backend GET /api/reports/prime-cost.
// Requiere `period=YYYY-MM`. Leer Report → owner/manager; staff → 403.
export default defineEventHandler(async (event) => {
  const { period } = getQuery(event);
  if (!period) {
    throw createError({
      statusCode: 400,
      statusMessage: "Falta el período (YYYY-MM)",
    });
  }
  const res = await backendFetch<Envelope<PrimeCostReportView>>(
    event,
    "/api/reports/prime-cost",
    { query: { period } },
  );
  return ok(res.data);
});
