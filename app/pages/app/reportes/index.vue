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
type TabId = 'dashboard' | 'ventas' | 'pareto' | 'inventario' | 'foodcost' | 'mermas'
interface Tab { id: TabId, label: string, icon: string, manageOnly?: boolean }
const ALL_TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'i-lucide-layout-dashboard' },
  { id: 'ventas', label: 'Ventas', icon: 'i-lucide-trending-up', manageOnly: true },
  { id: 'pareto', label: 'Platos', icon: 'i-lucide-trophy', manageOnly: true },
  { id: 'inventario', label: 'Inventario', icon: 'i-lucide-package', manageOnly: true },
  { id: 'foodcost', label: 'Food cost', icon: 'i-lucide-percent', manageOnly: true },
  { id: 'mermas', label: 'Mermas', icon: 'i-lucide-trash-2', manageOnly: true },
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
const num = (s: string | undefined | null): number => Number(s ?? 0)
function fmtDay(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
}
function fmtPct(s: string | number): string {
  return `${Number(s).toFixed(1)}%`
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

/* ============ CSV export (HU-07-10) ============ */
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

    <!-- Tabs -->
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

    <div class="rep-content">
      <!-- ============================ DASHBOARD ============================ -->
      <template v-if="tab === 'dashboard'">
        <!-- ---- Cajero (staff) ---- -->
        <template v-if="!canManage">
          <RepError v-if="cashier.error.value" @retry="cashier.refresh()" />
          <RepLoading v-else-if="cashier.isLoading.value && !cashier.data.value" />
          <template v-else-if="cashier.data.value">
            <div class="rep-eyebrow">Caja de hoy</div>
            <div class="rep-stat-grid">
              <div class="rep-stat accent">
                <span class="rep-stat-k">Total cobrado</span>
                <span class="rep-stat-v"><span class="cur">S/</span>{{ num(cashier.data.value.totalCollected).toLocaleString('es-PE') }}</span>
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
                <span class="rep-stat-v"><span class="cur">S/</span>{{ num(admin.data.value.revenueToday).toLocaleString('es-PE') }}</span>
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
                <span class="rep-stat-v"><span class="cur">S/</span>{{ num(manager.data.value.revenueToday).toLocaleString('es-PE') }}</span>
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
      </template>

      <!-- ============================ VENTAS ============================ -->
      <template v-else-if="tab === 'ventas'">
        <div class="rep-toolbar">
          <div class="rep-presets" role="tablist" aria-label="Rango de fechas">
            <button v-for="p in PRESETS" :key="p.key" role="tab" :aria-selected="preset === p.key" class="rep-preset" :class="{ active: preset === p.key }" @click="preset = p.key">{{ p.label }}</button>
          </div>
          <button class="rep-export-btn sm" :disabled="exporting || !sales.data.value" @click="exportCsv('sales')">
            <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
          </button>
        </div>
        <div class="rep-range-note">{{ rangeLabel }}</div>

        <RepError v-if="sales.error.value" @retry="sales.refresh()" />
        <RepLoading v-else-if="sales.isLoading.value && !sales.data.value" />
        <template v-else-if="sales.data.value">
          <div class="rep-stat-grid three">
            <div class="rep-stat accent">
              <span class="rep-stat-k">Ingresos</span>
              <span class="rep-stat-v"><span class="cur">S/</span>{{ num(sales.data.value.totalRevenue).toLocaleString('es-PE') }}</span>
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
      </template>

      <!-- ============================ PARETO ============================ -->
      <template v-else-if="tab === 'pareto'">
        <div class="rep-toolbar">
          <div class="rep-presets" role="tablist" aria-label="Rango de fechas">
            <button v-for="p in PRESETS" :key="p.key" role="tab" :aria-selected="preset === p.key" class="rep-preset" :class="{ active: preset === p.key }" @click="preset = p.key">{{ p.label }}</button>
          </div>
        </div>
        <div class="rep-range-note">{{ rangeLabel }}</div>

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
      </template>

      <!-- ============================ INVENTARIO ============================ -->
      <template v-else-if="tab === 'inventario'">
        <div class="rep-toolbar end">
          <button class="rep-export-btn sm" :disabled="exporting || !inventory.data.value" @click="exportCsv('inventory')">
            <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
          </button>
        </div>

        <RepError v-if="inventory.error.value" @retry="inventory.refresh()" />
        <RepLoading v-else-if="inventory.isLoading.value && !inventory.data.value" />
        <template v-else-if="inventory.data.value">
          <div class="rep-stat-grid">
            <div class="rep-stat accent">
              <span class="rep-stat-k">Valor del stock</span>
              <span class="rep-stat-v"><span class="cur">S/</span>{{ num(inventory.data.value.totalStockValue).toLocaleString('es-PE') }}</span>
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
      </template>

      <!-- ============================ FOOD COST ============================ -->
      <template v-else-if="tab === 'foodcost'">
        <div class="rep-toolbar">
          <label class="rep-period-field">
            <span>Período</span>
            <input v-model="period" type="month" aria-label="Período (mes)">
          </label>
          <button class="rep-export-btn sm" :disabled="exporting || !foodcost.data.value" @click="exportCsv('food-cost')">
            <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
          </button>
        </div>

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
      </template>

      <!-- ============================ MERMAS ============================ -->
      <template v-else-if="tab === 'mermas'">
        <div class="rep-toolbar">
          <div class="rep-presets" role="tablist" aria-label="Rango de fechas">
            <button v-for="p in PRESETS" :key="p.key" role="tab" :aria-selected="preset === p.key" class="rep-preset" :class="{ active: preset === p.key }" @click="preset = p.key">{{ p.label }}</button>
          </div>
          <button class="rep-export-btn sm" :disabled="exporting || !waste.data.value" @click="exportCsv('waste')">
            <UIcon :name="exporting ? 'i-lucide-loader-circle' : 'i-lucide-download'" :class="{ spin: exporting }" /> CSV
          </button>
        </div>
        <div class="rep-range-note">{{ rangeLabel }}</div>

        <RepError v-if="waste.error.value" @retry="waste.refresh()" />
        <RepLoading v-else-if="waste.isLoading.value && !waste.data.value" />
        <template v-else-if="waste.data.value">
          <div class="rep-stat-grid two">
            <div class="rep-stat accent">
              <span class="rep-stat-k">Costo de mermas</span>
              <span class="rep-stat-v"><span class="cur">S/</span>{{ num(waste.data.value.totalWasteCost).toLocaleString('es-PE') }}</span>
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
      </template>
    </div>
  </div>
</template>

<style scoped>
.rep { max-width: 860px; margin: 0 auto; padding-bottom: 24px; }

/* ============ Tabs ============ */
.rep-tabs {
  display: flex; gap: 6px;
  padding: 0 20px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}
.rep-tabs::-webkit-scrollbar { display: none; }
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

.rep-content { padding: 0 20px; }

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
.rep-stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
.rep-stat-grid.three { grid-template-columns: repeat(3, 1fr); }
.rep-stat-grid.two { grid-template-columns: repeat(2, 1fr); }
@media (max-width: 520px) {
  .rep-stat-grid.three { grid-template-columns: 1fr 1fr; }
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
.rep-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
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

@media (prefers-reduced-motion: reduce) {
  .rep-bar, .rep-dish-fill { transition: none !important; }
}
</style>
