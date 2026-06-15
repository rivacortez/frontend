import { getSale } from '../../utils/pos-adapter'

// E04 (cobros) — Proxy → backend: GET /api/sales/:id. 404 si no existe.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const sale = await getSale(event, id)
  return ok(sale)
})
