<script setup lang="ts">
// F2a / HU-08-08 · Predicho vs. real, con banda de proyección [yhatLo, yhatHi].
// Mismo lenguaje visual y técnica SVG que `ChartsAreaChart` (curva suave con
// Catmull-Rom, gradientes, crosshair + tooltip al pasar el cursor) para no
// introducir una librería de charting nueva — ver docstring de `AreaChart.vue`.
// Semántica de color: espresso = "territorio del modelo" (predicción + banda
// de incertidumbre), terracota = "realidad" (venta real, el dato que importa).
import type { ForecastAccuracyPoint } from '#shared/types/domain'

const props = defineProps<{ series: ForecastAccuracyPoint[] }>()

const W = 720
const H = 260
const padL = 14
const padR = 16
const padT = 24
const padB = 26

interface Pt { x: number, y: number, point: ForecastAccuracyPoint }

const geom = computed(() => {
  const d = props.series
  if (!d || d.length < 2) return null
  const allVals = d.flatMap(p => [p.predicted, p.actual, p.yhatLo, p.yhatHi])
  const max = Math.max(...allVals)
  const min = Math.min(...allVals, 0)
  const span = max - min || 1
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step = innerW / (d.length - 1)
  const y = (v: number): number => padT + (1 - (v - min) / span) * innerH

  const predicted: Pt[] = d.map((p, i) => ({ x: padL + i * step, y: y(p.predicted), point: p }))
  const actual: Pt[] = d.map((p, i) => ({ x: padL + i * step, y: y(p.actual), point: p }))
  const bandHi: Pt[] = d.map((p, i) => ({ x: padL + i * step, y: y(p.yhatHi), point: p }))
  const bandLo: Pt[] = d.map((p, i) => ({ x: padL + i * step, y: y(p.yhatLo), point: p }))

  return { predicted, actual, bandHi, bandLo, step }
})

/** Catmull-Rom smoothing — identical technique to `AreaChart.vue`'s `smooth()`. */
function smooth(pts: { x: number, y: number }[]): string {
  if (pts.length < 2) return ''
  let path = `M${pts[0]!.x} ${pts[0]!.y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return path
}

const predictedPath = computed(() => (geom.value ? smooth(geom.value.predicted) : ''))
const actualPath = computed(() => (geom.value ? smooth(geom.value.actual) : ''))
// Banda: contorno superior (yhatHi) hacia adelante + contorno inferior (yhatLo)
// hacia atrás, cerrando el polígono en un solo path (relleno con fill-rule
// por defecto — ambos bordes suavizados con la misma técnica Catmull-Rom).
const bandFillPath = computed(() => {
  const g = geom.value
  if (!g) return ''
  const top = smooth(g.bandHi)
  const bottomPts = [...g.bandLo].reverse()
  const bottom = smooth(bottomPts).replace(/^M/, 'L')
  return `${top} ${bottom} Z`
})

function fmtDay(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
}
function fmtVal(v: number): string {
  return Math.round(v).toLocaleString('es-PE')
}

// ── Interactividad: día más cercano al cursor (mismo patrón que AreaChart) ──
const hostRef = ref<HTMLElement | null>(null)
const activeIndex = ref<number | null>(null)
const activePoint = computed(() =>
  activeIndex.value != null ? props.series[activeIndex.value] ?? null : null)
const activeX = computed(() =>
  activeIndex.value != null ? geom.value?.actual[activeIndex.value]?.x ?? null : null)

function onMove(e: PointerEvent): void {
  const g = geom.value
  const host = hostRef.value
  if (!g || !host) return
  const rect = host.getBoundingClientRect()
  if (rect.width === 0) return
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  let idx = Math.round((svgX - padL) / g.step)
  idx = Math.max(0, Math.min(props.series.length - 1, idx))
  activeIndex.value = idx
}
function onLeave(): void {
  activeIndex.value = null
}

// Etiquetas del eje X: se saltean para no amontonar texto en series largas.
const xLabelStep = computed(() => Math.max(1, Math.ceil(props.series.length / 8)))
</script>

<template>
  <div ref="hostRef" class="acc">
    <svg v-if="geom" :viewBox="`0 0 ${W} ${H}`" class="acc-svg" role="img" aria-label="Demanda predicha vs. real por día">
      <!-- Banda de proyección [yhatLo, yhatHi]: relleno plano (no hace falta
           degradé — a diferencia de AreaChart, la banda no se desvanece hacia
           un eje, es un rango de igual "peso" en toda su extensión). -->
      <path :d="bandFillPath" class="acc-band" />

      <!-- Crosshair (hover) -->
      <line
        v-if="activeX !== null"
        :x1="activeX" :x2="activeX" :y1="padT - 4" :y2="H - padB"
        class="acc-cross"
      />

      <!-- Predicho: línea punteada -->
      <path :d="predictedPath" fill="none" class="acc-predicted" />

      <!-- Real: línea sólida + puntos -->
      <path :d="actualPath" fill="none" class="acc-actual" />
      <circle v-for="(p, i) in geom.actual" :key="i" :cx="p.x" :cy="p.y" r="2.6" class="acc-actual-dot" />

      <!-- Etiquetas eje X (una de cada N para no amontonar) -->
      <text
        v-for="(p, i) in geom.actual" :key="`l${i}`"
        v-show="i % xLabelStep === 0 || i === geom.actual.length - 1"
        :x="p.x" :y="H - 8" class="acc-xlbl" text-anchor="middle"
        :class="{ 'is-active': activeIndex === i }"
      >{{ fmtDay(p.point.date) }}</text>

      <!-- Capa transparente para capturar el cursor -->
      <rect :x="0" :y="0" :width="W" :height="H" fill="transparent" class="acc-hit" @pointermove="onMove" @pointerleave="onLeave" />
    </svg>

    <!-- Tooltip HTML sobre el día activo -->
    <div
      v-if="activePoint && activeX !== null"
      class="acc-tip"
      :style="{ left: `${(activeX / W) * 100}%`, top: '10%' }"
    >
      <span class="acc-tip-date">{{ fmtDay(activePoint.date) }}</span>
      <span class="acc-tip-row"><i class="dot actual" />Real: <b>{{ fmtVal(activePoint.actual) }}</b></span>
      <span class="acc-tip-row"><i class="dot predicted" />Predicho: <b>{{ fmtVal(activePoint.predicted) }}</b></span>
      <span class="acc-tip-row muted">Rango: {{ fmtVal(activePoint.yhatLo) }}–{{ fmtVal(activePoint.yhatHi) }}</span>
    </div>

    <!-- Leyenda -->
    <div class="acc-legend" aria-hidden="true">
      <span class="acc-legend-item"><i class="dot actual" /> Real</span>
      <span class="acc-legend-item"><i class="dash" /> Predicho</span>
      <span class="acc-legend-item"><i class="swatch" /> Rango proyectado</span>
    </div>
  </div>
</template>

<style scoped>
.acc { width: 100%; position: relative; }
.acc-svg { display: block; width: 100%; height: auto; overflow: visible; }

.acc-band { fill: var(--espresso-400); opacity: 0.14; }
.acc-cross { stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 2 3; }

.acc-predicted {
  stroke: var(--espresso-400);
  stroke-width: 2;
  stroke-dasharray: 5 4;
  stroke-linecap: round;
}
.acc-actual {
  stroke: var(--terracotta);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.acc-actual-dot { fill: var(--terracotta); }

.acc-xlbl { font-size: 11px; fill: var(--fg3); transition: fill 0.15s ease; }
.acc-xlbl.is-active { fill: var(--fg1); font-weight: 600; }
.acc-hit { cursor: crosshair; }

.acc-tip {
  position: absolute;
  transform: translate(-50%, 0);
  background: var(--espresso);
  color: var(--crema-50);
  padding: 8px 11px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(26, 26, 26, 0.18);
  display: flex; flex-direction: column; gap: 3px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
  font-size: 12px;
}
.acc-tip-date { font-weight: 700; font-size: 12.5px; margin-bottom: 2px; }
.acc-tip-row { display: inline-flex; align-items: center; gap: 6px; }
.acc-tip-row.muted { color: rgba(248, 244, 237, 0.65); font-size: 11px; margin-top: 1px; }
.acc-tip-row .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.acc-tip-row .dot.actual { background: var(--terracotta-300); }
.acc-tip-row .dot.predicted { background: var(--espresso-400); }

.acc-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; }
.acc-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fg2); }
.acc-legend-item .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--terracotta); }
.acc-legend-item .dash { width: 14px; height: 0; border-top: 2px dashed var(--espresso-400); }
.acc-legend-item .swatch { width: 14px; height: 9px; border-radius: 3px; background: var(--espresso-400); opacity: 0.3; }

@media (prefers-reduced-motion: reduce) {
  .acc-xlbl { transition: none; }
}
</style>
