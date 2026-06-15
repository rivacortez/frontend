import { z } from 'zod'
import { backendFetch } from '../../../utils/backend'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

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

// HU-03-08/09 · Avanzar un ítem en cocina: pending→preparing→ready.
const patchKitchenItemSchema = z.object({
  status: z.enum(['preparing', 'ready']),
})

// Proxy autenticado → backend E03: PATCH /api/kitchen/items/:itemId.
// El backend valida la transición (409 si no es válida) y aplica CASL ('update'
// Kitchen → staff ✓). Se propaga el mensaje de error para mostrarlo como toast.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del ítem' })
  }
  const body = await readValidatedBody(event, patchKitchenItemSchema.parse)
  return backendFetch<ApiEnvelope<KitchenItemView>>(event, `/api/kitchen/items/${id}`, {
    method: 'PATCH',
    body,
  })
})
