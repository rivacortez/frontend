import { test, expect, apiSeeder, type OwnerCtx } from './_fixtures'

/**
 * E2E del Catálogo (E02), como dueño y por la UI real (:3000).
 *
 * Aislación: cada test usa la fixture `owner` → tenant nuevo (catálogo de insumos
 * vacío). Los prerequisitos de datos (un insumo para que el picker del BOM lo
 * encuentre) se siembran vía API con el token del owner; el flujo en sí se maneja
 * por la UI. Se excluye todo lo externo/IA (magic-upload, chat, forecast).
 *
 * Flujos cubiertos:
 *   1. Insumos · alta por CSV ("Importar") + reporte (creados/errores) + listado.
 *   2. Insumos · edición de un insumo desde su detalle.
 *   3. Recetas · wizard BOM de 3 pasos → aparece en /app/recetas con costo/margen → detalle.
 *   4. Menú/plato · el plato muestra precio de venta + margen (sano y <25% en riesgo).
 *   5. Modificadores + disponibilidad · se agregan desde el detalle y se ven listados.
 */

/** Espera la hidratación de Nuxt: red en reposo + body visible. */
async function gotoHydrated(page: OwnerCtx['page'], path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('body')).toBeVisible()
}

const uniq = (p: string): string => `${p}-${Date.now()}${Math.floor(Math.random() * 1e4)}`

test.describe('Catálogo E02 (dueño, UI)', () => {
  // ---------------------------------------------------------------------------
  // 1 · Insumos: alta masiva por CSV ("Importar") + reporte + aparece en el listado
  // ---------------------------------------------------------------------------
  test('Insumos · importar CSV muestra el reporte (creados/errores) y se listan', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/inventario')

    // Nombre único por corrida → verificable en el listado tras importar.
    const tomate = `Tomate CSV ${uniq('t')}`
    const csv = [
      'sku,name,type,unit,unitCost,category',
      `CSV-TOMATE-${Date.now()},${tomate},raw,kg,5.5,Verduras y frutas`,
      // Fila inválida (sin nombre) → debe contar como error en el reporte.
      'CSV-BAD,,raw,kg,3,Verduras y frutas',
    ].join('\n')

    // Abrir el sheet de importación.
    await page.getByRole('button', { name: /importar insumos/i }).click()
    const sheet = page.getByRole('dialog', { name: /importar insumos/i })
    await expect(sheet).toBeVisible()

    // El input de archivo está oculto dentro del sheet: setInputFiles funciona directo.
    await sheet.locator('input[type="file"]').setInputFiles({
      name: 'insumos.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    })

    // Reporte: 1 nuevo + 1 con error (línea 3).
    await expect(sheet.getByText(/1 nuevos/i)).toBeVisible()
    await expect(sheet.getByText(/1 con error/i)).toBeVisible()
    await expect(sheet.getByText(/línea 3/i)).toBeVisible()

    // Cerrar el sheet y verificar que el insumo creado aparece en "Mi inventario".
    await sheet.getByRole('button', { name: /cerrar/i }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText(tomate)).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 2 · Insumos: editar un insumo desde su detalle
  // ---------------------------------------------------------------------------
  test('Insumos · editar un insumo desde su detalle persiste los cambios', async ({ owner, request }) => {
    const { page, token } = owner
    const seed = apiSeeder(request, token)
    const original = `Cebolla ${uniq('c')}`
    await seed.ingredient(`SEED-CEB-${Date.now()}`, original, 4)

    // Entrar al detalle desde el listado de Stock (las filas son enlaces).
    await gotoHydrated(page, '/app/inventario')
    await page.getByRole('link', { name: new RegExp(original, 'i') }).click()
    await expect(page).toHaveURL(/\/app\/stock\/product\//)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: original })).toBeVisible()

    // Abrir el editor y cambiar nombre + costo.
    await page.getByRole('button', { name: /editar insumo/i }).click()
    const sheet = page.getByRole('dialog', { name: /editar insumo/i })
    await expect(sheet).toBeVisible()

    const nuevoNombre = `${original} editada`
    const inputs = sheet.locator('input')
    await inputs.nth(0).fill(nuevoNombre) // 0 = Nombre
    // Dejamos la CATEGORÍA vacía a propósito: el insumo sembrado no tiene categoría y
    // editarlo sin completarla debe funcionar (antes el BFF rechazaba category:'' con
    // 400; ahora la omite). Solo cambiamos nombre + costo.
    // El costo es el input con inputmode decimal y placeholder "S/ ..." dentro del sheet.
    const costInput = sheet.locator('input[inputmode="decimal"]').first()
    await costInput.fill('7.25')

    await sheet.getByRole('button', { name: /^guardar$/i }).click()
    await expect(sheet).toBeHidden()

    // El detalle refleja el nuevo nombre y costo (S/ 7.25).
    await expect(page.getByRole('heading', { name: nuevoNombre })).toBeVisible()
    await expect(page.getByText(/7\.25/)).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 3 · Recetas: wizard BOM 3 pasos → aparece en /app/recetas → abrir detalle
  // ---------------------------------------------------------------------------
  test('Recetas · wizard BOM crea el plato y aparece con costo/margen', async ({ owner, request }) => {
    const { page, token } = owner
    const seed = apiSeeder(request, token)
    // Insumo (kg, unitCost 40) para que el picker del BOM lo encuentre.
    const insumo = `Pescado Lenguado ${uniq('p')}`
    await seed.ingredient(`SEED-FISH-${Date.now()}`, insumo, 40)

    const plato = `Ceviche ${uniq('r')}`
    await gotoHydrated(page, '/app/recetas/nueva')

    // ---- Paso 1 · Datos básicos ----
    await page.locator('#recipe-name').fill(plato)
    await page.locator('#recipe-category').selectOption('Marinos')
    await page.locator('#recipe-price').fill('50')
    // aria-label real del botón: "Siguiente paso: insumos".
    await page.getByRole('button', { name: /siguiente.*insumos/i }).click()

    // ---- Paso 2 · Insumos (BOM) ----
    await page.getByRole('button', { name: /agregar primer insumo/i }).click()
    const searchSheet = page.getByRole('dialog', { name: /agregar insumo/i })
    await expect(searchSheet).toBeVisible()
    await searchSheet.locator('#search-insumo').fill(insumo)
    // Resultado del inventario (proviene de /api/ingredients?q=).
    await searchSheet.getByRole('button', { name: new RegExp(insumo, 'i') }).click()

    // Sheet de detalle. Lo expresamos en una SUB-UNIDAD (200 g de un insumo en kg) —
    // que es además el flujo por defecto del wizard (defaultUnitFor → g/200). El BFF
    // debe convertir g→kg antes de persistir: 200 g = 0.2 kg × S/40 = S/8.00. Si NO
    // convirtiera, el backend recibiría qty=200 (kg) y persistiría S/8000 (regresión).
    const detailSheet = page.getByRole('dialog')
    await expect(detailSheet.locator('#qty-input')).toBeVisible()
    await detailSheet.getByLabel(/unidad de medida/i).selectOption('g')
    await detailSheet.locator('#qty-input').fill('200')
    await detailSheet.getByRole('button', { name: /agregar al bom/i }).click()

    // El insumo quedó en la lista del BOM (costo S/ 8.00 = 200 g × S/40/kg).
    await expect(page.getByRole('button', { name: new RegExp(`editar ${insumo}`, 'i') })).toBeVisible()
    await page.getByRole('button', { name: /siguiente: revisión/i }).click()

    // ---- Paso 3 · Revisión (margen saludable: (50-8)/50 = 84%) ----
    await expect(page.getByText(/margen saludable/i)).toBeVisible()
    await page.getByRole('button', { name: /guardar receta/i }).click()

    // Navega al detalle del plato recién creado.
    await expect(page).toHaveURL(/\/app\/recipes\/[0-9a-f-]{36}$/)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: plato, level: 1 })).toBeVisible()

    // Aparece en el listado de recetas con su margen.
    await gotoHydrated(page, '/app/recetas')
    const card = page.getByRole('listitem').filter({ hasText: plato })
    await expect(card).toBeVisible()
    await expect(card.getByText('84%')).toBeVisible()

    // Abrir su detalle desde el listado.
    await card.click()
    await expect(page).toHaveURL(/\/app\/recipes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: plato, level: 1 })).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 4 · Menú/plato: precio de venta + margen; alerta <25% (en riesgo)
  // ---------------------------------------------------------------------------
  test('Menú · el plato muestra precio + margen, y marca riesgo si el margen es bajo', async ({ owner, request }) => {
    const { page, token } = owner
    const seed = apiSeeder(request, token)
    const insumo = `Lomo de Res ${uniq('l')}`
    await seed.ingredient(`SEED-LOMO-${Date.now()}`, insumo, 40)

    const plato = `Lomo Saltado ${uniq('r')}`
    await gotoHydrated(page, '/app/recetas/nueva')

    // Paso 1 · precio BAJO (9.50) → con costo 8 el margen es 16% (<20% crítico en el
    // wizard; <25% "en riesgo" en el detalle, HU-02-10).
    await page.locator('#recipe-name').fill(plato)
    await page.locator('#recipe-category').selectOption('Criollos')
    await page.locator('#recipe-price').fill('9.50')
    // aria-label real del botón: "Siguiente paso: insumos".
    await page.getByRole('button', { name: /siguiente.*insumos/i }).click()

    // Paso 2 · agregar el insumo en GRAMOS (200 g = 0.2 kg × S/40 = S/8.00 persistido,
    // vía la conversión del BFF).
    await page.getByRole('button', { name: /agregar primer insumo/i }).click()
    const searchSheet = page.getByRole('dialog', { name: /agregar insumo/i })
    await searchSheet.locator('#search-insumo').fill(insumo)
    await searchSheet.getByRole('button', { name: new RegExp(insumo, 'i') }).click()
    const detailSheet = page.getByRole('dialog')
    await expect(detailSheet.locator('#qty-input')).toBeVisible()
    await detailSheet.getByLabel(/unidad de medida/i).selectOption('g')
    await detailSheet.locator('#qty-input').fill('200')
    await detailSheet.getByRole('button', { name: /agregar al bom/i }).click()
    await page.getByRole('button', { name: /siguiente: revisión/i }).click()

    // Paso 3 · margen crítico (<20%) → guardar.
    await expect(page.getByText(/margen crítico/i)).toBeVisible()
    await page.getByRole('button', { name: /guardar receta/i }).click()

    // Detalle del plato: precio de venta S/ 9.50, margen y badge de riesgo.
    await expect(page).toHaveURL(/\/app\/recipes\/[0-9a-f-]{36}$/)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: plato, level: 1 })).toBeVisible()
    // Precio de carta (hero) + margen mostrado (16% = (9.50-8)/9.50).
    await expect(page.getByText('9.50').first()).toBeVisible()
    await expect(page.getByText('16%').first()).toBeVisible()
    // HU-02-10: por debajo de 25% el plato se marca "en riesgo" → badge de tendencia
    // a la baja en el bloque de margen (aria-label "Bajó de X% a Y% en 30 días").
    await expect(page.getByLabel(/bajó de .* en 30 días/i)).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 5 · Modificadores + disponibilidad desde el detalle del plato
  // ---------------------------------------------------------------------------
  test('Catálogo · agregar modificador y ventana de disponibilidad al plato', async ({ owner, request }) => {
    const { page, token } = owner
    const seed = apiSeeder(request, token)
    const insumo = `Pollo ${uniq('p')}`
    const ing = await seed.ingredient(`SEED-POLLO-${Date.now()}`, insumo, 12)
    // Plato vendible (receta + menu item con precio) sembrado vía API → vamos directo al detalle.
    const recipe = await seed.recipe(`Pollo a la Brasa ${uniq('r')}`, ing.id, 0.5)
    await seed.menuItem(recipe.id, 'Pollo a la Brasa', 60)

    await gotoHydrated(page, `/app/recetas/${recipe.id}`)
    await expect(page.getByRole('heading', { name: /pollo a la brasa/i, level: 1 })).toBeVisible()

    // ---- Modificador (HU-02-11): nombre + Δ precio ----
    const modName = page.getByPlaceholder(/nombre \(ej\. extra queso\)/i)
    await modName.scrollIntoViewIfNeeded()
    await modName.fill('Extra ají')
    await page.getByLabel(/Δ precio/i).fill('3')
    // El botón de submit del form de modificadores (icono +) está junto al delta.
    await page.locator('form').filter({ has: modName }).getByRole('button').click()

    // Aparece en la lista de modificadores con su delta.
    await expect(page.getByText('Extra ají')).toBeVisible()
    await expect(page.getByText('+S/ 3.00')).toBeVisible()

    // ---- Ventana de disponibilidad (HU-02-13) ----
    const desde = page.getByLabel(/^desde$/i)
    await desde.scrollIntoViewIfNeeded()
    await page.getByLabel(/^día$/i).selectOption('1') // Lunes
    await desde.fill('12:00')
    await page.getByLabel(/^hasta$/i).fill('15:00')
    await page.locator('form').filter({ has: desde }).getByRole('button').click()

    // Aparece la ventana en la lista (no en el <option> del select): día + rango.
    const window = page.locator('.rx-item').filter({ hasText: /12:00\s*[–-]\s*15:00/ })
    await expect(window).toBeVisible()
    await expect(window).toContainText('Lunes')
  })
})
