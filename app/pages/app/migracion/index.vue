<script setup lang="ts">
// E11 · HU-11-01 — Wizard de migración guiado (onboarding in-app). Acompaña a un
// restaurante recién registrado por la configuración inicial REUTILIZANDO los
// endpoints ya integrados: config fiscal del local (HU-01-10, use-app-settings),
// carga de insumos (HU-02-02, use-ingredients) e histórico de ventas (HU-11-03/04/05,
// use-sales-history-import). No introduce backend nuevo; el BFF ya proxea todo.
//
// Gating: owner/manager (la config fiscal es `update Setting` = owner; los imports
// son `manage Report`/`Catalog` = owner/manager; el backend 403ea a staff igual).
import type { BusinessSettings, DayHours, TaxSettings } from '#shared/types/domain'
import type { ImportReport } from '~/composables/use-ingredients'
import type { SalesImportReport } from '~/composables/use-sales-history-import'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Asistente de migración — GastronomIA' })

const toast = useToast()
const { user } = useUserSession()

// Solo owner/manager (el backend gatea con CASL; aquí evitamos mostrar un wizard
// que fallará en cada paso para el staff).
const canMigrate = computed(() => user.value?.role === 'owner' || user.value?.role === 'manager')

/* ===================== Navegación entre pasos ===================== */
const STEPS = [
  { key: 'welcome', label: 'Bienvenida' },
  { key: 'config', label: 'Tu local' },
  { key: 'ingredients', label: 'Insumos' },
  { key: 'sales', label: 'Ventas', optional: true },
  { key: 'done', label: 'Listo' },
] as const
const TOTAL = STEPS.length

const step = ref(0)
const current = computed(() => STEPS[step.value]!)

function goNext(): void {
  if (step.value < TOTAL - 1) step.value += 1
}
function goBack(): void {
  if (step.value > 0) step.value -= 1
}
function goTo(i: number): void {
  if (i >= 0 && i < TOTAL) step.value = i
}

/* ===================== Paso 2 · Configurar el local ===================== */
// Reutiliza el composable de ajustes (parte fiscal/negocio autoritativa del backend,
// HU-01-10). Solo tocamos los campos que el backend persiste: RUC, razón social,
// dirección fiscal, IGV y horarios.
const { data: settings } = useAppSettings()
const updateBusiness = useUpdateSettings('business')
const updateTax = useUpdateSettings('tax')
const updateHours = useUpdateSettings('hours')

const bizForm = reactive<Pick<BusinessSettings, 'legalName' | 'ruc' | 'address'>>({
  legalName: '', ruc: '', address: '',
})
const taxForm = reactive<Pick<TaxSettings, 'igvPct'>>({ igvPct: 18 })
const hoursForm = ref<DayHours[]>([])

watch(settings, (s) => {
  if (!s) return
  bizForm.legalName = s.business.legalName
  bizForm.ruc = s.business.ruc
  bizForm.address = s.business.address
  taxForm.igvPct = s.tax.igvPct
  if (hoursForm.value.length === 0) hoursForm.value = s.hours.days.map(d => ({ ...d }))
}, { immediate: true })

const rucValid = computed(() => bizForm.ruc === '' || /^\d{11}$/.test(bizForm.ruc))
const savingConfig = ref(false)

function copyHoursToAll(source: DayHours): void {
  for (const d of hoursForm.value) {
    if (d.day === source.day || d.closed) continue
    d.opens = source.opens
    d.closes = source.closes
  }
}

async function saveConfigAndNext(): Promise<void> {
  if (savingConfig.value) return
  if (!rucValid.value) {
    toast.add({ title: 'El RUC debe tener 11 dígitos', icon: 'i-lucide-alert-circle', color: 'error' })
    return
  }
  savingConfig.value = true
  try {
    // La escritura fiscal es owner-only en el backend; manager recibe 403 → lo
    // surfaceamos como toast y dejamos avanzar (la config puede completarse luego).
    await Promise.all([
      updateBusiness.mutateAsync({ legalName: bizForm.legalName, ruc: bizForm.ruc, address: bizForm.address }),
      updateTax.mutateAsync({ igvPct: taxForm.igvPct }),
      updateHours.mutateAsync({ days: hoursForm.value }),
    ])
    toast.add({ title: 'Configuración guardada', icon: 'i-lucide-check' })
    goNext()
  }
  catch (error) {
    toast.add({ title: errorMessage(error, 'No se pudo guardar la configuración'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    savingConfig.value = false
  }
}

/* ===================== Paso 3 · Importar insumos (HU-02-02) ===================== */
const INGREDIENTS_HEADER = 'sku,name,type,unit,unitCost,category'
const INGREDIENTS_SAMPLE = [
  INGREDIENTS_HEADER,
  'INS-001,Lomo fino,raw,kg,42.00,Carnes',
  'INS-002,Cebolla roja,raw,kg,4.50,Verduras',
].join('\n')

const { mutateAsync: importIngredients, isLoading: importingIngredients } = useImportIngredients()
const ingredientsReport = ref<ImportReport | null>(null)
const ingredientsFileName = ref('')

async function onIngredientsFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  ingredientsFileName.value = file.name
  try {
    const content = await file.text()
    ingredientsReport.value = await importIngredients(content)
    const r = ingredientsReport.value
    toast.add({
      title: `Insumos: ${r.created} nuevos · ${r.updated} actualizados`,
      icon: 'i-lucide-check-circle-2',
    })
  }
  catch (error) {
    toast.add({ title: errorMessage(error, 'No se pudo importar el archivo'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    input.value = '' // permite re-subir el mismo archivo (idempotente)
  }
}

/* ===================== Paso 4 · Histórico de ventas (HU-11-03/04/05) ===================== */
const SALES_HEADER = 'date,dish,qty,unitPrice,total'
const SALES_SAMPLE = [
  SALES_HEADER,
  '2025-01-05,Ceviche Clásico,12,38.00,456.00',
  '2025-01-05,Lomo Saltado,8,34.00,272.00',
].join('\n')

const { mutateAsync: importSales, isLoading: importingSales } = useImportSalesHistory()
const salesReport = ref<SalesImportReport | null>(null)
const salesFileName = ref('')
const salesContent = ref<string | null>(null)
const salesDryRunDone = ref(false)

async function runSalesImport(dryRun: boolean): Promise<void> {
  if (!salesContent.value) return
  try {
    salesReport.value = await importSales({ content: salesContent.value, dryRun })
    const r = salesReport.value
    if (dryRun) {
      salesDryRunDone.value = true
      toast.add({
        title: r.failed > 0
          ? `Validación: ${r.failed} fila(s) con error de ${r.total}`
          : `Validación OK: ${r.total} filas listas para importar`,
        icon: r.failed > 0 ? 'i-lucide-alert-circle' : 'i-lucide-check-circle-2',
        color: r.failed > 0 ? 'warning' : undefined,
      })
    }
    else {
      toast.add({
        title: `Ventas: ${r.created} importadas · ${r.updated} actualizadas`,
        icon: 'i-lucide-check-circle-2',
      })
    }
  }
  catch (error) {
    toast.add({ title: errorMessage(error, 'No se pudo procesar el archivo'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function onSalesFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  salesFileName.value = file.name
  salesReport.value = null
  salesDryRunDone.value = false
  try {
    salesContent.value = await file.text()
    // Validación automática primero (HU-11-05: "validar antes de importar").
    await runSalesImport(true)
  }
  catch (error) {
    toast.add({ title: errorMessage(error, 'No se pudo leer el archivo'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    input.value = ''
  }
}

/* ===================== Descarga de plantillas CSV ===================== */
function downloadTemplate(name: string, content: string): void {
  if (!import.meta.client) return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ===================== Resumen final ===================== */
const summary = computed(() => {
  const ing = ingredientsReport.value
  const sal = salesReport.value
  return {
    configured: Boolean(settings.value?.business.ruc || bizForm.ruc),
    ingredients: ing ? ing.created + ing.updated : 0,
    ingredientsDone: Boolean(ing),
    // Solo cuenta como importado si la última corrida NO fue dry-run.
    sales: sal && !sal.dryRun ? sal.created + sal.updated : 0,
    salesDone: Boolean(sal && !sal.dryRun),
  }
})
</script>

<template>
  <div class="mig-screen">
    <UiScreenHeader
      title="Asistente de migración"
      subtitle="Configura tu restaurante e importa tus datos"
      back="/app/ajustes"
    />

    <!-- Gate de rol: el staff no puede correr la migración (config fiscal + imports). -->
    <UiEmptyState
      v-if="!canMigrate"
      icon="i-lucide-lock"
      title="Solo el dueño o un administrador puede migrar"
      subtitle="Pídele a tu administrador que complete la configuración inicial del restaurante."
    />

    <template v-else>
      <!-- Indicador de progreso -->
      <nav class="mig-steps" aria-label="Progreso de la migración">
        <button
          v-for="(s, i) in STEPS"
          :key="s.key"
          class="mig-step"
          :class="{ done: i < step, current: i === step }"
          :disabled="i > step"
          :aria-current="i === step ? 'step' : undefined"
          @click="goTo(i)"
        >
          <span class="mig-step-dot">
            <UIcon v-if="i < step" name="i-lucide-check" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="mig-step-label">{{ s.label }}</span>
        </button>
      </nav>

      <!-- ============ Paso 1 · Bienvenida ============ -->
      <section v-if="current.key === 'welcome'" class="mig-card mig-welcome">
        <div class="mig-hero-ico"><UIcon name="i-lucide-rocket" /></div>
        <h2 class="mig-h2">Pongamos tu restaurante en marcha</h2>
        <p class="mig-lead">
          Este asistente te guía en 4 pasos para dejar GastronomIA listo para operar.
          Puedes pausar y retomar cuando quieras; lo opcional se puede saltar.
        </p>
        <ul class="mig-checklist">
          <li><span class="mig-num">1</span> <b>Configura tu local</b> — datos fiscales, IGV y horarios.</li>
          <li><span class="mig-num">2</span> <b>Importa tus insumos</b> — sube tu catálogo desde un CSV.</li>
          <li><span class="mig-num">3</span> <b>Carga tu histórico de ventas</b> <span class="mig-opt">opcional</span> — para el forecast desde el día 1.</li>
          <li><span class="mig-num">4</span> <b>¡Listo!</b> — empieza a costear y vender.</li>
        </ul>
        <div class="mig-cta">
          <UButton size="xl" block trailing-icon="i-lucide-arrow-right" @click="goNext">
            Empezar
          </UButton>
        </div>
      </section>

      <!-- ============ Paso 2 · Configurar el local ============ -->
      <section v-else-if="current.key === 'config'" class="mig-card">
        <div class="mig-card-head">
          <h2 class="mig-h2">Configura tu local</h2>
          <p class="mig-sub">Datos fiscales y horario de atención. Podrás ajustarlo luego en Ajustes.</p>
        </div>

        <div class="field-block">
          <div class="field-label"><span>Razón social</span></div>
          <input v-model="bizForm.legalName" class="field-input" type="text" placeholder="Ej: Inversiones El Sabor S.A.C." aria-label="Razón social">
        </div>
        <div class="mig-row-2">
          <div class="field-block">
            <div class="field-label"><span>RUC</span></div>
            <input v-model="bizForm.ruc" class="field-input" type="text" inputmode="numeric" maxlength="11" placeholder="20…" aria-label="RUC">
            <p v-if="!rucValid" class="mig-err">El RUC debe tener 11 dígitos</p>
          </div>
          <div class="field-block">
            <div class="field-label"><span>IGV (%)</span></div>
            <input v-model.number="taxForm.igvPct" class="field-input" type="number" min="0" max="30" aria-label="IGV en porcentaje">
          </div>
        </div>
        <div class="field-block">
          <div class="field-label"><span>Dirección fiscal</span></div>
          <input v-model="bizForm.address" class="field-input" type="text" placeholder="Av. Próceres 1532, SJL" aria-label="Dirección fiscal">
        </div>

        <div class="field-label mig-hours-label"><span>Horario de atención</span></div>
        <div class="mig-days">
          <div v-for="d in hoursForm" :key="d.day" class="mig-day" :class="{ closed: d.closed }">
            <div class="mig-day-head">
              <span class="mig-day-name">{{ d.day }}</span>
              <USwitch :model-value="!d.closed" @update:model-value="d.closed = !$event" />
            </div>
            <div v-if="!d.closed" class="mig-day-times">
              <input v-model="d.opens" type="time" aria-label="Hora de apertura">
              <span aria-hidden="true">—</span>
              <input v-model="d.closes" type="time" aria-label="Hora de cierre">
              <button class="mig-copy" :aria-label="`Copiar horario de ${d.day} a los días abiertos`" @click="copyHoursToAll(d)">
                <UIcon name="i-lucide-copy" />
              </button>
            </div>
          </div>
        </div>

        <div class="mig-cta mig-cta-row">
          <UButton size="xl" color="neutral" variant="ghost" @click="goBack">Atrás</UButton>
          <UButton size="xl" block trailing-icon="i-lucide-arrow-right" :loading="savingConfig" @click="saveConfigAndNext">
            Guardar y continuar
          </UButton>
        </div>
      </section>

      <!-- ============ Paso 3 · Importar insumos ============ -->
      <section v-else-if="current.key === 'ingredients'" class="mig-card">
        <div class="mig-card-head">
          <h2 class="mig-h2">Importa tus insumos</h2>
          <p class="mig-sub">Sube tu catálogo en CSV. La carga es <b>idempotente</b>: re-subir actualiza por SKU, no duplica.</p>
        </div>

        <div class="mig-template">
          <code>{{ INGREDIENTS_HEADER }}</code>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-download" @click="downloadTemplate('plantilla-insumos.csv', INGREDIENTS_SAMPLE)">
            Plantilla CSV
          </UButton>
        </div>

        <label class="mig-drop" :class="{ busy: importingIngredients }">
          <UIcon :name="importingIngredients ? 'i-lucide-loader-circle' : 'i-lucide-upload'" :class="{ spin: importingIngredients }" />
          <span>{{ importingIngredients ? 'Importando…' : (ingredientsFileName || 'Elegir archivo CSV') }}</span>
          <input type="file" accept=".csv,text/csv" :disabled="importingIngredients" hidden @change="onIngredientsFile">
        </label>

        <div v-if="ingredientsReport" class="mig-report">
          <div class="mig-stats">
            <span class="ok">{{ ingredientsReport.created }} nuevos</span>
            <span class="upd">{{ ingredientsReport.updated }} actualizados</span>
            <span v-if="ingredientsReport.failed > 0" class="err">{{ ingredientsReport.failed }} con error</span>
          </div>
          <ul v-if="ingredientsReport.errors.length" class="mig-errors">
            <li v-for="(er, idx) in ingredientsReport.errors" :key="idx"><b>Línea {{ er.line }}:</b> {{ er.message }}</li>
          </ul>
        </div>

        <div class="mig-cta mig-cta-row">
          <UButton size="xl" color="neutral" variant="ghost" @click="goBack">Atrás</UButton>
          <UButton size="xl" block trailing-icon="i-lucide-arrow-right" @click="goNext">
            {{ ingredientsReport ? 'Continuar' : 'Omitir por ahora' }}
          </UButton>
        </div>
      </section>

      <!-- ============ Paso 4 · Histórico de ventas (opcional) ============ -->
      <section v-else-if="current.key === 'sales'" class="mig-card">
        <div class="mig-card-head">
          <span class="mig-opt-badge">Opcional</span>
          <h2 class="mig-h2">Importa tu histórico de ventas</h2>
          <p class="mig-sub">
            Alimenta el forecast de demanda desde el día 1. Te recomendamos <b>validar primero</b>
            (sin escribir) y luego confirmar la importación.
          </p>
        </div>

        <div class="mig-template">
          <code>{{ SALES_HEADER }}</code>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-download" @click="downloadTemplate('plantilla-ventas.csv', SALES_SAMPLE)">
            Plantilla CSV
          </UButton>
        </div>

        <label class="mig-drop" :class="{ busy: importingSales }">
          <UIcon :name="importingSales ? 'i-lucide-loader-circle' : 'i-lucide-upload'" :class="{ spin: importingSales }" />
          <span>{{ importingSales ? 'Procesando…' : (salesFileName || 'Elegir archivo CSV') }}</span>
          <input type="file" accept=".csv,text/csv" :disabled="importingSales" hidden @change="onSalesFile">
        </label>

        <div v-if="salesReport" class="mig-report">
          <div class="mig-report-mode" :class="{ dry: salesReport.dryRun }">
            <UIcon :name="salesReport.dryRun ? 'i-lucide-flask-conical' : 'i-lucide-database'" />
            {{ salesReport.dryRun ? 'Validación (no se escribió nada)' : 'Importación confirmada' }}
          </div>
          <div class="mig-stats">
            <span v-if="!salesReport.dryRun" class="ok">{{ salesReport.created }} importadas</span>
            <span v-if="!salesReport.dryRun" class="upd">{{ salesReport.updated }} actualizadas</span>
            <span v-if="salesReport.dryRun" class="upd">{{ salesReport.total - salesReport.failed }} válidas de {{ salesReport.total }}</span>
            <span v-if="salesReport.failed > 0" class="err">{{ salesReport.failed }} con error</span>
          </div>
          <ul v-if="salesReport.errors.length" class="mig-errors">
            <li v-for="(er, idx) in salesReport.errors" :key="idx"><b>Línea {{ er.line }}:</b> {{ er.message }}</li>
          </ul>
          <UButton
            v-if="salesDryRunDone && salesReport.dryRun && salesContent"
            class="mig-confirm"
            size="lg"
            block
            icon="i-lucide-database"
            :loading="importingSales"
            @click="runSalesImport(false)"
          >
            {{ salesReport.failed > 0 ? `Importar las ${salesReport.total - salesReport.failed} filas válidas` : 'Confirmar importación' }}
          </UButton>
        </div>

        <div class="mig-cta mig-cta-row">
          <UButton size="xl" color="neutral" variant="ghost" @click="goBack">Atrás</UButton>
          <UButton size="xl" block trailing-icon="i-lucide-arrow-right" @click="goNext">
            {{ summary.salesDone ? 'Continuar' : 'Saltar este paso' }}
          </UButton>
        </div>
      </section>

      <!-- ============ Paso 5 · Listo ============ -->
      <section v-else-if="current.key === 'done'" class="mig-card mig-welcome">
        <div class="mig-hero-ico done"><UIcon name="i-lucide-party-popper" /></div>
        <h2 class="mig-h2">¡Todo listo!</h2>
        <p class="mig-lead">Tu restaurante ya quedó configurado. Esto es lo que dejamos preparado:</p>
        <ul class="mig-summary">
          <li>
            <UIcon :name="summary.configured ? 'i-lucide-check-circle-2' : 'i-lucide-circle-dashed'" :class="{ ok: summary.configured }" />
            <span>Datos del local {{ summary.configured ? 'configurados' : 'pendientes' }}</span>
          </li>
          <li>
            <UIcon :name="summary.ingredientsDone ? 'i-lucide-check-circle-2' : 'i-lucide-circle-dashed'" :class="{ ok: summary.ingredientsDone }" />
            <span>{{ summary.ingredientsDone ? `${summary.ingredients} insumos en tu catálogo` : 'Insumos: aún sin importar' }}</span>
          </li>
          <li>
            <UIcon :name="summary.salesDone ? 'i-lucide-check-circle-2' : 'i-lucide-circle-dashed'" :class="{ ok: summary.salesDone }" />
            <span>{{ summary.salesDone ? `${summary.sales} ventas históricas cargadas` : 'Histórico de ventas: opcional, puedes cargarlo luego' }}</span>
          </li>
        </ul>
        <div class="mig-tip">
          <UIcon name="i-lucide-lightbulb" />
          <span><b>Primer paso sugerido:</b> crea tu plato estrella en Recetas y descubre su margen real.</span>
        </div>
        <div class="mig-cta mig-cta-row">
          <UButton size="xl" color="neutral" variant="ghost" to="/app/recetas/nueva">Crear receta</UButton>
          <UButton size="xl" block trailing-icon="i-lucide-arrow-right" to="/app">
            Ir a mi panel
          </UButton>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mig-screen { max-width: 620px; margin: 0 auto; padding-bottom: 24px; }

/* ---- Indicador de pasos ---- */
.mig-steps {
  display: flex; align-items: center; gap: 4px;
  margin: 0 20px 18px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.mig-step {
  display: inline-flex; align-items: center; gap: 7px;
  background: transparent; border: none; cursor: pointer;
  padding: 4px 6px; border-radius: 10px;
  flex-shrink: 0;
}
.mig-step:disabled { cursor: default; }
.mig-step-dot {
  width: 26px; height: 26px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  background: var(--crema-200); color: var(--fg3);
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.mig-step-dot .iconify { width: 14px; height: 14px; }
.mig-step.done .mig-step-dot { background: var(--terracotta-300); color: var(--crema-100); }
.mig-step.current .mig-step-dot { background: var(--terracotta); color: var(--crema-100); }
.mig-step-label { font-size: 12px; font-weight: 600; color: var(--fg3); white-space: nowrap; }
.mig-step.current .mig-step-label { color: var(--fg1); }
.mig-step.done .mig-step-label { color: var(--fg2); }

/* ---- Tarjeta de paso ---- */
.mig-card {
  margin: 0 20px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 22px 20px;
}
.mig-card-head { margin-bottom: 18px; }
.mig-h2 { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: var(--fg1); margin: 0; line-height: 1.2; }
.mig-sub { font-size: 13px; color: var(--fg2); line-height: 1.5; margin: 6px 0 0; }
.mig-sub b { color: var(--fg1); }

/* ---- Bienvenida / Listo ---- */
.mig-welcome { text-align: center; }
.mig-hero-ico {
  width: 64px; height: 64px; border-radius: 20px;
  background: var(--terracotta); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  margin: 4px auto 14px;
  box-shadow: 0 12px 28px rgba(201, 106, 67, 0.3);
}
.mig-hero-ico.done { background: var(--oliva); box-shadow: 0 12px 28px rgba(110, 123, 97, 0.3); }
.mig-hero-ico .iconify { width: 30px; height: 30px; }
.mig-welcome .mig-h2 { text-align: center; }
.mig-lead { font-size: 14px; line-height: 1.6; color: var(--fg2); margin: 8px 0 0; }
.mig-checklist {
  list-style: none; padding: 0; margin: 20px 0 0;
  display: flex; flex-direction: column; gap: 10px; text-align: left;
}
.mig-checklist li {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 13.5px; color: var(--fg2); line-height: 1.4;
  background: var(--crema-100); border-radius: 12px; padding: 11px 13px;
}
.mig-checklist b { color: var(--fg1); }
.mig-num {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  background: var(--terracotta-100); color: var(--terracotta-700);
  font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.mig-opt {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--crema-200); color: var(--fg3);
  padding: 1px 6px; border-radius: 999px; margin-left: 4px;
}

/* ---- Formulario de config ---- */
.mig-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mig-row-2 .field-block { margin-bottom: 20px; }
.mig-err { font-size: 12px; color: var(--danger); margin: 6px 0 0; }
.mig-hours-label { margin-top: 4px; }
.mig-days {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle); border-radius: 12px;
  overflow: hidden; margin-bottom: 4px;
}
.mig-day { padding: 11px 13px; border-bottom: 1px solid var(--border-subtle); }
.mig-day:last-child { border-bottom: none; }
.mig-day.closed { background: var(--crema-50); }
.mig-day-head { display: flex; align-items: center; justify-content: space-between; }
.mig-day-name { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.mig-day.closed .mig-day-name { color: var(--fg3); }
.mig-day-times { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
.mig-day-times input[type="time"] {
  background: var(--crema-50); border: 1px solid var(--border); border-radius: 10px;
  padding: 7px 9px; font: inherit; font-size: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: var(--fg1); outline: none;
}
.mig-day-times input[type="time"]:focus { border-color: var(--terracotta); }
.mig-day-times > span { color: var(--fg3); }
.mig-copy {
  margin-left: auto;
  width: 32px; height: 34px; border-radius: 10px;
  background: transparent; border: 1px solid var(--border); color: var(--fg3);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.mig-copy:hover { background: var(--crema-200); color: var(--fg1); }
.mig-copy .iconify { width: 14px; height: 14px; }

/* ---- Plantilla + upload (reusa el lenguaje de stock/index.vue) ---- */
.mig-template {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: var(--crema-100); border-radius: 12px; padding: 10px 12px;
  margin-bottom: 14px;
}
.mig-template code {
  font-family: var(--font-mono); font-size: 11px; color: var(--fg2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mig-drop {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 22px; border: 1.5px dashed var(--border); border-radius: 14px;
  cursor: pointer; font-weight: 600; color: var(--fg1); background: var(--bg2, var(--crema-50));
  text-align: center;
}
.mig-drop span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mig-drop.busy { opacity: 0.7; cursor: default; }
.mig-drop .spin { animation: mig-spin 0.9s linear infinite; }
@keyframes mig-spin { to { transform: rotate(360deg); } }

/* ---- Reporte ---- */
.mig-report { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.mig-report-mode {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  font-size: 12px; font-weight: 600; color: var(--oliva-700);
  background: var(--success-bg); padding: 4px 10px; border-radius: 999px;
}
.mig-report-mode.dry { color: var(--mostaza-700); background: var(--warning-bg); }
.mig-report-mode .iconify { width: 13px; height: 13px; }
.mig-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.mig-stats span { font-size: 12.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.mig-stats .ok { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
.mig-stats .upd { background: var(--crema-200); color: var(--fg2); }
.mig-stats .err { background: color-mix(in srgb, var(--danger) 16%, transparent); color: var(--danger); }
.mig-errors {
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 4px;
  max-height: 180px; overflow: auto;
}
.mig-errors li { font-size: 12px; color: var(--fg2); }
.mig-errors b { color: var(--danger); }
.mig-confirm { margin-top: 4px; }

/* ---- Resumen final ---- */
.mig-summary {
  list-style: none; padding: 0; margin: 20px 0 0;
  display: flex; flex-direction: column; gap: 9px; text-align: left;
}
.mig-summary li {
  display: flex; align-items: center; gap: 10px;
  font-size: 13.5px; font-weight: 500; color: var(--fg1);
  background: var(--crema-100); border: 1px solid var(--border-subtle);
  border-radius: 12px; padding: 11px 13px;
}
.mig-summary .iconify { width: 18px; height: 18px; color: var(--fg3); flex-shrink: 0; }
.mig-summary .iconify.ok { color: var(--oliva); }
.mig-tip {
  display: flex; align-items: flex-start; gap: 10px; text-align: left;
  margin-top: 16px;
  background: var(--crema-100); border: 1px dashed var(--terracotta-300);
  border-radius: 12px; padding: 12px 14px;
  font-size: 13px; line-height: 1.5; color: var(--fg2);
}
.mig-tip b { color: var(--fg1); }
.mig-tip .iconify { width: 16px; height: 16px; color: var(--mostaza-700); flex-shrink: 0; margin-top: 1px; }

/* ---- CTAs ---- */
.mig-cta { margin-top: 22px; }
.mig-cta-row { display: flex; gap: 10px; align-items: center; }
.mig-cta-row > :first-child { flex-shrink: 0; }
</style>
