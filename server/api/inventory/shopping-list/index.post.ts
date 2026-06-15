import { z } from 'zod'

const addShoppingSchema = z.object({
  ingredientId: z.string(),
  suggestedQty: z.number().positive().optional(),
})

export default defineEventHandler(async (event) => {
  const db = useMockDb()
  const body = await readValidatedBody(event, addShoppingSchema.parse)

  const ingredient = db.ingredients.find(i => i.id === body.ingredientId)
  if (!ingredient) {
    throw createError({ statusCode: 422, statusMessage: 'Insumo no existe' })
  }

  // Cantidad sugerida: la enviada o, por defecto, lo necesario para volver al doble del mínimo.
  const qty = body.suggestedQty
    ?? Math.max(1, +(ingredient.minStock * 2 - ingredient.stock).toFixed(2))

  // Si el insumo ya está en la lista, suma la cantidad en vez de duplicar el ítem.
  const existing = db.shoppingList.find(s => s.ingredientId === ingredient.id)
  if (existing) {
    existing.suggestedQty = +(existing.suggestedQty + qty).toFixed(2)
    existing.estimatedCost = +(existing.suggestedQty * ingredient.unitCost).toFixed(2)
    existing.checked = false
    return ok(existing)
  }

  const item = {
    id: nextId(db, 'shop'),
    ingredientId: ingredient.id,
    name: ingredient.name,
    suggestedQty: qty,
    unit: ingredient.unit,
    estimatedCost: +(qty * ingredient.unitCost).toFixed(2),
    reason: 'Agregado manualmente',
    urgent: ingredient.stock < ingredient.minStock,
    checked: false,
  }
  db.shoppingList.push(item)
  return ok(item)
})
