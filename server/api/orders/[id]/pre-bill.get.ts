import { getPreBill } from '../../../utils/pos-adapter'

// E04 (cobros) — HU-04-01 · Pre-cuenta. Proxy → backend GET /api/orders/:id/pre-bill.
// Devuelve los totales autoritativos del backend (subtotal/igv/total + líneas) como
// preview, sin persistir. 409 si la orden ya está cerrada (pagada/anulada).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const preBill = await getPreBill(event, id)
  return ok(preBill)
})
