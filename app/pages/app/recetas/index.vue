<script setup lang="ts">
import type { Recipe } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Recetas — GastronomIA' })

const router = useRouter()

type FilterId = 'all' | 'low' | 'cat'
type SortId = 'margin-asc' | 'margin-desc' | 'top-sellers' | 'alpha' | 'recent'

interface SortOption {
  id: SortId
  label: string
  desc: string
  icon: string
}

const SORT_OPTIONS: SortOption[] = [
  { id: 'margin-asc', label: 'Margen ascendente', desc: 'Peor primero (default)', icon: 'i-lucide-arrow-down-narrow-wide' },
  { id: 'margin-desc', label: 'Margen descendente', desc: 'Mejor primero', icon: 'i-lucide-arrow-up-narrow-wide' },
  { id: 'top-sellers', label: 'Más vendidos', desc: 'Por ventas de la semana', icon: 'i-lucide-flame' },
  { id: 'alpha', label: 'Alfabético', desc: 'A → Z', icon: 'i-lucide-a-arrow-down' },
  { id: 'recent', label: 'Más recientes', desc: 'Últimos creados', icon: 'i-lucide-clock' },
]

const { data: recipes } = useRecipes()

const query = ref('')
const activeFilter = ref<FilterId>('all')
const catExpanded = ref(false)
const activeCat = ref<string | null>(null)
const sort = ref<SortId>('margin-asc')
const showSort = ref(false)

const allRecipes = computed<Recipe[]>(() => recipes.value ?? [])

/** Las sub-recetas (Bases) no se venden: quedan fuera de los KPIs de margen. */
function isSub(r: Recipe): boolean {
  return r.kind === 'sub_recipe'
}
const dishes = computed<Recipe[]>(() => allRecipes.value.filter(r => !isSub(r)))

const categories = computed<string[]>(() => {
  const seen: string[] = []
  for (const r of allRecipes.value) {
    if (!seen.includes(r.category)) seen.push(r.category)
  }
  return seen
})

const lowMarginCount = computed(() => dishes.value.filter(r => r.marginPct < 20).length)

const avgMargin = computed(() => {
  const list = dishes.value
  if (!list.length) return 0
  return Math.round(list.reduce((a, r) => a + r.marginPct, 0) / list.length)
})

// En los ordenamientos por margen las bases van al final.
const sorters: Record<SortId, (a: Recipe, b: Recipe) => number> = {
  'margin-asc': (a, b) => (isSub(a) ? Infinity : a.marginPct) - (isSub(b) ? Infinity : b.marginPct),
  'margin-desc': (a, b) => (isSub(b) ? -Infinity : b.marginPct) - (isSub(a) ? -Infinity : a.marginPct),
  'top-sellers': (a, b) => b.soldToday - a.soldToday,
  'alpha': (a, b) => a.name.localeCompare(b.name, 'es'),
  // La fake API inserta lo más nuevo al inicio: conservar el orden original.
  'recent': () => 0,
}

const visible = computed<Recipe[]>(() => {
  let list = allRecipes.value.slice()
  if (activeFilter.value === 'low') {
    list = list.filter(r => !isSub(r) && r.marginPct < 20)
  }
  else if (activeFilter.value === 'cat' && activeCat.value) {
    list = list.filter(r => r.category === activeCat.value)
  }
  const q = query.value.trim().toLowerCase()
  if (q) {
    list = list.filter(r =>
      r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q),
    )
  }
  return list.sort(sorters[sort.value])
})

const sortLabel = computed(() => SORT_OPTIONS.find(o => o.id === sort.value)?.label ?? '')

function severityClass(r: Recipe): string {
  if (isSub(r)) return 'sev-high'
  if (r.marginPct < 20) return 'sev-low'
  if (r.marginPct < 30) return 'sev-mid'
  return 'sev-high'
}

function marginClass(m: number): string {
  if (m < 20) return 'low'
  if (m <= 30) return 'mid'
  return 'high'
}

/** Como el prototipo: enteros sin decimales (S/ 38 · Costo S/ 31.20). */
function fmtShort(v: number): string {
  return v % 1 === 0 ? `${v}` : v.toFixed(2)
}

function isEstimated(r: Recipe): boolean {
  return r.items.some(it => it.cost === 0)
}

function selectAll(): void {
  activeFilter.value = 'all'
  activeCat.value = null
}

function selectLow(): void {
  activeFilter.value = 'low'
  activeCat.value = null
  catExpanded.value = false
}

function toggleCat(c: string): void {
  activeCat.value = activeCat.value === c ? null : c
  activeFilter.value = activeCat.value ? 'cat' : 'all'
}

function pickSort(id: SortId): void {
  sort.value = id
  showSort.value = false
}
</script>

<template>
  <div class="rcp-page">
    <!-- ============ Header ============ -->
    <header class="rcp-hdr">
      <button class="icon-btn" aria-label="Volver" @click="router.back()">
        <UIcon name="i-lucide-arrow-left" />
      </button>
      <h1 class="rcp-title">
        Recetas
        <span class="rcp-role" aria-label="Solo dueño">
          <UIcon name="i-lucide-lock" /> Dueño
        </span>
      </h1>
      <NuxtLink to="/app/recetas/nueva" class="rcp-new" aria-label="Crear nueva receta">
        <UIcon name="i-lucide-plus" /> Nueva
      </NuxtLink>
    </header>

    <!-- ============ Resumen ============ -->
    <div class="rcp-summary" aria-label="Resumen">
      <div>
        <div class="rcp-sum-label">Platos</div>
        <div class="rcp-sum-val">{{ dishes.length }}</div>
      </div>
      <div class="div" />
      <div>
        <div class="rcp-sum-label">Margen prom.</div>
        <div class="rcp-sum-val" :class="{ success: avgMargin >= 30 }">
          {{ avgMargin }}<span class="unit">%</span>
        </div>
      </div>
      <div class="div" />
      <div>
        <div class="rcp-sum-label">En riesgo</div>
        <div class="rcp-sum-val" :class="{ danger: lowMarginCount > 0 }">
          {{ lowMarginCount }}<span class="unit">{{ lowMarginCount === 1 ? 'plato' : 'platos' }}</span>
        </div>
      </div>
    </div>

    <!-- ============ Búsqueda ============ -->
    <div class="rcp-search">
      <UIcon name="i-lucide-search" />
      <input
        v-model="query"
        type="search"
        placeholder="Buscar plato o categoría…"
        aria-label="Buscar recetas"
      >
      <button v-if="query" class="clear" aria-label="Limpiar búsqueda" @click="query = ''">
        <UIcon name="i-lucide-x" />
      </button>
    </div>

    <!-- ============ Filtros ============ -->
    <div class="rcp-chip-rail" role="tablist" aria-label="Filtros de recetas">
      <button
        role="tab"
        :aria-selected="activeFilter === 'all'"
        class="rcp-chip"
        :class="{ active: activeFilter === 'all' }"
        @click="selectAll"
      >
        Todos
      </button>
      <button
        role="tab"
        :aria-selected="activeFilter === 'low'"
        class="rcp-chip alert"
        :class="{ active: activeFilter === 'low' }"
        @click="selectLow"
      >
        <UIcon name="i-lucide-alert-triangle" /> Margen bajo
        <span class="chip-badge">{{ lowMarginCount }}</span>
      </button>
      <button
        role="tab"
        :aria-selected="catExpanded"
        class="rcp-chip cat"
        :class="{ expanded: catExpanded }"
        @click="catExpanded = !catExpanded"
      >
        <UIcon name="i-lucide-tag" /> Por categoría
        <UIcon :name="catExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
      </button>
    </div>

    <div v-if="catExpanded" class="rcp-cat-rail" role="tablist" aria-label="Categorías">
      <button
        v-for="c in categories"
        :key="c"
        role="tab"
        :aria-selected="activeCat === c"
        class="rcp-chip sub"
        :class="{ active: activeCat === c }"
        @click="toggleCat(c)"
      >
        {{ c }}
      </button>
    </div>

    <!-- ============ Orden ============ -->
    <div class="rcp-sort" aria-label="Ordenamiento">
      <button class="rcp-sort-btn" aria-haspopup="dialog" @click="showSort = true">
        Ordenado por: <b>{{ sortLabel }}</b>
        <UIcon name="i-lucide-chevron-down" />
      </button>
      <span class="count"><b>{{ visible.length }}</b> {{ visible.length === 1 ? 'plato' : 'platos' }}</span>
    </div>

    <!-- ============ Listado ============ -->
    <div v-if="visible.length > 0" class="rcp-list" role="list">
      <NuxtLink
        v-for="r in visible"
        :key="r.id"
        role="listitem"
        class="rcp-card"
        :class="severityClass(r)"
        :to="`/app/recetas/${r.id}`"
        :aria-label="isSub(r) ? `${r.name}, sub-receta` : `${r.name}, margen ${r.marginPct}%`"
      >
        <div class="rcp-thumb" aria-hidden="true">
          <span class="emoji">{{ r.emoji ?? '🍽️' }}</span>
        </div>
        <div class="rcp-card-body">
          <div class="rcp-name">{{ r.name }}</div>
          <div class="rcp-cat-tag">
            {{ r.category }}
            <span v-if="!r.active" class="rcp-off">Inactivo</span>
          </div>
          <div class="rcp-prices">
            <template v-if="!isSub(r)">
              <span class="price">S/ {{ fmtShort(r.sellPrice) }}</span>
              <span class="sep">·</span>
            </template>
            <span class="cost-label">Costo S/ {{ fmtShort(r.cost) }}</span>
          </div>
        </div>
        <div v-if="isSub(r)" class="rcp-margin sub">
          <div class="badge">Base</div>
        </div>
        <div v-else class="rcp-margin" :class="marginClass(r.marginPct)">
          <div class="badge">{{ r.marginPct }}<span class="pct">%</span></div>
          <span v-if="isEstimated(r)" class="rcp-est" title="Margen estimado: insumos sin costo">
            <UIcon name="i-lucide-info" /> estimado
          </span>
        </div>
      </NuxtLink>
    </div>

    <!-- ============ Vacío ============ -->
    <div v-else class="rcp-empty" role="status">
      <div class="illus" aria-hidden="true">
        <UIcon name="i-lucide-utensils-crossed" />
      </div>
      <h3>Aún no tienes recetas</h3>
      <p>Crea tu primer plato para empezar a calcular márgenes y costos automáticamente.</p>
      <NuxtLink to="/app/recetas/nueva" class="btn btn-primary">
        <UIcon name="i-lucide-plus" /> Crear receta
      </NuxtLink>
    </div>

    <!-- ============ Sheet: ordenar ============ -->
    <UiBottomSheet v-model="showSort" title="Ordenar por">
      <div class="sort-opts">
        <button
          v-for="o in SORT_OPTIONS"
          :key="o.id"
          class="sort-opt"
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
.rcp-page {
  max-width: 640px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}
@media (min-width: 1024px) {
  .rcp-page { padding-top: 32px; }
}

/* ============ HEADER ============ */
.rcp-hdr {
  padding: 8px 16px 14px;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 8px;
}
/* .rcp-back → .icon-btn global (components.css) */
.rcp-title {
  font-family: var(--font-sans);
  font-size: 20px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--fg1);
  text-align: center;
  margin: 0;
  line-height: 1;
}
.rcp-role {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--terracotta-700);
  background: var(--terracotta-100);
  padding: 2px 7px;
  border-radius: 999px;
  margin-left: 6px;
  vertical-align: middle;
}
.rcp-role .iconify { width: 9px; height: 9px; }
.rcp-new {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--terracotta);
  color: var(--crema-100);
  border: none;
  padding: 8px 12px;
  font-family: var(--font-sans);
  font-size: 13px; font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  text-decoration: none;
  transition: background var(--dur);
}
.rcp-new:hover { background: var(--terracotta-700); }
.rcp-new:active { transform: scale(0.97); }
.rcp-new .iconify { width: 14px; height: 14px; }

/* ============ SUMMARY STRIP ============ */
.rcp-summary {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  display: grid;
  grid-template-columns: 1fr 1px 1fr 1px 1fr;
  gap: 0 12px;
  align-items: center;
}
.rcp-summary .div { background: var(--border-subtle); height: 28px; align-self: center; }
.rcp-sum-label {
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  margin-bottom: 4px;
}
.rcp-sum-val {
  font-family: var(--font-sans);
  font-weight: 600; font-size: 18px;
  letter-spacing: -0.01em;
  color: var(--fg1);
  line-height: 1;
}
.rcp-sum-val .unit { font-size: 11px; color: var(--fg3); font-weight: 500; margin-left: 2px; }
.rcp-sum-val.danger { color: var(--danger); }
.rcp-sum-val.success { color: var(--oliva-700); }

/* ============ SEARCH ============ */
.rcp-search {
  margin: 0 16px 10px;
  display: flex; align-items: center; gap: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0 14px;
  height: 44px;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.rcp-search:focus-within {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
}
.rcp-search > .iconify { width: 18px; height: 18px; color: var(--fg3); flex-shrink: 0; }
.rcp-search input {
  flex: 1;
  border: none; outline: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--fg1);
  min-width: 0;
}
.rcp-search input::placeholder { color: var(--fg3); }
.rcp-search .clear {
  width: 22px; height: 22px; border-radius: 50%;
  border: none; cursor: pointer;
  background: var(--crema-200);
  color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
}
.rcp-search .clear .iconify { width: 12px; height: 12px; color: var(--fg2); }

/* ============ FILTER CHIPS ============ */
.rcp-chip-rail {
  margin-bottom: 4px;
  display: flex; gap: 8px;
  padding: 0 16px 4px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.rcp-chip-rail::-webkit-scrollbar { display: none; }
.rcp-chip {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg2);
  font-family: var(--font-sans);
  font-size: 13px; font-weight: 500;
  padding: 7px 13px;
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--dur), color var(--dur), border-color var(--dur);
  white-space: nowrap;
}
.rcp-chip:hover { background: var(--crema-100); }
.rcp-chip .iconify { width: 13px; height: 13px; }
.rcp-chip.active {
  background: var(--espresso);
  color: var(--crema-100);
  border-color: var(--espresso);
}
.rcp-chip.alert {
  background: var(--danger-bg);
  color: var(--danger);
  border-color: rgba(179, 58, 42, 0.22);
}
.rcp-chip.alert.active {
  background: var(--danger);
  color: var(--crema-100);
  border-color: var(--danger);
}
.rcp-chip .chip-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px;
  background: var(--danger);
  color: var(--crema-100);
  font-size: 10px; font-weight: 700;
  margin-left: 2px;
}
.rcp-chip.alert.active .chip-badge {
  background: var(--crema-100);
  color: var(--danger);
}
.rcp-chip.cat {
  background: transparent;
  border-style: dashed;
  border-color: var(--border-strong);
}
.rcp-chip.cat.expanded {
  background: var(--crema-200);
  border-style: solid;
}

/* fila secundaria de categorías */
.rcp-cat-rail {
  display: flex; gap: 6px;
  padding: 0 16px 4px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 4px;
  animation: catSlide 220ms var(--ease-emphasis);
}
.rcp-cat-rail::-webkit-scrollbar { display: none; }
@keyframes catSlide {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.rcp-chip.sub {
  font-size: 12px;
  padding: 5px 11px;
  background: transparent;
  border-color: var(--border);
  color: var(--fg2);
}
.rcp-chip.sub.active {
  background: var(--terracotta-100);
  color: var(--terracotta-700);
  border-color: var(--terracotta-300);
}

/* ============ SORT BAR ============ */
.rcp-sort {
  margin: 8px 16px 12px;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px;
  color: var(--fg3);
}
.rcp-sort .count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg3);
}
.rcp-sort .count b { color: var(--fg1); font-weight: 600; }
.rcp-sort-btn {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 12px; font-weight: 500;
  color: var(--fg2);
}
.rcp-sort-btn b { color: var(--fg1); font-weight: 600; margin-left: 4px; }
.rcp-sort-btn .iconify { width: 13px; height: 13px; color: var(--fg3); }

/* ============ RECIPE LIST ============ */
.rcp-list {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 0 16px;
}
.rcp-card {
  display: flex; align-items: stretch; gap: 12px;
  min-height: 80px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  text-decoration: none;
  width: 100%;
  position: relative;
  transition: background var(--dur), border-color var(--dur), transform 80ms;
}
.rcp-card:hover { background: var(--crema-50); }
.rcp-card:active { transform: scale(0.995); }
.rcp-card::before {
  content: '';
  position: absolute;
  left: 0; top: 14px; bottom: 14px;
  width: 3px;
  border-radius: 0 3px 3px 0;
}
.rcp-card.sev-low::before { background: var(--danger); }
.rcp-card.sev-mid::before { background: var(--mostaza); }
.rcp-card.sev-high::before { background: transparent; }
.rcp-card.sev-low { border-color: rgba(179, 58, 42, 0.18); }
.rcp-card.sev-mid { border-color: rgba(176, 130, 46, 0.16); }

.rcp-thumb {
  width: 64px; height: 64px;
  border-radius: 10px;
  background:
    repeating-linear-gradient(
      135deg,
      var(--crema-200) 0 6px,
      var(--crema-100) 6px 12px
    );
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  overflow: hidden;
}
.rcp-thumb .emoji { font-size: 28px; }

.rcp-card-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.rcp-name {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  letter-spacing: -0.01em;
  color: var(--fg1);
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rcp-cat-tag {
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg3);
  margin-top: 1px;
  display: inline-flex; align-items: center; gap: 6px;
}
.rcp-off {
  background: var(--crema-200);
  color: var(--fg3);
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 9.5px; font-weight: 700;
}
.rcp-prices {
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg2);
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap;
}
.rcp-prices .price { color: var(--fg1); font-weight: 500; }
.rcp-prices .sep { color: var(--fg3); }
.rcp-prices .cost-label { color: var(--fg3); }

.rcp-margin {
  flex-shrink: 0;
  display: flex; flex-direction: column; align-items: flex-end;
  justify-content: center;
  gap: 4px;
  min-width: 64px;
}
.rcp-margin .badge {
  display: inline-flex; align-items: baseline;
  font-family: var(--font-sans);
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 22px;
  padding: 6px 10px;
  border-radius: 10px;
  line-height: 1;
}
.rcp-margin .badge .pct { font-size: 12px; font-weight: 600; margin-left: 1px; opacity: 0.85; }
.rcp-margin.low .badge {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid rgba(179, 58, 42, 0.18);
}
.rcp-margin.mid .badge {
  background: var(--warning-bg);
  color: var(--mostaza-700);
  border: 1px solid rgba(176, 130, 46, 0.18);
}
.rcp-margin.high .badge {
  background: var(--success-bg);
  color: var(--oliva-700);
  border: 1px solid rgba(110, 123, 97, 0.18);
}
.rcp-margin.sub .badge {
  background: var(--crema-200);
  color: var(--fg2);
  border: 1px solid var(--border-subtle);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 8px 12px;
}
.rcp-est {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--fg3);
  font-style: italic;
  display: inline-flex; align-items: center; gap: 3px;
}
.rcp-est .iconify { width: 10px; height: 10px; }

/* ============ EMPTY STATE ============ */
.rcp-empty {
  margin: 32px 16px;
  padding: 36px 24px;
  background: var(--pure-white);
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.rcp-empty .illus {
  width: 96px; height: 96px;
  border-radius: 24px;
  background:
    radial-gradient(circle at 30% 30%, var(--terracotta-100) 0%, transparent 60%),
    var(--crema-100);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--terracotta);
  margin-bottom: 4px;
}
.rcp-empty .illus .iconify { width: 44px; height: 44px; }
.rcp-empty h3 {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  color: var(--fg1);
  margin: 4px 0 0;
}
.rcp-empty p {
  font-size: 13px;
  color: var(--fg2);
  margin: 0;
  max-width: 280px;
}
.rcp-empty .btn { margin-top: 8px; }

/* ============ SHEET: ORDENAR ============ */
.sort-opts { display: flex; flex-direction: column; }
.sort-opt {
  width: 100%;
  background: transparent;
  border: none;
  padding: 14px 4px;
  display: flex; align-items: center; gap: 12px;
  font-family: var(--font-sans);
  font-size: 15px; font-weight: 500;
  color: var(--fg1);
  cursor: pointer;
  text-align: left;
  border-top: 1px solid var(--border-subtle);
  min-height: 52px;
}
.sort-opt:first-of-type { border-top: none; }
.sort-opt:hover { background: var(--crema-200); }
.sort-opt .check {
  width: 22px; height: 22px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: transparent;
}
.sort-opt.active .check { color: var(--terracotta); }
.sort-opt .check .iconify { width: 18px; height: 18px; }
.sort-opt .opt-body { flex: 1; min-width: 0; }
.sort-opt .desc {
  font-size: 11px; color: var(--fg3); margin-top: 2px;
  font-weight: 400;
}
.sort-opt.active .opt-label { color: var(--terracotta-700); font-weight: 600; }
.sort-opt .opt-ico { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }
</style>
