<script setup lang="ts">
import type { Sale } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Comprobantes — GastronomIA' })

const { data: sales } = useSales()

const query = ref('')
const filter = ref<'all' | 'boleta' | 'factura' | 'void'>('all')

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
</script>

<template>
  <div class="inv-screen">
    <UiScreenHeader title="Comprobantes" subtitle="Boletas y facturas emitidas" back="/app/menu" />

    <!-- Search -->
    <div class="inv-search-wrap">
      <label class="inv-search">
        <UIcon name="i-lucide-search" />
        <input v-model="query" type="search" placeholder="Buscar por número, cliente o mesa…" aria-label="Buscar comprobantes">
      </label>
    </div>

    <!-- Chips -->
    <div class="inv-chips" role="tablist" aria-label="Filtros de comprobantes">
      <button class="inv-chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todos</button>
      <button class="inv-chip" :class="{ active: filter === 'boleta' }" @click="filter = 'boleta'">
        Boletas <span class="count">({{ counts.boletas }})</span>
      </button>
      <button class="inv-chip" :class="{ active: filter === 'factura' }" @click="filter = 'factura'">
        Facturas <span class="count">({{ counts.facturas }})</span>
      </button>
      <button v-if="counts.void > 0" class="inv-chip warn" :class="{ active: filter === 'void' }" @click="filter = 'void'">
        Anuladas ({{ counts.void }})
      </button>
    </div>

    <!-- Resumen -->
    <section class="inv-summary" aria-label="Resumen del día">
      <div class="inv-sum-body">
        <div class="eyebrow">Hoy</div>
        <div class="val">{{ formatPEN(issuedTotal) }}</div>
        <div class="sub">{{ all.length }} comprobantes emitidos</div>
      </div>
      <svg class="inv-spark" viewBox="0 0 92 44" aria-hidden="true">
        <path :d="`${sparkPath} L 90 42 L 2 42 Z`" fill="rgba(201,106,67,0.15)" />
        <path :d="sparkPath" fill="none" stroke="var(--terracotta)" stroke-width="2" stroke-linecap="round" />
      </svg>
    </section>

    <!-- Lista -->
    <div v-if="filtered.length" class="inv-list">
      <NuxtLink
        v-for="s in filtered"
        :key="s.id"
        :to="`/app/comprobantes/${s.id}`"
        class="inv-row"
        :class="{ void: s.status === 'void' }"
        :aria-label="`${s.serie}-${s.number}, ${formatPEN(s.total)}`"
      >
        <span class="inv-row-ico" :class="s.docType" aria-hidden="true">
          <UIcon :name="s.docType === 'boleta' ? 'i-lucide-receipt' : 'i-lucide-file-text'" />
        </span>
        <span class="inv-row-body">
          <span class="inv-row-id">
            {{ s.serie }}-{{ s.number }}
            <span v-if="s.status === 'void'" class="void-tag">Anulada</span>
          </span>
          <span class="inv-row-meta">
            {{ s.customer ?? s.tableLabel ?? 'Venta directa' }} · {{ formatTime(s.date) }}
          </span>
        </span>
        <span class="inv-row-right">
          <span class="inv-row-total">{{ formatPEN(s.total) }}</span>
          <span class="inv-row-method">
            <UIcon :name="METHOD_META[s.method].icon" /> {{ METHOD_META[s.method].label }}
          </span>
        </span>
      </NuxtLink>
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
</template>

<style scoped>
.inv-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.inv-search-wrap { padding: 0 20px 12px; }
.inv-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 42px;
}
.inv-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.inv-search input {
  flex: 1; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.inv-search .iconify { width: 16px; height: 16px; color: var(--fg3); }

.inv-chips {
  display: flex; gap: 6px;
  padding: 0 20px 14px;
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
}
.inv-chip.active { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.inv-chip.warn { border-color: var(--danger); color: var(--danger); }
.inv-chip.warn.active { background: var(--danger); color: var(--crema-100); }
.inv-chip .count { opacity: 0.7; }

.inv-summary {
  margin: 0 20px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
}
.inv-summary .val {
  font-size: 24px; font-weight: 600; letter-spacing: -0.02em;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.inv-summary .sub { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.inv-spark { width: 92px; height: 44px; flex-shrink: 0; }

.inv-list {
  margin: 0 20px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.inv-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard);
}
.inv-row:last-child { border-bottom: none; }
.inv-row:hover { background: var(--crema-50); }
.inv-row.void { opacity: 0.55; }
.inv-row-ico {
  width: 38px; height: 38px; border-radius: 11px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.inv-row-ico.boleta { background: var(--crema-200); color: var(--terracotta-700); }
.inv-row-ico.factura { background: var(--info-bg); color: var(--info); }
.inv-row-ico .iconify { width: 17px; height: 17px; }
.inv-row-body { flex: 1; min-width: 0; }
.inv-row-id {
  font-family: var(--font-mono);
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: center; gap: 6px;
}
.void-tag {
  font-family: var(--font-sans);
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--danger-bg); color: var(--danger);
  padding: 2px 6px; border-radius: 999px;
}
.inv-row-meta {
  font-size: 12px; color: var(--fg3); margin-top: 2px;
  display: block;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.inv-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.inv-row-total { font-size: 14px; font-weight: 600; color: var(--fg1); font-variant-numeric: tabular-nums; }
.inv-row-method {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; color: var(--fg3);
}
.inv-row-method .iconify { width: 11px; height: 11px; }
</style>
