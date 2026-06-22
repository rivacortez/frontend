<script setup lang="ts">
import type { RecipeItem } from '#shared/types/domain'

definePageMeta({ layout: 'app' })

const route = useRoute()
const toast = useToast()

const recipeId = computed(() => String(route.params.id))
const { data: recipe } = useRecipe(recipeId)

useSeoMeta({ title: () => `${recipe.value?.name ?? 'Receta'} — GastronomIA` })

const { mutateAsync: updateRecipe, isLoading: updating } = useUpdateRecipe()
const { mutateAsync: deleteRecipe, isLoading: deleting } = useDeleteRecipe()

/* ===== Derivados de costeo ===== */
const grossCost = computed(() =>
  +(recipe.value?.items.reduce((a, it) => a + it.cost, 0) ?? 0).toFixed(2))
const wasteCost = computed(() =>
  +Math.max(0, (recipe.value?.cost ?? 0) - grossCost.value).toFixed(2))
const isEstimated = computed(() => recipe.value?.items.some(it => it.cost === 0) ?? false)
const gain = computed(() => (recipe.value?.sellPrice ?? 0) - (recipe.value?.cost ?? 0))

function marginBucket(m: number): string {
  if (m < 20) return 'low'
  if (m <= 30) return 'mid'
  return 'high'
}
const bucket = computed(() => marginBucket(recipe.value?.marginPct ?? 0))

const fmt = (v: number): string => v.toFixed(2)
const fmtInt = (v: number): string => v.toLocaleString('es-PE')

function itemQtyLabel(it: RecipeItem): string {
  if (it.unit === 'kg' && it.qty < 1) return `${Math.round(it.qty * 1000)} g`
  if (it.unit === 'L' && it.qty < 1) return `${Math.round(it.qty * 1000)} ml`
  return `${it.qty} ${it.unit}`
}
function itemNet(it: RecipeItem): number {
  return it.cost * (1 + it.wastePct / 100)
}
/** Alerta mock alineada a la historia del Home (Limón Sutil +30 %). */
function itemAlert(it: RecipeItem): string | null {
  return it.ingredientId === 'ing-01' ? 'Subió 30% esta semana' : null
}

/* ===== Tendencia (mock visual, sin histórico real) ===== */
const isDish = computed(() => recipe.value?.kind !== 'sub_recipe')
// HU-02-10: el plato se marca "en riesgo" cuando el margen cae por debajo de 25%.
const isAtRisk = computed(() => isDish.value && (recipe.value?.marginPct ?? 0) < 25)
const marginPrev = computed(() => {
  const m = recipe.value?.marginPct ?? 0
  return isAtRisk.value ? m + 8 : Math.max(0, m - 3)
})
const trendSeries = computed<number[]>(() => {
  const from = marginPrev.value
  const to = recipe.value?.marginPct ?? 0
  const steps = 13
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return +(from + (to - from) * (t ** 1.4)).toFixed(1)
  })
})
const chartW = 320
const chartH = 60
const chartPoints = computed<[number, number][]>(() => {
  const s = trendSeries.value
  const pad = 4
  const min = Math.min(...s) - 2
  const max = Math.max(...s) + 2
  const stepX = (chartW - pad * 2) / (s.length - 1)
  return s.map((v, i) => [pad + i * stepX, pad + (1 - (v - min) / (max - min)) * (chartH - pad * 2)])
})
const chartPath = computed(() =>
  chartPoints.value.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' '))
const chartArea = computed(() => {
  const pts = chartPoints.value
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (!first || !last) return ''
  return `${chartPath.value} L${last[0]},${chartH - 4} L${first[0]},${chartH - 4} Z`
})
const chartLast = computed(() => chartPoints.value[chartPoints.value.length - 1] ?? [0, 0])
const trendColor = computed(() => (isAtRisk.value ? 'var(--danger)' : 'var(--oliva-700)'))

/* ===== Rendimiento (mock derivado) ===== */
const units30d = computed(() => (recipe.value?.soldToday ?? 0) * 28)
const revenue30d = computed(() => Math.round(units30d.value * (recipe.value?.sellPrice ?? 0)))
const profit30d = computed(() => Math.round(units30d.value * gain.value))

/* ===== Recomendación IA ===== */
const showAi = computed(() =>
  !!recipe.value && isDish.value && recipe.value.marginPct < 30 && recipe.value.cost > 0)
const suggestedPrice = computed(() => {
  const cost = recipe.value?.cost ?? 0
  return Math.round(cost / (1 - 0.26))
})
const suggestedMargin = computed(() => {
  const p = suggestedPrice.value
  const cost = recipe.value?.cost ?? 0
  return p > 0 ? Math.round(((p - cost) / p) * 100) : 0
})
const districtAvg = computed(() => Math.round(suggestedPrice.value * 1.175))
const pctBelow = computed(() =>
  districtAvg.value > 0 ? Math.round((1 - suggestedPrice.value / districtAvg.value) * 100) : 0)

const hasLimonAlert = computed(() =>
  isAtRisk.value && (recipe.value?.items.some(it => it.ingredientId === 'ing-01') ?? false))

/* ===== Sheets ===== */
const showAnalysis = ref(false)
const showDelete = ref(false)
const showEdit = ref(false)

/* Editar precio + activo */
const editPrice = ref('')
const editActive = ref(true)

function openEdit(presetPrice?: number): void {
  if (!recipe.value) return
  editPrice.value = (presetPrice ?? recipe.value.sellPrice).toFixed(2)
  editActive.value = recipe.value.active
  showEdit.value = true
}

const editPriceNum = computed(() => Number.parseFloat(editPrice.value) || 0)
const editMargin = computed(() => {
  const p = editPriceNum.value
  const cost = recipe.value?.cost ?? 0
  return p > 0 ? Math.round(((p - cost) / p) * 100) : 0
})
const canSaveEdit = computed(() => editPriceNum.value > 0 && !updating.value)

async function saveEdit(): Promise<void> {
  if (!recipe.value || !canSaveEdit.value) return
  await updateRecipe({
    id: recipe.value.id,
    sellPrice: +editPriceNum.value.toFixed(2),
    active: editActive.value,
  })
  showEdit.value = false
  toast.add({ title: 'Receta actualizada', icon: 'i-lucide-check-circle-2' })
}

function applySuggestion(): void {
  showAnalysis.value = false
  openEdit(suggestedPrice.value)
}

/* Eliminar */
const DELETE_REASONS = [
  { id: 'descontinuado', label: 'Plato descontinuado' },
  { id: 'error', label: 'Fue un error' },
  { id: 'temporada', label: 'Fuera de temporada' },
  { id: 'otro', label: 'Otro motivo' },
]
const deleteReason = ref<string | null>(null)

async function confirmDelete(): Promise<void> {
  if (!recipe.value || !deleteReason.value || deleting.value) return
  const { id, name } = recipe.value
  showDelete.value = false
  // Navegar antes de borrar: si no, la invalidación refetchea este detalle
  // ya eliminado (404) y rechaza la mutación aunque el DELETE fue exitoso.
  await navigateTo('/app/recetas')
  try {
    await deleteRecipe(id)
    toast.add({ title: `${name} eliminado del menú`, icon: 'i-lucide-trash-2' })
  }
  catch {
    toast.add({ title: 'No se pudo eliminar la receta', icon: 'i-lucide-alert-triangle' })
  }
}

watch(showDelete, (open) => {
  if (open) deleteReason.value = null
})
</script>

<template>
  <div class="rd-page">
    <template v-if="recipe">
      <!-- ============ Header ============ -->
      <UiScreenHeader :title="recipe.name" back="/app/recetas">
        <template #trailing>
          <button class="rd-edit" aria-label="Editar receta" @click="openEdit()">
            <UIcon name="i-lucide-pencil" /> Editar
          </button>
        </template>
      </UiScreenHeader>

      <!-- ============ Hero ============ -->
      <section class="rd-hero" aria-label="Resumen del plato">
        <div class="rd-hero-img" aria-hidden="true">
          <span class="emoji">{{ recipe.emoji ?? '🍽️' }}</span>
          <span class="placeholder-tag">Foto del plato</span>
        </div>
        <div class="rd-hero-body">
          <div>
            <div class="rd-hero-cat">{{ recipe.category }}</div>
            <h2 class="rd-hero-name">{{ recipe.name }}</h2>
            <div class="rd-hero-price">
              <span class="currency">S/</span>
              <span class="value">{{ fmt(recipe.sellPrice) }}</span>
            </div>
            <div class="rd-hero-note">Precio de carta · IGV incluido</div>
            <div class="rd-hero-cost">Costo: <b>S/ {{ fmt(recipe.cost) }}</b></div>
            <div v-if="!recipe.active" class="rd-inactive">
              <UIcon name="i-lucide-eye-off" /> Inactivo en la carta
            </div>
          </div>
          <div class="rd-margin-block">
            <div class="rd-margin-big" :class="bucket">
              {{ recipe.marginPct }}<span class="pct">%</span>
            </div>
            <span v-if="isEstimated" class="rd-est-tag" title="Algunos insumos sin costo registrado">
              <UIcon name="i-lucide-info" /> Margen estimado
            </span>
            <span
              v-if="isAtRisk"
              class="rd-trend"
              :aria-label="`Bajó de ${marginPrev}% a ${recipe.marginPct}% en 30 días`"
            >
              <UIcon name="i-lucide-trending-down" />
              <span class="from">{{ marginPrev }}%</span>
              <span>30 d</span>
            </span>
          </div>
        </div>
      </section>

      <!-- ============ Recomendación IA ============ -->
      <section v-if="showAi" class="rd-ai" aria-label="Recomendación IA">
        <div class="rd-ai-head">
          <div class="rd-ai-ico" aria-hidden="true"><UIcon name="i-lucide-bot" /></div>
          <div>
            <div class="rd-ai-eyebrow">Recomendación IA</div>
            <div class="rd-ai-title">
              Subir precio a S/ {{ suggestedPrice }} recupera margen al {{ suggestedMargin }}%
            </div>
          </div>
        </div>
        <p class="rd-ai-text">
          El nuevo precio mantiene competitividad: aún <b>{{ pctBelow }} % por debajo</b> del promedio
          del distrito (<span class="pill-money">S/ {{ districtAvg }}</span>) para platos similares.
        </p>
        <div class="rd-ai-actions">
          <button class="btn btn-primary" @click="openEdit(suggestedPrice)">
            <UIcon name="i-lucide-zap" /> Aplicar sugerencia
          </button>
          <button class="btn btn-ghost" @click="showAnalysis = true">
            <UIcon name="i-lucide-bar-chart-3" /> Ver análisis
          </button>
        </div>
      </section>

      <!-- ============ Insumos (BOM) ============ -->
      <section class="rd-section" aria-label="Insumos">
        <div class="rd-section-head">
          <div class="titlewrap">
            <div class="rd-section-title">Insumos (BOM)</div>
            <div class="rd-section-sub">
              <b>{{ recipe.items.length }} insumos</b> · Costo total con mermas: <b>S/ {{ fmt(recipe.cost) }}</b>
            </div>
          </div>
          <button
            class="rd-add-mini"
            aria-label="Agregar insumo"
            @click="toast.add({ title: 'Edición de insumos — disponible pronto', icon: 'i-lucide-package-search' })"
          >
            <UIcon name="i-lucide-plus" /> Agregar
          </button>
        </div>
        <div class="rd-bom" role="list">
          <NuxtLink
            v-for="it in recipe.items"
            :key="it.ingredientId"
            role="listitem"
            class="rd-ingr"
            :class="{ alert: itemAlert(it) }"
            :to="`/app/inventario/producto/${it.ingredientId}`"
            :aria-label="`${it.name}, ${itemQtyLabel(it)}, costo ${fmt(it.cost)} soles`"
          >
            <div class="rd-ingr-name">
              {{ it.name }}
              <span class="rd-ingr-qty">· {{ itemQtyLabel(it) }}</span>
            </div>
            <div class="rd-ingr-cost">S/ {{ fmt(it.cost) }}</div>
            <div class="rd-ingr-meta">
              <template v-if="it.wastePct > 0">
                <span class="merma">
                  <UIcon name="i-lucide-droplet" />
                  Merma {{ it.wastePct }}%
                </span>
                <span class="net">· Costo neto <b>S/ {{ fmt(itemNet(it)) }}</b></span>
              </template>
              <span v-else class="nomerma">Sin merma · Costo S/ {{ fmt(it.cost) }}</span>
              <span v-if="itemAlert(it)" class="ingr-alert">
                <UIcon name="i-lucide-alert-triangle" /> {{ itemAlert(it) }}
              </span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- ============ Resumen de cálculo ============ -->
      <section class="rd-section" aria-label="Resumen de cálculo">
        <div class="rd-section-head">
          <div class="titlewrap">
            <div class="rd-section-title">Resumen de cálculo</div>
            <div class="rd-section-sub">Cómo llegamos al margen final</div>
          </div>
        </div>
        <div class="rd-calc">
          <div class="rd-calc-row">
            <span class="lbl">Costo bruto</span>
            <span class="val">S/ {{ fmt(grossCost) }}</span>
          </div>
          <div class="rd-calc-row add">
            <span class="lbl">Mermas</span>
            <span class="val">+ S/ {{ fmt(wasteCost) }}</span>
          </div>
          <div class="rd-calc-divider" />
          <div class="rd-calc-row total">
            <span class="lbl">Costo total</span>
            <span class="val">S/ {{ fmt(recipe.cost) }}</span>
          </div>
          <div class="rd-calc-row price">
            <span class="lbl">Precio venta</span>
            <span class="val">S/ {{ fmt(recipe.sellPrice) }}</span>
          </div>
          <div class="rd-calc-row margin" :class="bucket">
            <span class="lbl">Margen</span>
            <span class="val">
              S/ {{ fmt(gain) }}
              <span class="pct">{{ recipe.marginPct }}%</span>
            </span>
          </div>
        </div>
      </section>

      <!-- ============ Rendimiento ============ -->
      <section class="rd-section" aria-label="Rendimiento histórico">
        <div class="rd-section-head">
          <div class="titlewrap">
            <div class="rd-section-title">Rendimiento histórico</div>
            <div class="rd-section-sub">Últimos 30 días</div>
          </div>
        </div>

        <div class="rd-perf-rail">
          <div class="rd-perf-card">
            <div class="rd-perf-eyebrow">Vendidos</div>
            <div class="rd-perf-val">{{ fmtInt(units30d) }}</div>
            <div class="rd-perf-foot up">
              <UIcon name="i-lucide-arrow-up-right" /> {{ recipe.soldToday }} / día
            </div>
          </div>
          <div class="rd-perf-card">
            <div class="rd-perf-eyebrow">Aporte</div>
            <div class="rd-perf-val"><span class="currency">S/</span>{{ fmtInt(revenue30d) }}</div>
            <div class="rd-perf-foot">Ingresos brutos</div>
          </div>
          <div class="rd-perf-card">
            <div class="rd-perf-eyebrow">Ganancia</div>
            <div class="rd-perf-val"><span class="currency">S/</span>{{ fmtInt(profit30d) }}</div>
            <div class="rd-perf-foot" :class="isAtRisk ? 'down' : 'up'">
              <UIcon :name="isAtRisk ? 'i-lucide-arrow-down-right' : 'i-lucide-arrow-up-right'" />
              margen {{ isAtRisk ? '↓' : '↑' }}
            </div>
          </div>
        </div>

        <div class="rd-chart" aria-label="Tendencia del margen">
          <div class="rd-chart-head">
            <span class="rd-chart-title">Margen últimos 30 días</span>
            <span class="rd-chart-legend">{{ marginPrev }}% → {{ recipe.marginPct }}%</span>
          </div>
          <svg :viewBox="`0 0 ${chartW} ${chartH}`" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="rd-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" :stop-color="trendColor" stop-opacity="0.18" />
                <stop offset="100%" :stop-color="trendColor" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path :d="chartArea" fill="url(#rd-grad)" />
            <path :d="chartPath" fill="none" :stroke="trendColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle :cx="chartLast[0]" :cy="chartLast[1]" r="3.5" :fill="trendColor" stroke="var(--crema-100)" stroke-width="1.5" />
          </svg>
          <div class="rd-chart-x">
            <span>hace 30 d</span>
            <span>hace 15 d</span>
            <span>hoy</span>
          </div>
        </div>
      </section>

      <!-- ============ Alertas relacionadas ============ -->
      <section v-if="hasLimonAlert" class="rd-section" aria-label="Alertas relacionadas">
        <div class="rd-section-head">
          <div class="titlewrap">
            <div class="rd-section-title">Alertas relacionadas</div>
            <div class="rd-section-sub">Eventos que afectan este plato</div>
          </div>
        </div>
        <div class="rd-related">
          <div class="rd-related-ico" aria-hidden="true"><UIcon name="i-lucide-alert-triangle" /></div>
          <div class="rd-related-body">
            <div class="rd-related-eyebrow">Precio insumo · Crítico</div>
            <p class="rd-related-text">
              El <b>Limón Sutil</b> subió <b>30 %</b> esta semana. Esto explica casi por completo
              la caída del margen de {{ recipe.name }}.
            </p>
            <div class="rd-related-actions">
              <NuxtLink class="btn btn-dark" to="/app/inventario/lista-compras">
                <UIcon name="i-lucide-list-checks" /> Ver lista de compras
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ Modificadores + disponibilidad (HU-02-11 / HU-02-13) ============ -->
      <section v-if="isDish" class="rd-section" aria-label="Modificadores y disponibilidad">
        <RecipeExtras :recipe-id="recipeId" />
      </section>

      <div class="rd-bottom-space" />

      <!-- ============ Barra de acciones ============ -->
      <div class="rd-actions-bar" role="toolbar" aria-label="Acciones de receta">
        <div class="rd-actions-inner">
          <button class="btn rd-btn-danger" aria-label="Eliminar receta" @click="showDelete = true">
            <UIcon name="i-lucide-trash-2" /> Eliminar
          </button>
          <button class="btn rd-btn-cta" aria-label="Ajustar precio" @click="openEdit()">
            <UIcon name="i-lucide-tag" /> Ajustar precio
          </button>
        </div>
      </div>

      <!-- ============ Sheet: editar precio / activo ============ -->
      <UiBottomSheet v-model="showEdit" title="Ajustar precio" subtitle="El margen se recalcula al guardar">
        <div class="field-block">
          <label class="field-label" for="edit-price">Precio de venta <span class="hint">IGV incluido</span></label>
          <div class="rd-price-input">
            <span class="currency" aria-hidden="true">S/</span>
            <input
              id="edit-price"
              v-model="editPrice"
              type="number"
              inputmode="decimal"
              step="0.10"
              min="0"
              placeholder="0.00"
            >
          </div>
          <div class="rd-edit-margin" :class="marginBucket(editMargin)">
            Nuevo margen estimado: <b>{{ editMargin }}%</b>
            <span class="muted">· Costo S/ {{ fmt(recipe.cost) }}</span>
          </div>
        </div>

        <div class="rd-active-row">
          <div>
            <div class="rd-active-title">Plato activo en la carta</div>
            <div class="rd-active-sub">Si lo desactivas, no aparecerá en el POS ni en la carta.</div>
          </div>
          <USwitch v-model="editActive" aria-label="Plato activo" />
        </div>

        <template #cta>
          <button class="btn btn-primary btn-lg btn-block" :disabled="!canSaveEdit" @click="saveEdit">
            <UIcon name="i-lucide-check" /> Guardar cambios
          </button>
        </template>
      </UiBottomSheet>

      <!-- ============ Sheet: eliminar ============ -->
      <UiBottomSheet v-model="showDelete" title="¿Por qué eliminar?">
        <p class="rd-del-sub">
          Esta acción no afecta el histórico de ventas. El plato saldrá del menú activo.
        </p>
        <div class="rd-reason-list">
          <button
            v-for="r in DELETE_REASONS"
            :key="r.id"
            class="rd-reason"
            :class="{ selected: deleteReason === r.id }"
            @click="deleteReason = r.id"
          >
            <span class="radio" aria-hidden="true" />
            {{ r.label }}
          </button>
        </div>
        <template #cta>
          <div class="rd-confirm-actions">
            <button class="btn btn-ghost" @click="showDelete = false">Cancelar</button>
            <button class="btn btn-danger" :disabled="!deleteReason || deleting" @click="confirmDelete">
              <UIcon name="i-lucide-trash-2" /> Eliminar plato
            </button>
          </div>
        </template>
      </UiBottomSheet>

      <!-- ============ Sheet: análisis IA ============ -->
      <UiBottomSheet v-model="showAnalysis" :title="`Análisis: subir precio a S/ ${suggestedPrice}`">
        <div class="rd-ai-step">
          <div class="num">1</div>
          <div>
            <h4>Margen objetivo</h4>
            <p>
              S/ {{ suggestedPrice }} − S/ {{ fmt(recipe.cost) }} =
              <span class="stat">S/ {{ fmt(suggestedPrice - recipe.cost) }}</span> de utilidad por plato.
              Margen pasa de {{ recipe.marginPct }} % a <b>{{ suggestedMargin }} %</b>.
            </p>
          </div>
        </div>
        <div class="rd-ai-step">
          <div class="num">2</div>
          <div>
            <h4>Comparativa de mercado</h4>
            <p>
              Precio promedio del distrito para platos similares: <span class="stat">S/ {{ districtAvg }}</span>.
              Tu nuevo precio queda {{ pctBelow }} % por debajo, conservando atractivo.
            </p>
          </div>
        </div>
        <div class="rd-ai-step">
          <div class="num">3</div>
          <div>
            <h4>Impacto estimado en ventas</h4>
            <p>
              Elasticidad histórica del plato sugiere caída de <span class="stat">~6 %</span>
              en unidades. Aún así, la ganancia mensual sube de S/ {{ fmtInt(profit30d) }} a
              <b>~S/ {{ fmtInt(Math.round(profit30d * 1.2)) }}</b>.
            </p>
          </div>
        </div>
        <div class="rd-ai-step">
          <div class="num">4</div>
          <div>
            <h4>Riesgo</h4>
            <p>
              Bajo. Si el insumo crítico mantiene precio alto 2 semanas más, considera además un
              sustituto: <b>limón Tahití</b> (-22 % costo).
            </p>
          </div>
        </div>
        <template #cta>
          <button class="btn btn-primary btn-lg btn-block" @click="applySuggestion">
            <UIcon name="i-lucide-zap" /> Aplicar sugerencia
          </button>
        </template>
      </UiBottomSheet>
    </template>

    <!-- ============ No encontrada ============ -->
    <template v-else>
      <UiScreenHeader title="Receta" back="/app/recetas" />
      <UiEmptyState
        icon="i-lucide-utensils-crossed"
        title="Receta no encontrada"
        subtitle="Puede que haya sido eliminada o que el enlace sea incorrecto."
      >
        <NuxtLink to="/app/recetas" class="btn btn-primary">
          <UIcon name="i-lucide-arrow-left" /> Volver a Recetas
        </NuxtLink>
      </UiEmptyState>
    </template>
  </div>
</template>

<style scoped>
.rd-page {
  max-width: 640px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  padding-bottom: 84px; /* aire para la barra de acciones fija */
}
@media (min-width: 1024px) {
  .rd-page { padding-top: 28px; }
}

.rd-edit {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pure-white);
  color: var(--fg1);
  border: 1px solid var(--border);
  padding: 8px 12px;
  font-family: var(--font-sans);
  font-size: 13px; font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--dur);
}
.rd-edit:hover { background: var(--crema-100); }
.rd-edit:active { transform: scale(0.97); }
.rd-edit .iconify { width: 14px; height: 14px; }

/* ============ HERO ============ */
.rd-hero {
  margin: 0 16px 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  overflow: hidden;
  position: relative;
}
.rd-hero-img {
  width: 100%;
  aspect-ratio: 16 / 9;
  background:
    radial-gradient(circle at 28% 35%, rgba(255, 255, 255, 0.45) 0%, transparent 55%),
    repeating-linear-gradient(
      135deg,
      var(--terracotta-100) 0 14px,
      var(--crema-200) 14px 28px
    );
  display: flex; align-items: center; justify-content: center;
  position: relative;
  border-bottom: 1px solid var(--border-subtle);
}
.rd-hero-img .emoji {
  font-size: 64px;
  filter: drop-shadow(0 6px 16px rgba(26, 26, 26, 0.18));
}
.rd-hero-img .placeholder-tag {
  position: absolute; left: 12px; bottom: 10px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--fg2);
  padding: 3px 8px; border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 9.5px; font-weight: 500;
  letter-spacing: 0.06em; text-transform: uppercase;
  backdrop-filter: blur(6px);
}
.rd-hero-body {
  padding: 14px 16px 16px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px 16px;
  align-items: start;
}
.rd-hero-cat {
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--terracotta-700);
}
.rd-hero-name {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 28px;
  letter-spacing: -0.01em;
  color: var(--fg1);
  margin: 2px 0 0;
  line-height: 1.1;
}
.rd-hero-price {
  margin-top: 12px;
  display: flex; align-items: baseline; gap: 6px;
  font-family: var(--font-sans);
}
.rd-hero-price .currency { font-size: 14px; color: var(--fg3); font-weight: 500; }
.rd-hero-price .value {
  font-size: 28px; font-weight: 600;
  color: var(--fg1); letter-spacing: -0.02em; line-height: 1;
}
.rd-hero-note { font-size: 11px; color: var(--fg3); margin-top: 2px; }
.rd-hero-cost {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg2);
  margin-top: 8px;
}
.rd-hero-cost b { color: var(--fg1); font-weight: 500; }
.rd-inactive {
  margin-top: 8px;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
  color: var(--fg3);
  background: var(--crema-200);
  padding: 3px 9px;
  border-radius: 999px;
}
.rd-inactive .iconify { width: 11px; height: 11px; }

.rd-margin-block {
  text-align: right;
  display: flex; flex-direction: column; align-items: flex-end;
  gap: 6px;
  min-width: 110px;
}
.rd-margin-big {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 44px;
  letter-spacing: -0.03em;
  line-height: 1;
  padding: 8px 14px;
  border-radius: 14px;
  display: inline-flex; align-items: baseline;
}
.rd-margin-big .pct { font-size: 18px; font-weight: 600; margin-left: 2px; opacity: 0.9; }
.rd-margin-big.low {
  background: var(--danger-bg); color: var(--danger);
  border: 1px solid rgba(179, 58, 42, 0.18);
}
.rd-margin-big.mid {
  background: var(--warning-bg); color: var(--mostaza-700);
  border: 1px solid rgba(176, 130, 46, 0.18);
}
.rd-margin-big.high {
  background: var(--success-bg); color: var(--oliva-700);
  border: 1px solid rgba(110, 123, 97, 0.18);
}
.rd-est-tag {
  font-size: 11px; color: var(--fg3); font-style: italic;
  display: inline-flex; align-items: center; gap: 4px;
}
.rd-est-tag .iconify { width: 11px; height: 11px; }
.rd-trend {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-sans);
  font-size: 11.5px; font-weight: 600;
  color: var(--danger);
  background: var(--danger-bg);
  padding: 4px 9px;
  border-radius: 999px;
}
.rd-trend .iconify { width: 11px; height: 11px; }
.rd-trend .from {
  font-family: var(--font-mono);
  font-weight: 500;
  text-decoration: line-through;
  opacity: 0.55;
}

/* ============ IA CARD ============ */
.rd-ai {
  margin: 0 16px 16px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--info);
  border-radius: 14px;
  padding: 14px;
  position: relative;
  overflow: hidden;
}
.rd-ai::after {
  content: '';
  position: absolute;
  right: -50px; top: -50px;
  width: 140px; height: 140px;
  background: radial-gradient(circle, var(--info-bg) 0%, transparent 70%);
  opacity: 0.6;
  pointer-events: none;
}
.rd-ai-head {
  display: flex; align-items: center; gap: 10px;
  position: relative; z-index: 1;
}
.rd-ai-ico {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--info-bg); color: var(--info);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rd-ai-ico .iconify { width: 17px; height: 17px; }
.rd-ai-eyebrow {
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--info);
}
.rd-ai-title {
  font-size: 15px; font-weight: 600; color: var(--fg1);
  line-height: 1.2;
}
.rd-ai-text {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--fg2);
  margin: 8px 0 12px;
  position: relative; z-index: 1;
}
.rd-ai-text b { color: var(--fg1); font-weight: 600; }
.rd-ai-text .pill-money {
  display: inline-flex; align-items: baseline;
  font-family: var(--font-mono);
  background: var(--info-bg); color: var(--info);
  padding: 1px 7px; border-radius: 6px;
  font-weight: 600;
}
.rd-ai-actions {
  display: flex; gap: 8px;
  position: relative; z-index: 1;
}

/* ============ SECCIONES ============ */
.rd-section { margin: 0 0 12px; }
.rd-section-head {
  padding: 6px 20px 10px;
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 10px;
}
.rd-section-head .titlewrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rd-section-title {
  font-family: var(--font-sans);
  font-size: 15px; font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--fg1);
}
.rd-section-sub {
  font-size: 11.5px;
  color: var(--fg3);
}
.rd-section-sub b { color: var(--fg2); font-weight: 600; }
.rd-add-mini {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-sans);
  font-size: 12px; font-weight: 600;
  color: var(--terracotta-700);
  background: var(--terracotta-100);
  border: none;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.rd-add-mini:hover { background: var(--terracotta-300); color: var(--crema-100); }
.rd-add-mini:active { transform: scale(0.97); }
.rd-add-mini .iconify { width: 12px; height: 12px; }

/* ============ BOM ============ */
.rd-bom {
  margin: 0 16px;
  display: flex; flex-direction: column;
  gap: 6px;
}
.rd-ingr {
  width: 100%;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  align-items: start;
  text-align: left;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  position: relative;
  transition: background var(--dur), border-color var(--dur);
}
.rd-ingr:hover { background: var(--crema-50); border-color: var(--border); }
.rd-ingr.alert { border-color: rgba(179, 58, 42, 0.2); }
.rd-ingr-name {
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 600;
  color: var(--fg1);
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: inline-flex; align-items: center; gap: 8px;
}
.rd-ingr-qty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg3);
  font-weight: 500;
}
.rd-ingr-cost {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--fg1);
  text-align: right;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.rd-ingr-meta {
  grid-column: 1 / -1;
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--fg3);
  margin-top: 2px;
}
.rd-ingr-meta .merma {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono);
  color: var(--fg2);
}
.rd-ingr-meta .merma .iconify { width: 11px; height: 11px; color: var(--mostaza-700); }
.rd-ingr-meta .net {
  color: var(--fg3);
  font-family: var(--font-mono);
}
.rd-ingr-meta .net b { color: var(--fg2); font-weight: 500; }
.rd-ingr-meta .nomerma { font-style: italic; color: var(--fg3); }
.rd-ingr-meta .ingr-alert {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 600;
  background: var(--danger-bg);
  color: var(--danger);
  padding: 3px 8px;
  border-radius: 999px;
  margin-left: auto;
}
.rd-ingr-meta .ingr-alert .iconify { width: 11px; height: 11px; }

/* ============ RESUMEN DE CÁLCULO ============ */
.rd-calc {
  margin: 0 16px;
  background: linear-gradient(180deg, var(--pure-white) 0%, var(--crema-50) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px 16px;
}
.rd-calc-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--fg2);
}
.rd-calc-row .val { font-family: var(--font-mono); color: var(--fg1); font-weight: 500; }
.rd-calc-row.add .val { color: var(--mostaza-700); }
.rd-calc-divider {
  height: 1px; background: var(--border-subtle);
  margin: 6px 0;
}
.rd-calc-row.total .lbl { font-weight: 600; color: var(--fg1); font-size: 14px; }
.rd-calc-row.total .val { font-weight: 700; font-size: 16px; }
.rd-calc-row.price .lbl { font-weight: 500; }
.rd-calc-row.price .val { font-weight: 600; }
.rd-calc-row.margin {
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 10px;
}
.rd-calc-row.margin .lbl { font-weight: 700; }
.rd-calc-row.margin .val {
  font-weight: 700;
  font-size: 15px;
  display: inline-flex; align-items: baseline; gap: 6px;
}
.rd-calc-row.margin .pct {
  font-size: 12px;
  padding: 1px 6px; border-radius: 6px;
}
.rd-calc-row.margin.low {
  background: var(--danger-bg);
  border: 1px solid rgba(179, 58, 42, 0.18);
}
.rd-calc-row.margin.low .lbl, .rd-calc-row.margin.low .val { color: var(--danger); }
.rd-calc-row.margin.low .pct { background: rgba(179, 58, 42, 0.18); }
.rd-calc-row.margin.mid {
  background: var(--warning-bg);
  border: 1px solid rgba(176, 130, 46, 0.18);
}
.rd-calc-row.margin.mid .lbl, .rd-calc-row.margin.mid .val { color: var(--mostaza-700); }
.rd-calc-row.margin.mid .pct { background: rgba(176, 130, 46, 0.18); }
.rd-calc-row.margin.high {
  background: var(--success-bg);
  border: 1px solid rgba(110, 123, 97, 0.18);
}
.rd-calc-row.margin.high .lbl, .rd-calc-row.margin.high .val { color: var(--oliva-700); }
.rd-calc-row.margin.high .pct { background: rgba(110, 123, 97, 0.18); }

/* ============ RENDIMIENTO ============ */
.rd-perf-rail {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 0 16px;
  margin-bottom: 12px;
}
.rd-perf-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 12px 10px;
  display: flex; flex-direction: column; gap: 4px;
  min-height: 80px;
}
.rd-perf-eyebrow {
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  line-height: 1.2;
}
.rd-perf-val {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.02em;
  color: var(--fg1);
  line-height: 1.1;
  display: inline-flex; align-items: baseline;
}
.rd-perf-val .currency { font-size: 11px; color: var(--fg3); font-weight: 500; margin-right: 3px; }
.rd-perf-foot {
  font-size: 10.5px;
  color: var(--fg3);
  display: inline-flex; align-items: center; gap: 3px;
  margin-top: auto;
}
.rd-perf-foot .iconify { width: 10px; height: 10px; }
.rd-perf-foot.up { color: var(--oliva-700); }
.rd-perf-foot.down { color: var(--danger); }

.rd-chart {
  margin: 0 16px 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px 16px 10px;
}
.rd-chart-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 10px;
}
.rd-chart-title {
  font-size: 12px; font-weight: 600;
  color: var(--fg2);
  letter-spacing: -0.01em;
}
.rd-chart-legend {
  font-size: 10.5px; color: var(--fg3);
  font-family: var(--font-mono);
}
.rd-chart svg { display: block; width: 100%; height: 60px; }
.rd-chart-x {
  display: flex; justify-content: space-between;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--fg3);
  letter-spacing: 0.04em;
}

/* ============ ALERTA RELACIONADA ============ */
.rd-related {
  margin: 0 16px 14px;
  background: var(--pure-white);
  border: 1px solid rgba(179, 58, 42, 0.22);
  border-left: 3px solid var(--danger);
  border-radius: 14px;
  padding: 14px;
  display: flex; gap: 12px;
  align-items: flex-start;
}
.rd-related-ico {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--danger-bg); color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rd-related-ico .iconify { width: 17px; height: 17px; }
.rd-related-body { flex: 1; min-width: 0; }
.rd-related-eyebrow {
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--danger);
  margin-bottom: 4px;
}
.rd-related-text {
  font-size: 13px; line-height: 1.5; color: var(--fg2);
  margin: 0 0 10px;
}
.rd-related-text b { color: var(--fg1); font-weight: 600; }
.rd-related-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.rd-bottom-space { height: 12px; }

/* ============ BARRA DE ACCIONES ============ */
.rd-actions-bar {
  position: fixed;
  left: 0; right: 0;
  bottom: calc(68px + env(safe-area-inset-bottom, 0px)); /* sobre el tab bar */
  background: rgba(248, 244, 237, 0.92);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  border-top: 1px solid var(--border-subtle);
  padding: 12px 16px;
  z-index: 30;
}
@media (min-width: 1024px) {
  .rd-actions-bar { left: 256px; bottom: 0; padding-bottom: 16px; }
}
.rd-actions-inner {
  max-width: 608px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
}
.rd-actions-inner .btn { width: 100%; justify-content: center; min-height: 44px; padding: 10px 14px; font-size: 14px; }
.rd-btn-danger {
  background: transparent;
  color: var(--danger);
  border: 1px solid rgba(179, 58, 42, 0.35);
  font-weight: 600;
}
.rd-btn-danger:hover { background: var(--danger-bg); }
.rd-btn-cta {
  background: var(--terracotta);
  color: var(--crema-100);
  font-weight: 600;
}
.rd-btn-cta:hover { background: var(--terracotta-700); }

/* ============ SHEET: EDITAR ============ */
.rd-price-input {
  display: flex; align-items: stretch;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.rd-price-input:focus-within {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
}
.rd-price-input .currency {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  color: var(--terracotta-700);
  display: inline-flex; align-items: center;
  padding: 0 4px 0 16px;
  flex-shrink: 0;
}
.rd-price-input input {
  flex: 1;
  border: none; outline: none; background: transparent;
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg1);
  padding: 12px 14px 12px 4px;
  min-width: 0;
  appearance: textfield;
  -moz-appearance: textfield;
}
.rd-price-input input::-webkit-outer-spin-button,
.rd-price-input input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rd-edit-margin {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--fg2);
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--crema-100);
}
.rd-edit-margin b { font-weight: 700; }
.rd-edit-margin.low { background: var(--danger-bg); color: var(--danger); }
.rd-edit-margin.mid { background: var(--warning-bg); color: var(--mostaza-700); }
.rd-edit-margin.high { background: var(--success-bg); color: var(--oliva-700); }
.rd-edit-margin .muted { opacity: 0.7; font-family: var(--font-mono); font-size: 11px; }

.rd-active-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  margin-bottom: 8px;
}
.rd-active-title { font-size: 14px; font-weight: 600; color: var(--fg1); }
.rd-active-sub { font-size: 11.5px; color: var(--fg3); margin-top: 2px; }

/* ============ SHEET: ELIMINAR ============ */
.rd-del-sub {
  font-size: 13px; color: var(--fg2);
  margin: 0 0 14px;
}
.rd-reason-list {
  display: flex; flex-direction: column;
  gap: 6px; margin-bottom: 4px;
}
.rd-reason {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  font: inherit;
  font-size: 14px;
  color: var(--fg1);
  text-align: left;
  cursor: pointer;
}
.rd-reason:hover { background: var(--crema-100); }
.rd-reason.selected {
  border-color: var(--danger);
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 600;
}
.rd-reason .radio {
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  flex-shrink: 0;
  position: relative;
}
.rd-reason.selected .radio { border-color: var(--danger); }
.rd-reason.selected .radio::after {
  content: '';
  position: absolute; inset: 2px;
  border-radius: 50%;
  background: var(--danger);
}
.rd-confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rd-confirm-actions .btn { width: 100%; justify-content: center; min-height: 44px; }

/* ============ SHEET: ANÁLISIS IA ============ */
.rd-ai-step {
  margin: 0 0 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  align-items: start;
}
.rd-ai-step .num {
  width: 24px; height: 24px;
  border-radius: 999px;
  background: var(--info-bg); color: var(--info);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-weight: 600; font-size: 12px;
  flex-shrink: 0;
}
.rd-ai-step h4 {
  font-size: 13.5px; font-weight: 600;
  margin: 0 0 2px; color: var(--fg1);
}
.rd-ai-step p {
  font-size: 12.5px; color: var(--fg2);
  margin: 0; line-height: 1.45;
}
.rd-ai-step p b { color: var(--fg1); }
.rd-ai-step .stat {
  font-family: var(--font-mono);
  background: var(--crema-200);
  padding: 1px 6px; border-radius: 6px;
  color: var(--fg1);
  font-size: 11.5px; font-weight: 500;
}
</style>
