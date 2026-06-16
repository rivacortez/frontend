import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import { toFrontendIngredient } from '../../utils/e02-adapter'
import { updateLevel } from '../../utils/inventory-adapter'

interface Envelope<T> { success: boolean, data: T }
interface BeIngredient {
  id: string
  sku: string
  name: string
  type: string
  unit: string
  category: string | null
  unitCost: string
  updatedAt: string
}

const patchIngredientSchema = z.object({
  name: z.string().min(1).optional(),
  // Categoría opcional/nullable en el backend: aceptamos '' (insumo sin categoría)
  // y simplemente no lo reenviamos, en vez de rechazar con 400 (antes min(1)).
  category: z.string().optional(),
  unit: z.string().min(1).optional(),
  unitCost: z.number().nonnegative().optional(),
  // minStock pertenece a Inventario (E05): se enruta a PATCH /api/inventory/levels/:id.
  minStock: z.number().nonnegative().optional(),
  // `stock` no se setea por edición directa (se mueve vía movimientos): se ignora.
  stock: z.number().nonnegative().optional(),
})

// PATCH insumo: los campos de catálogo (E02) van a /api/ingredients/:id; el
// `minStock` (umbral de reorden, E05) va a /api/inventory/levels/:id. Devuelve el
// insumo con el stock/mínimo/estado fusionados desde Inventario.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  }
  const body = await readValidatedBody(event, patchIngredientSchema.parse)

  const beBody: Record<string, unknown> = {}
  if (body.name !== undefined) beBody.name = body.name
  if (body.category && body.category.trim()) beBody.category = body.category.trim()
  if (body.unit !== undefined) beBody.unit = body.unit
  if (body.unitCost !== undefined) beBody.unitCost = body.unitCost

  let updatedAt: string | undefined
  let beIngredient: BeIngredient | undefined
  if (Object.keys(beBody).length > 0) {
    const res = await backendFetch<Envelope<BeIngredient>>(event, `/api/ingredients/${id}`, {
      method: 'PATCH',
      body: beBody,
    })
    beIngredient = res.data
    updatedAt = res.data.updatedAt
  }

  // Umbral de reorden → Inventario (E05). Devuelve el StockView actualizado.
  let level: { stock: string, minStock: string, status: 'ok' | 'low' | 'critical' } | undefined
  if (body.minStock !== undefined) {
    level = await updateLevel(event, id, body.minStock)
  }

  // Si solo se tocó el mínimo (sin cambios de catálogo), traemos el insumo para el shape.
  if (!beIngredient) {
    const res = await backendFetch<Envelope<BeIngredient[]>>(event, '/api/ingredients')
    const found = res.data.find(i => i.id === id)
    if (!found) {
      throw createError({ statusCode: 404, statusMessage: 'Insumo no encontrado' })
    }
    beIngredient = found
    updatedAt = found.updatedAt
  }

  const ing = toFrontendIngredient({ ...beIngredient, updatedAt: updatedAt ?? beIngredient.updatedAt })
  if (level) {
    ing.stock = Number(level.stock)
    ing.minStock = Number(level.minStock)
    ing.status = level.status
  }
  return ok(ing)
})
