import type { AppSettings } from '#shared/types/domain'
import { backendFetch } from '../../utils/backend'
import {
  toBusinessSettings,
  toHoursSettings,
  toTaxSettings,
  type TenantSettingsView,
} from '../../utils/tenant-settings-adapter'

interface Envelope<T> { success: boolean, data: T }

/**
 * Config del local. La parte **fiscal/negocio** (RUC, razón social, dirección
 * fiscal, IGV, horarios) es autoritativa del backend (HU-01-10,
 * `GET /api/tenants/settings`); el resto de secciones (medios de pago, carta,
 * mesas/zonas) sigue en el mock local. El BFF fusiona ambas en el `AppSettings`
 * que esperan las pantallas (que NO cambian).
 *
 * RBAC: `read Setting` = owner/manager; **staff recibe 403** del backend. En ese
 * caso (o si el backend no responde) se cae con elegancia a los valores locales
 * para que la pantalla siga cargando — la escritura igualmente está gateada a
 * owner en la UI y en el backend.
 */
export default defineEventHandler(async (event) => {
  const db = useMockDb()
  const local = db.settings

  let tenant: TenantSettingsView | null = null
  try {
    const res = await backendFetch<Envelope<TenantSettingsView>>(event, '/api/tenants/settings')
    tenant = res.data
  }
  catch {
    // staff (403) o backend no disponible: se mantienen los valores locales.
    tenant = null
  }

  const settings: AppSettings = tenant
    ? {
        ...local,
        business: toBusinessSettings(tenant, local.business),
        tax: toTaxSettings(tenant, local.tax),
        hours: toHoursSettings(tenant, local.hours),
      }
    : local

  return ok(settings)
})
