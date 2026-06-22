/**
 * Test de regresión UX de GastronomIA — navegación, cableado y salud de runtime.
 *
 * Cubre los bugs encontrados en la auditoría (2026-06):
 *   1. Crawl de todas las rutas → 0 errores de consola / excepciones JS.
 *   2. Navegación "atrás": ScreenHeader vuelve al historial real, no a un padre
 *      fijo (entrar a una subpágina desde otra ruta debe regresar a esa ruta).
 *   3. Cableado al mock: los botones que operan sobre datos del mock persisten
 *      de verdad (no son toasts de juguete).
 *   4. Páginas: solo /app/reportes debe caer al placeholder "en construcción".
 *
 * Uso:  npm run test:ux            (requiere dev server en :3000)
 * Sale con código 1 si algo falla (apto para CI).
 */
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const DEMO_EMAIL = 'maria@motif.pe'
const DEMO_PASSWORD = process.env.NUXT_DEMO_PASSWORD ?? 'MotifDemo2026'

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const result = execSync(
    `find "${cache}" -name 'chrome-headless-shell' -type f 2>/dev/null | sort -r | head -1`,
    { encoding: 'utf8' },
  ).trim()
  if (!result) throw new Error('No se encontró Chromium de Playwright. Define CHROMIUM_PATH.')
  return result
}

const APP_ROUTES = [
  '/app', '/app/pos', '/app/pos/mesa/mesa-1', '/app/pos/mesa/mesa-3/dividir',
  '/app/recetas', '/app/recetas/rec-ceviche-clasico', '/app/recetas/nueva',
  '/app/inventario', '/app/inventario/movimiento', '/app/inventario/movimientos', '/app/inventario/lista-compras', '/app/inventario/producto/ing-01',
  '/app/comprobantes', '/app/comprobantes/sale-1',
  '/app/notificaciones', '/app/perfil', '/app/ayuda', '/app/menu', '/app/chat',
  '/app/datos/importar', '/app/datos/exportar', '/app/datos/factura-ia',
  '/app/ajustes', '/app/ajustes/negocio', '/app/ajustes/horarios', '/app/ajustes/carta',
  '/app/ajustes/pagos', '/app/ajustes/mesas', '/app/ajustes/impuestos',
  '/app/reportes',
]

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗ FALLA'} ${name}${detail ? `  → ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: findChromium() })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(`const s=document.createElement('style');s.textContent='#nuxt-devtools-container{display:none!important}';document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s))`)
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)))

async function login() {
  await page.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', DEMO_EMAIL)
  await page.fill('input[type="password"]', DEMO_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app', { timeout: 15000 })
}
const slCount = () => page.evaluate(() => fetch('/api/inventory/shopping-list').then(r => r.json()).then(d => d.data.length))

await login()

// 1) Crawl: salud de runtime + páginas en construcción
console.log('\n— 1. Crawl de rutas (consola / WIP)')
const wip = []
for (const route of APP_ROUTES) {
  const before = consoleErrors.length
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(200)
  if (consoleErrors.length > before) record(`${route} sin errores`, false, consoleErrors.at(-1))
  if (await page.locator('.wip').count()) wip.push(route)
}
record('Crawl sin errores de consola/JS', consoleErrors.length === 0, `${consoleErrors.length} errores`)
record('Ninguna ruta cae al placeholder "en construcción"', wip.length === 0, `WIP: ${wip.join(', ') || 'ninguna'}`)

// 2) Navegación "atrás" (ScreenHeader history-aware)
console.log('\n— 2. Navegación "atrás"')
const go = r => page.goto(`${BASE}${r}`, { waitUntil: 'networkidle' }).then(() => page.waitForTimeout(150))
const clickSel = s => page.click(s).then(() => page.waitForTimeout(400))
async function backFlow(name, steps, expected) {
  try {
    for (const s of steps) await s()
    await clickSel('[aria-label="Volver"]') // back de UiScreenHeader (.icon-btn)
    record(name, new URL(page.url()).pathname === expected, `esperado ${expected}, obtuve ${new URL(page.url()).pathname}`)
  }
  catch (e) { record(name, false, String(e).slice(0, 80)) }
}
await backFlow('Mesas → Configurar mesas → atrás', [() => go('/app/pos'), () => clickSel('[aria-label="Configurar mesas"]')], '/app/pos')
await backFlow('Perfil → Ajustes → atrás', [() => go('/app/perfil'), () => clickSel('a[href="/app/ajustes"]')], '/app/perfil')
await backFlow('Menú → Ajustes → atrás (sin regresión)', [() => go('/app/menu'), () => clickSel('a[href="/app/ajustes"]')], '/app/menu')
await backFlow('Dashboard → receta → atrás', [() => go('/app'), () => clickSel('a[href="/app/recetas/rec-ceviche-clasico"]')], '/app')
await backFlow('Ajustes → Mesas y zonas → atrás (sin regresión)', [() => go('/app/ajustes'), () => clickSel('a[href="/app/ajustes/mesas"]')], '/app/ajustes')

// 3) Cableado al mock: persistencia real
console.log('\n— 3. Cableado al mock (persistencia)')
// Idempotente: el mock persiste entre corridas, así que verificamos que el
// endpoint responda éxito Y que el insumo quede en la lista (no el conteo +1,
// que falla si el ítem ya existía — ahí el endpoint suma cantidad, no duplica).
const api = await page.evaluate(async () => {
  const j = (p, o) => fetch(p, o).then(r => r.json())
  await j('/api/ingredients/ing-03', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unitCost: 77.7 }) })
  const ing = (await j('/api/ingredients')).data.find(i => i.id === 'ing-03')
  const add = await j('/api/inventory/shopping-list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId: 'ing-05' }) })
  const list = (await j('/api/inventory/shopping-list')).data
  return { patchPersisted: ing?.unitCost === 77.7, addOk: add.success === true && add.data?.ingredientId === 'ing-05', present: list.some(s => s.ingredientId === 'ing-05') }
})
record('PATCH insumo persiste (use-ingredients)', api.patchPersisted)
record('POST a lista de compras persiste (use-inventory)', api.addOk && api.present)

// Botón real "Agregar a compras": tras el click, el insumo debe quedar en la lista.
await go('/app/inventario/producto/ing-09')
await clickSel('[aria-label="Agregar a compras"]')
const inList = await page.evaluate(() => fetch('/api/inventory/shopping-list').then(r => r.json()).then(d => d.data.some(s => s.ingredientId === 'ing-09')))
record('Botón "Agregar a compras" persiste (UI)', inList)

await browser.close()

// Resumen + código de salida
const failed = results.filter(r => !r.ok)
console.log(`\n${'='.repeat(40)}\n${results.length - failed.length}/${results.length} OK${failed.length ? ` · ${failed.length} FALLAS` : ''}`)
if (failed.length) {
  failed.forEach(f => console.log(`  ✗ ${f.name}`))
  process.exit(1)
}
console.log('Todo verde ✓')
