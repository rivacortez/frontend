<script setup lang="ts">
import { useAdminDashboard, useManagerDashboard, useCashierDashboard } from '~/composables/use-reports'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Inicio — GastronomIA' })

const { user } = useUserSession()

// Nombre a mostrar: primer nombre; si la cuenta se registró con un email como
// nombre, usa la parte local (antes de @) en vez del email crudo.
const displayName = computed(() => {
  const n = user.value?.name?.trim() ?? ''
  if (!n) return ''
  return n.includes('@') ? (n.split('@')[0] ?? n) : (n.split(' ')[0] ?? n)
})

const dateLabel = computed(() => {
  const label = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima',
  }).format(new Date())
  return label.charAt(0).toUpperCase() + label.slice(1)
})

// Header de la vista en la topbar del shell: saludo + fecha/estado del negocio.
definePageHeader(() => ({
  title: displayName.value ? `Hola, ${displayName.value}` : 'Inicio',
  subtitle: `${dateLabel.value} · Abierto`,
}))

/* KPIs reales (E07) por rol: owner→ejecutivo, manager→operativo, staff→caja. */
const isOwner = computed(() => user.value?.role === 'owner')
const isManager = computed(() => user.value?.role === 'manager')
const canManage = computed(() => isOwner.value || isManager.value)
const num = (s: string | number | undefined | null): number => Number(s ?? 0)

const admin = useAdminDashboard(() => isOwner.value)
const manager = useManagerDashboard(() => canManage.value)
const cashier = useCashierDashboard(() => !canManage.value)
const tables = useTables()

const primary = computed(() => (isOwner.value ? admin : canManage.value ? manager : cashier))
const kpisLoading = computed(() => primary.value.isLoading.value && !primary.value.data.value)
const kpisError = computed(() => !!primary.value.error.value)

const revenueToday = computed<number>(() => {
  if (isOwner.value) return num(admin.data.value?.revenueToday)
  if (canManage.value) return num(manager.data.value?.revenueToday)
  return num(cashier.data.value?.totalCollected)
})
const revenueLabel = computed(() => (canManage.value ? 'Venta hoy' : 'Caja de hoy'))
const ordersToday = computed<number>(() => {
  if (isOwner.value) return admin.data.value?.ordersToday ?? 0
  if (canManage.value) return manager.data.value?.salesToday ?? 0
  return cashier.data.value?.salesCount ?? 0
})

const occupancy = computed(() => {
  const active = manager.data.value?.openTables ?? 0
  const total = tables.data.value?.length ?? 0
  const pct = total > 0 ? Math.round((active / total) * 100) : 0
  return { active, total, pct }
})

const grossMarginPct = computed<number>(() => num(admin.data.value?.grossMarginPct))
const lowStockCount = computed<number>(() => {
  if (isOwner.value) return admin.data.value?.lowStockCount ?? 0
  if (canManage.value) return manager.data.value?.lowStockCount ?? 0
  return 0
})
const avgTicket = computed<number>(() => num(cashier.data.value?.avgTicket))

interface TopDish { name: string, qty: number, revenue: number }
const topDishes = computed<TopDish[]>(() => {
  if (isOwner.value) return (admin.data.value?.topDishes ?? []).map(d => ({ name: d.name, qty: d.qty, revenue: num(d.revenue) }))
  if (canManage.value) return (manager.data.value?.topDishesToday ?? []).map(d => ({ name: d.name, qty: d.qty, revenue: num(d.revenue) }))
  return []
})
const maxDishRev = computed(() => Math.max(1, ...topDishes.value.map(d => d.revenue)))

// ===== Serie de ventas (7 días) para el gráfico de tendencia (owner) =====
function dayLabel(day: string): string {
  const d = new Date(day)
  if (!Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' })
      .format(d).replace('.', '')
  }
  return day
}
const salesSeries = computed(() =>
  (admin.data.value?.salesByDay7d ?? []).map(p => ({ label: dayLabel(p.day), value: num(p.revenue) })),
)
const hasSalesSeries = computed(() => salesSeries.value.length >= 2)
const revenue7d = computed(() => num(admin.data.value?.revenue7d))

// Tendencia día-a-día de la venta (último punto vs anterior de la serie 7d) — dato real.
const revenueTrend = computed<{ pct: number, up: boolean } | null>(() => {
  const s = salesSeries.value
  if (s.length < 2) return null
  const today = s[s.length - 1]?.value ?? 0
  const prev = s[s.length - 2]?.value ?? 0
  if (prev === 0) return null
  const pct = Math.round(((today - prev) / prev) * 100)
  return { pct, up: pct >= 0 }
})

const shortcuts = [
  { icon: 'i-lucide-utensils', label: 'Recetas', sub: 'Costos y márgenes', to: '/app/recetas' },
  { icon: 'i-lucide-line-chart', label: 'Pronósticos', sub: 'Demanda con IA', to: '/app/reportes' },
  { icon: 'i-lucide-package', label: 'Inventario', sub: 'Stock y mermas', to: '/app/inventario' },
  { icon: 'i-lucide-scan-line', label: 'Escanear factura', sub: 'Carga con IA', to: '/app/datos/factura-ia' },
  { icon: 'i-lucide-shopping-cart', label: 'Compras', sub: 'Lista de compra', to: '/app/inventario/lista-compras' },
  { icon: 'i-lucide-bar-chart-3', label: 'Reportes', sub: 'KPIs y análisis', to: '/app/reportes' },
]
</script>

<template>
  <div class="dash">
    <!-- KPIs -->
    <section aria-label="Indicadores de hoy">
      <div class="row-head"><span class="section-title">Resumen de hoy</span></div>

      <div v-if="kpisError" class="state">
        <p>No se pudieron cargar los indicadores.</p>
        <button class="btn btn-ghost" @click="primary.refresh()"><UIcon name="i-lucide-rotate-cw" /> Reintentar</button>
      </div>

      <div v-else-if="kpisLoading" class="kpi-grid" aria-busy="true">
        <div v-for="i in 3" :key="i" class="kpi"><span class="sk sk-l" /><span class="sk sk-n" /><span class="sk sk-f" /></div>
      </div>

      <div v-else class="kpi-grid">
        <!-- Venta / Caja -->
        <article class="kpi">
          <div class="kpi-head">
            <p class="eyebrow">{{ revenueLabel }}</p>
            <span class="kpi-ico is-coral" aria-hidden="true"><UIcon name="i-lucide-wallet" /></span>
          </div>
          <p class="stat kpi-num"><span class="cur">S/</span>{{ revenueToday.toLocaleString('es-PE') }}</p>
          <div v-if="hasSalesSeries" class="kpi-viz">
            <ChartsSparkline :values="salesSeries.map(p => p.value)" color="var(--terracotta)" :height="30" />
          </div>
          <div class="kpi-foot">
            <span v-if="revenueTrend" class="delta" :class="revenueTrend.up ? 'is-up' : 'is-down'">
              <UIcon :name="revenueTrend.up ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="delta-ico" />
              {{ revenueTrend.up ? '+' : '' }}{{ revenueTrend.pct }}%
            </span>
            <span class="kpi-ctx">{{ ordersToday }} {{ canManage ? 'pedido' : 'ticket' }}{{ ordersToday === 1 ? '' : 's' }} · vs ayer</span>
          </div>
        </article>

        <!-- Mesas (owner/manager) -->
        <NuxtLink v-if="canManage" to="/app/pos" class="kpi kpi-link">
          <div class="kpi-head">
            <p class="eyebrow">Mesas activas</p>
            <span class="kpi-ico is-amber" aria-hidden="true"><UIcon name="i-lucide-users" /></span>
          </div>
          <p class="stat kpi-num">{{ occupancy.active }}<span class="dim">/{{ occupancy.total }}</span></p>
          <div class="seats" :aria-label="`${occupancy.active} de ${occupancy.total} mesas ocupadas`">
            <span v-for="n in occupancy.total" :key="n" class="seat" :class="{ 'is-on': n <= occupancy.active }" />
          </div>
          <div class="kpi-foot">
            <span class="delta is-neutral">{{ occupancy.pct }}%</span>
            <span class="kpi-ctx">de ocupación</span>
          </div>
        </NuxtLink>

        <!-- Margen (owner) / Stock (manager) -->
        <NuxtLink v-if="isOwner" to="/app/reportes" class="kpi kpi-link">
          <div class="kpi-head">
            <p class="eyebrow">Margen bruto</p>
            <span class="kpi-ico" :class="grossMarginPct >= 65 ? 'is-green' : grossMarginPct >= 40 ? 'is-amber' : 'is-red'" aria-hidden="true"><UIcon name="i-lucide-percent" /></span>
          </div>
          <p class="stat kpi-num" :class="grossMarginPct >= 65 ? 'is-good' : grossMarginPct >= 40 ? 'is-warn-n' : 'is-bad'">{{ grossMarginPct.toFixed(0) }}<span class="dim">%</span></p>
          <div class="tbar" :aria-label="`Margen ${grossMarginPct.toFixed(0)}%, objetivo 65%`">
            <span class="tbar-fill" :style="{ width: Math.min(100, grossMarginPct) + '%', background: grossMarginPct >= 65 ? '#2F8F46' : grossMarginPct >= 40 ? 'var(--mostaza)' : 'var(--danger)' }" />
            <span class="tbar-target" />
          </div>
          <div class="kpi-foot">
            <span class="delta" :class="grossMarginPct >= 65 ? 'is-up' : 'is-warn'">
              <UIcon :name="grossMarginPct >= 65 ? 'i-lucide-check' : 'i-lucide-alert-triangle'" class="delta-ico" />
              {{ grossMarginPct >= 65 ? 'Saludable' : 'Ajustar' }}
            </span>
            <span class="kpi-ctx">{{ lowStockCount }} insumo{{ lowStockCount === 1 ? '' : 's' }} bajo{{ lowStockCount === 1 ? '' : 's' }}</span>
          </div>
        </NuxtLink>
        <NuxtLink v-else-if="isManager" to="/app/inventario" class="kpi kpi-link">
          <p class="eyebrow">Stock bajo</p>
          <p class="stat kpi-num" :class="{ accent: lowStockCount > 0 }">{{ lowStockCount }}</p>
          <p class="kpi-foot">{{ lowStockCount > 0 ? 'Revisar insumos' : 'Todo en orden' }}</p>
        </NuxtLink>
        <article v-else class="kpi">
          <p class="eyebrow">Ticket promedio</p>
          <p class="stat kpi-num accent">{{ formatPEN(avgTicket) }}</p>
          <p class="kpi-foot">caja del día</p>
        </article>
      </div>
    </section>

    <!-- Tendencia de ventas (owner) -->
    <section v-if="hasSalesSeries" class="panel trend" aria-label="Tendencia de ventas">
      <div class="panel-head">
        <div class="trend-title">
          <span class="section-title">Ventas · últimos 7 días</span>
          <p class="trend-total stat"><span class="cur">S/</span>{{ revenue7d.toLocaleString('es-PE') }}</p>
        </div>
        <NuxtLink to="/app/reportes" class="link">Ver reportes</NuxtLink>
      </div>
      <ChartsAreaChart :data="salesSeries" unit="S/" />
    </section>

    <!-- Cuerpo: top platos + accesos -->
    <section class="body">
      <!-- Top platos (real) -->
      <div class="panel">
        <div class="panel-head">
          <span class="section-title">Top platos de hoy</span>
          <NuxtLink to="/app/reportes" class="link">Ver reportes</NuxtLink>
        </div>
        <ul v-if="topDishes.length" class="dish-list">
          <li v-for="(d, i) in topDishes.slice(0, 6)" :key="d.name" class="dish">
            <span class="dish-pos">{{ String(i + 1).padStart(2, '0') }}</span>
            <div class="dish-main">
              <div class="dish-row">
                <span class="dish-name">{{ d.name }}</span>
                <span class="dish-rev stat-sm">{{ formatPEN(d.revenue) }}</span>
              </div>
              <div class="dish-track" aria-hidden="true">
                <span class="dish-fill" :style="{ width: `${Math.max(6, (d.revenue / maxDishRev) * 100)}%` }" />
              </div>
            </div>
            <span class="dish-qty">{{ d.qty }} und</span>
          </li>
        </ul>
        <div v-else class="empty">
          <p class="empty-t">El ranking arranca con la primera venta</p>
          <p class="empty-s">Apenas entre el primer pedido del día, tus platos estrella se ordenan acá solos —con cuánto vendiste y cuánto te dejó cada uno.</p>
        </div>
      </div>

      <!-- Accesos -->
      <div class="panel">
        <div class="panel-head"><span class="section-title">Accesos</span></div>
        <ul class="idx">
          <li v-for="(s, i) in shortcuts" :key="s.label">
            <NuxtLink :to="s.to" class="idx-row">
              <span class="idx-n">{{ String(i + 1).padStart(2, '0') }}</span>
              <UIcon :name="s.icon" class="idx-ico" />
              <span class="idx-main">
                <span class="idx-label">{{ s.label }}</span>
                <span class="idx-sub">{{ s.sub }}</span>
              </span>
              <UIcon name="i-lucide-arrow-right" class="idx-arrow" />
            </NuxtLink>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash {
  width: 100%;
  /* Llena el área de contenido, alineado arriba-izquierda (no centrado). El cap
     evita estiramientos absurdos en monitores ultra-anchos. */
  max-width: 1720px;
  margin: 0;
  padding: clamp(20px, 2.6vw, 36px) clamp(20px, 2.6vw, 38px) 48px;
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 2.4vh, 30px);
}

/* Header */
.dash-hdr { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.dash-greet { font-size: clamp(30px, 4vw, 46px); margin: 6px 0 0; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; }
.eyebrow .sep { opacity: 0.5; }
.open { display: inline-flex; align-items: center; gap: 6px; color: var(--oliva-700); font-weight: 600; }
.open .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--oliva); box-shadow: 0 0 0 3px var(--oliva-100); }
.dash-actions { display: flex; gap: 8px; flex-shrink: 0; }
.icon-btn .badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--bg);
}

.row-head { margin-bottom: 14px; }

/* KPIs — números grandes, tarjetas sutiles, sin cuadritos de color */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: clamp(12px, 1.5vw, 18px);
}
.kpi {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(26, 26, 26, 0.05), 0 10px 26px -12px rgba(26, 26, 26, 0.16);
  padding: clamp(18px, 2vw, 26px);
  display: flex; flex-direction: column; gap: 10px;
  text-decoration: none;
  transition:
    border-color var(--dur) var(--ease-standard),
    box-shadow var(--dur) var(--ease-standard),
    transform var(--dur) var(--ease-standard);
}
.kpi-link:hover { border-color: var(--border); box-shadow: var(--shadow); transform: translateY(-2px); }

/* Mini-barras de medida (ocupación, margen) — data real */
.meter { height: 5px; border-radius: 999px; background: var(--crema-200); overflow: hidden; margin-top: 2px; }
.meter-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.5s var(--ease-standard); }
.meter-fill.is-oliva { background: var(--oliva); }
.meter-fill.is-terracotta { background: var(--terracotta); }

/* Card hero — foco cálido oscuro para la métrica principal */
.kpi.is-hero {
  position: relative; /* ancla el .hero-glow absoluto para que overflow:hidden lo recorte */
  border-color: transparent;
  color: var(--crema-100);
  overflow: hidden;
  background:
    radial-gradient(130% 130% at 88% 0%, rgba(201, 106, 67, 0.30), transparent 56%),
    linear-gradient(155deg, #2c2118 0%, #1e1712 100%);
  box-shadow: 0 14px 34px rgba(26, 26, 26, 0.18), 0 2px 6px rgba(26, 26, 26, 0.08);
}
.kpi.is-hero .eyebrow { color: var(--terracotta-300); position: relative; }
.kpi.is-hero .kpi-num { color: var(--crema-50); position: relative; }
.kpi.is-hero .kpi-num .cur { color: rgba(248, 244, 237, 0.55); }
.kpi.is-hero .kpi-foot { color: rgba(248, 244, 237, 0.62); position: relative; }
.kpi.is-hero .kpi-spark { position: relative; }
.hero-glow {
  position: absolute; right: -36px; bottom: -46px;
  width: 170px; height: 170px; border-radius: 50%;
  background: radial-gradient(circle, rgba(216, 164, 65, 0.20), transparent 70%);
  pointer-events: none;
}
.kpi-num {
  font-size: clamp(40px, 5vw, 60px);
  color: var(--fg1);
}
.kpi-num .cur { font-size: 0.42em; font-weight: 600; color: var(--fg3); vertical-align: 0.5em; margin-right: 2px; letter-spacing: 0; }
.kpi-num .dim { color: var(--fg3); }
.kpi-num.accent { color: var(--terracotta); }
/* Color SEMÁNTICO según estado del negocio (no la marca) */
.kpi-num.is-good { color: #2F8F46; }
.kpi-num.is-warn-n { color: var(--mostaza-700); }
.kpi-num.is-bad { color: var(--danger); }
.kpi-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 13px; color: var(--fg3);
}
.kpi-ctx { font-size: 12.5px; color: var(--fg3); }

/* Micro-visualizaciones por card (línea / puntos / barra-a-objetivo) */
.kpi-viz { height: 30px; margin: 2px 0; }
.seats { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 2px; }
.seat {
  width: 15px; height: 15px; border-radius: 4px;
  border: 1.5px solid var(--border);
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.seat.is-on { background: var(--mostaza); border-color: var(--mostaza); }
.tbar { position: relative; height: 8px; border-radius: 999px; background: var(--crema-200); margin: 10px 0 2px; }
.tbar-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.6s var(--ease-standard); }
.tbar-target {
  position: absolute; top: -2px; left: 65%;
  width: 2px; height: 12px; background: var(--fg2); border-radius: 1px;
}
.foot-ico { width: 14px; height: 14px; flex-shrink: 0; }

/* Pastilla de tendencia (delta %) — estilo "analytics" de la referencia */
.kpi-foot--row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.foot-ctx { display: inline-flex; align-items: center; gap: 7px; }
.delta {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
  line-height: 1.4;
}
.delta-ico { width: 13px; height: 13px; }
.delta.is-up { background: #E5F2E4; color: #2F8F46; }
.delta.is-down { background: var(--danger-bg); color: var(--danger); }
.delta.is-neutral { background: var(--crema-200); color: var(--fg2); }
.delta.is-warn { background: var(--mostaza-100); color: var(--mostaza-700); }

/* Cabecera de KPI: label + chip de ícono (esquina) */
.kpi-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.kpi-ico {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 10px;
  background: var(--crema-100); border: 1px solid var(--border-subtle);
  color: var(--terracotta-700); flex-shrink: 0;
}
.kpi-ico .iconify { width: 17px; height: 17px; }
/* Chips con color semántico variado (como la referencia) */
.kpi-ico.is-coral { background: var(--terracotta-100); color: var(--terracotta); border-color: var(--terracotta-100); }
.kpi-ico.is-amber { background: var(--mostaza-100); color: var(--mostaza-700); border-color: var(--mostaza-100); }
.kpi-ico.is-green { background: #E5F2E4; color: #2F8F46; border-color: #D7EAD6; }
.kpi-ico.is-red { background: var(--danger-bg); color: var(--danger); border-color: var(--danger-bg); }
.kpi.is-hero .kpi-ico {
  background: rgba(248, 244, 237, 0.10);
  border-color: rgba(248, 244, 237, 0.16);
  color: var(--mostaza);
}
.kpi-spark { margin-top: 4px; height: 36px; }

/* Panel de tendencia (gráfico de área) */
.trend .panel-head { align-items: flex-end; margin-bottom: 10px; }
.trend-title { display: flex; flex-direction: column; gap: 6px; }
.trend-total { font-size: clamp(22px, 2.6vw, 30px); color: var(--fg1); line-height: 1; }
.trend-total .cur { font-size: 0.5em; font-weight: 600; color: var(--fg3); vertical-align: 0.4em; margin-right: 2px; }

/* Cuerpo: dos columnas en desktop */
.body {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(16px, 2vw, 24px);
}
@media (min-width: 960px) {
  .body { grid-template-columns: 1.1fr 1fr; }
}
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(26, 26, 26, 0.05), 0 10px 26px -12px rgba(26, 26, 26, 0.16);
  padding: clamp(18px, 2vw, 26px);
}
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.link { font-size: 13px; font-weight: 600; color: var(--terracotta-700); }
/* Títulos de sección en serif (Lora) — la voz editorial del login, llevada al panel */
.section-title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--fg1);
}

/* Top platos — con barra de contribución */
.dish-list { list-style: none; padding: 0; margin: 0; }
.dish {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px;
  padding: 12px 0;
}
.dish + .dish { border-top: 1px solid var(--border-subtle); }
.dish-pos { font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; color: var(--fg3); }
.dish-main { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.dish-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dish-name { font-size: 14.5px; font-weight: 500; color: var(--fg1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-sm { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dish-rev { font-size: 14px; color: var(--fg1); flex: none; }
.dish-track { height: 5px; border-radius: 999px; background: var(--crema-200); overflow: hidden; }
.dish-fill {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--terracotta-300), var(--terracotta));
}
.dish-qty { font-size: 12px; color: var(--fg3); font-variant-numeric: tabular-nums; min-width: 48px; text-align: right; }

/* Empty state limpio */
.empty { padding: 28px 4px; }
.empty-t { font-size: 14px; font-weight: 600; color: var(--fg2); }
.empty-s { font-size: 13px; color: var(--fg3); margin-top: 4px; line-height: 1.5; max-width: 42ch; }

/* Accesos */
.acc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.acc {
  position: relative;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 16px;
  display: flex; flex-direction: column;
  text-decoration: none;
  transition:
    border-color var(--dur) var(--ease-standard),
    background var(--dur) var(--ease-standard),
    transform var(--dur) var(--ease-standard);
}
.acc:hover { border-color: var(--terracotta-300); background: var(--crema-50); transform: translateY(-2px); }
.acc-ico-wrap {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--terracotta-100); border: 1px solid transparent;
  margin-bottom: 14px;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.acc:hover .acc-ico-wrap { background: var(--terracotta); border-color: var(--terracotta); }
.acc-ico { width: 19px; height: 19px; color: var(--terracotta); transition: color var(--dur) var(--ease-standard); }
.acc:hover .acc-ico { color: var(--crema-50); }
.acc-label { font-size: 14px; font-weight: 600; color: var(--fg1); }

/* ── Accesos · índice editorial (reemplaza la grilla de cards genérica) ── */
.idx { list-style: none; margin: 0; padding: 0; }
.idx li + li { border-top: 1px solid var(--border-subtle); }
.idx-row {
  position: relative;
  display: flex; align-items: center; gap: 15px;
  padding: 14px 8px 14px 14px;
  text-decoration: none;
  border-radius: 0 10px 10px 0;
  transition: background var(--dur) var(--ease-standard);
}
.idx-row::before {
  content: ''; position: absolute; left: 0; top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px; height: 62%; border-radius: 0 3px 3px 0;
  background: var(--terracotta);
  transition: transform var(--dur) var(--ease-standard);
}
.idx-row:hover { background: var(--crema-50); }
.idx-row:hover::before { transform: translateY(-50%) scaleY(1); }
.idx-row:focus-visible { outline: 2px solid var(--terracotta); outline-offset: -2px; }
.idx-n {
  font-family: var(--font-serif); font-style: italic;
  font-size: 16px; color: var(--fg3);
  min-width: 22px; text-align: center; flex-shrink: 0;
  transition: color var(--dur) var(--ease-standard);
}
.idx-row:hover .idx-n { color: var(--terracotta); }
.idx-ico { width: 18px; height: 18px; color: var(--fg2); flex-shrink: 0; transition: color var(--dur) var(--ease-standard); }
.idx-row:hover .idx-ico { color: var(--terracotta); }
.idx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.idx-label { font-size: 14.5px; font-weight: 600; color: var(--fg1); }
.idx-sub { font-size: 12px; color: var(--fg3); }
.idx-arrow {
  width: 16px; height: 16px; color: var(--terracotta); flex-shrink: 0;
  opacity: 0; transform: translateX(-6px);
  transition: opacity var(--dur) var(--ease-standard), transform var(--dur) var(--ease-standard);
}
.idx-row:hover .idx-arrow { opacity: 1; transform: translateX(0); }
@media (prefers-reduced-motion: reduce) {
  .idx-row::before, .idx-arrow { transition: none; }
}
.acc-sub { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.acc-arrow { position: absolute; top: 14px; right: 14px; width: 14px; height: 14px; color: var(--fg3); opacity: 0; transition: opacity var(--dur) var(--ease-standard); }
.acc:hover .acc-arrow { opacity: 1; }

/* Estados */
.state {
  background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 16px;
  padding: 28px; text-align: center; font-size: 14px; color: var(--fg2);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.sk { display: block; border-radius: 8px; background: var(--crema-200); animation: sk 1.4s ease infinite; }
.sk-l { width: 50%; height: 11px; }
.sk-n { width: 70%; height: 48px; margin-top: 6px; }
.sk-f { width: 40%; height: 12px; }
@keyframes sk { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
</style>
