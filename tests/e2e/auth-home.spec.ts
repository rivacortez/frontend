import { test, expect, registerTenant, loginUI, seedUser, SEED_PWD } from './_fixtures'

/**
 * E2E · Autenticación + RBAC + Home (/app).
 *
 * Cubre los flujos implementados de acceso a la app: login OK/KO, logout (+ ruta
 * protegida), onboarding hasta el registro real, gating por rol (owner vs staff) y
 * el render de KPIs del home. Cada test usa SU PROPIO tenant (aislado por RLS) vía
 * las fixtures compartidas (registerTenant/loginUI/seedUser). Se excluye todo lo que
 * depende de IA/servicios externos (chat, forecast/alertas "Demo" E08, magic-upload,
 * correo: invitaciones/forgot-password, SUNAT).
 *
 * HU-01-06 (cambio de contraseña): implementado vía un formulario en el perfil que
 * PATCHea /api/auth/password; se prueba abajo (la nueva clave loguea, la antigua no).
 */

/* ============ Helpers locales del spec ============ */

/** Espera a que Nuxt hidrate (networkidle) antes de interactuar con la página. */
async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle')
}

/** Email único para conducir el onboarding (el backend rechaza duplicados con 409). */
function uniqueEmail(): string {
  return `e2e-ob-${Date.now()}${Math.floor(Math.random() * 1e6)}@motif.pe`
}

/* ============ Login OK / KO ============ */

test.describe('Login', () => {
  test('credenciales válidas → aterriza en /app', async ({ page, request }) => {
    const t = await registerTenant(request)
    await loginUI(page, t.email, t.password)
    await expect(page).toHaveURL(/\/app(\/|$)/)
  })

  test('contraseña incorrecta → permanece en /login y muestra error', async ({ page, request }) => {
    const t = await registerTenant(request)
    await page.goto('/login')
    await ready(page)

    await page.getByPlaceholder('tu@correo.com').fill(t.email)
    await page.getByPlaceholder('Tu contraseña').fill('contraseña-incorrecta')
    await page.getByRole('button', { name: /iniciar sesión/i }).click()

    // Sigue en /login y aparece la alerta de credenciales inválidas.
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(/credenciales inválidas/i)
    await expect(page).toHaveURL(/\/login(\?|$)/)
  })
})

/* ============ Logout + ruta protegida ============ */

test.describe('Logout', () => {
  test('cerrar sesión vuelve a /login; /app queda protegido', async ({ owner }) => {
    const page = owner.page

    // El logout vive en "Más" (/app/menu) como botón "Cerrar sesión". En desktop
    // hay un segundo botón con el mismo nombre accesible en la barra lateral
    // (<aside>); se acota al contenido principal (<main>) para evitar ambigüedad.
    await page.goto('/app/menu')
    await ready(page)
    const logout = page.locator('main').getByRole('button', { name: /cerrar sesión/i })
    await Promise.all([
      page.waitForURL(/\/login(\/|\?|$)/, { timeout: 20_000 }),
      logout.click(),
    ])
    await expect(page).toHaveURL(/\/login(\/|\?|$)/)

    // Ya sin sesión, visitar /app redirige a /login (middleware auth.global).
    await page.goto('/app')
    await page.waitForURL(/\/login(\/|\?|$)/, { timeout: 20_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

/* ============ Registro (onboarding) ============ */

test.describe('Registro (onboarding)', () => {
  test('completa el onboarding → crea la cuenta y aterriza en /app', async ({ page }) => {
    const email = uniqueEmail()

    // Paso 1 · Cuenta
    await page.goto('/onboarding')
    await ready(page)
    await page.getByLabel('Tu nombre').fill('Owner E2E')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(SEED_PWD)
    await Promise.all([
      page.waitForURL(/\/onboarding\/verify/, { timeout: 20_000 }),
      page.getByRole('button', { name: /continuar/i }).click(),
    ])

    // Paso 2 · Verificación (demo: cualquier código de 6 dígitos vale)
    await ready(page)
    const digits = page.getByRole('group', { name: /código de verificación/i }).getByRole('textbox')
    // Pegar el código completo en el primer dígito (la página lo reparte).
    await digits.first().fill('123456')
    await Promise.all([
      page.waitForURL(/\/onboarding\/restaurant/, { timeout: 20_000 }),
      page.getByRole('button', { name: /verificar/i }).click(),
    ])

    // Paso 3 · Restaurante (nombre + tipo de cocina)
    await ready(page)
    await page.getByLabel('Nombre del restaurante').fill('Restobar E2E')
    await page.getByRole('radio', { name: 'Bar / Restobar' }).click()
    await Promise.all([
      page.waitForURL(/\/onboarding\/setup/, { timeout: 20_000 }),
      page.getByRole('button', { name: /continuar/i }).click(),
    ])

    // Paso 4 · Configuración del local (los valores por defecto sirven)
    await ready(page)
    await Promise.all([
      page.waitForURL(/\/onboarding\/import/, { timeout: 20_000 }),
      page.getByRole('button', { name: /continuar/i }).click(),
    ])

    // Paso 5 · Importación (elegir "Empezar desde cero")
    await ready(page)
    await page.getByRole('radio', { name: /empezar desde cero/i }).click()
    await Promise.all([
      page.waitForURL(/\/onboarding\/done/, { timeout: 20_000 }),
      page.getByRole('button', { name: /empezar desde cero/i }).click(),
    ])

    // Paso final · done.vue → POST /api/auth/register → /app
    await ready(page)
    await Promise.all([
      page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 }),
      page.getByRole('button', { name: /ir a mi panel/i }).click(),
    ])
    await expect(page).toHaveURL(/\/app(\/|$)/)

    // La cuenta recién creada queda autenticada: el saludo del home aparece.
    await ready(page)
    await expect(page.getByRole('heading', { name: /hola/i })).toBeVisible()
  })
})

/* ============ Cambio de contraseña (HU-01-06) ============
   Implementado: el perfil abre un formulario (sheet) que PATCHea /api/auth/password.
   El backend verifica la contraseña actual y exige contraseña fuerte (mín. 12 +
   mayúscula, minúscula, dígito y símbolo). */
test.describe('Cambio de contraseña (HU-01-06)', () => {
  test('cambia la clave: la nueva permite login y la antigua deja de servir', async ({ owner, browser }) => {
    const NEW_PWD = 'NuevaClave123!@'

    // Abrir el formulario desde el perfil y enviar el cambio.
    await owner.page.goto('/app/profile')
    await ready(owner.page)
    await owner.page.getByRole('button', { name: /cambiar contraseña/i }).click()
    const sheet = owner.page.getByRole('dialog', { name: /cambiar contraseña/i })
    await expect(sheet).toBeVisible()
    await sheet.getByPlaceholder('Tu contraseña actual').fill(SEED_PWD)
    await sheet.getByPlaceholder('Nueva contraseña').fill(NEW_PWD)
    await sheet.getByPlaceholder('Repite la contraseña').fill(NEW_PWD)
    await sheet.getByRole('button', { name: /actualizar contraseña/i }).click()
    await expect(owner.page.getByText('Contraseña actualizada', { exact: true })).toBeVisible()

    // La NUEVA contraseña permite iniciar sesión (contexto nuevo, sin la sesión del owner).
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginUI(page, owner.email, NEW_PWD)
      await expect(page).toHaveURL(/\/app(\/|$)/)
    }
    finally {
      await ctx.close()
    }

    // La ANTIGUA contraseña ya no autentica → se queda en /login con alerta.
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    try {
      await page2.goto('/login')
      await ready(page2)
      await page2.getByPlaceholder('tu@correo.com').fill(owner.email)
      await page2.getByPlaceholder('Tu contraseña').fill(SEED_PWD)
      await page2.getByRole('button', { name: /iniciar sesión/i }).click()
      await expect(page2.getByRole('alert')).toBeVisible()
      await expect(page2).toHaveURL(/\/login/)
    }
    finally {
      await ctx2.close()
    }
  })
})

/* ============ RBAC: owner vs staff ============ */

test.describe('RBAC (gating por rol)', () => {
  test('staff: la gestión (costeo) está oculta en el menú y bloqueada al navegar', async ({ owner, browser }) => {
    // Usuario staff sembrado en el MISMO tenant del owner (aislado por RLS).
    const staff = seedUser(owner.tenantId, 'staff')

    // Contexto/página NUEVOS para no pisar la sesión del owner.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginUI(page, staff.email, staff.password)
      await expect(page).toHaveURL(/\/app(\/|$)/)

      // 1) En "Más", el enlace owner-only "Costeo y márgenes" NO aparece para staff.
      await page.goto('/app/menu')
      await ready(page)
      await expect(page.getByRole('link', { name: /costeo y márgenes/i })).toHaveCount(0)

      // 2) Navegar directo a /app/costeo queda bloqueado (pantalla "Sin acceso").
      await page.goto('/app/costeo')
      await ready(page)
      await expect(page.getByText(/sin acceso al costeo/i)).toBeVisible()
    }
    finally {
      await ctx.close()
    }
  })

  test('owner: ve la gestión (costeo) en el menú y accede a la pantalla', async ({ owner }) => {
    const page = owner.page

    // 1) El owner SÍ ve el enlace "Costeo y márgenes" en "Más".
    await page.goto('/app/menu')
    await ready(page)
    await expect(page.getByRole('link', { name: /costeo y márgenes/i })).toBeVisible()

    // 2) Y al entrar NO ve la pantalla de bloqueo: se renderiza el selector de período.
    await page.goto('/app/costeo')
    await ready(page)
    await expect(page.getByText(/sin acceso al costeo/i)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /costeo y márgenes/i })).toBeVisible()
  })
})

/* ============ Home /app (KPIs) ============ */

test.describe('Home /app', () => {
  test('renderiza el saludo y los KPIs de hoy (sin los widgets "Demo")', async ({ owner }) => {
    const page = owner.page
    await page.goto('/app')
    await ready(page)

    // Saludo del header (heading "Hola, <nombre>").
    await expect(page.getByRole('heading', { name: /hola/i })).toBeVisible()

    // Bloque de indicadores "Hoy" y al menos un KPI (venta/caja de hoy).
    await expect(page.getByText('Hoy', { exact: true })).toBeVisible()
    await expect(page.getByText(/venta hoy|caja de hoy/i)).toBeVisible()

    // No se afirma nada sobre los widgets de IA/forecast (marcados "Demo", E08).
  })
})
