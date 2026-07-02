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

// Período seleccionado (YYYY-MM). Por defecto el ÚLTIMO MES COMPLETO (zona America/Lima).
// El costeo es retrospectivo: defaultear al mes en curso cuando recién empieza genera
// cifPerUnit disparado (totalUnits ≈ 0 → S/190+/u → márgenes −200% a −1100%).
// El mes anterior siempre tiene datos completos → cifPerUnit realista → márgenes sanos.
function lastCompletePeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Lima',
  }).formatToParts(new Date())
  const y = parseInt(parts.find(p => p.type === 'year')?.value ?? '1970', 10)
  const m = parseInt(parts.find(p => p.type === 'month')?.value ?? '01', 10)
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}
const period = ref(lastCompletePeriod())

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

// Alias to the shared, NaN/Infinity-safe coercion (~/utils/format, auto-imported).
// Defensive guard: this page previously had its own `Number(s ?? 0)` coercion,
// which does NOT protect against non-finite results (e.g. a period with zero
// units sold would make the backend's marginPct arrive as "Infinity"/"NaN").
// A non-finite number reaching the `margin-*` sort comparators or `.toFixed()`
// doesn't infinite-loop by itself, but it silently corrupts sort order and
// renders "Infinity%" — using the shared, hardened `toNumber()` closes that gap
// for any future data shape (e.g. an all-zero period) without duplicating logic
// already fixed in prime-cost.vue / menu-engineering.vue / reportes/index.vue.
const num = toNumber
const isLowMargin = (d: DishCost): boolean => num(d.marginPct) < MARGIN_THRESHOLD
const lowMarginCount = computed(() => dishes.value.filter(isLowMargin).length)

// Semántica del margen: rojo bajo/negativo, ámbar medio, verde alto.
function marginToneClass(pct: number): 'neg' | 'low' | 'mid' | 'high' {
  if (pct < 0) return 'neg'
  if (pct < MARGIN_THRESHOLD) return 'low'
  if (pct < 40) return 'mid'
  return 'high'
}

// Monograma editorial (iniciales) como thumbnail: el plato no trae imagen/emoji.
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase()
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
}

/* ===== Búsqueda, filtro y orden (todo client-side sobre la data ya cargada) ===== */
type FilterId = 'all' | 'low'
type SortId = 'margin-asc' | 'margin-desc' | 'contrib-desc' | 'top-sellers' | 'alpha'

interface SortOption { id: SortId, label: string, desc: string, icon: string }
const SORT_OPTIONS: SortOption[] = [
  { id: 'margin-asc', label: 'Margen ascendente', desc: 'Peor primero (por defecto)', icon: 'i-lucide-arrow-down-narrow-wide' },
  { id: 'margin-desc', label: 'Margen descendente', desc: 'Mejor primero', icon: 'i-lucide-arrow-up-narrow-wide' },
  { id: 'contrib-desc', label: 'Mayor contribución', desc: 'Aporte en S/ por plato', icon: 'i-lucide-coins' },
  { id: 'top-sellers', label: 'Más vendidos', desc: 'Por unidades del período', icon: 'i-lucide-flame' },
  { id: 'alpha', label: 'Alfabético', desc: 'A → Z', icon: 'i-lucide-a-arrow-down' },
]

const query = ref('')
const activeFilter = ref<FilterId>('all')
const sort = ref<SortId>('margin-asc')
const showSort = ref(false)

const sorters: Record<SortId, (a: DishCost, b: DishCost) => number> = {
  'margin-asc': (a, b) => num(a.marginPct) - num(b.marginPct),
  'margin-desc': (a, b) => num(b.marginPct) - num(a.marginPct),
  'contrib-desc': (a, b) => num(b.contributionMargin) - num(a.contributionMargin),
  'top-sellers': (a, b) => b.unitsSold - a.unitsSold,
  'alpha': (a, b) => a.name.localeCompare(b.name, 'es'),
}

const visible = computed<DishCost[]>(() => {
  let list = dishes.value.slice()
  if (activeFilter.value === 'low') list = list.filter(isLowMargin)
  const q = query.value.trim().toLowerCase()
  if (q) list = list.filter(d => d.name.toLowerCase().includes(q))
  return list.sort(sorters[sort.value])
})

const sortLabel = computed(() => SORT_OPTIONS.find(o => o.id === sort.value)?.label ?? '')

function pickSort(id: SortId): void {
  sort.value = id
  showSort.value = false
}

// Vista de la lista: cards (por defecto) o tabla. Solo cambia la presentación;
// ambas comparten el mismo computed `visible`.
const view = ref<'cards' | 'tabla'>('cards')

// Orden por click en los headers de la tabla: el de Margen alterna asc/desc;
// el resto fija su criterio. Reusa el mismo `sort` que el control segmentado.
function headerSort(id: SortId): void {
  if (id === 'margin-asc') sort.value = sort.value === 'margin-asc' ? 'margin-desc' : 'margin-asc'
  else sort.value = id
}
const marginArrow = computed(() => (sort.value === 'margin-desc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'))

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
    <UiScreenHeader title="Costeo y márgenes" subtitle="Costo, margen y precio por plato" back="/app/menu" />

    <!-- Sin permiso (staff) -->
    <UiEmptyState
      v-if="!canView"
      icon="i-lucide-lock"
      title="Sin acceso al costeo"
      subtitle="El costeo y los márgenes son información de gestión: solo el propietario y el encargado pueden verlos."
    />

    <template v-else>
      <!-- Toolbar full-bleed: buscador (izq) + período y estado (der) -->
      <div class="scr-toolbar">
        <label class="cst-search scr-toolbar-search">
          <UIcon name="i-lucide-search" />
          <input v-model="query" type="search" placeholder="Buscar plato…" aria-label="Buscar plato">
          <button v-if="query" type="button" class="clear" aria-label="Limpiar búsqueda" @click="query = ''">
            <UIcon name="i-lucide-x" />
          </button>
        </label>
        <div class="scr-toolbar-right">
          <label class="cst-period">
            <span class="scr-eyebrow">Período</span>
            <input v-model="period" type="month" aria-label="Período (mes)">
          </label>
          <span v-if="isPeriodClosed" class="cst-closed-tag"><UIcon name="i-lucide-lock" /> Cerrado</span>
          <button v-else-if="hasDishes" class="cst-hdr-btn" :disabled="closing" aria-label="Cerrar período" @click="onClosePeriod">
            <UIcon :name="closing ? 'i-lucide-loader-circle' : 'i-lucide-lock'" :class="{ spin: closing }" />
            <span>Cerrar periodo</span>
          </button>
        </div>
      </div>

      <div class="scr-body">
        <div class="scr-main">
          <!-- Controles: filtros (izq) + orden y conteo (der) -->
          <div v-if="hasDishes" class="cst-controls">
            <div class="cst-chip-rail" role="tablist" aria-label="Filtros de platos">
              <button
                role="tab"
                :aria-selected="activeFilter === 'all'"
                class="cst-chip"
                :class="{ active: activeFilter === 'all' }"
                @click="activeFilter = 'all'"
              >
                Todos
              </button>
              <button
                role="tab"
                :aria-selected="activeFilter === 'low'"
                class="cst-chip alert"
                :class="{ active: activeFilter === 'low' }"
                @click="activeFilter = activeFilter === 'low' ? 'all' : 'low'"
              >
                <UIcon name="i-lucide-trending-down" /> Margen bajo
                <span class="cst-chip-badge">{{ lowMarginCount }}</span>
              </button>
            </div>
            <div class="cst-controls-right">
              <div class="cst-seg" role="tablist" aria-label="Forma de ver los platos">
                <button
                  role="tab"
                  :aria-selected="view === 'cards'"
                  class="cst-seg-btn"
                  :class="{ active: view === 'cards' }"
                  @click="view = 'cards'"
                >
                  <UIcon name="i-lucide-layout-grid" /> Cards
                </button>
                <button
                  role="tab"
                  :aria-selected="view === 'tabla'"
                  class="cst-seg-btn"
                  :class="{ active: view === 'tabla' }"
                  @click="view = 'tabla'"
                >
                  <UIcon name="i-lucide-table-2" /> Tabla
                </button>
              </div>
              <div class="cst-sort" aria-label="Ordenamiento">
                <button class="cst-sort-btn" aria-haspopup="dialog" @click="showSort = true">
                  Ordenado por: <b>{{ sortLabel }}</b>
                  <UIcon name="i-lucide-chevron-down" />
                </button>
                <span class="count"><b>{{ visible.length }}</b> {{ visible.length === 1 ? 'plato' : 'platos' }}</span>
              </div>
            </div>
          </div>

          <!-- Aviso de prorrateo + márgenes bajos -->
          <p class="cst-intro">
            <UIcon name="i-lucide-info" />
            El <b>CIF</b> del mes se prorratea en partes iguales por unidad vendida. El <b>costo total</b> de cada plato suma ingredientes + CIF por unidad.
            <span v-if="lowMarginCount > 0" class="cst-intro-warn"> {{ lowMarginCount }} plato{{ lowMarginCount === 1 ? '' : 's' }} con margen bajo (&lt;{{ MARGIN_THRESHOLD }}%).</span>
          </p>

          <!-- Lista de platos: cards o tabla, según el toggle de vista -->
          <section v-if="hasDishes" class="cst-section" aria-label="Costo y margen por plato">
            <template v-if="visible.length > 0">
              <!-- Vista Cards -->
              <div v-if="view === 'cards'" class="cst-grid" role="list">
              <article
                v-for="d in visible"
                :key="d.menuItemId"
                role="listitem"
                class="cst-card"
                :class="marginToneClass(num(d.marginPct))"
              >
                <div class="cst-card-head">
                  <div class="cst-thumb" aria-hidden="true">{{ monogram(d.name) }}</div>
                  <div class="cst-card-id">
                    <h3 class="cst-card-name">{{ d.name }}</h3>
                    <p class="cst-card-meta">
                      <span>{{ d.unitsSold }} {{ d.unitsSold === 1 ? 'unidad' : 'unidades' }}</span>
                      <span class="dot" aria-hidden="true">·</span>
                      <span>Food cost {{ num(d.foodCostPct).toFixed(1) }}%</span>
                    </p>
                  </div>
                  <div class="cst-badge" :class="marginToneClass(num(d.marginPct))" :aria-label="`Margen ${num(d.marginPct).toFixed(1)}%`">
                    <UIcon v-if="num(d.marginPct) < 0" name="i-lucide-trending-down" />
                    <span class="val">{{ num(d.marginPct).toFixed(1) }}</span><span class="pct">%</span>
                  </div>
                </div>

                <dl class="cst-stats">
                  <div class="cst-stat">
                    <dt>Precio</dt>
                    <dd>{{ formatPEN(num(d.sellPrice)) }}</dd>
                  </div>
                  <div class="cst-stat">
                    <dt>Ingred.</dt>
                    <dd>{{ formatPEN(num(d.ingredientCost)) }}</dd>
                  </div>
                  <div class="cst-stat">
                    <dt>CIF / u</dt>
                    <dd>{{ formatPEN(num(d.cifPerUnit)) }}</dd>
                  </div>
                  <div class="cst-stat">
                    <dt>Costo total</dt>
                    <dd class="strong">{{ formatPEN(num(d.fullCost)) }}</dd>
                  </div>
                  <div class="cst-stat">
                    <dt>Contrib.</dt>
                    <dd>{{ formatPEN(num(d.contributionMargin)) }}</dd>
                  </div>
                </dl>

                <div class="cst-card-foot">
                  <button class="cst-adjust" :aria-label="`Ajustar precio de ${d.name}`" @click="openSuggest(d)">
                    <UIcon name="i-lucide-wand-2" /> Ajustar precio
                  </button>
                </div>
              </article>
              </div>

              <!-- Vista Tabla -->
              <div v-else class="cst-table-wrap">
                <table class="cst-table">
                  <thead>
                    <tr>
                      <th class="left">
                        <button class="cst-th-sort" :class="{ active: sort === 'alpha' }" @click="headerSort('alpha')">
                          Plato <UIcon v-if="sort === 'alpha'" name="i-lucide-arrow-down" />
                        </button>
                      </th>
                      <th>Precio</th>
                      <th>Ingred.</th>
                      <th>CIF/u</th>
                      <th>Costo total</th>
                      <th>Food&nbsp;cost</th>
                      <th>
                        <button class="cst-th-sort" :class="{ active: sort.startsWith('margin') }" @click="headerSort('margin-asc')">
                          Margen <UIcon v-if="sort.startsWith('margin')" :name="marginArrow" />
                        </button>
                      </th>
                      <th>
                        <button class="cst-th-sort" :class="{ active: sort === 'contrib-desc' }" @click="headerSort('contrib-desc')">
                          Contrib. <UIcon v-if="sort === 'contrib-desc'" name="i-lucide-arrow-down" />
                        </button>
                      </th>
                      <th>
                        <button class="cst-th-sort" :class="{ active: sort === 'top-sellers' }" @click="headerSort('top-sellers')">
                          Uds. <UIcon v-if="sort === 'top-sellers'" name="i-lucide-arrow-down" />
                        </button>
                      </th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="d in visible"
                      :key="d.menuItemId"
                      :class="{ low: isLowMargin(d) }"
                      @click="openSuggest(d)"
                    >
                      <td class="left">
                        <div class="cst-tplato">
                          <span class="cst-tthumb" aria-hidden="true">{{ monogram(d.name) }}</span>
                          <span class="cst-tplato-body">
                            <span class="cst-tplato-name">{{ d.name }}</span>
                            <span class="cst-tplato-meta">{{ d.unitsSold }} {{ d.unitsSold === 1 ? 'unidad' : 'unidades' }} · Food cost {{ num(d.foodCostPct).toFixed(1) }}%</span>
                          </span>
                        </div>
                      </td>
                      <td>{{ formatPEN(num(d.sellPrice)) }}</td>
                      <td>{{ formatPEN(num(d.ingredientCost)) }}</td>
                      <td>{{ formatPEN(num(d.cifPerUnit)) }}</td>
                      <td class="strong">{{ formatPEN(num(d.fullCost)) }}</td>
                      <td>{{ num(d.foodCostPct).toFixed(1) }}%</td>
                      <td>
                        <span class="cst-tbadge" :class="marginToneClass(num(d.marginPct))">
                          <UIcon v-if="num(d.marginPct) < 0" name="i-lucide-trending-down" />
                          {{ num(d.marginPct).toFixed(1) }}%
                        </span>
                      </td>
                      <td>{{ formatPEN(num(d.contributionMargin)) }}</td>
                      <td>{{ d.unitsSold }}</td>
                      <td>
                        <button class="cst-row-btn" :aria-label="`Ajustar precio de ${d.name}`" @click.stop="openSuggest(d)">
                          <UIcon name="i-lucide-wand-2" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <UiEmptyState
              v-else
              icon="i-lucide-search-x"
              title="Sin resultados"
              subtitle="No hay platos que coincidan con la búsqueda o el filtro. Prueba con otro término o quita el filtro de margen bajo."
            />
          </section>

          <UiEmptyState
            v-else-if="!isLoading"
            icon="i-lucide-calculator"
            title="Sin datos de costeo este mes"
            :subtitle="`No hay platos activos o ventas en ${periodLabel(period)}. Carga los CIF en Ajustes › Costos indirectos y registra ventas para ver márgenes.`"
          />
        </div>

        <aside class="scr-aside cst-rail" aria-label="Resumen, herramientas y comparativos">
          <!-- Resumen del período: prorrateo del CIF -->
          <section v-if="report" class="scr-panel">
            <header class="scr-panel-head">
              <span class="scr-eyebrow">Período</span>
              <h3 class="scr-panel-title cst-cap">{{ periodLabel(period) }}</h3>
            </header>
            <dl class="scr-stats">
              <div class="scr-stat">
                <dt>CIF total</dt>
                <dd>{{ formatPEN(num(report.totalCIF)) }}</dd>
              </div>
              <div class="scr-stat">
                <dt>Unidades vendidas</dt>
                <dd>{{ report.totalUnits }}</dd>
              </div>
              <div class="scr-stat">
                <dt>CIF por unidad</dt>
                <dd>{{ formatPEN(num(report.cifPerUnit)) }}</dd>
              </div>
            </dl>
          </section>

          <!-- Herramienta de sugerencia de precio -->
          <button v-if="hasDishes" class="cst-suggest-cta" @click="openSuggest()">
            <span class="cst-suggest-ico" aria-hidden="true"><UIcon name="i-lucide-wand-2" /></span>
            <span class="cst-suggest-text">
              <span class="cst-suggest-title">Sugerir precio para un margen objetivo</span>
              <span class="cst-suggest-sub">Elige un plato y el margen que buscas</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="cst-suggest-arrow" aria-hidden="true" />
          </button>

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
        </aside>
      </div>
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

    <!-- Ordenar platos -->
    <UiBottomSheet v-model="showSort" title="Ordenar por">
      <div class="cst-sort-opts">
        <button
          v-for="o in SORT_OPTIONS"
          :key="o.id"
          class="cst-sort-opt"
          :class="{ active: sort === o.id }"
          @click="pickSort(o.id)"
        >
          <span class="check"><UIcon name="i-lucide-check" /></span>
          <div class="opt-body">
            <div class="opt-label">{{ o.label }}</div>
            <div class="desc">{{ o.desc }}</div>
          </div>
          <UIcon :name="o.icon" class="opt-ico" />
        </button>
      </div>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.cst-screen {
  padding-bottom: 8px;
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

/* ===== Toolbar full-bleed: buscador (izq) + período/estado (der) ===== */
/* .scr-toolbar / .scr-toolbar-search / .scr-toolbar-right son globales (components.css) */
.cst-search {
  display: flex; align-items: center; gap: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0 14px; height: 42px;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.cst-search:focus-within { border-color: var(--terracotta); box-shadow: var(--focus-ring); }
.cst-search > .iconify { width: 18px; height: 18px; color: var(--fg3); flex-shrink: 0; }
.cst-search input {
  flex: 1; min-width: 0;
  border: none; outline: none; background: transparent;
  font: inherit; font-size: 15px; color: var(--fg1);
}
.cst-search input::placeholder { color: var(--fg3); }
.cst-search .clear {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  border: none; cursor: pointer;
  background: var(--crema-200); color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
}
.cst-search .clear .iconify { width: 12px; height: 12px; }

.cst-period { display: inline-flex; align-items: center; gap: 8px; }
.cst-period .scr-eyebrow { white-space: nowrap; }
.cst-period input {
  font: inherit; font-size: 14px; color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
}
.cst-period input:focus { outline: none; border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.cst-closed-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 700;
  background: var(--crema-200); color: var(--fg2);
  padding: 5px 10px; border-radius: 999px;
  margin-bottom: 4px;
}
.cst-closed-tag .iconify { width: 12px; height: 12px; }

/* ===== Controles: chips de filtro (izq) + orden y conteo (der) ===== */
.cst-controls {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px 16px;
  margin-bottom: 14px;
}
.cst-chip-rail { display: flex; gap: 8px; flex-wrap: wrap; min-width: 0; }
.cst-chip {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pure-white); border: 1px solid var(--border); color: var(--fg2);
  font: inherit; font-size: 13px; font-weight: 500;
  padding: 7px 13px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  transition: background var(--dur), color var(--dur), border-color var(--dur);
}
.cst-chip:hover { background: var(--crema-100); }
.cst-chip .iconify { width: 13px; height: 13px; }
.cst-chip.active { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.cst-chip.alert { background: var(--danger-bg); color: var(--danger); border-color: rgba(179, 58, 42, 0.22); }
.cst-chip.alert.active { background: var(--danger); color: var(--crema-100); border-color: var(--danger); }
.cst-chip-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--danger); color: var(--crema-100); font-size: 10px; font-weight: 700;
  margin-left: 2px;
}
.cst-chip.alert.active .cst-chip-badge { background: var(--crema-100); color: var(--danger); }

.cst-sort { display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; }
.cst-sort-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: none; padding: 4px 0; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 500; color: var(--fg2);
}
.cst-sort-btn b { color: var(--fg1); font-weight: 600; margin-left: 4px; }
.cst-sort-btn .iconify { width: 13px; height: 13px; color: var(--fg3); }
.cst-sort .count { font-size: 11px; color: var(--fg3); font-variant-numeric: tabular-nums; }
.cst-sort .count b { color: var(--fg1); font-weight: 600; }

.cst-controls-right { display: inline-flex; align-items: center; gap: 14px; flex-wrap: wrap; }

/* Segmented Cards / Tabla (mismo patrón que los tabs de Mesas) */
.cst-seg {
  display: inline-flex;
  background: var(--crema-200);
  border-radius: 10px;
  padding: 3px; gap: 2px;
}
.cst-seg-btn {
  display: inline-flex; align-items: center; gap: 5px;
  flex: 0 0 auto;
  background: transparent; border: none;
  font: inherit; font-size: 12.5px; font-weight: 600;
  color: var(--fg2);
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.cst-seg-btn:hover { color: var(--fg1); }
.cst-seg-btn.active { background: var(--pure-white); color: var(--fg1); box-shadow: var(--shadow-sm); }
.cst-seg-btn .iconify { width: 14px; height: 14px; }

/* ===== Vista Tabla (pulida: header claro, zebra sutil, números tabulares) ===== */
.cst-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  box-shadow: var(--shadow-sm);
}
.cst-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cst-table th, .cst-table td {
  padding: 11px 14px;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.cst-table th:first-child, .cst-table td:first-child { padding-left: 16px; }
.cst-table th:last-child, .cst-table td:last-child { padding-right: 14px; }
.cst-table th {
  position: sticky; top: 0; z-index: 1;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--fg3);
  border-bottom: 1px solid var(--border);
  background: var(--crema-50);
}
.cst-table th.left, .cst-table td.left { text-align: left; }
.cst-table tbody tr { border-bottom: 1px solid var(--border-subtle); cursor: pointer; }
.cst-table tbody tr:last-child { border-bottom: none; }
/* Zebra sutil para el ritmo de lectura; la fila .low gana por orden de fuente. */
.cst-table tbody tr:nth-child(even) { background: var(--crema-50); }
.cst-table tbody tr:hover { background: var(--crema-100); }
.cst-table tbody tr.low { background: var(--danger-bg); box-shadow: inset 3px 0 0 var(--danger); }
.cst-table tbody tr.low:hover { background: var(--danger-bg); }
.cst-table td.strong { font-weight: 700; color: var(--fg1); }

/* Header clickeable para reordenar */
.cst-th-sort {
  display: inline-flex; align-items: center; gap: 3px;
  font: inherit; font-size: inherit; font-weight: inherit; letter-spacing: inherit; text-transform: inherit;
  color: inherit; background: transparent; border: none; cursor: pointer; padding: 0;
}
.cst-table th.left .cst-th-sort { flex-direction: row; }
.cst-th-sort:hover { color: var(--fg1); }
.cst-th-sort.active { color: var(--terracotta-700); }
.cst-th-sort .iconify { width: 12px; height: 12px; }

/* Celda Plato: monograma + nombre + meta */
.cst-tplato { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cst-tthumb {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
  background:
    repeating-linear-gradient(135deg, var(--crema-200) 0 5px, var(--crema-100) 5px 10px);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-serif); font-size: 12.5px; font-weight: 600; color: var(--espresso-600);
}
.cst-tplato-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cst-tplato-name {
  font-family: var(--font-serif); font-style: italic; font-weight: 500; font-size: 14.5px;
  color: var(--fg1); line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;
}
.cst-tplato-meta { font-size: 10.5px; color: var(--fg3); white-space: nowrap; }

/* Badge de margen en la tabla (mismo criterio de color que las cards) */
.cst-tbadge {
  display: inline-flex; align-items: center; gap: 3px;
  font-weight: 700; font-size: 12px;
  padding: 3px 8px; border-radius: 8px;
  font-variant-numeric: tabular-nums;
}
.cst-tbadge .iconify { width: 12px; height: 12px; }
.cst-tbadge.low, .cst-tbadge.neg { background: var(--danger-bg); color: var(--danger); }
.cst-tbadge.mid { background: var(--warning-bg); color: var(--mostaza-700); }
.cst-tbadge.high { background: var(--success-bg); color: var(--oliva-700); }

.cst-row-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--crema-100); color: var(--terracotta-700);
  border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.cst-row-btn:hover { background: var(--crema-200); }
.cst-row-btn .iconify { width: 14px; height: 14px; }

/* ===== Riel lateral: panel resumen + herramientas apiladas ===== */
.cst-rail { display: flex; flex-direction: column; gap: 14px; }
.cst-cap { text-transform: capitalize; }

/* ===== Aviso de prorrateo ===== */
.cst-intro {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
  font-size: 12.5px; color: var(--fg2); line-height: 1.5;
  margin: 0 0 14px;
}
.cst-intro .iconify { width: 14px; height: 14px; color: var(--fg3); flex-shrink: 0; }
.cst-intro-warn { color: var(--danger); font-weight: 600; }

.cst-section { margin: 0; }
.cst-section-title { font-size: 15px; font-weight: 600; color: var(--fg1); margin: 0 0 12px; }

/* ===== Grilla de cards por plato ===== */
.cst-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.cst-card {
  position: relative;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px 16px 12px;
  display: flex; flex-direction: column; gap: 12px;
  overflow: hidden;
}
/* Rail de severidad por margen (señal lateral discreta, no tiñe la card entera) */
.cst-card::before {
  content: '';
  position: absolute; left: 0; top: 14px; bottom: 14px;
  width: 3px; border-radius: 0 3px 3px 0;
}
.cst-card.low::before, .cst-card.neg::before { background: var(--danger); }
.cst-card.mid::before { background: var(--mostaza); }
.cst-card.high::before { background: transparent; }
.cst-card.low, .cst-card.neg { border-color: rgba(179, 58, 42, 0.18); }
.cst-card.mid { border-color: rgba(176, 130, 46, 0.16); }

.cst-card-head { display: flex; align-items: flex-start; gap: 12px; }
.cst-thumb {
  width: 46px; height: 46px; border-radius: 12px; flex-shrink: 0;
  background:
    repeating-linear-gradient(
      135deg,
      var(--crema-200) 0 6px,
      var(--crema-100) 6px 12px
    );
  border: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-serif); font-size: 16px; font-weight: 600;
  color: var(--espresso-600); letter-spacing: 0.02em;
}
.cst-card-id { flex: 1; min-width: 0; }
.cst-card-name {
  margin: 0;
  font-family: var(--font-serif); font-style: italic; font-weight: 500;
  font-size: 17px; line-height: 1.2; letter-spacing: -0.01em;
  color: var(--fg1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cst-card-meta {
  margin: 3px 0 0;
  font-size: 11.5px; color: var(--fg3);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.cst-card-meta .dot { color: var(--border-strong); }

.cst-badge {
  flex-shrink: 0;
  display: inline-flex; align-items: baseline; gap: 1px;
  font-family: var(--font-sans); font-weight: 700; letter-spacing: -0.02em;
  font-size: 20px; line-height: 1;
  padding: 7px 11px; border-radius: 11px;
  font-variant-numeric: tabular-nums;
}
.cst-badge .pct { font-size: 12px; font-weight: 600; opacity: 0.85; }
.cst-badge .iconify { width: 15px; height: 15px; align-self: center; margin-right: 2px; }
.cst-badge.low, .cst-badge.neg { background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(179, 58, 42, 0.18); }
.cst-badge.mid { background: var(--warning-bg); color: var(--mostaza-700); border: 1px solid rgba(176, 130, 46, 0.18); }
.cst-badge.high { background: var(--success-bg); color: var(--oliva-700); border: 1px solid rgba(110, 123, 97, 0.18); }

/* Fila de métricas de costeo (label chico + valor tabular) */
.cst-stats {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
  gap: 10px 8px;
  padding: 12px 0 2px;
  border-top: 1px solid var(--border-subtle);
}
.cst-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cst-stat dt {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--fg3); white-space: nowrap;
}
.cst-stat dd {
  margin: 0;
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.cst-stat dd.strong { font-weight: 700; }

.cst-card-foot { display: flex; justify-content: flex-end; }
.cst-adjust {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: var(--crema-100); color: var(--terracotta-700);
  border: 1px solid var(--terracotta-100); cursor: pointer;
  padding: 7px 12px; border-radius: 10px;
  transition: background var(--dur) var(--ease-standard);
}
.cst-adjust:hover { background: var(--crema-200); }
.cst-adjust:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 2px; }
.cst-adjust .iconify { width: 14px; height: 14px; }

/* ===== Herramienta: sugerir precio ===== */
.cst-suggest-cta {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
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

/* ===== Comparativo costo real vs teórico ===== */
.cst-var-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 16px;
}
/* En el riel angosto, las cifras de variación se leen como filas (label · valor) */
.cst-var-grid { display: flex; flex-direction: column; }
.cst-var-cell {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--border-subtle);
}
.cst-var-cell:first-child { border-top: none; padding-top: 0; }
.cst-var-label { font-size: 12px; color: var(--fg3); }
.cst-var-val {
  font-size: 16px; font-weight: 700; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.cst-var-val small { font-size: 11px; font-weight: 600; }
.cst-var-val.up { color: var(--danger); }
.cst-var-val.down { color: var(--oliva-700); }
.cst-var-bytype {
  display: flex; flex-wrap: wrap; gap: 8px 16px;
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

/* ===== Períodos cerrados ===== */
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
  background: var(--crema-200); color: var(--fg2);
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

/* ===== Tablet / mobile: el riel baja debajo de las cards; sin overflow horizontal ===== */
@media (max-width: 1023px) {
  /* Las cards son el contenido primario: el riel se apila DEBAJO, no encima. */
  .scr-aside { order: 0; }
}

/* En pantallas angostas la toolbar envuelve: buscador full-width arriba, período debajo. */
@media (max-width: 560px) {
  .scr-toolbar { flex-wrap: wrap; }
  .cst-search.scr-toolbar-search { flex: 1 1 100%; }
  .scr-toolbar-right { width: 100%; justify-content: flex-start; }
}

@media (max-width: 440px) {
  .cst-hdr-btn span { display: none; }
}

/* ===== Sheet: ordenar platos ===== */
.cst-sort-opts { display: flex; flex-direction: column; }
.cst-sort-opt {
  width: 100%; background: transparent; border: none;
  padding: 14px 4px; display: flex; align-items: center; gap: 12px;
  font: inherit; font-size: 15px; font-weight: 500; color: var(--fg1);
  cursor: pointer; text-align: left;
  border-top: 1px solid var(--border-subtle); min-height: 52px;
}
.cst-sort-opt:first-of-type { border-top: none; }
.cst-sort-opt:hover { background: var(--crema-200); }
.cst-sort-opt .check {
  width: 22px; height: 22px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center; color: transparent;
}
.cst-sort-opt.active .check { color: var(--terracotta); }
.cst-sort-opt .check .iconify { width: 18px; height: 18px; }
.cst-sort-opt .opt-body { flex: 1; min-width: 0; }
.cst-sort-opt .desc { font-size: 11px; color: var(--fg3); margin-top: 2px; font-weight: 400; }
.cst-sort-opt.active .opt-label { color: var(--terracotta-700); font-weight: 600; }
.cst-sort-opt .opt-ico { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

/* ===== Sheet: sugerir precio ===== */
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
</style>
