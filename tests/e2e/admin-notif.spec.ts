import { test, expect, apiSeeder, BACKEND } from './_fixtures'

/**
 * E2E · Flujos de Administración / Ajustes + Notificaciones, como `owner` por la UI.
 *
 * Cada test usa la fixture `owner` → tenant nuevo y aislado (RLS) por test, así corren
 * en paralelo sin pisarse. Los catálogos (unidades/proveedores/categorías) y los ajustes
 * fiscales se manejan por la UI real (:3000); los prerequisitos de datos para las
 * notificaciones se siembran vía la API del backend (:3333) con el token del owner.
 *
 * Quedan FUERA por diseño (dependen de servicios externos / archivos pesados):
 *   - Importación de insumos / histórico de ventas del wizard (CSV grandes) → solo se
 *     verifica que el wizard carga y que los pasos avanzan.
 *   - Cualquier integración de IA / correo / SUNAT.
 */

/** Espera la hidratación de Nuxt: networkidle + el header de la pantalla visible. */
async function gotoHydrated(page: import('@playwright/test').Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

test.describe('Ajustes · catálogos (owner por la UI)', () => {
  test('Unidades: crear, editar y eliminar una unidad de medida', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/ajustes/unidades')
    await expect(page.getByRole('heading', { name: 'Unidades de medida' })).toBeVisible()

    // ---- Crear ----
    // El botón "+" del header (.cat-add-btn) comparte aria-label con el del empty-state;
    // usamos el del header (.cat-add-btn), siempre presente independientemente del estado.
    const code = `ut${Date.now() % 100000}`
    await page.locator('button.cat-add-btn').click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByPlaceholder('kg').fill(code)
    await sheet.getByPlaceholder('Kilogramo').fill('Unidad E2E')
    await page.getByRole('button', { name: 'Crear unidad' }).click()

    // La fila aparece (el código se muestra en .unit-code; el nombre en el cuerpo).
    await expect(sheet).toBeHidden()
    const row = page.locator('.cat-row', { hasText: code }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('Unidad E2E')

    // ---- Editar (cambia el nombre) ----
    await row.getByRole('button', { name: 'Editar' }).click()
    const editSheet = page.getByRole('dialog')
    await expect(editSheet).toBeVisible()
    const nameInput = editSheet.getByPlaceholder('Kilogramo')
    await expect(nameInput).toHaveValue('Unidad E2E')
    await nameInput.fill('Unidad E2E editada')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(editSheet).toBeHidden()
    await expect(page.locator('.cat-row', { hasText: code }).first()).toContainText('Unidad E2E editada')

    // ---- Eliminar (confirm() nativo → aceptar el diálogo) ----
    page.once('dialog', d => d.accept())
    await page.locator('.cat-row', { hasText: code }).first().getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.locator('.cat-row', { hasText: code })).toHaveCount(0)
  })

  test('Proveedores: crear un proveedor con RUC de 11 dígitos', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/ajustes/proveedores')
    await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible()

    const ruc = '20123456789' // 11 dígitos
    const name = `Distribuidora E2E ${Date.now() % 100000}`
    await page.locator('button.cat-add-btn').click() // botón "+" del header
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByPlaceholder('20123456789').fill(ruc)
    await sheet.getByPlaceholder('Distribuidora del Sur S.A.C.').fill(name)
    await page.getByRole('button', { name: 'Crear proveedor' }).click()

    await expect(sheet).toBeHidden()
    const row = page.locator('.cat-row', { hasText: name }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText(`RUC ${ruc}`)
  })

  test('Categorías de insumo: crear una categoría', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/ajustes/categorias')
    await expect(page.getByRole('heading', { name: 'Categorías de insumo' })).toBeVisible()

    const name = `Categoría E2E ${Date.now() % 100000}`
    // Hay un botón "Nueva categoría" en el header (aria-label) y otro en el empty-state;
    // el del header (.cat-add-btn) es estable independientemente de si ya hay categorías.
    await page.locator('button.cat-add-btn').click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByPlaceholder('Ej: Carnes').fill(name)
    await page.getByRole('button', { name: 'Crear categoría' }).click()

    await expect(sheet).toBeHidden()
    await expect(page.locator('.cat-row', { hasText: name }).first()).toBeVisible()
  })
})

test.describe('Ajustes · fiscal (persiste tras recargar)', () => {
  test('Impuestos: editar IGV y guardar → persiste al recargar', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/ajustes/impuestos')
    await expect(page.getByRole('heading', { name: 'Impuestos' })).toBeVisible()

    // El owner SÍ puede editar (readonly solo para no-owner): el input no debe estar deshabilitado.
    const igv = page.locator('input.tax-input')
    await expect(igv).toBeEnabled()
    await igv.fill('12')
    // Esperamos a que el PATCH del BFF resuelva (señal robusta de guardado; el toast
    // "Cambios guardados" duplica texto en su live-region SR, no es buen ancla).
    const [saved] = await Promise.all([
      page.waitForResponse(r => /\/api\/settings\/tax$/.test(r.url()) && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Guardar cambios' }).click(),
    ])
    expect(saved.ok()).toBeTruthy()

    // Recargar → el valor persistido vuelve del backend.
    await gotoHydrated(page, '/app/ajustes/impuestos')
    await expect(page.locator('input.tax-input')).toHaveValue('12')
  })

  test('Negocio: editar razón social y guardar → persiste al recargar', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/ajustes/negocio')
    await expect(page.getByRole('heading', { name: 'Negocio' })).toBeVisible()

    const legalName = `Inversiones E2E ${Date.now() % 100000} S.A.C.`
    const legalInput = page.getByLabel('Razón social')
    await expect(legalInput).toBeEnabled()
    await legalInput.fill(legalName)
    const [saved] = await Promise.all([
      page.waitForResponse(r => /\/api\/settings\/business$/.test(r.url()) && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Guardar cambios' }).click(),
    ])
    expect(saved.ok()).toBeTruthy()

    await gotoHydrated(page, '/app/ajustes/negocio')
    await expect(page.getByLabel('Razón social')).toHaveValue(legalName)
  })
})

test.describe('Notificaciones · stock bajo', () => {
  test('una salida que cruza el mínimo genera "stock bajo"; badge sin leer + marcar leída', async ({ owner, request }) => {
    const { page, token } = owner
    const seed = apiSeeder(request, token)

    // 1) Insumo + mínimo de reorden (PATCH: el backend NO acepta POST en /levels — ver REPORT)
    //    + una compra (12) y un ajuste (-3) → stock final 9 < mínimo 10 → low_stock.
    const sku = `NTF-${Date.now() % 100000}`
    const ing = await seed.ingredient(sku, 'Insumo Notif E2E')
    const lvl = await request.patch(`${BACKEND}/api/inventory/levels/${ing.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { minStock: 10 },
    })
    expect(lvl.ok(), `PATCH levels -> ${lvl.status()} ${await lvl.text()}`).toBeTruthy()
    await seed.movement(ing.id, 'purchase', 12)
    await seed.movement(ing.id, 'adjustment', -3)

    // 2) El badge de la campana (en /app) marca al menos 1 sin leer.
    await gotoHydrated(page, '/app')
    const bell = page.getByRole('link', { name: /Notificaciones, \d+ sin leer/ })
    await expect(bell).toBeVisible()
    await expect(bell.locator('.badge')).toHaveText('1')

    // 3) En /app/notificaciones aparece la notificación de "stock bajo" (sin leer).
    await gotoHydrated(page, '/app/notificaciones')
    await expect(page.getByRole('heading', { name: 'Notificaciones' })).toBeVisible()
    const newSection = page.locator('.ntf-section', { hasText: 'Nuevas' })
    await expect(newSection).toBeVisible()
    const card = page.locator('.ntf-row.unread', { hasText: /stock bajo/i }).first()
    await expect(card).toBeVisible()
    await expect(card).toContainText('Insumo Notif E2E')

    // 4) Marcar leídas → desaparece "Nuevas" y el subtítulo pasa a "Todo al día".
    await page.getByRole('button', { name: 'Marcar leídas' }).click()
    await expect(page.locator('.ntf-section', { hasText: 'Nuevas' })).toHaveCount(0)
    await expect(page.getByText('Todo al día')).toBeVisible()
    // La notificación sigue listada, ahora bajo "Anteriores" (leída).
    await expect(page.locator('.ntf-row', { hasText: /stock bajo/i }).first()).toBeVisible()
  })
})

test.describe('Wizard de migración', () => {
  test('carga y los pasos avanzan (sin importar archivos pesados)', async ({ owner }) => {
    const { page } = owner
    await gotoHydrated(page, '/app/migracion')
    await expect(page.getByRole('heading', { name: 'Asistente de migración' })).toBeVisible()

    // Paso 1 · Bienvenida.
    await expect(page.getByRole('heading', { name: 'Pongamos tu restaurante en marcha' })).toBeVisible()
    const steps = page.locator('nav[aria-label="Progreso de la migración"]')
    await expect(steps).toBeVisible()
    // El primer paso (Bienvenida) es el actual.
    await expect(steps.getByRole('button', { name: /Bienvenida/ })).toHaveAttribute('aria-current', 'step')

    // Avanzar al paso 2 · Tu local.
    await page.getByRole('button', { name: 'Empezar' }).click()
    await expect(page.getByRole('heading', { name: 'Configura tu local' })).toBeVisible()
    await expect(steps.getByRole('button', { name: /Tu local/ })).toHaveAttribute('aria-current', 'step')
    // El formulario fiscal del paso 2 está presente.
    await expect(page.getByLabel('Razón social')).toBeVisible()
    await expect(page.getByLabel('IGV en porcentaje')).toBeVisible()

    // Avanzar al paso 3 · Insumos (sin subir CSV) usando "Atrás"/"Adelante" del wizard.
    await page.getByRole('button', { name: 'Guardar y continuar' }).click()
    await expect(page.getByRole('heading', { name: 'Importa tus insumos' })).toBeVisible()
    await expect(steps.getByRole('button', { name: /Insumos/ })).toHaveAttribute('aria-current', 'step')

    // Volver atrás funciona (no se completa la importación).
    await page.getByRole('button', { name: 'Atrás' }).click()
    await expect(page.getByRole('heading', { name: 'Configura tu local' })).toBeVisible()
  })
})
