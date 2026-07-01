<script setup lang="ts">
import type {
  PreviewData,
  PreviewMenuItem,
  PreviewIngredient,
  CommitPayload,
} from '~/composables/use-smart-import'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Importar carta e insumos — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()

// RBAC: owner/manager only (backend also enforces it; we gate the UI proactively).
const canManage = computed(() =>
  user.value?.role === 'owner' || user.value?.role === 'manager',
)

// ---------------------------------------------------------------------------
// Phase management
// ---------------------------------------------------------------------------

/**
 * Wizard phases:
 * - upload    : waiting for the user to pick/drop a file
 * - extracting: AI preview request in flight (file sent to backend)
 * - review    : preview data shown; user edits rows
 * - done      : commit completed; success summary shown
 */
type Phase = 'upload' | 'extracting' | 'review' | 'done'
const phase = ref<Phase>('upload')

// True while the commit request is in flight (the review step stays visible).
const isCommitting = ref(false)

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const previewMutation = useSmartImportPreview()
const commitMutation = useSmartImportCommit()

// ---------------------------------------------------------------------------
// File input / drag-and-drop
// ---------------------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const pickedFileName = ref('')
const previewProvider = ref('')
const previewSource = ref<PreviewData['source']>(null)

/** Opens the native file picker. */
function openFilePicker(): void {
  fileInput.value?.click()
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e: DragEvent): void {
  // Only clear when leaving the zone itself, not a child element.
  const target = e.currentTarget as HTMLElement
  if (!target.contains(e.relatedTarget as Node | null)) {
    isDragging.value = false
  }
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void handleFile(file)
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so selecting the same file twice fires the change event again.
  input.value = ''
  if (file) void handleFile(file)
}

// ---------------------------------------------------------------------------
// Review state — editable copies of the preview data
// ---------------------------------------------------------------------------

/**
 * Menu item being edited in the review table.
 * `_key` is a stable client-side identifier so v-for works correctly when
 * the user removes rows (prevents index-key mismatches on deletion).
 */
interface EditableMenuItem extends PreviewMenuItem {
  _key: number
}

/** Ingredient being edited in the review table. */
interface EditableIngredient extends PreviewIngredient {
  _key: number
}

let _keySeq = 0
const reviewMenuItems = ref<EditableMenuItem[]>([])
const reviewIngredients = ref<EditableIngredient[]>([])
const commitResult = ref<{
  created: { menuItems: number; ingredients: number; categories: number }
  skipped: string[]
} | null>(null)

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Per-row validation errors for menu items (index-aligned with reviewMenuItems). */
const menuItemErrors = computed(() =>
  reviewMenuItems.value.map(item => ({
    name: !item.name.trim() ? 'Requerido' : null,
    price: (isNaN(item.price) || item.price < 0) ? 'Precio inválido (≥ 0)' : null,
  })),
)

/** Per-row validation errors for ingredients (index-aligned with reviewIngredients). */
const ingredientErrors = computed(() =>
  reviewIngredients.value.map(item => ({
    name: !item.name.trim() ? 'Requerido' : null,
    estimatedCost:
      item.estimatedCost != null && (isNaN(Number(item.estimatedCost)) || Number(item.estimatedCost) < 0)
        ? 'Costo inválido (≥ 0)'
        : null,
  })),
)

/** True if any editable row has a validation error. */
const hasValidationErrors = computed(
  () =>
    menuItemErrors.value.some(e => e.name || e.price)
    || ingredientErrors.value.some(e => e.name || e.estimatedCost),
)

/** True if there is nothing left to import (user removed all rows). */
const isEmpty = computed(
  () => reviewMenuItems.value.length === 0 && reviewIngredients.value.length === 0,
)

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain', // some OS report .csv as text/plain
])
const ACCEPTED_EXT = /\.(pdf|xlsx|xls|csv)$/i
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Entry point for both drag-and-drop and file-picker flows.
 * 1. Validates the file (type, size).
 * 2. Sends it to the BFF preview endpoint.
 * 3. Populates the review state with the AI-extracted items.
 */
async function handleFile(file: File): Promise<void> {
  // Client-side guard: reject clearly unsupported file types before upload.
  if (!ACCEPTED_MIME.has(file.type) && !ACCEPTED_EXT.test(file.name)) {
    toast.add({
      title: 'Formato no compatible',
      description: 'Usá un archivo PDF, Excel (.xlsx) o CSV.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
    return
  }
  if (file.size > MAX_BYTES) {
    toast.add({
      title: 'Archivo demasiado grande',
      description: 'El archivo no puede superar los 10 MB.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
    return
  }

  pickedFileName.value = file.name
  phase.value = 'extracting'

  let data: PreviewData
  try {
    data = await previewMutation.mutateAsync(file)
  }
  catch (err) {
    phase.value = 'upload'
    const e = err as { statusMessage?: string; data?: { message?: string } }
    toast.add({
      title: 'No se pudo procesar el archivo',
      description:
        e?.data?.message
        ?? e?.statusMessage
        ?? 'Verificá que el archivo tenga el formato correcto y no esté vacío.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
    return
  }

  // Populate editable review state from the AI result.
  previewProvider.value = data.provider ?? ''
  previewSource.value = data.source ?? null

  reviewMenuItems.value = (data.menuItems ?? []).map(item => ({
    ...item,
    _key: ++_keySeq,
    name: item.name ?? '',
    price: item.price ?? 0,
    category: item.category ?? '',
    description: item.description ?? '',
  }))

  reviewIngredients.value = (data.ingredients ?? []).map(item => ({
    ...item,
    _key: ++_keySeq,
    name: item.name ?? '',
    unit: item.unit ?? '',
    estimatedCost: item.estimatedCost ?? null,
  }))

  phase.value = 'review'
}

/** Removes a menu item row from the review table. */
function removeMenuItem(key: number): void {
  reviewMenuItems.value = reviewMenuItems.value.filter(i => i._key !== key)
}

/** Removes an ingredient row from the review table. */
function removeIngredient(key: number): void {
  reviewIngredients.value = reviewIngredients.value.filter(i => i._key !== key)
}

/** Updates a menu item's numeric price from the input event. */
function onMenuItemPriceChange(item: EditableMenuItem, e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  item.price = raw === '' ? NaN : parseFloat(raw)
}

/** Updates an ingredient's numeric estimatedCost from the input event. */
function onIngredientCostChange(item: EditableIngredient, e: Event): void {
  const raw = (e.target as HTMLInputElement).value
  item.estimatedCost = raw === '' ? null : parseFloat(raw)
}

/**
 * Resets the wizard to the upload step, clearing all review state.
 * Called from the "Cancelar" button in the review phase.
 */
function cancelReview(): void {
  phase.value = 'upload'
  reviewMenuItems.value = []
  reviewIngredients.value = []
  previewProvider.value = ''
  pickedFileName.value = ''
}

/**
 * Builds the commit payload from the current (user-edited) review state
 * and sends it to the backend. Transitions to 'done' on success.
 * Validation runs first; if there are errors the commit is blocked.
 */
async function confirmImport(): Promise<void> {
  if (hasValidationErrors.value || isEmpty.value || isCommitting.value) return

  const payload: CommitPayload = {
    menuItems: reviewMenuItems.value.map(({ _key: _k, ...rest }) => ({
      name: rest.name.trim(),
      price: Number(rest.price),
      category: rest.category?.trim() || null,
      description: rest.description?.trim() || null,
    })),
    ingredients: reviewIngredients.value.map(({ _key: _k, ...rest }) => ({
      name: rest.name.trim(),
      unit: rest.unit?.trim() || null,
      estimatedCost:
        rest.estimatedCost != null && !isNaN(Number(rest.estimatedCost))
          ? Number(rest.estimatedCost)
          : null,
    })),
  }

  isCommitting.value = true
  try {
    const result = await commitMutation.mutateAsync(payload)
    commitResult.value = result
    phase.value = 'done'
  }
  catch (err) {
    const e = err as { statusMessage?: string; data?: { message?: string } }
    toast.add({
      title: 'Error al guardar los datos',
      description: e?.data?.message ?? e?.statusMessage ?? 'Intentá de nuevo.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
  finally {
    isCommitting.value = false
  }
}

/** Navigates to the recipes catalog after a successful import. */
function goToRecipes(): void {
  void navigateTo('/app/recetas')
}

/** Navigates to the ingredients list after a successful import. */
function goToIngredients(): void {
  void navigateTo('/app/inventario')
}

/** Resets the entire wizard so the user can import another file. */
function startOver(): void {
  phase.value = 'upload'
  reviewMenuItems.value = []
  reviewIngredients.value = []
  commitResult.value = null
  previewProvider.value = ''
  pickedFileName.value = ''
}
</script>

<template>
  <div class="ic-page">
    <UiScreenHeader
      title="Importar carta e insumos"
      :subtitle="
        phase === 'extracting' ? 'Procesando con IA...'
        : phase === 'review' ? `${reviewMenuItems.length} platos · ${reviewIngredients.length} insumos`
        : phase === 'done' ? 'Importación completa'
        : 'Subí tu menú o lista de insumos'
      "
      back="/app/datos/importar"
    />

    <!-- ================================================================
         RBAC guard — staff cannot use this feature
         ================================================================ -->
    <template v-if="!canManage">
      <div class="ic-card" style="margin: 24px 20px;">
        <UiEmptyState
          icon="i-lucide-lock"
          title="Acceso restringido"
          subtitle="La importación con IA está disponible solo para propietarios y gerentes."
        />
      </div>
    </template>

    <template v-else>

      <!-- ================================================================
           Step indicator
           ================================================================ -->
      <nav class="ic-steps" aria-label="Pasos del asistente">
        <div
          v-for="(label, i) in ['Subir', 'Procesar', 'Revisar', 'Listo']"
          :key="label"
          class="ic-step"
          :class="{
            'is-active': (phase === 'upload' && i === 0)
              || (phase === 'extracting' && i === 1)
              || (phase === 'review' && i === 2)
              || (phase === 'done' && i === 3),
            'is-done': (phase === 'extracting' && i < 1)
              || (phase === 'review' && i < 2)
              || (phase === 'done' && i < 3),
          }"
          :aria-current="
            (phase === 'upload' && i === 0)
            || (phase === 'extracting' && i === 1)
            || (phase === 'review' && i === 2)
            || (phase === 'done' && i === 3)
              ? 'step'
              : undefined
          "
        >
          <span class="ic-step-dot" aria-hidden="true" />
          <span class="ic-step-label">{{ label }}</span>
        </div>
      </nav>

      <!-- ================================================================
           Phase 1: Upload
           ================================================================ -->
      <section
        v-if="phase === 'upload'"
        aria-labelledby="ic-upload-head"
      >
        <div class="ic-section-head" id="ic-upload-head">
          Tu carta o lista de insumos
        </div>

        <!-- Drag-and-drop zone -->
        <div
          class="ic-drop-zone"
          :class="{ 'is-dragging': isDragging }"
          role="button"
          tabindex="0"
          aria-label="Zona para arrastrar o seleccionar un archivo"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="openFilePicker"
          @keydown.enter.space.prevent="openFilePicker"
        >
          <span class="ic-drop-icon" aria-hidden="true">
            <UIcon name="i-lucide-upload-cloud" />
          </span>
          <p class="ic-drop-title">
            {{ isDragging ? 'Soltá el archivo aquí' : 'Arrastrá tu archivo aquí' }}
          </p>
          <p class="ic-drop-sub">
            o hacé clic para seleccionarlo
          </p>
          <div class="ic-drop-formats" aria-label="Formatos aceptados">
            <span class="ic-fmt-pill">PDF</span>
            <span class="ic-fmt-pill">Excel</span>
            <span class="ic-fmt-pill">CSV</span>
          </div>
          <p class="ic-drop-limit">Hasta 10 MB</p>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          class="ic-file-input"
          aria-hidden="true"
          tabindex="-1"
          @change="onFileInputChange"
        >

        <!-- Explainer -->
        <div class="ic-explainer">
          <UIcon name="i-lucide-info" aria-hidden="true" />
          <p>
            Subí tu carta en PDF o Excel, o una lista de insumos en CSV.
            La IA extrae los platos, precios e insumos para que no cargues todo a mano.
            Revisás antes de confirmar — nada se guarda hasta que aceptés.
          </p>
        </div>
      </section>

      <!-- ================================================================
           Phase 2: Extracting (AI processing)
           ================================================================ -->
      <section
        v-else-if="phase === 'extracting'"
        class="ic-processing"
        aria-live="polite"
        aria-label="Procesando documento con IA"
      >
        <span class="ic-proc-icon" aria-hidden="true">
          <UIcon name="i-lucide-scan-line" class="ic-proc-spin" />
        </span>
        <p class="ic-proc-title">Leyendo tu documento con IA…</p>
        <p class="ic-proc-sub">Esto toma unos segundos. No cierres la pantalla.</p>
        <div class="ic-proc-file">
          <UIcon name="i-lucide-file" aria-hidden="true" />
          <span>{{ pickedFileName }}</span>
        </div>
      </section>

      <!-- ================================================================
           Phase 3: Review
           ================================================================ -->
      <section
        v-else-if="phase === 'review'"
        aria-labelledby="ic-review-head"
      >
        <!-- Source / provider info -->
        <div class="ic-meta-bar">
          <span class="ic-meta-file">
            <UIcon name="i-lucide-file-check" aria-hidden="true" />
            {{ pickedFileName }}
          </span>
          <span class="ic-provider-badge" :title="`Extracción realizada por ${previewProvider}`">
            <UIcon name="i-lucide-sparkles" aria-hidden="true" />
            extraído con {{ previewProvider || 'IA' }}
          </span>
        </div>

        <p class="ic-review-notice" role="status">
          Revisá los datos antes de confirmar.
          Podés editar o eliminar filas. <strong>Nada se guarda hasta que confirmes.</strong>
        </p>

        <!-- Validation error summary -->
        <div v-if="hasValidationErrors" class="ic-error-banner" role="alert">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" />
          <span>Corregí los campos marcados en rojo antes de confirmar.</span>
        </div>

        <!-- ---- Menu items table ---- -->
        <div class="ic-subsection">
          <h2 id="ic-review-head" class="ic-subsection-head">
            Platos del menú
            <span class="ic-count">{{ reviewMenuItems.length }}</span>
          </h2>

          <div
            v-if="reviewMenuItems.length === 0"
            class="ic-card ic-empty-table"
          >
            <UiEmptyState
              icon="i-lucide-utensils"
              title="Sin platos extraídos"
              subtitle="No se detectaron platos en el documento."
            />
          </div>

          <div v-else class="ic-card ic-table-card" role="table" aria-label="Platos del menú">
            <!-- Header row (hidden on small screens via clip) -->
            <div class="ic-table-head" role="row" aria-hidden="true">
              <span>Nombre</span>
              <span>Precio (S/)</span>
              <span>Categoría</span>
              <span />
            </div>

            <div
              v-for="(item, idx) in reviewMenuItems"
              :key="item._key"
              class="ic-table-row"
              role="row"
            >
              <div class="ic-cell ic-cell-name" role="cell">
                <label :for="`mi-name-${item._key}`" class="ic-sr-only">Nombre del plato</label>
                <input
                  :id="`mi-name-${item._key}`"
                  v-model="item.name"
                  type="text"
                  class="ic-input"
                  :class="{ 'is-error': menuItemErrors[idx]?.name }"
                  placeholder="Nombre del plato"
                  :aria-invalid="!!menuItemErrors[idx]?.name"
                  :aria-describedby="menuItemErrors[idx]?.name ? `mi-name-err-${item._key}` : undefined"
                >
                <span
                  v-if="menuItemErrors[idx]?.name"
                  :id="`mi-name-err-${item._key}`"
                  class="ic-field-err"
                  role="alert"
                >{{ menuItemErrors[idx].name }}</span>
              </div>

              <div class="ic-cell ic-cell-price" role="cell">
                <label :for="`mi-price-${item._key}`" class="ic-sr-only">Precio en soles</label>
                <div class="ic-price-wrap">
                  <span class="ic-currency" aria-hidden="true">S/</span>
                  <input
                    :id="`mi-price-${item._key}`"
                    type="number"
                    min="0"
                    step="0.01"
                    class="ic-input ic-input-num"
                    :class="{ 'is-error': menuItemErrors[idx]?.price }"
                    :value="isNaN(item.price) ? '' : item.price"
                    placeholder="0.00"
                    :aria-invalid="!!menuItemErrors[idx]?.price"
                    :aria-describedby="menuItemErrors[idx]?.price ? `mi-price-err-${item._key}` : undefined"
                    @change="onMenuItemPriceChange(item, $event)"
                  >
                </div>
                <span
                  v-if="menuItemErrors[idx]?.price"
                  :id="`mi-price-err-${item._key}`"
                  class="ic-field-err"
                  role="alert"
                >{{ menuItemErrors[idx].price }}</span>
              </div>

              <div class="ic-cell ic-cell-cat" role="cell">
                <label :for="`mi-cat-${item._key}`" class="ic-sr-only">Categoría</label>
                <input
                  :id="`mi-cat-${item._key}`"
                  v-model="item.category"
                  type="text"
                  class="ic-input"
                  placeholder="Categoría"
                >
              </div>

              <div class="ic-cell ic-cell-del" role="cell">
                <button
                  type="button"
                  class="ic-del-btn"
                  :aria-label="`Eliminar plato ${item.name || idx + 1}`"
                  @click="removeMenuItem(item._key)"
                >
                  <UIcon name="i-lucide-trash-2" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ---- Ingredients table ---- -->
        <div class="ic-subsection">
          <h2 class="ic-subsection-head">
            Insumos
            <span class="ic-count">{{ reviewIngredients.length }}</span>
          </h2>

          <div
            v-if="reviewIngredients.length === 0"
            class="ic-card ic-empty-table"
          >
            <UiEmptyState
              icon="i-lucide-package"
              title="Sin insumos extraídos"
              subtitle="No se detectaron insumos en el documento."
            />
          </div>

          <div v-else class="ic-card ic-table-card" role="table" aria-label="Insumos">
            <div class="ic-table-head ic-table-head-ing" role="row" aria-hidden="true">
              <span>Nombre</span>
              <span>Unidad</span>
              <span>Costo est. (S/)</span>
              <span />
            </div>

            <div
              v-for="(item, idx) in reviewIngredients"
              :key="item._key"
              class="ic-table-row ic-table-row-ing"
              role="row"
            >
              <div class="ic-cell ic-cell-name" role="cell">
                <label :for="`ing-name-${item._key}`" class="ic-sr-only">Nombre del insumo</label>
                <input
                  :id="`ing-name-${item._key}`"
                  v-model="item.name"
                  type="text"
                  class="ic-input"
                  :class="{ 'is-error': ingredientErrors[idx]?.name }"
                  placeholder="Nombre del insumo"
                  :aria-invalid="!!ingredientErrors[idx]?.name"
                  :aria-describedby="ingredientErrors[idx]?.name ? `ing-name-err-${item._key}` : undefined"
                >
                <span
                  v-if="ingredientErrors[idx]?.name"
                  :id="`ing-name-err-${item._key}`"
                  class="ic-field-err"
                  role="alert"
                >{{ ingredientErrors[idx].name }}</span>
              </div>

              <div class="ic-cell ic-cell-unit" role="cell">
                <label :for="`ing-unit-${item._key}`" class="ic-sr-only">Unidad de medida</label>
                <input
                  :id="`ing-unit-${item._key}`"
                  v-model="item.unit"
                  type="text"
                  class="ic-input"
                  placeholder="kg, L, u…"
                >
              </div>

              <div class="ic-cell ic-cell-cost" role="cell">
                <label :for="`ing-cost-${item._key}`" class="ic-sr-only">Costo estimado en soles</label>
                <div class="ic-price-wrap">
                  <span class="ic-currency" aria-hidden="true">S/</span>
                  <input
                    :id="`ing-cost-${item._key}`"
                    type="number"
                    min="0"
                    step="0.01"
                    class="ic-input ic-input-num"
                    :class="{ 'is-error': ingredientErrors[idx]?.estimatedCost }"
                    :value="item.estimatedCost ?? ''"
                    placeholder="0.00"
                    :aria-invalid="!!ingredientErrors[idx]?.estimatedCost"
                    :aria-describedby="ingredientErrors[idx]?.estimatedCost ? `ing-cost-err-${item._key}` : undefined"
                    @change="onIngredientCostChange(item, $event)"
                  >
                </div>
                <span
                  v-if="ingredientErrors[idx]?.estimatedCost"
                  :id="`ing-cost-err-${item._key}`"
                  class="ic-field-err"
                  role="alert"
                >{{ ingredientErrors[idx].estimatedCost }}</span>
              </div>

              <div class="ic-cell ic-cell-del" role="cell">
                <button
                  type="button"
                  class="ic-del-btn"
                  :aria-label="`Eliminar insumo ${item.name || idx + 1}`"
                  @click="removeIngredient(item._key)"
                >
                  <UIcon name="i-lucide-trash-2" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty state when user removed everything -->
        <div v-if="isEmpty" class="ic-empty-warning" role="alert">
          <UIcon name="i-lucide-alert-circle" aria-hidden="true" />
          <span>Eliminaste todos los elementos. No hay nada para importar.</span>
        </div>

        <!-- Actions -->
        <div class="ic-review-actions">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="isCommitting"
            @click="cancelReview"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="hasValidationErrors || isEmpty || isCommitting"
            :aria-busy="isCommitting"
            @click="confirmImport"
          >
            <UIcon
              :name="isCommitting ? 'i-lucide-loader-2' : 'i-lucide-check'"
              :class="{ 'ic-spin': isCommitting }"
              aria-hidden="true"
            />
            {{ isCommitting ? 'Guardando…' : 'Confirmar importación' }}
          </button>
        </div>
      </section>

      <!-- ================================================================
           Phase 4: Done
           ================================================================ -->
      <section
        v-else-if="phase === 'done'"
        class="ic-done"
        aria-labelledby="ic-done-head"
      >
        <span class="ic-done-icon" aria-hidden="true">
          <UIcon name="i-lucide-check-circle-2" />
        </span>
        <h2 id="ic-done-head" class="ic-done-title">
          Importación completa
        </h2>
        <p class="ic-done-sub">
          Los datos ya están disponibles en tu cuenta.
        </p>

        <!-- Created counts -->
        <div class="ic-done-stats" role="list" aria-label="Resumen de importación">
          <div class="ic-done-stat" role="listitem">
            <span class="ic-done-num">{{ commitResult?.created.menuItems ?? 0 }}</span>
            <span class="ic-done-label">platos creados</span>
          </div>
          <div class="ic-done-stat" role="listitem">
            <span class="ic-done-num">{{ commitResult?.created.ingredients ?? 0 }}</span>
            <span class="ic-done-label">insumos creados</span>
          </div>
          <div class="ic-done-stat" role="listitem">
            <span class="ic-done-num">{{ commitResult?.created.categories ?? 0 }}</span>
            <span class="ic-done-label">categorías creadas</span>
          </div>
        </div>

        <!-- Skipped items (already existed) -->
        <div
          v-if="commitResult?.skipped.length"
          class="ic-done-skipped"
          aria-label="Elementos omitidos por duplicado"
        >
          <p class="ic-done-skipped-label">
            <UIcon name="i-lucide-info" aria-hidden="true" />
            {{ commitResult.skipped.length }}
            elemento{{ commitResult.skipped.length === 1 ? '' : 's' }}
            ya existía{{ commitResult.skipped.length === 1 ? '' : 'n' }} y
            {{ commitResult.skipped.length === 1 ? 'fue omitido' : 'fueron omitidos' }}:
          </p>
          <ul class="ic-done-skipped-list">
            <li
              v-for="name in commitResult.skipped.slice(0, 8)"
              :key="name"
            >
              {{ name }}
            </li>
            <li
              v-if="commitResult.skipped.length > 8"
              class="ic-done-skipped-more"
            >
              +{{ commitResult.skipped.length - 8 }} más
            </li>
          </ul>
        </div>

        <!-- Navigation actions -->
        <div class="ic-done-actions">
          <button type="button" class="btn btn-ghost" @click="goToIngredients">
            <UIcon name="i-lucide-package" aria-hidden="true" />
            Ver insumos
          </button>
          <button type="button" class="btn btn-primary" @click="goToRecipes">
            <UIcon name="i-lucide-utensils" aria-hidden="true" />
            Ver recetas
          </button>
        </div>
        <button type="button" class="ic-start-over" @click="startOver">
          <UIcon name="i-lucide-rotate-ccw" aria-hidden="true" />
          Importar otro archivo
        </button>
      </section>

    </template>
  </div>
</template>

<style scoped>
/* ------------------------------------------------------------------ */
/* Page shell                                                           */
/* ------------------------------------------------------------------ */
.ic-page {
  max-width: 600px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  padding-bottom: 48px;
}
@media (min-width: 1024px) {
  .ic-page { padding-top: 28px; }
}

/* ------------------------------------------------------------------ */
/* Step indicator                                                       */
/* ------------------------------------------------------------------ */
.ic-steps {
  display: flex;
  align-items: center;
  margin: 16px 20px 0;
  gap: 0;
}
.ic-step {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  position: relative;
}
/* Connector line between steps */
.ic-step:not(:last-child)::after {
  content: '';
  display: block;
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
  margin: 0 6px;
  transition: background var(--dur);
}
.ic-step.is-done:not(:last-child)::after,
.ic-step.is-active:not(:last-child)::after {
  background: var(--terracotta-300);
}
.ic-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
  transition: background var(--dur), transform var(--dur);
}
.ic-step.is-done .ic-step-dot { background: var(--terracotta-300); }
.ic-step.is-active .ic-step-dot {
  background: var(--terracotta);
  transform: scale(1.4);
}
.ic-step-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--fg3);
  letter-spacing: 0.04em;
  white-space: nowrap;
  transition: color var(--dur);
}
.ic-step.is-active .ic-step-label { color: var(--terracotta-700); }
.ic-step.is-done .ic-step-label { color: var(--fg2); }

/* ------------------------------------------------------------------ */
/* Section heading                                                      */
/* ------------------------------------------------------------------ */
.ic-section-head {
  padding: 20px 20px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--terracotta-700);
}

/* ------------------------------------------------------------------ */
/* Shared card                                                          */
/* ------------------------------------------------------------------ */
.ic-card {
  margin: 0 20px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-xs);
}

/* ------------------------------------------------------------------ */
/* Upload — drop zone                                                   */
/* ------------------------------------------------------------------ */
.ic-drop-zone {
  margin: 0 20px;
  padding: 36px 20px 28px;
  border: 2px dashed var(--border);
  border-radius: 16px;
  background: var(--crema-100);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  cursor: pointer;
  transition:
    border-color var(--dur),
    background var(--dur),
    box-shadow var(--dur);
  outline: none;
}
.ic-drop-zone:hover,
.ic-drop-zone:focus-visible {
  border-color: var(--terracotta-300);
  background: var(--pure-white);
  box-shadow: var(--focus-ring);
}
.ic-drop-zone.is-dragging {
  border-color: var(--terracotta);
  background: var(--terracotta-100);
  box-shadow: 0 0 0 4px rgba(201, 106, 67, 0.12);
}
.ic-drop-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--crema-200);
  color: var(--terracotta-700);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  transition: background var(--dur), color var(--dur);
}
.ic-drop-zone.is-dragging .ic-drop-icon {
  background: var(--terracotta-100);
  color: var(--terracotta);
}
.ic-drop-icon .iconify { width: 26px; height: 26px; }
.ic-drop-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--fg1);
  margin: 0;
  letter-spacing: -0.01em;
}
.ic-drop-sub {
  font-size: 12.5px;
  color: var(--fg3);
  margin: 0;
}
.ic-drop-formats {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.ic-fmt-pill {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--terracotta-700);
  background: var(--terracotta-100);
  padding: 3px 8px;
  border-radius: 999px;
}
.ic-drop-limit {
  font-size: 11px;
  color: var(--fg3);
  margin: 0;
}
.ic-file-input { display: none; }

/* ------------------------------------------------------------------ */
/* Explainer                                                            */
/* ------------------------------------------------------------------ */
.ic-explainer {
  margin: 14px 20px 0;
  padding: 12px 14px;
  background: var(--crema-100);
  border: 1px dashed var(--terracotta-300);
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12.5px;
  color: var(--fg2);
  line-height: 1.5;
}
.ic-explainer .iconify {
  width: 15px;
  height: 15px;
  color: var(--terracotta-700);
  flex-shrink: 0;
  margin-top: 1px;
}
.ic-explainer p { margin: 0; }

/* ------------------------------------------------------------------ */
/* Processing                                                           */
/* ------------------------------------------------------------------ */
.ic-processing {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px 32px;
  gap: 8px;
}
.ic-proc-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--crema-200);
  color: var(--terracotta-700);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.ic-proc-icon .iconify { width: 30px; height: 30px; }
.ic-proc-spin { animation: icSpin 1.4s linear infinite; }
@keyframes icSpin { to { transform: rotate(360deg); } }
.ic-proc-title {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 20px;
  font-weight: 500;
  color: var(--fg1);
  margin: 0;
}
.ic-proc-sub {
  font-size: 13px;
  color: var(--fg2);
  margin: 0;
}
.ic-proc-file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 12px;
  background: var(--crema-200);
  border-radius: 8px;
  font-size: 12px;
  color: var(--fg2);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ic-proc-file .iconify { width: 13px; height: 13px; flex-shrink: 0; }

/* ------------------------------------------------------------------ */
/* Review — meta bar                                                    */
/* ------------------------------------------------------------------ */
.ic-meta-bar {
  margin: 16px 20px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ic-meta-file {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--fg2);
  font-weight: 500;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ic-meta-file .iconify { width: 13px; height: 13px; color: var(--oliva-700); flex-shrink: 0; }

.ic-provider-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg2);
  background: var(--crema-200);
  border: 1px solid var(--border-subtle);
  padding: 3px 8px;
  border-radius: 999px;
  margin-left: auto;
}
.ic-provider-badge .iconify { width: 10px; height: 10px; color: var(--terracotta-700); }

/* ------------------------------------------------------------------ */
/* Review — notices                                                     */
/* ------------------------------------------------------------------ */
.ic-review-notice {
  margin: 0 20px 12px;
  padding: 10px 14px;
  background: var(--crema-100);
  border: 1px dashed var(--border);
  border-radius: 10px;
  font-size: 12.5px;
  color: var(--fg2);
  line-height: 1.45;
}
.ic-review-notice strong { color: var(--fg1); }

.ic-error-banner {
  margin: 0 20px 12px;
  padding: 10px 14px;
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  border-radius: 10px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: var(--danger);
  font-weight: 600;
  line-height: 1.4;
}
.ic-error-banner .iconify { width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; }

.ic-empty-warning {
  margin: 16px 20px;
  padding: 12px 14px;
  background: var(--warning-bg);
  border: 1px solid var(--warning);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--mostaza-700);
  font-weight: 500;
}
.ic-empty-warning .iconify { width: 16px; height: 16px; flex-shrink: 0; }

/* ------------------------------------------------------------------ */
/* Review — subsections                                                 */
/* ------------------------------------------------------------------ */
.ic-subsection { margin-top: 20px; }
.ic-subsection-head {
  padding: 0 20px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--terracotta-700);
  display: flex;
  align-items: center;
  gap: 8px;
}
.ic-count {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--pure-white);
  background: var(--terracotta);
  padding: 1px 6px;
  border-radius: 999px;
  letter-spacing: 0;
  text-transform: none;
}
.ic-empty-table { padding: 4px 0; }

/* ------------------------------------------------------------------ */
/* Review — editable table                                              */
/* ------------------------------------------------------------------ */
.ic-table-card { overflow: hidden; }

.ic-table-head {
  display: none; /* Visually hidden on mobile; shown on wider viewports */
}

.ic-table-row {
  display: grid;
  /* Mobile-first: name full width, then price+unit+delete */
  grid-template-columns: 1fr 1fr auto;
  grid-template-rows: auto auto;
  gap: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.ic-table-row:last-child { border-bottom: none; }

/* Layout mapping for 3-column mobile grid (name spans full row) */
.ic-cell-name { grid-column: 1 / -1; }

/* Price in col 1, category/unit in col 2, delete in col 3 */
.ic-cell-price { grid-column: 1; }
.ic-cell-cat  { grid-column: 2; }
.ic-cell-cost { grid-column: 2; }
.ic-cell-unit { grid-column: 1; }
.ic-cell-del  { grid-column: 3; display: flex; align-items: flex-start; padding-top: 4px; }

@media (min-width: 520px) {
  .ic-table-head {
    display: grid;
    grid-template-columns: 1fr 110px 110px 40px;
    padding: 8px 12px 6px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--crema-100);
  }
  .ic-table-head-ing {
    grid-template-columns: 1fr 90px 110px 40px;
  }
  .ic-table-head span {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg3);
  }

  .ic-table-row {
    grid-template-columns: 1fr 110px 110px 40px;
    grid-template-rows: auto;
    align-items: start;
    padding: 8px 12px;
  }
  .ic-table-row-ing {
    grid-template-columns: 1fr 90px 110px 40px;
  }
  .ic-cell-name  { grid-column: 1; }
  .ic-cell-price { grid-column: 2; }
  .ic-cell-cat   { grid-column: 3; }
  .ic-cell-unit  { grid-column: 2; }
  .ic-cell-cost  { grid-column: 3; }
  .ic-cell-del   { grid-column: 4; }
}

.ic-cell {
  padding: 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                               */
/* ------------------------------------------------------------------ */
.ic-input {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--pure-white);
  color: var(--fg1);
  font: inherit;
  font-size: 13px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
  min-width: 0; /* Prevent overflow in grid */
}
.ic-input:focus-visible {
  outline: none;
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
}
.ic-input.is-error {
  border-color: var(--danger);
}
.ic-input.is-error:focus-visible {
  box-shadow: 0 0 0 3px rgba(179, 58, 42, 0.20);
}
.ic-input-num {
  /* number inputs: hide spin arrows (only keep for small semantic hint) */
  -moz-appearance: textfield;
}
.ic-input-num::-webkit-inner-spin-button,
.ic-input-num::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.ic-price-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.ic-currency {
  position: absolute;
  left: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg3);
  pointer-events: none;
  user-select: none;
}
.ic-price-wrap .ic-input {
  padding-left: 22px;
}

.ic-field-err {
  font-size: 10.5px;
  color: var(--danger);
  font-weight: 600;
  line-height: 1.2;
}

/* ------------------------------------------------------------------ */
/* Delete button                                                        */
/* ------------------------------------------------------------------ */
.ic-del-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--fg3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
  flex-shrink: 0;
}
.ic-del-btn:hover {
  background: var(--danger-bg);
  border-color: var(--danger);
  color: var(--danger);
}
.ic-del-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(179, 58, 42, 0.20);
  border-color: var(--danger);
}
.ic-del-btn .iconify { width: 14px; height: 14px; }

/* ------------------------------------------------------------------ */
/* Review — action bar                                                  */
/* ------------------------------------------------------------------ */
.ic-review-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 20px 20px 0;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

/* ------------------------------------------------------------------ */
/* Done / success                                                       */
/* ------------------------------------------------------------------ */
.ic-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 24px 0;
  gap: 6px;
}
.ic-done-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--oliva-100);
  color: var(--oliva-700);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  animation: icPopBig 440ms var(--ease-emphasis) both;
}
@keyframes icPopBig {
  0% { transform: scale(0.5); opacity: 0; }
  65% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}
.ic-done-icon .iconify { width: 30px; height: 30px; }
.ic-done-title {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 24px;
  font-weight: 500;
  color: var(--fg1);
  margin: 0;
}
.ic-done-sub {
  font-size: 13.5px;
  color: var(--fg2);
  margin: 0 0 12px;
}

.ic-done-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  max-width: 420px;
  margin: 8px 0;
}
.ic-done-stat {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.ic-done-num {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.ic-done-label {
  font-size: 11px;
  color: var(--fg3);
  text-align: center;
  line-height: 1.3;
}

.ic-done-skipped {
  width: 100%;
  max-width: 420px;
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 14px;
  text-align: left;
  margin-top: 4px;
}
.ic-done-skipped-label {
  font-size: 12px;
  color: var(--fg2);
  font-weight: 500;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.ic-done-skipped-label .iconify { width: 13px; height: 13px; flex-shrink: 0; }
.ic-done-skipped-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ic-done-skipped-list li {
  font-size: 12px;
  color: var(--fg2);
  padding: 3px 0;
  border-bottom: 1px dashed var(--border-subtle);
}
.ic-done-skipped-list li:last-child { border-bottom: none; }
.ic-done-skipped-more {
  font-size: 11px;
  color: var(--fg3);
  font-style: italic;
}

.ic-done-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  flex-wrap: wrap;
  justify-content: center;
}
.ic-start-over {
  margin-top: 12px;
  background: transparent;
  border: none;
  color: var(--fg3);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  transition: color var(--dur), background var(--dur);
}
.ic-start-over:hover {
  color: var(--fg1);
  background: var(--crema-200);
}
.ic-start-over .iconify { width: 13px; height: 13px; }

/* ------------------------------------------------------------------ */
/* Spin animation (commit button)                                       */
/* ------------------------------------------------------------------ */
.ic-spin { animation: icSpin 0.9s linear infinite; }

/* ------------------------------------------------------------------ */
/* Screen-reader only utility                                           */
/* ------------------------------------------------------------------ */
.ic-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* ------------------------------------------------------------------ */
/* Reduced-motion overrides                                             */
/* ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .ic-proc-spin,
  .ic-spin { animation: none; }
  .ic-done-icon { animation: none; }
}
</style>
