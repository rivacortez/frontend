<script setup lang="ts">
// Sparkline SVG mínimo (área + línea), sin ejes. Para tarjetas KPI.
const props = withDefaults(
  defineProps<{
    values: number[]
    color?: string
    height?: number
  }>(),
  { color: 'var(--terracotta)', height: 38 },
)

const gid = `spark-${useId()}`
const W = 100

const points = computed(() => {
  const v = props.values
  if (!v || v.length < 2) return null
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const pad = 4
  const h = props.height
  const step = W / (v.length - 1)
  return v.map((val, i) => ({
    x: i * step,
    y: pad + (1 - (val - min) / span) * (h - pad * 2),
  }))
})

const linePath = computed(() => {
  const p = points.value
  if (!p) return ''
  return p.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ')
})
const areaPath = computed(() => {
  const p = points.value
  if (!p) return ''
  return `${linePath.value} L${W} ${props.height} L0 ${props.height} Z`
})
const last = computed(() => points.value?.at(-1) ?? null)
</script>

<template>
  <svg
    v-if="points"
    class="spark"
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.22" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" :fill="`url(#${gid})`" />
    <path
      :d="linePath"
      fill="none"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <circle
      v-if="last"
      :cx="last.x"
      :cy="last.y"
      r="2.4"
      :fill="color"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.spark { display: block; width: 100%; height: 100%; }
</style>
