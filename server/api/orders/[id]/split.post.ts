import { z } from 'zod'
import { splitOrder } from '../../../utils/pos-adapter'

// E04 (cobros) — HU-04-03 · Dividir cuenta. Proxy → backend POST /api/orders/:id/split.
// Dos modos: `equal` (N partes iguales del total; `parts` ≥ 2, default = comensales),
// e `items` (agrupa ítems por `assignments`, cada ítem asignado exactamente una vez).
// Cómputo de display, no persiste (pagar sigue siendo /pay). 400 si las partes/asignaciones
// no son válidas; 409 si la orden ya está cerrada.
const splitSchema = z
  .object({
    mode: z.enum(['equal', 'items']),
    parts: z.number().int().min(2).optional(),
    assignments: z
      .array(z.object({
        label: z.string().min(1),
        itemIds: z.array(z.string()).min(1),
      }))
      .min(1)
      .optional(),
  })
  .refine(v => v.mode !== 'items' || v.assignments !== undefined, {
    message: 'El modo "items" requiere assignments',
    path: ['assignments'],
  })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const body = await readValidatedBody(event, splitSchema.parse)
  const result = await splitOrder(event, id, body)
  return ok(result)
})
