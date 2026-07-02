import type { ApiResponse } from "#shared/types/api";
import type { Sale } from "#shared/types/domain";

export interface SaleFilters {
  q?: string;
  docType?: Sale["docType"];
}

export function useSales(filters?: MaybeRefOrGetter<SaleFilters>) {
  return useQuery({
    key: () => ["sales", toValue(filters) ?? {}] as const,
    query: () =>
      $fetch<ApiResponse<Sale[]>>("/api/sales", {
        query: toValue(filters),
      }).then((r) => r.data),
  });
}

export function useSale(id: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ["sales", toValue(id)] as const,
    query: () =>
      $fetch<ApiResponse<Sale>>(`/api/sales/${toValue(id)}`).then(
        (r) => r.data,
      ),
  });
}

/** Resumen de ventas del día calendario (Lima): total + count, sin histórico. */
export interface SalesTodaySummary {
  date: string;
  total: string;
  count: number;
}

/**
 * QA-07 · Card "Hoy" de comprobantes. Fuente AUTORITATIVA del total/conteo del
 * día calendario en Lima (GET /api/sales/today-summary), en vez de sumar toda
 * la lista de comprobantes (que incluye el histórico y daba un total inflado).
 */
export function useSalesTodaySummary() {
  return useQuery({
    key: ["sales", "today-summary"],
    query: () =>
      $fetch<ApiResponse<SalesTodaySummary>>("/api/sales/today-summary").then(
        (r) => r.data,
      ),
  });
}

/**
 * HU-04-07 · Anular un comprobante con razón. El backend exige manager/owner
 * (CASL 'update' 'Sale') → staff recibe 403; ticket no `issued` → 409. Tras
 * anular, invalida la lista y el detalle (el ticket pasa a `status:'void'`).
 */
export function useVoidSale() {
  const cache = useQueryCache();
  return useMutation({
    mutation: ({ id, reason }: { id: string; reason: string }) =>
      $fetch<ApiResponse<Sale>>(`/api/sales/${id}/void`, {
        method: "POST",
        body: { reason },
      }).then((r) => r.data),
    onSettled: () => cache.invalidateQueries({ key: ["sales"] }),
  });
}
