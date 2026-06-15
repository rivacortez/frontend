<script setup lang="ts">
// /app/costeo — E06 · Costeo dinámico y márgenes. Lee el costeo por plato de un
// período (ingredientes + CIF prorrateado), una herramienta de sugerencia de precio,
// el comparativo costo real vs teórico y el cierre mensual. Todo es info de gestión
// (CASL Report): owner/manager; el backend devuelve 403 a staff → la pantalla gatea.
import type { DishCost, SuggestPrice } from '~/composables/use-costing'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Costeo y márgenes — GastronomIA' })

const toast = useToast()
const { user } = useUserSession()

// Solo owner/manager (el backend 403ea a staff en cada endpoint de costeo).
const canView = computed(() => user.value?.role === 'owner' || user.value?.role === 'manager')

// Período seleccionado (YYYY-MM). Por defecto el mes actual (zona America/Lima).
function currentPeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Lima',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}
const period = ref(currentPeriod())

const { data: report, isLoading } = useDishCosting(period, canView)
const { data: variance } = useCostVariance(period, canView)
const { data: closes } = useCostingCloses(canView)
const suggestPrice = useSuggestPrice()
const { mutateAsync: closePeriod, isLoading: closing } = useCloseCosting()

const MARGIN_THRESHOLD = 25

const dishes = computed(() => report.value?.dishes ?? [])
const hasDishes = computed(() => dishes.value.length > 0)

function periodLabel(p: string): string {
  const [y, m] = p.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
}

const num = (s: string | undefined): number => Number(s ?? 0)
const isLowMargin = (d: DishCost): boolean => num(d.marginPct) < MARGIN_THRESHOLD
const lowMarginCount = computed(() => dishes.value.filter(isLowMargin).length)

// ¿El período visible ya está cerrado?
const isPeriodClosed = computed(() => (closes.value ?? []).some(c => c.period === period.value))

/* ===== Sugerencia de precio (HU-06-05) ===== */
const showSuggest = ref(false)
const suggestForm = reactive({ menuItemId: '', targetMarginPct: '30' })
const suggesting = ref(false)
const suggestion = ref<SuggestPrice | null>(null)

function openSuggest(dish?: DishCost): void {
  suggestForm.menuItemId = dish?.menuItemId ?? dishes.value[0]?.menuItemId ?? ''
  suggestForm.targetMarginPct = '30'
  suggestion.value = null
  showSuggest.value = true
}

const suggestedDish = computed(() => dishes.value.find(d => d.menuItemId === suggestForm.menuItemId))

async function runSuggest(): Promise<void> {
  const target = Number(suggestForm.targetMarginPct)
  if (!suggestForm.menuItemId) {
    toast.add({ title: 'Elige un plato', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!(target >= 0 && target <= 99)) {
    toast.add({ title: 'El margen objetivo debe estar entre 0 y 99', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  suggesting.value = true
  try {
    suggestion.value = await suggestPrice(suggestForm.menuItemId, target, period.value)
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo calcular el precio sugerido'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    suggesting.value = false
  }
}

/* ===== Cierre de período (HU-06-06) ===== */
async function onClosePeriod(): Promise<void> {
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Cerrar el período ${periodLabel(period.value)}? Se fijarán las cifras finales y se guardará una foto del reporte. Esta acción no se puede deshacer.`)) return
  try {
    await closePeriod(period.value)
    toast.add({ title: `Período ${periodLabel(period.value)} cerrado`, icon: 'i-lucide-lock' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo cerrar el período'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}
</script>

<template>
  <div class="cst-screen">
    <UiScreenHeader title="Costeo y márgenes" subtitle="Costo, margen y precio por plato" back="/app/menu">
      <template #trailing>
        <button v-if="canView && hasDishes && !isPeriodClosed" class="cst-hdr-btn" :disabled="closing" aria-label="Cerrar período" @click="onClosePeriod">
          <UIcon :name="closing ? 'i-lucide-loader-circle' : 'i-lucide-lock'" :class="{ spin: closing }" />
          <span>Cerrar periodo</span>
        </button>
      </template>
    </UiScreenHeader>

    <!-- Sin permiso (staff) -->
    <UiEmptyState
      v-if="!canView"
      icon="i-lucide-lock"
      title="Sin acceso al costeo"
      subtitle="El costeo y los márgenes son información de gestión: solo el propietario y el encargado pueden verlos."
    />

    <template v-else>
      <!-- Selector de período -->
      <div class="cst-period">
        <label class="cst-period-field">
          <span>Período</span>
          <input v-model="period" type="month" aria-label="Período (mes)">
        </label>
        <span v-if="isPeriodClosed" class="cst-closed-tag"><UIcon name="i-lucide-lock" /> Cerrado</span>
      </div>

      <!-- Totales del período (prorrateo del CIF) -->
      <div v-if="report" class="cst-totals">
        <div class="cst-total">
          <span class="cst-total-label">CIF total</span>
          <span class="cst-total-val">{{ formatPEN(num(report.totalCIF)) }}</span>
        </div>
        <div class="cst-total">
          <span class="cst-total-label">Unidades vendidas</span>
          <span class="cst-total-val">{{ report.totalUnits }}</span>
        </div>
        <div class="cst-total">
          <span class="cst-total-label">CIF por unidad</span>
          <span class="cst-total-val">{{ formatPEN(num(report.cifPerUnit)) }}</span>
        </div>
      </div>

      <!-- Aviso de prorrateo + márgenes bajos -->
      <p class="cst-intro">
        <UIcon name="i-lucide-info" />
        El <b>CIF</b> del mes se prorratea en partes iguales por unidad vendida. El <b>costo total</b> de cada plato suma ingredientes + CIF por unidad.
        <span v-if="lowMarginCount > 0" class="cst-intro-warn"> {{ lowMarginCount }} plato{{ lowMarginCount === 1 ? '' : 's' }} con margen bajo (&lt;{{ MARGIN_THRESHOLD }}%).</span>
      </p>

      <!-- Herramienta de sugerencia de precio -->
      <button v-if="hasDishes" class="cst-suggest-cta" @click="openSuggest()">
        <span class="cst-suggest-ico" aria-hidden="true"><UIcon name="i-lucide-wand-2" /></span>
        <span class="cst-suggest-text">
          <span class="cst-suggest-title">Sugerir precio para un margen objetivo</span>
          <span class="cst-suggest-sub">Elige un plato y el margen que buscas</span>
        </span>
        <UIcon name="i-lucide-chevron-right" class="cst-suggest-arrow" aria-hidden="true" />
      </button>

      <!-- Tabla de platos -->
      <section v-if="hasDishes" class="cst-section" aria-label="Costo y margen por plato">
        <h2 class="cst-section-title">Costo y margen por plato</h2>
        <div class="cst-table-wrap">
          <table class="cst-table">
            <thead>
              <tr>
                <th class="left">Plato</th>
                <th>Precio</th>
                <th>Ingred.</th>
                <th>CIF/u</th>
                <th>Costo total</th>
                <th>Food&nbsp;cost</th>
                <th>Margen</th>
                <th>Contrib.</th>
                <th>Uds.</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in dishes" :key="d.menuItemId" :class="{ low: isLowMargin(d) }">
                <td class="left name">{{ d.name }}</td>
                <td>{{ formatPEN(num(d.sellPrice)) }}</td>
                <td>{{ formatPEN(num(d.ingredientCost)) }}</td>
                <td>{{ formatPEN(num(d.cifPerUnit)) }}</td>
                <td class="strong">{{ formatPEN(num(d.fullCost)) }}</td>
                <td>{{ num(d.foodCostPct).toFixed(1) }}%</td>
                <td>
                  <span class="cst-margin" :class="{ bad: isLowMargin(d) }">
                    <UIcon v-if="isLowMargin(d)" name="i-lucide-trending-down" />
                    {{ num(d.marginPct).toFixed(1) }}%
                  </span>
                </td>
                <td>{{ formatPEN(num(d.contributionMargin)) }}</td>
                <td>{{ d.unitsSold }}</td>
                <td>
                  <button class="cst-row-btn" aria-label="Sugerir precio" @click="openSuggest(d)">
                    <UIcon name="i-lucide-wand-2" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <UiEmptyState
        v-else-if="!isLoading"
        icon="i-lucide-calculator"
        title="Sin datos de costeo este mes"
        :subtitle="`No hay platos activos o ventas en ${periodLabel(period)}. Carga los CIF en Ajustes › Costos indirectos y registra ventas para ver márgenes.`"
      />

      <!-- Comparativo costo real vs teórico -->
      <section v-if="variance" class="cst-section" aria-label="Comparativo costo real vs teórico">
        <h2 class="cst-section-title">Costo real vs teórico</h2>
        <div class="cst-var-card">
          <div class="cst-var-grid">
            <div class="cst-var-cell">
              <span class="cst-var-label">Teórico (BOM)</span>
              <span class="cst-var-val">{{ formatPEN(num(variance.theoreticalCost)) }}</span>
            </div>
            <div class="cst-var-cell">
              <span class="cst-var-label">Real (inventario)</span>
              <span class="cst-var-val">{{ formatPEN(num(variance.realCost)) }}</span>
            </div>
            <div class="cst-var-cell">
              <span class="cst-var-label">Variación</span>
              <span class="cst-var-val" :class="num(variance.variance) > 0 ? 'up' : 'down'">
                {{ num(variance.variance) > 0 ? '+' : '' }}{{ formatPEN(num(variance.variance)) }}
                <small>({{ num(variance.variancePct).toFixed(1) }}%)</small>
              </span>
            </div>
          </div>
          <div class="cst-var-bytype">
            <span>Mermas: <b>{{ formatPEN(num(variance.byType.waste)) }}</b></span>
            <span>Salidas (sale): <b>{{ formatPEN(num(variance.byType.sale)) }}</b></span>
          </div>
          <!-- La nota del backend documenta la limitación (POS↔inventario): se muestra verbatim. -->
          <p class="cst-var-note">
            <UIcon name="i-lucide-triangle-alert" />
            <span>{{ variance.note }}</span>
          </p>
        </div>
      </section>

      <!-- Cierres pasados -->
      <section v-if="(closes ?? []).length" class="cst-section" aria-label="Períodos cerrados">
        <h2 class="cst-section-title">Períodos cerrados</h2>
        <div class="cst-closes">
          <div v-for="c in closes" :key="c.id" class="cst-close-row">
            <span class="cst-close-ico" aria-hidden="true"><UIcon name="i-lucide-lock" /></span>
            <div class="cst-close-body">
              <div class="cst-close-period">{{ periodLabel(c.period) }}</div>
              <div class="cst-close-sub">{{ c.totalUnits }} uds · cerrado {{ formatShortDate(c.closedAt) }}</div>
            </div>
            <div class="cst-close-figures">
              <span class="cst-close-rev">{{ formatPEN(num(c.totalRevenue)) }}</span>
              <span class="cst-close-contrib">contrib. {{ formatPEN(num(c.totalContribution)) }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- Sugerencia de precio -->
    <UiBottomSheet v-model="showSuggest" title="Sugerir precio" subtitle="Para un margen objetivo">
      <div class="cst-suggest-form">
        <label class="cat-field">
          <span>Plato</span>
          <select v-model="suggestForm.menuItemId">
            <option v-for="d in dishes" :key="d.menuItemId" :value="d.menuItemId">{{ d.name }}</option>
          </select>
        </label>
        <label class="cat-field">
          <span>Margen objetivo (%)</span>
          <input v-model="suggestForm.targetMarginPct" type="number" step="1" min="0" max="99" inputmode="numeric">
          <small>Entre 0 y 99. El precio sugerido = costo total ÷ (1 − margen/100).</small>
        </label>

        <div v-if="suggestedDish" class="cst-suggest-current">
          <span>Costo total: <b>{{ formatPEN(num(suggestedDish.fullCost)) }}</b></span>
          <span>Precio actual: <b>{{ formatPEN(num(suggestedDish.sellPrice)) }}</b></span>
          <span>Margen actual: <b>{{ num(suggestedDish.marginPct).toFixed(1) }}%</b></span>
        </div>

        <div v-if="suggestion" class="cst-suggest-result">
          <span class="cst-suggest-result-label">Precio sugerido</span>
          <span class="cst-suggest-result-val">{{ formatPEN(num(suggestion.suggestedPrice)) }}</span>
          <span class="cst-suggest-result-sub">para un margen de {{ num(suggestion.targetMarginPct).toFixed(0) }}% (costo {{ formatPEN(num(suggestion.fullCost)) }})</span>
        </div>
      </div>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cerrar</button>
          <button class="btn btn-primary" :disabled="suggesting" @click="runSuggest">
            <UIcon :name="suggesting ? 'i-lucide-loader-circle' : 'i-lucide-wand-2'" :class="{ spin: suggesting }" />
            Calcular precio
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.cst-screen {
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.cst-hdr-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: var(--espresso); color: var(--crema-100);
  border: none; cursor: pointer;
  padding: 8px 12px; border-radius: 10px;
  flex-shrink: 0;
}
.cst-hdr-btn:disabled { opacity: 0.6; cursor: default; }
.cst-hdr-btn .iconify { width: 14px; height: 14px; }

.cst-period {
  display: flex; align-items: flex-end; gap: 12px;
  margin: 4px 20px 14px;
}
.cst-period-field { display: flex; flex-direction: column; gap: 6px; }
.cst-period-field span { font-size: 12px; font-weight: 600; color: var(--fg2); }
.cst-period-field input {
  font: inherit; font-size: 14px; color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
}
.cst-period-field input:focus { outline: none; border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.cst-closed-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 700;
  background: var(--bg2); color: var(--fg2);
  padding: 5px 10px; border-radius: 999px;
  margin-bottom: 2px;
}
.cst-closed-tag .iconify { width: 12px; height: 12px; }

.cst-totals {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 0 20px 14px;
}
.cst-total {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
}
.cst-total-label { display: block; font-size: 11px; color: var(--fg3); }
.cst-total-val {
  font-size: 17px; font-weight: 700; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}

.cst-intro {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
  font-size: 12.5px; color: var(--fg2); line-height: 1.5;
  margin: 0 20px 14px;
}
.cst-intro .iconify { width: 14px; height: 14px; color: var(--fg3); flex-shrink: 0; }
.cst-intro-warn { color: var(--danger); font-weight: 600; }

.cst-suggest-cta {
  display: flex; align-items: center; gap: 12px;
  width: calc(100% - 40px);
  margin: 0 20px 18px;
  background: linear-gradient(150deg, var(--crema-50) 0%, var(--crema-200) 100%);
  border: 1px solid var(--terracotta-100);
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.cst-suggest-cta:hover { background: var(--crema-200); }
.cst-suggest-ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--terracotta); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cst-suggest-ico .iconify { width: 18px; height: 18px; }
.cst-suggest-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cst-suggest-title { font-size: 14px; font-weight: 600; color: var(--fg1); }
.cst-suggest-sub { font-size: 12px; color: var(--fg3); }
.cst-suggest-arrow { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

.cst-section { margin: 0 20px 20px; }
.cst-section-title { font-size: 15px; font-weight: 600; color: var(--fg1); margin: 0 0 10px; }

.cst-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
}
.cst-table {
  width: 100%; border-collapse: collapse;
  font-size: 12.5px;
}
.cst-table th, .cst-table td {
  padding: 10px 10px;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.cst-table th {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--fg3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--crema-50);
}
.cst-table th.left, .cst-table td.left { text-align: left; }
.cst-table tbody tr { border-bottom: 1px solid var(--border-subtle); }
.cst-table tbody tr:last-child { border-bottom: none; }
.cst-table tbody tr.low { background: var(--danger-bg); }
.cst-table td.name { font-weight: 600; color: var(--fg1); }
.cst-table td.strong { font-weight: 700; color: var(--fg1); }
.cst-margin {
  display: inline-flex; align-items: center; gap: 3px;
  font-weight: 700; color: var(--oliva-700);
}
.cst-margin.bad { color: var(--danger); }
.cst-margin .iconify { width: 12px; height: 12px; }
.cst-row-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--crema-100); color: var(--terracotta-700);
  border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.cst-row-btn:hover { background: var(--crema-200); }
.cst-row-btn .iconify { width: 14px; height: 14px; }

.cst-var-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 16px;
}
.cst-var-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.cst-var-cell { display: flex; flex-direction: column; gap: 3px; }
.cst-var-label { font-size: 11px; color: var(--fg3); }
.cst-var-val {
  font-size: 16px; font-weight: 700; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.cst-var-val small { font-size: 11px; font-weight: 600; }
.cst-var-val.up { color: var(--danger); }
.cst-var-val.down { color: var(--oliva-700); }
.cst-var-bytype {
  display: flex; flex-wrap: wrap; gap: 16px;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px; color: var(--fg2);
}
.cst-var-bytype b { color: var(--fg1); font-variant-numeric: tabular-nums; }
.cst-var-note {
  display: flex; gap: 8px;
  margin: 12px 0 0; padding: 10px 12px;
  background: var(--warning-bg);
  border-radius: 10px;
  font-size: 11.5px; line-height: 1.5; color: var(--mostaza-800);
}
.cst-var-note .iconify { width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px; }

.cst-closes {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.cst-close-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.cst-close-row:last-child { border-bottom: none; }
.cst-close-ico {
  width: 34px; height: 34px; border-radius: 10px;
  background: var(--bg2); color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.cst-close-ico .iconify { width: 16px; height: 16px; }
.cst-close-body { flex: 1; min-width: 0; }
.cst-close-period { font-size: 14px; font-weight: 600; color: var(--fg1); text-transform: capitalize; }
.cst-close-sub { font-size: 11.5px; color: var(--fg3); }
.cst-close-figures { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; }
.cst-close-rev { font-size: 14px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }
.cst-close-contrib { font-size: 11px; color: var(--fg3); font-variant-numeric: tabular-nums; }

.cst-suggest-form { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }
.cst-suggest-current {
  display: flex; flex-wrap: wrap; gap: 12px;
  font-size: 12.5px; color: var(--fg2);
  padding: 12px; border-radius: 10px; background: var(--bg2);
}
.cst-suggest-current b { color: var(--fg1); font-variant-numeric: tabular-nums; }
.cst-suggest-result {
  display: flex; flex-direction: column; gap: 2px; align-items: center;
  padding: 16px; border-radius: 12px;
  background: linear-gradient(150deg, var(--crema-50) 0%, var(--crema-200) 100%);
  border: 1px solid var(--terracotta-100);
}
.cst-suggest-result-label { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--terracotta-700); }
.cst-suggest-result-val { font-size: 28px; font-weight: 700; color: var(--fg1); font-variant-numeric: tabular-nums; }
.cst-suggest-result-sub { font-size: 12px; color: var(--fg3); }

@media (max-width: 560px) {
  .cst-totals { grid-template-columns: 1fr; }
  .cst-var-grid { grid-template-columns: 1fr; }
  .cst-hdr-btn span { display: none; }
}
</style>
