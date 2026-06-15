import type {
  BusinessSettings,
  DayHours,
  HoursSettings,
  TaxSettings,
} from '#shared/types/domain'

/**
 * Anti-corruption layer entre el `AppSettings` del frontend (6 secciones del
 * prototipo) y la config de tenant del backend NestJS (HU-01-10,
 * `GET/PATCH /api/tenants/settings`). Solo la parte **fiscal/negocio** del
 * local vive en el backend; el resto (medios de pago, carta, mesas/zonas)
 * sigue en el mock local. Aquí se traduce en ambos sentidos para que las
 * pantallas Vue NO cambien.
 *
 * Contrato del backend (`src/tenants/tenants.service.ts` +
 * `src/shared/tenant/settings.ts`):
 *   TenantSettingsView { ruc, legalName, fiscalAddress, currency,
 *     igvRate (fracción 0..1), capacity, businessHours }
 *   businessHours: [{ day: 0..6 (0=domingo), open "HH:MM", close "HH:MM" }]
 *   tenantSettingsSchema (PATCH): parcial + strict; igvRate 0..1; currency 'PEN'.
 */

/** Vista de la config de tenant tal como la devuelve el backend. */
export interface TenantSettingsView {
  ruc: string | null
  legalName: string | null
  fiscalAddress: string | null
  currency: string
  igvRate: number
  capacity: number | null
  businessHours: BackendBusinessHour[] | null
}

/** Horario de un día abierto, como lo modela el backend. */
export interface BackendBusinessHour {
  day: number
  open: string
  close: string
}

/** Body parcial aceptado por `PATCH /api/tenants/settings` (claves desconocidas rechazadas). */
export interface TenantSettingsInput {
  ruc?: string
  legalName?: string
  fiscalAddress?: string
  currency?: 'PEN'
  igvRate?: number
  capacity?: number
  businessHours?: BackendBusinessHour[]
}

/**
 * Días en el orden que usa el frontend (semilla del mock) y su índice en el
 * backend (0=domingo .. 6=sábado, `businessHoursSchema`). El mapeo es por
 * nombre para sobrevivir a reordenamientos de la UI.
 */
const DAY_ORDER = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const

const DAY_TO_INDEX: Record<string, number> = {
  Domingo: 0,
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sábado: 6,
}

const INDEX_TO_DAY: Record<number, string> = Object.fromEntries(
  Object.entries(DAY_TO_INDEX).map(([name, idx]) => [idx, name]),
)

/** `igvRate` (fracción 0..1) → `igvPct` (entero %, p. ej. 0.18 → 18). */
export function igvRateToPct(rate: number): number {
  return Math.round(rate * 100)
}

/** `igvPct` (% del frontend) → `igvRate` (fracción 0..1 del backend). */
export function igvPctToRate(pct: number): number {
  return Math.round(pct) / 100
}

// ---- Backend → Frontend (lectura) ---------------------------------------

/**
 * Mapea la vista del backend a la sección `business` del frontend. Los campos
 * que el backend no modela (nombre comercial, distrito, teléfono, email) se
 * conservan del valor local que se pasa como `fallback`.
 */
export function toBusinessSettings(
  view: TenantSettingsView,
  fallback: BusinessSettings,
): BusinessSettings {
  return {
    ...fallback,
    legalName: view.legalName ?? fallback.legalName,
    ruc: view.ruc ?? fallback.ruc,
    address: view.fiscalAddress ?? fallback.address,
  }
}

/**
 * Mapea la vista del backend a la sección `tax`. Solo el IGV es autoritativo en
 * el backend; series de comprobantes y "precios incluyen IGV" siguen en local.
 */
export function toTaxSettings(
  view: TenantSettingsView,
  fallback: TaxSettings,
): TaxSettings {
  return {
    ...fallback,
    igvPct: igvRateToPct(view.igvRate),
  }
}

/**
 * Mapea `businessHours` del backend a la sección `hours`. El backend solo
 * almacena días ABIERTOS (sin noción de "cerrado"): un día ausente se
 * interpreta como cerrado. Se parte de los 7 días del `fallback` local para
 * conservar el orden y los horarios por defecto de los días cerrados.
 */
export function toHoursSettings(
  view: TenantSettingsView,
  fallback: HoursSettings,
): HoursSettings {
  const byIndex = new Map<number, BackendBusinessHour>()
  for (const h of view.businessHours ?? []) byIndex.set(h.day, h)

  // Base: los 7 días del fallback (orden + horarios de "cerrado" por defecto).
  const base = new Map<string, DayHours>()
  for (const d of fallback.days) base.set(d.day, { ...d, closed: true })
  for (const name of DAY_ORDER) {
    if (!base.has(name)) base.set(name, { day: name, opens: '18:00', closes: '23:00', closed: true })
  }

  for (const [idx, h] of byIndex) {
    const name = INDEX_TO_DAY[idx]
    if (!name) continue
    base.set(name, { day: name, opens: h.open, closes: h.close, closed: false })
  }

  return { days: DAY_ORDER.map(name => base.get(name)!).filter(Boolean) }
}

// ---- Frontend → Backend (escritura) -------------------------------------

/** Sección `business` (parcial) → input del backend (solo campos fiscales). */
export function businessToTenantInput(
  patch: Partial<BusinessSettings>,
): TenantSettingsInput {
  const out: TenantSettingsInput = {}
  if (patch.legalName !== undefined) out.legalName = patch.legalName
  if (patch.ruc !== undefined) out.ruc = patch.ruc
  if (patch.address !== undefined) out.fiscalAddress = patch.address
  return out
}

/** Sección `tax` (parcial) → input del backend (solo IGV + moneda PEN). */
export function taxToTenantInput(
  patch: Partial<TaxSettings>,
): TenantSettingsInput {
  const out: TenantSettingsInput = {}
  if (patch.igvPct !== undefined) {
    out.igvRate = igvPctToRate(patch.igvPct)
    out.currency = 'PEN'
  }
  return out
}

/**
 * Sección `hours` (parcial) → `businessHours` del backend. Solo se envían los
 * días ABIERTOS (el backend no modela "cerrado": la ausencia = cerrado).
 */
export function hoursToTenantInput(
  patch: Partial<HoursSettings>,
): TenantSettingsInput {
  if (!patch.days) return {}
  const businessHours: BackendBusinessHour[] = patch.days
    .filter(d => !d.closed)
    .map(d => ({ day: DAY_TO_INDEX[d.day] ?? 0, open: d.opens, close: d.closes }))
    .sort((a, b) => a.day - b.day)
  return { businessHours }
}
