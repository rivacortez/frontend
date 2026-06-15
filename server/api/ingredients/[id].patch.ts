import { z } from 'zod'

const patchIngredientSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  unitCost: z.number().nonnegative().optional(),
  minStock: z.number().nonnegative().optional(),
  stock: z.number().nonnegative().optional(),
})

export default defineEventHandler(async (event) => {
  const db = useMockDb()
  const id = getRouterParam(event, 'id')
  const ingredient = db.ingredients.find(i => i.id === id)
  if (!ingredient) {
    throw createError({ statusCode: 404, statusMessage: 'Insumo no encontrado' })
  }

  const body = await readValidatedBody(event, patchIngredientSchema.parse)
  Object.assign(ingredient, body)
  ingredient.updatedAt = new Date().toISOString()
  return ok(ingredient)
})
