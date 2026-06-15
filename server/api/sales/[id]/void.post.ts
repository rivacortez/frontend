import { z } from 'zod'
import { voidSale } from '../../../utils/pos-adapter'

// E04 (cobros) — HU-04-07 · Anular ticket con razón. Proxy → backend POST
// /api/sales/:id/void {reason}. El backend exige manager/owner (CASL 'update'
// 'Sale') → staff recibe 403; ticket no `issued` → 409. La razón es obligatoria.
const voidSchema = z.object({ reason: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const { reason } = await readValidatedBody(event, voidSchema.parse)
  const sale = await voidSale(event, id, reason)
  return ok(sale)
})
