<script setup lang="ts">
import type { InventoryMovement, MovementType } from '#shared/types/domain'

definePageMeta({ layout: 'app' })

const route = useRoute()
const toast = useToast()

const ingredientId = computed(() => String(route.params.id))

const { data: ingredients } = useIngredients()
// QA-06 · Recetas que usan este insumo — BOM real desde el backend (el listado
// general de recetas trae items:[] a propósito, por eso no sirve para derivarlas).
const { data: recipeUsages, isLoading: usagesLoading, error: usagesError } = useIngredientRecipes(ingredientId)
const { data: movements } = useMovements(ingredientId)
// Widget B: real consumption-based coverage (replaces the local heuristic).
const { data: coverage } = useIngredientCoverage(ingredientId)
// Widget C: purchase price history (restored from de-scoped E08 placeholder).
const { data: priceTrend } = useIngredientPriceTrend(ingredientId)

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

// Widget B (coverage) and Widget C (price trend) are now real — backed by backend
// endpoints /api/inventory/ingredients/:id/coverage and /api/inventory/price-trend/:id.
// De-scope lifted by E08. See QA-STATUS/E08-status.md.

/* ===== Recetas que lo usan (QA-06) ===== */
// Fila de display derivada del RecipeUsageView del backend. El % de impacto sale
// de lineCost/recipeTotalCost (participación del insumo en el costo del plato);
// la cantidad usa la unidad del insumo (g si es kg < 1 por porción).
interface UsageRow {
  recipeId: string
  name: string
  emoji: string
  qtyLabel: string
  impact: 'high' | 'mid' | 'low'
  estimated: boolean
}
const usages = computed<UsageRow[]>(() => {
  const unit = product.value?.unit ?? ''
  const noCost = isNoCost.value
  return (recipeUsages.value ?? []).map((u) => {
    const share = u.recipeTotalCost > 0 ? u.lineCost / u.recipeTotalCost : 0
    const qtyLabel = unit === 'kg' && u.qty < 1
      ? `${Math.round(u.qty * 1000)} g por porción`
      : `${u.qty} ${unit} por porción`
    return {
      recipeId: u.recipeId,
      name: u.name,
      emoji: u.emoji ?? '🍽️',
      qtyLabel,
      impact: share > 0.25 ? 'high' as const : share >= 0.1 ? 'mid' as const : 'low' as const,
      // Estimado cuando el insumo no tiene costo (o el plato no pudo costearse):
      // el % de impacto no es fiable en ese caso.
      estimated: noCost || u.lineCost === 0,
    }
  })
})

function impactLabel(i: UsageRow['impact']): string {
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

/* ===== Cobertura de stock (Widget B) ===== */
// daysLeft comes from the real backend coverage endpoint (avg daily consumption
// over 30 days), not from a hardcoded status → days heuristic. `null` means the
// ingredient has no recent consumption and no estimate is possible.
const daysLeft = computed<number | null>(() => coverage.value?.daysLeft ?? null)
const avgDailyConsumption = computed(() => coverage.value?.avgDailyConsumption ?? null)
const basedOnDays = computed(() => coverage.value?.basedOnDays ?? 30)

/* ===== Vida útil (F3, B4) ===== */
// Todos estos valores vienen calculados por el backend (`/coverage` extendido);
// el frontend solo los presenta, nunca recalcula caducidad/FEFO.
const freshnessStatus = computed(() => coverage.value?.freshnessStatus ?? null)
const hasFreshnessData = computed(() => freshnessStatus.value !== null)
const lastPurchaseAt = computed(() => coverage.value?.lastPurchaseAt ?? null)
const estimatedExpiryAt = computed(() => coverage.value?.estimatedExpiryAt ?? null)
const atRiskQty = computed(() => coverage.value?.atRiskQty ?? null)
const atRiskCost = computed(() => coverage.value?.atRiskCost ?? null)
const effectiveCoverageDays = computed<number | null>(() => coverage.value?.effectiveCoverageDays ?? null)

const freshnessLabel = computed(() => {
  const status = freshnessStatus.value
  if (status === 'expired') return 'Vencido'
  if (status === 'expiring_soon') {
    const days = estimatedExpiryAt.value ? daysUntil(estimatedExpiryAt.value) : null
    return days !== null ? `Por vencer · ${Math.max(0, days)} día${Math.max(0, days) === 1 ? '' : 's'}` : 'Por vencer'
  }
  if (status === 'fresh') return 'Fresco'
  return 'Sin vida útil configurada'
})

// Restricción que manda en la cobertura efectiva: si no hay seguimiento de vida
// útil, el consumo es la única restricción posible; si no hay consumo reciente,
// la vida útil es la única; si ambas existen, la más ajustada (menor) manda —
// misma semántica que `effectiveCoverageDays = min(daysLeft, daysUntilExpiry)`
// del backend, solo que aquí se etiqueta cuál de las dos ganó.
const coverageConstraint = computed<'consumo' | 'vida-util' | null>(() => {
  if (effectiveCoverageDays.value === null) return null
  if (!hasFreshnessData.value) return 'consumo'
  if (daysLeft.value === null) return 'vida-util'
  return effectiveCoverageDays.value < daysLeft.value ? 'vida-util' : 'consumo'
})
const coverageConstraintLabel = computed(() =>
  coverageConstraint.value === 'vida-util' ? 'Limitado por vida útil' : 'Limitado por consumo')

/* ===== Tendencia de precio (Widget C) ===== */
// Points arrive newest-first from the backend. Reverse for chronological display.
// Fewer than 2 points → no % change is computable.
const priceTrendPoints = computed(() => (priceTrend.value ?? []).slice(0, 6))
const priceTrendChange = computed(() => {
  const pts = priceTrend.value
  if (!pts || pts.length < 2) return null
  const newest = pts[0]
  const oldest = pts[pts.length - 1]
  if (oldest.unitCost === 0) return null
  const pct = +((newest.unitCost - oldest.unitCost) / oldest.unitCost * 100).toFixed(1)
  return { pct, positive: pct > 0 }
})

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
  try {
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
  catch (error) {
    toast.add({
      title: 'Error al guardar',
      description: errorMessage(error, 'No se pudieron guardar los cambios'),
      color: 'error',
    })
  }
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
  try {
    await createMovement({
      ingredientId: p.id,
      type: typeMap[quickType.value],
      qty,
      note: quickNote.value.trim() || undefined,
    })
    showQuickMove.value = false
    toast.add({ title: `Movimiento (${quickType.value}) registrado`, icon: 'i-lucide-check-circle-2' })
  }
  catch (error) {
    toast.add({
      title: 'Error al registrar movimiento',
      description: errorMessage(error, 'No se pudo guardar el movimiento'),
      color: 'error',
    })
  }
}

const { mutateAsync: addShopping } = useAddShoppingItem()

async function addToShopping(qty?: number): Promise<void> {
  const p = product.value
  if (!p) return
  try {
    await addShopping({ ingredientId: p.id, suggestedQty: qty })
    toast.add({
      title: qty
        ? `${qty} ${p.unit} de ${p.name} agregados a Lista de Compras`
        : `${p.name} agregado a Lista de Compras`,
      icon: 'i-lucide-shopping-cart',
    })
  }
  catch (error) {
    toast.add({
      title: 'Error al agregar a lista',
      description: errorMessage(error, 'No se pudo agregar a la Lista de Compras'),
      color: 'error',
    })
  }
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

      <!-- NOTE: price trend and coverage are now real — wired to backend endpoints. -->

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
          <!-- Loading: skeletons mientras llega el BOM del backend -->
          <template v-if="usagesLoading && usages.length === 0">
            <div v-for="i in 2" :key="i" class="pd-recipe pd-recipe-sk" aria-hidden="true">
              <div class="pd-recipe-ico sk" />
              <div class="pd-recipe-body">
                <div class="sk sk-line" />
                <div class="sk sk-line short" />
              </div>
            </div>
          </template>

          <!-- Error: el endpoint falló -->
          <UiEmptyState
            v-else-if="usagesError"
            icon="i-lucide-alert-triangle"
            title="No se pudieron cargar las recetas"
            subtitle="Ocurrió un error al consultar dónde se usa este insumo. Intenta recargar la página."
          />

          <!-- Datos -->
          <template v-else-if="usages.length > 0">
            <NuxtLink
              v-for="u in usages"
              :key="u.recipeId"
              class="pd-recipe"
              :to="`/app/recetas/${u.recipeId}`"
              :aria-label="`${u.name}, ${u.qtyLabel}, ${impactLabel(u.impact)}`"
            >
              <div class="pd-recipe-ico" aria-hidden="true">{{ u.emoji }}</div>
              <div class="pd-recipe-body">
                <div class="pd-recipe-name">{{ u.name }}</div>
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
          </template>

          <!-- Empty -->
          <UiEmptyState
            v-else
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
        <NuxtLink
          v-if="visibleMovements.length > 0"
          class="pd-mov-all"
          :to="`/app/inventario/movimientos?ingredientId=${ingredientId}`"
        >
          Ver historial completo <UIcon name="i-lucide-arrow-right" />
        </NuxtLink>
      </section>

      <!-- ============ Cobertura de stock (Widget B) ============ -->
      <!-- Real consumption-based coverage from backend — not a heuristic. -->
      <section class="pd-proj" aria-label="Cobertura de stock">
        <div class="pd-proj-head">
          <div class="pd-proj-ico" aria-hidden="true">
            <UIcon name="i-lucide-calendar-clock" />
          </div>
          <div class="pd-proj-body">
            <div class="pd-proj-title">
              Cobertura de stock
              <span v-if="coverageConstraint" class="tag">
                {{ coverageConstraint === 'vida-util' ? 'VIDA ÚTIL' : 'CONSUMO' }}
              </span>
            </div>
            <template v-if="coverage">
              <p class="pd-proj-text">
                <template v-if="effectiveCoverageDays !== null">
                  Stock disponible por aproximadamente
                  <span class="days">{{ Math.floor(effectiveCoverageDays) }} días</span>.
                  <b>{{ coverageConstraintLabel }}</b>.
                  Consumo promedio: <b>{{ avgDailyConsumption }} {{ product.unit }}/día</b>.
                </template>
                <template v-else>
                  <span class="days-null">Sin consumo reciente para estimar cobertura.</span>
                  No hay movimientos en los últimos {{ basedOnDays }} días.
                </template>
              </p>
              <p class="pd-proj-caption">Basado en consumo de los últimos {{ basedOnDays }} días</p>
            </template>
            <p v-else class="pd-proj-text pd-proj-loading">Calculando cobertura…</p>
          </div>
        </div>
        <div class="pd-proj-actions">
          <button class="btn btn-primary" @click="addToShopping(suggestQty)">
            <UIcon name="i-lucide-shopping-cart" /> Agregar {{ suggestQty }} {{ product.unit }} a lista
          </button>
        </div>
      </section>

      <!-- ============ Vida útil (F3, B4) ============ -->
      <!-- Server-computed freshness/shelf-life estimate. Hidden content when the
           ingredient has no purchase to anchor an estimate on — shows a discreet
           "sin datos" state instead of disappearing (could be non-perishable or
           simply never purchased; the payload doesn't distinguish the two). -->
      <section class="pd-shelf" aria-label="Vida útil">
        <div class="pd-shelf-head">
          <div class="pd-shelf-ico" :class="freshnessStatus" aria-hidden="true">
            <UIcon name="i-lucide-leaf" />
          </div>
          <div class="pd-shelf-body">
            <div class="pd-shelf-title">Vida útil</div>
            <template v-if="coverage && hasFreshnessData">
              <div class="pd-fresh-chip" :class="freshnessStatus">
                <span class="d" aria-hidden="true" />
                {{ freshnessLabel }}
              </div>
              <p class="pd-shelf-text">
                Ingresado el {{ lastPurchaseAt && formatShortDate(lastPurchaseAt) }} ·
                vence ~{{ estimatedExpiryAt && formatShortDate(estimatedExpiryAt) }}
              </p>
              <p v-if="atRiskQty !== null && atRiskQty > 0" class="pd-shelf-risk">
                <b>{{ atRiskQty }} {{ product.unit }} en riesgo ({{ formatPEN(atRiskCost ?? 0) }})</b>
                si no se consume antes del vencimiento.
              </p>
            </template>
            <p v-else-if="coverage" class="pd-shelf-empty">Sin vida útil configurada.</p>
            <p v-else class="pd-shelf-empty">Calculando vida útil…</p>
          </div>
        </div>
      </section>

      <!-- ============ Tendencia de precio de compra (Widget C) ============ -->
      <!-- Honest label: derived from purchase history, NOT IA. -->
      <section class="pd-trend-section" aria-label="Tendencia de precio de compra">
        <div class="pd-section-head">
          <div class="pd-section-title">
            Tendencia de precio de compra
            <span class="count">(historial)</span>
          </div>
          <span v-if="priceTrendChange" class="pd-trend-badge" :class="priceTrendChange.positive ? 'up' : 'down'">
            {{ priceTrendChange.positive ? '+' : '' }}{{ priceTrendChange.pct }}%
          </span>
        </div>
        <div v-if="priceTrendPoints.length >= 2" class="pd-trend-list">
          <div
            v-for="pt in priceTrendPoints"
            :key="pt.recordedAt"
            class="pd-trend-row"
            :aria-label="`${formatShortDate(pt.recordedAt)}: S/ ${pt.unitCost.toFixed(2)} — ${pt.source === 'purchase_order' ? 'orden de compra' : 'manual'}`"
          >
            <span class="pd-trend-date">{{ formatShortDate(pt.recordedAt) }}</span>
            <span class="pd-trend-src">{{ pt.source === 'purchase_order' ? 'OC' : 'Manual' }}</span>
            <span class="pd-trend-cost">S/ {{ pt.unitCost.toFixed(2) }}</span>
          </div>
        </div>
        <p v-else class="pd-trend-empty">
          Sin historial suficiente para mostrar tendencia (se necesitan al menos 2 registros).
        </p>
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

/* Price trend styles live at .pd-trend-section below (Widget C — E08 restored). */

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
/* Skeletons de carga del panel "Usado en" */
.pd-recipe-sk { pointer-events: none; }
.pd-recipe .sk { background: var(--crema-200); border-radius: 6px; animation: pd-sk 1.4s ease infinite; }
.pd-recipe-ico.sk { width: 44px; height: 44px; border-radius: 10px; }
.pd-recipe-body .sk-line { height: 12px; width: 60%; margin-bottom: 6px; }
.pd-recipe-body .sk-line.short { width: 38%; margin-bottom: 0; }
@keyframes pd-sk { 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .pd-recipe .sk { animation: none; } }
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

/* ============ ESTIMACIÓN DE COBERTURA ============ */
.pd-proj {
  margin: 22px 16px 0;
  background: linear-gradient(155deg, var(--crema-50) 0%, var(--oliva-100) 220%);
  border: 1px solid rgba(110, 123, 97, 0.22);
  border-radius: 16px;
  padding: 14px;
}
.pd-proj-head {
  display: flex; gap: 12px; align-items: flex-start;
}
.pd-proj-ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--oliva-100);
  color: var(--oliva-700);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(110, 123, 97, 0.18);
  flex-shrink: 0;
}
.pd-proj-ico > .iconify { width: 19px; height: 19px; }
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
.pd-proj-caption {
  margin: 6px 0 0;
  font-size: 11px; color: var(--fg3); font-style: italic;
}
.pd-proj-loading { color: var(--fg3); font-style: italic; }
.pd-proj-text .days-null { color: var(--mostaza-700); font-weight: 600; }
.pd-proj-actions {
  display: flex; gap: 8px;
  margin-top: 12px;
}

/* ============ VIDA ÚTIL (F3, B4) ============ */
/* Tarjeta blanca con borde (no gradiente): la única superficie tintada de esta
   pantalla ya la usa el widget de Cobertura (.pd-proj) — este widget reutiliza
   su lenguaje de layout (ícono + cuerpo) pero en superficie neutra. */
.pd-shelf {
  margin: 14px 16px 0;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px;
}
.pd-shelf-head {
  display: flex; gap: 12px; align-items: flex-start;
}
.pd-shelf-ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--crema-200);
  color: var(--fg3);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pd-shelf-ico > .iconify { width: 19px; height: 19px; }
.pd-shelf-ico.fresh { background: var(--success-bg); color: var(--oliva-700); }
.pd-shelf-ico.expiring_soon { background: var(--warning-bg); color: var(--mostaza-700); }
.pd-shelf-ico.expired { background: var(--danger-bg); color: var(--danger); }
.pd-shelf-body { flex: 1; min-width: 0; }
.pd-shelf-title {
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  margin-bottom: 6px;
}
/* Mismo patrón dot+label que .pd-status-pill (hero): status = punto + texto, sin ícono-chip tintado. */
.pd-fresh-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 8px;
}
.pd-fresh-chip .d { width: 7px; height: 7px; border-radius: 50%; }
.pd-fresh-chip.fresh { background: var(--success-bg); color: var(--oliva-700); }
.pd-fresh-chip.fresh .d { background: var(--oliva); }
.pd-fresh-chip.expiring_soon { background: var(--warning-bg); color: var(--mostaza-700); }
.pd-fresh-chip.expiring_soon .d { background: var(--mostaza); }
.pd-fresh-chip.expired { background: var(--danger-bg); color: var(--danger); }
.pd-fresh-chip.expired .d { background: var(--danger); }
.pd-shelf-text {
  margin: 0;
  font-size: 12.5px; line-height: 1.5; color: var(--fg2);
}
.pd-shelf-risk {
  margin: 8px 0 0;
  font-size: 12.5px; line-height: 1.5; color: var(--fg2);
}
.pd-shelf-risk b { color: var(--danger); font-weight: 600; }
.pd-shelf-empty {
  margin: 0;
  font-size: 12.5px; color: var(--fg3); font-style: italic;
}

/* ============ TENDENCIA DE PRECIO (Widget C) ============ */
.pd-trend-section {
  margin-top: 22px;
}
.pd-trend-section .pd-section-head {
  padding: 0 16px 10px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
}
.pd-trend-badge {
  font-family: var(--font-mono);
  font-size: 12px; font-weight: 700;
  padding: 3px 9px; border-radius: 999px;
}
.pd-trend-badge.up { background: var(--danger-bg); color: var(--danger); }
.pd-trend-badge.down { background: var(--success-bg); color: var(--oliva-700); }
.pd-trend-list {
  margin: 0 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--pure-white);
  overflow: hidden;
}
.pd-trend-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
}
.pd-trend-row:last-child { border-bottom: none; }
.pd-trend-date { color: var(--fg2); font-weight: 500; }
.pd-trend-src {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  background: var(--crema-200); color: var(--fg3);
  padding: 2px 6px; border-radius: 4px;
}
.pd-trend-cost {
  font-family: var(--font-mono);
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.pd-trend-empty {
  margin: 0 16px;
  font-size: 12.5px; color: var(--fg3); font-style: italic;
  padding: 12px 0;
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
