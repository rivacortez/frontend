<script setup lang="ts">
// app/pages/app/reportes/prime-cost.vue
// E07 · Panel de Prime Cost — indicador clave de estructura de costos del período.
// Prime cost = food cost % + labor cost %. Benchmark: bueno ≤ 60 %, alerta 60–65 %,
// alto > 65 %. Solo owner/manager (el backend 403ea a staff).
import {
  lastCompletePeriod,
  usePrimeCost,
} from '~/composables/use-reports'
import type { CostStatus } from '~~/server/api/reports/prime-cost.get'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Prime cost — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()

const canManage = computed(
  () => user.value?.role === 'owner' || user.value?.role === 'manager',
)

const period = ref(lastCompletePeriod())

function periodLabel(p: string): string {
  const [y, m] = p.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })
}

const pc = usePrimeCost(period, () => canManage.value)

// PrimeCostReportView fields (money AND percentages: primeCostPct, foodCostPct,
// laborCostPct, benchmarks.*) are all Prisma Decimal strings, never `number` —
// `toNumber`/`formatPercent` (app/utils/format.ts) are the single safe
// coercion point. Root cause of the crash this fixes: the old `fmtPct` typed
// its param as `number | undefined` and called `.toFixed()` directly on it;
// the backend actually sends a string, so `(n ?? 0).toFixed` threw.
const num = (s: string | number | undefined | null) => toNumber(s)
const fmtPct = (n: string | number | undefined | null): string => formatPercent(n)

// ===== Prime cost gauge SVG =====
// Display scale: 0–80 % (beyond 80 % is catastrophic; the indicator is clamped).
// Benchmark bands:
//   Good:    0 – 60 % (green)
//   Warning: 60 – 65 % (amber)
//   High:    65 – 80 %+ (red)

const GAUGE_W = 400
const GAUGE_H = 68
const GAUGE_PAD_H = 8    // horizontal padding inside SVG
const TRACK_Y = 24
const TRACK_H = 16
const DISPLAY_MAX = 80   // % — beyond this the needle is pinned to the right

/** Maps a percentage to an SVG x coordinate within the gauge track. */
function gaugeX(pct: number): number {
  const effective = Math.min(pct, DISPLAY_MAX)
  const trackW = GAUGE_W - GAUGE_PAD_H * 2
  return GAUGE_PAD_H + (effective / DISPLAY_MAX) * trackW
}

// Band boundaries in SVG x coordinates
const gaugeGoodEnd = computed(() => gaugeX(60))
const gaugeWarnEnd = computed(() => gaugeX(65))
const gaugeTrackEnd = GAUGE_W - GAUGE_PAD_H

const gaugeNeedleX = computed(() => gaugeX(num(pc.data.value?.primeCostPct)))

// ===== Sub-metric gauges (food cost + labor cost) =====
// Each shows a 0–50% scale with the benchmark band highlighted.

const SUBGAUGE_MAX = 50 // % scale for food/labor individual metrics

function subGaugeX(pct: number, trackW: number): number {
  return (Math.min(pct, SUBGAUGE_MAX) / SUBGAUGE_MAX) * trackW
}

// ===== Status helpers =====
const STATUS_COLORS: Record<CostStatus, string> = {
  good: 'var(--oliva)',
  warning: 'var(--mostaza)',
  high: 'var(--danger)',
}

const STATUS_LABELS: Record<CostStatus, string> = {
  good: 'Bueno',
  warning: 'En alerta',
  high: 'Alto',
}

const STATUS_BG: Record<CostStatus, string> = {
  good: 'var(--oliva-100)',
  warning: 'var(--mostaza-100)',
  high: 'var(--danger-bg)',
}

const STATUS_FG: Record<CostStatus, string> = {
  good: 'var(--oliva-700)',
  warning: 'var(--mostaza-700)',
  high: 'var(--danger)',
}

// ===== Takeaway copy =====
function takeaway(status: CostStatus | undefined): string {
  if (!status) return ''
  if (status === 'good')
    return 'Estructura de costos saludable. Mantén el mix de carta y el staffing actual.'
  if (status === 'warning')
    return 'Prime cost en zona de alerta. Revisa primero el staffing y luego el mix de carta.'
  return 'Prime cost alto. Actúa con urgencia: analiza staffing, recorta platos de bajo margen y revisa el food cost.'
}

// ===== Error gate =====
watch(
  () => pc.error.value,
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
  <div class="pc">
    <UiScreenHeader
      title="Prime cost"
      subtitle="Estructura de costos del período"
      back="/app/reportes"
    />

    <!-- Period selector -->
    <div class="pc-controls">
      <div class="pc-toolbar">
        <label class="pc-period-field">
          <span>Período</span>
          <input
            v-model="period"
            type="month"
            aria-label="Período del análisis (mes)"
          >
        </label>
      </div>
      <div v-if="pc.data.value" class="pc-range-note">
        {{ periodLabel(period) }}
      </div>
    </div>

    <!--
      Defect #2 (skeleton infinito): un throw dentro del render (p. ej. un
      campo con forma inesperada) dejaba la vista congelada en el skeleton
      porque Vue nunca llegaba a confirmar el nuevo árbol. NuxtErrorBoundary
      captura cualquier excepción de render en este subárbol (main + aside) y
      muestra un estado de error recuperable en vez de quedar colgada.
    -->
    <NuxtErrorBoundary>
    <div class="scr-body">
      <div class="scr-main">
        <RepError v-if="pc.error.value" @retry="pc.refresh()" />
        <RepLoading v-else-if="pc.isLoading.value && !pc.data.value" />

        <template v-else-if="pc.data.value">
          <!-- ===== KPI stat grid ===== -->
          <div class="pc-stat-grid">
            <!-- Prime cost % — hero KPI -->
            <div
              class="pc-stat accent"
              :style="{
                '--status-color': STATUS_COLORS[pc.data.value.status],
              }"
            >
              <span class="pc-stat-k">Prime cost</span>
              <span class="pc-stat-v">{{ fmtPct(pc.data.value.primeCostPct) }}</span>
              <span
                class="pc-status-badge"
                :style="{
                  background: STATUS_BG[pc.data.value.status],
                  color: STATUS_FG[pc.data.value.status],
                }"
              >
                {{ STATUS_LABELS[pc.data.value.status] }}
              </span>
            </div>

            <div class="pc-stat">
              <span class="pc-stat-k">Ingresos</span>
              <span class="pc-stat-v">{{ formatPEN(num(pc.data.value.revenue)) }}</span>
              <span class="pc-stat-meta">del período</span>
            </div>
            <div class="pc-stat">
              <span class="pc-stat-k">Costo total (PC)</span>
              <span class="pc-stat-v">{{ formatPEN(num(pc.data.value.primeCost)) }}</span>
              <span class="pc-stat-meta">alimentos + mano de obra</span>
            </div>
          </div>

          <!-- ===== Gauge card ===== -->
          <section class="pc-card" aria-label="Indicador de prime cost">
            <div class="pc-card-head">
              <h2 class="pc-card-title">Indicador de prime cost</h2>
            </div>

            <!-- SVG gauge: segmented bar with needle indicator -->
            <div class="pc-gauge-wrap">
              <svg
                :viewBox="`0 0 ${GAUGE_W} ${GAUGE_H}`"
                width="100%"
                preserveAspectRatio="xMidYMid meet"
                role="img"
                :aria-label="`Prime cost: ${fmtPct(pc.data.value.primeCostPct)} — estado: ${STATUS_LABELS[pc.data.value.status]}`"
              >
                <title>Indicador de prime cost</title>
                <desc>Barra horizontal dividida en tres zonas: Bueno (0–60 %), En alerta (60–65 %) y Alto (65 %+). El indicador muestra la posición del prime cost actual.</desc>

                <!-- Band: Good (0–60%) -->
                <rect
                  :x="GAUGE_PAD_H"
                  :y="TRACK_Y"
                  :width="gaugeGoodEnd - GAUGE_PAD_H"
                  :height="TRACK_H"
                  fill="#6E7B61"
                  rx="4"
                  ry="4"
                />
                <!-- Band: Warning (60–65%) -->
                <rect
                  :x="gaugeGoodEnd"
                  :y="TRACK_Y"
                  :width="gaugeWarnEnd - gaugeGoodEnd"
                  :height="TRACK_H"
                  fill="#D8A441"
                />
                <!-- Band: High (65–80%+) -->
                <rect
                  :x="gaugeWarnEnd"
                  :y="TRACK_Y"
                  :width="gaugeTrackEnd - gaugeWarnEnd"
                  :height="TRACK_H"
                  fill="#B33A2A"
                  rx="4"
                  ry="4"
                  style="border-radius: 0 4px 4px 0"
                />
                <!-- Override: right side of high band rounded, left flat -->
                <rect
                  :x="gaugeWarnEnd"
                  :y="TRACK_Y"
                  :width="8"
                  :height="TRACK_H"
                  fill="#B33A2A"
                />

                <!-- Band boundary separators -->
                <line
                  :x1="gaugeGoodEnd"
                  :y1="TRACK_Y - 2"
                  :x2="gaugeGoodEnd"
                  :y2="TRACK_Y + TRACK_H + 2"
                  stroke="rgba(251,248,242,0.9)"
                  stroke-width="2"
                />
                <line
                  :x1="gaugeWarnEnd"
                  :y1="TRACK_Y - 2"
                  :x2="gaugeWarnEnd"
                  :y2="TRACK_Y + TRACK_H + 2"
                  stroke="rgba(251,248,242,0.9)"
                  stroke-width="2"
                />

                <!-- Band labels above the track -->
                <text
                  :x="(GAUGE_PAD_H + gaugeGoodEnd) / 2"
                  :y="TRACK_Y - 5"
                  font-size="9"
                  text-anchor="middle"
                  fill="#525E47"
                  font-weight="600"
                >
                  Bueno ≤ 60 %
                </text>
                <text
                  :x="(gaugeGoodEnd + gaugeWarnEnd) / 2"
                  :y="TRACK_Y - 5"
                  font-size="9"
                  text-anchor="middle"
                  fill="#8C6825"
                  font-weight="600"
                >
                  Alerta
                </text>
                <text
                  :x="(gaugeWarnEnd + gaugeTrackEnd) / 2"
                  :y="TRACK_Y - 5"
                  font-size="9"
                  text-anchor="middle"
                  fill="#8A2C20"
                  font-weight="600"
                >
                  Alto &gt; 65 %
                </text>

                <!-- Needle: triangle pointing up from below the track -->
                <polygon
                  :points="`${gaugeNeedleX},${TRACK_Y + TRACK_H + 2} ${gaugeNeedleX - 6},${TRACK_Y + TRACK_H + 14} ${gaugeNeedleX + 6},${TRACK_Y + TRACK_H + 14}`"
                  :fill="STATUS_COLORS[pc.data.value.status]"
                />

                <!-- Needle value label -->
                <text
                  :x="gaugeNeedleX"
                  :y="GAUGE_H - 2"
                  font-size="11"
                  font-weight="700"
                  text-anchor="middle"
                  :fill="STATUS_FG[pc.data.value.status]"
                >
                  {{ fmtPct(pc.data.value.primeCostPct) }}
                </text>

                <!-- Scale tick labels -->
                <text
                  :x="GAUGE_PAD_H"
                  :y="TRACK_Y + TRACK_H + 26"
                  font-size="8.5"
                  text-anchor="start"
                  fill="#807B75"
                >
                  0 %
                </text>
                <text
                  :x="gaugeTrackEnd"
                  :y="TRACK_Y + TRACK_H + 26"
                  font-size="8.5"
                  text-anchor="end"
                  fill="#807B75"
                >
                  ≥ 80 %
                </text>
              </svg>
            </div>

            <!-- Takeaway note -->
            <div
              class="pc-takeaway"
              :style="{
                background: STATUS_BG[pc.data.value.status],
                color: STATUS_FG[pc.data.value.status],
              }"
              role="status"
              :aria-label="`Diagnóstico: ${takeaway(pc.data.value.status)}`"
            >
              <UIcon
                :name="pc.data.value.status === 'good' ? 'i-lucide-check-circle' : 'i-lucide-alert-triangle'"
                aria-hidden="true"
              />
              {{ takeaway(pc.data.value.status) }}
            </div>
          </section>

          <!-- ===== Breakdown: food cost + labor cost ===== -->
          <section class="pc-card" aria-label="Desglose de costos">
            <div class="pc-card-head">
              <h2 class="pc-card-title">Desglose de costos</h2>
            </div>

            <div class="pc-breakdown">
              <!-- Food cost -->
              <div class="pc-metric">
                <div class="pc-metric-head">
                  <span class="pc-metric-name">Costo de alimentos (food cost)</span>
                  <span
                    class="pc-metric-badge"
                    :style="{
                      background: STATUS_BG[pc.data.value.benchmarks.foodCostStatus],
                      color: STATUS_FG[pc.data.value.benchmarks.foodCostStatus],
                    }"
                  >
                    {{ STATUS_LABELS[pc.data.value.benchmarks.foodCostStatus] }}
                  </span>
                </div>

                <!-- Sub-gauge: 0–50% scale with 28–35% benchmark band -->
                <div class="pc-sub-gauge" role="img" :aria-label="`Food cost: ${fmtPct(pc.data.value.foodCostPct)}`">
                  <div class="pc-sub-track">
                    <!-- Benchmark band -->
                    <div
                      class="pc-sub-band"
                      :style="{
                        left: `${(num(pc.data.value.benchmarks.foodCostGoodMin) / SUBGAUGE_MAX) * 100}%`,
                        width: `${((num(pc.data.value.benchmarks.foodCostGoodMax) - num(pc.data.value.benchmarks.foodCostGoodMin)) / SUBGAUGE_MAX) * 100}%`,
                        background: 'rgba(110,123,97,0.25)',
                      }"
                    />
                    <!-- Actual fill -->
                    <div
                      class="pc-sub-fill"
                      :style="{
                        width: `${Math.min(100, (num(pc.data.value.foodCostPct) / SUBGAUGE_MAX) * 100)}%`,
                        background: STATUS_COLORS[pc.data.value.benchmarks.foodCostStatus],
                      }"
                    />
                  </div>
                  <div class="pc-sub-labels">
                    <span>0 %</span>
                    <span>{{ fmtPct(pc.data.value.benchmarks.foodCostGoodMin) }}–{{ fmtPct(pc.data.value.benchmarks.foodCostGoodMax) }} ideal</span>
                    <span>50 %</span>
                  </div>
                </div>

                <div class="pc-metric-row">
                  <div class="pc-metric-kpi">
                    <span class="pc-metric-kpi-v">{{ fmtPct(pc.data.value.foodCostPct) }}</span>
                    <span class="pc-metric-kpi-l">del ingreso</span>
                  </div>
                  <div class="pc-metric-kpi">
                    <span class="pc-metric-kpi-v">{{ formatPEN(num(pc.data.value.foodCost)) }}</span>
                    <span class="pc-metric-kpi-l">en soles</span>
                  </div>
                </div>
              </div>

              <div class="pc-separator" role="separator" />

              <!-- Labor cost -->
              <div class="pc-metric">
                <div class="pc-metric-head">
                  <span class="pc-metric-name">Costo laboral</span>
                  <span
                    class="pc-metric-badge"
                    :style="{
                      background: STATUS_BG[pc.data.value.benchmarks.laborCostStatus],
                      color: STATUS_FG[pc.data.value.benchmarks.laborCostStatus],
                    }"
                  >
                    {{ STATUS_LABELS[pc.data.value.benchmarks.laborCostStatus] }}
                  </span>
                </div>

                <div class="pc-sub-gauge" role="img" :aria-label="`Costo laboral: ${fmtPct(pc.data.value.laborCostPct)}`">
                  <div class="pc-sub-track">
                    <!-- Benchmark band -->
                    <div
                      class="pc-sub-band"
                      :style="{
                        left: `${(num(pc.data.value.benchmarks.laborCostGoodMin) / SUBGAUGE_MAX) * 100}%`,
                        width: `${((num(pc.data.value.benchmarks.laborCostGoodMax) - num(pc.data.value.benchmarks.laborCostGoodMin)) / SUBGAUGE_MAX) * 100}%`,
                        background: 'rgba(110,123,97,0.25)',
                      }"
                    />
                    <!-- Actual fill -->
                    <div
                      class="pc-sub-fill"
                      :style="{
                        width: `${Math.min(100, (num(pc.data.value.laborCostPct) / SUBGAUGE_MAX) * 100)}%`,
                        background: STATUS_COLORS[pc.data.value.benchmarks.laborCostStatus],
                      }"
                    />
                  </div>
                  <div class="pc-sub-labels">
                    <span>0 %</span>
                    <span>{{ fmtPct(pc.data.value.benchmarks.laborCostGoodMin) }}–{{ fmtPct(pc.data.value.benchmarks.laborCostGoodMax) }} ideal</span>
                    <span>50 %</span>
                  </div>
                </div>

                <div class="pc-metric-row">
                  <div class="pc-metric-kpi">
                    <span class="pc-metric-kpi-v">{{ fmtPct(pc.data.value.laborCostPct) }}</span>
                    <span class="pc-metric-kpi-l">del ingreso</span>
                  </div>
                  <div class="pc-metric-kpi">
                    <span class="pc-metric-kpi-v">{{ formatPEN(num(pc.data.value.laborCost)) }}</span>
                    <span class="pc-metric-kpi-l">en soles</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <!-- Not a manager -->
        <UiEmptyState
          v-else-if="!canManage && !pc.isLoading.value"
          icon="i-lucide-lock"
          title="Acceso restringido"
          subtitle="Este análisis está disponible solo para propietarios y gerentes."
        />
      </div>

      <!-- ===== Aside: summary panel ===== -->
      <aside
        v-if="pc.data.value && canManage"
        class="scr-aside"
      >
        <section class="scr-panel">
          <header class="scr-panel-head">
            <span class="scr-eyebrow">Prime cost · {{ periodLabel(period) }}</span>
            <h3 class="scr-panel-title">
              {{ fmtPct(pc.data.value.primeCostPct) }}
              <span class="scr-of"> prime cost</span>
            </h3>
          </header>

          <dl class="scr-stats">
            <div class="scr-stat">
              <dt>Ingresos</dt>
              <dd>{{ formatPEN(num(pc.data.value.revenue)) }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Food cost</dt>
              <dd>{{ formatPEN(num(pc.data.value.foodCost)) }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Food cost %</dt>
              <dd>{{ fmtPct(pc.data.value.foodCostPct) }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Costo laboral</dt>
              <dd>{{ formatPEN(num(pc.data.value.laborCost)) }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Costo laboral %</dt>
              <dd>{{ fmtPct(pc.data.value.laborCostPct) }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Prime cost (S/)</dt>
              <dd>{{ formatPEN(num(pc.data.value.primeCost)) }}</dd>
            </div>
          </dl>

          <!-- Status indicator -->
          <div
            class="pc-aside-status"
            :style="{
              background: STATUS_BG[pc.data.value.status],
              color: STATUS_FG[pc.data.value.status],
            }"
          >
            <UIcon
              :name="pc.data.value.status === 'good' ? 'i-lucide-check' : 'i-lucide-alert-triangle'"
              aria-hidden="true"
            />
            <span>{{ STATUS_LABELS[pc.data.value.status] }}</span>
            <span class="pc-aside-status-sub">
              Benchmark: ≤ {{ num(pc.data.value.benchmarks.primeCostGoodMax) }} %
            </span>
          </div>
        </section>
      </aside>
    </div>

    <template #error="{ clearError }">
      <div class="scr-body">
        <div class="scr-main">
          <RepError @retry="() => { clearError(); pc.refresh() }" />
        </div>
      </div>
    </template>
    </NuxtErrorBoundary>
  </div>
</template>

<style scoped>
/* ===== Page shell ===== */
.pc { padding-bottom: 0; }

/* Controls bar */
.pc-controls {
  padding: 0 20px;
  margin-bottom: 4px;
}
@media (max-width: 1023px) {
  .pc-controls { padding: 0 16px; }
}

.pc-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 6px;
}

.pc-period-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pc-period-field span {
  font-size: 11px;
  font-weight: 600;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pc-period-field input {
  font: inherit;
  font-size: 14px;
  color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 7px 10px;
  min-height: 40px;
}
.pc-period-field input:focus {
  outline: none;
  border-color: var(--terracotta);
  box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18);
}

.pc-range-note {
  font-size: 12px;
  color: var(--fg3);
  margin: 0 2px 10px;
}

/* ===== KPI stat grid ===== */
.pc-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.pc-stat {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--shadow-sm);
  min-height: 92px;
}

/* Prime cost hero card: espresso dark base; status accent on the left edge. */
.pc-stat.accent {
  background: var(--espresso);
  border-color: transparent;
  border-left: 4px solid var(--status-color, var(--oliva));
}

.pc-stat-k {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg3);
}
.pc-stat.accent .pc-stat-k { color: rgba(243, 237, 228, 0.62); }

.pc-stat-v {
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.pc-stat.accent .pc-stat-v { color: var(--crema-100); }

.pc-stat-meta {
  font-size: 11.5px;
  color: var(--fg3);
  margin-top: auto;
}
.pc-stat.accent .pc-stat-meta { color: rgba(243, 237, 228, 0.55); }

/* Status badge inside the hero KPI card */
.pc-status-badge {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  margin-top: 2px;
}

/* ===== Cards ===== */
.pc-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.pc-card + .pc-card { margin-top: 12px; }

.pc-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.pc-card-title {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  line-height: 1.1;
  color: var(--fg1);
  margin: 0;
}

/* ===== Prime cost SVG gauge ===== */
.pc-gauge-wrap {
  width: 100%;
  max-width: 500px;
  margin: 0 auto 16px;
}
.pc-gauge-wrap svg { display: block; }

/* ===== Takeaway note ===== */
.pc-takeaway {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}
.pc-takeaway :deep(svg) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ===== Breakdown section ===== */
.pc-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pc-separator {
  height: 1px;
  background: var(--border-subtle);
  margin: 16px 0;
}

.pc-metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.pc-metric-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg1);
}
.pc-metric-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

/* Sub-gauge: relative track with absolute benchmark band + fill */
.pc-sub-gauge {
  margin-bottom: 10px;
}
.pc-sub-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: var(--crema-200);
  overflow: hidden;
}
.pc-sub-band {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 0;
  pointer-events: none;
}
.pc-sub-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 999px;
  transition: width 0.6s var(--ease-emphasis, cubic-bezier(0.32, 0.72, 0, 1));
}

.pc-sub-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--fg3);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.pc-metric-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.pc-metric-kpi {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pc-metric-kpi-v {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.pc-metric-kpi-l {
  font-size: 11px;
  color: var(--fg3);
  font-weight: 500;
}

/* ===== Aside panel ===== */
.pc-aside-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  flex-wrap: wrap;
}
.pc-aside-status :deep(svg) {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
.pc-aside-status-sub {
  font-size: 11px;
  font-weight: 500;
  opacity: 0.75;
  margin-left: auto;
}

@media (prefers-reduced-motion: reduce) {
  .pc-sub-fill { transition: none !important; }
}
</style>
