import type { ApiResponse } from '#shared/types/api'

/**
 * HU-03-07/08/09 · KDS (Kitchen Display). El backend expone shapes ya
 * frontend-friendly (`KitchenStationView`/`KitchenItemView`), así que estos
 * tipos espejan el contrato del BFF (`server/api/kitchen/**`) sin adapter.
 */
export interface KitchenStation {
  id: string
  name: string
  position: number
}

export interface KitchenModifier {
  name: string
  priceDelta: number
}

export interface KitchenQueueItem {
  orderItemId: string
  orderId: string
  /** Código de la mesa (p. ej. "12" → "Mesa 12"). */
  tableCode: string
  dishName: string
  qty: number
  modifiers: KitchenModifier[]
  notes: string | null
  /** pending | preparing (la cola sólo trae ítems aún por terminar). */
  status: 'pending' | 'preparing'
  sentToKitchenAt: string
  /** Minutos transcurridos desde que se envió a cocina (lo calcula el backend). */
  waitMinutes: number
  /** true si waitMinutes > 10 (umbral de retraso del backend). */
  isLate: boolean
}

/**
 * Polling (no hay SSE en el backend todavía): la cola usa `staleTime` bajo (5s)
 * para que cada `refetch()` disparado por el intervalo de la pantalla pegue de
 * verdad al servidor, y refresca al volver el foco/reconexión. El temporizador
 * vive en la pantalla (`/app/cocina` con `useIntervalFn`); este `staleTime` evita
 * que Pinia Colada sirva caché viejo y haga sentir el KDS en tiempo real.
 * TODO: migrar a SSE cuando el backend lo exponga.
 */
const QUEUE_POLL_STALE_MS = 5_000

export function useKitchenStations() {
  return useQuery({
    key: ['kitchen', 'stations'],
    query: () => $fetch<ApiResponse<KitchenStation[]>>('/api/kitchen/stations').then(r => r.data),
    // Las estaciones cambian poco: caché 5 min para no recargarlas en cada poll.
    staleTime: 5 * 60_000,
  })
}

export function useKitchenQueue(stationId: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    key: () => ['kitchen', 'queue', toValue(stationId) ?? 'all'] as const,
    query: () => {
      const id = toValue(stationId)
      return $fetch<ApiResponse<KitchenQueueItem[]>>('/api/kitchen/queue', {
        query: id ? { stationId: id } : undefined,
      }).then(r => r.data)
    },
    staleTime: QUEUE_POLL_STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

function useInvalidateKitchenQueue() {
  const cache = useQueryCache()
  // Invalida todas las variantes de la cola (cualquier estación + "Todas").
  return () => cache.invalidateQueries({ key: ['kitchen', 'queue'] })
}

/** HU-03-08 · Marcar un ítem como "en preparación" (pending→preparing). */
export function useStartItem() {
  const invalidate = useInvalidateKitchenQueue()
  return useMutation({
    mutation: ({ itemId }: { itemId: string }) =>
      $fetch<ApiResponse<KitchenQueueItem>>(`/api/kitchen/items/${itemId}`, {
        method: 'PATCH',
        body: { status: 'preparing' },
      }).then(r => r.data),
    onSettled: invalidate,
  })
}

/** HU-03-09 · Marcar un ítem como "listo" (preparing→ready); sale de la cola. */
export function useReadyItem() {
  const invalidate = useInvalidateKitchenQueue()
  return useMutation({
    mutation: ({ itemId }: { itemId: string }) =>
      $fetch<ApiResponse<KitchenQueueItem>>(`/api/kitchen/items/${itemId}`, {
        method: 'PATCH',
        body: { status: 'ready' },
      }).then(r => r.data),
    onSettled: invalidate,
  })
}
