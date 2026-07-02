import { z } from 'zod'
import { applyDiscount } from '../../../utils/pos-adapter'

// E04 · HU-04 · Aplicar descuento a una orden. Proxy → backend
// POST /api/orders/:id/discount. El backend valida rol (manager/owner; staff → 403)
// y monto (400 si un descuento por monto excede el bruto). Devuelve la orden fresca.
const discountSchema = z.object({
  type: z.enum(['pct', 'amount']),
  value: z.number().positive(),
  reason: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const body = await readValidatedBody(event, discountSchema.parse)
  const order = await applyDiscount(event, id, body)
  return ok(order)
})
