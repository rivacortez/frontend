import { test, expect, apiSeeder } from './_fixtures'

/**
 * E2E del flujo de Inventario + Órdenes de Compra (E05), manejado como OWNER por la UI real.
 *
 * Aislación: cada test usa su PROPIO tenant (fixture `owner` → registro+login). Los
 * prerequisitos de datos (insumo, stock inicial, proveedor) se siembran vía la API del
 * backend con el token del owner (rápido); los flujos bajo prueba se ejercen por la UI.
 *
 * Notas del contrato del backend (verificadas contra :3333):
 *  - El stock SOLO se mueve por movimientos; `apiSeeder.movement(id,'purchase',n)` lo sube.
 *  - El umbral de reorden (minStock) vive en Inventario: el backend solo expone
 *    `PATCH /api/inventory/levels/:id` (POST → 404). Como `apiSeeder.post` es POST, el
 *    minStock se fija por la UI real (sheet "Editar insumo" → "Stock mínimo"), que es lo
 *    que pide el flujo ("via the UI level edit").
 *  - Estado de stock: `critical` cuando stock ≤ min·0.5; `low` cuando 0.5·min < stock < min;
 *    si no, `ok`.
 *  - La merma (type='waste') EXIGE `reason` (el backend devuelve 400 sin él).
 *  - OC: crear → draft; enviar → sent; recepcionar (parcial → partially_received, total →
 *    received, y sube el stock); cancelar (draft|sent → cancelled). Recepcionar un draft → 409.
 */

/** Espera la hidratación de Nuxt tras navegar (igual patrón que el login del harness). */
async function gotoHydrated(page: import('@playwright/test').Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

/** SKU único por test para no colisionar entre corridas en la misma DB. */
function sku(prefix = 'INV'): string {
  return `${prefix}-${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

/**
 * Crea un insumo CON categoría vía API (el `apiSeeder.ingredient` no la setea, y el
 * sheet "Editar insumo" reenvía la categoría: con `null`/'' el backend valida 400).
 * Para los flujos que tocan el sheet de edición sembramos una categoría real.
 */
function seedIngredientWithCat(
  seed: ReturnType<typeof apiSeeder>,
  name: string,
  category: string,
  unitCost = 10,
): Promise<{ id: string }> {
  return seed.post('/api/ingredients', { sku: sku(), name, type: 'raw', unit: 'kg', unitCost, category })
}

/**
 * Fija el minStock (umbral de reorden) por la UI real: abre el sheet "Editar insumo"
 * del detalle del producto, escribe el mínimo y guarda. Asume estar ya en el detalle.
 * El input "Stock mínimo" es el PRIMERO del par min/max (grid .pd-sheet-row).
 */
async function setMinStock(page: import('@playwright/test').Page, min: number): Promise<void> {
  await page.getByRole('button', { name: /editar insumo/i }).click()
  const editSheet = page.getByRole('dialog', { name: /editar insumo/i })
  await expect(editSheet).toBeVisible()
  // El sheet tiene dos filas (grid .pd-sheet-row): Categoría/Unidad y Mínimo/Máximo.
  // Tomamos la fila que contiene "Stock mínimo"; el mínimo es su PRIMER input.
  const minField = editSheet.locator('.pd-sheet-row').filter({ hasText: 'Stock mínimo' }).locator('input').first()
  await minField.fill(String(min))
  await editSheet.getByRole('button', { name: /guardar/i }).click()
  await expect(editSheet).toBeHidden()
}

test.describe('Inventario + Órdenes de Compra (E05) — owner por la UI', () => {
  // ===== Stock: ver un insumo con stock y estado en /app/stock =====
  test('insumo con stock y mínimo aparece en /app/stock con su estado (Bajo)', async ({ owner, request }) => {
    const seed = apiSeeder(request, owner.token)
    const ing = await seedIngredientWithCat(seed, 'Tomate E2E', 'Verduras y frutas', 10)
    // Stock inicial 50 (vía API). El mínimo se fija por la UI más abajo.
    await seed.movement(ing.id, 'purchase', 50)

    // Fijar minStock = 60 por la UI (sheet "Editar insumo" en el detalle del producto).
    // 50/60 = 0.83 → estado "low" (Bajo).
    await gotoHydrated(owner.page, `/app/stock/product/${ing.id}`)
    await expect(owner.page.getByRole('heading', { name: 'Tomate E2E' })).toBeVisible()

    await setMinStock(owner.page, 60)

    // El detalle ya refleja mínimo 60 y estado "Stock Bajo".
    await expect(owner.page.getByText('Stock Bajo')).toBeVisible()

    // En la lista /app/stock el insumo aparece con su estado "Bajo".
    await gotoHydrated(owner.page, '/app/stock')
    const row = owner.page.locator('.stk-row', { hasText: 'Tomate E2E' })
    await expect(row).toBeVisible()
    await expect(row.locator('.stk-status-dot')).toContainText('Bajo')
  })

  // ===== Movimiento: registrar una ENTRADA en /app/stock/move y verificar que sube el stock =====
  test('registrar una entrada en /app/stock/move sube el stock', async ({ owner, request }) => {
    const seed = apiSeeder(request, owner.token)
    const ing = await seed.ingredient(sku(), 'Cebolla E2E', 8)
    await seed.movement(ing.id, 'purchase', 10) // stock inicial 10

    await gotoHydrated(owner.page, '/app/stock/move')
    // "Entrada" es el tipo por defecto, pero lo seleccionamos explícitamente (resiliente).
    await owner.page.getByRole('radio', { name: /entrada/i }).click()

    // Buscar y elegir el insumo.
    await owner.page.getByPlaceholder('Buscar insumo…').fill('Cebolla E2E')
    await owner.page.getByRole('option', { name: /Cebolla E2E/i }).click()
    await expect(owner.page.locator('.mr-prod-name')).toHaveText('Cebolla E2E')

    // Cantidad 5 (chip rápido) → nuevo stock 15.
    await owner.page.getByRole('group', { name: /cantidades rápidas/i }).getByRole('button', { name: '5', exact: true }).click()
    await expect(owner.page.locator('.mr-new-stock')).toContainText('15')

    // Motivo (entrada): Compra.
    await owner.page.getByRole('radio', { name: /Compra/i }).click()

    // Registrar → navega a /app/stock.
    await Promise.all([
      owner.page.waitForURL(/\/app\/stock(\/|$)/),
      owner.page.getByRole('button', { name: /Registrar entrada/i }).click(),
    ])

    // Verificar el nuevo stock en el detalle del producto (15 kg).
    await gotoHydrated(owner.page, `/app/stock/product/${ing.id}`)
    const stockKv = owner.page.locator('.pd-kv', { hasText: 'Stock actual' })
    await expect(stockKv.locator('.value')).toContainText('15')
  })

  // ===== Movimiento: registrar una SALIDA reduce el stock =====
  test('registrar una salida en /app/stock/move reduce el stock', async ({ owner, request }) => {
    const seed = apiSeeder(request, owner.token)
    const ing = await seed.ingredient(sku(), 'Papa E2E', 5)
    await seed.movement(ing.id, 'purchase', 20) // stock inicial 20

    await gotoHydrated(owner.page, '/app/stock/move')
    await owner.page.getByRole('radio', { name: /salida/i }).click()

    await owner.page.getByPlaceholder('Buscar insumo…').fill('Papa E2E')
    await owner.page.getByRole('option', { name: /Papa E2E/i }).click()

    // Cantidad 5 → nuevo stock 15.
    await owner.page.getByRole('group', { name: /cantidades rápidas/i }).getByRole('button', { name: '5', exact: true }).click()
    await expect(owner.page.locator('.mr-new-stock')).toContainText('15')

    // Motivo de salida: Consumo (cocina).
    await owner.page.getByRole('radio', { name: /Consumo/i }).click()

    await Promise.all([
      owner.page.waitForURL(/\/app\/stock(\/|$)/),
      owner.page.getByRole('button', { name: /Registrar salida/i }).click(),
    ])

    await gotoHydrated(owner.page, `/app/stock/product/${ing.id}`)
    const stockKv = owner.page.locator('.pd-kv', { hasText: 'Stock actual' })
    await expect(stockKv.locator('.value')).toContainText('15')
  })

  // ===== Merma: registrar un desperdicio con razón → aparece en /app/stock/mermas =====
  test('registrar una merma con razón aparece en /app/stock/mermas', async ({ owner, request }) => {
    const seed = apiSeeder(request, owner.token)
    const ing = await seed.ingredient(sku(), 'Lechuga E2E', 4)
    await seed.movement(ing.id, 'purchase', 12) // stock inicial 12

    await gotoHydrated(owner.page, '/app/stock/move')
    await owner.page.getByRole('radio', { name: /salida/i }).click()

    await owner.page.getByPlaceholder('Buscar insumo…').fill('Lechuga E2E')
    await owner.page.getByRole('option', { name: /Lechuga E2E/i }).click()

    // Cantidad 2.
    await owner.page.getByRole('group', { name: /cantidades rápidas/i }).getByRole('button', { name: '2', exact: true }).click()

    // Motivo "Merma / Daño" (type='waste' → exige reason; la página la arma con motivo+nota).
    await owner.page.getByRole('radio', { name: /Merma\s*\/\s*Daño/i }).click()

    // Nota opcional que ayuda a identificar la merma en el listado.
    await owner.page.getByLabel('Nota del movimiento').fill('Producto en mal estado E2E')

    await Promise.all([
      owner.page.waitForURL(/\/app\/stock(\/|$)/),
      owner.page.getByRole('button', { name: /Registrar salida/i }).click(),
    ])

    // En Mermas debe aparecer la pérdida con su nombre, cantidad y costo total > 0.
    await gotoHydrated(owner.page, '/app/stock/mermas')
    const wasteRow = owner.page.locator('.wa-row', { hasText: 'Lechuga E2E' })
    await expect(wasteRow).toBeVisible()
    await expect(wasteRow).toContainText('Producto en mal estado E2E')
    await expect(wasteRow.locator('.wa-qty')).toContainText('2')
    // Resumen: 1 merma y costo total perdido > 0 (2 kg × S/ 4 = S/ 8.00).
    await expect(owner.page.locator('.wa-sum-count')).toContainText('1 merma')
    await expect(owner.page.locator('.wa-sum-value')).toContainText('8')
  })

  // ===== Alerta de stock bajo: empujar el stock por debajo del mínimo → crítico =====
  test('una salida que deja el stock bajo el mínimo lo marca como crítico', async ({ owner, request }) => {
    const seed = apiSeeder(request, owner.token)
    const ing = await seedIngredientWithCat(seed, 'Aji E2E', 'Verduras y frutas', 15)
    await seed.movement(ing.id, 'purchase', 20) // stock inicial 20

    // Fijar minStock = 20 por la UI. Tras una salida fuerte el stock cae a ≤ 50% → crítico.
    await gotoHydrated(owner.page, `/app/stock/product/${ing.id}`)
    await setMinStock(owner.page, 20)
    // Con 20/20 el estado es OK al inicio.
    await expect(owner.page.getByText('Stock OK')).toBeVisible()

    // Salida de 14 → stock 6 (≤ 50% de 20) → crítico.
    await gotoHydrated(owner.page, '/app/stock/move')
    await owner.page.getByRole('radio', { name: /salida/i }).click()
    await owner.page.getByPlaceholder('Buscar insumo…').fill('Aji E2E')
    await owner.page.getByRole('option', { name: /Aji E2E/i }).click()
    await owner.page.locator('.mr-qty-input').fill('14')
    await expect(owner.page.locator('.mr-new-stock')).toContainText('6')
    await owner.page.getByRole('radio', { name: /Consumo/i }).click()
    await Promise.all([
      owner.page.waitForURL(/\/app\/stock(\/|$)/),
      owner.page.getByRole('button', { name: /Registrar salida/i }).click(),
    ])

    // En /app/stock el insumo aparece como crítico (sección "Insumos Críticos" + estado "Crítico").
    await gotoHydrated(owner.page, '/app/stock')
    const row = owner.page.locator('.stk-row', { hasText: 'Aji E2E' })
    await expect(row).toBeVisible()
    await expect(row.locator('.stk-status-dot.crit')).toContainText('Crítico')

    // Y el detalle del producto lo confirma como "Stock Crítico".
    await gotoHydrated(owner.page, `/app/stock/product/${ing.id}`)
    await expect(owner.page.getByText('Stock Crítico')).toBeVisible()
  })

  // ===== Órdenes de compra: crear, enviar, recepcionar (parcial→total) y cancelar otra =====
  test('OC: crear, enviar, recepcionar (parcial y total → sube stock) y cancelar', async ({ owner, request }) => {
    const seed = apiSeeder(request, owner.token)
    const ing = await seed.ingredient(sku(), 'Arroz E2E', 6)
    await seed.movement(ing.id, 'purchase', 5) // stock inicial 5
    // Proveedor (prerequisito vía API; el RUC tiene 11 dígitos como pide el backend).
    await seed.post('/api/suppliers', { name: 'Proveedor E2E', ruc: '20123456789' })

    await gotoHydrated(owner.page, '/app/stock/purchase-orders')

    // --- Crear OC (proveedor + 1 ítem: 30 × S/ 12 = S/ 360) ---
    await owner.page.getByRole('button', { name: /^Nueva$/i }).click()
    const createSheet = owner.page.getByRole('dialog', { name: /Nueva orden de compra/i })
    await expect(createSheet).toBeVisible()
    // El proveedor ya viene preseleccionado (único). Llenar cantidad y costo de la línea.
    await createSheet.locator('.po-line-qty').first().fill('30')
    await createSheet.locator('.po-line-cost').first().fill('12')
    await expect(createSheet.locator('.po-total-row b')).toContainText('360')
    await createSheet.getByRole('button', { name: /Crear borrador/i }).click()
    await expect(createSheet).toBeHidden()

    // La OC aparece en la lista como "Borrador" con su total.
    const card = owner.page.locator('.po-card', { hasText: 'Proveedor E2E' })
    await expect(card).toBeVisible()
    await expect(card.locator('.po-badge')).toContainText('Borrador')
    await expect(card).toContainText('360')

    // --- Abrir detalle → ENVIAR ---
    await card.click()
    const detailSheet = owner.page.getByRole('dialog', { name: /Proveedor E2E/i })
    await expect(detailSheet).toBeVisible()
    await detailSheet.getByRole('button', { name: /Enviar al proveedor/i }).click()
    // Tras enviar, el detalle pasa a "Enviada" y ofrece recepcionar.
    await expect(detailSheet.getByText('Enviada')).toBeVisible()

    // --- RECEPCIÓN PARCIAL (10 de 30) → stock 5 + 10 = 15 ---
    const itemRow = detailSheet.locator('.po-detail-item').first()
    await itemRow.locator('.po-di-qty').fill('10')
    await detailSheet.getByRole('button', { name: /Recepcionar/i }).click()
    // El ítem ahora muestra 10 / 30 recibido y el estado es "Parcial".
    await expect(itemRow.locator('.po-di-meta')).toContainText('10')
    await expect(detailSheet.getByText('Parcial')).toBeVisible()

    // --- RECEPCIÓN TOTAL (los 20 restantes) → stock 15 + 20 = 35, estado "Recibida" ---
    await itemRow.getByRole('button', { name: /Recibir todo/i }).click()
    await detailSheet.getByRole('button', { name: /Recepcionar/i }).click()
    await expect(detailSheet.getByText('Recibida')).toBeVisible()

    // Cerrar el detalle.
    await detailSheet.getByRole('button', { name: /Cerrar/i }).click()
    await expect(detailSheet).toBeHidden()

    // El stock del insumo subió a 35 (5 + 10 + 20) por las recepciones.
    await gotoHydrated(owner.page, `/app/stock/product/${ing.id}`)
    const stockKv = owner.page.locator('.pd-kv', { hasText: 'Stock actual' })
    await expect(stockKv.locator('.value')).toContainText('35')

    // --- Cancelar OTRA OC ---
    await gotoHydrated(owner.page, '/app/stock/purchase-orders')
    await owner.page.getByRole('button', { name: /^Nueva$/i }).click()
    const create2 = owner.page.getByRole('dialog', { name: /Nueva orden de compra/i })
    await create2.locator('.po-line-qty').first().fill('5')
    await create2.locator('.po-line-cost').first().fill('12')
    await create2.getByRole('button', { name: /Crear borrador/i }).click()
    await expect(create2).toBeHidden()

    // Debe haber 2 OCs ahora; abrir la nueva (borrador, total 60) y cancelarla.
    const draftCard = owner.page.locator('.po-card', { hasText: 'Proveedor E2E' })
      .filter({ has: owner.page.locator('.po-badge.draft') })
    await draftCard.first().click()
    const detail2 = owner.page.getByRole('dialog', { name: /Proveedor E2E/i })
    await detail2.getByRole('button', { name: /Cancelar OC/i }).click()
    await expect(detail2).toBeHidden()

    // La OC cancelada aparece con el badge "Cancelada".
    const cancelledCard = owner.page.locator('.po-card', { hasText: 'Proveedor E2E' })
      .filter({ has: owner.page.locator('.po-badge.cancelled') })
    await expect(cancelledCard).toHaveCount(1)
    await expect(cancelledCard.locator('.po-badge')).toContainText('Cancelada')
  })
})
