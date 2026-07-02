import { removeDiscount } from '../../../utils/pos-adapter'

// E04 · HU-04 · Quitar el descuento de una orden. Proxy → backend
// DELETE /api/orders/:id/discount (manager/owner; staff → 403). Devuelve la
// orden fresca ya sin descuento.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const order = await removeDiscount(event, id)
  return ok(order)
})
