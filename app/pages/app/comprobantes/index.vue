<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { Sale } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Comprobantes — GastronomIA' })

const { data: sales } = useSales()

const query = ref('')
const filter = ref<'all' | 'boleta' | 'factura' | 'void'>('all')

const isDesktop = useMediaQuery('(min-width: 1024px)')
const selectedId = ref<string | null>(null)

const METHOD_META: Record<Sale['method'], { label: string, icon: string }> = {
  cash: { label: 'Efectivo', icon: 'i-lucide-banknote' },
  card: { label: 'Tarjeta', icon: 'i-lucide-credit-card' },
  yape: { label: 'Yape', icon: 'i-lucide-smartphone' },
  plin: { label: 'Plin', icon: 'i-lucide-smartphone' },
}

const all = computed(() => sales.value ?? [])

const counts = computed(() => ({
  boletas: all.value.filter(s => s.docType === 'boleta').length,
  facturas: all.value.filter(s => s.docType === 'factura').length,
  void: all.value.filter(s => s.status === 'void').length,
}))

const issuedTotal = computed(() =>
  all.value.filter(s => s.status === 'issued').reduce((sum, s) => sum + s.total, 0),
)

// Reparto por método de pago (solo emitidos), de mayor a menor monto.
const byMethod = computed(() => {
  const acc = new Map<Sale['method'], number>()
  for (const s of all.value) {
    if (s.status !== 'issued') continue
    acc.set(s.method, (acc.get(s.method) ?? 0) + s.total)
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1])
})

const sparkPoints = computed(() => {
  // distribución horaria del día con los totales reales
  const buckets = [0, 0, 0, 0, 0, 0, 0]
  for (const s of all.value) {
    if (s.status !== 'issued') continue
    const hour = new Date(s.date).getHours()
    const idx = Math.min(6, Math.max(0, Math.floor((hour - 10) / 1.5)))
    const bucket = buckets[idx]
    if (bucket !== undefined) buckets[idx] = bucket + s.total
  }
  return buckets
})

const sparkPath = computed(() => {
  const points = sparkPoints.value
  const max = Math.max(...points, 1)
  const w = 92
  const h = 44
  const pad = 2
  const step = (w - pad * 2) / (points.length - 1)
  return points
    .map((p, i) => {
      const x = pad + i * step
      const y = h - pad - ((p / max) * (h - pad * 2))
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
})

const filtered = computed(() =>
  all.value.filter((s) => {
    if (filter.value === 'boleta' && s.docType !== 'boleta') return false
    if (filter.value === 'factura' && s.docType !== 'factura') return false
    if (filter.value === 'void' && s.status !== 'void') return false
    const q = query.value.trim().toLowerCase()
    if (!q) return true
    return `${s.serie}-${s.number}`.toLowerCase().includes(q)
      || (s.customer ?? '').toLowerCase().includes(q)
      || (s.tableLabel ?? '').toLowerCase().includes(q)
  }),
)

const selected = computed(() => filtered.value.find(s => s.id === selectedId.value) ?? null)

// Desktop → selecciona y muestra el detalle en el panel lateral.
// Mobile/tablet → navega a la vista de detalle completa.
function onRowActivate(s: Sale): void {
  if (isDesktop.value) {
    selectedId.value = selectedId.value === s.id ? null : s.id
    return
  }
  void navigateTo(`/app/comprobantes/${s.id}`)
}
</script>

<template>
  <div class="inv-screen">
    <UiScreenHeader title="Comprobantes" subtitle="Boletas y facturas emitidas" back="/app/menu" />

    <!-- Toolbar full-bleed: buscador acotado + filtros -->
    <div class="scr-toolbar">
      <label class="inv-search scr-toolbar-search">
        <UIcon name="i-lucide-search" />
        <input
          v-model="query"
          type="search"
          placeholder="Buscar por número, cliente o mesa…"
          aria-label="Buscar comprobantes"
        >
      </label>

      <div class="inv-chips scr-toolbar-right" role="tablist" aria-label="Filtros de comprobantes">
        <button class="inv-chip" :class="{ active: filter === 'all' }" role="tab" :aria-selected="filter === 'all'" @click="filter = 'all'">
          Todos <span class="count">({{ all.length }})</span>
        </button>
        <button class="inv-chip" :class="{ active: filter === 'boleta' }" role="tab" :aria-selected="filter === 'boleta'" @click="filter = 'boleta'">
          Boletas <span class="count">({{ counts.boletas }})</span>
        </button>
        <button class="inv-chip" :class="{ active: filter === 'factura' }" role="tab" :aria-selected="filter === 'factura'" @click="filter = 'factura'">
          Facturas <span class="count">({{ counts.facturas }})</span>
        </button>
        <button v-if="counts.void > 0" class="inv-chip warn" :class="{ active: filter === 'void' }" role="tab" :aria-selected="filter === 'void'" @click="filter = 'void'">
          Anuladas <span class="count">({{ counts.void }})</span>
        </button>
      </div>
    </div>

    <div class="scr-body">
      <!-- Main: grilla densa multi-columna -->
      <div class="scr-main">
        <div v-if="filtered.length" class="inv-grid">
          <button
            v-for="s in filtered"
            :key="s.id"
            class="inv-card"
            :class="{ void: s.status === 'void', selected: selectedId === s.id }"
            :aria-label="`${s.serie}-${s.number}, ${formatPEN(s.total)}`"
            :aria-pressed="isDesktop ? selectedId === s.id : undefined"
            @click="onRowActivate(s)"
          >
            <span class="inv-card-ico" :class="s.docType" aria-hidden="true">
              <UIcon :name="s.docType === 'boleta' ? 'i-lucide-receipt' : 'i-lucide-file-text'" />
            </span>
            <span class="inv-card-body">
              <span class="inv-card-id">
                {{ s.serie }}-{{ s.number }}
                <span v-if="s.status === 'void'" class="void-tag">Anulada</span>
              </span>
              <span class="inv-card-meta">
                {{ s.customer ?? s.tableLabel ?? 'Venta directa' }} · {{ formatTime(s.date) }}
              </span>
            </span>
            <span class="inv-card-right">
              <span class="inv-card-total">{{ formatPEN(s.total) }}</span>
              <span class="inv-card-method">
                <UIcon :name="METHOD_META[s.method].icon" /> {{ METHOD_META[s.method].label }}
              </span>
            </span>
          </button>
        </div>

        <UiEmptyState
          v-else
          icon="i-lucide-receipt"
          title="Sin comprobantes"
          subtitle="Los cobros del POS aparecerán aquí."
        >
          <UButton to="/app/pos" icon="i-lucide-utensils" variant="outline" color="neutral">Ir a mesas</UButton>
        </UiEmptyState>
      </div>

      <!-- Aside: resumen del día (siempre) + detalle del seleccionado (desktop) -->
      <aside class="scr-aside" aria-label="Resumen y detalle de comprobantes">
        <!-- Resumen del día -->
        <section class="scr-panel" aria-label="Resumen del día">
          <header class="scr-panel-head">
            <span class="scr-eyebrow">Hoy</span>
            <h2 class="scr-panel-title">{{ formatPEN(issuedTotal) }}</h2>
          </header>
          <div class="inv-sum-row">
            <span class="inv-sum-sub">{{ all.length }} comprobantes emitidos</span>
            <svg class="inv-spark" viewBox="0 0 92 44" aria-hidden="true">
              <path :d="`${sparkPath} L 90 42 L 2 42 Z`" fill="rgba(201,106,67,0.15)" />
              <path :d="sparkPath" fill="none" stroke="var(--terracotta)" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <dl v-if="byMethod.length" class="scr-stats">
            <div v-for="[method, amount] in byMethod" :key="method" class="scr-stat">
              <dt>
                <UIcon :name="METHOD_META[method].icon" class="inv-method-ico" />
                {{ METHOD_META[method].label }}
              </dt>
              <dd>{{ formatPEN(amount) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Detalle del comprobante seleccionado (solo desktop) -->
        <section v-if="isDesktop && selected" class="inv-detail" aria-label="Detalle del comprobante">
          <header class="inv-detail-head">
            <span class="inv-card-ico" :class="selected.docType" aria-hidden="true">
              <UIcon :name="selected.docType === 'boleta' ? 'i-lucide-receipt' : 'i-lucide-file-text'" />
            </span>
            <span class="inv-detail-id">
              <span class="inv-detail-num">{{ selected.serie }}-{{ selected.number }}</span>
              <span class="inv-detail-type">
                {{ selected.docType === 'boleta' ? 'Boleta de venta' : 'Factura' }}
                <span v-if="selected.status === 'void'" class="void-tag">Anulada</span>
              </span>
            </span>
            <button class="inv-detail-close" aria-label="Cerrar detalle" @click="selectedId = null">
              <UIcon name="i-lucide-x" />
            </button>
          </header>

          <dl class="inv-detail-info">
            <div class="row"><dt>Fecha</dt><dd>{{ formatShortDate(selected.date) }} · {{ formatTime(selected.date) }}</dd></div>
            <div v-if="selected.tableLabel" class="row"><dt>Mesa</dt><dd>{{ selected.tableLabel }}</dd></div>
            <div v-if="selected.customer" class="row"><dt>Cliente</dt><dd>{{ selected.customer }}</dd></div>
            <div v-if="selected.customerDoc" class="row"><dt>{{ selected.docType === 'boleta' ? 'DNI' : 'RUC' }}</dt><dd>{{ selected.customerDoc }}</dd></div>
            <div class="row">
              <dt>Pago</dt>
              <dd class="inv-detail-pay"><UIcon :name="METHOD_META[selected.method].icon" /> {{ METHOD_META[selected.method].label }}</dd>
            </div>
          </dl>

          <ul class="inv-detail-items">
            <li v-for="(item, i) in selected.items" :key="i">
              <span class="qty">{{ item.qty }}×</span>
              <span class="name">{{ item.name }}</span>
              <span class="amt">{{ formatPEN(item.total) }}</span>
            </li>
          </ul>

          <dl class="inv-detail-totals">
            <div class="row"><dt>Subtotal</dt><dd>{{ formatPEN(selected.subtotal) }}</dd></div>
            <div class="row"><dt>IGV (18 %)</dt><dd>{{ formatPEN(selected.igv) }}</dd></div>
            <div class="row grand"><dt>Total</dt><dd>{{ formatPEN(selected.total) }}</dd></div>
          </dl>

          <NuxtLink :to="`/app/comprobantes/${selected.id}`" class="inv-detail-link">
            <UIcon name="i-lucide-external-link" /> Ver comprobante completo
          </NuxtLink>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.inv-screen {
  padding-bottom: 24px;
}

/* ===== Buscador (hereda ancho acotado de .scr-toolbar-search) ===== */
.inv-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--crema-100);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 11px;
  height: 36px;
  box-sizing: border-box;
}
.inv-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.inv-search input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.inv-search input::placeholder { color: var(--fg3); }
.inv-search .iconify { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

/* ===== Chips de filtro ===== */
.inv-chips {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.inv-chips::-webkit-scrollbar { display: none; }
.inv-chip {
  font: inherit; font-size: 12.5px; font-weight: 500;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.inv-chip:hover { background: var(--crema-100); color: var(--fg1); }
.inv-chip.active { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.inv-chip.warn { border-color: var(--danger); color: var(--danger); }
.inv-chip.warn:hover { background: var(--danger-bg); }
.inv-chip.warn.active { background: var(--danger); color: var(--crema-100); }
.inv-chip .count { opacity: 0.7; font-variant-numeric: tabular-nums; }

/* ===== Grilla densa de comprobantes (full-width, multi-columna) ===== */
.inv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}
.inv-card {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color var(--dur) var(--ease-standard), box-shadow var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.inv-card:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }
.inv-card.selected { border-color: var(--terracotta); box-shadow: 0 0 0 2px rgba(201, 106, 67, 0.2); }
.inv-card.void { opacity: 0.55; }

.inv-card-ico {
  width: 36px; height: 36px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.inv-card-ico.boleta { background: var(--crema-200); color: var(--terracotta-700); }
.inv-card-ico.factura { background: var(--info-bg); color: var(--info); }
.inv-card-ico .iconify { width: 16px; height: 16px; }

.inv-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.inv-card-id {
  font-family: var(--font-mono);
  font-size: 13px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: center; gap: 6px;
}
.void-tag {
  font-family: var(--font-sans);
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--danger-bg); color: var(--danger);
  padding: 2px 6px; border-radius: 999px;
}
.inv-card-meta {
  font-size: 11.5px; color: var(--fg3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.inv-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.inv-card-total { font-size: 13.5px; font-weight: 600; color: var(--fg1); font-variant-numeric: tabular-nums; }
.inv-card-method {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; color: var(--fg3);
}
.inv-card-method .iconify { width: 11px; height: 11px; }

/* ===== Resumen del día (dentro del .scr-panel del aside) ===== */
.inv-sum-row {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;
  margin-top: -6px; margin-bottom: 12px;
}
.inv-sum-sub { font-size: 12px; color: var(--fg3); }
.inv-spark { width: 92px; height: 44px; flex-shrink: 0; }
.inv-method-ico { width: 13px; height: 13px; color: var(--fg3); margin-right: 7px; vertical-align: -2px; }
.scr-stat dd { font-size: 15px; }

/* ===== Panel de detalle ===== */
.inv-detail {
  margin-top: 14px;
  padding: 16px;
  border-radius: 16px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
}
.inv-detail-head {
  display: flex; align-items: center; gap: 11px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.inv-detail-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.inv-detail-num { font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: var(--fg1); }
.inv-detail-type {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg3);
  display: inline-flex; align-items: center; gap: 6px;
}
.inv-detail-close {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer; color: var(--fg3);
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.inv-detail-close:hover { background: var(--crema-200); color: var(--fg1); }
.inv-detail-close .iconify { width: 15px; height: 15px; }

.inv-detail-info { margin: 12px 0 0; display: flex; flex-direction: column; gap: 0; }
.inv-detail-info .row, .inv-detail-totals .row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 6px 0;
  font-size: 12.5px;
}
.inv-detail-info dt { color: var(--fg3); }
.inv-detail-info dd { margin: 0; color: var(--fg1); font-weight: 600; text-align: right; }
.inv-detail-pay { display: inline-flex; align-items: center; gap: 5px; }
.inv-detail-pay .iconify { width: 13px; height: 13px; color: var(--fg3); }

.inv-detail-items {
  list-style: none; margin: 12px 0; padding: 12px 0;
  border-top: 1px dashed var(--border);
  border-bottom: 1px dashed var(--border);
  display: flex; flex-direction: column; gap: 7px;
}
.inv-detail-items li { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
.inv-detail-items .qty { font-family: var(--font-mono); color: var(--fg3); flex-shrink: 0; min-width: 24px; }
.inv-detail-items .name { flex: 1; color: var(--fg1); font-weight: 500; }
.inv-detail-items .amt { font-family: var(--font-mono); color: var(--fg1); font-weight: 600; font-variant-numeric: tabular-nums; }

.inv-detail-totals { margin: 0; }
.inv-detail-totals dt { color: var(--fg2); }
.inv-detail-totals dd { margin: 0; color: var(--fg2); font-variant-numeric: tabular-nums; }
.inv-detail-totals .row.grand { padding-top: 8px; }
.inv-detail-totals .row.grand dt { font-size: 14px; font-weight: 700; color: var(--fg1); }
.inv-detail-totals .row.grand dd { font-size: 16px; font-weight: 700; color: var(--fg1); }

.inv-detail-link {
  margin-top: 14px;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; box-sizing: border-box;
  background: var(--fg1); color: var(--bg);
  font-size: 13px; font-weight: 600;
  padding: 10px 16px;
  border-radius: 10px;
  text-decoration: none;
  transition: opacity var(--dur) var(--ease-standard);
}
.inv-detail-link:hover { opacity: 0.85; }
.inv-detail-link .iconify { width: 14px; height: 14px; }

/* En <640 la toolbar apila: buscador full-width arriba, chips con scroll abajo.
   Scoped → solo afecta a esta instancia de .scr-toolbar, no la clase global. */
@media (max-width: 639px) {
  .scr-toolbar { flex-wrap: wrap; }
  .inv-chips.scr-toolbar-right { margin-left: 0; width: 100%; }
}
</style>
