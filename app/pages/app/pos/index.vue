<script setup lang="ts">
import type { DiningTable } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Mesas — GastronomIA' })

const { data: tables, refresh } = useTables()
const { data: sales } = useSales()
const toast = useToast()

const search = ref('')
const area = ref('Todas')
const tab = ref<'mapa' | 'rapido' | 'caja'>('mapa')

const openSheet = ref(false)
const sheetTable = ref<DiningTable | null>(null)

const DELAYED_MS = 2 * 60 * 60 * 1000

type VisualStatus = 'libre' | 'ocupada' | 'cobrar' | 'demorada' | 'reservada'

function visualStatus(t: DiningTable): VisualStatus {
  if (t.status === 'bill') return 'cobrar'
  if (t.status === 'reserved') return 'reservada'
  if (t.status === 'occupied') {
    const openedMs = t.openedAt ? Date.now() - new Date(t.openedAt).getTime() : 0
    return openedMs > DELAYED_MS ? 'demorada' : 'ocupada'
  }
  return 'libre'
}

const STATUS_LABEL: Record<VisualStatus, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  cobrar: 'Por cobrar',
  demorada: 'Demorada',
  reservada: 'Reservada',
}

const all = computed(() => tables.value ?? [])

const areas = computed(() => {
  const zones: string[] = []
  for (const t of all.value) {
    if (!zones.includes(t.zone)) zones.push(t.zone)
  }
  return ['Todas', ...zones]
})

function areaCount(a: string): number {
  return a === 'Todas' ? all.value.length : all.value.filter(t => t.zone === a).length
}

const counts = computed(() => ({
  ocupadas: all.value.filter(t => t.status === 'occupied').length,
  cobrar: all.value.filter(t => t.status === 'bill').length,
  libres: all.value.filter(t => t.status === 'free').length,
}))

const filtered = computed(() =>
  all.value.filter((t) => {
    if (area.value !== 'Todas' && t.zone !== area.value) return false
    const q = search.value.trim().toLowerCase()
    if (!q) return true
    return String(t.number).includes(q)
      || t.zone.toLowerCase().includes(q)
      || (t.waiter?.toLowerCase().includes(q) ?? false)
  }),
)

const activeSorted = computed(() =>
  filtered.value
    .filter(t => t.status === 'occupied' || t.status === 'bill')
    .sort((a, b) => new Date(a.openedAt ?? 0).getTime() - new Date(b.openedAt ?? 0).getTime()),
)

const cashSummary = computed(() => {
  const issued = (sales.value ?? []).filter(s => s.status === 'issued')
  const total = issued.reduce((sum, s) => sum + s.total, 0)
  const byMethod: Record<string, number> = {}
  for (const s of issued) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.total
  }
  return { count: issued.length, total, byMethod }
})

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  yape: 'Yape',
  plin: 'Plin',
}

function tap(t: DiningTable): void {
  if (t.status === 'free' || t.status === 'reserved') {
    sheetTable.value = t
    openSheet.value = true
    return
  }
  void navigateTo(`/app/pos/mesa/${t.id}`)
}

function fabOpen(): void {
  const free = filtered.value.find(t => t.status === 'free')
  if (!free) {
    toast.add({ title: 'No hay mesas libres en esta área', icon: 'i-lucide-circle-alert' })
    return
  }
  sheetTable.value = free
  openSheet.value = true
}

async function onOpened(tableId: string): Promise<void> {
  await refresh()
  await navigateTo(`/app/pos/mesa/${tableId}`)
}

const pad = (n: number): string => String(n).padStart(2, '0')
</script>

<template>
  <div class="pos-screen">
    <header class="pos-hdr">
      <h1>Mesas</h1>
      <div class="pos-hdr-actions">
        <button class="icon-btn" aria-label="Actualizar" @click="refresh()">
          <UIcon name="i-lucide-refresh-cw" />
        </button>
        <NuxtLink to="/app/ajustes/mesas" class="icon-btn" aria-label="Configurar mesas">
          <UIcon name="i-lucide-sliders-horizontal" />
        </NuxtLink>
      </div>
    </header>

    <div class="pos-search">
      <UIcon name="i-lucide-search" />
      <input
        v-model="search"
        type="search"
        placeholder="Buscar mesa o mesero…"
        aria-label="Buscar mesa"
      >
    </div>

    <div class="pos-tabs" role="tablist">
      <button
        v-for="[id, label] in ([['mapa', 'Mapa'], ['rapido', 'Rápido'], ['caja', 'Caja']] as const)"
        :key="id"
        role="tab"
        class="pos-tab"
        :class="{ active: tab === id }"
        :aria-selected="tab === id"
        @click="tab = id"
      >{{ label }}</button>
    </div>

    <div class="pos-summary">
      <div class="pos-summary-cell">
        <div class="num">{{ counts.ocupadas }}<small>/{{ all.length }}</small></div>
        <div class="lbl"><span class="sw" style="background: var(--info)" />Ocupadas</div>
      </div>
      <div class="pos-summary-cell">
        <div class="num">{{ counts.cobrar }}</div>
        <div class="lbl"><span class="sw" style="background: var(--terracotta)" />Por cobrar</div>
      </div>
      <div class="pos-summary-cell">
        <div class="num">{{ counts.libres }}</div>
        <div class="lbl"><span class="sw" style="background: var(--oliva)" />Libres</div>
      </div>
    </div>

    <div v-if="tab !== 'caja'" class="pos-chips" role="tablist" aria-label="Filtrar por área">
      <button
        v-for="a in areas"
        :key="a"
        role="tab"
        class="pos-chip"
        :class="{ active: area === a }"
        :aria-selected="area === a"
        @click="area = a"
      >
        {{ a }} <span class="count">{{ areaCount(a) }}</span>
      </button>
    </div>

    <!-- ===== Mapa ===== -->
    <div v-if="tab === 'mapa'" class="pos-grid">
      <button
        v-for="t in filtered"
        :key="t.id"
        class="table-card"
        :class="visualStatus(t)"
        :aria-label="`Mesa ${pad(t.number)}, ${STATUS_LABEL[visualStatus(t)]}`"
        @click="tap(t)"
      >
        <div class="table-top">
          <span class="table-area">{{ t.zone }}</span>
          <span v-if="t.guests" class="table-icons"><UIcon name="i-lucide-users" /></span>
        </div>
        <div class="table-num">{{ pad(t.number) }}</div>
        <span class="table-status"><span class="dot" />{{ STATUS_LABEL[visualStatus(t)] }}</span>
        <div v-if="t.openedAt" class="table-meta">
          <template v-if="t.guests"><UIcon name="i-lucide-user" /> {{ t.guests }}p</template>
          <UIcon name="i-lucide-clock" /> {{ elapsed(t.openedAt) }}
        </div>
        <span v-if="visualStatus(t) === 'demorada'" class="table-warn" :aria-label="`Más de 2 h abierta`">
          <UIcon name="i-lucide-alert-triangle" />
        </span>
      </button>
    </div>

    <!-- ===== Rápido: mesas activas por tiempo ===== -->
    <div v-else-if="tab === 'rapido'" class="quick-list">
      <UiEmptyState
        v-if="activeSorted.length === 0"
        icon="i-lucide-armchair"
        title="Sin mesas activas"
        subtitle="Abre una mesa desde el mapa para empezar a atender."
      />
      <button
        v-for="t in activeSorted"
        :key="t.id"
        class="quick-row"
        @click="navigateTo(`/app/pos/mesa/${t.id}`)"
      >
        <span class="quick-num" :class="visualStatus(t)">{{ pad(t.number) }}</span>
        <span class="quick-body">
          <span class="quick-title">Mesa {{ pad(t.number) }} · {{ t.zone }}</span>
          <span class="quick-sub">{{ t.guests }}p · {{ t.waiter }} · {{ t.openedAt ? elapsed(t.openedAt) : '' }}</span>
        </span>
        <span class="quick-status">{{ STATUS_LABEL[visualStatus(t)] }}</span>
        <UIcon name="i-lucide-chevron-right" class="quick-chev" />
      </button>
    </div>

    <!-- ===== Caja: resumen del día ===== -->
    <div v-else class="cash-wrap">
      <div class="cash-card">
        <div class="eyebrow">Venta de hoy</div>
        <div class="cash-total">{{ formatPEN(cashSummary.total) }}</div>
        <div class="cash-sub">{{ cashSummary.count }} comprobantes emitidos</div>
        <div class="cash-methods">
          <div v-for="(amount, method) in cashSummary.byMethod" :key="method" class="cash-method">
            <span>{{ METHOD_LABEL[method] ?? method }}</span>
            <b>{{ formatPEN(amount) }}</b>
          </div>
        </div>
        <NuxtLink to="/app/comprobantes" class="btn btn-dark btn-block" style="margin-top: 14px">
          <UIcon name="i-lucide-receipt" /> Ver comprobantes
        </NuxtLink>
      </div>
    </div>

    <button class="pos-fab" aria-label="Abrir nueva mesa" @click="fabOpen">
      <UIcon name="i-lucide-plus" />
    </button>

    <PosOpenTableSheet v-model="openSheet" :table="sheetTable" @opened="onOpened" />
  </div>
</template>

<style scoped>
.pos-screen {
  max-width: 760px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}
@media (min-width: 1024px) {
  .pos-screen { padding-top: 28px; }
}

.pos-hdr {
  padding: 4px 20px 12px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
}
.pos-hdr h1 {
  font-size: 28px; font-weight: 600;
  letter-spacing: -0.02em; margin: 0; line-height: 1;
}
.pos-hdr-actions { display: flex; gap: 8px; }
/* .icon-btn viene del global components.css */

.pos-search {
  margin: 0 20px 12px;
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 40px;
}
.pos-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.pos-search input {
  flex: 1; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.pos-search input::placeholder { color: var(--fg3); }
.pos-search .iconify { width: 16px; height: 16px; color: var(--fg3); }

.pos-tabs {
  margin: 0 20px 14px;
  display: flex;
  background: var(--crema-200);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  width: calc(100% - 40px);
}
.pos-tab {
  flex: 1;
  background: transparent; border: none;
  font: inherit; font-size: 13px; font-weight: 600;
  color: var(--fg2);
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.pos-tab.active {
  background: var(--pure-white); color: var(--fg1);
  box-shadow: var(--shadow-sm);
}

.pos-chips {
  padding: 0 20px 14px;
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.pos-chips::-webkit-scrollbar { display: none; }
.pos-chip {
  font: inherit; font-size: 13px; font-weight: 500;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px;
  flex-shrink: 0;
}
.pos-chip.active {
  background: var(--espresso); color: var(--crema-100);
  border-color: var(--espresso);
}
.pos-chip .count { font-size: 11px; opacity: 0.7; font-family: var(--font-mono); }

.pos-summary {
  margin: 0 20px 14px;
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.pos-summary-cell {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 12px;
}
.pos-summary-cell .num {
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.1;
  color: var(--fg1);
  display: flex; align-items: baseline; gap: 5px;
}
.pos-summary-cell .num small { font-size: 11px; color: var(--fg3); font-weight: 500; }
.pos-summary-cell .lbl {
  font-size: 11px; color: var(--fg3);
  margin-top: 2px;
  display: inline-flex; align-items: center; gap: 4px;
}
.pos-summary-cell .lbl .sw { width: 6px; height: 6px; border-radius: 50%; }

/* ===== Grid de mesas ===== */
.pos-grid {
  padding: 0 20px 24px;
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@media (min-width: 640px) {
  .pos-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (min-width: 1024px) {
  .pos-grid { grid-template-columns: repeat(5, 1fr); }
}
.table-card {
  aspect-ratio: 1 / 1;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 10px;
  display: flex; flex-direction: column;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 80ms, border-color var(--dur) var(--ease-standard);
  font: inherit;
  text-align: left;
}
.table-card:active { transform: scale(0.97); }
.table-num {
  font-size: 30px; font-weight: 600;
  letter-spacing: -0.04em; line-height: 1;
  color: var(--fg1);
  margin: auto 0;
  align-self: center;
}
.table-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  width: 100%;
}
.table-area {
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3);
}
.table-icons { display: inline-flex; gap: 4px; color: var(--fg3); }
.table-icons .iconify { width: 12px; height: 12px; }
.table-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
  padding: 4px 8px;
  border-radius: 999px;
  align-self: flex-start;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.table-status .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.table-meta {
  font-size: 10.5px; color: var(--fg3);
  margin-top: 4px;
  display: flex; align-items: center; gap: 6px;
  font-variant-numeric: tabular-nums;
}
.table-meta .iconify { width: 10px; height: 10px; }

.table-card.libre .table-status { background: var(--success-bg); color: var(--oliva-700); }
.table-card.libre .table-status .dot { background: var(--oliva); }

.table-card.ocupada { background: var(--crema-100); }
.table-card.ocupada .table-status { background: var(--info-bg); color: var(--info); }
.table-card.ocupada .table-status .dot { background: var(--info); }

.table-card.reservada .table-status { background: var(--warning-bg); color: var(--mostaza-700); }
.table-card.reservada .table-status .dot { background: var(--mostaza); }

.table-card.cobrar {
  border-color: var(--terracotta);
  background: linear-gradient(160deg, var(--pure-white) 0%, #FCEEE6 100%);
  box-shadow: 0 0 0 2px rgba(201, 106, 67, 0.12);
}
.table-card.cobrar .table-num { color: var(--terracotta-700); }
.table-card.cobrar .table-status {
  background: var(--terracotta);
  color: var(--crema-100);
  animation: cobrarPulse 2.4s var(--ease-standard) infinite;
}
.table-card.cobrar .table-status .dot { background: var(--crema-100); }
@keyframes cobrarPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201, 106, 67, 0.45); }
  50% { box-shadow: 0 0 0 6px rgba(201, 106, 67, 0); }
}

.table-card.demorada {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px rgba(179, 58, 42, 0.12);
}
.table-card.demorada .table-status { background: var(--danger-bg); color: var(--danger); }
.table-card.demorada .table-status .dot { background: var(--danger); }

.table-warn {
  position: absolute; top: 8px; right: 8px;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--danger); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--pure-white);
}
.table-warn .iconify { width: 10px; height: 10px; }

/* ===== Rápido ===== */
.quick-list { padding: 0 20px 24px; display: flex; flex-direction: column; gap: 8px; }
.quick-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.quick-row:hover { background: var(--crema-100); }
.quick-num {
  width: 44px; height: 44px; border-radius: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 600; letter-spacing: -0.02em;
  background: var(--crema-200); color: var(--fg1);
  flex-shrink: 0;
}
.quick-num.cobrar { background: var(--terracotta); color: var(--crema-100); }
.quick-num.demorada { background: var(--danger-bg); color: var(--danger); }
.quick-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.quick-title { font-size: 14px; font-weight: 600; color: var(--fg1); }
.quick-sub { font-size: 12px; color: var(--fg3); }
.quick-status { font-size: 11px; font-weight: 600; color: var(--fg2); }
.quick-chev { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

/* ===== Caja ===== */
.cash-wrap { padding: 0 20px 24px; }
.cash-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 20px;
}
.cash-total {
  font-size: 34px; font-weight: 600; letter-spacing: -0.03em;
  color: var(--fg1);
  margin-top: 6px;
}
.cash-sub { font-size: 12.5px; color: var(--fg3); margin-top: 2px; }
.cash-methods { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.cash-method {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13.5px; color: var(--fg2);
  padding: 9px 12px;
  background: var(--crema-100);
  border-radius: 10px;
}
.cash-method b { color: var(--fg1); font-variant-numeric: tabular-nums; }

/* FAB */
.pos-fab {
  position: fixed;
  right: 20px; bottom: calc(86px + env(safe-area-inset-bottom, 0px));
  width: 52px; height: 52px; border-radius: 999px;
  background: var(--terracotta); color: var(--crema-100);
  border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 10px 24px rgba(201, 106, 67, 0.35), 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 30;
  transition: transform var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.pos-fab:hover { background: var(--terracotta-700); }
.pos-fab:active { transform: scale(0.94); }
.pos-fab .iconify { width: 22px; height: 22px; }
@media (min-width: 1024px) {
  .pos-fab { bottom: 32px; }
}
</style>
