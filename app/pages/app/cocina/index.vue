<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import type { KitchenQueueItem } from '~/composables/use-kitchen'

// HU-03-07/08/09 · KDS (Kitchen Display). Pantalla nueva (el prototipo no la
// tenía). Cocineros = staff; sin gating extra (todos pueden leer/patch Kitchen).
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Cocina (KDS) — GastronomIA' })

definePageHeader(() => ({
  title: 'Cocina',
  subtitle: 'KDS · comandas en cola',
}))

const toast = useToast()

// Estación seleccionada: '' = "Todas" (sin filtro). El backend filtra por uuid.
const stationId = ref('')

const { data: stations } = useKitchenStations()
const { data: queue, refresh, isLoading, error } = useKitchenQueue(stationId)
const startItem = useStartItem()
const readyItem = useReadyItem()

// Polling (no hay SSE en el backend aún): refetch cada 5 s. `useIntervalFn`
// se limpia solo al desmontar la pantalla. El `staleTime` bajo del composable
// hace que cada refresh pegue de verdad al servidor.
const POLL_MS = 5_000
useIntervalFn(() => { void refresh() }, POLL_MS)

const items = computed<KitchenQueueItem[]>(() => queue.value ?? [])

// Buscador: filtra por mesa o plato (sobre la cola ya acotada por estación en el
// backend). Se aplica ANTES de agrupar, así chips + búsqueda combinan.
const search = ref('')
const filteredItems = computed<KitchenQueueItem[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(i =>
    i.tableCode.toLowerCase().includes(q) || i.dishName.toLowerCase().includes(q),
  )
})

/**
 * Un KDS real agrupa por COMANDA (ticket), no por ítem suelto. El modelo no
 * trae estación por ítem, pero sí `orderId` + `tableCode`: con eso armamos una
 * tarjeta por orden que lista todos sus platos. Esto NO toca el fetch ni el
 * polling — sólo reorganiza la misma data en el front.
 */
interface KitchenTicket {
  orderId: string
  tableCode: string
  items: KitchenQueueItem[]
  /** Espera de la comanda = el ítem que más lleva esperando. */
  waitMinutes: number
  isLate: boolean
  preparingCount: number
}

const tickets = computed<KitchenTicket[]>(() => {
  const byOrder = new Map<string, KitchenQueueItem[]>()
  for (const it of filteredItems.value) {
    const group = byOrder.get(it.orderId)
    if (group) group.push(it)
    else byOrder.set(it.orderId, [it])
  }

  const list: KitchenTicket[] = []
  for (const [orderId, group] of byOrder) {
    list.push({
      orderId,
      tableCode: group[0]!.tableCode,
      items: group,
      waitMinutes: group.reduce((max, i) => Math.max(max, i.waitMinutes), 0),
      isLate: group.some(i => i.isLate),
      preparingCount: group.filter(i => i.status === 'preparing').length,
    })
  }
  // La comanda con más espera (la más vieja) va primero — robusto ante el reloj.
  return list.sort((a, b) => b.waitMinutes - a.waitMinutes)
})

// ===== Resumen para el panel lateral (refleja lo visible: estación + búsqueda) =====
const pendingCount = computed(() => filteredItems.value.filter(i => i.status === 'pending').length)
const preparingCount = computed(() => filteredItems.value.filter(i => i.status === 'preparing').length)
const lateCount = computed(() => tickets.value.filter(t => t.isLate).length)
const avgWait = computed(() => {
  const list = filteredItems.value
  if (!list.length) return 0
  return Math.round(list.reduce((sum, i) => sum + i.waitMinutes, 0) / list.length)
})

const stationTabs = computed(() => [
  { id: '', name: 'Todas' },
  ...[...(stations.value ?? [])].sort((a, b) => a.position - b.position),
])

function tableLabel(code: string): string {
  // Si el code es puramente numérico lo mostramos como "Mesa 12"; si no, tal cual.
  return /^\d+$/.test(code) ? `Mesa ${code}` : code
}

function waitLabel(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h} h ${mins % 60} min`
}

async function onStart(item: KitchenQueueItem): Promise<void> {
  try {
    await startItem.mutateAsync({ itemId: item.orderItemId })
    toast.add({ title: `${item.dishName} en preparación`, icon: 'i-lucide-flame' })
  }
  catch (e) {
    toast.add({
      title: errorMessage(e, 'No se pudo iniciar el ítem'),
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
}

async function onReady(item: KitchenQueueItem): Promise<void> {
  try {
    await readyItem.mutateAsync({ itemId: item.orderItemId })
    toast.add({ title: `${item.dishName} listo`, icon: 'i-lucide-check-circle-2' })
  }
  catch (e) {
    toast.add({
      title: errorMessage(e, 'No se pudo marcar como listo'),
      icon: 'i-lucide-circle-alert',
      color: 'error',
    })
  }
}

// Marca el ítem en curso de mutación (deshabilita sus botones) por orderItemId.
const pendingId = computed(() =>
  (startItem.variables.value?.itemId ?? readyItem.variables.value?.itemId) as string | undefined,
)
const isMutating = computed(() => startItem.isLoading.value || readyItem.isLoading.value)
</script>

<template>
  <div class="kds-page">
    <!-- Fila 1 — Toolbar full-bleed: buscador (izq) + acciones (der) -->
    <div class="scr-toolbar">
      <div class="kds-search">
        <UIcon name="i-lucide-search" />
        <input
          v-model="search"
          type="search"
          placeholder="Buscar comanda, mesa o plato…"
          aria-label="Buscar comanda, mesa o plato"
        >
      </div>
      <span
        v-if="lateCount"
        class="kds-late-badge"
        :aria-label="`${lateCount} comandas demoradas`"
      >
        <UIcon name="i-lucide-alarm-clock" /> {{ lateCount }} demorada{{ lateCount === 1 ? '' : 's' }}
      </span>
      <button
        class="kds-refresh"
        :class="{ spinning: isLoading }"
        aria-label="Actualizar cola"
        @click="refresh()"
      >
        <UIcon name="i-lucide-refresh-cw" />
      </button>
    </div>

    <div class="scr-body">
      <div class="scr-main">
        <!-- Fila 2 — Controles: chips de estación (izq) + resumen (der) -->
        <div class="kds-controls">
          <div class="kds-chips" role="tablist" aria-label="Filtrar por estación">
            <button
              v-for="st in stationTabs"
              :key="st.id || 'all'"
              role="tab"
              class="kds-chip"
              :class="{ active: stationId === st.id }"
              :aria-selected="stationId === st.id"
              @click="stationId = st.id"
            >
              {{ st.name }}
            </button>
          </div>
          <span v-if="!error" class="kds-count" aria-live="polite">
            <b>{{ tickets.length }}</b> en cola
          </span>
        </div>

        <!-- Error -->
        <div v-if="error" class="kds-state">
          <UiEmptyState
            icon="i-lucide-wifi-off"
            title="No se pudo cargar la cola"
            :subtitle="errorMessage(error, 'Revisa tu conexión e intenta de nuevo.')"
          >
            <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="refresh()">
              Reintentar
            </UButton>
          </UiEmptyState>
        </div>

        <!-- Vacío -->
        <div v-else-if="tickets.length === 0" class="kds-state">
          <UiEmptyState
            icon="i-lucide-utensils-crossed"
            title="Sin comandas en cola"
            subtitle="Los pedidos enviados a cocina aparecerán aquí en tiempo real."
          />
        </div>

        <!-- Comandas: una tarjeta por ticket (mesa + sus ítems) -->
        <div v-else class="kds-grid">
          <article
            v-for="t in tickets"
            :key="t.orderId"
            class="kds-ticket"
            :class="{ late: t.isLate, preparing: t.preparingCount > 0 }"
          >
            <header class="kds-ticket-head">
              <div class="kds-ticket-id">
                <span class="kds-table">{{ tableLabel(t.tableCode) }}</span>
                <span class="kds-ticket-count">{{ t.items.length }} ítem{{ t.items.length === 1 ? '' : 's' }}</span>
              </div>
              <span class="kds-wait" :class="{ late: t.isLate }">
                <UIcon name="i-lucide-clock" /> {{ waitLabel(t.waitMinutes) }}
              </span>
            </header>

            <ul class="kds-items">
              <li
                v-for="item in t.items"
                :key="item.orderItemId"
                class="kds-item"
                :class="item.status"
              >
                <span class="kds-item-dot" aria-hidden="true" />
                <span class="kds-item-qty">×{{ item.qty }}</span>

                <div class="kds-item-main">
                  <span class="kds-item-name">{{ item.dishName }}</span>
                  <div v-if="item.modifiers.length" class="kds-mods">
                    <span v-for="(m, i) in item.modifiers" :key="i" class="kds-mod">{{ m.name }}</span>
                  </div>
                  <p v-if="item.notes" class="kds-note">
                    <UIcon name="i-lucide-sticky-note" /> {{ item.notes }}
                  </p>
                </div>

                <button
                  v-if="item.status === 'pending'"
                  class="kds-item-action start"
                  :disabled="isMutating && pendingId === item.orderItemId"
                  :aria-label="`Iniciar ${item.dishName}`"
                  @click="onStart(item)"
                >
                  <UIcon name="i-lucide-flame" /> Iniciar
                </button>
                <button
                  v-else
                  class="kds-item-action ready"
                  :disabled="isMutating && pendingId === item.orderItemId"
                  :aria-label="`Marcar ${item.dishName} como listo`"
                  @click="onReady(item)"
                >
                  <UIcon name="i-lucide-check" /> Listo
                </button>
              </li>
            </ul>
          </article>
        </div>
      </div>

      <!-- Panel resumen: el lado derecho es intencional, no espacio muerto -->
      <aside class="scr-aside">
        <section class="scr-panel">
          <header class="scr-panel-head">
            <span class="scr-eyebrow">Resumen de cocina</span>
            <h3 class="scr-panel-title">
              {{ tickets.length }}<span class="scr-of"> {{ tickets.length === 1 ? 'comanda' : 'comandas' }}</span>
            </h3>
          </header>

          <!-- Distribución de la carga: en cola vs en preparación, de un vistazo -->
          <div
            class="kds-bar"
            role="img"
            :aria-label="`${pendingCount} en cola, ${preparingCount} en preparación`"
          >
            <span class="kds-seg s-pend" :style="{ flexGrow: pendingCount || 0.001 }" />
            <span class="kds-seg s-prep" :style="{ flexGrow: preparingCount || 0.001 }" />
          </div>

          <dl class="scr-stats">
            <div class="scr-stat">
              <dt><span class="kds-key-dot pend" />En cola</dt>
              <dd>{{ pendingCount }}</dd>
            </div>
            <div class="scr-stat">
              <dt><span class="kds-key-dot prep" />En preparación</dt>
              <dd>{{ preparingCount }}</dd>
            </div>
            <div class="scr-stat">
              <dt><span class="kds-key-dot late" />Demoradas</dt>
              <dd :class="{ danger: lateCount > 0 }">{{ lateCount }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Espera promedio</dt>
              <dd>{{ avgWait }}<span class="u">min</span></dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Full-width: el ancho lo da el layout (margin-left por el sidebar). El shell
   .scr-* (toolbar / body / main / aside / panel) viene de components.css. */
.kds-page { padding-top: 0; }

/* ===== Fila 1 — Toolbar: buscador (izq, empuja acciones) + acciones (der) ===== */
.kds-search {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 8px;
  background: var(--crema-100);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 0 11px;
  height: 36px;
  box-sizing: border-box;
}
/* Desktop: el buscador NO se estira; queda acotado a la izquierda y las acciones a la derecha */
@media (min-width: 640px) {
  .kds-search { flex: 0 0 340px; margin-right: auto; }
}
.kds-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.kds-search input {
  flex: 1; min-width: 0;
  border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.kds-search input::placeholder { color: var(--fg3); }
.kds-search > .iconify { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

/* ===== Fila 2 — Controles: chips de estación (izq) + resumen (der) ===== */
.kds-controls {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.kds-chips {
  flex: 1; min-width: 0;
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.kds-chips::-webkit-scrollbar { display: none; }
.kds-chip {
  flex-shrink: 0;
  font: inherit; font-size: 13px; font-weight: 500;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.kds-chip:hover { background: var(--crema-100); }
.kds-chip.active {
  background: var(--espresso); color: var(--crema-100);
  border-color: var(--espresso);
}

.kds-count {
  flex-shrink: 0;
  font-size: 12.5px; color: var(--fg3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.kds-count b {
  font-family: var(--font-serif);
  font-size: 17px; font-weight: 600; color: var(--fg1);
  margin-right: 2px;
}
.kds-late-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 700;
  color: var(--danger);
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  padding: 5px 10px; border-radius: 999px;
  white-space: nowrap;
}
.kds-late-badge .iconify { width: 14px; height: 14px; }

.kds-refresh {
  flex-shrink: 0;
  width: 36px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--crema-100);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--fg2);
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.kds-refresh:hover { background: var(--crema-200); color: var(--fg1); }
.kds-refresh .iconify { width: 17px; height: 17px; }
.kds-refresh.spinning .iconify { animation: kdsSpin 0.8s linear infinite; }
@keyframes kdsSpin { to { transform: rotate(360deg); } }

/* ===== Estados (error / vacío) ===== */
.kds-state { padding: 8px 0 24px; }

/* ===== Grilla de comandas: auto-fill para no estirar una tarjeta suelta ===== */
.kds-grid {
  display: grid;
  /* min(100%, 320px) evita overflow horizontal en pantallas angostas */
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 14px;
  align-content: start;
}

/* ===== Tarjeta = una comanda (ticket) ===== */
.kds-ticket {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px 15px 13px;
  display: flex; flex-direction: column; gap: 11px;
  transition:
    border-color var(--dur) var(--ease-standard),
    box-shadow var(--dur) var(--ease-standard);
}
.kds-ticket:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }
/* Hay algo cocinándose: borde mostaza tenue (una sola señal) */
.kds-ticket.preparing { border-color: rgba(214, 158, 46, 0.5); }
/* Demorada (>10 min): resaltado danger contenido (borde + wash), sin gritar de más */
.kds-ticket.late {
  border-color: var(--danger);
  background: linear-gradient(160deg, var(--pure-white) 0%, #FBEBE9 130%);
}

.kds-ticket-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--border-subtle);
}
.kds-ticket-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kds-table {
  font-family: var(--font-serif);
  font-size: 18px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--fg1);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.kds-ticket-count {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg3);
}
.kds-wait {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  color: var(--fg3);
  font-variant-numeric: tabular-nums;
}
.kds-wait .iconify { width: 12px; height: 12px; }
/* Demorada: el tiempo GRITA — pill danger, una sola señal funcional */
.kds-wait.late {
  color: var(--danger); font-weight: 700;
  background: var(--danger-bg);
  padding: 3px 8px; border-radius: 999px;
}

/* ===== Ítems de la comanda ===== */
.kds-items {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.kds-item {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
}
.kds-item:first-child { border-top: none; }
.kds-item-dot {
  flex-shrink: 0;
  width: 7px; height: 7px; border-radius: 50%;
  margin-top: 7px;
  background: var(--border-strong);
}
.kds-item.pending .kds-item-dot { background: var(--info); }
.kds-item.preparing .kds-item-dot { background: var(--mostaza); }
.kds-item-qty {
  flex-shrink: 0;
  margin-top: 1px;
  font-family: var(--font-mono);
  font-size: 14px; font-weight: 700;
  color: var(--terracotta-700);
}
.kds-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.kds-item-name {
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--fg1); line-height: 1.25;
}
.kds-mods { display: flex; flex-wrap: wrap; gap: 5px; }
.kds-mod {
  font-size: 11px; font-weight: 500;
  color: var(--fg2);
  background: var(--crema-200);
  border-radius: 999px;
  padding: 2px 8px;
}
.kds-note {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: var(--espresso-600);
  background: var(--warning-bg);
  border: 1px solid var(--mostaza);
  border-radius: 8px;
  padding: 6px 8px;
  margin: 0;
}
.kds-note .iconify { width: 12px; height: 12px; flex-shrink: 0; margin-top: 1px; }

.kds-item-action {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  font: inherit; font-size: 12.5px; font-weight: 600;
  min-width: 84px; min-height: 36px;
  padding: 7px 12px;
  border-radius: 10px;
  border: none; cursor: pointer;
  transition: background var(--dur) var(--ease-standard), transform 80ms;
}
.kds-item-action:active { transform: scale(0.97); }
.kds-item-action:disabled { opacity: 0.55; cursor: not-allowed; }
.kds-item-action .iconify { width: 14px; height: 14px; }
.kds-item-action.start { background: var(--mostaza); color: var(--espresso); }
.kds-item-action.start:hover:not(:disabled) { background: var(--mostaza-700); color: var(--crema-100); }
.kds-item-action.ready { background: var(--success); color: var(--crema-100); }
.kds-item-action.ready:hover:not(:disabled) { background: var(--oliva-700); }

/* ===== Panel resumen: barra de distribución + leyenda ===== */
.kds-bar { display: flex; gap: 3px; height: 9px; margin-bottom: 14px; }
.kds-seg {
  border-radius: 999px; min-width: 4px;
  transition: flex-grow var(--dur-slow) var(--ease-emphasis);
}
.kds-seg.s-pend { background: var(--info); }
.kds-seg.s-prep { background: var(--mostaza); }

.scr-stat dt { display: inline-flex; align-items: center; gap: 8px; }
.kds-key-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.kds-key-dot.pend { background: var(--info); }
.kds-key-dot.prep { background: var(--mostaza); }
.kds-key-dot.late { background: var(--danger); }

@media (prefers-reduced-motion: reduce) {
  .kds-refresh.spinning .iconify { animation: none; }
  .kds-seg { transition: none; }
}
</style>
