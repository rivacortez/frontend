import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'

/**
 * Fixtures compartidas de los E2E. Patrón de AISLACIÓN: cada test registra su propio
 * tenant (email único) vía la API del backend → la RLS lo separa de los demás → los
 * specs corren en paralelo sin interferir. Los flujos se manejan por la UI real (:3000);
 * los prerequisitos de datos se siembran vía API (rápido) con el token del owner.
 */

export const BACKEND = process.env.NUXT_API_BASE ?? 'http://localhost:3333'
export const SEED_PWD = 'Secret12345'
// bcrypt('Secret12345', 4) — para sembrar usuarios staff/manager directo en la DB
// (no hay endpoint público de "crear usuario": owner=registro, invitaciones=correo diferido).
const SEED_HASH = '$2b$04$R8LyHfS77SQ8yyOr4NUdR.5B/BL38iyI4VhnlReVZeyBUmiQbjA1.'

export interface OwnerCtx {
  page: Page
  token: string
  tenantId: string
  email: string
}

function decodeTenantId(jwt: string): string {
  const payload = jwt.split('.')[1] ?? ''
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    tenant_id: string
  }
  return json.tenant_id
}

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

/** Registra un tenant+owner nuevo vía la API → credenciales + token + tenantId. */
export async function registerTenant(api: APIRequestContext): Promise<{
  email: string
  password: string
  token: string
  tenantId: string
}> {
  const slug = unique('e2e')
  const email = `${slug}@motif.pe`
  const res = await api.post(`${BACKEND}/api/auth/register`, {
    data: { restaurantName: `E2E ${slug}`, email, password: SEED_PWD, name: 'E2E Owner' },
  })
  expect(res.ok(), `register falló: ${res.status()} ${await res.text()}`).toBeTruthy()
  const token = ((await res.json()) as { data: { accessToken: string } }).data.accessToken
  return { email, password: SEED_PWD, token, tenantId: decodeTenantId(token) }
}

/**
 * Siembra un usuario staff|manager directo en la DB (no hay API pública de creación).
 * Devuelve credenciales para hacer login por la UI. Requiere el contenedor `gastronomia-db`.
 */
export function seedUser(
  tenantId: string,
  role: 'staff' | 'manager',
): { email: string, password: string } {
  const email = `${unique(`e2e-${role}`)}@motif.pe`
  const sql = `INSERT INTO users (id, tenant_id, email, name, password_hash, roles, created_at, updated_at) VALUES (gen_random_uuid(), '${tenantId}', '${email}', '${role}', '${SEED_HASH}', ARRAY['${role}']::text[], now(), now());`
  execFileSync(
    'docker',
    ['exec', 'gastronomia-db', 'psql', '-U', 'postgres', '-d', 'gastronomia_dev', '-c', sql],
    { stdio: 'pipe' },
  )
  return { email, password: SEED_PWD }
}

/**
 * Login por la UI real (/ingresar) → deja la página autenticada en /app.
 * Espera la hidratación de Nuxt (networkidle) ANTES de enviar; si no, el form hace
 * submit nativo (recarga /ingresar) en vez de llamar al BFF. El click se liga a la
 * navegación con Promise.all para evitar carreras.
 */
export async function loginUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/ingresar')
  await page.waitForLoadState('networkidle')
  const submit = page.getByRole('button', { name: /iniciar sesión/i })
  await submit.waitFor({ state: 'visible' })
  await page.getByPlaceholder('tu@correo.com').fill(email)
  await page.getByPlaceholder('Tu contraseña').fill(password)
  await Promise.all([
    page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 }),
    submit.click(),
  ])
}

/** Helpers de siembra vía API (con token de owner) para prerequisitos de un flujo. */
export function apiSeeder(api: APIRequestContext, token: string) {
  const opts = { headers: { Authorization: `Bearer ${token}` } }
  const post = async <T = { id: string }>(path: string, data: unknown): Promise<T> => {
    const r = await api.post(`${BACKEND}${path}`, { ...opts, data })
    expect(r.ok(), `${path} -> ${r.status()} ${await r.text()}`).toBeTruthy()
    return ((await r.json()) as { data: T }).data
  }
  return {
    post,
    zone: (name = 'Salón') => post('/api/zones', { name }),
    table: (zoneId: string, code: string, capacity = 4) =>
      post('/api/tables', { zoneId, code, capacity }),
    ingredient: (sku: string, name: string, unitCost = 10) =>
      post('/api/ingredients', { sku, name, type: 'raw', unit: 'kg', unitCost }),
    recipe: (name: string, ingredientId: string, qty = 1) =>
      post('/api/recipes', { name, kind: 'dish', yield: 1, items: [{ ingredientId, qty }] }),
    menuItem: (recipeId: string, name: string, price = 100) =>
      post('/api/menu/items', { recipeId, name, price }),
    movement: (ingredientId: string, type: string, qty: number) =>
      post('/api/inventory/movements', { ingredientId, type, qty }),
  }
}

/** `test` extendido con un `owner` ya logueado (tenant nuevo por test → aislado). */
export const test = base.extend<{ owner: OwnerCtx }>({
  owner: async ({ page, request }, use) => {
    const t = await registerTenant(request)
    await loginUI(page, t.email, t.password)
    await use({ page, token: t.token, tenantId: t.tenantId, email: t.email })
  },
})

export { expect }
