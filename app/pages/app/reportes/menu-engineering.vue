<script setup lang="ts">
// app/pages/app/reportes/menu-engineering.vue
// E07 · Ingeniería de menú — matriz 2×2 popularidad × rentabilidad.
// Muestra la clasificación star/plowhorse/puzzle/dog para el período seleccionado
// y tablas por cuadrante con la recomendación estratégica de cada plato.
// Gating: owner/manager; staff → 403 (el backend lo hace cumplir).
import {
  lastCompletePeriod,
  useMenuEngineering,
} from '~/composables/use-reports'
import type {
  MenuEngineeringReportView,
  MenuItemClassification,
} from '~~/server/api/reports/menu-engineering.get'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Ingeniería de menú — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()

const canManage = computed(
  () => user.value?.role === 'owner' || user.value?.role === 'manager',
)

// Period selector — default: last complete month so data is available.
const period = ref(lastCompletePeriod())

function periodLabel(p: string): string {
  const [y, m] = p.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })
}

// Query gated by role: staff will never reach the backend (UI hides the page
// via the sidebar manageOnly flag, but we guard here too for direct URL access).
const me = useMenuEngineering(period, () => canManage.value)

// ===== SVG scatter-matrix constants =====
// The SVG scales to 100% container width via width="100%"; the viewBox defines
// the coordinate system. PAD_L is wider to leave room for the y-axis label.
const SVG_W = 640
const SVG_H = 400
const PAD_L = 52
const PAD_R = 20
const PAD_T = 28
const PAD_B = 52
const PLOT_W = SVG_W - PAD_L - PAD_R // 568
const PLOT_H = SVG_H - PAD_T - PAD_B // 320

// Classification dot colors (hex — CSS vars cannot be resolved inside SVG attributes).
const CLASS_COLORS: Record<MenuItemClassification, string> = {
  star: '#C96A43',      // --terracotta
  plowhorse: '#D8A441', // --mostaza
  puzzle: '#6E7B61',    // --oliva
  dog: '#807B75',       // --espresso-400
}

// Quadrant fill colors (semi-transparent; purely communicative, not decorative).
const QUAD_FILLS: Record<MenuItemClassification, string> = {
  star: 'rgba(201,106,67,0.07)',
  plowhorse: 'rgba(216,164,65,0.07)',
  puzzle: 'rgba(110,123,97,0.07)',
  dog: 'rgba(128,123,117,0.06)',
}

// ===== Derived: recommendation copy =====
const RECOMMENDATION_LABELS: Record<string, string> = {
  promote:
    'Promover — destácala en la carta y considera subir ligeramente el precio',
  reprice_or_reduce_portion:
    'Rentabilizar — sube el precio o ajusta la porción sin perder popularidad',
  reposition_or_rename:
    'Reposicionar — renómbrala o describe mejor el plato; considera promocionarla',
  remove_or_rework:
    'Reevaluar — candidata a reformular o a salir de la carta',
}

const CLASS_LABEL: Record<MenuItemClassification, string> = {
  star: 'Estrella',
  plowhorse: 'Caballo de batalla',
  puzzle: 'Puzzle',
  dog: 'Perro',
}

// ===== SVG matrix computed =====

interface PlotPoint {
  id: string
  name: string
  unitsSold: number
  price: string
  contributionMargin: string
  classification: MenuItemClassification
  recommendation: string
  /** SVG x coordinate. */
  x: number
  /** SVG y coordinate (y increases downward → high CM = small y). */
  y: number
  labelAnchor: 'start' | 'end'
  labelDx: number
  labelDy: number
}

interface QuadRect { x: number; y: number; w: number; h: number }

interface MatrixData {
  points: PlotPoint[]
  xCutoffSvg: number
  yCutoffSvg: number
  /** Top-right quadrant (stars). */
  qStar: QuadRect
  /** Top-left quadrant (puzzles). */
  qPuzzle: QuadRect
  /** Bottom-right quadrant (plowhorses). */
  qHorse: QuadRect
  /** Bottom-left quadrant (dogs). */
  qDog: QuadRect
  /** Y-axis label for the current scale (e.g. "S/ 25"). */
  yAxisTopLabel: string
}

/**
 * Computes all SVG coordinates and quadrant geometry from the raw report data.
 * Returns null when there are no items (triggers empty state).
 */
const matrixData = computed((): MatrixData | null => {
  const d = me.data.value
  if (!d?.items.length) return null

  const cutoffCM = parseFloat(d.avgContributionMargin)
  // Add 20% headroom above the largest value so no dot touches the edge.
  // popularityShare/popularityCutoff are Decimal strings (see
  // MenuEngineeringReportView) — coerce with `num()` before any arithmetic.
  const maxPop = Math.max(...d.items.map(i => num(i.popularityShare))) * 1.2 || 1
  const maxCM =
    Math.max(...d.items.map(i => parseFloat(i.contributionMargin))) * 1.2 || 1

  const toX = (pop: number) => PAD_L + (pop / maxPop) * PLOT_W
  const toY = (cm: number) => PAD_T + PLOT_H - (cm / maxCM) * PLOT_H

  const xCutoffSvg = toX(num(d.popularityCutoff))
  const yCutoffSvg = toY(cutoffCM)

  const plotRight = PAD_L + PLOT_W
  const plotBottom = PAD_T + PLOT_H

  const points: PlotPoint[] = d.items.map(item => {
    const x = toX(num(item.popularityShare))
    const y = toY(parseFloat(item.contributionMargin))
    // Label placement: keep labels away from the quadrant divider and plot edges.
    const onRight = x >= xCutoffSvg
    const onTop = y <= yCutoffSvg // small y = high CM = top of plot
    return {
      id: item.menuItemId,
      name: item.name,
      unitsSold: item.unitsSold,
      price: item.price,
      contributionMargin: item.contributionMargin,
      classification: item.classification,
      recommendation: item.recommendation,
      x,
      y,
      labelAnchor: onRight ? 'end' : 'start',
      labelDx: onRight ? -11 : 11,
      // If dot is in top half, place label below (clear of the top edge);
      // if in bottom half, place label above (clear of the bottom edge).
      labelDy: onTop ? 16 : -9,
    }
  })

  return {
    points,
    xCutoffSvg,
    yCutoffSvg,
    qStar: {
      x: xCutoffSvg,
      y: PAD_T,
      w: plotRight - xCutoffSvg,
      h: yCutoffSvg - PAD_T,
    },
    qPuzzle: {
      x: PAD_L,
      y: PAD_T,
      w: xCutoffSvg - PAD_L,
      h: yCutoffSvg - PAD_T,
    },
    qHorse: {
      x: xCutoffSvg,
      y: yCutoffSvg,
      w: plotRight - xCutoffSvg,
      h: plotBottom - yCutoffSvg,
    },
    qDog: {
      x: PAD_L,
      y: yCutoffSvg,
      w: xCutoffSvg - PAD_L,
      h: plotBottom - yCutoffSvg,
    },
    yAxisTopLabel: `S/ ${maxCM.toFixed(0)}`,
  }
})

// ===== Items grouped by quadrant for the detail tables =====

type Quadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog'

const QUADRANT_ORDER: Quadrant[] = ['star', 'plowhorse', 'puzzle', 'dog']

const QUADRANT_META: Record<
  Quadrant,
  { label: string; emoji: string; note: string; colorClass: string }
> = {
  star: {
    label: 'Estrellas',
    emoji: '⭐',
    note: 'Alta popularidad, alto margen. Son el motor del negocio.',
    colorClass: 'q-star',
  },
  plowhorse: {
    label: 'Caballos de batalla',
    emoji: '🐴',
    note: 'Alta popularidad, bajo margen. Generan volumen pero erosionan el margen.',
    colorClass: 'q-horse',
  },
  puzzle: {
    label: 'Puzzles',
    emoji: '🧩',
    note: 'Alto margen, baja popularidad. Tienen potencial; necesitan más visibilidad.',
    colorClass: 'q-puzzle',
  },
  dog: {
    label: 'Perros',
    emoji: '🐕',
    note: 'Bajo margen y baja popularidad. Evaluar si justifican su lugar en la carta.',
    colorClass: 'q-dog',
  },
}

const byQuadrant = computed((): Map<Quadrant, MenuEngineeringReportView['items']> => {
  const groups = new Map<Quadrant, MenuEngineeringReportView['items']>(
    QUADRANT_ORDER.map(q => [q, []]),
  )
  for (const item of me.data.value?.items ?? []) {
    groups.get(item.classification as Quadrant)?.push(item)
  }
  return groups
})

// ===== Summary counts for the aside panel =====
const classCounts = computed(() => {
  const acc: Record<Quadrant, number> = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 }
  for (const item of me.data.value?.items ?? []) {
    acc[item.classification as Quadrant]++
  }
  return acc
})

// Decimal strings from the backend (price, contributionMargin, popularityShare,
// popularityCutoff, avgContributionMargin) — see app/utils/format.ts `toNumber`.
const num = (s: string | number | undefined | null) => toNumber(s)

// ===== Error handling =====
watch(
  () => me.error.value,
  err => {
    if (!err) return
    const status = (err as { statusCode?: number }).statusCode
    if (status === 403) {
      toast.add({
        title: 'Acceso restringido',
        description: 'Solo el propietario o gerente puede ver este análisis.',
        color: 'error',
        icon: 'i-lucide-lock',
      })
    }
  },
)
</script>

<template>
  <div class="me">
    <UiScreenHeader
      title="Ingeniería de menú"
      subtitle="Popularidad × rentabilidad por plato"
      back="/app/reportes"
    />

    <!-- Period selector -->
    <div class="me-controls">
      <div class="me-toolbar">
        <label class="me-period-field">
          <span>Período</span>
          <input
            v-model="period"
            type="month"
            aria-label="Período del análisis (mes)"
          >
        </label>
      </div>
      <div v-if="me.data.value" class="me-range-note">
        {{ periodLabel(period) }}
      </div>
    </div>

    <!--
      Guard against render exceptions from unexpected field shapes (same class
      of bug as prime-cost.vue's crash): without this, a throw here would leave
      the view stuck on the loading skeleton instead of showing a recoverable
      error state. See prime-cost.vue for the paired fix.
    -->
    <NuxtErrorBoundary>
    <div class="scr-body">
      <div class="scr-main">
        <RepError v-if="me.error.value" @retry="me.refresh()" />
        <RepLoading v-else-if="me.isLoading.value && !me.data.value" />

        <template v-else-if="me.data.value">
          <!-- ===== Hero: 2×2 scatter matrix ===== -->
          <section class="me-card" aria-label="Matriz de ingeniería de menú">
            <div class="me-card-head">
              <h2 class="me-card-title">Popularidad × rentabilidad</h2>
              <span class="me-card-meta">{{ periodLabel(period) }}</span>
            </div>

            <p class="me-hint">
              <UIcon name="i-lucide-info" aria-hidden="true" />
              Cada punto representa un plato. La línea vertical marca la popularidad
              media; la horizontal, el margen de contribución medio. El cuadrante
              determina la acción estratégica.
            </p>

            <div v-if="matrixData" class="me-matrix-wrap">
              <svg
                :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
                width="100%"
                :height="undefined"
                preserveAspectRatio="xMidYMid meet"
                role="img"
                :aria-label="`Matriz de ingeniería de menú — ${periodLabel(period)}`"
              >
                <title>Matriz de ingeniería de menú</title>
                <desc>
                  Diagrama de dispersión de platos por popularidad (eje X) y margen de
                  contribución en soles (eje Y). Dividido en cuatro cuadrantes: Estrellas
                  (alta popularidad y alto margen), Puzzles (baja popularidad, alto margen),
                  Caballos de batalla (alta popularidad, bajo margen) y Perros (baja
                  popularidad y bajo margen).
                </desc>

                <!-- Quadrant fills -->
                <rect
                  :x="matrixData.qStar.x"
                  :y="matrixData.qStar.y"
                  :width="matrixData.qStar.w"
                  :height="matrixData.qStar.h"
                  :fill="QUAD_FILLS.star"
                />
                <rect
                  :x="matrixData.qPuzzle.x"
                  :y="matrixData.qPuzzle.y"
                  :width="matrixData.qPuzzle.w"
                  :height="matrixData.qPuzzle.h"
                  :fill="QUAD_FILLS.puzzle"
                />
                <rect
                  :x="matrixData.qHorse.x"
                  :y="matrixData.qHorse.y"
                  :width="matrixData.qHorse.w"
                  :height="matrixData.qHorse.h"
                  :fill="QUAD_FILLS.plowhorse"
                />
                <rect
                  :x="matrixData.qDog.x"
                  :y="matrixData.qDog.y"
                  :width="matrixData.qDog.w"
                  :height="matrixData.qDog.h"
                  :fill="QUAD_FILLS.dog"
                />

                <!-- Plot area border -->
                <rect
                  :x="PAD_L"
                  :y="PAD_T"
                  :width="PLOT_W"
                  :height="PLOT_H"
                  fill="none"
                  stroke="rgba(26,26,26,0.10)"
                  stroke-width="1"
                />

                <!-- Reference lines (popularity cutoff vertical + avg CM horizontal) -->
                <line
                  :x1="matrixData.xCutoffSvg"
                  :y1="PAD_T"
                  :x2="matrixData.xCutoffSvg"
                  :y2="PAD_T + PLOT_H"
                  stroke="rgba(26,26,26,0.28)"
                  stroke-width="1.5"
                  stroke-dasharray="5 4"
                />
                <line
                  :x1="PAD_L"
                  :y1="matrixData.yCutoffSvg"
                  :x2="PAD_L + PLOT_W"
                  :y2="matrixData.yCutoffSvg"
                  stroke="rgba(26,26,26,0.28)"
                  stroke-width="1.5"
                  stroke-dasharray="5 4"
                />

                <!-- Quadrant labels (top-left of each quadrant) -->
                <!-- Stars (top-right) -->
                <text
                  :x="matrixData.qStar.x + 8"
                  :y="matrixData.qStar.y + 17"
                  font-size="11"
                  font-weight="700"
                  fill="rgba(168,84,47,0.80)"
                >
                  ⭐ Estrellas
                </text>
                <!-- Puzzles (top-left) -->
                <text
                  :x="matrixData.qPuzzle.x + 8"
                  :y="matrixData.qPuzzle.y + 17"
                  font-size="11"
                  font-weight="700"
                  fill="rgba(82,94,71,0.80)"
                >
                  🧩 Puzzles
                </text>
                <!-- Plowhorses (bottom-right) -->
                <text
                  :x="matrixData.qHorse.x + 8"
                  :y="matrixData.qHorse.y + 17"
                  font-size="11"
                  font-weight="700"
                  fill="rgba(176,130,46,0.80)"
                >
                  🐴 Caballos
                </text>
                <!-- Dogs (bottom-left) -->
                <text
                  :x="matrixData.qDog.x + 8"
                  :y="matrixData.qDog.y + 17"
                  font-size="11"
                  font-weight="700"
                  fill="rgba(128,123,117,0.75)"
                >
                  🐕 Perros
                </text>

                <!-- Scatter points -->
                <g
                  v-for="pt in matrixData.points"
                  :key="pt.id"
                  role="listitem"
                >
                  <circle
                    :cx="pt.x"
                    :cy="pt.y"
                    r="7"
                    :fill="CLASS_COLORS[pt.classification]"
                    opacity="0.88"
                  >
                    <title>
                      {{ pt.name }} — {{ CLASS_LABEL[pt.classification] }}
                      · S/ {{ num(pt.contributionMargin).toFixed(2) }} contrib.
                      · {{ pt.unitsSold }} und.
                    </title>
                  </circle>
                  <!-- White halo improves label legibility over quadrant fills -->
                  <text
                    :x="pt.x + pt.labelDx"
                    :y="pt.y + pt.labelDy"
                    font-size="10"
                    :text-anchor="pt.labelAnchor"
                    stroke="rgba(251,248,242,0.85)"
                    stroke-width="3"
                    paint-order="stroke"
                    fill="#2B2A28"
                  >
                    {{ pt.name.length > 16 ? pt.name.slice(0, 15) + '…' : pt.name }}
                  </text>
                </g>

                <!-- Axis labels -->
                <text
                  :x="PAD_L + PLOT_W / 2"
                  :y="SVG_H - 8"
                  font-size="10"
                  text-anchor="middle"
                  fill="#807B75"
                >
                  Popularidad (% de ventas del período)
                </text>
                <text
                  :x="12"
                  :y="PAD_T + PLOT_H / 2"
                  font-size="10"
                  text-anchor="middle"
                  fill="#807B75"
                  :transform="`rotate(-90 12 ${PAD_T + PLOT_H / 2})`"
                >
                  Margen de contribución (S/)
                </text>

                <!-- Y-axis scale hint: top value -->
                <text
                  :x="PAD_L - 4"
                  :y="PAD_T + 4"
                  font-size="9"
                  text-anchor="end"
                  fill="#807B75"
                >
                  {{ matrixData.yAxisTopLabel }}
                </text>
                <!-- Y-axis bottom: 0 -->
                <text
                  :x="PAD_L - 4"
                  :y="PAD_T + PLOT_H + 2"
                  font-size="9"
                  text-anchor="end"
                  fill="#807B75"
                >
                  S/ 0
                </text>
              </svg>
            </div>

            <UiEmptyState
              v-else
              icon="i-lucide-grid-2x2"
              title="Sin datos para este período"
              subtitle="Se necesitan ventas con recetas costeadas para calcular la ingeniería de menú."
            />
          </section>

          <!-- ===== Detail tables by quadrant ===== -->
          <template v-if="me.data.value.items.length">
            <section
              v-for="q in QUADRANT_ORDER"
              :key="q"
              class="me-card"
              :class="`me-q-${q}`"
              :aria-label="`Platos en el cuadrante ${QUADRANT_META[q].label}`"
            >
              <div class="me-card-head">
                <h2 class="me-card-title">
                  <span class="me-q-dot" :class="QUADRANT_META[q].colorClass" />
                  {{ QUADRANT_META[q].emoji }} {{ QUADRANT_META[q].label }}
                  <span class="me-q-count">({{ byQuadrant.get(q)?.length ?? 0 }})</span>
                </h2>
                <span class="me-card-meta">{{ QUADRANT_META[q].note }}</span>
              </div>

              <div
                v-if="byQuadrant.get(q)?.length"
                class="me-table-wrap"
              >
                <table class="me-table">
                  <thead>
                    <tr>
                      <th class="left">Plato</th>
                      <th>Unidades</th>
                      <th>Precio</th>
                      <th>Margen contrib.</th>
                      <th class="left">Recomendación</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in byQuadrant.get(q)"
                      :key="item.menuItemId"
                    >
                      <td class="left name">{{ item.name }}</td>
                      <td>{{ item.unitsSold }}</td>
                      <td>{{ formatPEN(num(item.price)) }}</td>
                      <td class="strong">{{ formatPEN(num(item.contributionMargin)) }}</td>
                      <td class="left rec">
                        {{ RECOMMENDATION_LABELS[item.recommendation] ?? item.recommendation }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="me-muted">
                No hay platos en este cuadrante para el período seleccionado.
              </p>
            </section>
          </template>
        </template>

        <!-- Fallback: not a manager -->
        <UiEmptyState
          v-else-if="!canManage && !me.isLoading.value"
          icon="i-lucide-lock"
          title="Acceso restringido"
          subtitle="Este análisis está disponible solo para propietarios y gerentes."
        />
      </div>

      <!-- ===== Aside: summary panel ===== -->
      <aside
        v-if="me.data.value?.items.length && canManage"
        class="scr-aside"
      >
        <section class="scr-panel">
          <header class="scr-panel-head">
            <span class="scr-eyebrow">Ingeniería de menú · {{ periodLabel(period) }}</span>
            <h3 class="scr-panel-title">
              {{ me.data.value.items.length }}<span class="scr-of"> platos</span>
            </h3>
          </header>

          <dl class="scr-stats">
            <div class="scr-stat">
              <dt>
                <span class="me-dot star" />
                Estrellas
              </dt>
              <dd>{{ classCounts.star }}</dd>
            </div>
            <div class="scr-stat">
              <dt>
                <span class="me-dot horse" />
                Caballos de batalla
              </dt>
              <dd>{{ classCounts.plowhorse }}</dd>
            </div>
            <div class="scr-stat">
              <dt>
                <span class="me-dot puzzle" />
                Puzzles
              </dt>
              <dd>{{ classCounts.puzzle }}</dd>
            </div>
            <div class="scr-stat">
              <dt>
                <span class="me-dot dog" />
                Perros
              </dt>
              <dd>{{ classCounts.dog }}</dd>
            </div>
          </dl>

          <div class="me-aside-kpi">
            <span class="me-aside-kpi-label">Margen de contrib. promedio</span>
            <span class="me-aside-kpi-value">
              {{ formatPEN(num(me.data.value.avgContributionMargin)) }}
            </span>
          </div>

          <p class="me-aside-note">
            Las estrellas son el motor del negocio. Cuida su disponibilidad y margen
            ante cualquier ajuste de precios o receta.
          </p>
        </section>
      </aside>
    </div>

    <template #error="{ clearError }">
      <div class="scr-body">
        <div class="scr-main">
          <RepError @retry="() => { clearError(); me.refresh() }" />
        </div>
      </div>
    </template>
    </NuxtErrorBoundary>
  </div>
</template>

<style scoped>
/* ===== Page shell ===== */
.me { padding-bottom: 0; }

/* Controls bar — mirrors .rep-controls / .rep-toolbar pattern */
.me-controls {
  padding: 0 20px;
  margin-bottom: 4px;
}
@media (max-width: 1023px) {
  .me-controls { padding: 0 16px; }
}

.me-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 6px;
}

.me-period-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.me-period-field span {
  font-size: 11px;
  font-weight: 600;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.me-period-field input {
  font: inherit;
  font-size: 14px;
  color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 7px 10px;
  min-height: 40px;
}
.me-period-field input:focus {
  outline: none;
  border-color: var(--terracotta);
  box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18);
}

.me-range-note {
  font-size: 12px;
  color: var(--fg3);
  margin: 0 2px 10px;
}

/* ===== Cards ===== */
.me-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.me-card + .me-card { margin-top: 12px; }

.me-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.me-card-title {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  line-height: 1.1;
  color: var(--fg1);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}
.me-card-meta {
  font-size: 12px;
  color: var(--fg3);
}
.me-q-count {
  font-family: var(--font-sans);
  font-style: normal;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg3);
}

/* Quadrant indicator dot beside section heading */
.me-q-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.q-star  { background: var(--terracotta); }
.q-horse { background: var(--mostaza); }
.q-puzzle { background: var(--oliva); }
.q-dog   { background: var(--espresso-400); }

/* ===== Hint ===== */
.me-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--fg2);
  line-height: 1.5;
  margin: -2px 0 14px;
}
.me-hint :deep(svg) {
  width: 14px;
  height: 14px;
  color: var(--fg3);
  flex-shrink: 0;
  margin-top: 1px;
}

/* ===== SVG matrix wrapper ===== */
/* The SVG is naturally responsive via width="100%"; the wrapper provides min
   height on mobile so small containers still show the matrix legibly. */
.me-matrix-wrap {
  width: 100%;
  overflow-x: auto; /* fallback if viewport is extremely narrow */
}
.me-matrix-wrap svg {
  display: block;
  min-width: 320px;
}

/* ===== Table ===== */
.me-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  margin-top: 12px;
}
.me-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.me-table th,
.me-table td {
  padding: 10px;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.me-table th {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--fg3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--crema-50);
}
.me-table th.left,
.me-table td.left {
  text-align: left;
}
.me-table tbody tr {
  border-bottom: 1px solid var(--border-subtle);
}
.me-table tbody tr:last-child {
  border-bottom: none;
}
.me-table tbody tr:nth-child(even) {
  background: var(--crema-50);
}
.me-table td.name {
  font-weight: 600;
  color: var(--fg1);
  white-space: normal;
  min-width: 120px;
}
.me-table td.strong {
  font-weight: 700;
  color: var(--fg1);
}
/* Recommendation text: wrap and keep readable */
.me-table td.rec {
  white-space: normal;
  min-width: 200px;
  color: var(--fg2);
  font-size: 12px;
}

.me-muted {
  font-size: 13px;
  color: var(--fg3);
  text-align: center;
  padding: 16px 0;
}

/* ===== Aside panel =====
   Legend dots matching each classification color */
.me-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 6px;
  vertical-align: middle;
}
.me-dot.star   { background: var(--terracotta); }
.me-dot.horse  { background: var(--mostaza); }
.me-dot.puzzle { background: var(--oliva); }
.me-dot.dog    { background: var(--espresso-400); }

.scr-aside .scr-stat dt {
  display: inline-flex;
  align-items: center;
}

.me-aside-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}
.me-aside-kpi-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--fg3);
}
.me-aside-kpi-value {
  font-family: var(--font-serif);
  font-size: 21px;
  font-weight: 600;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
}

.me-aside-note {
  margin: 14px 0 0;
  font-size: 11.5px;
  color: var(--fg3);
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  /* No animated elements in this page, but respecting the convention. */
}
</style>
