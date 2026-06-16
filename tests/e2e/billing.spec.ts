import { test, expect, apiSeeder, type OwnerCtx } from './_fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * E2E E04 · Cobros / Comprobantes — todo como OWNER por la UI real (:3000).
 * Cada test usa su PROPIO tenant (fixture `owner` → email único + RLS) para correr
 * aislado/paralelo. Los prerequisitos de datos (zona, mesa, ingrediente, receta,
 * plato y la orden a cobrar) se siembran vía API con el token del owner; los flujos
 * de cobro/anulación/split se ejercitan en la UI.
 *
 * Excluye servicios externos/IA y la EMISIÓN a SUNAT — solo el ticket local que
 * persiste el backend. No hay UI de Cierre Z en la app (ver test skip al final).
 */

interface SeededCatalog {
  tableId: string
  orderId: string
  menuItemId: string
  menuItemId2: string
  total: number
}

/**
 * Siembra el catálogo mínimo + una orden ABIERTA con ítems lista para cobrar.
 * Devuelve los ids necesarios y el total (IGV incluido) calculado de los precios.
 *
 * - 1 ítem (qty `qty1`) cuando `secondItem` es false → total = price1 * qty1.
 * - 2 ítems distintos (qty 1 c/u) cuando `secondItem` es true → permite dividir por
 *   ítems (el backend colapsa qty del MISMO plato en una sola línea, así que para el
 *   split por ítems hacen falta DOS platos distintos).
 */
async function seedOrderToCharge(
  request: APIRequestContext,
  owner: OwnerCtx,
  opts: { price1?: number, price2?: number, qty1?: number, secondItem?: boolean } = {},
): Promise<SeededCatalog> {
  const { price1 = 100, price2 = 40, qty1 = 1, secondItem = false } = opts
  const seed = apiSeeder(request, owner.token)
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`

  const zone = await seed.zone('Salón')
  // `code` numérico → el adaptador del BFF lo mapea a `number` (Mesa NN) en el POS.
  const tableCode = String(Math.floor(Math.random() * 89) + 10) // 10..98
  const table = await seed.table(zone.id, tableCode, 8)
  const ing = await seed.ingredient(`SKU-${suffix}`, 'Insumo', 10)
  const recipe = await seed.recipe(`Plato A ${suffix}`, ing.id, 1)
  const menuItem = await seed.menuItem(recipe.id, `Plato A ${suffix}`, price1)

  let menuItemId2 = ''
  let total = price1 * qty1
  if (secondItem) {
    const recipe2 = await seed.recipe(`Plato B ${suffix}`, ing.id, 1)
    const mi2 = await seed.menuItem(recipe2.id, `Plato B ${suffix}`, price2)
    menuItemId2 = mi2.id
    total = price1 * qty1 + price2
  }

  // Abrir la mesa (crea la orden) + agregar ítems por menuItemId (contrato del backend).
  const order = await seed.post<{ id: string }>('/api/orders', { tableId: table.id, guests: 4 })
  const items: Array<{ menuItemId: string, qty: number }> = [{ menuItemId: menuItem.id, qty: qty1 }]
  if (secondItem) items.push({ menuItemId: menuItemId2, qty: 1 })
  await seed.post(`/api/orders/${order.id}/items`, { items })

  return { tableId: table.id, orderId: order.id, menuItemId: menuItem.id, menuItemId2, total }
}

/** Siembra un comprobante (boleta) ya emitido vía API → para los flujos de lista/anular. */
async function seedIssuedSale(
  request: APIRequestContext,
  owner: OwnerCtx,
  price = 120,
): Promise<{ saleId: string, serie: string, number: number, total: number }> {
  const { orderId, total } = await seedOrderToCharge(request, owner, { price1: price })
  const seed = apiSeeder(request, owner.token)
  const res = await seed.post<{ sale: { id: string, serie: string, number: number, total: number } }>(
    `/api/orders/${orderId}/pay`,
    { payments: [{ method: 'cash', amount: total }], docType: 'boleta' },
  )
  return { saleId: res.sale.id, serie: res.sale.serie, number: res.sale.number, total }
}

/** Espera a que la app termine de hidratar y la red quede inactiva tras navegar. */
async function gotoHydrated(owner: OwnerCtx, path: string): Promise<void> {
  await owner.page.goto(path)
  await owner.page.waitForLoadState('networkidle')
}

/** Lee los montos "S/ N" de un set de nodos y los devuelve como números. */
async function readShareAmounts(owner: OwnerCtx, selector: string): Promise<number[]> {
  const texts = await owner.page.locator(selector).allInnerTexts()
  return texts.map((t) => {
    // Toma el ÚLTIMO "S/ 1,234.50" del texto (en "N items · S/ X" el monto va al final).
    const matches = t.match(/S\/\s*([\d.,]+)/g) ?? []
    const last = matches[matches.length - 1] ?? 'S/ 0'
    return Number(last.replace(/S\/\s*/, '').replace(/,/g, ''))
  })
}

test.describe('E04 · Cobros y comprobantes (owner, UI)', () => {
  // ===== HU-04-01 · Pre-cuenta =====
  test('pre-cuenta muestra totales (IGV incl.) y deja la mesa por cobrar', async ({ owner, request }) => {
    const { tableId } = await seedOrderToCharge(request, owner, { price1: 100, qty1: 2 }) // total 200
    await gotoHydrated(owner, `/app/pos/mesa/${tableId}`)

    // El resumen sticky de la mesa muestra el total con "IGV incl." (totales del backend).
    const resumen = owner.page.locator('.md-resumen')
    await expect(resumen).toContainText('IGV incl.')
    await expect(resumen).toContainText('200')

    // Abrir el menú de acciones de la mesa → Pre-cuenta.
    await owner.page.getByRole('button', { name: /más opciones de mesa/i }).click()
    const preCuenta = owner.page.getByRole('button', { name: /pre-cuenta/i })
    await expect(preCuenta).toBeVisible()
    await preCuenta.click()

    // El toast confirma la pre-cuenta con el total autoritativo del backend (IGV incl.).
    // (`.first()` evita la doble coincidencia: la región aria-live + el título visible.)
    await expect(owner.page.getByText(/Pre-cuenta · S\/\s*200/i).first()).toBeVisible()

    // La mesa queda marcada "Por cobrar" en el mapa POS.
    await gotoHydrated(owner, '/app/pos')
    await expect(owner.page.locator('.table-card.cobrar')).toHaveCount(1)
  })

  // ===== HU-04-02/05/06 · Cobrar en efectivo → boleta + liberar mesa =====
  test('cobrar en efectivo emite una boleta con total + IGV y libera la mesa', async ({ owner, request }) => {
    const { tableId } = await seedOrderToCharge(request, owner, { price1: 100, qty1: 2 }) // total 200
    await gotoHydrated(owner, `/app/pos/mesa/${tableId}`)

    // Botón Cobrar de la barra de acciones (muestra el total).
    const cobrarBtn = owner.page.getByRole('button', { name: /cobrar\s+s\/\s*200/i })
    await expect(cobrarBtn).toBeEnabled()
    await cobrarBtn.click()

    // Sheet de cobro: total destacado e IGV en el desglose.
    const sheet = owner.page.getByRole('dialog', { name: /cobrar mesa/i })
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.cb-total-num')).toContainText('200')

    // Ver desglose → subtotal + IGV (18%).
    await sheet.getByRole('button', { name: /ver desglose/i }).click()
    await expect(sheet.locator('.cb-desglose')).toContainText('IGV (18 %)')
    await expect(sheet.locator('.cb-desglose')).toContainText('169.49') // subtotal de 200 con IGV incl.

    // Método: Efectivo (boleta es el default).
    await sheet.getByRole('radio', { name: /efectivo/i }).click()

    // Confirmar cobro.
    await sheet.getByRole('button', { name: /confirmar cobro/i }).click()

    // Pantalla de éxito: el comprobante emitido se muestra y PERSISTE aunque la mesa
    // ya se haya liberado (la orden+mesa se congelan al abrir el cobro; antes el sheet
    // se desmontaba al refetchear → el comprobante nunca se veía).
    await expect(sheet.getByText('Pago registrado')).toBeVisible()
    await expect(sheet.locator('.cb-success-text')).toContainText(/B\d+-\d+/)

    // El CTA "Volver al POS" cierra el cobro y lleva al mapa de mesas.
    await sheet.getByRole('button', { name: /volver al pos/i }).click()
    await expect(owner.page).toHaveURL(/\/app\/pos(\/|$)/)

    // La mesa quedó libre en el POS (sin tarjetas "por cobrar" ni ocupadas) → cobro persistido.
    await gotoHydrated(owner, '/app/pos')
    await expect(owner.page.locator('.table-card.cobrar')).toHaveCount(0)
    await expect(owner.page.locator('.table-card.ocupada')).toHaveCount(0)

    // El comprobante (boleta) quedó emitido: aparece en la lista y su ticket trae total + IGV.
    await gotoHydrated(owner, '/app/invoices')
    const row = owner.page.getByRole('link', { name: /B\d+-\d+/ }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('200.00')
    await row.click()
    await owner.page.waitForURL(/\/app\/invoices\/[^/]+$/)
    await owner.page.waitForLoadState('networkidle')
    const ticket = owner.page.locator('.ticket')
    await expect(ticket.locator('.ticket-totals')).toContainText('IGV (18 %)')
    await expect(ticket.locator('.ticket-totals')).toContainText('169.49') // subtotal (200 con IGV incl.)
    await expect(ticket.locator('.ticket-totals .grand')).toContainText('200.00')
  })

  // ===== HU-04-05 · Comprobantes: lista + detalle (ticket local) =====
  test('el comprobante aparece en /app/invoices (lista) y abre su detalle con IGV', async ({ owner, request }) => {
    const { serie, number, total } = await seedIssuedSale(request, owner, 120)
    const id = `${serie}-${number}`

    await gotoHydrated(owner, '/app/invoices')

    // Aparece en la lista con su número y total.
    const row = owner.page.getByRole('link', { name: new RegExp(`${serie}-${number}`) })
    await expect(row).toBeVisible()
    await expect(row).toContainText(`${serie}-${number}`)

    // El resumen del día refleja al menos un comprobante emitido.
    await expect(owner.page.locator('.inv-summary')).toContainText('1 comprobantes emitidos')

    // Abrir el detalle (ticket).
    await row.click()
    await owner.page.waitForURL(/\/app\/invoices\/[^/]+$/)
    await owner.page.waitForLoadState('networkidle')

    const ticket = owner.page.locator('.ticket')
    await expect(ticket).toBeVisible()
    await expect(ticket.locator('.ticket-doc')).toContainText(id)
    await expect(ticket.locator('.ticket-doc')).toContainText(/boleta de venta electrónica/i)
    // Totales: Subtotal + IGV (18 %) + Total (IGV incl.).
    await expect(ticket.locator('.ticket-totals')).toContainText('Subtotal')
    await expect(ticket.locator('.ticket-totals')).toContainText('IGV (18 %)')
    await expect(ticket.locator('.ticket-totals .grand')).toContainText(String(total))
  })

  // ===== HU-04-03 · Dividir cuenta por persona (suma de partes = total) =====
  test('dividir por persona: las partes suman el total de la orden', async ({ owner, request }) => {
    const { tableId, total } = await seedOrderToCharge(request, owner, { price1: 100, qty1: 2 }) // total 200
    await gotoHydrated(owner, `/app/pos/mesa/${tableId}/split`)

    // Modo "Por persona" (default). El subtítulo del header trae el total IGV incl.
    await expect(owner.page.getByRole('tab', { name: /por persona/i })).toHaveAttribute('aria-selected', 'true')

    // Con 2 personas, cada parte = 100.00 (montos autoritativos del backend).
    const shares = owner.page.locator('.sb-shares .sb-share')
    await expect(shares).toHaveCount(2)

    const amounts = await readShareAmounts(owner, '.sb-shares .sb-share-amount')
    expect(amounts).toHaveLength(2)
    const sum = amounts.reduce((s, n) => s + n, 0)
    expect(sum).toBeCloseTo(total, 2)
    // Cada parte equitativa de 200 entre 2.
    for (const a of amounts) expect(a).toBeCloseTo(100, 2)
  })

  // ===== HU-04-03 · Dividir cuenta por ítems (suma de cuentas = total) =====
  test('dividir por ítems: asignar cada plato a una cuenta y verificar que suman el total', async ({ owner, request }) => {
    // Dos platos distintos (60 + 40 = 100) → dos líneas asignables a cuentas A/B.
    const { tableId, total } = await seedOrderToCharge(request, owner, { price1: 60, price2: 40, secondItem: true })
    await gotoHydrated(owner, `/app/pos/mesa/${tableId}/split`)

    // Cambiar a modo "Por ítems".
    await owner.page.getByRole('tab', { name: /por items/i }).click()

    const itemRows = owner.page.locator('.sb-items .sb-item')
    await expect(itemRows).toHaveCount(2)

    // Asignar el 1er ítem a la Cuenta A y el 2do a la Cuenta B.
    await itemRows.nth(0).getByRole('radio', { name: 'A' }).click()
    await itemRows.nth(1).getByRole('radio', { name: 'B' }).click()

    // El backend devuelve los montos por cuenta; A=60, B=40, Σ=100.
    const cuentaCards = owner.page.locator('.sb-cuentas-resumen .sb-share')
    await expect(cuentaCards.nth(0).locator('.sb-share-amount')).toContainText('60')
    await expect(cuentaCards.nth(1).locator('.sb-share-amount')).toContainText('40')

    const amounts = await readShareAmounts(owner, '.sb-cuentas-resumen .sb-share-amount')
    // Solo las cuentas con monto cuentan para la suma (C = 0).
    const sum = amounts.reduce((s, n) => s + n, 0)
    expect(sum).toBeCloseTo(total, 2)
  })

  // ===== HU-04-07 · Anular comprobante (owner) con motivo → estado anulada =====
  test('anular un comprobante emitido (owner) con motivo lo deja en estado anulada', async ({ owner, request }) => {
    const { saleId, serie, number } = await seedIssuedSale(request, owner, 150)

    await gotoHydrated(owner, `/app/invoices/${saleId}`)
    await expect(owner.page.locator('.ticket')).toBeVisible()

    // El owner ve el botón de anular (staff no lo vería).
    const voidBtn = owner.page.getByRole('button', { name: /anular comprobante/i })
    await expect(voidBtn).toBeVisible()
    await voidBtn.click()

    // Modal de anulación: requiere motivo.
    const modal = owner.page.getByRole('alertdialog', { name: /anular comprobante/i })
    await expect(modal).toBeVisible()
    const confirm = modal.getByRole('button', { name: /sí, anular/i })
    await expect(confirm).toBeDisabled() // sin motivo → bloqueado

    await modal.getByLabel(/motivo de la anulación/i).fill('Error en el pedido — prueba E2E')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    // Toast de confirmación + el ticket queda marcado "ANULADA".
    // (`.first()` evita la doble coincidencia: la región aria-live + el título visible.)
    await expect(owner.page.getByText(/comprobante anulado/i).first()).toBeVisible()
    await expect(owner.page.locator('.ticket.void')).toBeVisible()
    await expect(owner.page.locator('.ticket-void-stamp')).toHaveText(/anulada/i)
    // El botón de anular ya no está disponible (ya no es "issued").
    await expect(owner.page.getByRole('button', { name: /anular comprobante/i })).toHaveCount(0)

    // En la lista, el comprobante aparece con el tag "Anulada".
    await gotoHydrated(owner, '/app/invoices')
    const row = owner.page.getByRole('link', { name: new RegExp(`${serie}-${number}`) })
    await expect(row).toBeVisible()
    await expect(row.locator('.void-tag')).toHaveText(/anulada/i)
  })

  // ===== Cierre Z — SKIP: no existe UI en la app =====
  // No hay pantalla/acción de "Cierre Z" / arqueo de caja en el frontend (búsqueda
  // exhaustiva en app/pages y componentes → 0 resultados). La pestaña "Caja" del POS
  // solo muestra el resumen de venta del día (ya cubierto indirectamente por el flujo
  // de cobro). Se omite hasta que exista la pantalla.
  test.skip('cierre Z (no implementado en la UI)', async () => {})
})
