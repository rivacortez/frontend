<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { DiningTable } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Mesas — GastronomIA' })

definePageHeader(() => ({ title: 'Mesas' }))

const { data: tables, refresh } = useTables()
const { data: sales } = useSales()
const toast = useToast()

const search = ref('')
const area = ref('Todas')
const tab = ref<'mapa' | 'rapido' | 'caja'>('mapa')

const openSheet = ref(false)
const sheetTable = ref<DiningTable | null>(null)

const isDesktop = useMediaQuery('(min-width: 1024px)')
const selectedId = ref<string | null>(null)

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

const selectedTable = computed(() => all.value.find(t => t.id === selectedId.value) ?? null)

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

// Cola de atención: mesas demoradas o por cobrar, la que lleva más esperando primero.
const needsAttention = computed(() =>
  all.value
    .filter(t => ['demorada', 'cobrar'].includes(visualStatus(t)))
    .sort((a, b) =>
      new Date(a.openedAt ?? 0).getTime() - new Date(b.openedAt ?? 0).getTime(),
    ),
)

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
  if (isDesktop.value) {
    selectedId.value = t.id
    return
  }
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
    <!-- Toolbar full-width: barra justo debajo del topbar, cruza grilla + aside -->
    <div class="pos-toolbar">
      <div class="pos-search">
        <UIcon name="i-lucide-search" />
        <input
          v-model="search"
          type="search"
          placeholder="Buscar mesa o mesero…"
          aria-label="Buscar mesa"
        >
      </div>
      <button class="pos-tool-btn" aria-label="Actualizar" @click="refresh()">
        <UIcon name="i-lucide-refresh-cw" />
      </button>
      <NuxtLink to="/app/ajustes/mesas" class="pos-tool-btn" aria-label="Configurar mesas">
        <UIcon name="i-lucide-sliders-horizontal" />
      </NuxtLink>
    </div>

    <!-- Desktop: side-by-side split. Mobile: single column (aside is not rendered) -->
    <div class="pos-body">
      <!-- Left / main column: controls + tab content -->
      <div class="pos-main">
        <div class="pos-controls">
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
          <div class="pos-stats" role="status" aria-label="Estado del salón">
            <span class="pos-stat st-ocupada"><span class="sd" /><b>{{ counts.ocupadas }}</b><span class="sl">Ocupadas</span></span>
            <span class="pos-stat st-cobrar"><span class="sd" /><b>{{ counts.cobrar }}</b><span class="sl">Por cobrar</span></span>
            <span class="pos-stat st-libre"><span class="sd" /><b>{{ counts.libres }}</b><span class="sl">Libres</span></span>
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
            :class="[visualStatus(t), { selected: selectedId === t.id }]"
            :aria-label="`Mesa ${pad(t.number)}, ${STATUS_LABEL[visualStatus(t)]}`"
            @click="tap(t)"
          >
            <span class="tc-deco" aria-hidden="true"><i /><i /><i /></span>
            <header class="tc-head">
              <span class="tc-zone">{{ t.zone }}</span>
              <span class="tc-state"><span class="tc-dot" />{{ STATUS_LABEL[visualStatus(t)] }}</span>
            </header>
            <div class="tc-num">{{ pad(t.number) }}</div>
            <footer class="tc-foot">
              <div class="tc-meta">
                <template v-if="t.openedAt">
                  <span class="tc-stat"><UIcon name="i-lucide-users" />{{ t.guests ?? '—' }}</span>
                  <span class="tc-stat tc-time"><UIcon name="i-lucide-clock" />{{ elapsed(t.openedAt) }}</span>
                </template>
                <span v-else class="tc-stat tc-cap"><UIcon name="i-lucide-users" />{{ t.seats }} pers.</span>
              </div>
              <span v-if="t.waiter && t.openedAt" class="tc-waiter">{{ t.waiter }}</span>
            </footer>
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
      </div>

      <!-- Right panel: only on desktop (≥1024px) -->
      <aside v-if="isDesktop" class="pos-aside" aria-label="Detalle de mesa">
        <!-- Selected table detail -->
        <template v-if="selectedTable">
          <div class="aside-header">
            <div class="aside-num" :class="visualStatus(selectedTable)">
              {{ pad(selectedTable.number) }}
            </div>
            <div class="aside-meta">
              <span class="aside-zone">{{ selectedTable.zone }}</span>
              <span class="aside-status-badge" :class="visualStatus(selectedTable)">
                <span class="dot" />{{ STATUS_LABEL[visualStatus(selectedTable)] }}
              </span>
            </div>
            <button class="aside-close" aria-label="Deseleccionar" @click="selectedId = null">
              <UIcon name="i-lucide-x" />
            </button>
          </div>

          <div class="aside-details">
            <div v-if="selectedTable.guests" class="aside-detail-row">
              <UIcon name="i-lucide-users" class="aside-detail-icon" />
              <span>{{ selectedTable.guests }} persona{{ selectedTable.guests !== 1 ? 's' : '' }}</span>
            </div>
            <div v-if="selectedTable.openedAt" class="aside-detail-row">
              <UIcon name="i-lucide-clock" class="aside-detail-icon" />
              <span>{{ elapsed(selectedTable.openedAt) }}</span>
            </div>
            <div v-if="selectedTable.waiter" class="aside-detail-row">
              <UIcon name="i-lucide-user-check" class="aside-detail-icon" />
              <span>{{ selectedTable.waiter }}</span>
            </div>
          </div>

          <div class="aside-actions">
            <!-- Occupied / bill: navigate actions -->
            <template v-if="selectedTable.status === 'occupied' || selectedTable.status === 'bill'">
              <NuxtLink
                :to="`/app/pos/mesa/${selectedTable.id}`"
                class="btn btn-dark btn-block"
              >
                <UIcon name="i-lucide-clipboard-list" /> Ver pedido
              </NuxtLink>
              <NuxtLink
                :to="`/app/pos/mesa/${selectedTable.id}`"
                class="btn btn-terracotta btn-block"
              >
                <UIcon name="i-lucide-banknote" /> Cobrar
              </NuxtLink>
              <NuxtLink
                :to="`/app/pos/mesa/${selectedTable.id}/dividir`"
                class="btn btn-outline btn-block"
              >
                <UIcon name="i-lucide-split" /> Dividir cuenta
              </NuxtLink>
            </template>

            <!-- Free / reserved: open sheet -->
            <template v-else>
              <button
                class="btn btn-dark btn-block"
                @click="sheetTable = selectedTable; openSheet = true"
              >
                <UIcon name="i-lucide-door-open" /> Abrir mesa
              </button>
            </template>
          </div>

          <button class="aside-deselect" @click="selectedId = null">
            <UIcon name="i-lucide-chevron-left" /> Deseleccionar
          </button>
        </template>

        <!-- Sin selección: resumen del salón + cola de atención -->
        <template v-else>
          <section class="aside-overview">
            <header class="ov-head">
              <span class="ov-eyebrow">Estado del salón</span>
              <h3 class="ov-title">{{ counts.ocupadas + counts.cobrar }}<span class="ov-of">/{{ all.length }}</span> mesas activas</h3>
            </header>

            <!-- Barra de ocupación segmentada: la distribución de un vistazo -->
            <div class="ov-bar" role="img"
              :aria-label="`${counts.ocupadas} ocupadas, ${counts.cobrar} por cobrar, ${counts.libres} libres`">
              <span class="ov-seg s-ocu" :style="{ flexGrow: counts.ocupadas || 0.001 }" />
              <span class="ov-seg s-cob" :style="{ flexGrow: counts.cobrar || 0.001 }" />
              <span class="ov-seg s-lib" :style="{ flexGrow: counts.libres || 0.001 }" />
            </div>

            <dl class="ov-legend">
              <div class="ov-item i-ocu">
                <dt><span class="ov-dot" />Ocupadas</dt>
                <dd>{{ counts.ocupadas }}</dd>
              </div>
              <div class="ov-item i-cob">
                <dt><span class="ov-dot" />Por cobrar</dt>
                <dd>{{ counts.cobrar }}</dd>
              </div>
              <div class="ov-item i-lib">
                <dt><span class="ov-dot" />Libres</dt>
                <dd>{{ counts.libres }}</dd>
              </div>
            </dl>
          </section>

          <section class="aside-attention">
            <header class="att-head">
              <h3 class="att-title">Necesitan atención</h3>
              <span v-if="needsAttention.length" class="att-count">{{ needsAttention.length }}</span>
            </header>

            <ul v-if="needsAttention.length" class="att-list">
              <li v-for="t in needsAttention" :key="t.id">
                <button class="att-item" :class="visualStatus(t)" @click="selectedId = t.id">
                  <span class="att-glow" aria-hidden="true" />
                  <span class="att-num">{{ pad(t.number) }}</span>
                  <span class="att-body">
                    <span class="att-state"><span class="att-dot" />{{ STATUS_LABEL[visualStatus(t)] }}</span>
                    <span class="att-meta">
                      {{ t.openedAt ? elapsed(t.openedAt) : '' }}<template v-if="t.guests"> · {{ t.guests }}p</template>
                    </span>
                  </span>
                  <UIcon name="i-lucide-chevron-right" class="att-chev" />
                </button>
              </li>
            </ul>

            <div v-else class="att-clear">
              <span class="att-clear-ring" aria-hidden="true">
                <UIcon name="i-lucide-check" />
              </span>
              <p class="att-clear-title">Todo al día</p>
              <p class="att-clear-sub">Ninguna mesa demorada ni pendiente de cobro.</p>
            </div>
          </section>
        </template>
      </aside>
    </div>

    <button class="pos-fab" aria-label="Abrir nueva mesa" @click="fabOpen">
      <UIcon name="i-lucide-plus" />
    </button>

    <PosOpenTableSheet v-model="openSheet" :table="sheetTable" @opened="onOpened" />
  </div>
</template>

<style scoped>
/* ===== Layout container ===== */
.pos-screen {
  padding-top: 0;
}

/* ===== Adaptive body: flex row on desktop, single column on mobile ===== */
.pos-body {
  display: flex;
  align-items: flex-start;
  /* Gutter derecho para el contenido (el aside no debe pegarse al borde);
     simétrico con el gutter izquierdo. La barra blanca full-bleed NO se toca. */
  padding-right: 20px;
}

.pos-main {
  flex: 1;
  min-width: 0;
}

/* .icon-btn viene del global components.css */

/* ===== Toolbar: barra BLANCA full-bleed bajo el topbar (buscador + acciones) ===== */
.pos-toolbar {
  display: flex; align-items: center; gap: 8px;
  width: 100%;
  margin: 0 0 16px;
  padding: 9px 20px;
  box-sizing: border-box;
  background: var(--pure-white);
  border-bottom: 1px solid var(--border-subtle);
}
.pos-tool-btn {
  flex-shrink: 0;
  width: 36px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--crema-100);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--fg2);
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard),
    color var(--dur) var(--ease-standard),
    border-color var(--dur) var(--ease-standard);
}
.pos-tool-btn:hover { background: var(--crema-200); color: var(--fg1); border-color: var(--border); }
.pos-tool-btn .iconify { width: 18px; height: 18px; }

.pos-search {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 8px;
  background: var(--crema-100);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 11px;
  height: 36px;
  box-sizing: border-box;
}
/* Desktop: el buscador NO se estira; queda acotado a la izquierda y las acciones van a la derecha */
@media (min-width: 640px) {
  .pos-search { flex: 0 0 340px; margin-right: auto; }
}
.pos-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.pos-search input {
  flex: 1; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.pos-search input::placeholder { color: var(--fg3); }
.pos-search .iconify { width: 16px; height: 16px; color: var(--fg3); }

/* ===== Controls: segmented tabs (compacto, content-width) + stat chips ===== */
.pos-controls {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 12px;
  width: calc(100% - 40px);
  margin-inline: auto;
  margin-bottom: 14px;
}
.pos-tabs {
  display: inline-flex;
  background: var(--crema-200);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.pos-tab {
  flex: 0 0 auto;
  background: transparent; border: none;
  font: inherit; font-size: 13px; font-weight: 600;
  color: var(--fg2);
  padding: 7px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.pos-tab.active {
  background: var(--pure-white); color: var(--fg1);
  box-shadow: var(--shadow-sm);
}

/* ===== Zone chips: cap + center to match controls ===== */
.pos-chips {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0 0 14px;
  width: calc(100% - 40px);
  margin-inline: auto;
  box-sizing: border-box;
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

/* ===== Stat chips: estado del salón (compacto, no estirado) ===== */
.pos-stats {
  display: inline-flex; align-items: center; gap: 7px;
  flex-wrap: wrap;
}
/* En desktop el panel derecho ya muestra los contadores → los chips son solo mobile */
@media (min-width: 1024px) {
  .pos-stats { display: none; }
}
.pos-stat {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12.5px; font-weight: 500; color: var(--fg2);
  padding: 6px 11px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  white-space: nowrap;
}
.pos-stat b { font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }
.pos-stat .sd { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.pos-stat .sl { color: var(--fg3); }
.st-ocupada .sd { background: var(--info); }
.st-cobrar .sd { background: var(--terracotta); }
.st-libre .sd { background: var(--oliva); }

/* ===== Grid de mesas: full-width auto-fill ===== */
.pos-grid {
  display: grid;
  /* Mobile: 2 mesas por fila, compactas — el mozo ve el salón sin scrollear */
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  /* Full width con gutter de 20px (aprovecha todo el ancho del panel) */
  width: calc(100% - 40px);
  margin-inline: auto;
  padding-bottom: 24px;
}
@media (min-width: 540px) {
  .pos-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
}
/* ===== Tarjeta de mesa — estructura: header (zona·estado) / número / meta ===== */
.table-card {
  min-height: 132px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 13px 11px;
  display: flex; flex-direction: column; gap: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  font: inherit;
  text-align: left;
  transition: transform 80ms,
    border-color var(--dur) var(--ease-standard),
    box-shadow var(--dur) var(--ease-standard);
}
.table-card:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }
.table-card:active { transform: scale(0.985); }
.table-card.selected { outline: 2px solid var(--terracotta); outline-offset: 2px; }

/* Header: zona + estado (dot + label, sin chip tintado) */
.tc-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.tc-zone {
  font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--fg3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tc-state {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  font-size: 11px; font-weight: 600; color: var(--fg2);
}
.tc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border-strong); flex-shrink: 0; }

/* Número de mesa */
.tc-num {
  font-size: 33px; font-weight: 700;
  letter-spacing: -0.045em; line-height: 0.95;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
}

/* Meta inferior: comensales · tiempo (o capacidad) + mozo */
.tc-foot { margin-top: auto; display: flex; flex-direction: column; gap: 3px; }
.tc-meta {
  display: flex; align-items: center; gap: 14px;
  font-size: 12.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.tc-stat { display: inline-flex; align-items: center; gap: 5px; }
.tc-stat .iconify { width: 13px; height: 13px; color: var(--fg3); }
.tc-cap { color: var(--fg2); font-weight: 500; }
.tc-waiter {
  font-size: 11.5px; font-weight: 500; color: var(--fg3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ===== Estados: dot + label por estado ===== */
.table-card.libre .tc-dot { background: var(--oliva); }
.table-card.libre .tc-state { color: var(--oliva-700); }
.table-card.ocupada .tc-dot { background: var(--info); }
.table-card.ocupada .tc-state { color: var(--info); }
.table-card.reservada .tc-dot { background: var(--mostaza); }
.table-card.reservada .tc-state { color: var(--mostaza-700); }
.table-card.cobrar .tc-dot { background: var(--terracotta); }
.table-card.cobrar .tc-state { color: var(--terracotta-700); }
.table-card.demorada .tc-dot { background: var(--danger); }
.table-card.demorada .tc-state { color: var(--danger); }

/* la métrica de tiempo GRITA en demorada */
.table-card.demorada .tc-time { color: var(--danger); font-weight: 700; }
.table-card.demorada .tc-time .iconify { color: var(--danger); }

/* urgentes: solo borde tintado (sin gradiente ni ring) — una señal, theme-safe */
.table-card.demorada { border-color: rgba(179, 58, 42, 0.42); }
.table-card.cobrar { border-color: rgba(201, 106, 67, 0.42); }
.table-card.cobrar .tc-dot { animation: cobrarPulse 2.4s var(--ease-standard) infinite; }
@keyframes cobrarPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201, 106, 67, 0.5); }
  50% { box-shadow: 0 0 0 4px rgba(201, 106, 67, 0); }
}

/* Señal de estado: el NÚMERO de mesa toma el color del estado (sin barra lateral) */
.table-card.libre .tc-num { color: var(--oliva-700); }
.table-card.ocupada .tc-num { color: var(--info); }
.table-card.reservada .tc-num { color: var(--mostaza-700); }
.table-card.cobrar .tc-num { color: var(--terracotta-700); }
.table-card.demorada .tc-num { color: var(--danger); }

/* ===== Deco: círculos en capas (glow en la esquina) — solo mesas activas ===== */
.tc-deco {
  position: absolute; inset: 0;
  overflow: hidden; pointer-events: none;
  z-index: 0; border-radius: inherit;
}
.tc-deco i { position: absolute; border-radius: 50%; background: transparent; }
.tc-deco i:nth-child(1) { top: -58px; right: -42px; width: 118px; height: 118px; opacity: 0.16; }
.tc-deco i:nth-child(2) { top: -46px; right: -24px; width: 82px; height: 82px; opacity: 0.22; }
.tc-deco i:nth-child(3) { top: -22px; right: -4px; width: 42px; height: 42px; opacity: 0.34; }
.table-card.libre .tc-deco i { background: var(--oliva); }
.table-card.ocupada .tc-deco i { background: var(--info); }
.table-card.demorada .tc-deco i { background: var(--danger); }
.table-card.cobrar .tc-deco i { background: var(--terracotta); }
.table-card.reservada .tc-deco i { background: var(--mostaza); }
/* el contenido va por encima del deco */
.tc-head, .tc-num, .tc-foot { position: relative; z-index: 1; }

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

/* ===== Persistent side panel (desktop only) ===== */
.pos-aside {
  width: 360px;
  flex-shrink: 0;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;

  background: var(--bg-card);
  border-left: 1px solid var(--border);
  border-radius: 0 16px 16px 0;
  display: flex;
  flex-direction: column;
}

/* ===== Aside header ===== */
.aside-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.aside-num {
  width: 52px; height: 52px; border-radius: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700; letter-spacing: -0.03em;
  background: var(--crema-200); color: var(--fg1);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.aside-num.libre { background: var(--success-bg); color: var(--oliva-700); }
.aside-num.ocupada { background: var(--info-bg); color: var(--info); }
.aside-num.reservada { background: var(--warning-bg); color: var(--mostaza-700); }
.aside-num.cobrar { background: var(--terracotta); color: var(--crema-100); }
.aside-num.demorada { background: var(--danger-bg); color: var(--danger); }

.aside-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aside-zone {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3);
}

.aside-status-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  align-self: flex-start;
}
.aside-status-badge .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.aside-status-badge.libre { background: var(--success-bg); color: var(--oliva-700); }
.aside-status-badge.libre .dot { background: var(--oliva); }
.aside-status-badge.ocupada { background: var(--info-bg); color: var(--info); }
.aside-status-badge.ocupada .dot { background: var(--info); }
.aside-status-badge.reservada { background: var(--warning-bg); color: var(--mostaza-700); }
.aside-status-badge.reservada .dot { background: var(--mostaza); }
.aside-status-badge.cobrar { background: var(--terracotta); color: var(--crema-100); }
.aside-status-badge.cobrar .dot { background: var(--crema-100); }
.aside-status-badge.demorada { background: var(--danger-bg); color: var(--danger); }
.aside-status-badge.demorada .dot { background: var(--danger); }

.aside-close {
  width: 30px; height: 30px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--fg3);
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
  flex-shrink: 0;
}
.aside-close:hover { background: var(--crema-200); color: var(--fg1); }
.aside-close .iconify { width: 16px; height: 16px; }

/* ===== Aside detail rows ===== */
.aside-details {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.aside-detail-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  color: var(--fg2);
}

.aside-detail-icon {
  width: 15px; height: 15px;
  color: var(--fg3);
  flex-shrink: 0;
}

/* ===== Aside action buttons ===== */
.aside-actions {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  font: inherit; font-size: 13.5px; font-weight: 600;
  padding: 10px 16px;
  border-radius: 10px;
  border: none; cursor: pointer;
  transition: background var(--dur) var(--ease-standard), opacity var(--dur) var(--ease-standard);
  text-decoration: none;
}
.btn .iconify { width: 15px; height: 15px; flex-shrink: 0; }
.btn-block { width: 100%; box-sizing: border-box; }

.btn-dark {
  background: var(--fg1); color: var(--bg);
}
.btn-dark:hover { opacity: 0.85; }

.btn-terracotta {
  background: var(--terracotta); color: var(--crema-100);
}
.btn-terracotta:hover { background: var(--terracotta-700); }

.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
}
.btn-outline:hover { background: var(--crema-100); color: var(--fg1); }

/* ===== Deselect footer ===== */
.aside-deselect {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 500;
  color: var(--fg3);
  background: transparent; border: none; cursor: pointer;
  padding: 12px 16px;
  transition: color var(--dur) var(--ease-standard);
}
.aside-deselect:hover { color: var(--fg1); }
.aside-deselect .iconify { width: 14px; height: 14px; }

/* ===== Aside empty state ===== */
/* ===== Sin selección: resumen del salón ===== */
/* Una sola unidad editorial (panel-en-panel) — no 3 tiles clonadas.
   Profundidad coherente con el dashboard .kpi: gradiente + glow cálido. */
.aside-overview {
  margin: 14px 14px 6px;
  padding: 16px 16px 14px;
  border-radius: 16px;
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(201, 106, 67, 0.08), transparent 54%),
    linear-gradient(180deg, var(--pure-white) 0%, var(--crema-50) 100%);
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 1px 2px rgba(26, 26, 26, 0.04),
    0 14px 28px -18px rgba(201, 106, 67, 0.28),
    0 20px 40px -26px rgba(26, 26, 26, 0.18);
}
.ov-head { display: flex; flex-direction: column; gap: 3px; margin-bottom: 13px; }
.ov-eyebrow {
  font-size: 10px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--fg3);
}
.ov-title {
  margin: 0; font-family: var(--font-serif);
  font-size: 21px; font-weight: 600; line-height: 1.05;
  letter-spacing: -0.01em; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.ov-of { color: var(--fg3); font-weight: 500; }

/* Barra de ocupación segmentada: distribución de un vistazo (sustituye 3 cajas) */
.ov-bar { display: flex; gap: 3px; height: 9px; margin-bottom: 14px; }
.ov-seg {
  border-radius: 999px; min-width: 4px;
  transition: flex-grow var(--dur-slow) var(--ease-emphasis);
}
.ov-seg.s-ocu { background: var(--info); }
.ov-seg.s-cob {
  background: var(--terracotta);
  box-shadow: 0 0 0 0 rgba(201, 106, 67, 0.45);
  animation: ovCobPulse 2.6s var(--ease-standard) infinite;
}
.ov-seg.s-lib { background: var(--oliva); opacity: 0.55; }
@keyframes ovCobPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201, 106, 67, 0.4); }
  50% { box-shadow: 0 0 0 3px rgba(201, 106, 67, 0); }
}

/* Leyenda como figuras inline (label izq · número der) — no cajitas */
.ov-legend { margin: 0; display: flex; flex-direction: column; gap: 0; }
.ov-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0;
  border-top: 1px solid var(--border-subtle);
}
.ov-item:first-child { border-top: none; }
.ov-item dt {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; font-weight: 500; color: var(--fg2);
}
.ov-item dd {
  margin: 0; font-family: var(--font-serif);
  font-size: 17px; font-weight: 600; color: var(--fg1);
  letter-spacing: -0.01em; font-variant-numeric: tabular-nums;
}
.ov-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.i-ocu .ov-dot { background: var(--info); }
.i-cob .ov-dot { background: var(--terracotta); }
.i-lib .ov-dot { background: var(--oliva); }
.i-cob dd { color: var(--terracotta-700); }

/* ===== Cola de atención ===== */
.aside-attention { padding: 16px 14px 18px; display: flex; flex-direction: column; gap: 11px; }
.att-head { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
.att-title {
  margin: 0; font-size: 11px; font-weight: 700;
  letter-spacing: 0.07em; text-transform: uppercase; color: var(--fg3);
}
.att-count {
  font-size: 11px; font-weight: 700; color: var(--crema-100);
  background: var(--terracotta); border-radius: 999px;
  min-width: 18px; height: 18px; padding: 0 5px;
  display: inline-flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 2px 6px -1px rgba(201, 106, 67, 0.5);
}
.att-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }

/* Item: rail de estado en gradiente + glow de esquina que se expande en hover */
.att-item {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px 10px 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 13px;
  cursor: pointer; text-align: left; font: inherit;
  position: relative; overflow: hidden; isolation: isolate;
  transition:
    transform var(--dur) var(--ease-standard),
    border-color var(--dur) var(--ease-standard),
    box-shadow var(--dur) var(--ease-standard);
}
.att-item::before {
  content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 3px; border-radius: 999px;
}
.att-item.demorada::before {
  background: linear-gradient(180deg, var(--danger), rgba(179, 58, 42, 0.45));
}
.att-item.cobrar::before {
  background: linear-gradient(180deg, var(--terracotta), rgba(201, 106, 67, 0.45));
}
.att-glow {
  position: absolute; top: -28px; right: -28px;
  width: 64px; height: 64px; border-radius: 50%;
  z-index: -1; opacity: 0.16;
  transition: transform var(--dur-slow) var(--ease-emphasis), opacity var(--dur) var(--ease-standard);
}
.att-item.demorada .att-glow { background: var(--danger); }
.att-item.cobrar .att-glow { background: var(--terracotta); }
.att-item:hover {
  transform: translateY(-2px);
  border-color: var(--border);
  box-shadow: 0 1px 2px rgba(26, 26, 26, 0.04), 0 12px 22px -14px rgba(26, 26, 26, 0.26);
}
.att-item:hover .att-glow { transform: scale(1.7); opacity: 0.22; }
.att-item:active { transform: translateY(0) scale(0.99); }

.att-num {
  flex-shrink: 0; min-width: 28px;
  font-family: var(--font-serif);
  font-size: 19px; font-weight: 600; color: var(--fg1);
  letter-spacing: -0.02em; line-height: 1; font-variant-numeric: tabular-nums;
}
.att-item.demorada .att-num { color: var(--danger); }
.att-item.cobrar .att-num { color: var(--terracotta-700); }
.att-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.att-state { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
.att-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.att-item.demorada .att-state { color: var(--danger); }
.att-item.demorada .att-dot { background: var(--danger); }
.att-item.cobrar .att-state { color: var(--terracotta-700); }
.att-item.cobrar .att-dot { background: var(--terracotta); }
.att-meta { font-size: 11.5px; color: var(--fg3); font-variant-numeric: tabular-nums; }
.att-chev {
  width: 15px; height: 15px; color: var(--fg3); flex-shrink: 0;
  transition: transform var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.att-item:hover .att-chev { transform: translateX(2px); color: var(--fg2); }

/* empty state POSITIVO — anillo construido en vez de ícono "happy path" suelto */
.att-clear {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 4px; padding: 26px 16px;
}
.att-clear-ring {
  width: 44px; height: 44px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--success-bg); color: var(--oliva-700);
  box-shadow: 0 0 0 6px rgba(110, 123, 97, 0.08);
  margin-bottom: 6px;
}
.att-clear-ring .iconify { width: 20px; height: 20px; }
.att-clear-title { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.att-clear-sub { margin: 0; font-size: 12px; color: var(--fg3); line-height: 1.45; max-width: 26ch; }

@media (prefers-reduced-motion: reduce) {
  .ov-seg.s-cob { animation: none; }
  .att-item, .att-glow, .att-chev { transition: none; }
  .att-item:hover { transform: none; }
  .att-item:hover .att-glow { transform: none; }
}
</style>
