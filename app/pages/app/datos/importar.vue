<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Importar ventas — GastronomIA' })

const toast = useToast()
const cache = useQueryCache()
const { user } = useUserSession()

// RBAC: staff cannot import history; the backend 403s them regardless.
// We gate the UI proactively to avoid a misleading empty/error state.
const canManage = computed(() => user.value?.role !== 'staff')

// ============ Real sales history (all time — wide date range covers full history) ============
// The backend defaults to "today in Lima" when no from/to is passed, so we must supply
// an explicit wide window that covers all possible historical imports (from 2000 onward).
const HISTORY_FROM = '2000-01-01T00:00:00Z'
const historyParams = computed(() => ({ from: HISTORY_FROM }))
const { data: salesHistory, status: historyStatus } = useSalesHistory(historyParams)
const historyLoading = computed(() => historyStatus.value === 'pending')

/** Formats a date string as abbreviated month + 4-digit year: "Ene 2025". */
function formatMonthYear(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('es-PE', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  })
}

// ============ "Estado actual" — derived from real backend data ============
const totalRecords = computed(() => salesHistory.value?.totalQty ?? 0)

/**
 * Most-recent soldOn date formatted as a short date ("15 abr").
 * Rows are returned desc by date, so rows[0] is the latest.
 * Falls back to 'Sin datos' when the table is empty.
 */
const lastImport = computed(() => {
  const rows = salesHistory.value?.rows
  if (!rows?.length) return 'Sin datos'
  return formatShortDate(rows[0].soldOn)
})

/** Earliest date in the dataset: last row of the desc-ordered array → period start. */
const periodStart = computed(() => {
  const rows = salesHistory.value?.rows
  if (!rows?.length) return '—'
  return formatMonthYear(rows[rows.length - 1].soldOn)
})

/** Latest date in the dataset: first row of the desc-ordered array → period end. */
const periodEnd = computed(() => {
  const rows = salesHistory.value?.rows
  if (!rows?.length) return '—'
  return formatMonthYear(rows[0].soldOn)
})

/** Whether there is enough data for meaningful AI forecasting (≥ 100 rows). */
const enoughData = computed(() => totalRecords.value >= 100)

/** Subtitle for the screen header — reflects loading / real data / access restriction. */
const headerSubtitle = computed(() => {
  if (!canManage.value) return 'Historial de ventas'
  if (historyLoading.value) return 'Cargando datos...'
  if (!salesHistory.value?.rows.length) return 'Sin registros'
  return `${fmtThousands(totalRecords.value)} registros · ${lastImport.value}`
})

const requiredColumns = [
  { name: 'Fecha y hora', type: 'fecha' },
  { name: 'Plato / producto', type: 'texto' },
  { name: 'Cantidad', type: 'número' },
  { name: 'Precio unitario', type: 'S/' },
  { name: 'Total', type: 'S/' },
]

const fmtThousands = (n: number): string => n.toLocaleString('es-PE')

// ============ Import report shape (mirrors backend SalesImportReport DTO) ============
interface ImportReport {
  total: number
  created: number
  updated: number
  failed: number
  errors: { line: number; message: string }[]
  dryRun: boolean
}

// ============ Real import flow (replaces SSE/mock approach) ============
/**
 * Import phases:
 * - idle      : waiting for file pick
 * - validating: dry-run POST in progress (spinner on button)
 * - review    : dry-run found errors; awaiting user confirmation
 * - importing : real POST in progress (spinner on button)
 * - done      : import completed; shows result modal
 */
type Phase = 'idle' | 'validating' | 'review' | 'importing' | 'done'
const phase = ref<Phase>('idle')
const pickedFileName = ref('')
/** CSV text held between dry-run and final confirmation. */
const pendingContent = ref('')
const dryRunReport = ref<ImportReport | null>(null)
const importReport = ref<ImportReport | null>(null)

const isProcessing = computed(
  () => phase.value === 'validating' || phase.value === 'importing',
)

const importMutation = useImportSalesHistory()

const fileInput = ref<HTMLInputElement | null>(null)

function pickFile(): void {
  fileInput.value?.click()
}

/**
 * Entry point when the user picks a CSV file.
 * 1. Reads the file as text.
 * 2. Calls the import endpoint with dryRun=true (validation only).
 * 3a. No errors → immediately calls with dryRun=false.
 * 3b. Has errors → transitions to 'review' so the user can confirm.
 */
async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so picking the same file twice triggers change again.
  input.value = ''
  if (!file) return

  pickedFileName.value = file.name
  pendingContent.value = ''
  dryRunReport.value = null
  importReport.value = null
  phase.value = 'validating'

  // Step 1: read file content in the browser (no upload yet).
  let content: string
  try {
    content = await file.text()
  }
  catch {
    phase.value = 'idle'
    toast.add({ title: 'No se pudo leer el archivo', icon: 'i-lucide-alert-circle' })
    return
  }

  // Step 2: dry-run — validate without writing to the database.
  let dryReport: ImportReport
  try {
    dryReport = await importMutation.mutateAsync({ content, dryRun: true })
    pendingContent.value = content
    dryRunReport.value = dryReport
  }
  catch (err) {
    phase.value = 'idle'
    const e = err as { statusMessage?: string; data?: { message?: string } }
    toast.add({
      title: e?.data?.message ?? e?.statusMessage ?? 'Error al validar el archivo',
      icon: 'i-lucide-alert-circle',
    })
    return
  }

  // Step 3: branch on validation result.
  if (!dryReport.errors.length) {
    // Clean file — skip the review step and import immediately.
    await confirmImport(content)
  }
  else {
    phase.value = 'review'
  }
}

/**
 * Executes the real (non-dry-run) import.
 * Called either automatically from `onFileChosen` (no errors) or
 * explicitly by the user after reviewing dry-run errors.
 *
 * @param content - CSV text to import; defaults to `pendingContent` when omitted.
 */
async function confirmImport(content?: string): Promise<void> {
  const csv = content ?? pendingContent.value
  if (!csv) return
  phase.value = 'importing'
  try {
    const report = await importMutation.mutateAsync({ content: csv, dryRun: false })
    importReport.value = report ?? null
    phase.value = 'done'
    // Refresh the history card so the new totals appear without a page reload.
    void cache.invalidateQueries({ key: ['sales-history'] })
  }
  catch (err) {
    phase.value = 'idle'
    const e = err as { statusMessage?: string; data?: { message?: string } }
    toast.add({
      title: e?.data?.message ?? e?.statusMessage ?? 'Error al importar el archivo',
      icon: 'i-lucide-alert-circle',
    })
  }
}

function cancelReview(): void {
  phase.value = 'idle'
  pendingContent.value = ''
  dryRunReport.value = null
}

function closeSuccess(): void {
  phase.value = 'idle'
}

function goDashboard(): void {
  void navigateTo('/app')
}

// ============ Coming-soon connectors ============
const soonSystem = ref<string | null>(null)

function openComingSoon(system: string): void {
  soonSystem.value = system
}

function soonUpload(): void {
  soonSystem.value = null
  setTimeout(pickFile, 220)
}

// ============ Expected format + CSV template ============
const formatOpen = ref(false)

function downloadTemplate(): void {
  const headers = ['fecha', 'plato', 'cantidad', 'precio_unitario', 'total']
  const sample = [
    ['2026-04-15 13:24', 'Ceviche clásico', '2', '32.00', '64.00'],
    ['2026-04-15 13:31', 'Chicha morada (jarra)', '1', '18.00', '18.00'],
    ['2026-04-15 13:48', 'Arroz con mariscos', '1', '45.00', '45.00'],
  ]
  const escape = (c: string): string => (/[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  const csv = `${headers.join(',')}\n${sample.map(r => r.map(escape).join(',')).join('\n')}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_ventas_gastronomia.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.add({ title: 'Plantilla descargada', icon: 'i-lucide-check-circle-2' })
}
</script>

<template>
  <div class="di-page">
    <UiScreenHeader
      title="Importar ventas"
      :subtitle="headerSubtitle"
      back="/app/menu"
    />

    <!-- ============ RBAC: staff cannot manage imports ============ -->
    <template v-if="!canManage">
      <div class="di-card" style="margin: 24px 20px;">
        <UiEmptyState
          icon="i-lucide-lock"
          title="Acceso restringido"
          subtitle="La importación de historial de ventas está disponible solo para propietarios y gerentes."
        />
      </div>
    </template>

    <template v-else>
      <!-- ============ Banner informativo ============ -->
      <div class="di-banner">
        <UIcon name="i-lucide-sparkles" />
        <span>Sube tu historial para mejorar la precisión de los pronósticos con IA.</span>
      </div>

      <!-- ============ 1. Estado actual ============ -->
      <section class="di-section" aria-labelledby="di-state-head">
        <div id="di-state-head" class="di-section-head">Estado actual</div>
        <div class="di-card di-state-card">
          <div class="di-state-row">
            <span class="di-state-label">
              <UIcon name="i-lucide-clock" />
              Última importación
            </span>
            <span />
            <span class="di-state-value">{{ historyLoading ? '—' : lastImport }}</span>
          </div>
          <div class="di-state-row">
            <span class="di-state-label">
              <UIcon name="i-lucide-database" />
              Registros totales
            </span>
            <span />
            <span class="di-state-value">
              {{ historyLoading ? '—' : `${fmtThousands(totalRecords)} ventas` }}
            </span>
          </div>
          <div class="di-state-row">
            <span class="di-state-label">
              <UIcon name="i-lucide-calendar-range" />
              Período cubierto
            </span>
            <span />
            <span class="di-state-value">
              {{ historyLoading ? '—' : `${periodStart} – ${periodEnd}` }}
            </span>
          </div>

          <div v-if="!historyLoading && enoughData" class="di-state-banner" role="status">
            <UIcon name="i-lucide-check-circle-2" />
            <span>Datos suficientes para pronósticos precisos.</span>
          </div>
        </div>
      </section>

      <!-- ============ 2. Nueva importación ============ -->
      <section class="di-section" aria-labelledby="di-new-head">
        <div id="di-new-head" class="di-section-head">Nueva importación</div>
        <div class="di-primary">
          <div class="di-primary-head">
            <span class="di-primary-icon" aria-hidden="true">
              <UIcon name="i-lucide-bar-chart-3" />
            </span>
            <div class="di-primary-text">
              <div class="di-primary-title">Importar nuevo archivo</div>
              <div class="di-primary-sub">Excel, CSV o conexión directa con tu sistema actual.</div>
            </div>
          </div>

          <div class="di-sources" role="list">
            <button type="button" class="di-source primary" role="listitem" :disabled="isProcessing" @click="pickFile">
              <span class="di-source-ico">
                <UIcon name="i-lucide-file-spreadsheet" />
              </span>
              <span class="di-source-body">
                <span class="di-source-title">Subir archivo Excel o CSV</span>
                <span class="di-source-sub">.xlsx, .xls, .csv hasta 10 MB</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="di-source-chev" />
            </button>

            <button type="button" class="di-source" role="listitem" @click="openComingSoon('TumiSoft')">
              <span class="di-source-ico">
                <UIcon name="i-lucide-plug-zap" />
              </span>
              <span class="di-source-body">
                <span class="di-source-title">
                  Conectar con TumiSoft
                  <span class="di-source-pill">Pronto</span>
                </span>
                <span class="di-source-sub">Sincronización automática diaria</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="di-source-chev" />
            </button>

            <button type="button" class="di-source" role="listitem" @click="openComingSoon('Conexa')">
              <span class="di-source-ico">
                <UIcon name="i-lucide-plug-zap" />
              </span>
              <span class="di-source-body">
                <span class="di-source-title">
                  Conectar con Conexa
                  <span class="di-source-pill">Pronto</span>
                </span>
                <span class="di-source-sub">Sincronización automática diaria</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="di-source-chev" />
            </button>
          </div>

          <button
            type="button"
            class="di-cta"
            :disabled="isProcessing"
            @click="pickFile"
          >
            <UIcon
              :name="isProcessing ? 'i-lucide-loader-2' : 'i-lucide-upload'"
              :class="{ spin: isProcessing }"
            />
            <span>
              {{
                phase === 'validating' ? 'Validando archivo...'
                : phase === 'importing' ? 'Importando...'
                : 'Seleccionar archivo'
              }}
            </span>
            <UIcon v-if="!isProcessing" name="i-lucide-arrow-right" />
          </button>

          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            class="di-file-input"
            @change="onFileChosen"
          >
        </div>
      </section>

      <!-- ============ 3. Importaciones recientes ============ -->
      <section class="di-section" aria-labelledby="di-recent-head">
        <div id="di-recent-head" class="di-section-head">
          Importaciones recientes
          <span v-if="salesHistory?.totalQty" class="di-section-count">
            {{ fmtThousands(salesHistory.totalQty) }} registros
          </span>
        </div>

        <!-- Loading skeleton -->
        <div v-if="historyLoading" class="di-card di-empty" aria-busy="true">
          <UiEmptyState
            icon="i-lucide-loader-2"
            title="Cargando historial..."
            subtitle="Consultando el historial de ventas."
          />
        </div>

        <!-- Aggregate summary when data exists -->
        <div v-else-if="salesHistory?.totalQty" class="di-card di-imports">
          <div class="di-import di-import-readonly">
            <span class="di-import-ico">
              <UIcon name="i-lucide-database" />
            </span>
            <span class="di-import-body">
              <span class="di-import-name">Historial de ventas</span>
              <span class="di-import-meta">
                <span>{{ fmtThousands(salesHistory.totalQty) }} registros</span>
                <span class="dot">·</span>
                <!-- Use periodStart/End (derived from actual row dates), not from/to
                     which reflect the wide query range rather than real data boundaries. -->
                <span>{{ periodStart }} – {{ periodEnd }}</span>
              </span>
            </span>
            <span class="di-import-status" aria-label="Datos disponibles">
              <UIcon name="i-lucide-check" />
            </span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="di-card di-empty">
          <UiEmptyState
            icon="i-lucide-file-spreadsheet"
            title="Sin importaciones aún"
            subtitle="Sube tu primer archivo para entrenar los pronósticos con tu historial."
          />
        </div>
      </section>

      <!-- ============ 4. Formato esperado ============ -->
      <section class="di-section" aria-labelledby="di-format-head">
        <div id="di-format-head" class="di-section-head">Formato del archivo</div>
        <div class="di-card di-format-card">
          <button
            type="button"
            class="di-format-toggle"
            :aria-expanded="formatOpen"
            aria-controls="di-format-body"
            @click="formatOpen = !formatOpen"
          >
            <UIcon name="i-lucide-help-circle" class="lead" />
            <span class="di-format-toggle-text">¿Qué columnas necesita mi archivo?</span>
            <UIcon name="i-lucide-chevron-down" class="chev" />
          </button>
          <div id="di-format-body" class="di-format-body" :class="{ open: formatOpen }">
            <div class="di-format-inner">
              <div class="di-format-inner-pad">
                <ul class="di-columns">
                  <li v-for="(col, i) in requiredColumns" :key="col.name" class="di-column">
                    <span class="di-col-num">{{ i + 1 }}</span>
                    <span class="di-col-name">{{ col.name }}</span>
                    <span class="di-col-type">{{ col.type }}</span>
                  </li>
                </ul>
                <button type="button" class="di-template-btn" @click="downloadTemplate">
                  <UIcon name="i-lucide-download" />
                  <span>Descargar plantilla CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ============ Overlay: dry-run review (errors found) ============ -->
    <div
      v-if="phase === 'review'"
      class="di-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="di-review-title"
      @click.self="cancelReview"
    >
      <div class="di-modal">
        <div class="di-success-icon di-warn-icon" aria-hidden="true">
          <UIcon name="i-lucide-alert-triangle" />
        </div>
        <h2 id="di-review-title" class="di-modal-title">Se encontraron errores</h2>
        <p class="di-modal-text">
          Hay <b>{{ dryRunReport?.errors.length }}</b>
          fila{{ (dryRunReport?.errors.length ?? 0) === 1 ? '' : 's' }} con error.
          Las filas válidas se importarán de todas formas si confirmás.
        </p>

        <div v-if="dryRunReport?.errors.length" class="di-err-list" aria-label="Errores detectados">
          <div
            v-for="err in dryRunReport.errors.slice(0, 10)"
            :key="err.line"
            class="di-err-row"
          >
            <span class="di-err-num">Línea {{ err.line }}</span>
            <span />
            <span class="di-err-msg">{{ err.message }}</span>
          </div>
          <p v-if="(dryRunReport?.errors.length ?? 0) > 10" class="di-err-more">
            +{{ (dryRunReport?.errors.length ?? 0) - 10 }} errores más
          </p>
        </div>

        <div class="di-success-meta">
          <UIcon name="i-lucide-file-spreadsheet" />
          <span><b>{{ pickedFileName }}</b></span>
        </div>

        <div class="di-modal-actions">
          <button class="btn btn-ghost" @click="cancelReview">Cancelar</button>
          <button class="btn btn-primary" @click="confirmImport()">
            <UIcon name="i-lucide-check" /> Confirmar importación
          </button>
        </div>
      </div>
    </div>

    <!-- ============ Overlay: import result (done) ============ -->
    <div v-if="phase === 'done'" class="di-overlay" @click.self="closeSuccess">
      <div class="di-modal" role="dialog" aria-modal="true" aria-label="Importación completa">
        <div class="di-success-icon" aria-hidden="true">
          <UIcon name="i-lucide-check-circle-2" />
        </div>
        <h2 class="di-modal-title">Importación completa</h2>
        <p class="di-modal-text">
          Tu archivo se procesó correctamente. Los pronósticos se actualizarán en los próximos minutos.
        </p>

        <div class="di-success-stats">
          <div class="di-success-stat">
            <div class="di-success-stat-num">
              {{ fmtThousands((importReport?.created ?? 0) + (importReport?.updated ?? 0)) }}<small> filas</small>
            </div>
            <div class="di-success-stat-label">importadas</div>
          </div>
          <div class="di-success-stat">
            <div class="di-success-stat-num">{{ importReport?.failed ?? 0 }}<small> filas</small></div>
            <div class="di-success-stat-label">con error</div>
          </div>
        </div>

        <div v-if="importReport?.errors.length" class="di-err-list" aria-label="Detalle de errores">
          <div
            v-for="err in importReport.errors"
            :key="err.line"
            class="di-err-row"
          >
            <span class="di-err-num">Línea {{ err.line }}</span>
            <span />
            <span class="di-err-msg">{{ err.message }}</span>
          </div>
        </div>

        <div class="di-success-meta">
          <UIcon name="i-lucide-file-spreadsheet" />
          <span><b>{{ pickedFileName }}</b> · {{ fmtThousands(importReport?.total ?? 0) }} filas leídas</span>
        </div>

        <div class="di-modal-actions">
          <button class="btn btn-ghost" @click="closeSuccess">Cerrar</button>
          <button class="btn btn-primary" @click="goDashboard">
            <UIcon name="i-lucide-arrow-right" /> Ver dashboard
          </button>
        </div>
      </div>
    </div>

    <!-- ============ Overlay: connector coming soon ============ -->
    <div v-if="soonSystem" class="di-overlay" @click.self="soonSystem = null">
      <div class="di-modal center" role="dialog" aria-modal="true" aria-label="Conector próximamente">
        <div class="di-soon-icon" aria-hidden="true">
          <UIcon name="i-lucide-plug-zap" />
        </div>
        <h2 class="di-modal-title">Conector próximamente</h2>
        <p class="di-modal-text">
          La integración directa con <b>{{ soonSystem }}</b> está en camino. Te avisaremos cuando esté lista.
        </p>
        <div class="di-soon-tip">
          <UIcon name="i-lucide-lightbulb" />
          <span>
            <b>Mientras tanto:</b> exporta tus ventas como CSV desde {{ soonSystem }} y súbelo aquí. El formato es compatible.
          </span>
        </div>
        <div class="di-modal-actions">
          <button class="btn btn-ghost" @click="soonSystem = null">Cerrar</button>
          <button class="btn btn-primary" @click="soonUpload">
            <UIcon name="i-lucide-upload" /> Subir CSV
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.di-page {
  max-width: 560px;
  margin: 0 auto;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  padding-bottom: 40px;
}
@media (min-width: 1024px) {
  .di-page { padding-top: 28px; }
}

/* ============ Banner informativo ============ */
.di-banner {
  margin: 4px 20px 0;
  padding: 10px 12px;
  background: var(--crema-100);
  border: 1px dashed var(--terracotta-300);
  border-radius: 12px;
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 12.5px;
  color: var(--fg2);
  line-height: 1.4;
}
.di-banner .iconify {
  width: 15px; height: 15px;
  color: var(--terracotta-700);
  flex-shrink: 0;
  margin-top: 1px;
}

/* ============ Secciones / cards ============ */
.di-section { margin-top: 22px; }
.di-section-head {
  padding: 0 20px 10px;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--terracotta-700);
  display: flex; align-items: center; justify-content: space-between;
}
.di-section-count {
  font-family: var(--font-mono);
  color: var(--fg3);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  font-size: 12px;
}
.di-card {
  margin: 0 20px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  box-shadow: var(--shadow-xs);
}

/* ============ Estado actual ============ */
.di-state-card { padding: 16px 14px 4px; }
.di-state-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.di-state-row:last-of-type { border-bottom: none; }
.di-state-label {
  font-size: 12.5px;
  color: var(--fg2);
  display: inline-flex; align-items: center; gap: 6px;
}
.di-state-label .iconify { width: 14px; height: 14px; color: var(--fg3); }
.di-state-value {
  font-size: 14px; font-weight: 600;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.di-state-banner {
  margin: 12px -14px 0;
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, transparent, rgba(214, 220, 204, 0.32));
  display: flex; align-items: center; gap: 8px;
  font-size: 12px;
  color: var(--oliva-700);
  font-weight: 500;
  border-radius: 0 0 13px 13px;
}
.di-state-banner .iconify { width: 14px; height: 14px; flex-shrink: 0; }

/* ============ Card primaria de importación ============ */
.di-primary {
  margin: 0 20px;
  padding: 18px 16px 16px;
  background: var(--pure-white);
  border: 1.5px solid var(--terracotta);
  border-radius: 14px;
  box-shadow:
    0 0 0 4px rgba(201, 106, 67, 0.10),
    0 4px 14px rgba(26, 26, 26, 0.05);
  display: flex; flex-direction: column; gap: 14px;
}
.di-primary-head { display: flex; align-items: flex-start; gap: 12px; }
.di-primary-icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: var(--terracotta-100);
  color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.di-primary-icon .iconify { width: 22px; height: 22px; }
.di-primary-text { flex: 1; min-width: 0; }
.di-primary-title {
  font-size: 17px; font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--fg1);
  line-height: 1.2;
}
.di-primary-sub {
  font-size: 12.5px;
  color: var(--fg2);
  margin-top: 3px;
  line-height: 1.4;
}

.di-sources { display: flex; flex-direction: column; gap: 8px; }
.di-source {
  display: flex; align-items: center; gap: 12px;
  padding: 12px;
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font: inherit; color: inherit;
  width: 100%;
  transition: border-color var(--dur), background var(--dur), transform 80ms;
}
.di-source:hover {
  border-color: var(--terracotta-300);
  background: var(--pure-white);
}
.di-source:active { transform: scale(0.995); }
.di-source.primary {
  background: var(--pure-white);
  border-color: var(--terracotta);
  box-shadow: 0 0 0 2px rgba(201, 106, 67, 0.10);
}
.di-source:disabled { opacity: 0.6; cursor: not-allowed; }
.di-source-ico {
  width: 36px; height: 36px;
  border-radius: 9px;
  background: var(--crema-200);
  color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.di-source.primary .di-source-ico {
  background: var(--terracotta-100);
  color: var(--terracotta-700);
}
.di-source-ico .iconify { width: 18px; height: 18px; }
.di-source-body { flex: 1; min-width: 0; }
.di-source-title {
  font-size: 14px; font-weight: 600;
  color: var(--fg1);
  line-height: 1.2;
  display: flex; align-items: center; gap: 6px;
}
.di-source-sub {
  display: block;
  font-size: 11.5px;
  color: var(--fg3);
  margin-top: 2px;
  line-height: 1.35;
}
.di-source-pill {
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--mostaza-700);
  background: var(--mostaza-100);
  padding: 2px 6px;
  border-radius: 999px;
  text-transform: uppercase;
}
.di-source-chev { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

.di-cta {
  height: 48px;
  border-radius: 11px;
  background: var(--terracotta);
  border: 1px solid var(--terracotta);
  color: var(--crema-100);
  font: inherit;
  font-size: 14.5px; font-weight: 600;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  transition: background var(--dur-fast);
  width: 100%;
}
.di-cta:hover:not(:disabled) { background: var(--terracotta-700); border-color: var(--terracotta-700); }
.di-cta:active:not(:disabled) { transform: scale(0.99); }
.di-cta:disabled { opacity: 0.7; cursor: not-allowed; }
.di-cta .iconify { width: 16px; height: 16px; }

.di-file-input { display: none; }

/* ============ Importaciones recientes ============ */
.di-imports { padding: 4px 0; }
.di-import {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  padding: 12px 14px;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  font: inherit;
  text-align: left;
  color: inherit;
}
.di-import:last-child { border-bottom: none; }
.di-import-readonly { cursor: default; }
.di-import-ico {
  width: 36px; height: 36px;
  border-radius: 9px;
  background: var(--crema-100);
  color: var(--fg2);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.di-import-ico .iconify { width: 17px; height: 17px; }
.di-import-body { min-width: 0; }
.di-import-name {
  display: block;
  font-size: 13.5px; font-weight: 600;
  color: var(--fg1);
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.di-import-meta {
  font-size: 11.5px;
  color: var(--fg3);
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
}
.di-import-meta .dot { color: var(--border); }
.di-import-status {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--oliva-100);
  color: var(--oliva-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.di-import-status .iconify { width: 13px; height: 13px; }
.di-empty { padding: 8px 0; }

/* ============ Formato esperado ============ */
.di-format-card { padding: 0; overflow: hidden; }
.di-format-toggle {
  width: 100%;
  background: transparent;
  border: none;
  padding: 14px;
  display: flex; align-items: center; gap: 10px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
  transition: background var(--dur);
}
.di-format-toggle:hover { background: var(--crema-100); }
.di-format-toggle .lead { width: 18px; height: 18px; color: var(--terracotta-700); flex-shrink: 0; }
.di-format-toggle-text {
  flex: 1; min-width: 0;
  font-size: 14px; font-weight: 600;
  color: var(--fg1);
}
.di-format-toggle .chev {
  width: 18px; height: 18px;
  color: var(--fg3);
  transition: transform 200ms var(--ease-standard);
}
.di-format-toggle[aria-expanded='true'] .chev { transform: rotate(180deg); }

.di-format-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms var(--ease-standard);
}
.di-format-body.open { grid-template-rows: 1fr; }
.di-format-inner { overflow: hidden; }
.di-format-inner-pad {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border-subtle);
}
.di-columns {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex; flex-direction: column;
}
.di-column {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-subtle);
}
.di-column:last-child { border-bottom: none; }
.di-col-num {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg3);
  font-weight: 600;
  text-align: center;
}
.di-col-name { font-size: 13.5px; color: var(--fg1); font-weight: 500; }
.di-col-type {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  padding: 2px 7px;
  border-radius: 5px;
  letter-spacing: 0.02em;
}
.di-template-btn {
  margin-top: 14px;
  width: 100%;
  height: 44px;
  background: var(--crema-100);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--fg1);
  font: inherit;
  font-size: 13.5px; font-weight: 600;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  transition: background var(--dur), border-color var(--dur), color var(--dur);
}
.di-template-btn:hover {
  background: var(--pure-white);
  border-color: var(--terracotta-300);
  color: var(--terracotta-700);
}
.di-template-btn .iconify { width: 15px; height: 15px; }

/* ============ Overlay genérico ============ */
.di-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.50);
  display: flex; align-items: center; justify-content: center;
  z-index: 60;
  padding: 24px;
  animation: diOvIn 200ms var(--ease-standard) forwards;
  opacity: 0;
}
@keyframes diOvIn { to { opacity: 1; } }

/* ============ Modales ============ */
.di-modal {
  width: 100%;
  max-width: 400px;
  background: var(--crema-100);
  border-radius: 16px;
  padding: 20px;
  text-align: left;
  box-shadow: 0 20px 50px rgba(26, 26, 26, 0.30);
  animation: diPop 280ms var(--ease-emphasis) both;
  max-height: 86dvh;
  overflow-y: auto;
}
@keyframes diPop {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
.di-modal-title {
  font-size: 19px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg1);
  margin: 0 0 6px;
}
.di-modal-text {
  font-size: 13px;
  color: var(--fg2);
  line-height: 1.45;
  margin: 0 0 14px;
}
.di-modal-text b { color: var(--fg1); font-weight: 600; }
.di-modal-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 4px;
}

.di-success-icon {
  width: 52px; height: 52px;
  border-radius: 14px;
  background: var(--oliva-100);
  color: var(--oliva-700);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
  animation: diPopBig 480ms var(--ease-emphasis) both;
}
.di-warn-icon {
  background: var(--mostaza-100);
  color: var(--mostaza-700);
}
@keyframes diPopBig {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}
.di-success-icon .iconify { width: 26px; height: 26px; }
.di-success-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 6px 0 14px;
}
.di-success-stat {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px;
}
.di-success-stat-num {
  font-weight: 700;
  font-size: 24px;
  letter-spacing: -0.02em;
  color: var(--fg1);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.di-success-stat-num small {
  font-size: 13px; font-weight: 600;
  color: var(--fg3);
  margin-left: 2px;
}
.di-success-stat-label { font-size: 11.5px; color: var(--fg3); margin-top: 2px; }
.di-success-meta {
  font-size: 12px;
  color: var(--fg2);
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 14px;
  padding: 8px 10px;
  background: var(--crema-200);
  border-radius: 8px;
}
.di-success-meta .iconify { width: 13px; height: 13px; color: var(--oliva-700); flex-shrink: 0; }
.di-success-meta b { color: var(--fg1); font-weight: 600; }

.di-err-list {
  display: flex; flex-direction: column; gap: 6px;
  margin-bottom: 14px;
}
.di-err-row {
  display: grid;
  grid-template-columns: auto 1px 1fr;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--danger);
  border-radius: 8px;
  font-size: 11.5px;
}
.di-err-num {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.di-err-msg { color: var(--fg2); line-height: 1.35; }
.di-err-more {
  font-size: 11px;
  color: var(--fg3);
  text-align: center;
  margin: 2px 0 0;
}

.di-soon-icon {
  width: 52px; height: 52px;
  border-radius: 14px;
  background: var(--mostaza-100);
  color: var(--mostaza-700);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
}
.di-soon-icon .iconify { width: 26px; height: 26px; }
.di-soon-tip {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px;
  background: var(--crema-200);
  border-radius: 10px;
  font-size: 12.5px;
  color: var(--fg2);
  line-height: 1.4;
  margin-bottom: 16px;
}
.di-soon-tip .iconify { width: 15px; height: 15px; color: var(--terracotta-700); flex-shrink: 0; margin-top: 1px; }
.di-soon-tip b { color: var(--fg1); font-weight: 600; }

/* ============ Spinner animation ============ */
.spin { animation: spinAnim 0.9s linear infinite; }
@keyframes spinAnim { to { transform: rotate(360deg); } }

/* Reduce animation for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
  .di-overlay { animation: none; opacity: 1; }
  .di-modal { animation: none; }
  .di-success-icon { animation: none; }
}
</style>
