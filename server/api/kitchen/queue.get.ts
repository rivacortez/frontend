import { backendFetch } from '../../utils/backend'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

// HU-03-07 · Ítem en la cola del KDS (pending|preparing ya enviados a cocina).
interface KitchenItemView {
  orderItemId: string
  orderId: string
  tableCode: string
  dishName: string
  qty: number
  modifiers: { name: string, priceDelta: number }[]
  notes: string | null
  status: string
  sentToKitchenAt: string
  waitMinutes: number
  isLate: boolean
}

// Proxy autenticado → backend E03: GET /api/kitchen/queue?stationId=<uuid?>.
// Reenvía `stationId` tal cual (vacío = todas las estaciones). El backend ordena
// por sentToKitchenAt asc y calcula waitMinutes/isLate. Sin adapter (shape directo).
export default defineEventHandler((event) => {
  const { stationId } = getQuery(event)
  const query: Record<string, unknown> = {}
  if (typeof stationId === 'string' && stationId.trim()) {
    query.stationId = stationId
  }
  return backendFetch<ApiEnvelope<KitchenItemView[]>>(event, '/api/kitchen/queue', { query })
})
