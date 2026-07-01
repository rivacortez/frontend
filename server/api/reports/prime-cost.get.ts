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
 * All `*Pct` fields are plain numbers (percentages, not strings).
 */
export interface PrimeCostBenchmarks {
  primeCostGoodMax: number;
  primeCostWarningMax: number;
  foodCostGoodMin: number;
  foodCostGoodMax: number;
  laborCostGoodMin: number;
  laborCostGoodMax: number;
  foodCostStatus: CostStatus;
  laborCostStatus: CostStatus;
}

/**
 * Full payload of GET /api/reports/prime-cost.
 * Money fields (revenue, foodCost, laborCost, primeCost) are decimal strings (PEN).
 * Percentage fields (foodCostPct, laborCostPct, primeCostPct) are plain numbers.
 */
export interface PrimeCostReportView {
  period: string;
  revenue: Money;
  foodCost: Money;
  foodCostPct: number;
  laborCost: Money;
  laborCostPct: number;
  primeCost: Money;
  primeCostPct: number;
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
