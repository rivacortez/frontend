<script setup lang="ts">
import { useAdminDashboard, useManagerDashboard, useCashierDashboard } from '~/composables/use-reports'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Inicio — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()
// Badge de la campana: contador AUTORITATIVO del backend (cuenta todas las no leídas, E10).
const { data: unread } = useUnreadCount()
const unreadCount = computed(() => unread.value ?? 0)

const firstName = computed(() => user.value?.name.split(' ')[0] ?? '')

const dateLabel = computed(() => {
  const label = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Lima',
  }).format(new Date())
  return label.charAt(0).toUpperCase() + label.slice(1)
})

/* ===================== KPIs reales · E07 dashboards =====================
   Cableado al backend vía los composables de reportes (BFF anti-corruption).
   Gating por rol idéntico al hub /app/reportes: owner → dashboard ejecutivo
   (admin), manager → operativo (manager), staff → caja del día (cajero, que
   es `read Sale`, NO 403). La moneda llega como string PEN → se formatea con
   formatPEN(num()). El owner consulta TAMBIÉN el dashboard del gerente para los
   widgets operativos (mesas/cuentas) que el ejecutivo no trae. */
const isOwner = computed(() => user.value?.role === 'owner')
const isManager = computed(() => user.value?.role === 'manager')
const canManage = computed(() => isOwner.value || isManager.value)

const num = (s: string | number | undefined | null): number => Number(s ?? 0)

// owner → admin; manager (no owner) → manager; staff → cashier.
const admin = useAdminDashboard(() => isOwner.value)
// Operativo (mesas/cocina/cuentas): lo ven owner y manager.
const manager = useManagerDashboard(() => canManage.value)
// Caja del día: operativo → lo ve staff (y serviría a cualquiera, pero solo lo pedimos para staff).
const cashier = useCashierDashboard(() => !canManage.value)
// Total de mesas del salón (para el % de ocupación). Read Table → todos lo ven.
const tables = useTables()

// El dashboard "principal" según rol (para loading/error/empty del bloque de KPIs).
const primary = computed(() => (isOwner.value ? admin : canManage.value ? manager : cashier))
const kpisLoading = computed(() => primary.value.isLoading.value && !primary.value.data.value)
const kpisError = computed(() => !!primary.value.error.value)

/* ---- KPI 1 · Venta/ingresos de hoy (todos los roles) ---- */
const revenueToday = computed<number | null>(() => {
  if (isOwner.value) return admin.data.value ? num(admin.data.value.revenueToday) : null
  if (canManage.value) return manager.data.value ? num(manager.data.value.revenueToday) : null
  return cashier.data.value ? num(cashier.data.value.totalCollected) : null
})
const revenueLabel = computed(() => (canManage.value ? 'Venta hoy' : 'Caja de hoy'))
// Subtítulo del card de ingresos: nº de pedidos/tickets, sin inventar el "vs ayer".
const revenueSub = computed(() => {
  if (isOwner.value && admin.data.value) {
    const n = admin.data.value.ordersToday
    return `${n} pedido${n === 1 ? '' : 's'} hoy`
  }
  if (canManage.value && manager.data.value) {
    const n = manager.data.value.salesToday
    return `${n} ticket${n === 1 ? '' : 's'} hoy`
  }
  if (cashier.data.value) {
    const n = cashier.data.value.salesCount
    return `${n} ticket${n === 1 ? '' : 's'} hoy`
  }
  return ''
})

/* ---- Sparkline · serie de ventas de 7 días (solo admin/owner; manager/staff no la traen) ---- */
const hasSpark = computed(() => isOwner.value && (admin.data.value?.salesByDay7d?.length ?? 0) > 0)
const sparkBars = computed<number[]>(() => {
  const series = admin.data.value?.salesByDay7d ?? []
  if (!series.length) return []
  const max = Math.max(1, ...series.map(d => num(d.revenue)))
  return series.map(d => num(d.revenue) / max)
})

/* ---- KPI 2 · Mesas activas / ocupación (operativo: owner+manager) ---- */
const totalTables = computed(() => tables.data.value?.length ?? 0)
const occupancy = computed(() => {
  const active = manager.data.value?.openTables ?? 0
  const total = totalTables.value
  const pct = total > 0 ? Math.round((active / total) * 100) : 0
  return { active, total, pct }
})
const hasOccupancy = computed(() => canManage.value)

const ringSize = 36
const ringRadius = (ringSize - 6) / 2
const ringCircumference = 2 * Math.PI * ringRadius
const ringOffset = computed(() => ringCircumference * (1 - occupancy.value.pct / 100))

/* ---- KPI 3 · Margen bruto (owner) / Stock bajo (resto operativo) ---- */
const grossMarginPct = computed<number | null>(() =>
  isOwner.value && admin.data.value ? num(admin.data.value.grossMarginPct) : null)
const lowStockCount = computed<number | null>(() => {
  if (isOwner.value) return admin.data.value ? admin.data.value.lowStockCount : null
  if (canManage.value) return manager.data.value ? manager.data.value.lowStockCount : null
  return null
})

/* ---- KPI 3 (staff) · Ticket promedio ---- */
const avgTicket = computed<number | null>(() =>
  !canManage.value && cashier.data.value ? num(cashier.data.value.avgTicket) : null)

/* ---- Top platos de hoy (admin: con contribución; manager: sin) ---- */
interface TopDish { name: string, qty: number, revenue: number }
const topDishes = computed<TopDish[]>(() => {
  if (isOwner.value) {
    return (admin.data.value?.topDishes ?? []).map(d => ({ name: d.name, qty: d.qty, revenue: num(d.revenue) }))
  }
  if (canManage.value) {
    return (manager.data.value?.topDishesToday ?? []).map(d => ({ name: d.name, qty: d.qty, revenue: num(d.revenue) }))
  }
  return []
})

interface Shortcut {
  icon: string
  label: string
  sub: string
  to: string
  featured?: boolean
  soon?: boolean
}

const shortcuts: Shortcut[] = [
  { icon: 'i-lucide-utensils', label: 'Recetas', sub: 'Costos y márgenes', to: '/app/recetas' },
  { icon: 'i-lucide-scan-line', label: 'Escanear factura', sub: 'Magic Upload', to: '/app/datos/factura-ia', featured: true },
  { icon: 'i-lucide-shopping-cart', label: 'Compras', sub: 'Lista de compra', to: '/app/inventario/lista-compras' },
  { icon: 'i-lucide-bar-chart-3', label: 'Reportes', sub: 'KPIs y análisis', to: '/app/reportes' },
]

function notify(message: string): void {
  toast.add({ title: message, icon: 'i-lucide-sparkles' })
}
</script>

<template>
  <div class="home">
    <!-- ============ Header ============ -->
    <header class="hdr">
      <div class="hdr-left">
        <h1 class="hdr-greet">Hola, <em>{{ firstName }}</em></h1>
        <div class="hdr-meta">
          <span>{{ dateLabel }}</span>
          <span aria-hidden="true">·</span>
          <span class="hdr-status">
            <span class="dot-pulse" aria-hidden="true" />
            Abierto
          </span>
        </div>
      </div>
      <div class="hdr-actions">
        <NuxtLink to="/app/notificaciones" class="icon-btn" :aria-label="`Notificaciones, ${unreadCount} sin leer`">
          <UIcon name="i-lucide-bell" />
          <span v-if="unreadCount > 0" class="badge" aria-hidden="true">{{ unreadCount }}</span>
        </NuxtLink>
        <NuxtLink to="/app/menu" class="icon-btn" aria-label="Configuración">
          <UIcon name="i-lucide-settings" />
        </NuxtLink>
      </div>
    </header>

    <!-- ============ KPIs (E07 dashboards) ============ -->
    <section class="section" aria-label="Indicadores de hoy">
      <div class="section-eyebrow">Hoy</div>

      <!-- Error de carga (reintentar) -->
      <div v-if="kpisError" class="kpi-state">
        <UIcon name="i-lucide-cloud-off" class="kpi-state-ico" />
        <p>No se pudieron cargar los indicadores.</p>
        <button class="btn btn-ghost" @click="primary.refresh()">
          <UIcon name="i-lucide-rotate-cw" /> Reintentar
        </button>
      </div>

      <!-- Skeleton de primera carga -->
      <div v-else-if="kpisLoading" class="kpi-rail" role="list" aria-busy="true">
        <div v-for="i in 3" :key="i" class="kpi-card kpi-static kpi-skeleton" aria-hidden="true">
          <span class="sk sk-eyebrow" />
          <span class="sk sk-value" />
          <span class="sk sk-trend" />
        </div>
      </div>

      <div v-else class="kpi-rail" role="list">
        <!-- KPI 1 · Venta / Caja de hoy -->
        <div
          role="listitem"
          class="kpi-card accent kpi-static"
          :aria-label="`${revenueLabel}: ${formatPEN(revenueToday ?? 0)}`"
        >
          <div class="kpi-row-head">
            <div class="kpi-eyebrow">{{ revenueLabel }}</div>
            <UIcon name="i-lucide-trending-up" class="size-3.5 text-(--mostaza-100)" />
          </div>
          <div class="kpi-value">
            <span class="currency">S/</span>{{ (revenueToday ?? 0).toLocaleString('es-PE') }}
          </div>
          <!-- Sparkline real (solo owner, serie 7d del admin) -->
          <div v-if="hasSpark" class="kpi-mini" aria-hidden="true">
            <span
              v-for="(h, i) in sparkBars"
              :key="i"
              :class="{ on: i === sparkBars.length - 1 }"
              :style="{ height: `${Math.max(6, h * 100)}%`, alignSelf: 'flex-end' }"
            />
          </div>
          <div class="kpi-trend">
            <UIcon name="i-lucide-calendar-days" /> {{ revenueSub }}
          </div>
        </div>

        <!-- KPI 2 · Mesas activas / ocupación (owner + manager) -->
        <NuxtLink
          v-if="hasOccupancy"
          role="listitem"
          class="kpi-card"
          to="/app/pos"
          :aria-label="`Mesas activas: ${occupancy.active} de ${occupancy.total}, ${occupancy.pct} por ciento de ocupación`"
        >
          <div class="kpi-row-head">
            <div class="kpi-eyebrow">Mesas activas</div>
            <svg class="kpi-ring" :width="ringSize" :height="ringSize" :viewBox="`0 0 ${ringSize} ${ringSize}`">
              <circle :cx="ringSize / 2" :cy="ringSize / 2" :r="ringRadius" stroke="var(--crema-200)" stroke-width="4" fill="none" />
              <circle
                :cx="ringSize / 2" :cy="ringSize / 2" :r="ringRadius"
                stroke="var(--terracotta)" stroke-width="4" fill="none"
                :stroke-dasharray="ringCircumference" :stroke-dashoffset="ringOffset"
                stroke-linecap="round"
                :transform="`rotate(-90 ${ringSize / 2} ${ringSize / 2})`"
              />
            </svg>
          </div>
          <div class="kpi-value">{{ occupancy.active }}<span class="kpi-value-dim">/{{ occupancy.total }}</span></div>
          <div class="kpi-trend warm">
            <UIcon name="i-lucide-users" /> {{ occupancy.pct }} % ocupación
          </div>
          <div v-if="manager.data.value" class="kpi-meta">
            {{ manager.data.value.ordersOpen }} cuenta{{ manager.data.value.ordersOpen === 1 ? '' : 's' }} abierta{{ manager.data.value.ordersOpen === 1 ? '' : 's' }}
          </div>
        </NuxtLink>

        <!-- KPI 3a · Margen bruto (owner) -->
        <NuxtLink
          v-if="isOwner"
          role="listitem"
          class="kpi-card"
          to="/app/reportes"
          :aria-label="`Margen bruto: ${grossMarginPct ?? 0} por ciento`"
        >
          <div class="kpi-row-head">
            <div class="kpi-eyebrow">Margen bruto</div>
            <UIcon name="i-lucide-percent" class="size-3.5 text-(--terracotta)" />
          </div>
          <div class="kpi-value kpi-value-accent">{{ (grossMarginPct ?? 0).toFixed(0) }} %</div>
          <div class="kpi-trend accent">
            <UIcon name="i-lucide-bar-chart-3" /> Ingresos hoy
          </div>
          <div v-if="lowStockCount !== null && lowStockCount > 0" class="kpi-meta">
            {{ lowStockCount }} insumo{{ lowStockCount === 1 ? '' : 's' }} con stock bajo
          </div>
        </NuxtLink>

        <!-- KPI 3b · Stock bajo (manager) -->
        <NuxtLink
          v-else-if="isManager"
          role="listitem"
          class="kpi-card"
          to="/app/inventario"
          :aria-label="`Stock bajo: ${lowStockCount ?? 0} insumos`"
        >
          <div class="kpi-row-head">
            <div class="kpi-eyebrow">Stock bajo</div>
            <UIcon name="i-lucide-package" class="size-3.5 text-(--terracotta)" />
          </div>
          <div class="kpi-value" :class="{ 'kpi-value-accent': (lowStockCount ?? 0) > 0 }">{{ lowStockCount ?? 0 }}</div>
          <div class="kpi-trend" :class="(lowStockCount ?? 0) > 0 ? 'warm' : 'accent'">
            <UIcon :name="(lowStockCount ?? 0) > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-check'" />
            {{ (lowStockCount ?? 0) > 0 ? 'Revisar insumos' : 'Todo en orden' }}
          </div>
          <div v-if="manager.data.value" class="kpi-meta">{{ manager.data.value.itemsInKitchen }} ítems en cocina</div>
        </NuxtLink>

        <!-- KPI 3c · Ticket promedio (staff) -->
        <div
          v-else
          role="listitem"
          class="kpi-card kpi-static"
          :aria-label="`Ticket promedio: ${formatPEN(avgTicket ?? 0)}`"
        >
          <div class="kpi-row-head">
            <div class="kpi-eyebrow">Ticket promedio</div>
            <UIcon name="i-lucide-receipt" class="size-3.5 text-(--terracotta)" />
          </div>
          <div class="kpi-value kpi-value-accent">{{ formatPEN(avgTicket ?? 0) }}</div>
          <div v-if="cashier.data.value" class="kpi-trend accent">
            <UIcon name="i-lucide-x-circle" /> {{ cashier.data.value.voidCount }} anulación{{ cashier.data.value.voidCount === 1 ? '' : 'es' }}
          </div>
        </div>
      </div>

      <!-- Top platos de hoy (real: admin → contribución; manager → unidades) -->
      <div v-if="topDishes.length" class="topdishes">
        <div class="topdishes-head">
          <span class="topdishes-title">Top platos de hoy</span>
          <NuxtLink to="/app/reportes" class="topdishes-link">Ver reportes</NuxtLink>
        </div>
        <NuxtLink
          v-for="(d, i) in topDishes.slice(0, 3)"
          :key="d.name"
          to="/app/reportes"
          class="topdish"
          :aria-label="`${i + 1}. ${d.name}: ${formatPEN(d.revenue)}, ${d.qty} unidades`"
        >
          <span class="topdish-pos" :class="{ first: i === 0 }">{{ i + 1 }}</span>
          <span class="topdish-name">{{ d.name }}</span>
          <span class="topdish-right">
            <span class="topdish-rev">{{ formatPEN(d.revenue) }}</span>
            <span class="topdish-sub">{{ d.qty }} und</span>
          </span>
        </NuxtLink>
      </div>
    </section>

    <!-- ============ Alertas IA ============ -->
    <section class="section" aria-label="Alertas GastronomIA">
      <div class="section-head">
        <div class="ico" aria-hidden="true"><UIcon name="i-lucide-bot" /></div>
        <div>
          <div class="section-title">
            Alertas GastronomIA
            <span class="demo-tag" title="Contenido de demostración">Demo</span>
          </div>
          <div class="section-sub">Motor de alertas IA · próximamente (E08)</div>
        </div>
      </div>

      <div class="alerts-wrap">
        <article class="alert critical">
          <div class="alert-ico" aria-hidden="true"><UIcon name="i-lucide-alert-triangle" /></div>
          <div class="alert-body">
            <span class="alert-tagline">
              <UIcon name="i-lucide-alert-circle" class="size-3" /> Margen en riesgo
            </span>
            <h3 class="alert-title">Ceviche Clásico</h3>
            <p class="alert-text">
              <b>Limón Sutil</b> subió <span class="highlight">30 %</span> esta semana.
              El margen del plato bajó.
            </p>
            <div class="delta-chip" aria-label="Margen bajó de 26 por ciento a 18 por ciento">
              <span class="from">26 %</span>
              <UIcon name="i-lucide-arrow-right" />
              <span class="to">18 %</span>
            </div>
            <div class="alert-actions">
              <button class="btn btn-primary" @click="notify('Ajuste de precio — Sprint 2 (E04)')">
                <UIcon name="i-lucide-tag" /> Ajustar precio
              </button>
              <NuxtLink class="btn btn-ghost" to="/app/recetas/rec-ceviche-clasico">
                Ver detalles
              </NuxtLink>
            </div>
          </div>
        </article>

        <article class="alert warn">
          <div class="alert-ico" aria-hidden="true"><UIcon name="i-lucide-shopping-cart" /></div>
          <div class="alert-body">
            <span class="alert-tagline">
              <UIcon name="i-lucide-package" class="size-3" /> Stock crítico
            </span>
            <h3 class="alert-title">3 insumos por debajo del umbral</h3>
            <div class="stock-pills">
              <span class="stock-pill">Limón Sutil <span class="qty">2.5 kg</span></span>
              <span class="stock-pill">Aceite Oliva <span class="qty">2 L</span></span>
              <span class="stock-pill">Cilantro <span class="qty">200 g</span></span>
            </div>
            <div class="alert-actions">
              <NuxtLink class="btn btn-dark" to="/app/inventario/lista-compras">
                <UIcon name="i-lucide-list-checks" /> Ver lista de compra
              </NuxtLink>
            </div>
          </div>
        </article>

        <article class="alert opp">
          <div class="alert-ico" aria-hidden="true"><UIcon name="i-lucide-lightbulb" /></div>
          <div class="alert-body">
            <span class="alert-tagline">
              <UIcon name="i-lucide-trending-up" class="size-3" /> Recomendación IA
            </span>
            <h3 class="alert-title">Bebidas del día</h3>
            <p class="alert-text">
              Detecté <b>3 cocteles</b> con margen <b>≥ 65 %</b> y stock alto. Activarlos hoy
              puede sumar <span class="highlight">~ S/ 280</span>.
            </p>
            <div class="alert-actions">
              <button class="btn btn-primary" @click="notify('Promoción «Bebidas del día» activada')">
                <UIcon name="i-lucide-zap" /> Activar promoción
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- ============ Atajos ============ -->
    <section class="section" aria-label="Atajos rápidos">
      <div class="section-eyebrow">Atajos</div>
      <div class="short-grid">
        <NuxtLink
          v-for="item in shortcuts"
          :key="item.label"
          :to="item.to"
          class="short"
          :class="{ featured: item.featured }"
          :aria-label="`${item.label}. ${item.sub}`"
        >
          <span class="short-ico" aria-hidden="true"><UIcon :name="item.icon" /></span>
          <span v-if="item.soon" class="short-soon">Pronto</span>
          <span v-else class="short-arrow" aria-hidden="true"><UIcon name="i-lucide-arrow-up-right" /></span>
          <span class="short-label">{{ item.label }}</span>
          <span class="short-sub">{{ item.sub }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ============ Tip IA ============ -->
    <section class="section" aria-label="Acción sugerida por IA">
      <div class="section-eyebrow">Acción sugerida <span class="demo-tag">Demo</span></div>
      <div class="tip">
        <div class="tip-ico" aria-hidden="true"><UIcon name="i-lucide-lightbulb" /></div>
        <div class="tip-body">
          <span class="tip-eyebrow">Insight IA · merchandising · próximamente</span>
          Coloca un cartel en mesas destacando <b>«Bebidas del día»</b>. Detecté que mesas
          similares piden <b>40 % más cocteles</b> cuando hay promo visible.
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 760px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}
@media (min-width: 1024px) {
  .home { padding-top: 32px; }
}

/* ============ Header ============ */
.hdr {
  padding: 8px 20px 16px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.hdr-greet {
  font-size: 28px; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.1;
  color: var(--fg1); margin: 0;
}
.hdr-greet em {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  color: var(--terracotta-700);
}
.hdr-meta {
  display: flex; align-items: center; gap: 10px;
  margin-top: 6px;
  font-size: 13px; color: var(--fg2);
}
.hdr-status {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 500; color: var(--oliva-700);
}
.dot-pulse {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--oliva);
  position: relative; flex-shrink: 0;
}
.dot-pulse::after {
  content: ''; position: absolute; inset: -3px; border-radius: 50%;
  background: var(--oliva); opacity: 0.5;
  animation: pulse 1.8s var(--ease-standard) infinite;
}
@keyframes pulse {
  0% { transform: scale(0.6); opacity: 0.55; }
  70%, 100% { transform: scale(1.8); opacity: 0; }
}
.hdr-actions { display: flex; gap: 8px; flex-shrink: 0; padding-top: 4px; }
/* .icon-btn base viene del global components.css; aquí solo el badge del bell */
.icon-btn .badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px;
  background: var(--terracotta);
  color: var(--crema-100);
  font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--crema);
}

/* ============ Secciones ============ */
.section { margin-top: 8px; }
.section + .section { margin-top: 20px; }
.section-head {
  padding: 4px 20px 12px;
  display: flex; align-items: center; gap: 12px;
}
.section-head .ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--terracotta-100); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.section-head .ico .iconify { width: 18px; height: 18px; }
.section-title { font-size: 17px; font-weight: 600; line-height: 1.2; color: var(--fg1); }
.section-sub { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.section-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  padding: 4px 20px 10px;
}

/* ============ KPIs ============ */
.kpi-rail {
  display: flex; gap: 10px;
  padding: 0 20px 4px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
.kpi-rail::-webkit-scrollbar { display: none; }
@media (min-width: 640px) {
  .kpi-rail { display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible; }
}
.kpi-card {
  flex: 0 0 168px;
  scroll-snap-align: start;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
  min-height: 120px;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease-standard), transform var(--dur) var(--ease-standard);
}
.kpi-card:hover { border-color: var(--border); }
.kpi-card:active { transform: scale(0.98); }
/* KPI no navegable (métrica informativa, sin destino): sin cues de clickeable */
.kpi-card.kpi-static { cursor: default; }
.kpi-card.kpi-static:hover { border-color: var(--border-subtle); }
.kpi-card.kpi-static:active { transform: none; }
.kpi-card.accent {
  background: linear-gradient(140deg, var(--espresso) 0%, var(--espresso-800) 100%);
  color: var(--crema-100); border-color: transparent;
}
.kpi-row-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.kpi-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
}
.kpi-card.accent .kpi-eyebrow { color: rgba(243,237,228,0.6); }
.kpi-value {
  font-size: 26px; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.1;
  color: var(--fg1);
  margin-top: 2px;
}
.kpi-card.accent .kpi-value { color: var(--crema-100); }
.kpi-value .currency {
  font-size: 14px; font-weight: 500; color: var(--fg3);
  margin-right: 4px; vertical-align: 0.18em;
}
.kpi-card.accent .kpi-value .currency { color: rgba(243,237,228,0.55); }
.kpi-value-dim { color: var(--fg3); font-weight: 500; }
.kpi-value-accent { color: var(--terracotta-700); }
.kpi-trend {
  font-size: 12px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--oliva-700);
}
.kpi-trend.accent { color: var(--terracotta-700); }
.kpi-trend.warm { color: var(--mostaza-700); }
.kpi-card.accent .kpi-trend { color: var(--mostaza-100); }
.kpi-trend .iconify { width: 12px; height: 12px; }
.kpi-meta { font-size: 12px; color: var(--fg3); margin-top: auto; }
.kpi-card.accent .kpi-meta { color: rgba(243,237,228,0.55); }
.kpi-mini {
  display: flex; align-items: flex-end; gap: 2px; height: 18px;
  margin-top: -2px;
}
.kpi-mini span { flex: 1; background: rgba(243,237,228,0.25); border-radius: 1.5px; }
.kpi-mini span.on { background: var(--terracotta-300); }
.kpi-ring { flex-shrink: 0; }

/* ---- KPI: estados de carga / error ---- */
.kpi-state {
  margin: 0 20px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  text-align: center;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 24px 16px;
  font-size: 13px; color: var(--fg2);
}
.kpi-state-ico { width: 26px; height: 26px; color: var(--fg3); }
.kpi-state p { margin: 0; }
.kpi-skeleton { gap: 12px; pointer-events: none; }
.sk {
  display: block; border-radius: 6px;
  background: linear-gradient(90deg, var(--crema-200) 25%, var(--crema-100) 37%, var(--crema-200) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}
.sk-eyebrow { width: 60%; height: 11px; }
.sk-value { width: 75%; height: 26px; margin-top: 6px; }
.sk-trend { width: 50%; height: 12px; margin-top: auto; }
@keyframes sk-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }

/* ---- Top platos de hoy (debajo del rail de KPIs) ---- */
.topdishes {
  margin: 14px 20px 0;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 6px 14px;
}
.topdishes-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0 8px;
}
.topdishes-title { font-size: 13px; font-weight: 600; color: var(--fg2); }
.topdishes-link { font-size: 12px; font-weight: 600; color: var(--terracotta-700); }
.topdish {
  display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 12px;
  padding: 10px 0; text-decoration: none;
  transition: opacity var(--dur) var(--ease-standard);
}
.topdish + .topdish { border-top: 1px solid var(--border-subtle); }
.topdish:active { opacity: 0.6; }
.topdish-pos { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-size: 16px; color: var(--fg3); text-align: center; }
.topdish-pos.first { color: var(--terracotta-700); }
.topdish-name { font-size: 14px; font-weight: 600; color: var(--fg1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.topdish-right { text-align: right; display: flex; flex-direction: column; gap: 1px; }
.topdish-rev { font-size: 13.5px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }
.topdish-sub { font-size: 11px; color: var(--fg3); font-variant-numeric: tabular-nums; }

/* ---- Etiqueta "Demo" (widgets aún sin backend: alertas/insight IA = E08) ---- */
.demo-tag {
  display: inline-block; vertical-align: middle;
  margin-left: 6px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--mostaza-800); background: var(--mostaza-50);
  border: 1px solid var(--mostaza-100);
  padding: 1px 6px; border-radius: 999px;
}

/* ============ Alertas IA ============ */
.alerts-wrap {
  padding: 0 20px;
  display: flex; flex-direction: column; gap: 10px;
}
.alert {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  display: flex; gap: 12px;
  position: relative;
  overflow: hidden;
}
.alert::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px;
}
.alert.critical::before { background: var(--danger); }
.alert.warn::before { background: var(--mostaza); }
.alert.opp::before { background: var(--oliva); }
.alert-ico {
  width: 36px; height: 36px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.alert.critical .alert-ico { background: var(--danger-bg); color: var(--danger); }
.alert.warn .alert-ico { background: var(--warning-bg); color: var(--mostaza-700); }
.alert.opp .alert-ico { background: var(--success-bg); color: var(--oliva-700); }
.alert-ico .iconify { width: 18px; height: 18px; }
.alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.alert-tagline {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
}
.alert.critical .alert-tagline { color: var(--danger); }
.alert.warn .alert-tagline { color: var(--mostaza-700); }
.alert.opp .alert-tagline { color: var(--oliva-700); }
.alert-title { font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--fg1); margin: 0; }
.alert-text { font-size: 13px; line-height: 1.45; color: var(--fg2); margin: 2px 0 4px; }
.alert-text b { color: var(--fg1); font-weight: 600; }
.alert-text .highlight {
  background: linear-gradient(transparent 60%, var(--terracotta-100) 60%);
  padding: 0 2px;
  font-weight: 600;
  color: var(--fg1);
}
.alert-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.delta-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  background: var(--crema-200); color: var(--fg2);
  padding: 3px 8px; border-radius: 999px;
  margin-top: 6px;
  width: fit-content;
}
.delta-chip .from { text-decoration: line-through; opacity: 0.55; }
.delta-chip .to { color: var(--danger); font-weight: 700; }
.delta-chip .iconify { width: 11px; height: 11px; }
.stock-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.stock-pill {
  font-size: 11.5px; font-weight: 500;
  background: var(--crema-200); color: var(--fg2);
  padding: 4px 9px; border-radius: 999px;
  display: inline-flex; align-items: center; gap: 5px;
}
.stock-pill .qty { color: var(--fg3); font-family: var(--font-mono); font-size: 10.5px; }

/* Los botones .btn/.btn-primary/.btn-ghost/.btn-dark vienen del global
   components.css (superset con :disabled, .btn-danger, .btn-lg, .btn-block). */

/* ============ Atajos ============ */
.short-grid {
  padding: 0 20px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
@media (min-width: 640px) {
  .short-grid { grid-template-columns: repeat(4, 1fr); }
}
.short {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  display: flex; flex-direction: column;
  min-height: 116px;
  position: relative;
  text-align: left;
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard), transform 80ms;
}
.short:active { transform: scale(0.98); }
.short:hover { background: var(--crema-100); border-color: var(--border); }
.short-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: auto;
}
.short-ico .iconify { width: 18px; height: 18px; }
.short-label { margin-top: 14px; font-size: 14px; font-weight: 600; color: var(--fg1); }
.short-sub { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.short-arrow { position: absolute; top: 14px; right: 14px; color: var(--fg3); }
.short-arrow .iconify { width: 14px; height: 14px; }
.short-soon {
  position: absolute; top: 12px; right: 12px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--mostaza-800); background: var(--mostaza-50);
  border: 1px solid var(--mostaza-100);
  padding: 2px 7px; border-radius: 999px;
}
.short.featured {
  background: linear-gradient(150deg, var(--crema-50) 0%, var(--crema-200) 100%);
  border-color: var(--terracotta-100);
}
.short.featured .short-ico { background: var(--terracotta); color: var(--crema-100); }

/* ============ Tip ============ */
.tip {
  margin: 0 20px;
  background: var(--crema-100);
  border: 1px dashed var(--terracotta-300);
  border-radius: 14px;
  padding: 14px;
  display: flex; gap: 12px;
}
.tip-ico {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--mostaza-100); color: var(--mostaza-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.tip-ico .iconify { width: 16px; height: 16px; }
.tip-body { font-size: 13px; line-height: 1.5; color: var(--fg2); }
.tip-body b { color: var(--fg1); font-weight: 600; }
.tip-eyebrow {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--terracotta-700);
  display: block; margin-bottom: 3px;
}
</style>
