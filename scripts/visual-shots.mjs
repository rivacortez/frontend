/**
 * Tests visuales de GastronomIA — captura todas las pantallas en viewport
 * iPhone (390×844 @2x) y las clave también en desktop (1440×900).
 *
 * Uso:  npm run test:visual           (requiere dev server en :3000)
 * Salida: tests/visual/shots/*.png
 *
 * Requiere los navegadores de Playwright en caché (~/Library/Caches/ms-playwright).
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = 'tests/visual/shots'
const DEMO_EMAIL = 'maria@motif.pe'
const DEMO_PASSWORD = process.env.NUXT_DEMO_PASSWORD ?? 'MotifDemo2026'

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  try {
    const result = execSync(
      `find "${cache}" -name 'chrome-headless-shell' -type f 2>/dev/null | sort -r | head -1`,
      { encoding: 'utf8' },
    ).trim()
    if (result) return result
  }
  catch { /* sigue */ }
  throw new Error('No se encontró Chromium de Playwright. Define CHROMIUM_PATH.')
}

/** Rutas de la app (requieren sesión). */
const APP_ROUTES = [
  ['app-home', '/app'],
  ['reports', '/app/reportes'],
  ['pos-mesas', '/app/pos'],
  ['pos-mesa-detalle', '/app/pos/mesa/mesa-1'],
  ['pos-split', '/app/pos/mesa/mesa-3/dividir'],
  ['recipes-list', '/app/recetas'],
  ['recipes-detail', '/app/recetas/rec-ceviche-clasico'],
  ['recipes-new', '/app/recetas/nueva'],
  ['stock', '/app/inventario'],
  ['stock-move', '/app/inventario/movimiento'],
  ['stock-movements', '/app/inventario/movimientos'],
  ['stock-shopping', '/app/inventario/lista-compras'],
  ['stock-product', '/app/inventario/producto/ing-01'],
  ['invoices', '/app/comprobantes'],
  ['invoice-detail', '/app/comprobantes/sale-1'],
  ['notifications', '/app/notificaciones'],
  ['profile', '/app/perfil'],
  ['help', '/app/ayuda'],
  ['menu', '/app/menu'],
  ['data-import', '/app/datos/importar'],
  ['data-export', '/app/datos/exportar'],
  ['magic-upload', '/app/datos/factura-ia'],
  ['settings-hub', '/app/ajustes'],
  ['settings-business', '/app/ajustes/negocio'],
  ['settings-hours', '/app/ajustes/horarios'],
  ['settings-payments', '/app/ajustes/pagos'],
  ['settings-tables', '/app/ajustes/mesas'],
  ['settings-tax', '/app/ajustes/impuestos'],
  ['settings-menu', '/app/ajustes/carta'],
]

const PUBLIC_ROUTES = [
  ['landing', '/'],
  ['welcome', '/bienvenida'],
  ['login', '/ingresar'],
  ['forgot', '/recuperar'],
]

const DESKTOP_ROUTES = [
  ['app-home', '/app'],
  ['reports', '/app/reportes'],
  ['pos-mesas', '/app/pos'],
  ['recipes-list', '/app/recetas'],
  ['chat', '/app/chat'],
  ['landing', '/'],
]

async function snap(page, name, suffix = 'mobile') {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}/${name}--${suffix}.png` })
  process.stdout.write(`  ✓ ${name} (${suffix})\n`)
}

async function login(page) {
  await page.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', DEMO_EMAIL)
  await page.fill('input[type="password"]', DEMO_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app', { timeout: 15000 })
}

const browser = await chromium.launch({ executablePath: findChromium() })
mkdirSync(OUT, { recursive: true })

// Nuxt DevTools intercepta clicks en dev — se oculta durante los tests
const hideDevtools = `
  const css = '#nuxt-devtools-container{display:none!important;pointer-events:none!important}'
  const add = () => { const s = document.createElement('style'); s.textContent = css; document.head?.appendChild(s) }
  if (document.head) add()
  document.addEventListener('DOMContentLoaded', add)
`

// ===== Móvil =====
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await mobile.addInitScript(hideDevtools)
const page = await mobile.newPage()

console.log('— Públicas (móvil)')
for (const [name, route] of PUBLIC_ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await snap(page, name)
}

console.log('— Flujo onboarding (móvil)')
await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' })
await snap(page, 'onboarding-1-cuenta')
await page.fill('input[type="text"]', 'Eduardo Ventura')
await page.fill('input[type="email"]', 'eduardo@demo.pe')
await page.fill('input[type="password"]', 'demo12345')
await page.click('footer button, .ob-cta button')
await page.waitForURL('**/registro/verificar', { timeout: 8000 })
await page.fill('.vf-digit', '123456')
await snap(page, 'onboarding-2-verify')
await page.click('.ob-cta button')
await page.waitForURL('**/registro/restaurante', { timeout: 8000 })
await page.fill('input[placeholder*="Motif"]', 'La Cevichería Demo')
await page.click('.rs-cuisine >> nth=1')
await snap(page, 'onboarding-3-restaurant')
await page.click('.ob-cta button')
await page.waitForURL('**/registro/configuracion', { timeout: 8000 })
await snap(page, 'onboarding-4-setup')
await page.click('.ob-cta button >> nth=0')
await page.waitForURL('**/registro/importar', { timeout: 8000 })
await page.click('.im-source >> nth=0')
await snap(page, 'onboarding-5-import')
await page.click('.ob-cta button')
await page.waitForURL('**/registro/listo', { timeout: 8000 })
await snap(page, 'onboarding-6-done')

console.log('— App (móvil, sesión demo)')
await login(page)
for (const [name, route] of APP_ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await snap(page, name)
}

// Chat con conversación real (SSE)
await page.goto(`${BASE}/app/chat`, { waitUntil: 'networkidle' })
await snap(page, 'chat-vacio')
const chatInput = page.locator('input[type="text"], textarea').last()
await chatInput.fill('¿Cuál es mi plato más rentable?')
await page.keyboard.press('Enter')
await page.waitForTimeout(6000)
await snap(page, 'chat-respuesta')

// ===== Desktop =====
console.log('— Desktop')
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await desktop.addInitScript(hideDevtools)
const dpage = await desktop.newPage()
await login(dpage)
for (const [name, route] of DESKTOP_ROUTES) {
  await dpage.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await snap(dpage, name, 'desktop')
}

await browser.close()
console.log(`\nListo → ${OUT}/`)
