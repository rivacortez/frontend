<script setup lang="ts">
import type { InventoryMovement, MovementType, Recipe } from '#shared/types/domain'

definePageMeta({ layout: 'app' })

const route = useRoute()
const toast = useToast()

const ingredientId = computed(() => String(route.params.id))

const { data: ingredients } = useIngredients()
const { data: recipes } = useRecipes()
const { data: movements } = useMovements(ingredientId)

const product = computed(() => ingredients.value?.find(i => i.id === ingredientId.value))

useSeoMeta({ title: () => `${product.value?.name ?? 'Insumo'} — GastronomIA` })

const INGREDIENT_EMOJI_BY_ID: Record<string, string> = {
  'ing-01': '🍋',
  'ing-02': '🐟',
  'ing-03': '🧅',
  'ing-04': '🌶️',
  'ing-05': '🍠',
  'ing-06': '🌽',
  'ing-07': '🌿',
  'ing-08': '🥩',
  'ing-09': '🥔',
  'ing-10': '🍅',
  'ing-11': '🍗',
  'ing-12': '🌶️',
  'ing-13': '🍚',
  'ing-14': '🫒',
  'ing-15': '🍾',
  'ing-16': '🥃',
  'ing-17': '🥭',
  'ing-18': '🥛',
  'ing-19': '🧀',
  'ing-20': '🦐',
}
const INGREDIENT_EMOJI_BY_CATEGORY: Record<string, string> = {
  'Verduras y frutas': '🥬',
  'Pescados y mariscos': '🐟',
  'Carnes': '🥩',
  'Hierbas': '🌿',
  'Lácteos': '🥛',
  'Abarrotes': '🧂',
  'Licores': '🍾',
  'Bebidas': '🥤',
}
const emoji = computed(() => {
  const p = product.value
  if (!p) return '🥄'
  return INGREDIENT_EMOJI_BY_ID[p.id] ?? INGREDIENT_EMOJI_BY_CATEGORY[p.category] ?? '🥄'
})

/* ===== Estado de stock ===== */
type StockStatus = 'crit' | 'low' | 'ok'
const status = computed<StockStatus>(() => {
  const p = product.value
  if (!p) return 'ok'
  // El backend (E05) ya calcula el estado; lo usamos si vino, con fallback local.
  if (p.status) return p.status === 'critical' ? 'crit' : p.status
  if (p.minStock <= 0) return 'ok'
  if (p.stock <= p.minStock * 0.5) return 'crit'
  if (p.stock < p.minStock) return 'low'
  return 'ok'
})
const statusLabel = computed(() =>
  status.value === 'crit' ? 'Stock Crítico' : status.value === 'low' ? 'Stock Bajo' : 'Stock OK')
const statusEmoji = computed(() =>
  status.value === 'crit' ? '🔴' : status.value === 'low' ? '🟡' : '🟢')

const isNoCost = computed(() => (product.value?.unitCost ?? 0) === 0)

/* ===== Tendencia de precio (mock alineado a la historia del Limón Sutil) ===== */
const TREND_SHAPE = [0, 0.05, 0.03, 0.08, 0.05, 0.13, 0.22, 0.4, 0.55, 0.66, 0.82, 1]
const hasTrend = computed(() => product.value?.id === 'ing-01')
const trendPct = 30
const costPrev = computed(() => +((product.value?.unitCost ?? 0) / (1 + trendPct / 100)).toFixed(2))
const trendSeries = computed<number[]>(() => {
  const from = costPrev.value
  const to = product.value?.unitCost ?? 0
  return TREND_SHAPE.map(t => +(from + (to - from) * t).toFixed(2))
})
const chartW = 320
const chartH = 56
const trendPoints = computed<[number, number][]>(() => {
  const s = trendSeries.value
  const pad = 4
  const min = Math.min(...s)
  const max = Math.max(...s)
  const range = max - min || 1
  const stepX = (chartW - pad * 2) / (s.length - 1)
  return s.map((v, i) => [pad + i * stepX, chartH - pad - ((v - min) / range) * (chartH - pad * 2)])
})
const trendPath = computed(() =>
  trendPoints.value.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' '))
const trendArea = computed(() => {
  const pts = trendPoints.value
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (!first || !last) return ''
  return `${trendPath.value} L${last[0]},${chartH} L${first[0]},${chartH} Z`
})
const trendLast = computed(() => trendPoints.value[trendPoints.value.length - 1] ?? [0, 0])

/* ===== Recetas que lo usan ===== */
interface RecipeUsage {
  recipe: Recipe
  qtyLabel: string
  impact: 'high' | 'mid' | 'low'
  estimated: boolean
}
const usages = computed<RecipeUsage[]>(() => {
  const id = ingredientId.value
  return (recipes.value ?? [])
    .map((recipe) => {
      const item = recipe.items.find(it => it.ingredientId === id)
      if (!item) return null
      const share = recipe.cost > 0 ? (item.cost * (1 + item.wastePct / 100)) / recipe.cost : 0
      const qtyLabel = item.unit === 'kg' && item.qty < 1
        ? `${Math.round(item.qty * 1000)} g por porción`
        : `${item.qty} ${item.unit} por porción`
      return {
        recipe,
        qtyLabel,
        impact: share > 0.25 ? 'high' as const : share >= 0.1 ? 'mid' as const : 'low' as const,
        estimated: recipe.items.some(it => it.cost === 0),
      }
    })
    .filter((u): u is RecipeUsage => u !== null)
})

function impactLabel(i: RecipeUsage['impact']): string {
  return i === 'high' ? 'Alto impacto' : i === 'mid' ? 'Impacto medio' : 'Bajo impacto'
}

/* ===== Movimientos ===== */
const MOVEMENT_LABELS: Record<MovementType, string> = {
  purchase: 'Compra recibida',
  sale: 'Consumo venta',
  waste: 'Merma registrada',
  adjustment: 'Ajuste manual',
  count: 'Conteo físico',
}
const visibleMovements = computed<InventoryMovement[]>(() => (movements.value ?? []).slice(0, 5))

function movDirection(m: InventoryMovement): 'in' | 'out' {
  return m.qty >= 0 ? 'in' : 'out'
}
function movQtyLabel(m: InventoryMovement): string {
  const sign = m.qty >= 0 ? '+' : '−'
  return `${sign}${Math.abs(m.qty)} ${m.unit}`
}
function movLabel(m: InventoryMovement): string {
  return m.note ?? MOVEMENT_LABELS[m.type]
}

/* ===== Proyección IA ===== */
const daysLeft = computed(() => (status.value === 'crit' ? 2 : status.value === 'low' ? 4 : 7))
const suggestQty = computed(() => {
  const p = product.value
  if (!p) return 1
  return Math.max(1, Math.ceil(p.minStock * 1.6 - p.stock))
})

/* ===== Sheets ===== */
const showEdit = ref(false)
const editFocusCost = ref(false)
const editForm = reactive({ name: '', category: '', unit: '', cost: '', min: '', max: '' })

function openEdit(focusCost: boolean): void {
  const p = product.value
  if (!p) return
  editFocusCost.value = focusCost
  editForm.name = p.name
  editForm.category = p.category
  editForm.unit = p.unit
  editForm.cost = p.unitCost > 0 ? p.unitCost.toFixed(2) : ''
  editForm.min = String(p.minStock)
  editForm.max = String(p.minStock * 4)
  showEdit.value = true
}

const { mutateAsync: updateIngredient, isLoading: savingEdit } = useUpdateIngredient()

async function saveEdit(): Promise<void> {
  const p = product.value
  if (!p) return
  await updateIngredient({
    id: p.id,
    name: editForm.name.trim() || p.name,
    category: editForm.category.trim() || p.category,
    unit: editForm.unit.trim() || p.unit,
    unitCost: Number.parseFloat(editForm.cost) || 0,
    minStock: Number.parseFloat(editForm.min) || 0,
  })
  showEdit.value = false
  toast.add({
    title: editFocusCost.value ? 'Costo agregado' : 'Cambios guardados',
    icon: 'i-lucide-check-circle-2',
  })
}

/* Movimiento rápido */
type QuickType = 'entrada' | 'salida' | 'ajuste'
const QUICK_SEGMENTS: { id: QuickType, label: string }[] = [
  { id: 'entrada', label: '↓ Entrada' },
  { id: 'salida', label: '↑ Salida' },
  { id: 'ajuste', label: '⇄ Ajuste' },
]
const showQuickMove = ref(false)
const quickType = ref<QuickType>('entrada')
const quickQty = ref('')
const quickNote = ref('')

const { mutateAsync: createMovement, isLoading: savingMove } = useCreateMovement()

function openQuickMove(type: QuickType): void {
  quickType.value = type
  quickQty.value = ''
  quickNote.value = ''
  showQuickMove.value = true
}

const quickQtyNum = computed(() => Number.parseFloat(quickQty.value) || 0)
const canSaveMove = computed(() => quickQtyNum.value > 0 && !savingMove.value)

async function saveQuickMove(): Promise<void> {
  const p = product.value
  if (!p || !canSaveMove.value) return
  // 'salida' = consumo (sale); la merma con razón vive en /app/inventario/movimiento.
  const typeMap: Record<QuickType, MovementType> = {
    entrada: 'purchase',
    salida: 'sale',
    ajuste: 'adjustment',
  }
  const qty = quickType.value === 'salida' ? -quickQtyNum.value : quickQtyNum.value
  await createMovement({
    ingredientId: p.id,
    type: typeMap[quickType.value],
    qty,
    note: quickNote.value.trim() || undefined,
  })
  showQuickMove.value = false
  toast.add({ title: `Movimiento (${quickType.value}) registrado`, icon: 'i-lucide-check-circle-2' })
}

const { mutateAsync: addShopping } = useAddShoppingItem()

async function addToShopping(qty?: number): Promise<void> {
  const p = product.value
  if (!p) return
  await addShopping({ ingredientId: p.id, suggestedQty: qty })
  toast.add({
    title: qty
      ? `${qty} ${p.unit} de ${p.name} agregados a Lista de Compras`
      : `${p.name} agregado a Lista de Compras`,
    icon: 'i-lucide-shopping-cart',
  })
}
</script>

<template>
  <div class="pd-page">
    <template v-if="product">
      <!-- ============ Header ============ -->
      <UiScreenHeader :title="product.name" :subtitle="product.category" back="/app/inventario">
        <template #trailing>
          <button class="pd-edit" aria-label="Editar insumo" @click="openEdit(false)">
            <UIcon name="i-lucide-pencil" /> Editar
          </button>
        </template>
      </UiScreenHeader>

      <!-- ============ Banner sin costo ============ -->
      <div v-if="isNoCost" class="pd-nocost" role="alert">
        <div class="ico" aria-hidden="true"><UIcon name="i-lucide-alert-triangle" /></div>
        <div class="body">
          <h4>Sin costo registrado</h4>
          <p>Este insumo no tiene costo. Las recetas que lo usan tienen margen estimado.</p>
          <button class="btn cost-btn" @click="openEdit(true)">
            <UIcon name="i-lucide-plus" /> Agregar costo
          </button>
        </div>
      </div>

      <!-- ============ Hero ============ -->
      <section class="pd-hero" aria-label="Resumen del insumo">
        <div class="pd-hero-img" aria-hidden="true">
          <span class="emoji">{{ emoji }}</span>
          <span class="placeholder-tag">Foto insumo</span>
        </div>
        <div class="pd-hero-body">
          <div class="pd-status-pill" :class="status">
            <span class="d" aria-hidden="true" />
            {{ statusEmoji }} {{ statusLabel }}
          </div>

          <div class="pd-kv-grid">
            <div class="pd-kv">
              <div class="label">Stock actual</div>
              <div class="value" :class="{ danger: status === 'crit' }">
                {{ product.stock }}<span class="unit"> {{ product.unit }}</span>
              </div>
            </div>
            <div class="pd-kv">
              <div class="label">Costo</div>
              <div class="value">
                <template v-if="!isNoCost">
                  <span class="currency">S/</span>{{ product.unitCost.toFixed(2) }}<span class="unit">/{{ product.unit }}</span>
                </template>
                <span v-else class="nocost-dash">—</span>
              </div>
            </div>
            <div class="pd-kv">
              <div class="label">Mínimo</div>
              <div class="value">
                {{ product.minStock }}<span class="unit"> {{ product.unit }}</span>
              </div>
            </div>
            <div class="pd-kv">
              <div class="label">Categoría</div>
              <div class="value small">{{ product.category }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ Tendencia de precio ============ -->
      <section v-if="hasTrend" class="pd-trend" aria-label="Tendencia de precio">
        <div class="pd-trend-head">
          <div class="pd-trend-ico" aria-hidden="true">
            <UIcon name="i-lucide-trending-up" />
          </div>
          <div class="pd-trend-body">
            <div class="pd-trend-title">Precio en aumento</div>
            <div class="pd-trend-text">
              Subió <b>{{ trendPct }}%</b> esta semana
              <br>
              <span class="from">S/ {{ costPrev.toFixed(2) }}/{{ product.unit }}</span>
              →
              <span class="to">S/ {{ product.unitCost.toFixed(2) }}/{{ product.unit }}</span>
            </div>
          </div>
        </div>
        <svg class="pd-trend-chart" :viewBox="`0 0 ${chartW} ${chartH}`" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="pd-trend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--danger)" stop-opacity="0.22" />
              <stop offset="100%" stop-color="var(--danger)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="trendArea" fill="url(#pd-trend-grad)" />
          <path :d="trendPath" stroke="var(--danger)" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <circle :cx="trendLast[0]" :cy="trendLast[1]" r="3.5" fill="var(--danger)" />
          <circle :cx="trendLast[0]" :cy="trendLast[1]" r="6" fill="var(--danger)" opacity="0.18" />
        </svg>
        <div class="pd-trend-foot">
          <div class="pd-trend-axis" aria-hidden="true">
            <span>hace 30 d</span>
            <span>hace 15 d</span>
            <span>hoy</span>
          </div>
          <button
            class="pd-trend-link"
            @click="toast.add({ title: 'Análisis de precio — disponible pronto', icon: 'i-lucide-bar-chart-3' })"
          >
            Ver análisis <UIcon name="i-lucide-chevron-right" />
          </button>
        </div>
      </section>

      <!-- ============ Acciones rápidas ============ -->
      <section class="pd-quick" aria-label="Acciones rápidas">
        <button class="pd-quick-card" aria-label="Agregar a compras" @click="addToShopping()">
          <div class="ico pos" aria-hidden="true"><UIcon name="i-lucide-shopping-cart" /></div>
          <div class="label">Agregar a<br>compras</div>
        </button>
        <button class="pd-quick-card" aria-label="Registrar entrada" @click="openQuickMove('entrada')">
          <div class="ico in" aria-hidden="true"><UIcon name="i-lucide-arrow-down-to-line" /></div>
          <div class="label">Registrar<br>entrada</div>
        </button>
        <button class="pd-quick-card" aria-label="Registrar salida" @click="openQuickMove('salida')">
          <div class="ico out" aria-hidden="true"><UIcon name="i-lucide-arrow-up-from-line" /></div>
          <div class="label">Registrar<br>salida</div>
        </button>
      </section>

      <!-- ============ Recetas que lo usan ============ -->
      <section class="pd-section" aria-label="Recetas que usan este insumo">
        <div class="pd-section-head">
          <div class="pd-section-title">
            Usado en <span class="count">({{ usages.length }} {{ usages.length === 1 ? 'receta' : 'recetas' }})</span>
          </div>
        </div>
        <div class="pd-recipes">
          <NuxtLink
            v-for="u in usages"
            :key="u.recipe.id"
            class="pd-recipe"
            :to="`/app/recetas/${u.recipe.id}`"
            :aria-label="`${u.recipe.name}, ${u.qtyLabel}, ${impactLabel(u.impact)}`"
          >
            <div class="pd-recipe-ico" aria-hidden="true">{{ u.recipe.emoji ?? '🍽️' }}</div>
            <div class="pd-recipe-body">
              <div class="pd-recipe-name">{{ u.recipe.name }}</div>
              <div class="pd-recipe-meta">{{ u.qtyLabel }}</div>
              <span v-if="u.estimated" class="pd-est-tag">Margen estimado</span>
            </div>
            <div class="pd-recipe-right">
              <span class="pd-impact" :class="u.impact">{{ impactLabel(u.impact) }}</span>
              <span class="pd-recipe-arrow" aria-hidden="true">
                <UIcon name="i-lucide-chevron-right" />
              </span>
            </div>
          </NuxtLink>
          <UiEmptyState
            v-if="usages.length === 0"
            icon="i-lucide-utensils"
            title="Ninguna receta usa este insumo"
            subtitle="Cuando lo agregues a un plato, aparecerá aquí su impacto."
          />
        </div>
      </section>

      <!-- ============ Movimientos ============ -->
      <section class="pd-section" aria-label="Movimientos recientes">
        <div class="pd-section-head">
          <div class="pd-section-title">
            Movimientos <span class="count">(últimos 30 d)</span>
          </div>
        </div>
        <div v-if="visibleMovements.length > 0" class="pd-timeline">
          <div
            v-for="m in visibleMovements"
            :key="m.id"
            class="pd-mov"
            :aria-label="`${formatShortDate(m.date)} ${formatTime(m.date)}, ${movDirection(m) === 'in' ? 'entrada' : 'salida'} ${movQtyLabel(m)}, ${movLabel(m)}`"
          >
            <span class="pd-mov-ico" :class="movDirection(m)" aria-hidden="true">
              <UIcon :name="movDirection(m) === 'in' ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up'" />
            </span>
            <div class="pd-mov-body">
              <div class="pd-mov-row1">
                <span class="pd-mov-date">{{ formatShortDate(m.date) }} · {{ formatTime(m.date) }}</span>
                <span class="pd-mov-qty" :class="movDirection(m)">{{ movQtyLabel(m) }}</span>
              </div>
              <div class="pd-mov-row2">
                <span class="pd-mov-label">{{ movLabel(m) }}</span>
                <span v-if="m.user" class="pd-mov-ref">
                  <UIcon name="i-lucide-user" /> {{ m.user }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <UiEmptyState
          v-else
          icon="i-lucide-history"
          title="Sin movimientos recientes"
          subtitle="Registra entradas o salidas para ver el historial."
        />
        <button
          v-if="visibleMovements.length > 0"
          class="pd-mov-all"
          @click="toast.add({ title: 'Historial completo — disponible pronto', icon: 'i-lucide-history' })"
        >
          Ver historial completo <UIcon name="i-lucide-arrow-right" />
        </button>
      </section>

      <!-- ============ Proyección IA ============ -->
      <section class="pd-proj" aria-label="Proyección IA">
        <div class="pd-proj-glow" aria-hidden="true" />
        <div class="pd-proj-head">
          <div class="pd-proj-ico" aria-hidden="true">
            <UIcon name="i-lucide-bot" />
            <span class="spark"><UIcon name="i-lucide-sparkles" /></span>
          </div>
          <div class="pd-proj-body">
            <div class="pd-proj-title">
              Proyección IA
              <span class="tag">CONSUMO</span>
            </div>
            <p class="pd-proj-text">
              Al ritmo actual, te alcanza para <span class="days">{{ daysLeft }} días</span> más.
              Te recomiendo comprar <b>{{ suggestQty }} {{ product.unit }}</b> adicionales esta semana.
            </p>
          </div>
        </div>
        <div class="pd-proj-actions">
          <button class="btn btn-primary" @click="addToShopping(suggestQty)">
            <UIcon name="i-lucide-shopping-cart" /> Agregar {{ suggestQty }} {{ product.unit }} a lista
          </button>
        </div>
      </section>

      <!-- ============ CTA fija ============ -->
      <div class="pd-cta-bar">
        <div class="pd-cta-inner">
          <button class="pd-cta" aria-label="Registrar movimiento" @click="openQuickMove('entrada')">
            <UIcon name="i-lucide-plus" /> Registrar movimiento
          </button>
        </div>
      </div>

      <!-- ============ Sheet: editar insumo ============ -->
      <UiBottomSheet
        v-model="showEdit"
        :title="editFocusCost ? 'Agregar costo' : 'Editar insumo'"
        :subtitle="editFocusCost
          ? 'Completa el costo para calcular el margen exacto de las recetas.'
          : 'Cambia los datos básicos. Los costos afectan el margen de las recetas.'"
      >
        <template v-if="!editFocusCost">
          <div class="pd-sheet-field">
            <div class="lbl">Nombre</div>
            <input v-model="editForm.name" class="pd-sheet-input">
          </div>
          <div class="pd-sheet-field pd-sheet-row">
            <div>
              <div class="lbl">Categoría</div>
              <input v-model="editForm.category" class="pd-sheet-input">
            </div>
            <div>
              <div class="lbl">Unidad</div>
              <input v-model="editForm.unit" class="pd-sheet-input">
            </div>
          </div>
        </template>

        <div class="pd-sheet-field" :class="{ highlight: isNoCost }">
          <div class="lbl">
            <UIcon v-if="isNoCost" name="i-lucide-alert-triangle" class="lbl-warn" />
            Costo por {{ editForm.unit }}
          </div>
          <input
            v-model="editForm.cost"
            class="pd-sheet-input"
            type="text"
            inputmode="decimal"
            :placeholder="isNoCost ? 'Completa el costo para margen exacto' : 'S/ 0.00'"
          >
        </div>

        <div v-if="!editFocusCost" class="pd-sheet-field pd-sheet-row">
          <div>
            <div class="lbl">Stock mínimo</div>
            <input v-model="editForm.min" class="pd-sheet-input" inputmode="decimal">
          </div>
          <div>
            <div class="lbl">Stock máximo</div>
            <input v-model="editForm.max" class="pd-sheet-input" inputmode="decimal">
          </div>
        </div>

        <template #cta>
          <div class="pd-sheet-actions">
            <button class="btn btn-ghost" @click="showEdit = false">Cancelar</button>
            <button class="btn btn-primary" :disabled="savingEdit" @click="saveEdit">
              <UIcon name="i-lucide-check" /> Guardar
            </button>
          </div>
        </template>
      </UiBottomSheet>

      <!-- ============ Sheet: movimiento rápido ============ -->
      <UiBottomSheet v-model="showQuickMove" title="Movimiento Rápido" :subtitle="product.name">
        <div class="pd-segments" role="tablist" aria-label="Tipo de movimiento">
          <button
            v-for="s in QUICK_SEGMENTS"
            :key="s.id"
            role="tab"
            :aria-selected="quickType === s.id"
            class="pd-seg"
            :class="{ active: quickType === s.id }"
            @click="quickType = s.id"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="pd-sheet-field no-pad">
          <div class="lbl">Cantidad ({{ product.unit }})</div>
          <input
            v-model="quickQty"
            class="pd-sheet-input"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.1"
            placeholder="0.0"
          >
        </div>
        <div class="pd-sheet-field no-pad">
          <div class="lbl">Nota <span class="opt">opcional</span></div>
          <input
            v-model="quickNote"
            class="pd-sheet-input"
            type="text"
            placeholder="Ej: Compra recibida"
          >
        </div>
        <template #cta>
          <div class="pd-sheet-actions">
            <button class="btn btn-ghost" @click="showQuickMove = false">Cancelar</button>
            <button class="btn btn-primary" :disabled="!canSaveMove" @click="saveQuickMove">
              <UIcon name="i-lucide-check" /> Registrar
            </button>
          </div>
        </template>
      </UiBottomSheet>
    </template>

    <!-- ============ No encontrado ============ -->
    <template v-else>
      <UiScreenHeader title="Insumo" back="/app/inventario" />
      <UiEmptyState
        icon="i-lucide-package-x"
        title="Insumo no encontrado"
        subtitle="Puede que haya sido eliminado o que el enlace sea incorrecto."
      >
        <NuxtLink to="/app/inventario" class="btn btn-primary">
          <UIcon name="i-lucide-arrow-left" /> Volver a Stock
        </NuxtLink>
      </UiEmptyState>
    </template>
  </div>
</template>

<style scoped>
.pd-page {
  max-width: 640px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  padding-bottom: 88px; /* aire para la CTA fija */
}
@media (min-width: 1024px) {
  .pd-page { padding-top: 28px; }
}

/* ============ HEADER ============ */
/* Header migrado a UiScreenHeader; solo queda el botón "Editar" del trailing */
.pd-edit {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pure-white);
  color: var(--fg1);
  border: 1px solid var(--border);
  padding: 8px 12px;
  font: inherit; font-size: 12.5px; font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
}
.pd-edit:hover { background: var(--crema-100); }
.pd-edit:active { transform: scale(0.97); }
.pd-edit .iconify { width: 13px; height: 13px; }

/* ============ BANNER SIN COSTO ============ */
.pd-nocost {
  margin: 12px 16px 0;
  background: var(--warning-bg);
  border: 1px solid rgba(176, 130, 46, 0.25);
  border-radius: 12px;
  padding: 12px;
  display: flex; gap: 10px; align-items: flex-start;
}
.pd-nocost .ico {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--mostaza); color: var(--espresso);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pd-nocost .ico .iconify { width: 16px; height: 16px; }
.pd-nocost .body { flex: 1; min-width: 0; }
.pd-nocost .body h4 {
  margin: 0;
  font-size: 13.5px; font-weight: 600; color: var(--mostaza-700);
}
.pd-nocost .body p {
  margin: 4px 0 8px;
  font-size: 12px; color: var(--fg2); line-height: 1.45;
}
.pd-nocost .cost-btn {
  background: var(--mostaza); color: var(--espresso);
  border: 0;
}
.pd-nocost .cost-btn:hover { background: var(--mostaza-700); color: var(--crema-100); }

/* ============ HERO ============ */
.pd-hero {
  margin: 12px 16px 0;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  overflow: hidden;
}
.pd-hero-img {
  width: 100%;
  aspect-ratio: 16 / 9;
  background:
    radial-gradient(circle at 28% 35%, rgba(255, 255, 255, 0.45) 0%, transparent 55%),
    repeating-linear-gradient(135deg, var(--mostaza-100) 0 14px, var(--crema-200) 14px 28px);
  display: flex; align-items: center; justify-content: center;
  position: relative;
  border-bottom: 1px solid var(--border-subtle);
}
.pd-hero-img .emoji {
  font-size: 72px;
  filter: drop-shadow(0 6px 16px rgba(26, 26, 26, 0.18));
}
.pd-hero-img .placeholder-tag {
  position: absolute; left: 12px; bottom: 10px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--fg2);
  padding: 3px 8px; border-radius: 999px;
  font-size: 9.5px; font-weight: 500;
  letter-spacing: 0.06em; text-transform: uppercase;
  font-family: var(--font-mono);
  backdrop-filter: blur(6px);
}
.pd-hero-body { padding: 14px 16px 16px; }
.pd-status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 12px;
}
.pd-status-pill.crit { background: var(--danger-bg); color: var(--danger); }
.pd-status-pill.low { background: var(--warning-bg); color: var(--mostaza-700); }
.pd-status-pill.ok { background: var(--success-bg); color: var(--oliva-700); }
.pd-status-pill .d { width: 7px; height: 7px; border-radius: 50%; }
.pd-status-pill.crit .d { background: var(--danger); }
.pd-status-pill.low .d { background: var(--mostaza); }
.pd-status-pill.ok .d { background: var(--oliva); }

.pd-kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 16px;
}
.pd-kv .label {
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3);
  margin-bottom: 4px;
}
.pd-kv .value {
  font-family: var(--font-sans);
  font-size: 22px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg1);
  line-height: 1.05;
}
.pd-kv .value.small { font-size: 17px; }
.pd-kv .value.danger { color: var(--danger); }
.pd-kv .value .unit {
  font-size: 12px; font-weight: 500; color: var(--fg3);
  margin-left: 2px;
}
.pd-kv .value .currency {
  font-size: 12px; font-weight: 500; color: var(--fg3);
  margin-right: 3px; vertical-align: 0.2em;
}
.pd-kv .value .nocost-dash { color: var(--mostaza-700); font-size: 15px; font-weight: 600; }

/* ============ TENDENCIA ============ */
.pd-trend {
  margin: 14px 16px 0;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  position: relative; overflow: hidden;
}
.pd-trend::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: var(--danger);
}
.pd-trend-head { display: flex; gap: 12px; align-items: center; }
.pd-trend-ico {
  width: 38px; height: 38px; border-radius: 10px;
  background: var(--danger-bg); color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pd-trend-ico .iconify { width: 18px; height: 18px; }
.pd-trend-body { flex: 1; min-width: 0; }
.pd-trend-title { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.pd-trend-text {
  margin-top: 2px;
  font-size: 12px; color: var(--fg2); line-height: 1.45;
}
.pd-trend-text .from {
  font-family: var(--font-mono);
  text-decoration: line-through;
  opacity: 0.7;
  margin: 0 2px;
}
.pd-trend-text .to {
  font-family: var(--font-mono);
  color: var(--danger); font-weight: 700;
}
.pd-trend-text b { color: var(--danger); font-weight: 700; }
.pd-trend-chart {
  margin-top: 12px;
  width: 100%;
  height: 56px;
  display: block;
}
.pd-trend-foot {
  margin-top: 10px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
}
.pd-trend-axis {
  display: flex; justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 10px; color: var(--fg3);
  flex: 1;
}
.pd-trend-link {
  background: none; border: 0;
  font: inherit; font-size: 12.5px; font-weight: 600;
  color: var(--terracotta-700);
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 3px;
  flex-shrink: 0;
}
.pd-trend-link:hover { color: var(--terracotta); }
.pd-trend-link .iconify { width: 13px; height: 13px; }

/* ============ ACCIONES RÁPIDAS ============ */
.pd-quick {
  padding: 16px 16px 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.pd-quick-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 8px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 6px;
  text-align: center; font: inherit;
  cursor: pointer;
  min-height: 88px;
  transition: background var(--dur), border-color var(--dur);
}
.pd-quick-card:hover { background: var(--crema-50); }
.pd-quick-card:active { transform: scale(0.97); }
.pd-quick-card .ico {
  width: 32px; height: 32px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
}
.pd-quick-card .ico .iconify { width: 16px; height: 16px; }
.pd-quick-card .ico.pos { background: var(--oliva-100); color: var(--oliva-700); }
.pd-quick-card .ico.in { background: var(--success-bg); color: var(--oliva-700); }
.pd-quick-card .ico.out { background: var(--danger-bg); color: var(--danger); }
.pd-quick-card .label {
  font-size: 11.5px; font-weight: 600; color: var(--fg1);
  line-height: 1.2;
}

/* ============ SECCIONES ============ */
.pd-section { margin-top: 22px; }
.pd-section-head {
  padding: 0 16px 10px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
}
.pd-section-title {
  font-size: 15px; font-weight: 600;
  color: var(--fg1);
  display: inline-flex; align-items: baseline; gap: 6px;
}
.pd-section-title .count {
  font-family: var(--font-mono);
  font-size: 11.5px; font-weight: 500;
  color: var(--fg3);
}

/* ============ RECETAS ============ */
.pd-recipes {
  padding: 0 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.pd-recipe {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px;
  display: flex; gap: 12px; align-items: center;
  text-align: left;
  color: inherit;
  text-decoration: none;
  cursor: pointer; width: 100%;
  transition: background var(--dur);
}
.pd-recipe:hover { background: var(--crema-50); }
.pd-recipe-ico {
  width: 44px; height: 44px; border-radius: 10px;
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.pd-recipe-body { flex: 1; min-width: 0; }
.pd-recipe-name {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  line-height: 1.2;
}
.pd-recipe-meta {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 11.5px; color: var(--fg3);
}
.pd-recipe-right {
  display: flex; flex-direction: column;
  align-items: flex-end; gap: 6px;
}
.pd-impact {
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 999px;
}
.pd-impact.high { background: var(--danger-bg); color: var(--danger); }
.pd-impact.mid { background: var(--warning-bg); color: var(--mostaza-700); }
.pd-impact.low { background: var(--success-bg); color: var(--oliva-700); }
.pd-recipe-arrow { color: var(--fg3); }
.pd-recipe-arrow .iconify { width: 14px; height: 14px; }
.pd-est-tag {
  display: inline-block;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--mostaza-700);
  background: var(--warning-bg);
  padding: 2px 6px; border-radius: 999px;
  margin-top: 2px;
}

/* ============ MOVIMIENTOS ============ */
.pd-timeline {
  padding: 0 16px;
  position: relative;
}
.pd-timeline::before {
  content: '';
  position: absolute;
  top: 8px; bottom: 8px;
  left: calc(16px + 13px);
  width: 1px;
  background: var(--border-subtle);
}
.pd-mov {
  position: relative;
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  padding: 10px 0;
  width: 100%;
  border-radius: 8px;
}
.pd-mov-ico {
  width: 28px; height: 28px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  z-index: 1;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
}
.pd-mov-ico .iconify { width: 14px; height: 14px; }
.pd-mov-ico.in { color: var(--oliva-700); background: var(--success-bg); border-color: transparent; }
.pd-mov-ico.out { color: var(--danger); background: var(--danger-bg); border-color: transparent; }
.pd-mov-body { min-width: 0; }
.pd-mov-row1 {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 6px;
}
.pd-mov-date {
  font-family: var(--font-mono);
  font-size: 11.5px; color: var(--fg3);
}
.pd-mov-qty {
  font-family: var(--font-mono);
  font-size: 13px; font-weight: 700;
}
.pd-mov-qty.in { color: var(--oliva-700); }
.pd-mov-qty.out { color: var(--danger); }
.pd-mov-row2 {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-top: 2px;
  gap: 6px;
  font-size: 12px;
}
.pd-mov-label { color: var(--fg1); font-weight: 500; }
.pd-mov-ref {
  color: var(--terracotta-700);
  font-family: var(--font-mono);
  font-size: 11px;
  display: inline-flex; align-items: center; gap: 3px;
}
.pd-mov-ref .iconify { width: 11px; height: 11px; }
.pd-mov-all {
  margin: 12px 16px 0;
  background: var(--pure-white);
  border: 1px dashed var(--border);
  color: var(--fg1);
  font: inherit; font-size: 13px; font-weight: 600;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: calc(100% - 32px);
}
.pd-mov-all:hover { background: var(--crema-100); }
.pd-mov-all .iconify { width: 14px; height: 14px; }

/* ============ PROYECCIÓN IA ============ */
.pd-proj {
  margin: 22px 16px 0;
  position: relative;
  background: linear-gradient(155deg, var(--crema-50) 0%, var(--oliva-100) 220%);
  border: 1px solid rgba(110, 123, 97, 0.22);
  border-radius: 16px;
  padding: 14px;
  overflow: hidden;
}
.pd-proj-glow {
  position: absolute; inset: -1px;
  border-radius: 16px;
  padding: 1px;
  background: linear-gradient(135deg, var(--oliva) 0%, transparent 35%, transparent 65%, var(--terracotta-300) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0.55;
  pointer-events: none;
}
.pd-proj-head {
  display: flex; gap: 12px; align-items: flex-start;
  position: relative;
}
.pd-proj-ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: linear-gradient(140deg, var(--oliva-100), var(--crema-100));
  color: var(--oliva-700);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(110, 123, 97, 0.18);
  flex-shrink: 0;
  position: relative;
}
.pd-proj-ico > .iconify { width: 19px; height: 19px; }
.pd-proj-ico .spark {
  position: absolute; top: -3px; right: -3px;
  color: var(--mostaza-700);
}
.pd-proj-ico .spark .iconify { width: 10px; height: 10px; }
.pd-proj-body { flex: 1; min-width: 0; }
.pd-proj-title {
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  display: inline-flex; align-items: center; gap: 8px;
}
.pd-proj-title .tag {
  font-family: var(--font-mono); font-size: 10px;
  font-weight: 600; letter-spacing: 0.04em;
  padding: 2px 6px; border-radius: 999px;
  background: var(--oliva-100); color: var(--oliva-700);
}
.pd-proj-text {
  margin: 4px 0 0;
  font-size: 12.5px; line-height: 1.5; color: var(--fg2);
}
.pd-proj-text b { color: var(--fg1); font-weight: 600; }
.pd-proj-text .days {
  font-family: var(--font-mono);
  color: var(--danger); font-weight: 700;
}
.pd-proj-actions {
  display: flex; gap: 8px;
  margin-top: 12px;
  position: relative;
}

/* ============ CTA FIJA ============ */
.pd-cta-bar {
  position: fixed; left: 0; right: 0;
  bottom: calc(68px + env(safe-area-inset-bottom, 0px));
  background: rgba(248, 244, 237, 0.92);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-top: 1px solid var(--border-subtle);
  padding: 12px 16px;
  z-index: 30;
}
@media (min-width: 1024px) {
  .pd-cta-bar { left: 256px; bottom: 0; padding-bottom: 16px; }
}
.pd-cta-inner { max-width: 608px; margin: 0 auto; }
.pd-cta {
  width: 100%;
  background: var(--terracotta);
  color: var(--crema-100);
  border: 0;
  border-radius: 12px;
  padding: 14px;
  font: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 48px;
  transition: background var(--dur);
}
.pd-cta:hover { background: var(--terracotta-700); }
.pd-cta:active { transform: scale(0.99); }
.pd-cta .iconify { width: 17px; height: 17px; }

/* ============ SHEETS ============ */
.pd-sheet-field { padding: 8px 0; }
.pd-sheet-field.no-pad { padding: 8px 0; }
.pd-sheet-field .lbl {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--fg3);
  margin-bottom: 6px;
  display: flex; align-items: center; gap: 6px;
}
.pd-sheet-field .lbl .opt { text-transform: none; font-weight: 500; letter-spacing: 0; }
.lbl-warn { width: 12px; height: 12px; color: var(--mostaza-700); }
.pd-sheet-input {
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 11px 12px;
  font: inherit; font-size: 14px; color: var(--fg1);
  width: 100%;
  outline: none;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.pd-sheet-input:focus { border-color: var(--terracotta); box-shadow: var(--focus-ring); }
.pd-sheet-input::placeholder { color: var(--fg3); }
.pd-sheet-field.highlight .pd-sheet-input {
  border-color: var(--mostaza);
  background: var(--warning-bg);
}
.pd-sheet-field.highlight .lbl { color: var(--mostaza-700); }
.pd-sheet-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pd-sheet-actions { display: flex; gap: 8px; }
.pd-sheet-actions .btn { flex: 1; justify-content: center; min-height: 44px; }

.pd-segments {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
.pd-seg {
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg2);
  font: inherit; font-size: 13px; font-weight: 600;
  border-radius: 10px;
  padding: 10px 6px;
  cursor: pointer;
  transition: all var(--dur);
}
.pd-seg:hover { background: var(--crema-100); }
.pd-seg.active {
  background: var(--espresso);
  color: var(--crema-100);
  border-color: var(--espresso);
}
</style>
