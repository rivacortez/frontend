import type { ApiResponse } from "#shared/types/api";

/**
 * A single row from the sales history (one sold dish on a given day).
 * Mirrors the backend `SalesHistoryView` DTO returned by GET /api/sales-history.
 */
export interface SalesHistoryRow {
  soldOn: string;
  dishName: string;
  menuItemId: string | null;
  qty: number;
  unitPrice: string;
  total: string;
}

/**
 * Aggregated payload from GET /api/sales-history.
 *
 * `from`/`to` are the actual date boundaries of the data returned by the backend
 * (not simply echoes of the query params). When called without filters, they span
 * the full historical range present in the database.
 * `totalQty` is the sum of `qty` across all returned rows.
 */
export interface SalesHistoryList {
  from: string;
  to: string;
  totalQty: number;
  totalRevenue: string;
  rows: SalesHistoryRow[];
}

/**
 * E11 · HU-11-01 — Fetches the aggregated sales history from the BFF
 * (`GET /api/sales-history`).
 *
 * When `params` is omitted (or `from`/`to` are undefined) the backend returns
 * all historical records, which is the correct behaviour for the "Estado actual"
 * card on the import page (we need the full period and total count).
 *
 * Caches by `['sales-history', params]` so date-filtered views get their own
 * cache entry and don't stomp on the all-time query.
 *
 * @param params - Optional reactive date range filter (`from`/`to` as ISO strings).
 * @returns Pinia-Query result with `data: Ref<SalesHistoryList | undefined>`.
 */
export function useSalesHistory(
  params?: MaybeRefOrGetter<{ from?: string; to?: string }>,
) {
  return useQuery({
    key: () => ["sales-history", toValue(params) ?? {}] as const,
    query: () => {
      const p = toValue(params);
      const q: Record<string, string> = {};
      if (p?.from) q.from = p.from;
      if (p?.to) q.to = p.to;
      return $fetch<ApiResponse<SalesHistoryList>>("/api/sales-history", {
        query: q,
      }).then((r) => r.data);
    },
  });
}
