import { z } from 'zod'
import { payOrder } from '../../../utils/pos-adapter'

// E04 (cobros) — Proxy → backend: POST /api/orders/:id/pay. Emite el ticket +
// registra los pagos y cierra la orden (libera la mesa). El total/IGV los calcula
// el backend desde los ítems vivos; el body solo trae pagos + datos del comprobante.
// El BFF mapea {order, sale} al contrato del frontend (pos-adapter), de modo que
// `usePayOrder` y las pantallas (CobrarSheet/split) siguen igual.
// Errores que propaga el backend: 400 (Σpagos < total), 409 (orden ya cobrada/no cobrable).
const paySchema = z.object({
  payments: z.array(z.object({
    method: z.enum(['cash', 'card', 'yape', 'plin']),
    amount: z.number().positive(),
  })).min(1),
  docType: z.enum(['boleta', 'factura']).default('boleta'),
  customer: z.string().optional(),
  customerDoc: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const body = await readValidatedBody(event, paySchema.parse)
  const result = await payOrder(event, id, body)
  return ok(result)
})
