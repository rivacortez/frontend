import { z } from 'zod'
import { patchOrder } from '../../utils/pos-adapter'

const patchOrderSchema = z.object({
  // El descuento tiene endpoint propio (POST/DELETE /orders/:id/discount); este
  // PATCH solo cubre ítems y anulación.
  itemUpdates: z.array(z.object({
    id: z.string(),
    qty: z.number().int().positive().optional(),
    status: z.enum(['pending', 'preparing', 'served']).optional(),
    unitPrice: z.number().nonnegative().optional(),
    remove: z.boolean().optional(),
  })).optional(),
  status: z.enum(['open', 'void']).optional(),
  // HU-03-11: razón de anulación (la UI la envía); el backend la exige en /void.
  voidReason: z.string().optional(),
})

// Proxy → backend E03: itemUpdates → PATCH /items/:itemId; status:'void' →
// POST /void {reason}. unitPrice (ajuste de precio) aún se acepta e ignora.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const body = await readValidatedBody(event, patchOrderSchema.parse)
  const order = await patchOrder(event, id, body)
  return ok(order)
})
