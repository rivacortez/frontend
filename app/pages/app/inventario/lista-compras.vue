<script setup lang="ts">
import type { ForecastShoppingItem } from '#shared/types/domain'

definePageMeta({ layout: 'app', middleware: 'require-manager' })
useSeoMeta({ title: 'Lista de Compras — GastronomIA' })

// Widget A: the shopping list is now seeded from the demand forecast (E08 / core-ai)
// instead of from stock alerts. `needsForecast` must be surfaced as an explicit empty
// state — never silently show zero items as "nothing to buy".
const { suggestions, refresh, horizon, needsForecast, drivers, contextStatus } = useForecastShoppingSuggestions()

// F2a · "S/ en riesgo esta semana" — segunda consulta al mismo endpoint con un
// horizonte de 7 días (real "esta semana"), distinto del horizonte de la lista
// de compras (`horizon`, 14 días por defecto). Reusar la consulta de 14 días
// y llamarla "esta semana" sería incorrecto — el backend no da un desglose
// diario dentro de un horizonte, así que la única forma honesta de aislar la
// ventana semanal es pedirla explícitamente.
const RISK_HORIZON_DAYS = 7
const risk = useForecastShoppingSuggestions(RISK_HORIZON_DAYS)
// Se usa la data cruda (no el `suggestions` fusionado con el overlay de
// "marcado"): el riesgo financiero de esta semana es un dato operativo — no
// debe desaparecer solo porque el usuario tildó el ítem en su checklist local
// sin haber comprado todavía.
const riskItems = computed(() => risk.data.value?.suggestions ?? [])
const atRiskTotal = computed(() => riskItems.value.reduce((s, i) => s + i.shortfallCost, 0))
const riskReady = computed(() => !risk.needsForecast.value && !!risk.data.value)

const patchItem = usePatchShoppingItem()
const createMovement = useCreateMovement()
const clearPurchased = useClearPurchased()
const toast = useToast()

const expanded = ref<string | null>(null)
const registering = ref(false)

const list = computed(() => suggestions.value)
const pending = computed(() => list.value.filter(i => !i.checked))
const checked = computed(() => list.value.filter(i => i.checked))
const total = computed(() => pending.value.reduce((s, i) => s + i.estimatedCost, 0))
const urgentCount = computed(() => pending.value.filter(i => i.urgent).length)
// NOTE: AI savings estimate de-scoped (requires supplier price comparison E05-b).

// HU-08-07 (fase 3) · Franja de contexto del forecast: los factores exógenos
// (feriados, eventos gastronómicos, clima, quincena, fines de semana) que
// explican los shortfalls de abajo. `off` → el run no pidió contexto (no
// debería pasar en corridas de negocio); se oculta la franja por completo en
// vez de mostrar una nota confusa sobre algo que nunca se pidió.
const showDriversStrip = computed(() =>
  !needsForecast.value && contextStatus.value !== null && contextStatus.value !== 'off',
)
const showWeatherDownNote = computed(() => contextStatus.value === 'calendar_only')

const dateLabel = computed(() => {
  const label = new Intl.DateTimeFormat('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Lima',
  }).format(new Date())
  return `HOY · ${label.toUpperCase()}`
})

async function toggle(id: string, value: boolean): Promise<void> {
  await patchItem.mutateAsync({ id, checked: value })
}

async function registerPurchases(): Promise<void> {
  if (checked.value.length === 0 || registering.value) return
  registering.value = true
  try {
    const purchased = [...checked.value]
    const failedNames: string[] = []
    const succeededIds: string[] = []

    // Process each item individually so a single failure does not abort the whole batch.
    for (const item of purchased) {
      try {
        await createMovement.mutateAsync({
          ingredientId: item.ingredientId,
          type: 'purchase',
          qty: item.suggestedQty,
          note: 'Compra desde lista',
        })
        succeededIds.push(item.ingredientId)
      }
      catch {
        failedNames.push(item.name)
      }
    }

    if (succeededIds.length > 0) {
      // La lista no se persiste: limpiamos el estado local de los ítems procesados.
      clearPurchased(succeededIds)
      const n = succeededIds.length
      toast.add({
        title: `${n} compra${n > 1 ? 's' : ''} registrada${n > 1 ? 's' : ''} en inventario`,
        icon: 'i-lucide-check-circle-2',
      })
      await refresh()
    }

    if (failedNames.length > 0) {
      toast.add({
        title: 'Algunos ítems no se pudieron registrar',
        description: failedNames.join(', '),
        color: 'warning',
      })
    }
    else {
      // All items succeeded — leave the screen.
      await navigateTo('/app/inventario')
    }
  }
  finally {
    registering.value = false
  }
}

function share(): void {
  const lines = pending.value.map(i => `• ${i.name} — ${i.suggestedQty} ${i.unit} (~${formatPEN(i.estimatedCost)})`)
  const text = `Lista de compras Motif:\n${lines.join('\n')}\nTotal: ${formatPEN(total.value)}`
  if (navigator.share) {
    void navigator.share({ title: 'Lista de Compras', text })
  }
  else {
    void navigator.clipboard.writeText(text)
    toast.add({ title: 'Lista copiada al portapapeles', icon: 'i-lucide-clipboard-check' })
  }
}
</script>

<template>
  <div class="sl-screen">
    <UiScreenHeader title="Lista de Compras" :subtitle="dateLabel" back="/app/inventario">
      <template #trailing>
        <UButton icon="i-lucide-share-2" color="neutral" variant="outline" size="sm" aria-label="Compartir lista" @click="share" />
      </template>
    </UiScreenHeader>

    <!-- Contexto del forecast (HU-08-07 fase 3): factores que explican la demanda proyectada -->
    <section v-if="showDriversStrip" class="sl-drivers" aria-label="Factores que influyen en el pronóstico">
      <ForecastDriverChips :drivers="drivers" :max-chips="4" />
      <p v-if="showWeatherDownNote" class="sl-drivers-note">
        <UIcon name="i-lucide-cloud-off" aria-hidden="true" />
        Pronóstico sin datos de clima
      </p>
    </section>

    <!-- F2a · Dinero en riesgo esta semana: costo de reposición del déficit de
         stock proyectado a 7 días — distinto del "Total estimado" de abajo
         (que cubre el horizonte completo de la lista, {{ horizon }} días). -->
    <section class="sl-risk" aria-label="Dinero en riesgo esta semana">
      <div v-if="riskReady && atRiskTotal > 0" class="sl-risk-body">
        <span class="sl-risk-ico" aria-hidden="true"><UIcon name="i-lucide-trending-down" /></span>
        <div class="sl-risk-text">
          <span class="sl-risk-headline">
            <span class="sl-risk-amount">{{ formatPEN(atRiskTotal) }}</span>
            <span class="sl-risk-label">en riesgo esta semana</span>
          </span>
          <span class="sl-risk-note">
            Costo de reposición para cubrir el déficit de stock proyectado en los próximos {{ RISK_HORIZON_DAYS }} días — no es una estimación de ventas perdidas.
          </span>
        </div>
      </div>
      <p v-else-if="riskReady" class="sl-risk-ok">
        <UIcon name="i-lucide-check-circle-2" aria-hidden="true" /> Sin riesgo de stock proyectado esta semana.
      </p>
      <p v-else-if="risk.isLoading.value" class="sl-risk-status">Calculando riesgo de esta semana…</p>
      <p v-else-if="risk.error.value" class="sl-risk-status">
        No se pudo calcular el riesgo de esta semana.
        <button type="button" class="sl-risk-retry" @click="risk.refresh()">Reintentar</button>
      </p>
    </section>

    <!-- Resumen -->
    <section class="sl-summary" aria-label="Resumen de la lista">
      <div class="sl-sum-eyebrow">
        <span class="dot" aria-hidden="true" />
        Plan de hoy
      </div>
      <div class="sl-sum-grid">
        <div class="sl-sum-cell">
          <div class="lbl">Total estimado</div>
          <div class="val">{{ formatPEN(total) }}</div>
        </div>
        <div class="sl-sum-cell">
          <div class="lbl">Ítems</div>
          <div class="val">{{ pending.length }}</div>
        </div>
        <div class="sl-sum-cell">
          <div class="lbl">Urgentes</div>
          <div class="val urgent">{{ urgentCount }}</div>
        </div>
      </div>
      <div class="sl-sum-foot">
        <span class="robot" aria-hidden="true"><UIcon name="i-lucide-brain-circuit" /></span>
        <span>Lista sugerida por el forecast de demanda (próximos {{ horizon }} días)</span>
      </div>
    </section>

    <!-- Pendientes -->
    <section class="sl-section" aria-label="Por comprar">
      <div class="sl-section-title">Por comprar <span class="count">{{ pending.length }}</span></div>
      <div v-if="pending.length" class="sl-list">
        <div
          v-for="item in (pending as ForecastShoppingItem[])"
          :key="item.id"
          class="sl-item"
          role="button"
          tabindex="0"
          @click="expanded = expanded === item.id ? null : item.id"
        >
          <button
            class="sl-check"
            :aria-label="`Marcar ${item.name} como comprado`"
            @click.stop="toggle(item.id, true)"
          >
            <UIcon name="i-lucide-check" />
          </button>
          <div class="sl-item-body">
            <span class="sl-item-name">
              {{ item.name }}
              <span v-if="item.urgent" class="sl-urgent">Urgente</span>
            </span>
            <span class="sl-item-qty">{{ item.suggestedQty }} {{ item.unit }}</span>
          </div>
          <div class="sl-item-price">{{ formatPEN(item.estimatedCost) }}</div>
          <div v-if="expanded === item.id" class="sl-item-detail" @click.stop>
            <div class="row"><span>Stock actual</span><span class="v">{{ item.currentStock }} {{ item.unit }}</span></div>
            <div class="row"><span>Déficit forecast</span><span class="v">{{ item.shortfall }} {{ item.unit }}</span></div>
            <div class="row"><span>Cantidad sugerida</span><span class="v">{{ item.suggestedQty }} {{ item.unit }}</span></div>
            <div class="row"><span>Costo estimado</span><span class="v">{{ formatPEN(item.estimatedCost) }}</span></div>
            <NuxtLink :to="`/app/inventario/producto/${item.ingredientId}`" class="sl-detail-link">
              Ver insumo <UIcon name="i-lucide-arrow-right" />
            </NuxtLink>
          </div>
        </div>
      </div>
      <!-- needsForecast: the core-ai service has no completed run yet -->
      <UiEmptyState
        v-else-if="needsForecast"
        icon="i-lucide-bar-chart-2"
        title="Forecast no disponible"
        subtitle="Aún no hay un análisis de demanda completado. Ejecuta el forecast para obtener sugerencias de compra."
      />
      <UiEmptyState
        v-else
        icon="i-lucide-shopping-cart"
        title="Nada por comprar"
        subtitle="El forecast no detecta faltantes para los próximos días."
      />
    </section>

    <!-- Comprados -->
    <section v-if="checked.length" class="sl-section" aria-label="Comprados">
      <div class="sl-section-title done">Comprados <span class="count">{{ checked.length }}</span></div>
      <div class="sl-list">
        <div v-for="item in checked" :key="item.id" class="sl-item done">
          <button
            class="sl-check checked"
            :aria-label="`Desmarcar ${item.name}`"
            @click.stop="toggle(item.id, false)"
          >
            <UIcon name="i-lucide-check" />
          </button>
          <div class="sl-item-body">
            <span class="sl-item-name">{{ item.name }}</span>
            <span class="sl-item-qty">{{ item.suggestedQty }} {{ item.unit }}</span>
          </div>
          <div class="sl-item-price">{{ formatPEN(item.estimatedCost) }}</div>
        </div>
      </div>
      <button class="btn btn-dark btn-lg btn-block sl-register" :disabled="registering" @click="registerPurchases">
        <UIcon name="i-lucide-package-check" />
        Registrar {{ checked.length }} compra{{ checked.length > 1 ? 's' : '' }} en inventario
      </button>
    </section>
  </div>
</template>

<style scoped>
.sl-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.sl-drivers {
  margin: 0 20px 16px;
}
.sl-drivers-note {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: var(--fg2);
  margin: 8px 2px 0;
}
.sl-drivers-note .iconify { width: 13px; height: 13px; flex-shrink: 0; }

/* F2a · "S/ en riesgo esta semana" — misma escala/gutter que .sl-drivers para
   leerse como parte de la misma franja narrativa (drivers → riesgo → plan). */
.sl-risk { margin: 0 20px 16px; }
.sl-risk-body {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
}
.sl-risk-ico {
  width: 30px; height: 30px; border-radius: 9px;
  /* Mismo par de tokens que `.sl-sum-foot .robot` más abajo — un solo acento
     tintado reutilizado en toda la pantalla, no uno nuevo por widget. */
  background: var(--terracotta-100); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sl-risk-ico .iconify { width: 16px; height: 16px; }
.sl-risk-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sl-risk-headline { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.sl-risk-amount {
  font-family: var(--font-serif); font-style: italic; font-weight: 600;
  font-size: 21px; color: var(--fg1); letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.sl-risk-label { font-size: 12.5px; font-weight: 600; color: var(--fg2); }
.sl-risk-note { font-size: 11.5px; color: var(--fg3); line-height: 1.45; }
.sl-risk-ok, .sl-risk-status {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--fg3);
  padding: 2px 2px;
}
.sl-risk-ok .iconify { width: 14px; height: 14px; color: var(--oliva-700); flex-shrink: 0; }
.sl-risk-retry {
  font: inherit; font-size: 12px; font-weight: 600; color: var(--terracotta-700);
  background: none; border: none; text-decoration: underline; cursor: pointer; padding: 0;
}

.sl-summary {
  margin: 0 20px 20px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px;
}
.sl-sum-eyebrow {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  margin-bottom: 10px;
}
.sl-sum-eyebrow .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--oliva);
}
.sl-sum-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sl-sum-cell {
  background: var(--crema-100);
  border-radius: 10px;
  padding: 8px 10px;
}
.sl-sum-cell .lbl { font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg3); }
.sl-sum-cell .val {
  font-size: 15px; font-weight: 600; color: var(--fg1);
  letter-spacing: -0.01em;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.sl-sum-cell .val.urgent { color: var(--danger); }
/* NOTE: .sl-sum-cell.savings removed — AI savings estimate de-scoped (E05-b). */
.sl-sum-foot {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 11.5px; color: var(--fg3);
  margin-top: 10px;
  line-height: 1.4;
}
.sl-sum-foot .robot {
  width: 20px; height: 20px; border-radius: 6px;
  background: var(--terracotta-100); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sl-sum-foot .robot .iconify { width: 12px; height: 12px; }

.sl-section { padding: 0 20px; margin-bottom: 20px; }
.sl-section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 600; color: var(--fg1);
  margin-bottom: 10px;
}
.sl-section-title.done { color: var(--fg3); }
.sl-section-title .count {
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 600;
  background: var(--crema-200); color: var(--fg2);
  padding: 2px 8px; border-radius: 999px;
}

.sl-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.sl-item {
  display: flex; align-items: center; gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard);
}
.sl-item:last-child { border-bottom: none; }
.sl-item:hover { background: var(--crema-50); }
.sl-item.done { opacity: 0.6; }
.sl-item.done .sl-item-name { text-decoration: line-through; }
/* área de toque ≥40px sin agrandar el control visible */
.sl-check::after { content: ''; position: absolute; inset: -7px; }
.sl-check {
  position: relative;
  width: 26px; height: 26px; border-radius: 8px;
  border: 1.5px solid var(--border);
  background: transparent;
  color: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.sl-check:hover { border-color: var(--oliva); }
.sl-check.checked, .sl-check:active { background: var(--oliva); border-color: var(--oliva); color: var(--crema-100); }
.sl-check .iconify { width: 14px; height: 14px; }
.sl-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sl-item-name {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.sl-urgent {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--danger-bg); color: var(--danger);
  padding: 2px 6px; border-radius: 999px;
}
.sl-item-qty { font-size: 12px; color: var(--fg3); }
.sl-item-price {
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.sl-item-detail {
  flex-basis: 100%;
  background: var(--crema-100);
  border-radius: 10px;
  padding: 10px 12px;
  margin-top: 4px;
}
.sl-item-detail .row {
  display: flex; justify-content: space-between;
  font-size: 12px; color: var(--fg3);
  padding: 2px 0;
}
.sl-item-detail .row .v { color: var(--fg1); font-weight: 500; text-align: right; max-width: 60%; }
.sl-detail-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  color: var(--terracotta-700);
  text-decoration: none;
  margin-top: 6px;
}
.sl-detail-link .iconify { width: 12px; height: 12px; }
.sl-register { margin-top: 12px; }
</style>
