<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Magic Upload — GastronomIA' })

const createMovement = useCreateMovement()
const toast = useToast()
const { user } = useUserSession()

interface MagicLine {
  ingredientId: string | null
  name: string
  qty: number
  unit: string
  unitCost: number
  total: number
}

interface MagicResult {
  vendor: string
  ruc: string
  date: string
  confidence: number
  lines: MagicLine[]
  total: number
}

type Phase = 'pick' | 'analyzing' | 'review' | 'done'

const phase = ref<Phase>('pick')
const preview = ref<string | null>(null)
const fileName = ref('')
const result = ref<MagicResult | null>(null)
const confirming = ref(false)
const registered = ref(0)

const fileInput = ref<HTMLInputElement | null>(null)

const mappedLines = computed(() => result.value?.lines.filter(l => l.ingredientId) ?? [])
const unmappedLines = computed(() => result.value?.lines.filter(l => !l.ingredientId) ?? [])
const liveTotal = computed(() =>
  (result.value?.lines ?? []).reduce((sum, l) => sum + l.qty * l.unitCost, 0),
)

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  fileName.value = file.name
  preview.value = URL.createObjectURL(file)
  phase.value = 'analyzing'

  try {
    const res = await $fetch<ApiResponse<MagicResult>>('/api/magic-upload', {
      method: 'POST',
      body: { fileName: file.name },
    })
    result.value = res.data
    phase.value = 'review'
  }
  catch {
    toast.add({ title: 'No pudimos analizar la imagen', icon: 'i-lucide-alert-circle', color: 'error' })
    phase.value = 'pick'
  }
}

async function confirm(): Promise<void> {
  if (!result.value || confirming.value) return
  confirming.value = true
  try {
    for (const line of mappedLines.value) {
      if (!line.ingredientId || line.qty <= 0) continue
      await createMovement.mutateAsync({
        ingredientId: line.ingredientId,
        type: 'purchase',
        qty: line.qty,
        note: `Factura ${result.value.vendor}`,
        user: user.value?.name,
      })
    }
    registered.value = mappedLines.value.length
    phase.value = 'done'
  }
  finally {
    confirming.value = false
  }
}

function reset(): void {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = null
  result.value = null
  fileName.value = ''
  phase.value = 'pick'
}

onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>

<template>
  <div class="mu-screen">
    <UiScreenHeader title="Magic Upload" subtitle="Escanea facturas con IA" back="/app/inventario" />

    <!-- ===== Pick ===== -->
    <template v-if="phase === 'pick'">
      <section class="mu-hero">
        <div class="mu-hero-ico" aria-hidden="true">
          <UIcon name="i-lucide-scan-line" />
          <span class="spark"><UIcon name="i-lucide-sparkles" /></span>
        </div>
        <h2 class="mu-hero-title">Toma una foto de tu factura</h2>
        <p class="mu-hero-sub">
          La IA extrae proveedor, productos y precios, y actualiza tu inventario
          y costos en segundos. Sin tipear nada.
        </p>
      </section>

      <div class="mu-pick">
        <button class="btn btn-primary btn-lg btn-block" @click="fileInput?.click()">
          <UIcon name="i-lucide-camera" /> Tomar foto o elegir imagen
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          aria-label="Foto de la factura"
          @change="onFile"
        >
        <div class="mu-steps">
          <div class="mu-step"><span class="n">1</span> Fotografía la factura completa</div>
          <div class="mu-step"><span class="n">2</span> Revisa las líneas extraídas</div>
          <div class="mu-step"><span class="n">3</span> Confirma y el stock se actualiza</div>
        </div>
      </div>
    </template>

    <!-- ===== Analyzing ===== -->
    <template v-else-if="phase === 'analyzing'">
      <section class="mu-analyzing">
        <div class="mu-preview-wrap">
          <img v-if="preview" :src="preview" alt="Factura subida" class="mu-preview">
          <div class="mu-scanline" aria-hidden="true" />
        </div>
        <div class="mu-analyzing-text">
          <UIcon name="i-lucide-sparkles" class="pulse" />
          <b>Analizando con IA…</b>
          <span>Detectando proveedor, productos y montos</span>
        </div>
      </section>
    </template>

    <!-- ===== Review ===== -->
    <template v-else-if="phase === 'review' && result">
      <section class="mu-vendor">
        <div class="mu-vendor-row">
          <span class="mu-vendor-ico"><UIcon name="i-lucide-store" /></span>
          <div class="mu-vendor-body">
            <b>{{ result.vendor }}</b>
            <span>RUC {{ result.ruc }} · {{ result.date }}</span>
          </div>
          <span class="mu-confidence" :title="`Confianza del modelo`">
            <UIcon name="i-lucide-sparkles" /> {{ Math.round(result.confidence * 100) }} %
          </span>
        </div>
      </section>

      <section class="mu-section">
        <div class="field-label">
          <span>Líneas extraídas</span>
          <span class="hint">{{ result.lines.length }} productos</span>
        </div>
        <div class="mu-lines">
          <div v-for="(line, i) in result.lines" :key="i" class="mu-line" :class="{ unmapped: !line.ingredientId }">
            <div class="mu-line-head">
              <span class="mu-line-name">{{ line.name }}</span>
              <span v-if="!line.ingredientId" class="mu-unmapped-tag">
                <UIcon name="i-lucide-alert-triangle" /> No mapeado
              </span>
            </div>
            <div class="mu-line-fields">
              <label class="mu-field">
                <span>Cant.</span>
                <input v-model.number="line.qty" type="number" min="0" step="0.5" inputmode="decimal">
              </label>
              <span class="mu-unit">{{ line.unit }}</span>
              <label class="mu-field">
                <span>Costo/u</span>
                <input v-model.number="line.unitCost" type="number" min="0" step="0.1" inputmode="decimal">
              </label>
              <span class="mu-line-total">{{ formatPEN(line.qty * line.unitCost) }}</span>
            </div>
          </div>
        </div>
        <p v-if="unmappedLines.length" class="mu-note">
          <UIcon name="i-lucide-info" />
          {{ unmappedLines.length }} producto{{ unmappedLines.length > 1 ? 's' : '' }} sin mapear se omitirá{{ unmappedLines.length > 1 ? 'n' : '' }}.
          Podrás crearlo{{ unmappedLines.length > 1 ? 's' : '' }} como insumo{{ unmappedLines.length > 1 ? 's' : '' }} luego.
        </p>
      </section>

      <div class="mu-summary">
        <span>Total factura</span>
        <b>{{ formatPEN(liveTotal) }}</b>
      </div>

      <div class="mu-cta-row">
        <button class="btn btn-ghost" @click="reset">
          <UIcon name="i-lucide-rotate-ccw" /> Reintentar
        </button>
        <button class="btn btn-primary" :disabled="mappedLines.length === 0 || confirming" @click="confirm">
          <UIcon :name="confirming ? 'i-lucide-loader-2' : 'i-lucide-check'" :class="{ spin: confirming }" />
          {{ confirming ? 'Registrando…' : `Confirmar ${mappedLines.length} compras` }}
        </button>
      </div>
    </template>

    <!-- ===== Done ===== -->
    <template v-else-if="phase === 'done'">
      <section class="mu-done">
        <div class="mu-done-ico"><UIcon name="i-lucide-check" /></div>
        <h2 class="mu-done-title">¡Inventario actualizado!</h2>
        <p class="mu-done-sub">
          {{ registered }} compra{{ registered > 1 ? 's' : '' }} registrada{{ registered > 1 ? 's' : '' }}
          de {{ result?.vendor }}. Los costos de tus recetas ya reflejan los nuevos precios.
        </p>
        <div class="mu-done-actions">
          <UButton to="/app/inventario" size="xl" block icon="i-lucide-package">Ver inventario</UButton>
          <UButton size="xl" block color="neutral" variant="outline" icon="i-lucide-scan-line" @click="reset">
            Escanear otra factura
          </UButton>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mu-screen {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.mu-hero { text-align: center; padding: 12px 32px 20px; }
.mu-hero-ico {
  position: relative;
  width: 72px; height: 72px; border-radius: 22px;
  background: linear-gradient(140deg, var(--terracotta) 0%, var(--terracotta-700) 100%);
  color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 12px 28px rgba(201, 106, 67, 0.35);
}
.mu-hero-ico .iconify { width: 32px; height: 32px; }
.mu-hero-ico .spark {
  position: absolute; top: -8px; right: -8px;
  color: var(--mostaza);
}
.mu-hero-ico .spark .iconify { width: 20px; height: 20px; }
.mu-hero-title {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 26px; line-height: 1.2;
  color: var(--fg1);
  margin: 0 0 8px;
}
.mu-hero-sub { font-size: 13.5px; line-height: 1.55; color: var(--fg2); margin: 0; }

.mu-pick { padding: 0 20px; }
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); border: 0;
}
.mu-steps {
  margin-top: 20px;
  display: flex; flex-direction: column; gap: 8px;
}
.mu-step {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--fg2);
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 12px;
}
.mu-step .n {
  width: 24px; height: 24px; border-radius: 8px;
  background: var(--crema-200); color: var(--terracotta-700);
  font-size: 12px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.mu-analyzing { padding: 0 20px; text-align: center; }
.mu-preview-wrap {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  max-height: 380px;
  box-shadow: var(--shadow-lg);
}
.mu-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
.mu-scanline {
  position: absolute; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--terracotta), transparent);
  box-shadow: 0 0 16px rgba(201, 106, 67, 0.8);
  animation: scan 1.8s ease-in-out infinite;
}
@keyframes scan {
  0%, 100% { top: 8%; }
  50% { top: 88%; }
}
.mu-analyzing-text {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  margin-top: 18px;
}
.mu-analyzing-text b { font-size: 16px; color: var(--fg1); }
.mu-analyzing-text span { font-size: 12.5px; color: var(--fg3); }
.mu-analyzing-text .iconify { width: 22px; height: 22px; color: var(--terracotta); }
.pulse { animation: muPulse 1.2s ease-in-out infinite; }
@keyframes muPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.15); }
}

.mu-vendor { padding: 0 20px; margin-bottom: 16px; }
.mu-vendor-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 13px 14px;
}
.mu-vendor-ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mu-vendor-ico .iconify { width: 18px; height: 18px; }
.mu-vendor-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mu-vendor-body b { font-size: 14px; color: var(--fg1); }
.mu-vendor-body span { font-size: 11.5px; color: var(--fg3); }
.mu-confidence {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11.5px; font-weight: 700;
  background: var(--success-bg); color: var(--oliva-700);
  padding: 4px 9px; border-radius: 999px;
  flex-shrink: 0;
}
.mu-confidence .iconify { width: 12px; height: 12px; }

.mu-section { padding: 0 20px; margin-bottom: 14px; }
.mu-lines { display: flex; flex-direction: column; gap: 8px; }
.mu-line {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
}
.mu-line.unmapped { border-style: dashed; border-color: var(--mostaza); opacity: 0.85; }
.mu-line-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 8px;
}
.mu-line-name { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.mu-unmapped-tag {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  background: var(--warning-bg); color: var(--mostaza-700);
  padding: 3px 8px; border-radius: 999px;
}
.mu-unmapped-tag .iconify { width: 11px; height: 11px; }
.mu-line-fields { display: flex; align-items: center; gap: 8px; }
.mu-field {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1;
}
.mu-field span { font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg3); }
.mu-field input {
  width: 100%;
  background: var(--crema-50);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 7px 9px;
  font: inherit; font-size: 13.5px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
  outline: none;
}
.mu-field input:focus { border-color: var(--terracotta); }
.mu-unit { font-size: 12px; color: var(--fg3); align-self: flex-end; padding-bottom: 9px; }
.mu-line-total {
  font-family: var(--font-mono);
  font-size: 13px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
  align-self: flex-end;
  padding-bottom: 8px;
  min-width: 72px;
  text-align: right;
}
.mu-note {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: var(--fg3);
  margin: 10px 0 0;
  line-height: 1.45;
}
.mu-note .iconify { width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px; }

.mu-summary {
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 20px 14px;
  background: var(--espresso);
  color: var(--crema-100);
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 14px;
}
.mu-summary b { font-size: 19px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }

.mu-cta-row {
  display: grid; grid-template-columns: auto 1fr;
  gap: 10px;
  padding: 0 20px;
}
.mu-cta-row .btn { min-height: 48px; border-radius: 12px; justify-content: center; font-size: 14px; }

.mu-done { text-align: center; padding: 32px 32px 0; }
.mu-done-ico {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--oliva); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  animation: muPop 360ms var(--ease-emphasis);
}
@keyframes muPop {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.mu-done-ico .iconify { width: 34px; height: 34px; }
.mu-done-title {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 26px;
  color: var(--fg1);
  margin: 0 0 8px;
}
.mu-done-sub { font-size: 13.5px; line-height: 1.55; color: var(--fg2); margin: 0 0 24px; }
.mu-done-actions { display: flex; flex-direction: column; gap: 10px; }

.spin { animation: spinAnim 0.9s linear infinite; }
@keyframes spinAnim { to { transform: rotate(360deg); } }
</style>
