<script setup lang="ts">
// /app/reportes — E07 · Reportes y dashboards (read-only), cableado al backend NestJS
// vía el BFF (server/api/reports/**). Sin librería de charting: barras CSS / SVG inline
// (echarts no está en el bundle). Toda la moneda llega como string PEN → se formatea
// con formatPEN. Gating por rol: staff solo ve el dashboard del cajero (read Sale);
// el resto es info de gestión (read Report) → owner/manager.
import {
  presetWindow,
  currentPeriod,
  useCashierDashboard,
  useManagerDashboard,
  useAdminDashboard,
  useSalesReport,
  useParetoDishes,
  useInventoryReport,
  useFoodCostReport,
  useWasteReport,
  useForecastAccuracy,
  useReportCsv,
  type SalesGroupBy,
  type DateWindow,
} from '~/composables/use-reports'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Reportes — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()

// owner/manager ven todo; staff solo el dashboard del cajero (el backend 403ea el resto).
const canManage = computed(() => user.value?.role === 'owner' || user.value?.role === 'manager')

/* ============ Tabs ============ */
type TabId = 'dashboard' | 'ventas' | 'pareto' | 'inventario' | 'foodcost' | 'mermas' | 'precision'
interface Tab { id: TabId, label: string, icon: string, manageOnly?: boolean }
const ALL_TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'i-lucide-layout-dashboard' },
  { id: 'ventas', label: 'Ventas', icon: 'i-lucide-trending-up', manageOnly: true },
  { id: 'pareto', label: 'Platos', icon: 'i-lucide-trophy', manageOnly: true },
  { id: 'inventario', label: 'Inventario', icon: 'i-lucide-package', manageOnly: true },
  { id: 'foodcost', label: 'Food cost', icon: 'i-lucide-percent', manageOnly: true },
  { id: 'mermas', label: 'Mermas', icon: 'i-lucide-trash-2', manageOnly: true },
  // F2a / HU-08-08 · "El sistema se autoevalúa": vive junto a los demás análisis
  // de gestión (mismo tab bar, mismo shell .scr-*) en vez de una ruta propia —
  // es otro análisis de reportes, no un flujo operativo distinto, y así
  // hereda gating por rol, RepLoading/RepError y el resto del lenguaje visual
  // sin duplicar chrome. Enlazada además desde "Lo que se viene" en el home.
  { id: 'precision', label: 'Precisión', icon: 'i-lucide-crosshair', manageOnly: true },
]
const tabs = computed(() => ALL_TABS.filter(t => !t.manageOnly || canManage.value))
const tab = ref<TabId>('dashboard')

/* ============ Date-range presets (compartido por Ventas/Pareto/Mermas) ============ */
type PresetKey = 'hoy' | 'semana' | 'mes'
const PRESETS: { key: PresetKey, label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
]
const preset = ref<PresetKey>('semana')
const window = computed<DateWindow>(() => presetWindow(preset.value))
const rangeLabel = computed(() => {
  const fromDay = window.value.from.slice(0, 10)
  const toDay = window.value.to.slice(0, 10)
  return fromDay === toDay ? fmtDay(fromDay) : `${fmtDay(fromDay)} – ${fmtDay(toDay)}`
})

/* ============ helpers ============ */
// Decimal strings from the backend (Prisma `Decimal`) — see app/utils/format.ts.
const num = (s: string | number | undefined | null): number => toNumber(s)
function fmtDay(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
}
function fmtPct(s: string | number | undefined | null): string {
  return formatPercent(s, 1)
}
function abcClassLabel(c: 'A' | 'B' | 'C'): string {
  return c === 'A' ? 'Estrella (A)' : c === 'B' ? 'Soporte (B)' : 'Cola (C)'
}
function foodCostClass(pct: number, target: number): 'good' | 'mid' | 'bad' {
  if (pct <= target) return 'good'
  if (pct <= target * 1.25) return 'mid'
  return 'bad'
}
function statusClass(s: 'ok' | 'low' | 'critical'): 'ok' | 'low' | 'crit' {
  return s === 'critical' ? 'crit' : s
}
function statusLabel(s: 'ok' | 'low' | 'critical'): string {
  return s === 'critical' ? 'Crítico' : s === 'low' ? 'Bajo' : 'OK'
}

/* ============ Queries (gateadas por rol) ============ */
// Solo se consulta la del tab activo (enabled) → menos llamadas y respeta el 403 de staff.
const onDashboard = computed(() => tab.value === 'dashboard')

// Dashboard del cajero: visible a todos (incluido staff) cuando está en el tab.
const cashier = useCashierDashboard(() => onDashboard.value && !canManage.value)
// Dashboards de gestión: owner/manager. El admin (ejecutivo) para owner; el operativo para manager.
const isOwner = computed(() => user.value?.role === 'owner')
const admin = useAdminDashboard(() => onDashboard.value && isOwner.value)
const manager = useManagerDashboard(() => onDashboard.value && canManage.value && !isOwner.value)

const salesGroupBy = ref<SalesGroupBy>('day')
const sales = useSalesReport(window, salesGroupBy, () => tab.value === 'ventas' && canManage.value)
const pareto = useParetoDishes(window, () => tab.value === 'pareto' && canManage.value)
const inventory = useInventoryReport(() => tab.value === 'inventario' && canManage.value)

const period = ref(currentPeriod())
const foodcost = useFoodCostReport(period, () => tab.value === 'foodcost' && canManage.value)

const waste = useWasteReport(window, () => tab.value === 'mermas' && canManage.value)

// F2a / HU-08-08 · Precisión: scope 'total' (agregado del negocio) — sin selector
// de plato en esta primera versión; el contrato ya soporta scope=menuItem si
// se necesita un drill-down por plato más adelante.
const accuracy = useForecastAccuracy('total', undefined, () => tab.value === 'precision' && canManage.value)

/* ============ Derived (charts) ============ */
// Serie de ventas del admin: 7 días (barras CSS).
const adminMaxRevenue = computed(() =>
  Math.max(1, ...(admin.data.value?.salesByDay7d ?? []).map(d => num(d.revenue))))

// Serie del reporte de ventas (barras CSS, normalizadas al máximo de revenue).
const salesSeries = computed(() => sales.data.value?.series ?? [])
const salesMax = computed(() => Math.max(1, ...salesSeries.value.map(p => num(p.revenue))))
function seriesKeyLabel(key: string): string {
  // groupBy=day → YYYY-MM-DD; method/docType → etiqueta directa.
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return fmtDay(key)
  const map: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', yape: 'Yape', plin: 'Plin', boleta: 'Boleta', factura: 'Factura',
  }
  return map[key] ?? key
}

const GROUP_OPTS: { id: SalesGroupBy, label: string }[] = [
  { id: 'day', label: 'Por día' },
  { id: 'method', label: 'Por método' },
  { id: 'docType', label: 'Por comprobante' },
]

// Pareto: ancho de barra normalizado al primer (mayor) revenue.
const paretoMax = computed(() =>
  Math.max(1, ...(pareto.data.value?.items ?? []).map(i => num(i.revenue))))

// Mermas: ancho de barra por razón normalizado al mayor costo.
const wasteReasonMax = computed(() =>
  Math.max(1, ...(waste.data.value?.byReason ?? []).map(r => num(r.cost))))

/* ============ Derived (paneles de resumen lateral) ============ */
// Pareto: distribución ABC (conteo + revenue por clase) para el panel lateral.
const paretoAbc = computed(() => {
  const acc = { A: { n: 0, rev: 0 }, B: { n: 0, rev: 0 }, C: { n: 0, rev: 0 } }
  for (const it of pareto.data.value?.items ?? []) {
    acc[it.abcClass].n += 1
    acc[it.abcClass].rev += num(it.revenue)
  }
  return acc
})

// Inventario: conteo de insumos por estado de stock (para la barra del panel).
const inventoryStatusCounts = computed(() => {
  const acc = { ok: 0, low: 0, critical: 0 }
  for (const it of inventory.data.value?.items ?? []) acc[it.status] += 1
  return acc
})

// Food cost: comparación global vs objetivo + platos por encima del objetivo.
const fcGlobal = computed(() => num(foodcost.data.value?.overallFoodCostPct))
const fcTarget = computed(() => num(foodcost.data.value?.targetFoodCostPct))
const fcOverTarget = computed(() => fcGlobal.value > fcTarget.value)
const fcScale = computed(() => Math.max(1, fcGlobal.value, fcTarget.value) * 1.35)
const fcGapPts = computed(() => Math.abs(fcGlobal.value - fcTarget.value).toFixed(1))
const foodcostOverCount = computed(() => {
  const target = fcTarget.value
  return (foodcost.data.value?.dishes ?? []).filter(d => num(d.foodCostPct) > target).length
})

// Mermas: razón con mayor costo (para el panel lateral).
const wasteTopReason = computed(() => {
  const rows = waste.data.value?.byReason ?? []
  if (!rows.length) return null
  // rows[0] is guaranteed defined by the !rows.length guard above; omitting the
  // initial-value argument avoids the TS18048 "possibly undefined" error on rows[0]
  // while keeping identical runtime semantics (reduce with no init uses element[0]).
  return rows.reduce((top, r) => (num(r.cost) > num(top.cost) ? r : top))
})

// F2a / HU-08-08 · Precisión: métricas realizadas en lenguaje humano. El sMAPE
// crudo es jerga académica — se muestra como término secundario entre
// paréntesis (rigor de tesis) pero el titular siempre es la frase narrada.
const accSeries = computed(() => accuracy.data.value?.series ?? [])
const accMetrics = computed(() => accuracy.data.value?.metrics ?? null)
const accSmapeLabel = computed(() => {
  const v = accMetrics.value?.smapeRealized
  return v == null ? '—' : `${v.toFixed(1)}%`
})
const accMapeLabel = computed(() => {
  const v = accMetrics.value?.mapeRealized
  return v == null ? '—' : `${v.toFixed(1)}%`
})
// "N de M días reales cayeron dentro del rango proyectado" — coveragePct ya
// viene calculado por el backend; points = M (nº de días comparados).
const accCoverageDays = computed(() => {
  const pct = accMetrics.value?.coveragePct
  const points = accMetrics.value?.points ?? 0
  if (pct == null || points === 0) return null
  return { inRange: Math.round((pct / 100) * points), total: points, pct }
})
const downloadCsv = useReportCsv()
const exporting = ref(false)
async function exportCsv(report: 'sales' | 'inventory' | 'food-cost' | 'waste'): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const query: Record<string, string> = {}
    if (report === 'sales') Object.assign(query, { from: window.value.from, to: window.value.to, groupBy: salesGroupBy.value })
    if (report === 'waste') Object.assign(query, { from: window.value.from, to: window.value.to })
    if (report === 'food-cost') Object.assign(query, { period: period.value })
    await downloadCsv(report, query)
    toast.add({ title: 'CSV descargado', icon: 'i-lucide-download' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo exportar el CSV'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    exporting.value = false
  }
}

function periodLabel(p: string): string {
  const [y, m] = p.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="rep">
    <UiScreenHeader title="Reportes" :subtitle="canManage ? 'KPIs, ventas y análisis' : 'Caja del día'" back="/app/menu" />

    <!-- Tabs: barra full-bleed bajo el topbar -->
    <div class="rep-tabbar">
      <nav class="rep-tabs" role="tablist" aria-label="Secciones de reportes">
        <button
          v-for="t in tabs"
          :key="t.id"
          role="tab"
          :aria-selected="tab === t.id"
          class="rep-tab"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          <UIcon :name="t.icon" />
          <span>{{ t.label }}</span>
        </button>
      </nav>
    </div>

    <div class="rep-content">
      <!-- ============================ DASHBOARD ============================ -->
      <template v-if="tab === 'dashboard'">
        <div class="scr-body">
        <div class="scr-main">
        <!-- ---- Cajero (staff) ---- -->
        <template v-if="!canManage">
          <RepError v-if="cashier.error.value" @retry="cashier.refresh()" />
          <RepLoading v-else-if="cashier.isLoading.value && !cashier.data.value" />
          <template v-else-if="cashier.data.value">
            <div class="rep-eyebrow">Caja de hoy</div>
            <div class="rep-stat-grid">
              <div class="rep-stat accent">
                <span class="rep-stat-k">Total cobrado</span>
                <span class="rep-stat-v"><span class="cur">S/</span>{{ num(cashier.data.value.totalCollected).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                <span class="rep-stat-meta">{{ cashier.data.value.salesCount }} ticket{{ cashier.data.value.salesCount === 1 ? '' : 's' }}</span>
              </div>
              <div class="rep-stat">
                <span class="rep-stat-k">Ticket promedio</span>
                <span class="rep-stat-v">{{ formatPEN(num(cashier.data.value.avgTicket)) }}</span>
              </div>
              <div class="rep-stat">
                <span class="rep-stat-k">Anulaciones</span>
                <span class="rep-stat-v">{{ cashier.data.value.voidCount }}</span>
              </div>
            </div>

            <section class="rep-card">
              <div class="rep-card-head"><div class="rep-card-title">Por método de pago</div></div>
              <div class="rep-methods">
                <div v-for="m in [
                  { k: 'Efectivo', v: cashier.data.value.byMethod.cash, c: 'var(--oliva)' },
                  { k: 'Tarjeta', v: cashier.data.value.byMethod.card, c: 'var(--mostaza)' },
                  { k: 'Yape', v: cashier.data.value.byMethod.yape, c: 'var(--terracotta)' },
                  { k: 'Plin', v: cashier.data.value.byMethod.plin, c: 'var(--espresso-400)' },
                ]" :key="m.k" class="rep-method">
                  <span class="rep-method-dot" :style="{ background: m.c }" />
                  <span class="rep-method-k">{{ m.k }}</span>
                  <span class="rep-method-v">{{ formatPEN(num(m.v)) }}</span>
                </div>
              </div>
            </section>
          </template>
        </template>

        <!-- ---- Admin / owner (ejecutivo) ---- -->
        <template v-else-if="isOwner">
          <RepError v-if="admin.error.value" @retry="admin.refresh()" />
          <RepLoading v-else-if="admin.isLoading.value && !admin.data.value" />
          <template v-else-if="admin.data.value">
            <div class="rep-eyebrow">Resumen ejecutivo · hoy</div>
            <div class="rep-stat-grid">
              <div class="rep-stat accent">
                <span class="rep-stat-k">Ingresos hoy</span>
                <span class="rep-stat-v"><span class="cur">S/</span>{{ num(admin.data.value.revenueToday).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                <span class="rep-stat-meta">{{ admin.data.value.ordersToday }} pedidos · ticket {{ formatPEN(num(admin.data.value.avgTicket)) }}</span>
              </div>
              <div class="rep-stat">
                <span class="rep-stat-k">Ingresos 7 días</span>
                <span class="rep-stat-v">{{ formatPEN(num(admin.data.value.revenue7d)) }}</span>
              </div>
              <div class="rep-stat">
                <span class="rep-stat-k">Margen bruto</span>
                <span class="rep-stat-v accent-fg">{{ fmtPct(admin.data.value.grossMarginPct) }}</span>
              </div>
              <div class="rep-stat">
                <span class="rep-stat-k">Stock bajo</span>
                <span class="rep-stat-v" :class="{ 'danger-fg': admin.data.value.lowStockCount > 0 }">{{ admin.data.value.lowStockCount }}</span>
                <NuxtLink v-if="admin.data.value.lowStockCount > 0" to="/app/inventario" class="rep-stat-link">Ver insumos</NuxtLink>
              </div>
            </div>

            <div class="rep-dash-split">
              <section class="rep-card">
                <div class="rep-card-head"><div class="rep-card-title">Ventas · últimos 7 días</div></div>
                <div v-if="num(admin.data.value.revenue7d) > 0" class="rep-chart">
                  <div class="rep-bars">
                    <div
                      v-for="d in admin.data.value.salesByDay7d"
                      :key="d.day"
                      class="rep-bar-col"
                      :aria-label="`${fmtDay(d.day)}: ${formatPEN(num(d.revenue))}`"
                    >
                      <div class="rep-bar" :style="{ height: `${Math.max(3, (num(d.revenue) / adminMaxRevenue) * 100)}%` }" />
                      <div class="rep-bar-lbl">{{ fmtDay(d.day).split(' ')[0] }}</div>
                    </div>
                  </div>
                </div>
                <p v-else class="rep-muted">Aún no hay ventas en los últimos 7 días.</p>
              </section>

              <section v-if="admin.data.value.topDishes.length" class="rep-card">
                <div class="rep-card-head"><div class="rep-card-title">Top platos de hoy</div></div>
                <div v-for="(d, i) in admin.data.value.topDishes" :key="d.name" class="rep-dish">
                  <span class="rep-dish-pos" :class="{ first: i === 0 }">{{ i + 1 }}</span>
                  <span class="rep-dish-main">
                    <span class="rep-dish-name">{{ d.name }}</span>
                  </span>
                  <span class="rep-dish-right">
                    <span class="rep-dish-units">{{ formatPEN(num(d.revenue)) }}</span>
                    <span class="rep-dish-sub">{{ d.qty }} und · contrib. {{ formatPEN(num(d.contribution)) }}</span>
                  </span>
                </div>
              </section>
            </div>
          </template>
        </template>

        <!-- ---- Gerente (operativo) ---- -->
        <template v-else>
          <RepError v-if="manager.error.value" @retry="manager.refresh()" />
          <RepLoading v-else-if="manager.isLoading.value && !manager.data.value" />
          <template v-else-if="manager.data.value">
            <div class="rep-eyebrow">Operación de hoy</div>
            <div class="rep-stat-grid">
              <div class="rep-stat accent">
                <span class="rep-stat-k">Ventas hoy</span>
                <span class="rep-stat-v"><span class="cur">S/</span>{{ num(manager.data.value.revenueToday).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                <span class="rep-stat-meta">{{ manager.data.value.salesToday }} ticket{{ manager.data.value.salesToday === 1 ? '' : 's' }}</span>
              </div>
              <NuxtLink to="/app/pos" class="rep-stat link">
                <span class="rep-stat-k">Mesas ocupadas</span>
                <span class="rep-stat-v">{{ manager.data.value.openTables }}</span>
                <span class="rep-stat-meta">{{ manager.data.value.ordersOpen }} cuenta{{ manager.data.value.ordersOpen === 1 ? '' : 's' }} abierta{{ manager.data.value.ordersOpen === 1 ? '' : 's' }}</span>
              </NuxtLink>
              <NuxtLink to="/app/cocina" class="rep-stat link">
                <span class="rep-stat-k">En cocina</span>
                <span class="rep-stat-v">{{ manager.data.value.itemsInKitchen }}</span>
                <span class="rep-stat-meta">ítems pendientes</span>
              </NuxtLink>
              <NuxtLink to="/app/inventario" class="rep-stat link">
                <span class="rep-stat-k">Stock bajo</span>
                <span class="rep-stat-v" :class="{ 'danger-fg': manager.data.value.lowStockCount > 0 }">{{ manager.data.value.lowStockCount }}</span>
                <span class="rep-stat-meta">insumos</span>
              </NuxtLink>
            </div>

            <section v-if="manager.data.value.topDishesToday.length" class="rep-card">
              <div class="rep-card-head"><div class="rep-card-title">Top platos de hoy</div></div>
              <div v-for="(d, i) in manager.data.value.topDishesToday" :key="d.name" class="rep-dish">
                <span class="rep-dish-pos" :class="{ first: i === 0 }">{{ i + 1 }}</span>
                <span class="rep-dish-main"><span class="rep-dish-name">{{ d.name }}</span></span>
                <span class="rep-dish-right">
                  <span class="rep-dish-units">{{ formatPEN(num(d.revenue)) }}</span>
                  <span class="rep-dish-sub">{{ d.qty }} und</span>
                </span>
              </div>
            </section>
            <UiEmptyState
              v-else
              icon="i-lucide-utensils"
              title="Sin ventas de platos hoy"
              subtitle="Cuando se emitan ventas, aquí verás los platos más vendidos del día."
            />
          </template>
        </template>
        </div>
        </div>
      </template>

      <!-- ============================ VENTAS ============================ -->
      <template v-else-if="tab === 'ventas'">
        <div class="rep-controls">
          <div class="rep-toolbar">
            <div class="rep-presets" role="tablist" aria-label="Rango de fechas">
              <button v-for="p in PRESETS" :key="p.key" role="tab" :aria-selected="preset === p.key" class="rep-preset" :class="{ active: preset === p.key }" @click="preset = p.key">{{ p.label }}</button>
            </div>
            <button class="rep-export-btn sm" :disabled="exporting || !sales.data.value" @click="exportCsv('sales')">
              <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
            </button>
          </div>
          <div class="rep-range-note">{{ rangeLabel }}</div>
        </div>

        <div class="scr-body">
          <div class="scr-main">
            <RepError v-if="sales.error.value" @retry="sales.refresh()" />
            <RepLoading v-else-if="sales.isLoading.value && !sales.data.value" />
            <template v-else-if="sales.data.value">
              <div class="rep-stat-grid three">
                <div class="rep-stat accent">
                  <span class="rep-stat-k">Ingresos</span>
                  <span class="rep-stat-v"><span class="cur">S/</span>{{ num(sales.data.value.totalRevenue).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                </div>
                <div class="rep-stat">
                  <span class="rep-stat-k">Ventas</span>
                  <span class="rep-stat-v">{{ sales.data.value.salesCount }}</span>
                </div>
                <div class="rep-stat">
                  <span class="rep-stat-k">Ticket prom.</span>
                  <span class="rep-stat-v">{{ formatPEN(num(sales.data.value.avgTicket)) }}</span>
                </div>
              </div>

              <section class="rep-card">
                <div class="rep-card-head">
                  <div class="rep-card-title">Serie de ventas</div>
                  <div class="rep-metric-toggle" role="tablist" aria-label="Agrupar la serie">
                    <button v-for="g in GROUP_OPTS" :key="g.id" role="tab" :aria-selected="salesGroupBy === g.id" :class="{ active: salesGroupBy === g.id }" @click="salesGroupBy = g.id">{{ g.label }}</button>
                  </div>
                </div>
                <div v-if="salesSeries.length" class="rep-chart">
                  <div class="rep-bars">
                    <div
                      v-for="(p, i) in salesSeries"
                      :key="i"
                      class="rep-bar-col"
                      :aria-label="`${seriesKeyLabel(p.key)}: ${formatPEN(num(p.revenue))}, ${p.count} ventas`"
                    >
                      <div class="rep-bar" :style="{ height: `${Math.max(3, (num(p.revenue) / salesMax) * 100)}%` }" />
                      <div class="rep-bar-lbl">{{ seriesKeyLabel(p.key) }}</div>
                    </div>
                  </div>
                </div>
                <p v-else class="rep-muted">Sin ventas en este rango.</p>

                <div class="rep-table-wrap">
                  <table class="rep-table">
                    <thead><tr><th class="left">{{ salesGroupBy === 'day' ? 'Día' : salesGroupBy === 'method' ? 'Método' : 'Comprobante' }}</th><th>Ventas</th><th>Ingresos</th></tr></thead>
                    <tbody>
                      <tr v-for="(p, i) in salesSeries" :key="i">
                        <td class="left name">{{ seriesKeyLabel(p.key) }}</td>
                        <td>{{ p.count }}</td>
                        <td class="strong">{{ formatPEN(num(p.revenue)) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </template>
          </div>

          <aside v-if="sales.data.value" class="scr-aside">
            <section class="scr-panel">
              <header class="scr-panel-head">
                <span class="scr-eyebrow">Ventas · {{ rangeLabel }}</span>
                <h3 class="scr-panel-title">{{ sales.data.value.salesCount }}<span class="scr-of"> ventas</span></h3>
              </header>
              <dl class="scr-stats">
                <div class="scr-stat"><dt>Ingresos</dt><dd>{{ formatPEN(num(sales.data.value.totalRevenue)) }}</dd></div>
                <div class="scr-stat"><dt>Ticket promedio</dt><dd>{{ formatPEN(num(sales.data.value.avgTicket)) }}</dd></div>
              </dl>

              <div class="rep-aside-block">
                <div class="rep-aside-label">Por método de pago</div>
                <div class="rep-methods">
                  <div v-for="m in [
                    { k: 'Efectivo', v: sales.data.value.byMethod.cash, c: 'var(--oliva)' },
                    { k: 'Tarjeta', v: sales.data.value.byMethod.card, c: 'var(--mostaza)' },
                    { k: 'Yape', v: sales.data.value.byMethod.yape, c: 'var(--terracotta)' },
                    { k: 'Plin', v: sales.data.value.byMethod.plin, c: 'var(--espresso-400)' },
                  ]" :key="m.k" class="rep-method">
                    <span class="rep-method-dot" :style="{ background: m.c }" />
                    <span class="rep-method-k">{{ m.k }}</span>
                    <span class="rep-method-v">{{ formatPEN(num(m.v)) }}</span>
                  </div>
                </div>
              </div>

              <div class="rep-aside-block">
                <div class="rep-aside-label">Por comprobante</div>
                <div class="rep-methods">
                  <div v-for="m in [
                    { k: 'Boleta', v: sales.data.value.byDocType.boleta, c: 'var(--espresso-400)' },
                    { k: 'Factura', v: sales.data.value.byDocType.factura, c: 'var(--terracotta)' },
                  ]" :key="m.k" class="rep-method">
                    <span class="rep-method-dot" :style="{ background: m.c }" />
                    <span class="rep-method-k">{{ m.k }}</span>
                    <span class="rep-method-v">{{ formatPEN(num(m.v)) }}</span>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </template>

      <!-- ============================ PARETO ============================ -->
      <template v-else-if="tab === 'pareto'">
        <div class="rep-controls">
          <div class="rep-toolbar">
            <div class="rep-presets" role="tablist" aria-label="Rango de fechas">
              <button v-for="p in PRESETS" :key="p.key" role="tab" :aria-selected="preset === p.key" class="rep-preset" :class="{ active: preset === p.key }" @click="preset = p.key">{{ p.label }}</button>
            </div>
          </div>
          <div class="rep-range-note">{{ rangeLabel }}</div>
        </div>

        <div class="scr-body">
          <div class="scr-main">
            <RepError v-if="pareto.error.value" @retry="pareto.refresh()" />
            <RepLoading v-else-if="pareto.isLoading.value && !pareto.data.value" />
            <template v-else-if="pareto.data.value">
              <section v-if="pareto.data.value.items.length" class="rep-card">
                <div class="rep-card-head">
                  <div class="rep-card-title">Pareto de platos (ABC)</div>
                  <span class="rep-card-meta">Total {{ formatPEN(num(pareto.data.value.totalRevenue)) }}</span>
                </div>
                <p class="rep-hint"><UIcon name="i-lucide-info" /> Clase A = 80% del ingreso (estrellas), B hasta 95%, C el resto. Acumulado por revenue.</p>
                <div v-for="it in pareto.data.value.items" :key="it.name" class="rep-pareto-row">
                  <span class="rep-abc" :class="`abc-${it.abcClass.toLowerCase()}`">{{ it.abcClass }}</span>
                  <div class="rep-pareto-main">
                    <div class="rep-pareto-top">
                      <span class="rep-pareto-name">{{ it.name }}</span>
                      <span class="rep-pareto-rev">{{ formatPEN(num(it.revenue)) }}</span>
                    </div>
                    <div class="rep-dish-track">
                      <span class="rep-dish-fill" :class="`abc-${it.abcClass.toLowerCase()}`" :style="{ width: `${(num(it.revenue) / paretoMax) * 100}%` }" />
                    </div>
                    <div class="rep-pareto-sub">
                      {{ it.qty }} und · {{ fmtPct(it.revenuePct) }} del total · acum. {{ fmtPct(it.cumulativePct) }} · {{ abcClassLabel(it.abcClass) }}
                    </div>
                  </div>
                </div>
              </section>
              <UiEmptyState
                v-else
                icon="i-lucide-trophy"
                title="Sin ventas en este rango"
                subtitle="El análisis Pareto/ABC necesita ventas emitidas para clasificar los platos."
              />
            </template>
          </div>

          <aside v-if="pareto.data.value && pareto.data.value.items.length" class="scr-aside">
            <section class="scr-panel">
              <header class="scr-panel-head">
                <span class="scr-eyebrow">Pareto · ABC</span>
                <h3 class="scr-panel-title">{{ pareto.data.value.items.length }}<span class="scr-of"> platos</span></h3>
              </header>
              <div class="rep-seg-bar" role="img" aria-label="Distribución del ingreso por clase ABC">
                <span class="rep-seg s-a" :style="{ flexGrow: paretoAbc.A.rev || 0.001 }" />
                <span class="rep-seg s-b" :style="{ flexGrow: paretoAbc.B.rev || 0.001 }" />
                <span class="rep-seg s-c" :style="{ flexGrow: paretoAbc.C.rev || 0.001 }" />
              </div>
              <dl class="scr-stats">
                <div class="scr-stat"><dt><span class="rep-seg-dot s-a" />Estrellas (A)</dt><dd>{{ paretoAbc.A.n }}</dd></div>
                <div class="scr-stat"><dt><span class="rep-seg-dot s-b" />Soporte (B)</dt><dd>{{ paretoAbc.B.n }}</dd></div>
                <div class="scr-stat"><dt><span class="rep-seg-dot s-c" />Cola (C)</dt><dd>{{ paretoAbc.C.n }}</dd></div>
              </dl>
              <p class="rep-aside-foot">Las clase A concentran la mayor parte del ingreso: protege su disponibilidad y su margen.</p>
            </section>
          </aside>
        </div>
      </template>

      <!-- ============================ INVENTARIO ============================ -->
      <template v-else-if="tab === 'inventario'">
        <div class="rep-controls">
          <div class="rep-toolbar end">
            <button class="rep-export-btn sm" :disabled="exporting || !inventory.data.value" @click="exportCsv('inventory')">
              <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
            </button>
          </div>
        </div>

        <div class="scr-body">
          <div class="scr-main">
            <RepError v-if="inventory.error.value" @retry="inventory.refresh()" />
            <RepLoading v-else-if="inventory.isLoading.value && !inventory.data.value" />
            <template v-else-if="inventory.data.value">
              <div class="rep-stat-grid">
                <div class="rep-stat accent">
                  <span class="rep-stat-k">Valor del stock</span>
                  <span class="rep-stat-v"><span class="cur">S/</span>{{ num(inventory.data.value.totalStockValue).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                  <span class="rep-stat-meta">{{ inventory.data.value.totalSkus }} insumos</span>
                </div>
                <div class="rep-stat">
                  <span class="rep-stat-k">Stock bajo</span>
                  <span class="rep-stat-v" :class="{ 'danger-fg': inventory.data.value.lowStockCount > 0 }">{{ inventory.data.value.lowStockCount }}</span>
                </div>
                <div class="rep-stat">
                  <span class="rep-stat-k">Críticos</span>
                  <span class="rep-stat-v" :class="{ 'danger-fg': inventory.data.value.criticalCount > 0 }">{{ inventory.data.value.criticalCount }}</span>
                </div>
              </div>

              <section v-if="inventory.data.value.items.length" class="rep-card">
                <div class="rep-card-head"><div class="rep-card-title">Valoración por insumo</div></div>
                <div class="rep-table-wrap">
                  <table class="rep-table">
                    <thead><tr><th class="left">Insumo</th><th>Stock</th><th>Costo u.</th><th>Valor</th><th class="left">Estado</th></tr></thead>
                    <tbody>
                      <tr v-for="it in inventory.data.value.items" :key="it.ingredientId" :class="{ low: it.status !== 'ok' }">
                        <td class="left name">{{ it.name }}</td>
                        <td>{{ num(it.stock).toLocaleString('es-PE') }} <small>{{ it.unit }}</small></td>
                        <td>{{ formatPEN(num(it.unitCost)) }}</td>
                        <td class="strong">{{ formatPEN(num(it.stockValue)) }}</td>
                        <td class="left"><span class="rep-status" :class="statusClass(it.status)">{{ statusLabel(it.status) }}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <UiEmptyState v-else icon="i-lucide-package" title="Sin insumos" subtitle="Registra insumos en Inventario para ver la valoración del stock." />
            </template>
          </div>

          <aside v-if="inventory.data.value && inventory.data.value.items.length" class="scr-aside">
            <section class="scr-panel">
              <header class="scr-panel-head">
                <span class="scr-eyebrow">Inventario</span>
                <h3 class="scr-panel-title">{{ inventory.data.value.totalSkus }}<span class="scr-of"> insumos</span></h3>
              </header>
              <div class="rep-seg-bar" role="img" aria-label="Distribución de insumos por estado de stock">
                <span class="rep-seg s-ok" :style="{ flexGrow: inventoryStatusCounts.ok || 0.001 }" />
                <span class="rep-seg s-low" :style="{ flexGrow: inventoryStatusCounts.low || 0.001 }" />
                <span class="rep-seg s-crit" :style="{ flexGrow: inventoryStatusCounts.critical || 0.001 }" />
              </div>
              <dl class="scr-stats">
                <div class="scr-stat"><dt><span class="rep-seg-dot s-ok" />Óptimo</dt><dd>{{ inventoryStatusCounts.ok }}</dd></div>
                <div class="scr-stat"><dt><span class="rep-seg-dot s-low" />Bajo</dt><dd :class="{ warn: inventoryStatusCounts.low > 0 }">{{ inventoryStatusCounts.low }}</dd></div>
                <div class="scr-stat"><dt><span class="rep-seg-dot s-crit" />Crítico</dt><dd :class="{ danger: inventoryStatusCounts.critical > 0 }">{{ inventoryStatusCounts.critical }}</dd></div>
              </dl>
              <NuxtLink v-if="inventory.data.value.lowStockCount > 0" to="/app/inventario" class="rep-aside-cta">
                <UIcon name="i-lucide-shopping-cart" /> Reponer {{ inventory.data.value.lowStockCount }} insumo{{ inventory.data.value.lowStockCount === 1 ? '' : 's' }}
                <UIcon name="i-lucide-arrow-right" />
              </NuxtLink>
              <p v-else class="rep-aside-foot">Todo el stock está por encima del mínimo.</p>
            </section>
          </aside>
        </div>
      </template>

      <!-- ============================ FOOD COST ============================ -->
      <template v-else-if="tab === 'foodcost'">
        <div class="rep-controls">
          <div class="rep-toolbar">
            <label class="rep-period-field">
              <span>Período</span>
              <input v-model="period" type="month" aria-label="Período (mes)">
            </label>
            <button class="rep-export-btn sm" :disabled="exporting || !foodcost.data.value" @click="exportCsv('food-cost')">
              <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
            </button>
          </div>
        </div>

        <div class="scr-body">
          <div class="scr-main">
            <RepError v-if="foodcost.error.value" @retry="foodcost.refresh()" />
            <RepLoading v-else-if="foodcost.isLoading.value && !foodcost.data.value" />
            <template v-else-if="foodcost.data.value">
              <div class="rep-stat-grid two">
                <div class="rep-stat accent">
                  <span class="rep-stat-k">Food cost global</span>
                  <span class="rep-stat-v">{{ fmtPct(foodcost.data.value.overallFoodCostPct) }}</span>
                  <span class="rep-stat-meta">{{ periodLabel(period) }}</span>
                </div>
                <div class="rep-stat">
                  <span class="rep-stat-k">Objetivo</span>
                  <span class="rep-stat-v">{{ fmtPct(foodcost.data.value.targetFoodCostPct) }}</span>
                  <span class="rep-stat-meta">referencia</span>
                </div>
              </div>

              <section v-if="foodcost.data.value.dishes.length" class="rep-card">
                <div class="rep-card-head"><div class="rep-card-title">Food cost por plato</div></div>
                <p class="rep-hint"><UIcon name="i-lucide-info" /> Food cost % = costo de ingredientes ÷ precio. Resaltado en rojo lo que supera el objetivo ({{ fmtPct(foodcost.data.value.targetFoodCostPct) }}).</p>
                <div class="rep-table-wrap">
                  <table class="rep-table">
                    <thead><tr><th class="left">Plato</th><th>Precio</th><th>Ingred.</th><th>Food&nbsp;cost</th><th>Uds.</th><th>Ingresos</th></tr></thead>
                    <tbody>
                      <tr v-for="d in foodcost.data.value.dishes" :key="d.name" :class="{ low: foodCostClass(num(d.foodCostPct), num(foodcost.data.value.targetFoodCostPct)) === 'bad' }">
                        <td class="left name">{{ d.name }}</td>
                        <td>{{ formatPEN(num(d.sellPrice)) }}</td>
                        <td>{{ formatPEN(num(d.ingredientCost)) }}</td>
                        <td><span class="rep-fc" :class="foodCostClass(num(d.foodCostPct), num(foodcost.data.value.targetFoodCostPct))">{{ fmtPct(d.foodCostPct) }}</span></td>
                        <td>{{ d.unitsSold }}</td>
                        <td class="strong">{{ formatPEN(num(d.revenue)) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <UiEmptyState v-else icon="i-lucide-percent" :title="`Sin platos activos en ${periodLabel(period)}`" subtitle="Activa platos con receta y registra ventas para calcular el food cost." />
            </template>
          </div>

          <aside v-if="foodcost.data.value && foodcost.data.value.dishes.length" class="scr-aside">
            <section class="scr-panel">
              <header class="scr-panel-head">
                <span class="scr-eyebrow">Food cost · {{ periodLabel(period) }}</span>
                <h3 class="scr-panel-title">{{ fmtPct(foodcost.data.value.overallFoodCostPct) }}<span class="scr-of"> global</span></h3>
              </header>
              <div class="rep-gauge">
                <div class="rep-gauge-row">
                  <span class="rep-gauge-k">Global</span>
                  <div class="rep-gauge-track"><span class="rep-gauge-fill" :class="fcOverTarget ? 'bad' : 'good'" :style="{ width: `${Math.min(100, (fcGlobal / fcScale) * 100)}%` }" /></div>
                  <span class="rep-gauge-v">{{ fmtPct(foodcost.data.value.overallFoodCostPct) }}</span>
                </div>
                <div class="rep-gauge-row">
                  <span class="rep-gauge-k">Objetivo</span>
                  <div class="rep-gauge-track"><span class="rep-gauge-fill target" :style="{ width: `${Math.min(100, (fcTarget / fcScale) * 100)}%` }" /></div>
                  <span class="rep-gauge-v">{{ fmtPct(foodcost.data.value.targetFoodCostPct) }}</span>
                </div>
              </div>
              <dl class="scr-stats">
                <div class="scr-stat"><dt>Platos sobre objetivo</dt><dd :class="{ danger: foodcostOverCount > 0 }">{{ foodcostOverCount }}</dd></div>
                <div class="scr-stat"><dt>Platos activos</dt><dd>{{ foodcost.data.value.dishes.length }}</dd></div>
              </dl>
              <p class="rep-aside-note" :class="fcOverTarget ? 'bad' : 'good'">
                <UIcon :name="fcOverTarget ? 'i-lucide-trending-up' : 'i-lucide-check'" />
                <span>{{ fcOverTarget
                  ? `El food cost global supera el objetivo en ${fcGapPts} pts.`
                  : 'El food cost global está dentro del objetivo.' }}</span>
              </p>
            </section>
          </aside>
        </div>
      </template>

      <!-- ============================ MERMAS ============================ -->
      <template v-else-if="tab === 'mermas'">
        <div class="rep-controls">
          <div class="rep-toolbar">
            <div class="rep-presets" role="tablist" aria-label="Rango de fechas">
              <button v-for="p in PRESETS" :key="p.key" role="tab" :aria-selected="preset === p.key" class="rep-preset" :class="{ active: preset === p.key }" @click="preset = p.key">{{ p.label }}</button>
            </div>
            <button class="rep-export-btn sm" :disabled="exporting || !waste.data.value" @click="exportCsv('waste')">
              <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
            </button>
          </div>
          <div class="rep-range-note">{{ rangeLabel }}</div>
        </div>

        <div class="scr-body">
          <div class="scr-main">
            <RepError v-if="waste.error.value" @retry="waste.refresh()" />
            <RepLoading v-else-if="waste.isLoading.value && !waste.data.value" />
            <template v-else-if="waste.data.value">
              <div class="rep-stat-grid two">
                <div class="rep-stat accent">
                  <span class="rep-stat-k">Costo de mermas</span>
                  <span class="rep-stat-v"><span class="cur">S/</span>{{ num(waste.data.value.totalWasteCost).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
                </div>
                <div class="rep-stat">
                  <span class="rep-stat-k">Cantidad total</span>
                  <span class="rep-stat-v">{{ num(waste.data.value.totalWasteQty).toLocaleString('es-PE') }}</span>
                  <span class="rep-stat-meta">unidades de insumo</span>
                </div>
              </div>

              <template v-if="waste.data.value.movements.length">
                <section v-if="waste.data.value.byReason.length" class="rep-card">
                  <div class="rep-card-head"><div class="rep-card-title">Por razón</div></div>
                  <div v-for="r in waste.data.value.byReason" :key="r.reason" class="rep-pareto-row">
                    <div class="rep-pareto-main">
                      <div class="rep-pareto-top">
                        <span class="rep-pareto-name capitalize">{{ r.reason }}</span>
                        <span class="rep-pareto-rev">{{ formatPEN(num(r.cost)) }}</span>
                      </div>
                      <div class="rep-dish-track">
                        <span class="rep-dish-fill" :style="{ width: `${(num(r.cost) / wasteReasonMax) * 100}%` }" />
                      </div>
                    </div>
                  </div>
                </section>

                <section v-if="waste.data.value.byIngredient.length" class="rep-card">
                  <div class="rep-card-head"><div class="rep-card-title">Por insumo</div></div>
                  <div class="rep-table-wrap">
                    <table class="rep-table">
                      <thead><tr><th class="left">Insumo</th><th>Cantidad</th><th>Costo</th></tr></thead>
                      <tbody>
                        <tr v-for="ing in waste.data.value.byIngredient" :key="ing.ingredientId">
                          <td class="left name">{{ ing.name }}</td>
                          <td>{{ num(ing.qty).toLocaleString('es-PE') }}</td>
                          <td class="strong">{{ formatPEN(num(ing.cost)) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </template>
              <UiEmptyState v-else icon="i-lucide-trash-2" title="Sin mermas en este rango" subtitle="No se registraron salidas por merma. Las mermas se registran en Inventario." />
            </template>
          </div>

          <aside v-if="waste.data.value && waste.data.value.movements.length" class="scr-aside">
            <section class="scr-panel">
              <header class="scr-panel-head">
                <span class="scr-eyebrow">Mermas · {{ rangeLabel }}</span>
                <h3 class="scr-panel-title">{{ formatPEN(num(waste.data.value.totalWasteCost)) }}<span class="scr-of"> en pérdidas</span></h3>
              </header>
              <dl class="scr-stats">
                <div v-if="wasteTopReason" class="scr-stat"><dt>Razón principal</dt><dd class="capitalize">{{ wasteTopReason.reason }}</dd></div>
                <div v-if="wasteTopReason" class="scr-stat"><dt>Costo de esa razón</dt><dd>{{ formatPEN(num(wasteTopReason.cost)) }}</dd></div>
                <div class="scr-stat"><dt>Insumos afectados</dt><dd>{{ waste.data.value.byIngredient.length }}</dd></div>
              </dl>
              <p class="rep-aside-foot">Registra las salidas por merma desde Inventario para mantener el costeo y el food cost al día.</p>
            </section>
          </aside>
        </div>
      </template>

      <!-- ============================ PRECISIÓN (F2a / HU-08-08) ============================ -->
      <template v-else-if="tab === 'precision'">
        <div class="scr-body">
          <div class="scr-main">
            <RepError v-if="accuracy.error.value" @retry="accuracy.refresh()" />
            <RepLoading v-else-if="accuracy.isLoading.value && !accuracy.data.value" />
            <template v-else-if="accuracy.data.value">
              <!-- needsMoreData: aún no transcurrieron suficientes días proyectados -->
              <UiEmptyState
                v-if="accuracy.data.value.needsMoreData"
                icon="i-lucide-crosshair"
                title="Aún no hay suficientes días para comparar"
                :subtitle="accuracy.data.value.message ?? 'Aún no transcurrieron días proyectados para comparar el pronóstico con las ventas reales. Vuelve a revisar en unos días.'"
              />
              <template v-else>
                <div class="rep-stat-grid three">
                  <div class="rep-stat accent">
                    <span class="rep-stat-k">Error promedio realizado</span>
                    <span class="rep-stat-v">{{ accSmapeLabel }}</span>
                    <span class="rep-stat-meta">sMAPE — error porcentual simétrico; más bajo es más preciso</span>
                  </div>
                  <div class="rep-stat">
                    <span class="rep-stat-k">Cobertura del rango</span>
                    <span class="rep-stat-v">{{ accCoverageDays ? `${accCoverageDays.inRange}/${accCoverageDays.total}` : '—' }}</span>
                    <span class="rep-stat-meta">días reales dentro del rango proyectado</span>
                  </div>
                  <div class="rep-stat">
                    <span class="rep-stat-k">Corridas evaluadas</span>
                    <span class="rep-stat-v">{{ accuracy.data.value.runsEvaluated }}</span>
                    <span class="rep-stat-meta">{{ accMetrics?.points ?? 0 }} día{{ (accMetrics?.points ?? 0) === 1 ? '' : 's' }} comparado{{ (accMetrics?.points ?? 0) === 1 ? '' : 's' }}</span>
                  </div>
                </div>

                <section class="rep-card">
                  <div class="rep-card-head">
                    <div class="rep-card-title">Predicho vs. real</div>
                    <span class="rep-card-meta">MAPE {{ accMapeLabel }}</span>
                  </div>
                  <p class="rep-hint">
                    <UIcon name="i-lucide-info" />
                    El sistema se autoevalúa: compara lo que predijo con lo que realmente se vendió, día a día, para las fechas ya transcurridas. La banda sombreada es el rango proyectado.
                  </p>
                  <ChartsAccuracyChart v-if="accSeries.length >= 2" :series="accSeries" />
                  <p v-else class="rep-muted">Se necesitan al menos 2 días comparables para graficar la tendencia.</p>
                </section>
              </template>
            </template>
          </div>

          <aside v-if="accuracy.data.value && !accuracy.data.value.needsMoreData" class="scr-aside">
            <section class="scr-panel">
              <header class="scr-panel-head">
                <span class="scr-eyebrow">Precisión del pronóstico</span>
                <h3 class="scr-panel-title">{{ accSmapeLabel }}<span class="scr-of"> error prom.</span></h3>
              </header>
              <dl class="scr-stats">
                <div class="scr-stat"><dt>Error promedio (sMAPE)</dt><dd>{{ accSmapeLabel }}</dd></div>
                <div class="scr-stat"><dt>Error promedio (MAPE)</dt><dd>{{ accMapeLabel }}</dd></div>
                <div v-if="accCoverageDays" class="scr-stat"><dt>Días dentro del rango</dt><dd>{{ accCoverageDays.inRange }}/{{ accCoverageDays.total }} ({{ accCoverageDays.pct.toFixed(0) }}%)</dd></div>
                <div class="scr-stat"><dt>Corridas evaluadas</dt><dd>{{ accuracy.data.value.runsEvaluated }}</dd></div>
              </dl>
              <p class="rep-aside-foot">sMAPE (error porcentual absoluto simétrico) mide qué tan lejos estuvo la predicción de la venta real, día a día; MAPE es el estándar equivalente más conocido.</p>
            </section>
          </aside>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Full-width: el layout app.vue ya acota por el sidebar; aquí usamos todo el ancho. */
.rep { padding-bottom: 0; }

/* ============ Tabs ============ */
/* Barra full-bleed (mismo lenguaje que .scr-toolbar): blanca, bajo el topbar. */
.rep-tabbar {
  background: var(--pure-white);
  border-bottom: 1px solid var(--border-subtle);
  padding: 8px 20px;
  margin-bottom: 16px;
}
.rep-tabs {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.rep-tabs::-webkit-scrollbar { display: none; }
@media (max-width: 1023px) {
  .rep-tabbar { padding: 8px 16px; }
}

/* Gutter de los controles por tab (presets / período / export): alinea con .scr-body. */
.rep-controls { padding: 0 20px; }
@media (max-width: 1023px) {
  .rep-controls { padding: 0 16px; }
}
.rep-tab {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 13px; font-weight: 600;
  color: var(--fg2);
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background var(--dur), color var(--dur), border-color var(--dur), transform 80ms;
}
.rep-tab:active { transform: scale(0.96); }
.rep-tab.active { background: var(--terracotta); color: var(--crema-100); border-color: var(--terracotta); }
.rep-tab :deep(svg) { width: 15px; height: 15px; }

/* El gutter horizontal ahora lo dan .rep-controls y .scr-body; el wrapper no aporta padding. */
.rep-content { padding: 0; }

/* ============ Toolbar (presets + export) ============ */
.rep-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-bottom: 8px; flex-wrap: wrap;
}
.rep-toolbar.end { justify-content: flex-end; }
.rep-presets { display: inline-flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.rep-presets::-webkit-scrollbar { display: none; }
.rep-preset {
  flex: 0 0 auto;
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--fg2);
  background: var(--pure-white);
  border: 1px solid var(--border-subtle); border-radius: 999px;
  padding: 7px 13px; cursor: pointer;
  transition: background var(--dur), color var(--dur), border-color var(--dur);
}
.rep-preset.active { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.rep-range-note { font-size: 12px; color: var(--fg3); margin: 0 2px 14px; font-variant-numeric: tabular-nums; }

.rep-period-field { display: flex; flex-direction: column; gap: 5px; }
.rep-period-field span { font-size: 11px; font-weight: 600; color: var(--fg3); text-transform: uppercase; letter-spacing: 0.04em; }
.rep-period-field input {
  font: inherit; font-size: 14px; color: var(--fg1);
  background: var(--pure-white); border: 1px solid var(--border); border-radius: 10px; padding: 7px 10px;
}
.rep-period-field input:focus { outline: none; border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }

.rep-export-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: var(--pure-white); border: 1px solid var(--border); border-radius: 10px;
  padding: 8px 13px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--fg1);
  cursor: pointer; transition: background var(--dur), transform 80ms;
}
.rep-export-btn:hover { background: var(--crema-100); }
.rep-export-btn:active { transform: scale(0.98); }
.rep-export-btn:disabled { opacity: 0.55; cursor: default; }
.rep-export-btn :deep(svg) { width: 15px; height: 15px; color: var(--fg2); }

.rep-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3); padding: 0 2px 10px;
}

/* ============ Stat grid ============ */
/* KPIs en fila: auto-fit reparte el ancho completo; el nº de tarjetas define
   las columnas (4 en dashboard ejecutivo, 3 en ventas/inventario, etc.). */
.rep-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 12px; margin-bottom: 14px;
}
.rep-stat {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 4px;
  box-shadow: var(--shadow-sm);
  min-height: 92px;
  text-decoration: none;
}
.rep-stat.link { transition: border-color var(--dur), transform 80ms; }
.rep-stat.link:hover { border-color: var(--border); }
.rep-stat.link:active { transform: scale(0.98); }
.rep-stat.accent { background: linear-gradient(140deg, var(--espresso) 0%, var(--espresso-800) 100%); border-color: transparent; }
.rep-stat-k { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg3); }
.rep-stat.accent .rep-stat-k { color: rgba(243, 237, 228, 0.62); }
.rep-stat-v {
  font-size: 25px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.05; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.rep-stat.accent .rep-stat-v { color: var(--crema-100); }
.rep-stat-v.accent-fg { color: var(--terracotta-700); }
.rep-stat-v.danger-fg { color: var(--danger); }
.rep-stat-v .cur { font-size: 14px; font-weight: 500; color: var(--fg3); margin-right: 3px; vertical-align: 0.16em; }
.rep-stat.accent .rep-stat-v .cur { color: rgba(243, 237, 228, 0.55); }
.rep-stat-meta { font-size: 11.5px; color: var(--fg3); margin-top: auto; }
.rep-stat.accent .rep-stat-meta { color: rgba(243, 237, 228, 0.55); }
.rep-stat-link { font-size: 11.5px; font-weight: 600; color: var(--terracotta-700); margin-top: auto; }

/* ============ Card ============ */
.rep-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.rep-card + .rep-card { margin-top: 12px; }

/* Dashboard ejecutivo: gráfico de barras + top platos lado a lado en desktop.
   El gráfico toma la columna más ancha; colapsa a 1 columna en <1024px. */
.rep-dash-split { display: grid; grid-template-columns: 1fr; gap: 12px; }
.rep-dash-split + .rep-card { margin-top: 12px; }
@media (min-width: 1024px) {
  .rep-dash-split { grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); align-items: start; }
  .rep-dash-split > .rep-card + .rep-card { margin-top: 0; }
  /* Si no hay top platos, el gráfico ocupa todo el ancho. */
  .rep-dash-split > .rep-card:only-child { grid-column: 1 / -1; }
}
.rep-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.rep-card-title {
  font-family: var(--font-serif); font-style: italic; font-weight: 500;
  font-size: 17px; line-height: 1.1; color: var(--fg1);
}
.rep-card-meta { font-size: 12px; font-weight: 600; color: var(--fg3); font-variant-numeric: tabular-nums; }
.rep-muted { font-size: 13px; color: var(--fg3); text-align: center; padding: 18px 0; }
.rep-hint {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: var(--fg2); line-height: 1.45; margin: -4px 0 14px;
}
.rep-hint :deep(svg) { width: 14px; height: 14px; color: var(--fg3); flex-shrink: 0; margin-top: 1px; }

/* ============ Chart (CSS bars) ============ */
.rep-chart { position: relative; height: 150px; margin-top: 4px; }
.rep-bars { display: flex; align-items: flex-end; gap: 7px; height: 100%; border-bottom: 1.5px solid var(--border); }
.rep-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.rep-bar { width: 100%; max-width: 34px; background: var(--terracotta-300); border-radius: 5px 5px 0 0; transition: height 0.5s var(--ease-emphasis); min-height: 2px; }
/* Paleta cálida categórica — cada barra con su color (más vida, sin salir de la marca) */
.rep-bar-col:nth-child(7n+1) .rep-bar { background: var(--terracotta); }
.rep-bar-col:nth-child(7n+2) .rep-bar { background: var(--mostaza); }
.rep-bar-col:nth-child(7n+3) .rep-bar { background: var(--oliva); }
.rep-bar-col:nth-child(7n+4) .rep-bar { background: #C98A5E; }
.rep-bar-col:nth-child(7n+5) .rep-bar { background: var(--mostaza-700); }
.rep-bar-col:nth-child(7n+6) .rep-bar { background: var(--oliva-700); }
.rep-bar-col:nth-child(7n+7) .rep-bar { background: var(--terracotta-700); }
.rep-bar-col:hover .rep-bar { filter: brightness(1.06) saturate(1.1); }
.rep-bar-lbl { font-size: 10.5px; font-weight: 500; color: var(--fg3); margin-top: 7px; font-variant-numeric: tabular-nums; white-space: nowrap; }
/* En desktop el gráfico vive en la columna ancha: más alto y barras más cuerpo. */
@media (min-width: 1024px) {
  .rep-chart { height: 176px; }
  .rep-bar { max-width: 46px; }
}

/* ============ Dish rows (dashboards) ============ */
.rep-dish { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 12px; padding: 10px 0; }
.rep-dish + .rep-dish { border-top: 1px solid var(--border-subtle); }
.rep-dish-pos { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-size: 16px; color: var(--fg3); text-align: center; }
.rep-dish-pos.first { color: var(--terracotta-700); }
.rep-dish-main { min-width: 0; }
.rep-dish-name { display: block; font-size: 14px; font-weight: 600; color: var(--fg1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rep-dish-right { text-align: right; display: flex; flex-direction: column; gap: 2px; }
.rep-dish-units { font-size: 13.5px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }
.rep-dish-sub { font-size: 11px; color: var(--fg3); font-variant-numeric: tabular-nums; }
.rep-dish-track { display: block; height: 7px; border-radius: 999px; background: var(--crema-200); overflow: hidden; margin-top: 6px; }
.rep-dish-fill { display: block; height: 100%; border-radius: 999px; background: var(--terracotta-300); transition: width 0.6s var(--ease-emphasis); }
.rep-dish-fill.abc-a { background: var(--terracotta); }
.rep-dish-fill.abc-b { background: var(--mostaza); }
.rep-dish-fill.abc-c { background: var(--espresso-400); }

/* ============ Pareto rows ============ */
.rep-pareto-row { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 12px; padding: 12px 0; }
.rep-pareto-row + .rep-pareto-row { border-top: 1px solid var(--border-subtle); }
.rep-abc {
  width: 26px; height: 26px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; flex-shrink: 0;
}
.rep-abc.abc-a { background: var(--terracotta-100); color: var(--terracotta-700); }
.rep-abc.abc-b { background: var(--mostaza-100); color: var(--mostaza-700); }
.rep-abc.abc-c { background: var(--crema-200); color: var(--fg2); }
.rep-pareto-main { min-width: 0; }
.rep-pareto-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.rep-pareto-name { font-size: 14px; font-weight: 600; color: var(--fg1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rep-pareto-rev { font-size: 13.5px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.rep-pareto-sub { font-size: 11.5px; color: var(--fg3); margin-top: 5px; }

/* ============ Methods (cashier) ============ */
.rep-methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px 20px; }
.rep-method { display: flex; align-items: center; gap: 9px; }
.rep-method-dot { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
.rep-method-k { font-size: 13px; color: var(--fg2); }
.rep-method-v { margin-left: auto; font-size: 13.5px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }

/* ============ Table ============ */
.rep-table-wrap { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: 12px; margin-top: 14px; }
.rep-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rep-table th, .rep-table td { padding: 10px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rep-table th { font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--fg3); border-bottom: 1px solid var(--border-subtle); background: var(--crema-50); }
.rep-table th.left, .rep-table td.left { text-align: left; }
.rep-table tbody tr { border-bottom: 1px solid var(--border-subtle); }
.rep-table tbody tr:last-child { border-bottom: none; }
/* Zebra sutil para el ritmo de lectura; la fila destacada (.low) gana por orden de fuente. */
.rep-table tbody tr:nth-child(even) { background: var(--crema-50); }
.rep-table tbody tr.low { background: var(--danger-bg); }
.rep-table td.name { font-weight: 600; color: var(--fg1); }
.rep-table td.strong { font-weight: 700; color: var(--fg1); }
.rep-table td small { color: var(--fg3); font-weight: 500; }

.rep-fc, .rep-status {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.rep-fc.good, .rep-status.ok { background: var(--oliva-100); color: var(--oliva-700); }
.rep-fc.mid, .rep-status.low { background: var(--mostaza-100); color: var(--mostaza-700); }
.rep-fc.bad, .rep-status.crit { background: var(--danger-bg); color: var(--danger); }

.capitalize { text-transform: capitalize; }

/* ============ Paneles de resumen lateral (.scr-aside) ============ */
/* Bloques dentro del .scr-panel (método de pago, comprobante, etc.). */
.rep-aside-block { margin-top: 16px; }
.rep-aside-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3); margin-bottom: 9px;
}
.scr-aside .rep-methods { grid-template-columns: 1fr; gap: 9px; }

/* dt con punto de leyenda + dd con color semántico (alineación dentro del panel). */
.scr-aside .scr-stat dt { display: inline-flex; align-items: center; gap: 8px; }
.scr-aside .scr-stat dd.warn { color: var(--mostaza-700); }
.scr-aside .scr-stat dd.danger { color: var(--danger); }

/* Barra segmentada de distribución (ABC / estado de stock) — un vistazo de la mezcla. */
.rep-seg-bar { display: flex; gap: 3px; height: 9px; margin: 2px 0 14px; }
.rep-seg { border-radius: 999px; min-width: 5px; transition: flex-grow var(--dur-slow, 0.4s) var(--ease-emphasis); }
.rep-seg.s-a { background: var(--terracotta); }
.rep-seg.s-b { background: var(--mostaza); }
.rep-seg.s-c { background: var(--espresso-400); }
.rep-seg.s-ok { background: var(--oliva); }
.rep-seg.s-low { background: var(--mostaza); }
.rep-seg.s-crit { background: var(--danger); }
.rep-seg-dot { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }
.rep-seg-dot.s-a { background: var(--terracotta); }
.rep-seg-dot.s-b { background: var(--mostaza); }
.rep-seg-dot.s-c { background: var(--espresso-400); }
.rep-seg-dot.s-ok { background: var(--oliva); }
.rep-seg-dot.s-low { background: var(--mostaza); }
.rep-seg-dot.s-crit { background: var(--danger); }

/* Gauge global vs objetivo (food cost). */
.rep-gauge { display: flex; flex-direction: column; gap: 10px; margin: 2px 0 4px; }
.rep-gauge-row { display: grid; grid-template-columns: 56px 1fr auto; align-items: center; gap: 10px; }
.rep-gauge-k { font-size: 12px; color: var(--fg2); }
.rep-gauge-track { height: 8px; border-radius: 999px; background: var(--crema-200); overflow: hidden; }
.rep-gauge-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.6s var(--ease-emphasis); }
.rep-gauge-fill.good { background: var(--oliva); }
.rep-gauge-fill.bad { background: var(--danger); }
.rep-gauge-fill.target { background: var(--espresso-400); }
.rep-gauge-v { font-size: 12.5px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }

/* CTA accionable y notas del panel. */
.rep-aside-cta {
  display: inline-flex; align-items: center; gap: 7px; margin-top: 16px;
  font-size: 12.5px; font-weight: 600; color: var(--terracotta-700); text-decoration: none;
  transition: color var(--dur);
}
.rep-aside-cta:hover { color: var(--terracotta); }
.rep-aside-cta :deep(svg) { width: 14px; height: 14px; }
.rep-aside-foot { margin: 16px 0 0; font-size: 11.5px; color: var(--fg3); line-height: 1.5; }
.rep-aside-note {
  display: flex; align-items: flex-start; gap: 8px; margin: 16px 0 0;
  padding: 10px 12px; border-radius: 12px; font-size: 12px; line-height: 1.45; font-weight: 500;
}
.rep-aside-note.bad { background: var(--terracotta-100); color: var(--terracotta-700); }
.rep-aside-note.good { background: var(--oliva-100); color: var(--oliva-700); }
.rep-aside-note :deep(svg) { width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px; }

@media (prefers-reduced-motion: reduce) {
  .rep-bar, .rep-dish-fill, .rep-seg, .rep-gauge-fill { transition: none !important; }
}
</style>
