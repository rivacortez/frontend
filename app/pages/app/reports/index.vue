<script setup lang="ts">
// /app/reports — Reportes, KPIs y Análisis (E07). Read-only MVP, 3 períodos
// fijos (Hoy · Semana · Mes). Portado del diseño Reports.html de Claude Design.
// Gráficos en SVG inline / barras CSS — sin librerías de charting.
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Reportes — GastronomIA' })

const toast = useToast()
const router = useRouter()

type PeriodKey = 'hoy' | 'semana' | 'mes'
type MetricId = 'ventas' | 'pedidos' | 'margen'

interface Kpi { val: string, delta: string, note?: string }
interface Dish { id: string, name: string, units: number, margin: number }
interface PeriodData {
  label: string
  subtitle: string
  summary: string
  kpis: { ventas: Kpi, ticket: Kpi, margen: Kpi, pedidos: Kpi }
  spark: number[]
  chart: { labels: string[], ventas: number[], pedidos: number[], margen: number[] }
  peakLabel: string
  dishes: Dish[]
  donutCenter: string
}

/* ============ DATA (mock, coherente con dashboard + chat) ============ */
const PERIODS: Record<PeriodKey, PeriodData> = {
  hoy: {
    label: 'Hoy',
    subtitle: 'Hoy, sábado 14 de junio',
    summary:
      '📊 Hoy llevas <b>S/ 3,200</b> — vas camino a tu <b>mejor sábado</b> del mes. '
      + 'El almuerzo (1–3 PM) ya concentra el <span class="hl">52%</span> de las ventas. '
      + 'El <b>Ceviche Clásico</b> encabeza con 11 platos, pero su margen sigue golpeado '
      + '(<b>18%</b>) por el alza del limón. Subirle S/ 2 te recupera ~S/ 22 hoy.',
    kpis: {
      ventas: { val: '3,200', delta: '+18%', note: 'vs ayer' },
      ticket: { val: '92', delta: '+6%', note: 'vs ayer' },
      margen: { val: '60%', delta: 'En meta' },
      pedidos: { val: '38', delta: '+12%', note: '≈ 95 comensales' },
    },
    spark: [0.32, 0.5, 0.42, 0.66, 0.55, 0.82, 1],
    chart: {
      labels: ['12p', '1p', '2p', '3p', '5p', '7p', '8p'],
      ventas: [380, 920, 760, 210, 160, 420, 350],
      pedidos: [4, 11, 9, 3, 2, 5, 4],
      margen: [58, 60, 61, 59, 57, 62, 60],
    },
    peakLabel: 'Tu mejor franja hoy: 1–3 PM (almuerzo).',
    dishes: [
      { id: 'rec-ceviche-clasico', name: 'Ceviche Clásico', units: 11, margin: 18 },
      { id: 'rec-lomo-saltado', name: 'Lomo Saltado', units: 8, margin: 55 },
      { id: 'rec-pisco-sour', name: 'Pisco Sour', units: 7, margin: 72 },
      { id: 'rec-chicha-morada', name: 'Chicha Morada 1L', units: 6, margin: 68 },
      { id: 'rec-tiradito', name: 'Tiradito', units: 4, margin: 48 },
    ],
    donutCenter: 'S/ 3.2k',
  },

  semana: {
    label: 'Semana',
    subtitle: 'Semana del 9 al 15 de junio',
    summary:
      '📊 Vendiste <b>S/ 14,800</b> esta semana, un <span class="hl">8% más</span> que la '
      + 'anterior. El sábado fue tu mejor día (<b>S/ 3,200</b>) y el almuerzo (1–3 PM) concentró el '
      + '<b> 38%</b> de tus ventas. El <b>Ceviche Clásico</b> sigue siendo tu estrella (47 platos), '
      + 'pero su margen cayó a <b>18%</b> por el alza del limón. Subirle S/ 2 recuperaría '
      + '~S/ 94 de margen esta semana.',
    kpis: {
      ventas: { val: '14,800', delta: '+8%', note: 'vs sem. ant.' },
      ticket: { val: '87', delta: '+4%', note: 'vs sem. ant.' },
      margen: { val: '62%', delta: 'Top 25% del rubro' },
      pedidos: { val: '170', delta: '+6%', note: '≈ 420 comensales' },
    },
    spark: [0.45, 0.52, 0.55, 0.62, 0.78, 1, 0.4],
    chart: {
      labels: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
      ventas: [1650, 1820, 1900, 2100, 2680, 3200, 1450],
      pedidos: [19, 21, 22, 24, 31, 38, 15],
      margen: [60, 61, 62, 63, 64, 62, 60],
    },
    peakLabel: 'Tu día pico fue el sábado (S/ 3,200).',
    dishes: [
      { id: 'rec-ceviche-clasico', name: 'Ceviche Clásico', units: 47, margin: 18 },
      { id: 'rec-lomo-saltado', name: 'Lomo Saltado', units: 32, margin: 55 },
      { id: 'rec-pisco-sour', name: 'Pisco Sour', units: 28, margin: 72 },
      { id: 'rec-chicha-morada', name: 'Chicha Morada 1L', units: 25, margin: 68 },
      { id: 'rec-tiradito', name: 'Tiradito', units: 18, margin: 48 },
    ],
    donutCenter: 'S/ 14.8k',
  },

  mes: {
    label: 'Mes',
    subtitle: 'Junio 2026 · al día 15',
    summary:
      '📊 En lo que va de junio vendiste <b>S/ 58,500</b>, un <span class="hl">11% más</span> '
      + 'que mayo. Los fines de semana aportan el <b>46%</b> de tu facturación y el '
      + '<b> Ceviche Clásico</b> se mantiene como tu plato estrella (198 platos). Su margen '
      + 'promedio del mes (<b>20%</b>) sigue por debajo de tu meta por el costo del limón.',
    kpis: {
      ventas: { val: '58,500', delta: '+11%', note: 'vs mayo' },
      ticket: { val: '84', delta: '+2%', note: 'vs mayo' },
      margen: { val: '61%', delta: 'Top 25% del rubro' },
      pedidos: { val: '695', delta: '+9%', note: '≈ 1,720 comensales' },
    },
    spark: [0.55, 0.6, 0.58, 0.7, 0.72, 0.85, 1],
    chart: {
      labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
      ventas: [12100, 13400, 14800, 18200],
      pedidos: [150, 158, 170, 217],
      margen: [60, 61, 62, 61],
    },
    peakLabel: 'Tu mejor semana fue la 4 (S/ 18,200).',
    dishes: [
      { id: 'rec-ceviche-clasico', name: 'Ceviche Clásico', units: 198, margin: 20 },
      { id: 'rec-lomo-saltado', name: 'Lomo Saltado', units: 142, margin: 55 },
      { id: 'rec-pisco-sour', name: 'Pisco Sour', units: 120, margin: 72 },
      { id: 'rec-chicha-morada', name: 'Chicha Morada 1L', units: 104, margin: 68 },
      { id: 'rec-tiradito', name: 'Tiradito', units: 76, margin: 48 },
    ],
    donutCenter: 'S/ 58.5k',
  },
}

interface MixSlice { label: string, pct: number, color: string }
const CATEGORY_MIX: MixSlice[] = [
  { label: 'Fondos', pct: 48, color: 'var(--terracotta)' },
  { label: 'Bebidas', pct: 22, color: 'var(--mostaza)' },
  { label: 'Entradas', pct: 20, color: 'var(--oliva)' },
  { label: 'Postres', pct: 10, color: 'var(--espresso-400)' },
]

const PAYMENT_MIX: MixSlice[] = [
  { label: 'Yape', pct: 42, color: 'var(--terracotta)' },
  { label: 'Efectivo', pct: 31, color: 'var(--oliva)' },
  { label: 'Tarjeta', pct: 27, color: 'var(--mostaza)' },
]

const HEAT_ROWS = ['12–3 PM', '3–6 PM', '6–9 PM', '9–11 PM']
const HEAT_COLS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const HEAT: number[][] = [
  [0.70, 0.74, 0.78, 0.80, 0.86, 1.00, 0.58],
  [0.28, 0.30, 0.34, 0.38, 0.46, 0.56, 0.40],
  [0.40, 0.42, 0.46, 0.52, 0.80, 0.92, 0.66],
  [0.14, 0.16, 0.18, 0.24, 0.50, 0.62, 0.32],
]

const METRICS: { id: MetricId, label: string }[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'margen', label: 'Margen' },
]

const SHARE_ITEMS = [
  { icon: 'i-lucide-download', label: 'Descargar PDF' },
  { icon: 'i-lucide-mail', label: 'Enviar por correo' },
  { icon: 'i-lucide-copy', label: 'Copiar resumen' },
]

/* ============ helpers ============ */
function fmtMoney(n: number): string {
  return `S/ ${n.toLocaleString('es-PE')}`
}
function fmtMetric(id: MetricId, v: number): string {
  if (id === 'ventas') return fmtMoney(v)
  if (id === 'pedidos') return `${v} ${v === 1 ? 'pedido' : 'pedidos'}`
  return `${v}%`
}
function marginClass(m: number): 'good' | 'mid' | 'bad' {
  return m >= 50 ? 'good' : m >= 30 ? 'mid' : 'bad'
}

/* ============ state ============ */
const periodKey = ref<PeriodKey>('semana')
const data = computed<PeriodData>(() => PERIODS[periodKey.value])

const metric = ref<MetricId>('ventas')
const activeBar = ref<number | null>(null)
const scrolled = ref(false)
const grown = ref(false)

const showShare = ref(false)
const showCustom = ref(false)

/* ----- sales chart derived ----- */
const series = computed(() => data.value.chart[metric.value])
const chartLabels = computed(() => data.value.chart.labels)
const maxVal = computed(() => Math.max(...series.value))
const peakIdx = computed(() => series.value.indexOf(maxVal.value))
const avgPct = computed(() => {
  const s = series.value
  const avg = s.reduce((a, b) => a + b, 0) / s.length
  return (avg / maxVal.value) * 100
})

/* ----- top dishes ----- */
const maxUnits = computed(() => data.value.dishes[0]?.units ?? 1)

/* ----- donut (category mix) — estático ----- */
const DONUT = (() => {
  const size = 132
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  const segs = CATEGORY_MIX.map((s) => {
    const len = (s.pct / 100) * c
    const gap = 2
    const dash = `${Math.max(0, len - gap)} ${c - len + gap}`
    const off = -acc
    acc += len
    return { color: s.color, dash, off }
  })
  return { size, r, stroke, segs }
})()

/* ----- forecast band (P10/P90), proyección próxima semana — estático ----- */
const FORECAST = (() => {
  const W = 300
  const H = 110
  const pad = 8
  const center = [2050, 2150, 2250, 2400, 2700, 3100, 2850]
  const lower = center.map(v => v * 0.91)
  const upper = center.map(v => v * 1.085)
  const all = [...lower, ...upper]
  const min = Math.min(...all) * 0.96
  const max = Math.max(...all) * 1.02
  const x = (i: number): number => pad + (i / (center.length - 1)) * (W - pad * 2)
  const y = (v: number): number => H - pad - ((v - min) / (max - min)) * (H - pad * 2)
  const upPts = upper.map((v, i) => `${x(i)},${y(v)}`)
  const lowPts = lower.map((v, i) => `${x(i)},${y(v)}`).reverse()
  const areaPath = `M ${upPts.join(' L ')} L ${lowPts.join(' L ')} Z`
  const centerPts = center.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return { W, H, areaPath, centerPts }
})()

function heatAlpha(v: number): number {
  return 0.10 + v * 0.82
}

const chartUnit = computed(() =>
  data.value.label === 'Mes' ? 'semana' : data.value.label === 'Hoy' ? 'franja' : 'día')

/* ============ interactions ============ */
function goBack(): void {
  // Prioriza el historial real (igual que ScreenHeader): vuelve a donde vino el
  // usuario; `/app` es solo respaldo en deep-link / recarga.
  const hasInAppHistory = Boolean(router.options.history.state?.back)
  if (hasInAppHistory) router.back()
  else void navigateTo('/app')
}

function toggleBar(i: number): void {
  activeBar.value = activeBar.value === i ? null : i
}

function goRecipe(id: string): void {
  void navigateTo(`/app/recipes/${id}`)
}

function soon(): void {
  toast.add({ title: 'Próximamente disponible', icon: 'i-lucide-info' })
}

function notifyForecast(): void {
  toast.add({ title: 'Te avisaremos cuando el forecast IA esté disponible', icon: 'i-lucide-bell' })
}

function shareItem(close: () => void): void {
  close()
  soon()
}

/* Cambiar período: reinicia métrica/selección y reanima barras y rankings. */
watch(periodKey, () => {
  metric.value = 'ventas'
  activeBar.value = null
  if (import.meta.client) {
    grown.value = false
    requestAnimationFrame(() => { grown.value = true })
  }
})

watch(metric, () => { activeBar.value = null })

function onScroll(): void {
  scrolled.value = window.scrollY > 8
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  requestAnimationFrame(() => { grown.value = true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="rep">
    <!-- ============ 1 + 2. TOP REGION (header + selector, sticky) ============ -->
    <div class="rep-top" :class="{ scrolled }">
      <!-- 1. Header -->
      <header id="reports-header" class="rep-hdr">
        <button class="rep-icon-btn" aria-label="Volver" @click="goBack">
          <UIcon name="i-lucide-arrow-left" />
        </button>
        <div class="rep-hdr-center">
          <h1 class="rep-hdr-title">Reportes</h1>
          <div class="rep-hdr-sub">{{ data.subtitle }}</div>
        </div>
        <button class="rep-icon-btn" aria-label="Compartir reporte" @click="showShare = true">
          <UIcon name="i-lucide-share-2" />
        </button>
      </header>

      <!-- 2. Period selector -->
      <div id="period-selector" class="rep-periods" role="tablist" aria-label="Período del reporte">
        <button
          v-for="(p, k) in PERIODS"
          :key="k"
          role="tab"
          :aria-selected="periodKey === k"
          class="rep-period"
          :class="{ active: periodKey === k }"
          @click="periodKey = k as PeriodKey"
        >
          {{ p.label }}
        </button>
        <button
          role="tab"
          aria-selected="false"
          class="rep-period locked"
          aria-label="Rango personalizado, próximamente"
          @click="showCustom = true"
        >
          <UIcon name="i-lucide-lock" /> Personalizado
        </button>
      </div>
    </div>

    <div class="rep-content">
      <!-- ============ 3. AI SUMMARY ============ -->
      <section id="ai-summary" class="rep-ai" aria-label="Resumen narrativo GastronomIA">
        <div class="rep-ai-head">
          <div class="rep-ai-avatar" aria-hidden="true"><UIcon name="i-lucide-bot" /></div>
          <div class="rep-ai-label">
            Resumen GastronomIA <span class="sep">·</span><span class="ai-tag">IA</span>
          </div>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html — contenido estático de confianza -->
        <p class="rep-ai-text" v-html="data.summary" />
        <button class="rep-ai-cta" @click="goRecipe('rec-ceviche-clasico')">
          <UIcon name="i-lucide-tag" /> Ajustar precio del Ceviche
        </button>
        <div class="rep-ai-foot">
          <UIcon name="i-lucide-sparkles" /> Generado hace 4 min · se actualiza cada día
        </div>
      </section>

      <!-- ============ 4. KPI GRID ============ -->
      <section id="kpi-grid" class="rep-kpi-grid" aria-label="Indicadores principales">
        <div class="rep-kpi">
          <div class="rep-kpi-eyebrow">Ventas</div>
          <div class="rep-kpi-val"><span class="cur">S/</span>{{ data.kpis.ventas.val }}</div>
          <div class="rep-kpi-delta up">
            <UIcon name="i-lucide-arrow-up-right" /> {{ data.kpis.ventas.delta }}
            <span class="muted">· {{ data.kpis.ventas.note }}</span>
          </div>
          <div class="rep-kpi-spark" aria-hidden="true">
            <span
              v-for="(h, i) in data.spark"
              :key="i"
              :class="{ on: i === data.spark.length - 1 }"
              :style="{ height: `${Math.max(8, h * 100)}%` }"
            />
          </div>
        </div>

        <div class="rep-kpi">
          <div class="rep-kpi-eyebrow">Ticket promedio</div>
          <div class="rep-kpi-val"><span class="cur">S/</span>{{ data.kpis.ticket.val }}</div>
          <div class="rep-kpi-delta up">
            <UIcon name="i-lucide-arrow-up-right" /> {{ data.kpis.ticket.delta }}
            <span class="muted">· {{ data.kpis.ticket.note }}</span>
          </div>
          <div class="rep-kpi-spark" aria-hidden="true">
            <span
              v-for="(h, i) in data.spark"
              :key="i"
              :class="{ on: i === data.spark.length - 1 }"
              :style="{ height: `${Math.max(8, h * 100)}%` }"
            />
          </div>
        </div>

        <div class="rep-kpi">
          <div class="rep-kpi-eyebrow">Margen promedio</div>
          <div class="rep-kpi-val accent">{{ data.kpis.margen.val }}</div>
          <div class="rep-kpi-delta flat">
            <UIcon name="i-lucide-award" /> {{ data.kpis.margen.delta }}
          </div>
          <div class="rep-kpi-spark" aria-hidden="true">
            <span
              v-for="(h, i) in data.spark"
              :key="i"
              :class="{ on: i === data.spark.length - 1 }"
              :style="{ height: `${Math.max(8, h * 100)}%` }"
            />
          </div>
        </div>

        <div class="rep-kpi">
          <div class="rep-kpi-eyebrow">Pedidos</div>
          <div class="rep-kpi-val">{{ data.kpis.pedidos.val }}</div>
          <div class="rep-kpi-delta up">
            <UIcon name="i-lucide-arrow-up-right" /> {{ data.kpis.pedidos.delta }}
          </div>
          <div class="rep-kpi-meta">{{ data.kpis.pedidos.note }}</div>
        </div>
      </section>

      <!-- ============ 5. SALES CHART ============ -->
      <section id="sales-chart" class="rep-card" aria-label="Ventas por período">
        <div class="rep-card-head">
          <div class="rep-card-title">Ventas por {{ chartUnit }}</div>
          <div class="rep-metric-toggle" role="tablist" aria-label="Métrica del gráfico">
            <button
              v-for="m in METRICS"
              :key="m.id"
              role="tab"
              :aria-selected="metric === m.id"
              :class="{ active: metric === m.id }"
              @click="metric = m.id"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <div class="rep-chart">
          <div class="rep-chart-avg" :style="{ bottom: `calc(${avgPct}% * (148 / 168) + 20px)` }">
            <span class="lbl">Prom</span>
          </div>
          <div class="rep-bars">
            <div
              v-for="(v, i) in series"
              :key="i"
              class="rep-bar-col"
              :class="{ peak: i === peakIdx, active: activeBar === i }"
              role="button"
              tabindex="0"
              :aria-label="`${chartLabels[i]}: ${fmtMetric(metric, v)}`"
              @click="toggleBar(i)"
              @keydown.enter.prevent="toggleBar(i)"
              @keydown.space.prevent="toggleBar(i)"
            >
              <div v-if="activeBar === i" class="rep-tooltip">{{ fmtMetric(metric, v) }}</div>
              <div class="rep-bar" :style="{ height: grown ? `${Math.max(3, (v / maxVal) * 100)}%` : '0%' }" />
              <div class="rep-bar-lbl">{{ chartLabels[i] }}</div>
            </div>
          </div>
        </div>

        <div class="rep-chart-peaklabel">
          <UIcon name="i-lucide-trending-up" /> {{ data.peakLabel }}
        </div>
      </section>

      <!-- ============ 6. TOP DISHES ============ -->
      <section id="top-dishes" class="rep-card" aria-label="Platos más vendidos">
        <div class="rep-card-head">
          <div class="rep-card-title">🏆 Más vendidos</div>
          <button class="rep-card-link" @click="navigateTo('/app/recipes')">
            Ver todos <UIcon name="i-lucide-arrow-right" />
          </button>
        </div>

        <button
          v-for="(d, i) in data.dishes"
          :key="d.id"
          class="rep-dish"
          :class="{ first: i === 0 }"
          :aria-label="`${i + 1}. ${d.name}, ${d.units} unidades, margen ${d.margin}%`"
          @click="goRecipe(d.id)"
        >
          <span class="rep-dish-pos" :class="{ first: i === 0 }">{{ i + 1 }}</span>
          <span class="rep-dish-main">
            <span class="rep-dish-name">{{ d.name }}</span>
            <span class="rep-dish-track">
              <span class="rep-dish-fill" :style="{ width: grown ? `${(d.units / maxUnits) * 100}%` : '0%' }" />
            </span>
          </span>
          <span class="rep-dish-right">
            <span class="rep-dish-units">{{ d.units }} <small>und</small></span>
            <span class="rep-margin-chip" :class="marginClass(d.margin)">{{ d.margin }}%</span>
          </span>
        </button>
      </section>

      <!-- ============ 7. CATEGORY MIX (donut) ============ -->
      <section id="category-mix" class="rep-card" aria-label="Mix por categoría">
        <div class="rep-card-head">
          <div class="rep-card-title">Mix por categoría</div>
        </div>
        <div class="rep-donut-wrap">
          <div class="rep-donut" aria-hidden="true">
            <svg :width="DONUT.size" :height="DONUT.size" :viewBox="`0 0 ${DONUT.size} ${DONUT.size}`">
              <circle
                v-for="(s, i) in DONUT.segs"
                :key="i"
                :cx="DONUT.size / 2"
                :cy="DONUT.size / 2"
                :r="DONUT.r"
                fill="none"
                :stroke="s.color"
                :stroke-width="DONUT.stroke"
                :stroke-dasharray="s.dash"
                :stroke-dashoffset="s.off"
                stroke-linecap="butt"
                :transform="`rotate(-90 ${DONUT.size / 2} ${DONUT.size / 2})`"
              />
            </svg>
            <div class="rep-donut-center">
              <span class="v">{{ data.donutCenter }}</span>
              <span class="k">Total</span>
            </div>
          </div>
          <div class="rep-legend">
            <div v-for="s in CATEGORY_MIX" :key="s.label" class="rep-legend-row">
              <span class="rep-legend-dot" :style="{ background: s.color }" />
              <span class="rep-legend-label">{{ s.label }}</span>
              <span class="rep-legend-val">{{ s.pct }}%</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 8. PAYMENT MIX ============ -->
      <section id="payment-mix" class="rep-card" aria-label="Métodos de pago">
        <div class="rep-card-head">
          <div class="rep-card-title">Métodos de pago</div>
        </div>
        <div class="rep-paybar" role="img" aria-label="Yape 42%, Efectivo 31%, Tarjeta 27%">
          <span v-for="p in PAYMENT_MIX" :key="p.label" :style="{ width: `${p.pct}%`, background: p.color }">
            {{ p.pct >= 20 ? `${p.pct}%` : '' }}
          </span>
        </div>
        <div class="rep-pay-legend">
          <span v-for="p in PAYMENT_MIX" :key="p.label" class="rep-pay-item">
            <span class="dot" :style="{ background: p.color }" />
            {{ p.label }} <b>{{ p.pct }}%</b>
          </span>
        </div>
      </section>

      <!-- ============ 9. HOURS HEATMAP ============ -->
      <section id="hours-heatmap" class="rep-card" aria-label="Mapa de calor de horas">
        <div class="rep-card-head">
          <div class="rep-card-title">¿Cuándo vendes más?</div>
        </div>
        <div class="rep-heat">
          <div class="rep-heat-corner" />
          <div v-for="c in HEAT_COLS" :key="c" class="rep-heat-colh">{{ c }}</div>
          <template v-for="(row, ri) in HEAT" :key="ri">
            <div class="rep-heat-rowh">{{ HEAT_ROWS[ri] }}</div>
            <div
              v-for="(v, ci) in row"
              :key="ci"
              class="rep-heat-cell"
              :class="{ peak: v >= 1 }"
              :style="{ background: `rgba(201, 106, 67, ${heatAlpha(v)})`, animationDelay: `${(ri * 7 + ci) * 0.012}s` }"
              :title="`${HEAT_ROWS[ri]} · ${HEAT_COLS[ci]}`"
            />
          </template>
        </div>
        <div class="rep-heat-foot">
          <UIcon name="i-lucide-flame" /> Tu hora pico es el <b>sábado, 1–3 PM</b>.
        </div>
      </section>

      <!-- ============ 10. FORECAST TEASER (E08) ============ -->
      <section id="forecast-teaser" class="rep-card rep-forecast" aria-label="Forecast próxima semana">
        <span class="rep-badge"><UIcon name="i-lucide-sparkles" /> IA · Próximamente</span>
        <div class="rep-card-head">
          <div class="rep-card-title">Forecast · próxima semana</div>
        </div>
        <div class="rep-forecast-sub">
          Proyección <b>S/ 15,500</b> · rango <b>S/ 14,200 – 16,800</b>
        </div>

        <div class="rep-forecast-chart">
          <svg :viewBox="`0 0 ${FORECAST.W} ${FORECAST.H}`" role="img" aria-label="Banda de proyección P10 a P90">
            <path :d="FORECAST.areaPath" fill="rgba(201,106,67,0.16)" stroke="none" />
            <polyline
              :points="FORECAST.centerPts"
              fill="none"
              stroke="var(--terracotta)"
              stroke-width="2"
              stroke-dasharray="5 4"
              stroke-linecap="round"
            />
          </svg>

          <div class="rep-forecast-lock">
            <div class="rep-lock-ico" aria-hidden="true"><UIcon name="i-lucide-lock" /></div>
            <div class="rep-lock-text">
              El forecast de demanda con IA llega en el próximo sprint.
            </div>
            <button class="rep-lock-btn" @click="notifyForecast">
              <UIcon name="i-lucide-bell" /> Avísame cuando esté listo
            </button>
          </div>
        </div>
      </section>

      <!-- ============ 11. EXPORT BAR ============ -->
      <section id="export-bar" aria-label="Exportar reporte">
        <div class="rep-section-eyebrow">Exportar</div>
        <div class="rep-export">
          <button class="rep-export-btn" @click="soon">
            <UIcon name="i-lucide-download" /> Descargar PDF
          </button>
          <button class="rep-export-btn" @click="soon">
            <UIcon name="i-lucide-mail" /> Enviar por correo
          </button>
        </div>
      </section>
    </div>

    <!-- ============ Share action sheet ============ -->
    <UiBottomSheet v-model="showShare" title="Compartir reporte">
      <template #default="{ close }">
        <div class="rep-sheet-list">
          <button
            v-for="it in SHARE_ITEMS"
            :key="it.label"
            class="rep-sheet-item"
            @click="shareItem(close)"
          >
            <span class="ico" aria-hidden="true"><UIcon :name="it.icon" /></span>
            {{ it.label }}
            <span class="soon">PRONTO</span>
          </button>
        </div>
      </template>
    </UiBottomSheet>

    <!-- ============ Custom range modal ============ -->
    <Teleport to="body">
      <div v-if="showCustom" class="rep-modal-overlay" @click="showCustom = false">
        <div class="rep-modal" role="dialog" aria-label="Rango personalizado" @click.stop>
          <div class="rep-modal-ico" aria-hidden="true"><UIcon name="i-lucide-calendar-range" /></div>
          <h3>Rango personalizado</h3>
          <p>Pronto podrás elegir cualquier rango de fechas para tus reportes. Por ahora usa Hoy, Semana o Mes.</p>
          <button class="rep-modal-btn" @click="showCustom = false">Entendido</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Portado de reports-styles.css (Claude Design). Prefijo: rep-
   Adaptado al shell Nuxt: scroll de documento + columna centrada (760px),
   header sticky (no absolute), sin bottom-nav propio (lo da el layout). */

/* ============ TOP REGION (header + selector, sticky) ============ */
.rep-top {
  position: sticky;
  top: 0;
  z-index: 6;
  background: var(--crema);
  border-bottom: 1px solid transparent;
  transition: border-color var(--dur), box-shadow var(--dur), background var(--dur);
}
.rep-top.scrolled {
  border-bottom-color: var(--border-subtle);
  background: rgba(243, 237, 228, 0.92);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
}

.rep-hdr {
  max-width: 760px;
  margin: 0 auto;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 14px 10px;
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  gap: 8px;
}
@media (min-width: 1024px) {
  .rep-hdr { padding-top: 28px; }
}
.rep-icon-btn {
  width: 40px; height: 40px; border-radius: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--fg1); cursor: pointer;
  transition: background var(--dur), color var(--dur), transform 80ms;
}
.rep-icon-btn:hover { background: var(--crema-100); }
.rep-icon-btn:active { transform: scale(0.95); }
.rep-icon-btn :deep(svg) { width: 19px; height: 19px; }
.rep-hdr-center { text-align: center; min-width: 0; }
.rep-hdr-title {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 21px; line-height: 1;
  color: var(--fg1);
  margin: 0;
}
.rep-hdr-sub {
  font-size: 12px; color: var(--fg3);
  margin-top: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* --- Period selector (segmented) --- */
.rep-periods {
  max-width: 760px;
  margin: 0 auto;
  display: flex; gap: 6px;
  padding: 2px 14px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}
.rep-periods::-webkit-scrollbar { display: none; }
.rep-period {
  flex: 0 0 auto;
  font: inherit; font-size: 13.5px; font-weight: 600;
  color: var(--fg2);
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  transition: transform 80ms var(--ease-standard);
}
.rep-period:active { transform: scale(0.96); }
.rep-period.active {
  background: var(--terracotta);
  color: var(--crema-100);
  border-color: var(--terracotta);
}
.rep-period.locked {
  color: var(--fg3);
  border-style: dashed;
  border-color: var(--border);
  background: transparent;
}
.rep-period.locked :deep(svg) { width: 13px; height: 13px; opacity: 0.8; }

/* ============ CONTENT COLUMN ============ */
.rep-content {
  max-width: 760px;
  margin: 0 auto;
  padding: 12px 14px 24px;
  position: relative;
}

/* Shared card */
.rep-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.rep-card + .rep-card { margin-top: 12px; }

.rep-card-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 14px;
}
.rep-card-title {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 18px; line-height: 1.1;
  color: var(--fg1);
}
.rep-card-link {
  font: inherit; font-size: 12.5px; font-weight: 600;
  color: var(--terracotta-700);
  background: none; border: none; cursor: pointer;
  display: inline-flex; align-items: center; gap: 3px;
  padding: 4px;
}
.rep-card-link :deep(svg) { width: 14px; height: 14px; }

/* ============ 3. AI SUMMARY ============ */
.rep-ai {
  background: linear-gradient(158deg, var(--crema-100) 0%, #FBF1EB 100%);
  border: 1px solid var(--terracotta-100);
  border-radius: 16px;
  padding: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  margin-bottom: 12px;
}
.rep-ai-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px;
}
.rep-ai-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg, #4AA6B8 0%, var(--terracotta) 100%);
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(201, 106, 67, 0.35);
}
.rep-ai-avatar :deep(svg) { width: 19px; height: 19px; }
.rep-ai-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--terracotta-700);
}
.rep-ai-label .sep { color: var(--fg3); margin: 0 4px; font-weight: 500; }
.rep-ai-label .ai-tag { color: var(--fg2); }
.rep-ai-text {
  font-size: 14.5px; line-height: 1.55; color: var(--fg1);
  text-wrap: pretty;
  margin: 0 0 14px;
}
.rep-ai-text :deep(b) { font-weight: 600; }
.rep-ai-text :deep(.hl) {
  background: linear-gradient(transparent 58%, var(--mostaza-100) 58%);
  padding: 0 2px; font-weight: 600;
}
.rep-ai-cta {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--espresso); color: var(--crema-100);
  border: none; border-radius: 12px;
  padding: 11px 16px;
  font: inherit; font-size: 13.5px; font-weight: 600;
  cursor: pointer;
  transition: background var(--dur), transform 80ms;
}
.rep-ai-cta:hover { background: var(--espresso-800); }
.rep-ai-cta:active { transform: scale(0.97); }
.rep-ai-cta :deep(svg) { width: 15px; height: 15px; color: var(--mostaza); }
.rep-ai-foot {
  margin-top: 12px;
  font-size: 11.5px; color: var(--fg3);
  display: flex; align-items: center; gap: 6px;
}
.rep-ai-foot :deep(svg) { width: 12px; height: 12px; }

/* ============ 4. KPI GRID 2x2 ============ */
.rep-kpi-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-bottom: 12px;
}
.rep-kpi {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 13px 14px 12px;
  display: flex; flex-direction: column; gap: 4px;
  box-shadow: var(--shadow-sm);
  min-height: 116px;
}
.rep-kpi-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--fg3);
}
.rep-kpi-val {
  font-family: var(--font-sans);
  font-size: 27px; font-weight: 600; letter-spacing: -0.025em;
  line-height: 1.05; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.rep-kpi-val.accent { color: var(--terracotta-700); }
.rep-kpi-val .cur {
  font-size: 14px; font-weight: 500; color: var(--fg3);
  margin-right: 3px; vertical-align: 0.16em;
}
.rep-kpi-delta {
  font-size: 12px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 4px;
}
.rep-kpi-delta.up { color: var(--oliva-700); }
.rep-kpi-delta.down { color: var(--danger); }
.rep-kpi-delta.flat { color: var(--terracotta-700); }
.rep-kpi-delta :deep(svg) { width: 13px; height: 13px; }
.rep-kpi-delta .muted { color: var(--fg3); font-weight: 500; }
.rep-kpi-meta { font-size: 11.5px; color: var(--fg3); margin-top: 2px; }
.rep-kpi-spark {
  display: flex; align-items: flex-end; gap: 2.5px;
  height: 22px; margin-top: auto; padding-top: 6px;
}
.rep-kpi-spark span {
  flex: 1; background: var(--terracotta-100); border-radius: 2px;
  transform-origin: bottom;
  transition: height 0.5s var(--ease-emphasis);
}
.rep-kpi-spark span.on { background: var(--terracotta); }

/* ============ 5. SALES CHART ============ */
.rep-metric-toggle {
  display: inline-flex;
  background: var(--crema-200);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.rep-metric-toggle button {
  font: inherit; font-size: 12.5px; font-weight: 600;
  color: var(--fg2);
  background: transparent; border: none;
  padding: 6px 12px; border-radius: 8px;
  cursor: pointer;
  transition: background var(--dur), color var(--dur), box-shadow var(--dur);
}
.rep-metric-toggle button.active {
  background: var(--pure-white);
  color: var(--fg1);
  box-shadow: var(--shadow-xs);
}
.rep-chart {
  position: relative;
  height: 168px;
  margin-top: 6px;
  padding-top: 20px;
}
.rep-chart-avg {
  position: absolute; left: 0; right: 0;
  border-top: 1px dashed var(--border-strong);
  z-index: 1;
  pointer-events: none;
}
.rep-chart-avg .lbl {
  position: absolute; right: 0; top: -8px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg3);
  background: var(--pure-white);
  padding: 1px 4px;
}
.rep-bars {
  display: flex; align-items: flex-end; gap: 7px;
  height: 100%;
  border-bottom: 1.5px solid var(--border);
  position: relative; z-index: 2;
}
.rep-bar-col {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 0;
  cursor: pointer;
  position: relative;
  background: none; border: none; font: inherit;
}
.rep-bar {
  width: 100%;
  max-width: 30px;
  background: var(--terracotta-300);
  border-radius: 5px 5px 0 0;
  transition: height 0.6s var(--ease-emphasis), background var(--dur);
  min-height: 2px;
}
.rep-bar-col.peak .rep-bar { background: var(--terracotta); }
.rep-bar-col.active .rep-bar { background: var(--terracotta-700); }
.rep-bar-lbl {
  font-size: 11px; font-weight: 500; color: var(--fg3);
  margin-top: 7px;
  font-variant-numeric: tabular-nums;
}
.rep-bar-col.peak .rep-bar-lbl,
.rep-bar-col.active .rep-bar-lbl { color: var(--fg1); font-weight: 600; }
.rep-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%; transform: translateX(-50%);
  background: var(--espresso); color: var(--crema-100);
  font-size: 11.5px; font-weight: 600;
  white-space: nowrap;
  padding: 5px 9px; border-radius: 8px;
  z-index: 5;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  animation: repRise 0.2s var(--ease-standard);
  font-variant-numeric: tabular-nums;
}
.rep-tooltip::after {
  content: ''; position: absolute; top: 100%; left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent; border-top-color: var(--espresso);
}
.rep-chart-peaklabel {
  margin-top: 14px;
  font-size: 12px; color: var(--fg2);
  display: flex; align-items: center; gap: 6px;
}
.rep-chart-peaklabel :deep(svg) { width: 13px; height: 13px; color: var(--terracotta); }

@keyframes repRise {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ============ 6. TOP DISHES ============ */
.rep-dish {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 6px;
  border: none; background: none;
  width: 100%; text-align: left;
  cursor: pointer; font: inherit;
  border-radius: 10px;
  transition: background var(--dur);
}
.rep-dish:hover { background: var(--crema-100); }
.rep-dish + .rep-dish { border-top: 1px solid var(--border-subtle); }
.rep-dish-pos {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 16px; color: var(--fg3);
  text-align: center;
}
.rep-dish-pos.first { color: var(--terracotta-700); }
.rep-dish-main { min-width: 0; }
.rep-dish-name {
  display: block;
  font-size: 14px; font-weight: 600; color: var(--fg1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 6px;
}
.rep-dish-track {
  display: block;
  height: 7px; border-radius: 999px;
  background: var(--crema-200);
  overflow: hidden;
}
.rep-dish-fill {
  display: block;
  height: 100%; border-radius: 999px;
  background: var(--terracotta-300);
  width: 0;
  transition: width 0.7s var(--ease-emphasis);
}
.rep-dish.first .rep-dish-fill { background: var(--terracotta); }
.rep-dish-right {
  display: flex; flex-direction: column; align-items: flex-end; gap: 5px;
}
.rep-dish-units {
  font-size: 13px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.rep-dish-units small { color: var(--fg3); font-weight: 500; font-size: 11px; }
.rep-margin-chip {
  font-size: 10.5px; font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px; border-radius: 999px;
  letter-spacing: 0.01em;
}
.rep-margin-chip.good { background: var(--oliva-100); color: var(--oliva-700); }
.rep-margin-chip.mid { background: var(--mostaza-100); color: var(--mostaza-700); }
.rep-margin-chip.bad { background: var(--danger-bg); color: var(--danger); }

/* ============ 7. CATEGORY MIX (donut) ============ */
.rep-donut-wrap {
  display: flex; align-items: center; gap: 18px;
}
.rep-donut { position: relative; flex-shrink: 0; }
.rep-donut svg { display: block; }
.rep-donut-center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center;
}
.rep-donut-center .v {
  font-family: var(--font-sans);
  font-size: 18px; font-weight: 600; letter-spacing: -0.02em;
  color: var(--fg1); line-height: 1;
  white-space: nowrap;
}
.rep-donut-center .k {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--fg3); margin-top: 3px;
}
.rep-legend {
  flex: 1; display: flex; flex-direction: column; gap: 9px;
  min-width: 0;
}
.rep-legend-row {
  display: grid; grid-template-columns: 12px 1fr auto;
  align-items: center; gap: 9px;
}
.rep-legend-dot {
  width: 11px; height: 11px; border-radius: 3px;
}
.rep-legend-label { font-size: 13px; color: var(--fg2); }
.rep-legend-val {
  font-size: 13px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}

/* ============ 8. PAYMENT MIX (stacked bar) ============ */
.rep-paybar {
  display: flex; height: 26px; border-radius: 8px; overflow: hidden;
  margin-bottom: 14px;
  box-shadow: inset 0 0 0 1px var(--border-subtle);
}
.rep-paybar span {
  height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10.5px; font-weight: 700; color: #fff;
  transition: width 0.6s var(--ease-emphasis);
  min-width: 0;
}
.rep-pay-legend {
  display: flex; flex-wrap: wrap; gap: 14px;
}
.rep-pay-item {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12.5px; color: var(--fg2);
}
.rep-pay-item .dot { width: 9px; height: 9px; border-radius: 3px; }
.rep-pay-item b { color: var(--fg1); font-weight: 600; font-variant-numeric: tabular-nums; }

/* ============ 9. HOURS HEATMAP ============ */
.rep-heat {
  display: grid;
  grid-template-columns: 58px repeat(7, 1fr);
  gap: 5px;
}
.rep-heat-colh {
  text-align: center;
  font-size: 10.5px; font-weight: 600; color: var(--fg3);
}
.rep-heat-rowh {
  font-size: 10.5px; font-weight: 500; color: var(--fg2);
  display: flex; align-items: center;
  white-space: nowrap;
}
.rep-heat-cell {
  height: 34px;
  border-radius: 6px;
  position: relative;
  animation: repFade 0.5s var(--ease-standard) both;
}
.rep-heat-cell.peak {
  box-shadow: 0 0 0 2px var(--espresso);
}
@keyframes repFade { from { opacity: 0; } to { opacity: 1; } }
.rep-heat-foot {
  margin-top: 14px;
  font-size: 12.5px; color: var(--fg2);
  display: flex; align-items: center; gap: 7px;
}
.rep-heat-foot :deep(svg) { width: 14px; height: 14px; color: var(--terracotta); }
.rep-heat-foot b { color: var(--fg1); font-weight: 600; }

/* ============ 10. FORECAST TEASER ============ */
.rep-forecast { position: relative; overflow: hidden; }
.rep-forecast .rep-card-title { padding-right: 150px; }
.rep-forecast .rep-badge {
  position: absolute; top: 14px; right: 14px;
  z-index: 4;
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--mostaza-100); color: var(--mostaza-700);
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em;
  padding: 4px 9px; border-radius: 999px;
}
.rep-badge :deep(svg) { width: 12px; height: 12px; }
.rep-forecast-sub {
  font-size: 12.5px; color: var(--fg2); margin: -6px 0 12px;
}
.rep-forecast-sub b { color: var(--fg1); font-weight: 600; font-variant-numeric: tabular-nums; }
.rep-forecast-chart { position: relative; }
.rep-forecast-chart svg { display: block; width: 100%; height: auto; }
.rep-forecast-lock {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center;
  background: linear-gradient(180deg, rgba(248, 244, 237, 0.32), rgba(248, 244, 237, 0.82));
  -webkit-backdrop-filter: blur(1.5px); backdrop-filter: blur(1.5px);
  border-radius: 12px;
  padding: 16px;
}
.rep-lock-ico {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--pure-white); border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--terracotta-700);
  box-shadow: var(--shadow-sm);
}
.rep-lock-ico :deep(svg) { width: 18px; height: 18px; }
.rep-lock-text {
  font-size: 12.5px; color: var(--fg2); max-width: 230px; line-height: 1.45;
}
.rep-lock-btn {
  margin-top: 2px;
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--terracotta); color: var(--crema-100);
  border: none; border-radius: 10px;
  padding: 9px 15px; font: inherit; font-size: 12.5px; font-weight: 600;
  cursor: pointer;
  transition: background var(--dur), transform 80ms;
}
.rep-lock-btn:hover { background: var(--terracotta-700); }
.rep-lock-btn:active { transform: scale(0.97); }
.rep-lock-btn :deep(svg) { width: 14px; height: 14px; }

/* ============ 11. EXPORT BAR ============ */
.rep-export {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-top: 14px;
}
.rep-export-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 13px;
  font: inherit; font-size: 13.5px; font-weight: 600;
  color: var(--fg1);
  cursor: pointer;
  transition: background var(--dur), transform 80ms;
}
.rep-export-btn:hover { background: var(--crema-100); }
.rep-export-btn:active { transform: scale(0.98); }
.rep-export-btn :deep(svg) { width: 16px; height: 16px; color: var(--fg2); }

#export-bar { margin-top: 12px; }
.rep-section-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg3);
  padding: 6px 2px 4px;
}

/* ============ ACTION SHEET (share) — contenido dentro de UiBottomSheet ============ */
.rep-sheet-list { display: flex; flex-direction: column; gap: 6px; }
.rep-sheet-item {
  display: flex; align-items: center; gap: 13px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  font: inherit; font-size: 14.5px; font-weight: 500; color: var(--fg1);
  cursor: pointer; text-align: left; width: 100%;
  transition: background var(--dur), transform 80ms;
}
.rep-sheet-item:hover { background: var(--crema-100); }
.rep-sheet-item:active { transform: scale(0.99); }
.rep-sheet-item .ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rep-sheet-item .ico :deep(svg) { width: 18px; height: 18px; }
.rep-sheet-item .soon {
  margin-left: auto;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
  color: var(--mostaza-700); background: var(--mostaza-100);
  padding: 3px 7px; border-radius: 999px;
}

/* ============ CUSTOM RANGE MODAL ============ */
.rep-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.45);
  z-index: 55;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  opacity: 0;
  animation: repOvIn 200ms var(--ease-standard) forwards;
}
@keyframes repOvIn { to { opacity: 1; } }
.rep-modal {
  background: var(--crema-100);
  border-radius: 18px;
  padding: 24px 20px 18px;
  text-align: center;
  max-width: 300px;
  box-shadow: var(--shadow-lg);
  animation: repPop 0.3s var(--ease-emphasis);
}
@keyframes repPop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.rep-modal-ico {
  width: 48px; height: 48px; border-radius: 14px;
  background: var(--mostaza-100); color: var(--mostaza-700);
  display: inline-flex; align-items: center; justify-content: center;
  margin: 0 auto 14px;
}
.rep-modal-ico :deep(svg) { width: 24px; height: 24px; }
.rep-modal h3 {
  font-family: var(--font-serif); font-style: italic; font-weight: 500;
  font-size: 20px; margin: 0 0 6px; color: var(--fg1);
}
.rep-modal p {
  font-size: 13.5px; color: var(--fg2); line-height: 1.5; margin: 0 0 18px;
}
.rep-modal-btn {
  width: 100%;
  background: var(--terracotta); color: var(--crema-100);
  border: none; border-radius: 12px;
  padding: 12px; font: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: background var(--dur);
}
.rep-modal-btn:hover { background: var(--terracotta-700); }

/* reduced motion */
@media (prefers-reduced-motion: reduce) {
  .rep-kpi-spark span, .rep-heat-cell,
  .rep-bar, .rep-dish-fill, .rep-paybar span { animation: none !important; transition: none !important; }
}
</style>
