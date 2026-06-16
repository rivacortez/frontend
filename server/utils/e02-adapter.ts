import type { H3Event } from 'h3'
import type { Ingredient, Recipe, RecipeItem } from '#shared/types/domain'
import { backendFetch } from './backend'

/**
 * Adaptador E02 (anti-corruption layer del BFF). El backend NestJS separa
 * Recipe (BOM/costo) de MenuItem (precio/margen/categoría); el frontend trata la
 * "receta" como el plato vendible. Aquí se traduce backend ⇄ frontend para que
 * las pantallas Vue no cambien su contrato (`shared/types/domain.ts`).
 */

interface Envelope<T> { success: boolean, data: T }

const SUB_RECIPE_CATEGORY = 'Bases'

// ---- Formas del backend ----
interface BeRecipeSummary {
  id: string
  name: string
  kind: 'dish' | 'sub_recipe'
  yield: string
  version: number
  emoji: string | null
  description: string | null
  prepMinutes: number | null
  costPerYield: string
}
interface BeRecipeItem {
  id: string
  ingredientId: string | null
  subRecipeId: string | null
  qty: string
  wasteFactor: string
  lineCost: string
}
interface BeRecipeView extends BeRecipeSummary {
  totalCost: string
  items: BeRecipeItem[]
}
interface BeMenuItem {
  id: string
  name: string
  recipeId: string
  menuCategoryId: string | null
  price: string
  imageUrl: string | null
  isActive: boolean
  unitCost: string
  marginPct: string
  lowMargin: boolean
}
interface BeMenuCategory { id: string, name: string, position: number, isActive: boolean }
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

const num = (s: string | null | undefined): number => (s == null ? 0 : Number(s))
const marginOf = (sellPrice: number, cost: number): number =>
  sellPrice > 0 ? Math.round(((sellPrice - cost) / sellPrice) * 100) : 0

// ---- Insumos ----
// El catálogo (E02) ya no gobierna el stock: lo hace Inventario (E05). Este
// adaptador queda catalog-only (stock/mínimos en 0); el BFF fusiona el stock real
// desde `GET /api/inventory/stock` en la ruta (`server/api/ingredients/index.get`).
export function toFrontendIngredient(b: BeIngredient): Ingredient {
  return {
    id: b.id,
    name: b.name,
    category: b.category ?? '',
    unit: b.unit,
    unitCost: num(b.unitCost),
    stock: 0,
    minStock: 0,
    updatedAt: b.updatedAt,
  }
}

// ---- Recetas (lista) ----
async function fetchMenuMaps(event: H3Event) {
  const [items, cats] = await Promise.all([
    backendFetch<Envelope<BeMenuItem[]>>(event, '/api/menu/items'),
    backendFetch<Envelope<BeMenuCategory[]>>(event, '/api/menu/categories'),
  ])
  const itemByRecipe = new Map<string, BeMenuItem>()
  for (const it of items.data) itemByRecipe.set(it.recipeId, it)
  const catName = new Map<string, string>()
  for (const c of cats.data) catName.set(c.id, c.name)
  return { itemByRecipe, catName }
}

function summaryToRecipe(
  r: BeRecipeSummary,
  item: BeMenuItem | undefined,
  catName: Map<string, string>,
): Recipe {
  const cost = num(r.costPerYield)
  const sellPrice = item ? num(item.price) : 0
  const category = item
    ? (item.menuCategoryId ? catName.get(item.menuCategoryId) ?? 'Sin categoría' : 'Sin categoría')
    : SUB_RECIPE_CATEGORY
  return {
    id: r.id,
    name: r.name,
    category,
    kind: r.kind,
    description: r.description ?? undefined,
    emoji: r.emoji ?? undefined,
    sellPrice,
    cost,
    marginPct: marginOf(sellPrice, cost),
    items: [],
    active: item ? item.isActive : true,
    soldToday: 0,
    prepMinutes: r.prepMinutes ?? undefined,
  }
}

export async function listRecipes(event: H3Event): Promise<Recipe[]> {
  const recipes = await backendFetch<Envelope<BeRecipeSummary[]>>(event, '/api/recipes')
  const { itemByRecipe, catName } = await fetchMenuMaps(event)
  return recipes.data.map(r => summaryToRecipe(r, itemByRecipe.get(r.id), catName))
}

// ---- Receta (detalle, con BOM completo) ----
export async function buildRecipeDetail(event: H3Event, id: string): Promise<Recipe> {
  const [view, ingredients, allRecipes] = await Promise.all([
    backendFetch<Envelope<BeRecipeView>>(event, `/api/recipes/${id}`),
    backendFetch<Envelope<BeIngredient[]>>(event, '/api/ingredients'),
    backendFetch<Envelope<BeRecipeSummary[]>>(event, '/api/recipes'),
  ])
  const { itemByRecipe, catName } = await fetchMenuMaps(event)
  const ingById = new Map(ingredients.data.map(i => [i.id, i]))
  const recById = new Map(allRecipes.data.map(r => [r.id, r]))

  const base = summaryToRecipe(view.data, itemByRecipe.get(id), catName)
  const items: RecipeItem[] = view.data.items.map((it) => {
    const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined
    const sub = it.subRecipeId ? recById.get(it.subRecipeId) : undefined
    return {
      ingredientId: it.ingredientId ?? it.subRecipeId ?? '',
      name: ing?.name ?? sub?.name ?? '—',
      qty: num(it.qty),
      unit: ing?.unit ?? 'porción',
      cost: num(it.lineCost),
      wastePct: Math.round(num(it.wasteFactor) * 100),
    }
  })
  return { ...base, items }
}

// ---- Crear / actualizar ----
interface RecipePayload {
  name: string
  category: string
  kind?: 'dish' | 'sub_recipe'
  description?: string
  emoji?: string
  sellPrice: number
  items: RecipeItem[]
  prepMinutes?: number
  active?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Factor a la unidad base de cada familia (masa→g, volumen→ml). Misma tabla que el
// wizard (`convertQty` en recipes/new.vue) para que el costo persistido coincida con
// el mostrado. Las unidades de conteo (u, porción) no se convierten.
const UNIT_FACTOR_TO_BASE: Record<string, number> = { g: 1, kg: 1000, ml: 1, L: 1000 }

/**
 * Convierte `qty` de la unidad de display del BOM (p. ej. 200 g) a la unidad del
 * insumo (p. ej. kg). El backend guarda qty EN la unidad del insumo y recalcula
 * `lineCost = qty × unitCost`; sin convertir, 200 g de un insumo en kg se persiste
 * como 200 kg (costo ×1000). Si alguna unidad no es convertible, deja qty igual.
 */
function convertQtyToIngredientUnit(qty: number, from: string, to: string): number {
  if (!from || from === to) return qty
  const f = UNIT_FACTOR_TO_BASE[from]
  const t = UNIT_FACTOR_TO_BASE[to]
  return f == null || t == null ? qty : qty * (f / t)
}

/**
 * Mapea los ítems del BOM al backend. Los ítems "ad-hoc" del wizard (creados
 * en línea, con id no-UUID y costo manual) se **persisten como insumos** del
 * catálogo antes de referenciarlos — el backend exige que cada ítem apunte a un
 * insumo o sub-receta real. Para insumos reales (UUID) se convierte `qty` de la
 * unidad de la línea a la unidad del insumo antes de persistir (ver bug del costo ×1000).
 */
async function resolveBackendItems(event: H3Event, items: RecipeItem[]) {
  // Unidades de los insumos reales (UUID), para convertir qty a la unidad del insumo.
  const ingUnitById = new Map<string, string>()
  if (items.some(it => UUID_RE.test(it.ingredientId))) {
    const ings = await backendFetch<Envelope<BeIngredient[]>>(event, '/api/ingredients')
    for (const i of ings.data) ingUnitById.set(i.id, i.unit)
  }
  const out: { ingredientId: string, qty: number, wasteFactor: number }[] = []
  for (const it of items) {
    let ingredientId = it.ingredientId
    let qty = it.qty
    if (!UUID_RE.test(ingredientId)) {
      // Ad-hoc: el insumo se crea con la unidad de la línea → qty ya está en esa unidad.
      const unitCost = it.qty > 0 ? it.cost / it.qty : it.cost
      const slug = it.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 32) || 'INSUMO'
      const created = await backendFetch<Envelope<{ id: string }>>(event, '/api/ingredients', {
        method: 'POST',
        body: {
          sku: `AUTO-${slug}-${Math.round(unitCost * 100)}`,
          name: it.name,
          type: 'raw',
          unit: it.unit || 'unidad',
          unitCost: Number(unitCost.toFixed(2)),
        },
      })
      ingredientId = created.data.id
    }
    else {
      // Insumo real: convertir qty de la unidad de la línea a la unidad del insumo.
      const ingUnit = ingUnitById.get(ingredientId)
      if (ingUnit) qty = convertQtyToIngredientUnit(it.qty, it.unit, ingUnit)
    }
    out.push({ ingredientId, qty, wasteFactor: (it.wastePct ?? 0) / 100 })
  }
  return out
}

/** Resuelve (o crea) la categoría de menú por nombre → id. */
async function resolveMenuCategoryId(event: H3Event, name: string): Promise<string> {
  const cats = await backendFetch<Envelope<BeMenuCategory[]>>(event, '/api/menu/categories')
  const found = cats.data.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (found) return found.id
  const created = await backendFetch<Envelope<BeMenuCategory>>(event, '/api/menu/categories', {
    method: 'POST',
    body: { name },
  })
  return created.data.id
}

export async function createRecipe(event: H3Event, payload: RecipePayload): Promise<Recipe> {
  const kind = payload.kind ?? 'dish'
  const items = await resolveBackendItems(event, payload.items)
  const recipe = await backendFetch<Envelope<BeRecipeView>>(event, '/api/recipes', {
    method: 'POST',
    body: {
      name: payload.name,
      kind,
      emoji: payload.emoji,
      description: payload.description,
      prepMinutes: payload.prepMinutes,
      items,
    },
  })
  if (kind === 'dish') {
    const menuCategoryId = payload.category
      ? await resolveMenuCategoryId(event, payload.category)
      : undefined
    await backendFetch<Envelope<BeMenuItem>>(event, '/api/menu/items', {
      method: 'POST',
      body: {
        recipeId: recipe.data.id,
        name: payload.name,
        price: payload.sellPrice,
        menuCategoryId,
        isActive: payload.active ?? true,
      },
    })
  }
  return buildRecipeDetail(event, recipe.data.id)
}

export async function updateRecipe(
  event: H3Event,
  id: string,
  payload: Partial<RecipePayload>,
): Promise<Recipe> {
  const recipeBody: Record<string, unknown> = {}
  if (payload.name !== undefined) recipeBody.name = payload.name
  if (payload.emoji !== undefined) recipeBody.emoji = payload.emoji
  if (payload.description !== undefined) recipeBody.description = payload.description
  if (payload.prepMinutes !== undefined) recipeBody.prepMinutes = payload.prepMinutes
  if (payload.items !== undefined) recipeBody.items = await resolveBackendItems(event, payload.items)
  if (Object.keys(recipeBody).length > 0) {
    await backendFetch<Envelope<BeRecipeView>>(event, `/api/recipes/${id}`, {
      method: 'PATCH',
      body: recipeBody,
    })
  }

  // Datos de venta (precio/estado/categoría/nombre) viven en el MenuItem.
  const touchesMenu =
    payload.sellPrice !== undefined
    || payload.active !== undefined
    || payload.category !== undefined
    || payload.name !== undefined
  if (touchesMenu) {
    const items = await backendFetch<Envelope<BeMenuItem[]>>(event, '/api/menu/items')
    const item = items.data.find(it => it.recipeId === id)
    if (item) {
      const menuBody: Record<string, unknown> = {}
      if (payload.name !== undefined) menuBody.name = payload.name
      if (payload.sellPrice !== undefined) menuBody.price = payload.sellPrice
      if (payload.active !== undefined) menuBody.isActive = payload.active
      if (payload.category !== undefined) {
        menuBody.menuCategoryId = await resolveMenuCategoryId(event, payload.category)
      }
      await backendFetch<Envelope<BeMenuItem>>(event, `/api/menu/items/${item.id}`, {
        method: 'PATCH',
        body: menuBody,
      })
    }
  }
  return buildRecipeDetail(event, id)
}

export async function deleteRecipe(event: H3Event, id: string): Promise<void> {
  // El backend bloquea borrar una receta usada por un plato → borrar el MenuItem primero.
  const items = await backendFetch<Envelope<BeMenuItem[]>>(event, '/api/menu/items')
  const item = items.data.find(it => it.recipeId === id)
  if (item) {
    await backendFetch<Envelope<unknown>>(event, `/api/menu/items/${item.id}`, { method: 'DELETE' })
  }
  await backendFetch<Envelope<unknown>>(event, `/api/recipes/${id}`, { method: 'DELETE' })
}

// ---- Modificadores (HU-02-11) y disponibilidad (HU-02-13) ----
// Cuelgan del MenuItem en el backend; el frontend los gestiona desde el plato (recipeId).

interface BeModifier { id: string, name: string, priceDelta: string, required: boolean, position: number }
interface BeAvailability {
  id: string
  dayOfWeek: number | null
  startMinute: number
  endMinute: number
}
export interface ModifierView { id: string, name: string, priceDelta: number, required: boolean, position: number }
export interface AvailabilityView {
  id: string
  dayOfWeek: number | null
  startMinute: number
  endMinute: number
}

/** Resuelve el MenuItem (plato vendible) de una receta. 400 si la receta no es plato. */
async function requireMenuItemId(event: H3Event, recipeId: string): Promise<string> {
  const items = await backendFetch<Envelope<BeMenuItem[]>>(event, '/api/menu/items')
  const item = items.data.find(it => it.recipeId === recipeId)
  if (!item) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La receta no es un plato vendible (sin precio de venta)',
    })
  }
  return item.id
}

export async function listModifiers(event: H3Event, recipeId: string): Promise<ModifierView[]> {
  const items = await backendFetch<Envelope<BeMenuItem[]>>(event, '/api/menu/items')
  const item = items.data.find(it => it.recipeId === recipeId)
  if (!item) return [] // sub-receta: sin modificadores
  const res = await backendFetch<Envelope<BeModifier[]>>(event, `/api/menu/items/${item.id}/modifiers`)
  return res.data.map(m => ({
    id: m.id,
    name: m.name,
    priceDelta: num(m.priceDelta),
    required: m.required,
    position: m.position,
  }))
}

export async function addModifier(
  event: H3Event,
  recipeId: string,
  body: { name: string, priceDelta?: number, required?: boolean },
): Promise<ModifierView> {
  const itemId = await requireMenuItemId(event, recipeId)
  const res = await backendFetch<Envelope<BeModifier>>(event, `/api/menu/items/${itemId}/modifiers`, {
    method: 'POST',
    body,
  })
  const m = res.data
  return { id: m.id, name: m.name, priceDelta: num(m.priceDelta), required: m.required, position: m.position }
}

export async function removeModifier(event: H3Event, modifierId: string): Promise<void> {
  await backendFetch<Envelope<unknown>>(event, `/api/menu/modifiers/${modifierId}`, { method: 'DELETE' })
}

export async function listAvailability(event: H3Event, recipeId: string): Promise<AvailabilityView[]> {
  const items = await backendFetch<Envelope<BeMenuItem[]>>(event, '/api/menu/items')
  const item = items.data.find(it => it.recipeId === recipeId)
  if (!item) return []
  const res = await backendFetch<Envelope<BeAvailability[]>>(event, `/api/menu/items/${item.id}/availability`)
  return res.data.map(w => ({
    id: w.id,
    dayOfWeek: w.dayOfWeek,
    startMinute: w.startMinute,
    endMinute: w.endMinute,
  }))
}

export async function addAvailability(
  event: H3Event,
  recipeId: string,
  body: { dayOfWeek?: number | null, startMinute: number, endMinute: number },
): Promise<AvailabilityView> {
  const itemId = await requireMenuItemId(event, recipeId)
  const res = await backendFetch<Envelope<BeAvailability>>(event, `/api/menu/items/${itemId}/availability`, {
    method: 'POST',
    body,
  })
  const w = res.data
  return { id: w.id, dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute }
}

export async function removeAvailability(event: H3Event, availabilityId: string): Promise<void> {
  await backendFetch<Envelope<unknown>>(event, `/api/menu/availability/${availabilityId}`, { method: 'DELETE' })
}
