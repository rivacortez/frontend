<script setup lang="ts">
import { useAdminDashboard, useManagerDashboard, useCashierDashboard } from '~/composables/use-reports'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Inicio — GastronomIA' })

const { user } = useUserSession()
const { data: unread } = useUnreadCount()
const unreadCount = computed(() => unread.value ?? 0)

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
    <!-- Header -->
    <header class="dash-hdr">
      <div class="dash-id">
        <p class="eyebrow">
          {{ dateLabel }}
          <span class="sep" aria-hidden="true">·</span>
          <span class="open"><span class="dot" aria-hidden="true" />Abierto</span>
        </p>
        <h1 class="dash-greet display">Hola, {{ displayName }}</h1>
      </div>
      <div class="dash-actions">
        <NuxtLink to="/app/notificaciones" class="icon-btn" :aria-label="`Notificaciones, ${unreadCount} sin leer`">
          <UIcon name="i-lucide-bell" />
          <span v-if="unreadCount > 0" class="badge" aria-hidden="true">{{ unreadCount }}</span>
        </NuxtLink>
        <NuxtLink to="/app/ajustes" class="icon-btn" aria-label="Ajustes">
          <UIcon name="i-lucide-settings" />
        </NuxtLink>
      </div>
    </header>

    <!-- KPIs -->
    <section aria-label="Indicadores de hoy">
      <div class="row-head"><span class="eyebrow">Resumen de hoy</span></div>

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
          <p class="eyebrow">{{ revenueLabel }}</p>
          <p class="stat kpi-num"><span class="cur">S/</span>{{ revenueToday.toLocaleString('es-PE') }}</p>
          <p class="kpi-foot">{{ ordersToday }} {{ canManage ? 'pedido' : 'ticket' }}{{ ordersToday === 1 ? '' : 's' }} hoy</p>
        </article>

        <!-- Mesas (owner/manager) -->
        <NuxtLink v-if="canManage" to="/app/pos" class="kpi kpi-link">
          <p class="eyebrow">Mesas activas</p>
          <p class="stat kpi-num">{{ occupancy.active }}<span class="dim">/{{ occupancy.total }}</span></p>
          <p class="kpi-foot">{{ occupancy.pct }}% de ocupación</p>
        </NuxtLink>

        <!-- Margen (owner) / Stock (manager) -->
        <NuxtLink v-if="isOwner" to="/app/reportes" class="kpi kpi-link">
          <p class="eyebrow">Margen bruto</p>
          <p class="stat kpi-num accent">{{ grossMarginPct.toFixed(0) }}<span class="dim">%</span></p>
          <p class="kpi-foot">{{ lowStockCount }} insumo{{ lowStockCount === 1 ? '' : 's' }} con stock bajo</p>
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

    <!-- Cuerpo: top platos + accesos -->
    <section class="body">
      <!-- Top platos (real) -->
      <div class="panel">
        <div class="panel-head">
          <span class="eyebrow">Top platos de hoy</span>
          <NuxtLink to="/app/reportes" class="link">Ver reportes</NuxtLink>
        </div>
        <ul v-if="topDishes.length" class="dish-list">
          <li v-for="(d, i) in topDishes.slice(0, 6)" :key="d.name" class="dish">
            <span class="dish-pos">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="dish-name">{{ d.name }}</span>
            <span class="dish-rev stat-sm">{{ formatPEN(d.revenue) }}</span>
            <span class="dish-qty">{{ d.qty }} und</span>
          </li>
        </ul>
        <div v-else class="empty">
          <p class="empty-t">Sin ventas registradas todavía</p>
          <p class="empty-s">Cuando cobres tu primer pedido, los platos más vendidos aparecen acá.</p>
        </div>
      </div>

      <!-- Accesos -->
      <div class="panel">
        <div class="panel-head"><span class="eyebrow">Accesos</span></div>
        <div class="acc-grid">
          <NuxtLink v-for="s in shortcuts" :key="s.label" :to="s.to" class="acc">
            <UIcon :name="s.icon" class="acc-ico" />
            <span class="acc-label">{{ s.label }}</span>
            <span class="acc-sub">{{ s.sub }}</span>
            <UIcon name="i-lucide-arrow-up-right" class="acc-arrow" />
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: clamp(20px, 4vw, 44px) clamp(20px, 4vw, 40px) 48px;
  display: flex;
  flex-direction: column;
  gap: clamp(28px, 4vh, 44px);
}

/* Header */
.dash-hdr { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.dash-greet { font-size: clamp(30px, 4vw, 46px); margin: 6px 0 0; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; }
.eyebrow .sep { opacity: 0.5; }
.open { display: inline-flex; align-items: center; gap: 6px; color: var(--oliva-700); font-weight: 600; }
.open .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--oliva); }
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
  padding: clamp(18px, 2vw, 26px);
  display: flex; flex-direction: column; gap: 10px;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease-standard);
}
.kpi-link:hover { border-color: var(--border-strong); }
.kpi-num {
  font-size: clamp(40px, 5vw, 60px);
  color: var(--fg1);
}
.kpi-num .cur { font-size: 0.42em; font-weight: 600; color: var(--fg3); vertical-align: 0.5em; margin-right: 2px; letter-spacing: 0; }
.kpi-num .dim { color: var(--fg3); }
.kpi-num.accent { color: var(--terracotta-700); }
.kpi-foot { font-size: 13px; color: var(--fg3); }

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
  padding: clamp(18px, 2vw, 26px);
}
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.link { font-size: 13px; font-weight: 600; color: var(--terracotta-700); }

/* Top platos */
.dish-list { list-style: none; padding: 0; margin: 0; }
.dish {
  display: grid; grid-template-columns: auto 1fr auto auto; align-items: baseline; gap: 14px;
  padding: 13px 0;
}
.dish + .dish { border-top: 1px solid var(--border-subtle); }
.dish-pos { font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; color: var(--fg3); }
.dish-name { font-size: 14.5px; font-weight: 500; color: var(--fg1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-sm { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dish-rev { font-size: 14.5px; color: var(--fg1); }
.dish-qty { font-size: 12px; color: var(--fg3); font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; }

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
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.acc:hover { border-color: var(--border-strong); background: var(--crema-50); }
.acc-ico { width: 20px; height: 20px; color: var(--terracotta-700); margin-bottom: 14px; }
.acc-label { font-size: 14px; font-weight: 600; color: var(--fg1); }
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
