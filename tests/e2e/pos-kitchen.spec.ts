import { test, expect, apiSeeder, type OwnerCtx } from './_fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * E2E E03 — POS (salón/mesas) + Cocina/KDS, manejado como OWNER por la UI real.
 *
 * Aislación: cada test usa el fixture `owner` (tenant nuevo + login) → su propia
 * mesa/plato/cola. Los prerequisitos de catálogo (zona, mesa, insumo, receta y el
 * plato vendible enrutado a una estación de cocina) se siembran vía API con el
 * token del owner (rápido); el flujo en sí se ejerce SIEMPRE por la UI (:3000).
 *
 * Nota de modelo de datos (clave): el catálogo del POS (PosCatalogSheet) lista
 * RECETAS con `kind==='dish' && active`, agrupadas por `category` y con `sellPrice`.
 * Esos tres campos NO viven en la Recipe del backend: el BFF los une desde el
 * MenuItem (category = su categoría de carta, sellPrice = price, active = isActive).
 * Por eso el plato se siembra como MenuItem con `menuCategoryId` (categoría ligada a
 * una estación de cocina, para que `send-to-kitchen` lo rutee) + `isActive:true`.
 * Excluye servicios externos/IA (chat/forecast/ingesta), fuera de alcance.
 */

/** Sufijo único por test → códigos/nombres irrepetibles dentro del tenant. */
function uniq(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e4)}`.slice(-6)
}

interface PosPrereqs {
  zoneId: string
  tableId: string
  tableCode: string
  tableNumber: number
  stationId: string
  categoryId: string
  recipeId: string
  menuItemId: string
  dishName: string
  price: number
}

/**
 * Siembra vía API el catálogo mínimo para un flujo de POS:
 * estación de cocina → categoría de carta ligada a esa estación → insumo →
 * receta (plato) → MenuItem en la categoría (precio + activo) → zona → mesa.
 * El `tableCode` es numérico para que el POS derive `number = parseInt(code)`
 * (y la mesa aparezca como "Mesa NN" tanto en el mapa como en el KDS).
 */
async function seedPos(
  request: APIRequestContext,
  token: string,
  opts: { code?: string, price?: number, dishName?: string } = {},
): Promise<PosPrereqs> {
  const seed = apiSeeder(request, token)
  const tag = uniq()
  // Código numérico de mesa (estable y legible como "Mesa NN").
  const tableCode = opts.code ?? String(10 + (Number(tag) % 80))
  const price = opts.price ?? 100
  const dishName = opts.dishName ?? `Lomo Saltado ${tag}`

  // 1) Estación de cocina + categoría de carta enrutada a ella (HU-03-07).
  const station = await seed.post<{ id: string }>('/api/kitchen/stations', { name: `Caliente ${tag}` })
  const category = await seed.post<{ id: string }>('/api/menu/categories', {
    name: `Principales ${tag}`,
    kitchenStationId: station.id,
  })

  // 2) Insumo + receta (BOM mínimo) — la receta exige >=1 ítem.
  // El catálogo del POS muestra el NOMBRE DE LA RECETA (no el del MenuItem), así
  // que la receta se nombra igual que el plato para que aparezca como `dishName`.
  const ingredient = await seed.ingredient(`SKU-${tag}`, `Carne ${tag}`, 20)
  const recipe = await seed.recipe(dishName, ingredient.id, 1)

  // 3) Plato vendible: MenuItem en la categoría (precio + activo) → catálogo POS.
  const menuItem = await seed.post<{ id: string }>('/api/menu/items', {
    recipeId: recipe.id,
    menuCategoryId: category.id,
    name: dishName,
    price,
    isActive: true,
  })

  // 4) Salón: zona + mesa (la mesa libre es la que se abre en el POS).
  const zone = await seed.zone(`Salón ${tag}`)
  const table = await seed.table(zone.id, tableCode, 6)

  return {
    zoneId: zone.id,
    tableId: table.id,
    tableCode,
    tableNumber: Number(tableCode),
    stationId: station.id,
    categoryId: category.id,
    recipeId: recipe.id,
    menuItemId: menuItem.id,
    dishName,
    price,
  }
}

/** Etiqueta "Mesa NN" (cero-rellenada) como la pintan el mapa POS y el KDS. */
function mesaLabel(n: number): string {
  return `Mesa ${String(n).padStart(2, '0')}`
}

/** Espera a que Nuxt hidrate y la red quede en reposo tras navegar. */
async function gotoReady(page: OwnerCtx['page'], path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

/**
 * Abre una mesa libre desde el mapa POS (libre → ocupada) con N comensales y
 * llega al detalle de la mesa. Devuelve cuando el detalle está cargado.
 */
async function openTableFromMap(page: OwnerCtx['page'], p: PosPrereqs, guests = 4): Promise<void> {
  await gotoReady(page, '/app/pos')
  const card = page.getByRole('button', { name: new RegExp(`Mesa 0*${p.tableNumber},`) })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Libre')
  await card.click()

  // Sheet "Abrir Mesa NN" → fijar comensales con los atajos y confirmar.
  const sheet = page.getByRole('dialog', { name: new RegExp(`Abrir Mesa 0*${p.tableNumber}`) })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: String(guests), exact: true }).click()
  await Promise.all([
    page.waitForURL(new RegExp(`/app/pos/mesa/${p.tableId}`)),
    sheet.getByRole('button', { name: /abrir mesa/i }).click(),
  ])
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: mesaLabel(p.tableNumber) })).toBeVisible()
}

/**
 * En el detalle de la mesa: abre el catálogo, agrega `qty` del plato sembrado
 * y confirma. Tras esto el plato queda en "Por enviar" (aún no en cocina).
 */
async function addDishToCart(page: OwnerCtx['page'], p: PosPrereqs, qty = 1): Promise<void> {
  await page.getByRole('button', { name: /agregar item/i }).click()
  const catalog = page.getByRole('dialog')
  await expect(catalog).toBeVisible()
  const addBtn = catalog.getByRole('button', { name: new RegExp(`Agregar ${p.dishName}`) })
  await expect(addBtn).toBeVisible()
  await addBtn.click()
  // Cantidades extra con el "+" del stepper de esa tarjeta.
  for (let i = 1; i < qty; i++) {
    await catalog.getByRole('button', { name: new RegExp(`Aumentar ${p.dishName}`) }).click()
  }
  // CTA "Agregar al pedido" (cierra el sheet y vuelca al carrito "Por enviar").
  await catalog.getByRole('button', { name: /agregar al pedido/i }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.describe('POS · salón + abrir mesa + tomar orden', () => {
  test('Ajustes → crear zona y mesa, y aparecen en la lista', async ({ owner }) => {
    const tag = uniq()
    const zoneName = `Terraza ${tag}`
    const tableCode = String(20 + (Number(tag) % 70))

    await gotoReady(owner.page, '/app/settings/tables')

    // Crear zona: botón "Nueva zona" del empty-state o el "+" de la cabecera.
    const newZoneBtn = owner.page.getByRole('button', { name: /nueva zona/i })
    const addZoneIcon = owner.page.getByRole('button', { name: /^nueva zona$/i })
    if (await newZoneBtn.count()) await newZoneBtn.first().click()
    else await addZoneIcon.first().click()
    const zoneSheet = owner.page.getByRole('dialog', { name: /nueva zona/i })
    await expect(zoneSheet).toBeVisible()
    await zoneSheet.getByPlaceholder('Terraza').fill(zoneName)
    await zoneSheet.getByRole('button', { name: /crear zona/i }).click()
    await expect(zoneSheet).toBeHidden()
    await expect(owner.page.getByRole('heading', { name: new RegExp(zoneName) })).toBeVisible()

    // Crear mesa dentro de esa zona ("Agregar mesa" de la sección).
    await owner.page.getByRole('button', { name: /agregar mesa/i }).first().click()
    const tableSheet = owner.page.getByRole('dialog', { name: /nueva mesa/i })
    await expect(tableSheet).toBeVisible()
    await tableSheet.getByPlaceholder('12').fill(tableCode)
    await tableSheet.locator('input[type="number"]').fill('4')
    await tableSheet.getByRole('button', { name: /crear mesa/i }).click()
    await expect(tableSheet).toBeHidden()

    // La mesa nueva aparece en la lista de su zona, marcada como Libre.
    const row = owner.page.locator('.cat-row-name').filter({ hasText: `Mesa ${tableCode}` })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Libre')
  })

  test('mapa POS → abrir mesa (libre→ocupada) con comensales', async ({ owner, request }) => {
    const p = await seedPos(request, owner.token)
    await openTableFromMap(owner.page, p, 4)

    // El detalle confirma la apertura: subtítulo con zona y N personas.
    await expect(owner.page.locator('.md-sub')).toContainText('4 personas')

    // De vuelta en el mapa, la mesa figura como Ocupada (ya no Libre).
    await gotoReady(owner.page, '/app/pos')
    const card = owner.page.getByRole('button', { name: new RegExp(`Mesa 0*${p.tableNumber},`) })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Ocupada')
  })

  test('tomar orden: agregar plato y ver el subtotal', async ({ owner, request }) => {
    const p = await seedPos(request, owner.token, { price: 100 })
    await openTableFromMap(owner.page, p, 2)
    await addDishToCart(owner.page, p, 2)

    // "Por enviar" muestra el plato ×2 y su subtotal de línea (100 × 2 = S/ 200.00).
    const pending = owner.page.locator('.md-section.pending')
    await expect(pending).toBeVisible()
    await expect(pending.getByText(p.dishName)).toBeVisible()
    await expect(pending.getByText('×2')).toBeVisible()
    await expect(pending.getByText(/S\/\s*200[.,]00/)).toBeVisible()

    // El resumen de la mesa refleja 2 items y el total S/ 200.00.
    const resumen = owner.page.locator('.md-resumen')
    await expect(resumen.getByText('2 items')).toBeVisible()
    await expect(resumen.getByText(/S\/\s*200[.,]00/)).toBeVisible()
  })
})

test.describe('Cocina/KDS · enviar, iniciar, listo y servir', () => {
  test('enviar a cocina → aparece en el KDS, iniciar y marcar listo', async ({ owner, request }) => {
    const p = await seedPos(request, owner.token)
    await openTableFromMap(owner.page, p, 3)
    await addDishToCart(owner.page, p, 1)

    // Enviar a cocina (persiste los ítems y los rutea a la estación).
    await owner.page.getByRole('button', { name: /enviar .* a cocina/i }).click()
    // El ítem pasa a "En curso" en la mesa (ya no está "Por enviar").
    await expect(owner.page.locator('.md-section.pending')).toBeHidden()
    await expect(owner.page.locator('.md-section.live').getByText(p.dishName)).toBeVisible()

    // KDS: el ítem está en la cola de la mesa correspondiente.
    await gotoReady(owner.page, '/app/cocina')
    const card = owner.page.locator('.kds-card').filter({ hasText: p.dishName })
    await expect(card).toBeVisible()
    await expect(card).toContainText(mesaLabel(p.tableNumber))
    await expect(card).toContainText('Pendiente')

    // Iniciar (pending → preparing): la tarjeta pasa a "En preparación".
    await card.getByRole('button', { name: /iniciar/i }).click()
    await expect(card).toContainText('En preparación')

    // Listo (preparing → ready): el ítem sale de la cola.
    await card.getByRole('button', { name: /listo/i }).click()
    await expect(owner.page.locator('.kds-card').filter({ hasText: p.dishName })).toHaveCount(0)
  })

  test('servir el ítem desde la mesa', async ({ owner, request }) => {
    const p = await seedPos(request, owner.token)
    await openTableFromMap(owner.page, p, 2)
    await addDishToCart(owner.page, p, 1)
    await owner.page.getByRole('button', { name: /enviar .* a cocina/i }).click()

    // Abrir el ítem "En curso" → mini-sheet de opciones → "Marcar como servido".
    const liveItem = owner.page.locator('.md-section.live .md-item').filter({ hasText: p.dishName })
    await expect(liveItem).toBeVisible()
    await liveItem.click()
    const menu = owner.page.locator('.mini-sheet')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: /marcar como servido/i }).click()
    await expect(menu).toBeHidden()

    // El ítem queda con el pill "Servido".
    await expect(liveItem.getByText('Servido')).toBeVisible()
  })
})

test.describe('POS · anular orden con motivo', () => {
  test('cerrar mesa sin cobrar exige y registra un motivo', async ({ owner, request }) => {
    const p = await seedPos(request, owner.token)
    await openTableFromMap(owner.page, p, 2)
    await addDishToCart(owner.page, p, 1)
    await owner.page.getByRole('button', { name: /enviar .* a cocina/i }).click()
    await expect(owner.page.locator('.md-section.live').getByText(p.dishName)).toBeVisible()

    // Más opciones de mesa → "Cerrar sin cobrar" (solo dueño).
    await owner.page.getByRole('button', { name: /más opciones de mesa/i }).click()
    const actions = owner.page.getByRole('dialog', { name: new RegExp(`Mesa 0*${p.tableNumber}`) })
    await expect(actions).toBeVisible()
    await actions.getByRole('button', { name: /cerrar sin cobrar/i }).click()

    // Modal de confirmación: el botón está deshabilitado hasta elegir motivo.
    const dialog = owner.page.getByRole('alertdialog', { name: /cerrar mesa .* sin cobrar/i })
    await expect(dialog).toBeVisible()
    const confirm = dialog.getByRole('button', { name: /sí, cerrar sin cobrar/i })
    await expect(confirm).toBeDisabled()
    await dialog.getByRole('radio', { name: /error de cocina/i }).click()
    await expect(confirm).toBeEnabled()

    // Confirmar anula la orden (status:void + reason) y libera la mesa → vuelve al mapa.
    await Promise.all([
      owner.page.waitForURL(/\/app\/pos(\/)?$/),
      confirm.click(),
    ])
    await owner.page.waitForLoadState('networkidle')

    // La mesa quedó libre de nuevo (orden anulada, sin venta).
    const card = owner.page.getByRole('button', { name: new RegExp(`Mesa 0*${p.tableNumber},`) })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Libre')
  })
})
