import type { AppSettings } from '#shared/types/domain'
import { backendFetch } from '../../utils/backend'
import {
  businessToTenantInput,
  hoursToTenantInput,
  taxToTenantInput,
  toBusinessSettings,
  toHoursSettings,
  toTaxSettings,
  type TenantSettingsInput,
  type TenantSettingsView,
} from '../../utils/tenant-settings-adapter'

interface Envelope<T> { success: boolean, data: T }

const SECTIONS = ['business', 'hours', 'payments', 'tables', 'tax', 'menu'] as const
type Section = typeof SECTIONS[number]

/** Secciones fiscales/negocio que se persisten en el backend (HU-01-10). */
const TENANT_SECTIONS = ['business', 'tax', 'hours'] as const
type TenantSection = typeof TENANT_SECTIONS[number]

function isSection(value: string | undefined): value is Section {
  return SECTIONS.includes(value as Section)
}

function isTenantSection(section: Section): section is TenantSection {
  return (TENANT_SECTIONS as readonly string[]).includes(section)
}

/** Traduce el patch del frontend (por sección) al input parcial del backend. */
function toTenantInput(section: TenantSection, body: Partial<AppSettings[Section]>): TenantSettingsInput {
  switch (section) {
    case 'business': return businessToTenantInput(body as Partial<AppSettings['business']>)
    case 'tax': return taxToTenantInput(body as Partial<AppSettings['tax']>)
    case 'hours': return hoursToTenantInput(body as Partial<AppSettings['hours']>)
  }
}

/** Vuelve a armar la sección del frontend desde la vista del backend (+ fallback local). */
function fromTenantView(section: TenantSection, view: TenantSettingsView, local: AppSettings): AppSettings[TenantSection] {
  switch (section) {
    case 'business': return toBusinessSettings(view, local.business)
    case 'tax': return toTaxSettings(view, local.tax)
    case 'hours': return toHoursSettings(view, local.hours)
  }
}

/**
 * Actualiza una sección de ajustes. Las secciones **fiscal/negocio**
 * (`business`, `tax`, `hours`) se persisten en el backend
 * (`PATCH /api/tenants/settings`, owner-only → staff/manager reciben 403, que el
 * BFF propaga para mostrar como toast). El resto (`payments`, `tables`, `menu`)
 * sigue en el mock local. Los campos fiscales que el backend NO modela (nombre
 * comercial, distrito, teléfono, email, series de comprobantes, "precios
 * incluyen IGV") se conservan en el mock local para que la lectura sea coherente.
 */
export default defineEventHandler(async (event) => {
  const db = useMockDb()
  const section = getRouterParam(event, 'section')
  if (!isSection(section)) {
    throw createError({ statusCode: 404, statusMessage: 'Sección de ajustes no válida' })
  }

  const body = await readBody<Partial<AppSettings[Section]>>(event)

  if (isTenantSection(section)) {
    // 1) Persistir la parte fiscal en el backend (autoritativo; propaga 403/400).
    const input = toTenantInput(section, body)
    const res = await backendFetch<Envelope<TenantSettingsView>>(event, '/api/tenants/settings', {
      method: 'PATCH',
      body: input as Record<string, unknown>,
    })
    // 2) Conservar en el mock los campos que el backend no modela (coherencia de lectura).
    Object.assign(db.settings[section] as object, body)
    // 3) Devolver la sección re-armada desde la vista autoritativa del backend.
    const merged = fromTenantView(section, res.data, db.settings)
    Object.assign(db.settings[section] as object, merged)
    return ok(db.settings[section])
  }

  // Secciones aún locales: el mock acepta el shape del cliente tal cual.
  Object.assign(db.settings[section] as object, body)
  return ok(db.settings[section])
})
