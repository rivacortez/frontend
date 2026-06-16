import type { ApiResponse } from '#shared/types/api'
import type { DiningTable, Order, OrderDiscount, OrderPayment, Sale, TableStatus } from '#shared/types/domain'

export function useTables() {
  return useQuery({
    key: ['tables'],
    query: () => $fetch<ApiResponse<DiningTable[]>>('/api/tables').then(r => r.data),
  })
}

export interface TableWithOrder {
  table: DiningTable
  order: Order | null
}

export function useTable(id: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ['tables', toValue(id)] as const,
    query: () =>
      $fetch<ApiResponse<TableWithOrder>>(`/api/tables/${toValue(id)}`).then(r => r.data),
  })
}

function useInvalidateTables() {
  const cache = useQueryCache()
  return () => Promise.all([
    cache.invalidateQueries({ key: ['tables'] }),
    cache.invalidateQueries({ key: ['orders'] }),
  ])
}

export function useOpenTable() {
  const invalidate = useInvalidateTables()
  return useMutation({
    mutation: ({ id, guests, waiter }: { id: string, guests: number, waiter?: string }) =>
      $fetch<ApiResponse<TableWithOrder>>(`/api/tables/${id}/open`, {
        method: 'POST',
        body: { guests, waiter },
      }).then(r => r.data),
    onSettled: invalidate,
  })
}

export function usePatchTable() {
  const invalidate = useInvalidateTables()
  return useMutation({
    mutation: ({ id, ...payload }: { id: string, status?: DiningTable['status'], waiter?: string, guests?: number }) =>
      $fetch<ApiResponse<DiningTable>>(`/api/tables/${id}`, { method: 'PATCH', body: payload })
        .then(r => r.data),
    onSettled: invalidate,
  })
}

export function useAddOrderItems() {
  const invalidate = useInvalidateTables()
  return useMutation({
    mutation: ({ orderId, items }: { orderId: string, items: Array<{ recipeId: string, qty: number, notes?: string }> }) =>
      $fetch<ApiResponse<Order>>(`/api/orders/${orderId}/items`, {
        method: 'POST',
        body: { items },
      }).then(r => r.data),
    onSettled: invalidate,
  })
}

export interface OrderItemUpdate {
  id: string
  qty?: number
  status?: 'pending' | 'preparing' | 'served'
  unitPrice?: number
  remove?: boolean
}

export function usePatchOrder() {
  const invalidate = useInvalidateTables()
  return useMutation({
    mutation: ({ orderId, ...payload }: {
      orderId: string
      discount?: OrderDiscount | null
      itemUpdates?: OrderItemUpdate[]
      status?: 'open' | 'void'
      // HU-03-11: razón al anular (status:'void'). El BFF la mapea a /void {reason}.
      voidReason?: string
    }) =>
      $fetch<ApiResponse<Order>>(`/api/orders/${orderId}`, { method: 'PATCH', body: payload })
        .then(r => r.data),
    onSettled: invalidate,
  })
}

/** HU-03-06 · Enviar la comanda a cocina (rutea ítems a estaciones en el backend). */
export function useSendToKitchen() {
  const invalidate = useInvalidateTables()
  return useMutation({
    mutation: ({ orderId }: { orderId: string }) =>
      $fetch<ApiResponse<Order>>(`/api/orders/${orderId}/send-to-kitchen`, { method: 'POST' })
        .then(r => r.data),
    onSettled: invalidate,
  })
}

export function usePayOrder() {
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ orderId, ...payload }: {
      orderId: string
      payments: OrderPayment[]
      docType?: 'boleta' | 'factura'
      customer?: string
      customerDoc?: string
    }) =>
      $fetch<ApiResponse<{ order: Order, sale: Sale }>>(`/api/orders/${orderId}/pay`, {
        method: 'POST',
        body: payload,
      }).then(r => r.data),
    onSettled: () => Promise.all([
      cache.invalidateQueries({ key: ['tables'] }),
      cache.invalidateQueries({ key: ['orders'] }),
      cache.invalidateQueries({ key: ['sales'] }),
    ]),
  })
}

/* ===== Config del salón (HU-03-01) — gestión de mesas para Ajustes ===== */
// Estas funciones operan sobre el `TableView` CRUDO del backend (code/zoneId/
// capacity), separado del POS: usan la query key ['tables-config'] (distinta de
// la ['tables'] del mapa POS) y rutas dedicadas que no pasan por el pos-adapter.
// El POS (useTables/usePatchTable de arriba) NO cambia.

export interface TableConfig {
  id: string
  zoneId: string
  zoneName: string
  code: string
  capacity: number
  status: string
  posX: number | null
  posY: number | null
}

export interface TableConfigPayload {
  zoneId: string
  code: string
  capacity?: number
}

/** Lista de mesas en shape de config (crudo). GET /api/tables/config. */
export function useTablesConfig() {
  return useQuery({
    key: () => ['tables-config'] as const,
    query: () => $fetch<ApiResponse<TableConfig[]>>('/api/tables/config').then(r => r.data),
  })
}

function useInvalidateTablesConfig() {
  const cache = useQueryCache()
  // Invalida la config + el mapa POS + las zonas (su conteo de mesas cambia).
  return () => Promise.all([
    cache.invalidateQueries({ key: ['tables-config'] }),
    cache.invalidateQueries({ key: ['tables'] }),
    cache.invalidateQueries({ key: ['zones'] }),
  ])
}

export function useCreateTable() {
  const invalidate = useInvalidateTablesConfig()
  return useMutation({
    // 409 si el `code` ya existe en el tenant → el caller lo muestra como toast.
    mutation: (payload: TableConfigPayload) =>
      $fetch<ApiResponse<TableConfig>>('/api/tables', { method: 'POST', body: payload }).then(r => r.data),
    onSettled: invalidate,
  })
}

export function useUpdateTableConfig() {
  const invalidate = useInvalidateTablesConfig()
  return useMutation({
    // Renombrar (code), cambiar capacidad o mover de zona (zoneId). Ruta dedicada
    // /api/tables/:id/config (NO el PATCH del POS, que solo toca status). 409 dup.
    mutation: ({ id, ...payload }: Partial<TableConfigPayload> & { id: string }) =>
      $fetch<ApiResponse<TableConfig>>(`/api/tables/${id}/config`, { method: 'PATCH', body: payload }).then(r => r.data),
    onSettled: invalidate,
  })
}

export function useDeleteTable() {
  const invalidate = useInvalidateTablesConfig()
  return useMutation({
    // 409 si la mesa no está libre (el backend lo bloquea) → toast en el caller.
    mutation: (id: string) =>
      $fetch<ApiResponse<null>>(`/api/tables/${id}`, { method: 'DELETE' }),
    onSettled: invalidate,
  })
}

/** Etiqueta legible del estado de una mesa (para el badge de la pantalla de config). */
export function tableStatusLabel(status: string): string {
  const map: Record<string, string> = {
    free: 'Libre',
    occupied: 'Ocupada',
    bill: 'Por cobrar',
    reserved: 'Reservada',
  }
  return map[status] ?? status
}

export const TABLE_STATUS_VALUES: TableStatus[] = ['free', 'occupied', 'bill', 'reserved']

/** Totales de una orden con descuento aplicado (IGV ya incluido en precios). */
export function orderTotals(order: Order | null | undefined): { gross: number, discount: number, total: number } {
  if (!order) return { gross: 0, discount: 0, total: 0 }
  const gross = order.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0)
  const discount = order.discount
    ? order.discount.type === 'pct' ? gross * (order.discount.value / 100) : order.discount.value
    : 0
  return { gross, discount, total: +(gross - discount).toFixed(2) }
}
