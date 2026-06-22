<script setup lang="ts">
// Gráfico de área SVG hecho a mano (sin librerías): curva suave, relleno con
// gradiente, línea de promedio, puntos, animación de dibujo y tooltip interactivo
// (crosshair + punto más cercano al cursor).
interface Point { label: string, value: number }

const props = withDefaults(
  defineProps<{
    data: Point[]
    color?: string
    unit?: string
  }>(),
  { color: 'var(--terracotta)', unit: '' },
)

const gid = `area-${useId()}`
const W = 720
const H = 240
const padL = 14
const padR = 56
const padT = 30
const padB = 26

const geom = computed(() => {
  const d = props.data
  if (!d || d.length < 2) return null
  const vals = d.map(p => p.value)
  const max = Math.max(...vals)
  const min = Math.min(...vals, 0)
  const span = max - min || 1
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step = innerW / (d.length - 1)
  const pts = d.map((p, i) => ({
    x: padL + i * step,
    y: padT + (1 - (p.value - min) / span) * innerH,
    label: p.label,
    value: p.value,
  }))
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const avgY = padT + (1 - (avg - min) / span) * innerH
  return { pts, max, avg, avgY, step }
})

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

const linePath = computed(() => (geom.value ? smooth(geom.value.pts) : ''))
const areaPath = computed(() => {
  if (!geom.value) return ''
  const pts = geom.value.pts
  return `${linePath.value} L${pts.at(-1)!.x} ${H - padB} L${pts[0]!.x} ${H - padB} Z`
})
const last = computed(() => geom.value?.pts.at(-1) ?? null)

function fmt(v: number): string {
  return `${props.unit}${props.unit ? ' ' : ''}${Math.round(v).toLocaleString('es-PE')}`
}

// ── Interactividad: punto más cercano al cursor ──
const hostRef = ref<HTMLElement | null>(null)
const activeIndex = ref<number | null>(null)
const active = computed(() =>
  activeIndex.value != null && geom.value ? geom.value.pts[activeIndex.value] : null,
)

function onMove(e: PointerEvent): void {
  const g = geom.value
  const host = hostRef.value
  if (!g || !host) return
  const rect = host.getBoundingClientRect()
  if (rect.width === 0) return
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  let idx = Math.round((svgX - padL) / g.step)
  idx = Math.max(0, Math.min(g.pts.length - 1, idx))
  activeIndex.value = idx
}
function onLeave(): void {
  activeIndex.value = null
}
</script>

<template>
  <div ref="hostRef" class="area">
    <svg v-if="geom" :viewBox="`0 0 ${W} ${H}`" class="area-svg" role="img" aria-label="Tendencia de ventas">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.26" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Línea de promedio -->
      <line :x1="padL" :x2="W - padR" :y1="geom.avgY" :y2="geom.avgY" class="area-avg" />
      <text :x="W - padR + 6" :y="geom.avgY + 3" class="area-avg-lbl">prom</text>

      <!-- Crosshair (hover) -->
      <line
        v-if="active"
        :x1="active.x" :x2="active.x" :y1="padT - 6" :y2="H - padB"
        class="area-cross"
      />

      <!-- Área + línea (con animación de dibujo) -->
      <path :d="areaPath" :fill="`url(#${gid})`" class="area-fill" />
      <path
        :d="linePath" fill="none" :stroke="color"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        vector-effect="non-scaling-stroke" class="area-line"
      />

      <!-- Puntos -->
      <g>
        <circle
          v-for="(p, i) in geom.pts" :key="i"
          :cx="p.x" :cy="p.y" r="3"
          class="area-dot" :style="{ stroke: color }"
        />
      </g>

      <!-- Punto activo (hover) -->
      <g v-if="active">
        <circle :cx="active.x" :cy="active.y" r="9" :fill="color" fill-opacity="0.16" />
        <circle :cx="active.x" :cy="active.y" r="5" :fill="color" stroke="var(--bg-card)" stroke-width="2" />
      </g>

      <!-- Último punto destacado + valor (oculto al hacer hover) -->
      <g v-if="last && activeIndex == null">
        <circle :cx="last.x" :cy="last.y" r="5" :fill="color" />
        <circle :cx="last.x" :cy="last.y" r="9" :fill="color" fill-opacity="0.16" />
        <text :x="last.x" :y="last.y - 14" class="area-last" text-anchor="middle">{{ fmt(last.value) }}</text>
      </g>

      <!-- Etiquetas eje X -->
      <text
        v-for="(p, i) in geom.pts" :key="`l${i}`"
        :x="p.x" :y="H - 8" class="area-xlbl" text-anchor="middle"
        :class="{ 'is-active': activeIndex === i }"
      >{{ p.label }}</text>

      <!-- Capa transparente para capturar el cursor (encima de todo) -->
      <rect
        :x="0" :y="0" :width="W" :height="H"
        fill="transparent" class="area-hit"
        @pointermove="onMove" @pointerleave="onLeave"
      />
    </svg>

    <!-- Tooltip HTML posicionado sobre el punto activo -->
    <div
      v-if="active"
      class="area-tip"
      :style="{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }"
    >
      <span class="area-tip-v">{{ fmt(active.value) }}</span>
      <span class="area-tip-l">{{ active.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.area { width: 100%; position: relative; }
.area-svg { display: block; width: 100%; height: auto; overflow: visible; }
.area-avg {
  stroke: var(--border-strong);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.area-avg-lbl {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--fg3);
}
.area-cross {
  stroke: var(--border-strong);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.area-dot {
  fill: var(--bg-card);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.area-last {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  fill: var(--fg1);
}
.area-xlbl {
  font-size: 11px;
  fill: var(--fg3);
  transition: fill 0.15s ease;
}
.area-xlbl.is-active { fill: var(--fg1); font-weight: 600; }
.area-hit { cursor: crosshair; }

/* Tooltip */
.area-tip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 14px));
  background: var(--espresso);
  color: var(--crema-50);
  padding: 6px 10px;
  border-radius: 9px;
  box-shadow: 0 8px 24px rgba(26, 26, 26, 0.18);
  display: flex; flex-direction: column; gap: 1px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}
.area-tip::after {
  content: '';
  position: absolute; left: 50%; bottom: -4px;
  width: 8px; height: 8px;
  background: var(--espresso);
  transform: translateX(-50%) rotate(45deg);
}
.area-tip-v { font-family: var(--font-display); font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
.area-tip-l { font-size: 11px; color: rgba(248, 244, 237, 0.65); text-transform: capitalize; }

/* Animación de entrada: la línea se dibuja, el área aparece */
@media (prefers-reduced-motion: no-preference) {
  .area-line {
    stroke-dasharray: 4000;
    stroke-dashoffset: 4000;
    animation: area-draw 1100ms var(--ease-emphasis, cubic-bezier(0.22, 1, 0.36, 1)) forwards;
  }
  .area-fill {
    opacity: 0;
    animation: area-fade 700ms ease forwards 500ms;
  }
}
@keyframes area-draw { to { stroke-dashoffset: 0; } }
@keyframes area-fade { to { opacity: 1; } }
</style>
