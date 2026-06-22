<script setup lang="ts">
import type { Ingredient } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Nueva receta — GastronomIA' })

const toast = useToast()

/* ===== Wizard ===== */
const TOTAL_STEPS = 3
const step = ref<1 | 2 | 3>(1)

/* ===== Paso 1 · Datos básicos ===== */
const CATEGORIES = ['Marinos', 'Criollos', 'Entradas', 'Piqueos', 'Cocteles', 'Bases']

const TIME_OPTIONS = [
  { id: 't1', label: '< 5 min', minutes: 5 },
  { id: 't2', label: '5–15 min', minutes: 15 },
  { id: 't3', label: '15–30 min', minutes: 30 },
  { id: 't4', label: '> 30 min', minutes: 45 },
]

const name = ref('')
const category = ref('')
const price = ref('')
const description = ref('')
const timeId = ref<string | null>(null)

const showPhotoSheet = ref(false)
const showDiscard = ref(false)

const basePrice = computed(() => Number.parseFloat(price.value) || 0)

const missing = computed<string[]>(() => {
  const list: string[] = []
  if (!name.value.trim()) list.push('nombre')
  if (!category.value) list.push('categoría')
  if (basePrice.value <= 0) list.push('precio')
  return list
})
const canStep1 = computed(() => missing.value.length === 0)

function onCategoryChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === '__new__') {
    toast.add({ title: 'Crear categoría nueva — disponible pronto', icon: 'i-lucide-tag' })
    category.value = ''
  }
  else {
    category.value = value
  }
}

function pickPhoto(source: 'camera' | 'gallery'): void {
  showPhotoSheet.value = false
  toast.add({
    title: `Foto desde ${source === 'camera' ? 'cámara' : 'galería'} (demo)`,
    icon: 'i-lucide-camera',
  })
}

/* ===== Paso 2 · Insumos / BOM ===== */
interface DraftItem {
  key: string
  ingredientId: string
  name: string
  qty: number
  unit: string
  cost: number
  wastePct: number
  wasteReason: string | null
  noCost: boolean
  critical: boolean
}

const UNITS = [
  { value: 'g', label: 'Gramos (g)' },
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'L', label: 'Litros (L)' },
  { value: 'u', label: 'Unidades' },
  { value: 'p', label: 'Porciones' },
]
const WASTE_REASONS = ['Limpieza', 'Jugo', 'Hueso', 'Cocción', 'Otro']
const QUICK_WASTES = [0, 5, 10, 15, 20]

const items = ref<DraftItem[]>([])
let draftSeq = 0

const showSearch = ref(false)
const showDetail = ref(false)
const showCreate = ref(false)

const searchQ = ref('')
const { data: searchData } = useIngredients(searchQ)
const { data: allIngredients } = useIngredients()

const searchResults = computed<Ingredient[]>(() => searchData.value ?? [])
const showNotFound = computed(() => searchQ.value.trim().length > 0 && searchResults.value.length === 0)

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
function ingredientEmoji(ing: Ingredient): string {
  return INGREDIENT_EMOJI_BY_ID[ing.id] ?? INGREDIENT_EMOJI_BY_CATEGORY[ing.category] ?? '🥄'
}
function ingredientCostLabel(ing: Ingredient): string {
  return `S/ ${ing.unitCost % 1 === 0 ? ing.unitCost : ing.unitCost.toFixed(2)}/${ing.unit}`
}

const fmtMoney = (n: number): string => `S/ ${n.toFixed(2)}`

/* Detalle del insumo elegido */
const pickedIngredient = ref<Ingredient | null>(null)
const editingKey = ref<string | null>(null)
const editingNoCost = ref(false)
const detailName = ref('')
const dQty = ref('')
const dUnit = ref('g')
const dWaste = ref(0)
const dReason = ref<string | null>(null)

function openSearch(): void {
  searchQ.value = ''
  showDetail.value = false
  showSearch.value = true
}

function defaultUnitFor(ing: Ingredient): { unit: string, qty: string } {
  if (ing.unit === 'kg') return { unit: 'g', qty: '200' }
  if (ing.unit === 'L') return { unit: 'ml', qty: '100' }
  return { unit: ing.unit, qty: '1' }
}

function pickIngredient(ing: Ingredient): void {
  pickedIngredient.value = ing
  editingKey.value = null
  editingNoCost.value = ing.unitCost === 0
  detailName.value = ing.name
  const def = defaultUnitFor(ing)
  dQty.value = def.qty
  dUnit.value = def.unit
  dWaste.value = 0
  dReason.value = null
  showSearch.value = false
  showDetail.value = true
}

function editItem(item: DraftItem): void {
  pickedIngredient.value = allIngredients.value?.find(i => i.id === item.ingredientId) ?? null
  editingKey.value = item.key
  editingNoCost.value = item.noCost
  detailName.value = item.name
  dQty.value = String(item.qty)
  dUnit.value = item.unit
  dWaste.value = item.wastePct
  dReason.value = item.wasteReason
  showDetail.value = true
}

function detailBack(): void {
  showDetail.value = false
  if (!editingKey.value) showSearch.value = true
}

/** Conversión simple entre unidades compatibles (g↔kg, ml↔L). */
function convertQty(qty: number, from: string, to: string): number | null {
  if (from === to) return qty
  const table: Record<string, Record<string, number>> = {
    g: { kg: 1 / 1000 },
    kg: { g: 1000 },
    ml: { L: 1 / 1000 },
    L: { ml: 1000 },
  }
  const factor = table[from]?.[to]
  return factor == null ? null : qty * factor
}

const detailQtyNum = computed(() => Number.parseFloat(dQty.value) || 0)

const detailCost = computed(() => {
  const ing = pickedIngredient.value
  if (!ing || ing.unitCost === 0) {
    // Insumo lite / sin costo: conserva 0 (margen estimado).
    return editingNoCost.value ? 0 : itemBeingEditedCost()
  }
  const converted = convertQty(detailQtyNum.value, dUnit.value, ing.unit)
  return +((converted ?? detailQtyNum.value) * ing.unitCost).toFixed(2)
})

function itemBeingEditedCost(): number {
  const item = items.value.find(i => i.key === editingKey.value)
  return item?.cost ?? 0
}

const detailNet = computed(() => +(detailCost.value * (1 + dWaste.value / 100)).toFixed(2))
const detailIsNoCost = computed(() => editingNoCost.value || (pickedIngredient.value?.unitCost === 0))
const canSaveDetail = computed(() => detailQtyNum.value > 0)

function saveDetail(): void {
  if (!canSaveDetail.value) return
  const ing = pickedIngredient.value
  const payload = {
    name: detailName.value,
    qty: detailQtyNum.value,
    unit: dUnit.value,
    cost: detailIsNoCost.value ? 0 : detailCost.value,
    wastePct: dWaste.value || 0,
    wasteReason: dWaste.value > 0 ? dReason.value : null,
    noCost: detailIsNoCost.value,
    critical: ing ? ing.minStock > 0 && ing.stock < ing.minStock : false,
  }
  if (editingKey.value) {
    const idx = items.value.findIndex(i => i.key === editingKey.value)
    const current = items.value[idx]
    if (idx >= 0 && current) {
      items.value[idx] = { ...current, ...payload }
    }
    toast.add({ title: 'Insumo actualizado', icon: 'i-lucide-check' })
  }
  else if (ing) {
    draftSeq += 1
    items.value.push({ key: `it-${draftSeq}`, ingredientId: ing.id, ...payload })
    toast.add({
      title: payload.noCost ? 'Insumo agregado · sin costo (margen estimado)' : 'Insumo agregado al BOM',
      icon: 'i-lucide-check-circle-2',
    })
  }
  showDetail.value = false
}

function removeItem(item: DraftItem): void {
  items.value = items.value.filter(i => i.key !== item.key)
  toast.add({ title: `Quitado: ${item.name}`, icon: 'i-lucide-x' })
}

/* Crear insumo lite */
const liteName = ref('')
const liteUnit = ref('kg')

function openCreateLite(seed: string): void {
  liteName.value = seed
  liteUnit.value = 'kg'
  showSearch.value = false
  showCreate.value = true
}

function createLite(): void {
  const trimmed = liteName.value.trim()
  if (!trimmed) return
  draftSeq += 1
  items.value.push({
    key: `it-${draftSeq}`,
    ingredientId: `new-${Date.now()}`,
    name: trimmed,
    qty: 1,
    unit: liteUnit.value,
    cost: 0,
    wastePct: 0,
    wasteReason: null,
    noCost: true,
    critical: false,
  })
  showCreate.value = false
  toast.add({ title: 'Insumo creado en Stock. Agrega el costo para margen exacto.', icon: 'i-lucide-package-plus' })
}

/* Costeo acumulado */
const grossCost = computed(() => +items.value.reduce((a, b) => a + b.cost, 0).toFixed(2))
const wasteAdd = computed(() => +items.value.reduce((a, b) => a + b.cost * (b.wastePct / 100), 0).toFixed(2))
const totalCost = computed(() => +(grossCost.value + wasteAdd.value).toFixed(2))
const costPct = computed(() =>
  basePrice.value > 0 ? Math.min(100, (totalCost.value / basePrice.value) * 100) : 0)

function itemNet(item: DraftItem): number {
  return +(item.cost * (1 + item.wastePct / 100)).toFixed(2)
}

const canStep2 = computed(() => items.value.length >= 1)

/* ===== Paso 3 · Revisión y margen ===== */
const finalPrice = ref<number | null>(null)

const livePrice = computed(() => finalPrice.value ?? basePrice.value)
const sliderMin = computed(() => Math.max(1, +(basePrice.value * 0.5).toFixed(2)))
const sliderMax = computed(() => Math.max(+(basePrice.value * 1.5).toFixed(2), suggestedPrice.value))
const gain = computed(() => +(livePrice.value - totalCost.value).toFixed(2))
const marginPct = computed(() =>
  livePrice.value > 0 ? (gain.value / livePrice.value) * 100 : 0)
const marginRounded = computed(() => Math.round(marginPct.value))

// Redondeo hacia arriba a 0.50 para garantizar margen ≥ 30 %.
const suggestedPrice = computed(() =>
  totalCost.value > 0 ? Math.ceil((totalCost.value / 0.7) * 2) / 2 : 0)

type MarginStatus = 'crit' | 'warn' | 'good'
const marginStatus = computed<MarginStatus>(() => {
  if (marginPct.value < 20) return 'crit'
  if (marginPct.value < 30) return 'warn'
  return 'good'
})
const statusMeta = computed(() => {
  if (marginStatus.value === 'crit') {
    return {
      label: 'Margen crítico',
      icon: 'i-lucide-alert-triangle',
      alert: 'Tu margen está por debajo de 20%. Considera revisar costos o subir el precio.',
    }
  }
  if (marginStatus.value === 'warn') {
    return {
      label: 'Margen ajustado',
      icon: 'i-lucide-alert-circle',
      alert: 'Margen entre 20–30%. Aceptable, pero hay espacio para optimizar.',
    }
  }
  return {
    label: 'Margen saludable',
    icon: 'i-lucide-check-circle-2',
    alert: '¡Buen margen! Por encima de 30% — saludable para tu operación.',
  }
})

const noCostItems = computed(() => items.value.filter(i => i.noCost))

function setPrice(v: number): void {
  finalPrice.value = +Math.max(0, v).toFixed(2)
}
function onPriceInput(event: Event): void {
  const v = Number.parseFloat((event.target as HTMLInputElement).value)
  if (!Number.isNaN(v)) {
    setPrice(Math.max(sliderMin.value, Math.min(sliderMax.value, v)))
  }
}
function onSliderInput(event: Event): void {
  setPrice(Number.parseFloat((event.target as HTMLInputElement).value))
}

const EMOJI_BY_CATEGORY: Record<string, string> = {
  Marinos: '🐟',
  Criollos: '🥘',
  Entradas: '🥗',
  Piqueos: '🍢',
  Cocteles: '🍹',
  Bases: '🥣',
}
const draftEmoji = computed(() => EMOJI_BY_CATEGORY[category.value] ?? '🍽️')

/* ===== Navegación del wizard ===== */
const isDirty = computed(() =>
  !!(name.value || category.value || price.value || description.value || timeId.value || items.value.length))

function goNext(): void {
  if (step.value === 1 && canStep1.value) {
    step.value = 2
  }
  else if (step.value === 2 && canStep2.value) {
    if (finalPrice.value == null) finalPrice.value = basePrice.value
    step.value = 3
  }
}

function goBack(): void {
  if (step.value > 1) {
    step.value -= 1
  }
  else if (isDirty.value) {
    showDiscard.value = true
  }
  else {
    void navigateTo('/app/recetas')
  }
}

function onClose(): void {
  if (isDirty.value) showDiscard.value = true
  else void navigateTo('/app/recetas')
}

function discard(): void {
  showDiscard.value = false
  void navigateTo('/app/recetas')
}

/* ===== Guardar ===== */
const { mutateAsync: createRecipe, isLoading: saving } = useCreateRecipe()

async function save(): Promise<void> {
  if (saving.value) return
  const selectedTime = TIME_OPTIONS.find(t => t.id === timeId.value)
  const created = await createRecipe({
    name: name.value.trim(),
    category: category.value,
    kind: 'dish',
    description: description.value.trim() || undefined,
    emoji: draftEmoji.value,
    sellPrice: livePrice.value,
    items: items.value.map(i => ({
      ingredientId: i.ingredientId,
      name: i.name,
      qty: i.qty,
      unit: i.unit,
      cost: i.cost,
      wastePct: i.wastePct,
    })),
    prepMinutes: selectedTime?.minutes,
    active: true,
  })
  toast.add({ title: `${created.name} creado · Margen ${created.marginPct}%`, icon: 'i-lucide-check-circle-2' })
  await navigateTo(`/app/recetas/${created.id}`)
}
</script>

<template>
  <div class="rw-page">
    <!-- ============ Header wizard ============ -->
    <header class="rw-hdr">
      <button class="rw-icon-btn" :aria-label="step > 1 ? `Volver al paso ${step - 1}` : 'Volver'" @click="goBack">
        <UIcon name="i-lucide-arrow-left" />
      </button>
      <div class="rw-progress" :aria-label="`Paso ${step} de ${TOTAL_STEPS}`">
        <div class="dots" aria-hidden="true">
          <span
            v-for="i in TOTAL_STEPS"
            :key="i"
            class="dot"
            :class="{ active: i === step, done: i < step }"
          />
        </div>
        <div class="label">Paso {{ step }} de {{ TOTAL_STEPS }}</div>
      </div>
      <button class="rw-icon-btn" aria-label="Cerrar y descartar" @click="onClose">
        <UIcon name="i-lucide-x" />
      </button>
    </header>

    <!-- ============ PASO 1 · Datos básicos ============ -->
    <template v-if="step === 1">
      <div class="rw-step-title">
        <h1>Datos básicos</h1>
        <p>Empieza con la información esencial de tu plato.</p>
      </div>

      <form class="rw-form" @submit.prevent>
        <!-- Foto -->
        <div class="rw-field">
          <label class="rw-label">Foto del plato <span class="opt">opcional</span></label>
          <button type="button" class="rw-dropzone" aria-label="Agregar foto del plato" @click="showPhotoSheet = true">
            <span class="rw-dropzone-ico" aria-hidden="true"><UIcon name="i-lucide-camera" /></span>
            <span class="rw-dropzone-title">Agregar foto del plato</span>
            <span class="rw-dropzone-sub">Opcional · ayuda a identificarlo en la carta y en reportes</span>
          </button>
        </div>

        <!-- Nombre -->
        <div class="rw-field">
          <label class="rw-label" for="recipe-name">
            Nombre del plato <span class="req" aria-hidden="true">*</span>
          </label>
          <input
            id="recipe-name"
            v-model="name"
            class="rw-input"
            type="text"
            placeholder="Ej: Ceviche Clásico"
            aria-required="true"
            autocomplete="off"
            maxlength="60"
          >
        </div>

        <!-- Categoría -->
        <div class="rw-field">
          <label class="rw-label" for="recipe-category">
            Categoría <span class="req" aria-hidden="true">*</span>
          </label>
          <div class="rw-select-wrap">
            <select
              id="recipe-category"
              class="rw-select"
              :class="{ placeholder: !category }"
              :value="category"
              aria-required="true"
              @change="onCategoryChange"
            >
              <option value="" disabled>Elige una categoría…</option>
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              <option value="__new__">+ Crear categoría nueva…</option>
            </select>
            <span class="chev" aria-hidden="true"><UIcon name="i-lucide-chevron-down" /></span>
          </div>
        </div>

        <!-- Precio -->
        <div class="rw-field">
          <label class="rw-label" for="recipe-price">
            Precio de venta <span class="req" aria-hidden="true">*</span>
          </label>
          <div class="rw-price">
            <span class="currency" aria-hidden="true">S/</span>
            <input
              id="recipe-price"
              v-model="price"
              type="number"
              inputmode="decimal"
              step="0.10"
              min="0"
              placeholder="0.00"
              aria-required="true"
            >
          </div>
          <div class="rw-help">IGV incluido · este es el precio que ve el cliente en la carta.</div>
        </div>

        <!-- Descripción -->
        <div class="rw-field">
          <label class="rw-label" for="recipe-desc">
            Descripción <span class="opt">opcional</span>
          </label>
          <textarea
            id="recipe-desc"
            v-model="description"
            class="rw-textarea"
            rows="3"
            placeholder="Ej: Pescado del día con limón sutil, ají limo, camote y choclo."
            maxlength="180"
          />
          <div class="rw-textarea-meta">{{ description.length }}/180</div>
        </div>

        <!-- Tiempo -->
        <div class="rw-field">
          <label class="rw-label">Tiempo de preparación <span class="opt">opcional</span></label>
          <div class="rw-chip-row" role="radiogroup" aria-label="Tiempo de preparación">
            <button
              v-for="t in TIME_OPTIONS"
              :key="t.id"
              type="button"
              role="radio"
              :aria-checked="timeId === t.id"
              class="rw-time-chip"
              :class="{ active: timeId === t.id }"
              @click="timeId = timeId === t.id ? null : t.id"
            >
              {{ t.label }}
            </button>
          </div>
          <div class="rw-help">Sirve para ordenar la cocina (KDS) y para la carta.</div>
        </div>

        <div class="rw-note">
          En el siguiente paso vas a agregar los <b>insumos</b> y GastronomIA calculará
          automáticamente el costo y el margen del plato.
        </div>
      </form>
    </template>

    <!-- ============ PASO 2 · Insumos ============ -->
    <template v-else-if="step === 2">
      <div class="rw-step-title">
        <h1>Insumos del plato</h1>
        <p>Agrega los ingredientes con sus cantidades. La merma es opcional.</p>
      </div>

      <!-- Costo acumulado -->
      <section class="rw-cost-stick" aria-label="Costo acumulado">
        <div class="rw-cost-row">
          <div class="rw-cost-label">Costo acumulado</div>
          <div class="rw-cost-value"><span class="currency">S/</span>{{ grossCost.toFixed(2) }}</div>
        </div>
        <div class="rw-cost-meta">
          <b>{{ items.length }}</b> insumo{{ items.length === 1 ? '' : 's' }} ·
          Mermas <b>+ {{ fmtMoney(wasteAdd) }}</b> = Total <b>{{ fmtMoney(totalCost) }}</b>
        </div>
        <div class="rw-cost-bar" aria-hidden="true">
          <span :style="{ width: `${costPct}%` }" />
        </div>
        <div class="rw-cost-bar-foot">
          <span>0</span>
          <span>{{ Math.round(costPct) }}% del precio · {{ fmtMoney(basePrice) }}</span>
        </div>
      </section>

      <!-- Vacío -->
      <div v-if="items.length === 0" class="rw-empty">
        <span class="illus" aria-hidden="true"><UIcon name="i-lucide-package-open" /></span>
        <h3>Sin insumos aún</h3>
        <p>Agrega el primer ingrediente para empezar el costeo.</p>
        <button type="button" class="rw-add-bom first" @click="openSearch">
          <UIcon name="i-lucide-plus" /> Agregar primer insumo
        </button>
      </div>

      <!-- Lista BOM -->
      <template v-else>
        <div class="rw-bom-list">
          <button
            v-for="item in items"
            :key="item.key"
            type="button"
            class="rw-bom-item"
            :class="{ 'no-cost': item.noCost }"
            :aria-label="`Editar ${item.name}`"
            @click="editItem(item)"
          >
            <div class="rw-bom-name">
              {{ item.name }}
              <UIcon v-if="item.critical" name="i-lucide-alert-triangle" class="crit-ico" />
              <span v-if="item.noCost" class="badge warn">
                <UIcon name="i-lucide-alert-circle" /> Sin costo
              </span>
            </div>
            <div class="rw-bom-cost">{{ fmtMoney(item.cost) }}</div>
            <span
              class="rw-bom-remove"
              role="button"
              :aria-label="`Quitar ${item.name}`"
              @click.stop="removeItem(item)"
            >
              <UIcon name="i-lucide-x" />
            </span>
            <div class="rw-bom-meta">
              <span class="rw-bom-qty">{{ item.qty }}{{ item.unit }}</span>
              <span v-if="item.wastePct > 0" class="badge">
                Merma {{ item.wastePct }}%{{ item.wasteReason ? ` · ${item.wasteReason}` : '' }}
              </span>
              <span v-if="item.wastePct > 0" class="net">neto <b>{{ fmtMoney(itemNet(item)) }}</b></span>
            </div>
          </button>
        </div>
        <button type="button" class="rw-add-bom" @click="openSearch">
          <UIcon name="i-lucide-plus" /> Agregar insumo
        </button>
      </template>

      <div class="rw-note">
        En el siguiente paso vas a <b>revisar el costo total</b> y ajustar el precio
        de venta para alcanzar el margen objetivo.
      </div>
    </template>

    <!-- ============ PASO 3 · Revisión ============ -->
    <template v-else>
      <div class="rw-step-title">
        <h1>Revisar y guardar</h1>
        <p>Confirma el costeo y ajusta el precio si lo necesitas.</p>
      </div>

      <!-- Hero -->
      <section class="rw3-hero">
        <div class="img" aria-hidden="true">{{ draftEmoji }}</div>
        <div class="body">
          <div class="cat">{{ category }}</div>
          <h2 class="name">{{ name }}</h2>
          <div class="price">Precio actual <b>{{ fmtMoney(livePrice) }}</b></div>
        </div>
      </section>

      <!-- Desglose -->
      <section class="rw3-section">
        <h2>Desglose de costo <span class="right">{{ items.length }} insumos</span></h2>
        <div class="rw3-card">
          <div v-for="item in items" :key="item.key" class="rw3-bd-row">
            <div class="name">
              {{ item.name }}
              <span class="sub">· {{ item.qty }} {{ item.unit }}</span>
              <span v-if="item.wastePct > 0" class="merma-tag">
                +{{ item.wastePct }}% {{ item.wasteReason ?? 'merma' }}
              </span>
            </div>
            <div class="val">
              <template v-if="item.wastePct > 0">
                <span class="net">{{ fmtMoney(itemNet(item)) }}</span>
                <span class="raw">{{ fmtMoney(item.cost) }}</span>
              </template>
              <template v-else>{{ fmtMoney(item.cost) }}</template>
            </div>
          </div>
          <div class="rw3-bd-totals">
            <div class="row">
              <span class="lbl">Costo bruto</span>
              <span class="val">{{ fmtMoney(grossCost) }}</span>
            </div>
            <div class="row merma">
              <span class="lbl">Total mermas</span>
              <span class="val">+ {{ fmtMoney(wasteAdd) }}</span>
            </div>
            <div class="row total">
              <span class="lbl">Costo total</span>
              <span class="val">{{ fmtMoney(totalCost) }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Margen en vivo -->
      <section class="rw3-section">
        <h2>Tu margen <span class="right">en vivo</span></h2>
        <div class="rw3-margin" :class="marginStatus" aria-live="polite">
          <div class="rw3-margin-rows">
            <div class="row">
              <span>Precio venta</span>
              <span class="val">{{ fmtMoney(livePrice) }}</span>
            </div>
            <div class="row">
              <span>Costo total</span>
              <span class="val">{{ fmtMoney(totalCost) }}</span>
            </div>
            <div class="row gain">
              <span>Ganancia por plato</span>
              <span class="val">{{ fmtMoney(gain) }}</span>
            </div>
          </div>
          <div class="rw3-margin-big">
            <span class="lbl">Margen</span>
            <span class="pct">{{ marginRounded }}%</span>
          </div>
          <span class="rw3-status-pill">
            <UIcon :name="statusMeta.icon" /> {{ statusMeta.label }}
          </span>
        </div>
      </section>

      <!-- Ajuste de precio -->
      <section class="rw3-section">
        <div class="rw3-card rw3-adjust">
          <h3>¿Quieres ajustar el precio?</h3>
          <p class="sub">Mira el margen actualizarse en vivo.</p>

          <div class="rw3-slider-row">
            <label class="price-input" aria-label="Precio de venta">
              <span class="currency">S/</span>
              <input
                type="number"
                inputmode="decimal"
                step="0.50"
                :min="sliderMin"
                :max="sliderMax"
                :value="livePrice.toFixed(2)"
                @change="onPriceInput"
              >
            </label>
            <input
              type="range"
              class="rw3-slider"
              :min="sliderMin"
              :max="sliderMax"
              step="0.50"
              :value="livePrice"
              aria-label="Ajustar precio"
              @input="onSliderInput"
            >
          </div>
          <div class="rw3-slider-foot">
            <span>{{ fmtMoney(sliderMin) }}</span>
            <span>actual {{ fmtMoney(basePrice) }}</span>
            <span>{{ fmtMoney(sliderMax) }}</span>
          </div>

          <div class="rw3-quick-prices">
            <button type="button" class="rw3-quick-price keep" @click="setPrice(basePrice)">
              Mantener {{ fmtMoney(basePrice) }}
            </button>
            <button type="button" class="rw3-quick-price" @click="setPrice(basePrice + 2)">+ S/ 2</button>
            <button type="button" class="rw3-quick-price" @click="setPrice(basePrice + 5)">+ S/ 5</button>
            <button
              type="button"
              class="rw3-quick-price suggest"
              :aria-label="`Aplicar precio sugerido ${fmtMoney(suggestedPrice)}`"
              @click="setPrice(suggestedPrice)"
            >
              IA · {{ fmtMoney(suggestedPrice) }}
            </button>
          </div>

          <div class="rw3-alert" :class="marginStatus">
            <UIcon :name="statusMeta.icon" />
            <div>{{ statusMeta.alert }}</div>
          </div>
        </div>
      </section>

      <!-- Sugerencia IA -->
      <section v-if="marginPct < 30 && totalCost > 0" class="rw3-section">
        <div class="rw3-ai">
          <span class="ico" aria-hidden="true"><UIcon name="i-lucide-sparkles" /></span>
          <div class="body">
            <b>GastronomIA sugiere:</b> para alcanzar un margen de <b>30%</b>, el precio debería ser
            <b>{{ fmtMoney(suggestedPrice) }}</b>. Comparado con tu zona (Miraflores), está en rango
            competitivo para platos similares.
            <div class="actions">
              <button type="button" class="primary" @click="setPrice(suggestedPrice)">
                Aplicar {{ fmtMoney(suggestedPrice) }}
              </button>
              <button
                type="button"
                @click="toast.add({ title: 'Análisis de mercado — disponible pronto', icon: 'i-lucide-bar-chart-3' })"
              >
                Ver análisis
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Insumos sin costo -->
      <section v-if="noCostItems.length > 0" class="rw3-section">
        <div class="rw3-warn-banner">
          <UIcon name="i-lucide-alert-circle" />
          <div class="body">
            <b>{{ noCostItems.length }} insumo{{ noCostItems.length === 1 ? '' : 's' }} sin costo</b>
            ({{ noCostItems.map(i => i.name).join(', ') }}). Tu margen es <b>estimado</b> hasta que
            registres el costo en Stock.
            <div>
              <NuxtLink to="/app/inventario">Completar costos en Inventario</NuxtLink>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ============ CTA sticky ============ -->
    <div class="rw-cta" :class="{ dual: step > 1 }">
      <div class="rw-cta-inner" :class="{ dual: step > 1 }">
        <button v-if="step > 1" class="rw-cta-btn rw-cta-back" @click="goBack">
          <UIcon name="i-lucide-arrow-left" /> Atrás
        </button>
        <template v-if="step === 1">
          <button class="rw-cta-btn" :disabled="!canStep1" aria-label="Siguiente paso: insumos" @click="goNext">
            Siguiente: Insumos <UIcon name="i-lucide-arrow-right" />
          </button>
        </template>
        <template v-else-if="step === 2">
          <button class="rw-cta-btn" :disabled="!canStep2" @click="goNext">
            Siguiente: Revisión <UIcon name="i-lucide-arrow-right" />
          </button>
        </template>
        <template v-else>
          <button class="rw-cta-btn" :disabled="saving" @click="save">
            Guardar receta <UIcon name="i-lucide-check" />
          </button>
        </template>
      </div>
      <div v-if="step === 1 && !canStep1" class="rw-cta-hint">
        Faltan: <b>{{ missing.join(' · ') }}</b>
      </div>
    </div>

    <!-- ============ Sheet: foto ============ -->
    <UiBottomSheet v-model="showPhotoSheet" title="Agregar foto">
      <button class="rw-sheet-opt" @click="pickPhoto('camera')">
        <span class="rw-sheet-opt-ico"><UIcon name="i-lucide-camera" /></span>
        <div class="rw-sheet-opt-body">
          <div>Tomar foto</div>
          <div class="desc">Usa la cámara del teléfono</div>
        </div>
        <span class="chev"><UIcon name="i-lucide-chevron-right" /></span>
      </button>
      <button class="rw-sheet-opt" @click="pickPhoto('gallery')">
        <span class="rw-sheet-opt-ico"><UIcon name="i-lucide-image" /></span>
        <div class="rw-sheet-opt-body">
          <div>Galería</div>
          <div class="desc">Elegir una foto existente</div>
        </div>
        <span class="chev"><UIcon name="i-lucide-chevron-right" /></span>
      </button>
    </UiBottomSheet>

    <!-- ============ Sheet: buscar insumo ============ -->
    <UiBottomSheet v-model="showSearch" title="Agregar insumo">
      <label class="rw-search-input" for="search-insumo">
        <UIcon name="i-lucide-search" />
        <input
          id="search-insumo"
          v-model="searchQ"
          type="search"
          placeholder="Buscar en mi inventario…"
          autocomplete="off"
        >
        <button
          v-if="searchQ"
          class="rw-search-clear"
          aria-label="Limpiar búsqueda"
          @click="searchQ = ''"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </label>

      <div v-if="!showNotFound" class="rw-search-section-label">
        {{ searchQ.trim() ? `Resultados para "${searchQ}"` : 'Tu inventario' }}
      </div>
      <button
        v-for="ing in searchResults"
        :key="ing.id"
        type="button"
        class="rw-search-result"
        @click="pickIngredient(ing)"
      >
        <span class="rw-search-result-ico"><span class="emoji">{{ ingredientEmoji(ing) }}</span></span>
        <div>
          <div class="rw-search-result-name">
            {{ ing.name }}
            <UIcon v-if="ing.minStock > 0 && ing.stock < ing.minStock" name="i-lucide-alert-triangle" class="crit-ico" />
          </div>
          <div class="rw-search-result-meta">
            Stock: {{ ing.stock }} {{ ing.unit }}
          </div>
        </div>
        <div class="rw-search-result-cost">
          <span v-if="ing.unitCost === 0" class="nocost">
            <UIcon name="i-lucide-alert-circle" /> Sin costo
          </span>
          <template v-else>{{ ingredientCostLabel(ing) }}</template>
        </div>
      </button>

      <div v-if="showNotFound" class="rw-not-found">
        <h4>Sin coincidencias</h4>
        <p>No encontramos <b>"{{ searchQ }}"</b> en tu inventario.</p>
        <button type="button" class="rw-create-cta" @click="openCreateLite(searchQ)">
          <UIcon name="i-lucide-plus" /> Crear "{{ searchQ }}" como nuevo insumo
        </button>
      </div>
    </UiBottomSheet>

    <!-- ============ Sheet: detalle insumo ============ -->
    <UiBottomSheet v-model="showDetail" :title="editingKey ? 'Editar insumo' : detailName">
      <div class="rw-detail-summary">
        <span class="ico"><span class="emoji">{{ pickedIngredient ? ingredientEmoji(pickedIngredient) : '🥄' }}</span></span>
        <div class="body">
          <div class="name">{{ detailName }}</div>
          <div class="meta">
            <template v-if="detailIsNoCost">Sin costo registrado</template>
            <template v-else-if="pickedIngredient">
              {{ ingredientCostLabel(pickedIngredient) }} · stock {{ pickedIngredient.stock }} {{ pickedIngredient.unit }}
            </template>
            <template v-else>Costo manual</template>
          </div>
        </div>
        <button v-if="!editingKey" class="rw-search-back" aria-label="Volver a búsqueda" @click="detailBack">
          <UIcon name="i-lucide-arrow-left" />
        </button>
      </div>

      <!-- Cantidad + unidad -->
      <div class="rw-field sheet-gap">
        <label class="rw-label" for="qty-input">
          Cantidad <span class="req" aria-hidden="true">*</span>
        </label>
        <div class="rw-qty-row">
          <input
            id="qty-input"
            v-model="dQty"
            class="rw-input"
            type="number"
            inputmode="decimal"
            step="0.1"
            min="0"
          >
          <div class="rw-select-wrap">
            <select v-model="dUnit" class="rw-select" aria-label="Unidad de medida">
              <option v-for="u in UNITS" :key="u.value" :value="u.value">{{ u.label }}</option>
            </select>
            <span class="chev" aria-hidden="true"><UIcon name="i-lucide-chevron-down" /></span>
          </div>
        </div>
      </div>

      <!-- Merma -->
      <div class="rw-field sheet-gap">
        <label class="rw-label" for="merma-input">Merma <span class="opt">opcional</span></label>
        <div class="rw-help no-top">Pérdida en limpieza, jugo, hueso, cocción, etc.</div>
        <div class="rw-merma-wrap">
          <input
            id="merma-input"
            v-model.number="dWaste"
            class="rw-input"
            type="number"
            inputmode="numeric"
            min="0"
            max="80"
            step="1"
            placeholder="0"
          >
          <span class="pct-suffix">%</span>
        </div>
        <div class="rw-quick-row" role="radiogroup" aria-label="Merma rápida">
          <button
            v-for="v in QUICK_WASTES"
            :key="v"
            type="button"
            role="radio"
            :aria-checked="dWaste === v"
            class="rw-quick-chip"
            :class="{ active: dWaste === v }"
            @click="dWaste = v"
          >
            {{ v }}%
          </button>
        </div>
      </div>

      <!-- Motivo -->
      <div v-if="dWaste > 0" class="rw-field sheet-gap">
        <label class="rw-label">Motivo de merma <span class="opt">opcional</span></label>
        <div class="rw-reason-row">
          <button
            v-for="r in WASTE_REASONS"
            :key="r"
            type="button"
            class="rw-reason-chip"
            :class="{ active: dReason === r }"
            @click="dReason = dReason === r ? null : r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <!-- Preview -->
      <div class="rw-preview" aria-live="polite">
        <div class="rw-preview-row">
          <span class="lbl">Costo bruto</span>
          <span class="val">{{ detailIsNoCost ? '— sin costo' : fmtMoney(detailCost) }}</span>
        </div>
        <div v-if="dWaste > 0" class="rw-preview-row">
          <span class="lbl">Con merma {{ dWaste }}%</span>
          <span class="val">{{ detailIsNoCost ? '— sin costo' : fmtMoney(detailNet) }}</span>
        </div>
        <div class="rw-preview-row total">
          <span class="lbl">Costo a sumar</span>
          <span class="val">{{ detailIsNoCost ? 'estimado' : fmtMoney(detailNet) }}</span>
        </div>
      </div>

      <template #cta>
        <button type="button" class="rw-cta-btn full" :disabled="!canSaveDetail" @click="saveDetail">
          {{ editingKey ? 'Guardar cambios' : 'Agregar al BOM' }} <UIcon name="i-lucide-check" />
        </button>
      </template>
    </UiBottomSheet>

    <!-- ============ Sheet: crear insumo lite ============ -->
    <UiBottomSheet v-model="showCreate" title="Crear nuevo insumo" subtitle="Lo completarás después en Stock">
      <div class="rw-field sheet-gap">
        <label class="rw-label" for="lite-name">
          Nombre del insumo <span class="req" aria-hidden="true">*</span>
        </label>
        <input
          id="lite-name"
          v-model="liteName"
          class="rw-input"
          type="text"
          placeholder="Ej: Limón verde"
        >
      </div>

      <div class="rw-field sheet-gap">
        <label class="rw-label" for="lite-unit">
          Unidad de medida <span class="req" aria-hidden="true">*</span>
        </label>
        <div class="rw-select-wrap">
          <select id="lite-unit" v-model="liteUnit" class="rw-select">
            <option v-for="u in UNITS" :key="u.value" :value="u.value">{{ u.label }}</option>
          </select>
          <span class="chev" aria-hidden="true"><UIcon name="i-lucide-chevron-down" /></span>
        </div>
      </div>

      <div class="rw-info-banner">
        <UIcon name="i-lucide-alert-circle" />
        <div>
          Este insumo se creará <b>SIN COSTO</b>. El margen del plato se mostrará como
          <b>"estimado"</b> hasta que registres el costo en <b>Stock</b>.
        </div>
      </div>

      <template #cta>
        <div class="rw-create-actions">
          <button type="button" class="rw-cta-btn rw-cta-back" @click="showCreate = false">Cancelar</button>
          <button type="button" class="rw-cta-btn" :disabled="!liteName.trim()" @click="createLite">
            Crear y agregar <UIcon name="i-lucide-check" />
          </button>
        </div>
      </template>
    </UiBottomSheet>

    <!-- ============ Modal: descartar ============ -->
    <Teleport to="body">
      <template v-if="showDiscard">
        <div class="rw-discard-overlay" aria-hidden="true" @click="showDiscard = false" />
        <div class="rw-discard" role="dialog" aria-label="Descartar receta">
          <div class="rw-discard-ico" aria-hidden="true"><UIcon name="i-lucide-alert-triangle" /></div>
          <h3>¿Descartar la receta?</h3>
          <p>Vas a perder los datos ingresados. Esta acción no se puede deshacer.</p>
          <div class="rw-discard-actions">
            <button class="btn btn-ghost" @click="showDiscard = false">Continuar editando</button>
            <button class="btn btn-danger" @click="discard">Descartar</button>
          </div>
        </div>
      </template>
    </Teleport>

    <!-- ============ Overlay: guardando ============ -->
    <Teleport to="body">
      <div v-if="saving" class="rw3-saving" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true" />
        <p>Guardando receta…</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rw-page {
  max-width: 640px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  padding-bottom: 120px; /* aire para el CTA fijo */
}
@media (min-width: 1024px) {
  .rw-page { padding-top: 28px; }
}

/* ============ HEADER WIZARD ============ */
.rw-hdr {
  padding: 8px 16px 14px;
  display: grid;
  grid-template-columns: 36px 1fr 36px;
  align-items: center;
  gap: 8px;
}
.rw-icon-btn {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--fg1);
  cursor: pointer;
}
.rw-icon-btn:hover { background: var(--crema-100); }
.rw-icon-btn:active { transform: scale(0.96); }
.rw-icon-btn .iconify { width: 18px; height: 18px; }

.rw-progress {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px;
  user-select: none;
}
.rw-progress .dots { display: flex; gap: 6px; align-items: center; }
.rw-progress .dot {
  width: 22px; height: 6px;
  border-radius: 999px;
  background: var(--crema-200);
  transition: background var(--dur), width var(--dur);
}
.rw-progress .dot.active { background: var(--terracotta); width: 28px; }
.rw-progress .dot.done { background: var(--terracotta-300); }
.rw-progress .label {
  font-size: 10.5px; font-weight: 600;
  color: var(--fg3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ============ TÍTULO DE PASO ============ */
.rw-step-title { padding: 4px 20px 16px; }
.rw-step-title h1 {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 32px;
  letter-spacing: -0.01em;
  color: var(--fg1);
  margin: 0;
  line-height: 1.05;
}
.rw-step-title p {
  font-size: 13.5px;
  color: var(--fg3);
  margin: 6px 0 0;
}

/* ============ FORM ============ */
.rw-form {
  padding: 0 16px;
  display: flex; flex-direction: column;
  gap: 16px;
}
.rw-field { display: flex; flex-direction: column; gap: 6px; }
.rw-field.sheet-gap { margin-bottom: 14px; }
.rw-label {
  font-family: var(--font-sans);
  font-size: 12px; font-weight: 600;
  color: var(--fg2);
  letter-spacing: 0.02em;
  display: inline-flex; align-items: center;
  gap: 4px;
}
.rw-label .req { color: var(--terracotta); font-weight: 700; }
.rw-label .opt {
  font-size: 11px; font-weight: 500;
  color: var(--fg3);
  margin-left: 4px;
}
.rw-help { font-size: 11.5px; color: var(--fg3); margin-top: 2px; }
.rw-help.no-top { margin-top: 0; margin-bottom: 6px; }

.rw-input,
.rw-textarea,
.rw-select {
  width: 100%;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 13px 14px;
  outline: none;
  transition: border-color var(--dur), box-shadow var(--dur), background var(--dur);
  -webkit-appearance: none;
  appearance: none;
}
.rw-input::placeholder,
.rw-textarea::placeholder { color: var(--fg3); }
.rw-input:focus,
.rw-textarea:focus,
.rw-select:focus {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
  background: var(--crema-50);
}
.rw-textarea {
  resize: none;
  min-height: 76px;
  line-height: 1.45;
}
.rw-select-wrap { position: relative; }
.rw-select { padding-right: 40px; cursor: pointer; }
.rw-select.placeholder { color: var(--fg3); }
.rw-select-wrap .chev {
  position: absolute;
  right: 14px; top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--fg3);
  display: inline-flex;
}
.rw-select-wrap .chev .iconify { width: 18px; height: 18px; }

/* ============ DROPZONE ============ */
.rw-dropzone {
  background: var(--pure-white);
  border: 1.5px dashed var(--border-strong);
  border-radius: 16px;
  padding: 26px 16px;
  display: flex; flex-direction: column;
  align-items: center; gap: 8px;
  cursor: pointer;
  transition: background var(--dur), border-color var(--dur);
  text-align: center;
}
.rw-dropzone:hover {
  background: var(--crema-50);
  border-color: var(--terracotta-300);
}
.rw-dropzone-ico {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--terracotta-100);
  color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
}
.rw-dropzone-ico .iconify { width: 26px; height: 26px; }
.rw-dropzone-title {
  font-family: var(--font-sans);
  font-size: 15px; font-weight: 600;
  color: var(--fg1);
  margin-top: 2px;
}
.rw-dropzone-sub {
  font-size: 12px; color: var(--fg3);
  max-width: 260px;
  line-height: 1.4;
}

/* ============ PRECIO ============ */
.rw-price {
  position: relative;
  display: flex; align-items: stretch;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: border-color var(--dur), box-shadow var(--dur), background var(--dur);
}
.rw-price:focus-within {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
  background: var(--crema-50);
}
.rw-price .currency {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 22px;
  color: var(--terracotta-700);
  display: inline-flex; align-items: center;
  padding: 0 4px 0 16px;
  flex-shrink: 0;
}
.rw-price input {
  flex: 1;
  border: none; outline: none; background: transparent;
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg1);
  padding: 12px 14px 12px 4px;
  min-width: 0;
  appearance: textfield;
  -moz-appearance: textfield;
}
.rw-price input::-webkit-outer-spin-button,
.rw-price input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rw-price input::placeholder { color: var(--fg3); font-weight: 500; }

/* ============ TIME CHIPS ============ */
.rw-chip-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.rw-time-chip {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 10px 6px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--fg2);
  cursor: pointer;
  transition: all var(--dur);
  min-height: 40px;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.rw-time-chip:hover { background: var(--crema-100); }
.rw-time-chip.active {
  background: var(--terracotta);
  color: var(--crema-100);
  border-color: var(--terracotta);
  font-weight: 600;
}

.rw-textarea-meta {
  display: flex; justify-content: flex-end;
  font-size: 11px;
  color: var(--fg3);
  font-family: var(--font-mono);
  margin-top: 2px;
}

.rw-note {
  font-size: 11.5px;
  color: var(--fg3);
  text-align: center;
  padding: 16px 24px 0;
  line-height: 1.4;
}
.rw-note b { color: var(--fg2); font-weight: 600; }

/* ============ COSTO ACUMULADO (paso 2) ============ */
.rw-cost-stick {
  position: sticky;
  top: 8px;
  z-index: 3;
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: linear-gradient(180deg, var(--pure-white) 0%, var(--crema-50) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}
.rw-cost-row {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px;
}
.rw-cost-label {
  font-family: var(--font-sans);
  font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3);
}
.rw-cost-value {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.02em;
  color: var(--fg1);
  line-height: 1;
}
.rw-cost-value .currency {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 14px;
  color: var(--terracotta-700);
  margin-right: 4px;
  vertical-align: 0.18em;
}
.rw-cost-meta {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg3);
  margin-top: 6px;
  letter-spacing: -0.01em;
}
.rw-cost-meta b { color: var(--fg2); font-weight: 500; }
.rw-cost-bar {
  margin-top: 10px;
  height: 6px;
  background: var(--crema-200);
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}
.rw-cost-bar > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--oliva) 0%, var(--mostaza) 60%, var(--danger) 100%);
  border-radius: 999px;
  transition: width var(--dur);
}
.rw-cost-bar-foot {
  margin-top: 4px;
  display: flex; justify-content: space-between;
  font-size: 10.5px; color: var(--fg3);
  font-family: var(--font-mono);
}

/* ============ LISTA BOM ============ */
.rw-bom-list {
  display: flex; flex-direction: column;
  gap: 6px;
  padding: 0 16px;
}
.rw-bom-item {
  display: grid;
  grid-template-columns: 1fr auto 28px;
  gap: 4px 10px;
  align-items: center;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 12px 12px 14px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  position: relative;
  transition: background var(--dur), border-color var(--dur);
}
.rw-bom-item:hover { background: var(--crema-50); border-color: var(--border); }
.rw-bom-item.no-cost { border-color: rgba(216, 164, 65, 0.45); }
.rw-bom-name {
  font-family: var(--font-sans);
  font-size: 14.5px;
  font-weight: 600;
  color: var(--fg1);
  line-height: 1.2;
  display: inline-flex; align-items: center; gap: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.crit-ico { width: 13px; height: 13px; color: var(--danger); flex-shrink: 0; }
.rw-bom-qty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg3);
  font-weight: 500;
}
.rw-bom-cost {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--fg1);
  font-weight: 500;
  text-align: right;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.rw-bom-meta {
  grid-column: 1 / -1;
  margin-top: 4px;
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px;
  color: var(--fg3);
  flex-wrap: wrap;
}
.rw-bom-meta .badge {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--mostaza-100);
  color: var(--mostaza-700);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
}
.rw-bom-meta .badge .iconify,
.rw-bom-name .badge .iconify { width: 10px; height: 10px; }
.rw-bom-name .badge {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--warning-bg);
  color: var(--mostaza-700);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
}
.rw-bom-meta .net { font-family: var(--font-mono); color: var(--fg2); }
.rw-bom-meta .net b { color: var(--fg1); font-weight: 500; }
.rw-bom-remove {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--crema-200);
  color: var(--fg2);
  border: none;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur), color var(--dur);
}
.rw-bom-remove:hover { background: var(--danger-bg); color: var(--danger); }
.rw-bom-remove .iconify { width: 14px; height: 14px; }

.rw-add-bom {
  margin: 8px 16px 0;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: transparent;
  border: 1.5px dashed var(--border-strong);
  color: var(--terracotta-700);
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 600;
  border-radius: 14px;
  padding: 18px 14px;
  cursor: pointer;
  transition: background var(--dur), border-color var(--dur);
}
.rw-add-bom:hover {
  background: var(--terracotta-100);
  border-color: var(--terracotta-300);
  border-style: solid;
}
.rw-add-bom .iconify { width: 16px; height: 16px; }
.rw-add-bom.first { margin: 10px 0 0; width: 100%; }

.rw-empty {
  margin: 28px 16px 16px;
  padding: 32px 24px;
  background: var(--pure-white);
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.rw-empty .illus {
  width: 80px; height: 80px;
  border-radius: 22px;
  background:
    radial-gradient(circle at 30% 30%, var(--terracotta-100) 0%, transparent 60%),
    var(--crema-100);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--terracotta);
}
.rw-empty .illus .iconify { width: 36px; height: 36px; }
.rw-empty h3 {
  font-family: var(--font-serif); font-style: italic; font-weight: 500;
  font-size: 20px; color: var(--fg1);
  margin: 6px 0 0;
}
.rw-empty p {
  font-size: 12.5px; color: var(--fg2);
  margin: 0; max-width: 260px;
}

/* ============ CTA STICKY ============ */
.rw-cta {
  position: fixed;
  left: 0; right: 0;
  bottom: calc(68px + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  background: rgba(248, 244, 237, 0.94);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  border-top: 1px solid var(--border-subtle);
  padding: 12px 16px;
  display: flex; flex-direction: column; gap: 6px;
}
@media (min-width: 1024px) {
  .rw-cta { left: 256px; bottom: 0; padding-bottom: 16px; }
}
.rw-cta-inner {
  max-width: 608px;
  margin: 0 auto;
  width: 100%;
}
.rw-cta-inner.dual {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
}
.rw-cta-btn {
  width: 100%;
  min-height: 52px;
  border-radius: 14px;
  border: none;
  background: var(--terracotta);
  color: var(--crema-100);
  font-family: var(--font-sans);
  font-size: 15px; font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  gap: 8px;
  transition: background var(--dur), transform 80ms;
}
.rw-cta-btn:hover { background: var(--terracotta-700); }
.rw-cta-btn:active { transform: scale(0.98); }
.rw-cta-btn:disabled {
  background: var(--crema-200);
  color: var(--fg3);
  cursor: not-allowed;
}
.rw-cta-btn .iconify { width: 16px; height: 16px; }
.rw-cta-inner.dual .rw-cta-btn { min-height: 48px; }
.rw-cta-back {
  background: transparent;
  color: var(--fg1);
  border: 1px solid var(--border);
  font-weight: 600;
  padding: 0 18px;
}
.rw-cta-back:hover { background: var(--crema-200); }
.rw-cta-btn.full { margin-top: 0; }
.rw-cta-hint {
  text-align: center;
  font-size: 11px;
  color: var(--fg3);
  margin-top: 2px;
}
.rw-cta-hint b { color: var(--danger); font-weight: 600; }

/* ============ SHEET: FOTO ============ */
.rw-sheet-opt {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  padding: 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  font: inherit;
  font-size: 14px; font-weight: 500;
  color: var(--fg1);
  cursor: pointer;
  text-align: left;
  margin-bottom: 6px;
}
.rw-sheet-opt:hover { background: var(--crema-100); }
.rw-sheet-opt-ico {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--terracotta-100);
  color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
}
.rw-sheet-opt-ico .iconify { width: 18px; height: 18px; }
.rw-sheet-opt-body { flex: 1; min-width: 0; }
.rw-sheet-opt-body .desc {
  font-size: 11.5px; color: var(--fg3); margin-top: 2px;
  font-weight: 400;
}
.rw-sheet-opt .chev { color: var(--fg3); }
.rw-sheet-opt .chev .iconify { width: 16px; height: 16px; }

/* ============ SHEET: BUSCAR ============ */
.rw-search-input {
  margin: 0 0 12px;
  display: flex; align-items: center; gap: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0 14px;
  height: 46px;
}
.rw-search-input:focus-within {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
}
.rw-search-input > .iconify { width: 18px; height: 18px; color: var(--fg3); flex-shrink: 0; }
.rw-search-input input {
  flex: 1;
  border: none; outline: none; background: transparent;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--fg1);
  min-width: 0;
}
.rw-search-input input::placeholder { color: var(--fg3); }
.rw-search-clear {
  width: 22px; height: 22px; border-radius: 50%;
  border: none; cursor: pointer;
  background: var(--crema-200);
  color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rw-search-clear .iconify { width: 12px; height: 12px; }

.rw-search-section-label {
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  padding: 4px 4px 8px;
}
.rw-search-result {
  width: 100%;
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 12px;
  align-items: center;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  margin-bottom: 6px;
  transition: background var(--dur), border-color var(--dur);
}
.rw-search-result:hover { background: var(--crema-50); border-color: var(--border); }
.rw-search-result-ico {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--crema-200);
  display: inline-flex; align-items: center; justify-content: center;
}
.rw-search-result-ico .emoji { font-size: 18px; }
.rw-search-result-name {
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 600;
  color: var(--fg1);
  line-height: 1.2;
  display: flex; align-items: center; gap: 6px;
}
.rw-search-result-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg3);
  margin-top: 2px;
}
.rw-search-result-cost {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--fg1);
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}
.rw-search-result-cost .nocost {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px;
  background: var(--warning-bg);
  color: var(--mostaza-700);
  padding: 3px 8px;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-weight: 600;
}
.rw-search-result-cost .nocost .iconify { width: 11px; height: 11px; }

.rw-not-found {
  margin: 8px 0 0;
  padding: 16px;
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  text-align: center;
}
.rw-not-found h4 {
  font-size: 14px; font-weight: 600;
  color: var(--fg1);
  margin: 0 0 4px;
}
.rw-not-found p {
  font-size: 12.5px;
  color: var(--fg2);
  margin: 0 0 12px;
  line-height: 1.4;
}
.rw-not-found p b { color: var(--fg1); }
.rw-create-cta {
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--espresso);
  color: var(--crema-100);
  border: none;
  padding: 12px 14px;
  border-radius: 12px;
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  min-height: 46px;
}
.rw-create-cta:hover { background: var(--espresso-800); }
.rw-create-cta .iconify { width: 15px; height: 15px; }

/* ============ SHEET: DETALLE ============ */
.rw-detail-summary {
  margin: 0 0 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex; align-items: center; gap: 12px;
}
.rw-detail-summary .ico {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: var(--crema-200);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rw-detail-summary .ico .emoji { font-size: 22px; }
.rw-detail-summary .body { flex: 1; min-width: 0; }
.rw-detail-summary .name {
  font-family: var(--font-sans); font-size: 15px; font-weight: 600;
  color: var(--fg1);
}
.rw-detail-summary .meta {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--fg3);
  margin-top: 2px;
}
.rw-search-back {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: var(--crema-200);
  color: var(--fg1);
  border: none;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.rw-search-back:hover { background: var(--border); }
.rw-search-back .iconify { width: 16px; height: 16px; }

.rw-qty-row {
  display: grid;
  grid-template-columns: 1fr 130px;
  gap: 8px;
}
.rw-merma-wrap { position: relative; }
.rw-merma-wrap .rw-input { padding-right: 32px; }
.rw-merma-wrap .pct-suffix {
  position: absolute;
  right: 14px; top: 50%; transform: translateY(-50%);
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 600;
  color: var(--fg3);
  pointer-events: none;
}
.rw-quick-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 8px;
}
.rw-quick-chip {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg2);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 6px 4px;
  cursor: pointer;
  min-height: 32px;
  transition: all var(--dur);
}
.rw-quick-chip:hover { background: var(--crema-100); }
.rw-quick-chip.active {
  background: var(--terracotta);
  color: var(--crema-100);
  border-color: var(--terracotta);
}
.rw-reason-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 8px;
}
.rw-reason-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg2);
  font-family: var(--font-sans);
  font-size: 12px; font-weight: 500;
  padding: 6px 11px;
  border-radius: 999px;
  cursor: pointer;
  transition: all var(--dur);
}
.rw-reason-chip:hover { background: var(--crema-100); }
.rw-reason-chip.active {
  background: var(--oliva-100);
  color: var(--oliva-700);
  border-color: var(--oliva);
}
.rw-preview {
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
}
.rw-preview-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12.5px; color: var(--fg2);
  padding: 3px 0;
}
.rw-preview-row .val { font-family: var(--font-mono); color: var(--fg1); font-weight: 500; }
.rw-preview-row.total {
  margin-top: 6px; padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}
.rw-preview-row.total .lbl { font-weight: 600; color: var(--fg1); }
.rw-preview-row.total .val { color: var(--terracotta-700); font-weight: 700; font-size: 14px; }

/* ============ SHEET: CREAR LITE ============ */
.rw-info-banner {
  margin-top: 4px;
  padding: 12px 14px;
  background: var(--warning-bg);
  border: 1px solid rgba(216, 164, 65, 0.4);
  border-radius: 12px;
  display: flex; gap: 10px;
  align-items: flex-start;
  font-size: 12.5px;
  color: var(--mostaza-700);
  line-height: 1.45;
}
.rw-info-banner .iconify { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
.rw-info-banner b { color: var(--espresso-800); font-weight: 700; }
.rw-create-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 8px;
}
.rw-create-actions .rw-cta-btn { min-height: 48px; }

/* ============ PASO 3 ============ */
.rw3-hero {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(180deg, var(--pure-white) 0%, var(--crema-50) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 12px;
  margin: 0 16px 16px;
  box-shadow: var(--shadow-sm);
}
.rw3-hero .img {
  width: 76px; height: 76px;
  border-radius: 12px;
  background: repeating-linear-gradient(135deg, var(--terracotta-100) 0 6px, var(--crema-200) 6px 12px);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 32px;
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
}
.rw3-hero .body { flex: 1; min-width: 0; }
.rw3-hero .cat {
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--terracotta-700);
  margin-bottom: 2px;
}
.rw3-hero .name {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 22px;
  color: var(--fg1);
  line-height: 1.1;
  letter-spacing: -0.01em;
  margin: 0;
}
.rw3-hero .price {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--fg2);
  margin-top: 4px;
}
.rw3-hero .price b { color: var(--fg1); font-weight: 600; }

.rw3-section { margin: 0 16px 14px; }
.rw3-section h2 {
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  margin: 0 0 8px 4px;
  display: flex; align-items: center; justify-content: space-between;
}
.rw3-section h2 .right {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--fg3);
}
.rw3-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  box-shadow: var(--shadow-xs);
}

.rw3-bd-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-subtle);
}
.rw3-bd-row:last-of-type { border-bottom: none; }
.rw3-bd-row .name {
  font-family: var(--font-sans);
  font-size: 13.5px;
  font-weight: 500;
  color: var(--fg1);
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
}
.rw3-bd-row .name .sub {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
  font-weight: 500;
}
.rw3-bd-row .name .merma-tag {
  display: inline-flex; align-items: center;
  background: var(--mostaza-100);
  color: var(--mostaza-700);
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
}
.rw3-bd-row .val {
  font-family: var(--font-mono);
  font-size: 13.5px;
  color: var(--fg1);
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}
.rw3-bd-row .val .net { color: var(--terracotta-700); font-weight: 600; }
.rw3-bd-row .val .raw {
  display: block;
  font-size: 10.5px;
  color: var(--fg3);
  font-weight: 400;
  text-decoration: line-through;
  margin-top: 1px;
}
.rw3-bd-totals {
  margin-top: 6px;
  padding-top: 12px;
  border-top: 2px solid var(--border);
  display: flex; flex-direction: column; gap: 6px;
}
.rw3-bd-totals .row {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 13px;
  color: var(--fg2);
  font-family: var(--font-sans);
}
.rw3-bd-totals .row .val {
  font-family: var(--font-mono);
  color: var(--fg1);
  font-weight: 500;
}
.rw3-bd-totals .row.merma .val { color: var(--mostaza-700); }
.rw3-bd-totals .row.total {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  font-size: 14px;
}
.rw3-bd-totals .row.total .lbl { font-weight: 700; color: var(--fg1); }
.rw3-bd-totals .row.total .val {
  font-size: 17px;
  font-weight: 700;
  color: var(--terracotta-700);
}

.rw3-margin {
  position: relative;
  padding: 16px;
  border-radius: 16px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  transition: background var(--dur), border-color var(--dur);
}
.rw3-margin::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--margin-tint, transparent);
  opacity: 0.18;
  pointer-events: none;
  transition: background var(--dur);
}
.rw3-margin > * { position: relative; }
.rw3-margin-rows {
  display: flex; flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--fg2);
  font-family: var(--font-sans);
}
.rw3-margin-rows .row { display: flex; justify-content: space-between; align-items: baseline; }
.rw3-margin-rows .row .val {
  font-family: var(--font-mono);
  color: var(--fg1);
  font-weight: 500;
}
.rw3-margin-rows .gain {
  margin-top: 4px; padding-top: 8px;
  border-top: 1px dashed var(--border);
  font-weight: 600;
}
.rw3-margin-rows .gain .val { color: var(--oliva-700); }
.rw3-margin-big {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 2px solid var(--border);
}
.rw3-margin-big .lbl {
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--fg3);
}
.rw3-margin-big .pct {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 56px;
  line-height: 0.9;
  letter-spacing: -0.02em;
  color: var(--margin-color, var(--fg1));
  transition: color var(--dur);
}
.rw3-margin.crit { --margin-color: var(--danger); --margin-tint: var(--danger-bg); border-color: rgba(176, 53, 50, 0.35); }
.rw3-margin.warn { --margin-color: var(--mostaza-700); --margin-tint: var(--mostaza-100); border-color: rgba(216, 164, 65, 0.4); }
.rw3-margin.good { --margin-color: var(--oliva-700); --margin-tint: var(--oliva-100); border-color: rgba(122, 138, 67, 0.4); }
.rw3-status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: var(--font-sans);
  font-size: 11.5px; font-weight: 600;
  margin-top: 12px;
  background: var(--pure-white);
  border: 1px solid currentColor;
  color: var(--margin-color, var(--fg2));
}
.rw3-status-pill .iconify { width: 12px; height: 12px; }

.rw3-adjust h3 {
  font-family: var(--font-serif); font-style: italic; font-weight: 500;
  font-size: 18px;
  color: var(--fg1);
  margin: 0 0 2px;
  letter-spacing: -0.01em;
}
.rw3-adjust .sub {
  font-size: 12.5px;
  color: var(--fg3);
  margin: 0 0 14px;
}
.rw3-slider-row {
  display: flex; align-items: center; gap: 10px;
  margin: 4px 0 8px;
}
.rw3-slider-row .price-input {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 10px;
  height: 40px;
  min-width: 110px;
}
.rw3-slider-row .price-input:focus-within {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
}
.rw3-slider-row .price-input .currency {
  font-family: var(--font-serif);
  font-style: italic;
  color: var(--terracotta-700);
  font-size: 13px;
  font-weight: 500;
}
.rw3-slider-row .price-input input {
  width: 70px;
  border: none; outline: none; background: transparent;
  font-family: var(--font-sans);
  font-size: 18px; font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--fg1);
  text-align: right;
}
.rw3-slider-row .price-input input::-webkit-outer-spin-button,
.rw3-slider-row .price-input input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rw3-slider {
  flex: 1;
  -webkit-appearance: none; appearance: none;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg,
    var(--danger) 0%,
    var(--mostaza) 40%,
    var(--oliva) 100%);
  outline: none;
}
.rw3-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--terracotta);
  border: 3px solid var(--pure-white);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.rw3-slider::-moz-range-thumb {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--terracotta);
  border: 3px solid var(--pure-white);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.rw3-slider-foot {
  display: flex; justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
  margin-bottom: 12px;
}
.rw3-quick-prices {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.rw3-quick-price {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg1);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 8px 4px;
  cursor: pointer;
  min-height: 36px;
  transition: all var(--dur);
}
.rw3-quick-price:hover { background: var(--crema-100); }
.rw3-quick-price.keep {
  background: var(--crema-200);
  border-color: var(--border-strong);
}
.rw3-quick-price.suggest {
  background: var(--oliva-100);
  border-color: var(--oliva);
  color: var(--oliva-700);
}
.rw3-alert {
  display: flex; gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 12px;
  margin-top: 10px;
  font-size: 12.5px;
  line-height: 1.45;
}
.rw3-alert .iconify { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
.rw3-alert.crit { background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(176, 53, 50, 0.25); }
.rw3-alert.warn { background: var(--warning-bg); color: var(--mostaza-700); border: 1px solid rgba(216, 164, 65, 0.3); }
.rw3-alert.good { background: var(--oliva-100); color: var(--oliva-700); border: 1px solid rgba(122, 138, 67, 0.3); }

.rw3-ai {
  background: linear-gradient(135deg, var(--info-bg) 0%, var(--crema-50) 100%);
  border: 1px solid rgba(95, 156, 184, 0.4);
  border-radius: 14px;
  padding: 14px;
  display: flex; gap: 12px;
  align-items: flex-start;
}
.rw3-ai .ico {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: var(--info);
  color: var(--pure-white);
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.rw3-ai .ico .iconify { width: 16px; height: 16px; }
.rw3-ai .body {
  flex: 1; min-width: 0;
  font-size: 13px;
  color: var(--fg1);
  line-height: 1.5;
}
.rw3-ai .body b { color: var(--info); font-weight: 700; }
.rw3-ai .actions {
  display: flex; gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.rw3-ai .actions button {
  background: var(--pure-white);
  border: 1px solid var(--info);
  color: var(--info);
  font-family: var(--font-sans);
  font-size: 12px; font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.rw3-ai .actions button.primary {
  background: var(--info);
  color: var(--pure-white);
}

.rw3-warn-banner {
  background: var(--warning-bg);
  border: 1px solid rgba(216, 164, 65, 0.4);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex; gap: 10px;
  align-items: flex-start;
  font-size: 13px;
  color: var(--mostaza-700);
  line-height: 1.45;
}
.rw3-warn-banner .iconify { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
.rw3-warn-banner .body { flex: 1; }
.rw3-warn-banner b { color: var(--espresso-800); font-weight: 700; }
.rw3-warn-banner a {
  display: inline-block;
  margin-top: 6px;
  background: var(--pure-white);
  border: 1px solid var(--mostaza);
  color: var(--mostaza-700);
  font-family: var(--font-sans);
  font-size: 12px; font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  text-decoration: none;
}

/* ============ DISCARD + SAVING ============ */
.rw-discard-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.45);
  z-index: 60;
  animation: rwFadeIn 180ms var(--ease-standard);
}
@keyframes rwFadeIn { from { opacity: 0; } to { opacity: 1; } }
.rw-discard {
  position: fixed; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 40px);
  max-width: 320px;
  z-index: 61;
  background: var(--crema-100);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  animation: rwPopIn 200ms var(--ease-emphasis);
}
@keyframes rwPopIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.rw-discard-ico {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--danger-bg);
  color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 10px;
}
.rw-discard-ico .iconify { width: 22px; height: 22px; }
.rw-discard h3 {
  font-family: var(--font-sans);
  font-size: 17px; font-weight: 600;
  margin: 0 0 4px;
  color: var(--fg1);
}
.rw-discard p {
  font-size: 13px; color: var(--fg2);
  margin: 0 0 16px; line-height: 1.45;
}
.rw-discard-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.rw-discard-actions .btn { width: 100%; justify-content: center; min-height: 44px; }

.rw3-saving {
  position: fixed; inset: 0;
  z-index: 70;
  background: rgba(243, 237, 228, 0.96);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px;
}
.rw3-saving .spinner {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 3px solid var(--terracotta-100);
  border-top-color: var(--terracotta);
  animation: rw3Spin 720ms linear infinite;
}
.rw3-saving p {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 18px;
  color: var(--fg1);
  margin: 0;
}
@keyframes rw3Spin { to { transform: rotate(360deg); } }
</style>
