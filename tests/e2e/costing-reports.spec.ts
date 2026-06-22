import { test, expect, apiSeeder, BACKEND, type OwnerCtx } from './_fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * E2E de los flujos de gestión: E06 Costeo (costo/margen por plato + sugerencia de
 * precio) y E07 Reportes (dashboard ejecutivo + tabs + export CSV), manejados por la
 * UI real como owner. Cada test usa su PROPIO tenant (fixture `owner`) → aislado por RLS.
 *
 * Los prerequisitos de datos (insumo, receta, plato, una venta pagada, CIF del mes) se
 * siembran vía la API del backend con el token del owner (rápido y determinista). Lo que
 * se verifica es la UI: que las pantallas rendericen lo sembrado.
 *
 * EXCLUIDO a propósito: nada de IA/externo (forecast E08, chat E09). Estas pantallas no
 * montan widgets de forecast, así que no se asercionan.
 */

/** Período `YYYY-MM` del mes actual en Lima (igual criterio que las pantallas). */
function currentPeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Lima',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}

interface SeedResult {
  menuItemId: string
  dishName: string
  period: string
  saleTotal: number
}

/**
 * Siembra (vía API, como owner) un escenario de gestión COMPLETO para el período actual:
 * zona + mesa, insumo, receta (dish), plato, una orden con N unidades del plato, el cobro
 * (pago en efectivo por el total exacto que calcula el backend) y un CIF del mes.
 *
 * El CIF se prorratea entre las unidades vendidas: con un CIF alto y pocas unidades, el
 * costo total del plato supera su precio → margen negativo (<25%) → la fila se resalta como
 * "margen bajo" (clase .low). Esto ejercita de forma determinista el resaltado de la tabla.
 */
async function seedManagementScenario(
  request: APIRequestContext,
  owner: OwnerCtx,
  opts: { dishName?: string, price?: number, units?: number, cif?: number } = {},
): Promise<SeedResult> {
  const seeder = apiSeeder(request, owner.token)
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`
  const dishName = opts.dishName ?? `Plato ${stamp}`
  const price = opts.price ?? 100
  const units = opts.units ?? 2
  const cif = opts.cif ?? 600
  const period = currentPeriod()
  const auth = { headers: { Authorization: `Bearer ${owner.token}` } }

  // Catálogo + salón.
  const zone = await seeder.zone('Salón')
  const table = await seeder.table(zone.id, `M${stamp.slice(-4)}`, 4)
  const ingredient = await seeder.ingredient(`SKU-${stamp}`, `Insumo ${stamp}`, 10)
  const recipe = await seeder.recipe(`Receta ${stamp}`, ingredient.id, 1)
  const menuItem = await seeder.menuItem(recipe.id, dishName, price)

  // Orden → ítems → cobro. El backend calcula el total; lo leemos del pre-bill y pagamos
  // ese monto exacto (pagar de menos → 422). Así la venta queda emitida (issued) hoy.
  const order = await seeder.post<{ id: string }>('/api/orders', { tableId: table.id, guests: 2 })
  await seeder.post(`/api/orders/${order.id}/items`, { items: [{ menuItemId: menuItem.id, qty: units }] })
  const preBill = await request.get(`${BACKEND}/api/orders/${order.id}/pre-bill`, auth)
  expect(preBill.ok(), `pre-bill -> ${preBill.status()}`).toBeTruthy()
  const total = Number(((await preBill.json()) as { data: { total: string } }).data.total)
  await seeder.post(`/api/orders/${order.id}/pay`, {
    payments: [{ method: 'cash', amount: total }],
    docType: 'boleta',
  })

  // CIF del mes (se prorratea sobre las unidades vendidas → costo total del plato).
  await seeder.post('/api/overhead-costs', { period, concept: 'Alquiler', amount: cif })

  return { menuItemId: menuItem.id, dishName, period, saleTotal: total }
}

/** Espera a que Nuxt hidrate la ruta (red en reposo) tras navegar. */
async function gotoApp(owner: OwnerCtx, path: string): Promise<void> {
  await owner.page.goto(path)
  await owner.page.waitForLoadState('networkidle')
}

test.describe('E06 · Costeo y márgenes', () => {
  test('la tabla de costo/margen por plato renderiza ingredientes, costo total y margen', async ({ owner, request }) => {
    const { dishName } = await seedManagementScenario(request, owner, { cif: 600, units: 2 })

    await gotoApp(owner, '/app/costeo')
    const page = owner.page

    // Encabezado de la pantalla.
    await expect(page.getByRole('heading', { name: /costeo y márgenes/i })).toBeVisible()

    // Sección de la tabla (espera al refetch del costeo del período).
    const section = page.locator('section', { hasText: 'Costo y margen por plato' })
    await expect(section).toBeVisible({ timeout: 20_000 })

    // La fila del plato sembrado aparece con sus columnas (ingredientes, costo total, margen).
    const row = section.locator('tbody tr', { hasText: dishName })
    await expect(row).toBeVisible()
    // Hay celdas en formato moneda (S/) → ingredientes / CIF / costo total.
    await expect(row.locator('td.strong')).toContainText('S/')
    // El margen se muestra como porcentaje.
    await expect(row.locator('.cst-margin')).toContainText('%')

    // Totales del período (CIF prorrateado).
    await expect(page.getByText('CIF total')).toBeVisible()
    await expect(page.getByText('Unidades vendidas')).toBeVisible()
  })

  test('los platos con margen < 25% se resaltan (fila .low + aviso de margen bajo)', async ({ owner, request }) => {
    // CIF alto sobre pocas unidades → costo total > precio → margen negativo (<25%).
    const { dishName } = await seedManagementScenario(request, owner, { cif: 600, units: 2, price: 100 })

    await gotoApp(owner, '/app/costeo')
    const page = owner.page

    const section = page.locator('section', { hasText: 'Costo y margen por plato' })
    await expect(section).toBeVisible({ timeout: 20_000 })

    // La fila del plato tiene la clase .low (resaltado de margen bajo).
    const lowRow = section.locator('tbody tr.low', { hasText: dishName })
    await expect(lowRow).toBeVisible()
    // El indicador de margen está en estado "bad".
    await expect(lowRow.locator('.cst-margin.bad')).toBeVisible()

    // El aviso de prorrateo menciona platos con margen bajo.
    await expect(page.getByText(/margen bajo/i)).toBeVisible()
  })

  test('la herramienta de sugerencia de precio calcula un precio para el margen objetivo', async ({ owner, request }) => {
    const { dishName } = await seedManagementScenario(request, owner, { cif: 200, units: 4, price: 100 })

    await gotoApp(owner, '/app/costeo')
    const page = owner.page

    // Espera a que la tabla cargue (la herramienta solo aparece si hay platos).
    await expect(page.locator('section', { hasText: 'Costo y margen por plato' })).toBeVisible({ timeout: 20_000 })

    // Abre la herramienta de sugerencia (CTA principal).
    await page.getByRole('button', { name: /sugerir precio para un margen objetivo/i }).click()

    // El bottom-sheet de sugerencia es visible.
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()

    // Elige el plato sembrado y un margen objetivo del 30%.
    await sheet.locator('select').selectOption({ label: dishName })
    const marginInput = sheet.locator('input[type="number"]')
    await marginInput.fill('30')

    // Calcula.
    await sheet.getByRole('button', { name: /calcular precio/i }).click()

    // Aparece el precio sugerido (bloque de resultado con monto en S/).
    const result = sheet.locator('.cst-suggest-result')
    await expect(result).toBeVisible({ timeout: 15_000 })
    await expect(result.locator('.cst-suggest-result-val')).toContainText('S/')
    await expect(result).toContainText(/margen de 30/i)
  })
})

test.describe('E07 · Reportes y dashboards', () => {
  test('el dashboard del admin (owner) renderiza los KPIs ejecutivos', async ({ owner, request }) => {
    await seedManagementScenario(request, owner, { cif: 300, units: 2 })

    await gotoApp(owner, '/app/reportes')
    const page = owner.page

    await expect(page.getByRole('heading', { name: /reportes/i })).toBeVisible()

    // El tab Dashboard está activo por defecto → resumen ejecutivo del owner.
    await expect(page.getByText(/resumen ejecutivo/i)).toBeVisible({ timeout: 20_000 })

    // KPIs clave del dashboard ejecutivo.
    await expect(page.getByText('Ingresos hoy')).toBeVisible()
    await expect(page.getByText('Ingresos 7 días')).toBeVisible()
    await expect(page.getByText('Margen bruto')).toBeVisible()
    await expect(page.getByText('Stock bajo')).toBeVisible()

    // Hubo una venta hoy → el KPI de ingresos de hoy muestra moneda (S/).
    const revenueCard = page.locator('.rep-stat.accent', { hasText: 'Ingresos hoy' })
    await expect(revenueCard.locator('.rep-stat-v')).toContainText('S/')
  })

  test('las pestañas de reportes cargan (ventas, Pareto, inventario, food-cost, mermas)', async ({ owner, request }) => {
    await seedManagementScenario(request, owner, { cif: 300, units: 3 })

    await gotoApp(owner, '/app/reportes')
    const page = owner.page

    // Las pestañas de gestión están disponibles para el owner.
    const tablist = page.getByRole('tablist', { name: /secciones de reportes/i })
    await expect(tablist).toBeVisible()

    // --- Ventas ---
    await page.getByRole('tab', { name: 'Ventas' }).click()
    // KPI de ingresos del rango (etiqueta del stat, no la cabecera de la tabla) + serie de ventas.
    await expect(page.locator('.rep-stat-k', { hasText: /^Ingresos$/ })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('section.rep-card', { hasText: 'Serie de ventas' })).toBeVisible()

    // --- Pareto / Platos ---
    await page.getByRole('tab', { name: 'Platos' }).click()
    // O bien el análisis Pareto/ABC, o el empty-state (según la ventana del preset).
    await expect(
      page.locator('section.rep-card', { hasText: /pareto de platos/i })
        .or(page.getByText(/sin ventas en este rango/i)),
    ).toBeVisible({ timeout: 20_000 })

    // --- Inventario ---
    await page.getByRole('tab', { name: 'Inventario' }).click()
    await expect(page.getByText('Valor del stock')).toBeVisible({ timeout: 20_000 })

    // --- Food cost ---
    await page.getByRole('tab', { name: 'Food cost' }).click()
    await expect(page.getByText('Food cost global')).toBeVisible({ timeout: 20_000 })

    // --- Mermas ---
    await page.getByRole('tab', { name: 'Mermas' }).click()
    await expect(page.getByText('Costo de mermas')).toBeVisible({ timeout: 20_000 })
  })

  test('exportar CSV de ventas dispara una descarga', async ({ owner, request }) => {
    await seedManagementScenario(request, owner, { cif: 300, units: 2 })

    await gotoApp(owner, '/app/reportes')
    const page = owner.page

    // Ir a la pestaña Ventas (tiene botón de export CSV).
    await page.getByRole('tab', { name: 'Ventas' }).click()
    const exportBtn = page.getByRole('button', { name: /^csv$/i })
    // El botón se habilita cuando el reporte cargó (no disabled).
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 })

    // Click → la app fuerza un <a download> con el CSV del BFF → evento de descarga.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      exportBtn.click(),
    ])
    expect(download.suggestedFilename()).toMatch(/sales-.*\.csv$/)
  })

  test('exportar CSV de inventario dispara una descarga', async ({ owner, request }) => {
    await seedManagementScenario(request, owner, { cif: 300, units: 2 })

    await gotoApp(owner, '/app/reportes')
    const page = owner.page

    await page.getByRole('tab', { name: 'Inventario' }).click()
    await expect(page.getByText('Valor del stock')).toBeVisible({ timeout: 20_000 })

    const exportBtn = page.getByRole('button', { name: /^csv$/i })
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      exportBtn.click(),
    ])
    expect(download.suggestedFilename()).toMatch(/inventory-.*\.csv$/)
  })
})
