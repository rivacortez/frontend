<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import type { KitchenQueueItem } from '~/composables/use-kitchen'

// HU-03-07/08/09 · KDS (Kitchen Display). Pantalla nueva (el prototipo no la
// tenía). Cocineros = staff; sin gating extra (todos pueden leer/patch Kitchen).
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Cocina (KDS) — GastronomIA' })

definePageHeader(() => ({
  title: 'Cocina',
  subtitle: 'KDS · pedidos en cola',
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
// El backend ya ordena por sentToKitchenAt asc (FIFO = mayor espera primero);
// reordenamos por waitMinutes desc por robustez ante variaciones de reloj.
const sorted = computed(() => [...items.value].sort((a, b) => b.waitMinutes - a.waitMinutes))
const lateCount = computed(() => items.value.filter(i => i.isLate).length)

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
  <div class="kds-screen">
    <ClientOnly>
      <Teleport to="#topbar-actions">
        <span v-if="lateCount" class="kds-late-badge" :aria-label="`${lateCount} pedidos demorados`">
          <UIcon name="i-lucide-alarm-clock" /> {{ lateCount }} demorado{{ lateCount === 1 ? '' : 's' }}
        </span>
        <button
          class="icon-btn"
          :class="{ spinning: isLoading }"
          aria-label="Actualizar cola"
          @click="refresh()"
        >
          <UIcon name="i-lucide-refresh-cw" />
        </button>
      </Teleport>
    </ClientOnly>

    <!-- Selector de estación -->
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

    <!-- Error -->
    <UiEmptyState
      v-if="error"
      icon="i-lucide-wifi-off"
      title="No se pudo cargar la cola"
      :subtitle="errorMessage(error, 'Revisa tu conexión e intenta de nuevo.')"
    >
      <UButton color="neutral" variant="subtle" icon="i-lucide-refresh-cw" @click="refresh()">
        Reintentar
      </UButton>
    </UiEmptyState>

    <!-- Vacío -->
    <UiEmptyState
      v-else-if="sorted.length === 0"
      icon="i-lucide-utensils-crossed"
      title="Sin pedidos en cola"
      subtitle="Los ítems enviados a cocina aparecerán aquí en tiempo real."
    />

    <!-- Cola -->
    <div v-else class="kds-grid">
      <article
        v-for="item in sorted"
        :key="item.orderItemId"
        class="kds-card"
        :class="{ late: item.isLate, preparing: item.status === 'preparing' }"
      >
        <div class="kds-card-top">
          <span class="kds-table">{{ tableLabel(item.tableCode) }}</span>
          <span class="kds-wait" :class="{ late: item.isLate }">
            <UIcon name="i-lucide-clock" /> {{ waitLabel(item.waitMinutes) }}
          </span>
        </div>

        <div class="kds-dish">
          <span class="kds-dish-name">{{ item.dishName }}</span>
          <span class="kds-qty">×{{ item.qty }}</span>
        </div>

        <div v-if="item.modifiers.length" class="kds-mods">
          <span v-for="(m, i) in item.modifiers" :key="i" class="kds-mod">{{ m.name }}</span>
        </div>

        <p v-if="item.notes" class="kds-notes">
          <UIcon name="i-lucide-sticky-note" /> {{ item.notes }}
        </p>

        <div class="kds-status-row">
          <span class="kds-status" :class="item.status">
            <span class="dot" />
            {{ item.status === 'preparing' ? 'En preparación' : 'Pendiente' }}
          </span>
        </div>

        <div class="kds-actions">
          <button
            v-if="item.status === 'pending'"
            class="kds-btn start"
            :disabled="isMutating && pendingId === item.orderItemId"
            @click="onStart(item)"
          >
            <UIcon name="i-lucide-flame" /> Iniciar
          </button>
          <button
            v-else
            class="kds-btn ready"
            :disabled="isMutating && pendingId === item.orderItemId"
            @click="onReady(item)"
          >
            <UIcon name="i-lucide-check" /> Listo
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.kds-screen {
  max-width: 1100px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}
@media (min-width: 1024px) {
  .kds-screen { padding-top: 28px; }
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

.icon-btn.spinning .iconify { animation: kdsSpin 0.8s linear infinite; }
@keyframes kdsSpin { to { transform: rotate(360deg); } }

/* Chips de estación (mismo lenguaje que los chips del POS) */
.kds-chips {
  padding: 0 20px 16px;
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.kds-chips::-webkit-scrollbar { display: none; }
.kds-chip {
  font: inherit; font-size: 13px; font-weight: 500;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.kds-chip.active {
  background: var(--espresso); color: var(--crema-100);
  border-color: var(--espresso);
}

/* Grid de tarjetas */
.kds-grid {
  padding: 0 20px 24px;
  display: grid; grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 640px) {
  .kds-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .kds-grid { grid-template-columns: repeat(3, 1fr); }
}

.kds-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
  position: relative;
}
.kds-card.preparing {
  border-color: var(--mostaza);
  box-shadow: 0 0 0 2px rgba(214, 158, 46, 0.12);
}
/* Demorado (>10 min): resaltado rojo */
.kds-card.late {
  border-color: var(--danger);
  background: linear-gradient(160deg, var(--pure-white) 0%, #FBEBE9 100%);
  box-shadow: 0 0 0 2px rgba(179, 58, 42, 0.16);
}

.kds-card-top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
}
.kds-table {
  font-size: 15px; font-weight: 700;
  color: var(--fg1);
}
.kds-wait {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  color: var(--fg3);
  font-variant-numeric: tabular-nums;
}
.kds-wait .iconify { width: 12px; height: 12px; }
.kds-wait.late { color: var(--danger); }

.kds-dish {
  display: flex; align-items: baseline; gap: 8px;
}
.kds-dish-name {
  font-size: 17px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--fg1); line-height: 1.2;
}
.kds-qty {
  font-size: 15px; font-weight: 700;
  color: var(--terracotta-700);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.kds-mods {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.kds-mod {
  font-size: 11px; font-weight: 500;
  color: var(--fg2);
  background: var(--crema-200);
  border-radius: 999px;
  padding: 3px 9px;
}

.kds-notes {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12.5px; color: var(--espresso-600);
  background: var(--warning-bg);
  border: 1px solid var(--mostaza);
  border-radius: 8px;
  padding: 7px 9px;
  margin: 0;
}
.kds-notes .iconify { width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }

.kds-status-row { display: flex; }
.kds-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
  padding: 4px 9px;
  border-radius: 999px;
}
.kds-status .dot { width: 6px; height: 6px; border-radius: 50%; }
.kds-status.pending { background: var(--info-bg); color: var(--info); }
.kds-status.pending .dot { background: var(--info); }
.kds-status.preparing { background: var(--warning-bg); color: var(--mostaza-700); }
.kds-status.preparing .dot { background: var(--mostaza); }

.kds-actions { margin-top: auto; }
.kds-btn {
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  font: inherit; font-size: 14px; font-weight: 600;
  padding: 11px 12px;
  border-radius: 11px;
  border: none; cursor: pointer;
  transition: background var(--dur) var(--ease-standard), transform 80ms;
}
.kds-btn:active { transform: scale(0.98); }
.kds-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.kds-btn .iconify { width: 16px; height: 16px; }
.kds-btn.start { background: var(--mostaza); color: var(--espresso); }
.kds-btn.start:hover:not(:disabled) { background: var(--mostaza-700); color: var(--crema-100); }
.kds-btn.ready { background: var(--success); color: var(--crema-100); }
.kds-btn.ready:hover:not(:disabled) { background: var(--oliva-700); }
</style>
