import type { ApiResponse } from '#shared/types/api'
import type { PreBill, SplitResult } from '#shared/types/domain'

/**
 * Composables E04 (cobros) que no son de comprobantes (esos viven en `use-sales.ts`):
 * pre-cuenta (HU-04-01) y dividir cuenta (HU-04-03). Ambos son cómputos del backend
 * que NO persisten — la pre-cuenta es una `useQuery` por orden; el split es una
 * `useMutation` porque el body (modo/partes/asignaciones) varía con la interacción.
 */

/** HU-04-01 · Pre-cuenta: totales autoritativos del backend (preview). */
export function usePreBill(orderId: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    key: () => ['pre-bill', toValue(orderId) ?? ''] as const,
    // Solo dispara con una orden válida (la pantalla la habilita al pedir la cuenta).
    enabled: () => !!toValue(orderId),
    query: () =>
      $fetch<ApiResponse<PreBill>>(`/api/orders/${toValue(orderId)}/pre-bill`).then(r => r.data),
  })
}

export interface SplitInput {
  orderId: string
  mode: 'equal' | 'items'
  parts?: number
  assignments?: { label: string, itemIds: string[] }[]
}

/** HU-04-03 · Dividir cuenta: por persona (`equal`, `parts`) o por items (`items`, `assignments`). */
export function useSplitOrder() {
  return useMutation({
    mutation: ({ orderId, ...body }: SplitInput) =>
      $fetch<ApiResponse<SplitResult>>(`/api/orders/${orderId}/split`, {
        method: 'POST',
        body,
      }).then(r => r.data),
  })
}
