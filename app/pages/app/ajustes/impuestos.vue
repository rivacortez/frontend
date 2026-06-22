<script setup lang="ts">
import type { TaxSettings } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Impuestos — GastronomIA' })

const { data: settings } = useAppSettings()
const update = useUpdateSettings('tax')
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner')

const form = reactive<TaxSettings>({ igvPct: 18, pricesIncludeTax: true, boletaSerie: 'B001', facturaSerie: 'F001' })

watch(settings, (s) => {
  if (s) Object.assign(form, s.tax)
}, { immediate: true })

const examplePrice = 38
const exampleBase = computed(() =>
  form.pricesIncludeTax
    ? +(examplePrice / (1 + form.igvPct / 100)).toFixed(2)
    : examplePrice,
)
const exampleTotal = computed(() =>
  form.pricesIncludeTax
    ? examplePrice
    : +(examplePrice * (1 + form.igvPct / 100)).toFixed(2),
)

const saving = ref(false)

async function save(): Promise<void> {
  if (readonly.value || saving.value) return
  saving.value = true
  try {
    await update.mutateAsync({ ...form })
    toast.add({ title: 'Cambios guardados', icon: 'i-lucide-check' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="st-screen">
    <UiScreenHeader title="Impuestos" subtitle="IGV y series de comprobantes" back="/app/ajustes" />

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo el propietario puede editar los ajustes"
      class="st-readonly"
    />

    <section class="st-card">
      <div class="field-block">
        <div class="field-label">
          <span>IGV (%)</span>
          <span class="hint">tasa vigente: 18 %</span>
        </div>
        <input v-model.number="form.igvPct" class="field-input tax-input" type="number" min="0" max="30" :disabled="readonly">
      </div>

      <label class="tax-toggle">
        <span class="tax-toggle-body">
          <b>Mis precios ya incluyen IGV</b>
          <span>El precio de carta es el precio final al cliente</span>
        </span>
        <USwitch v-model="form.pricesIncludeTax" :disabled="readonly" />
      </label>

      <div class="tax-example" aria-live="polite">
        <div class="row"><span>Ceviche Clásico (carta)</span><b>{{ formatPEN(examplePrice) }}</b></div>
        <div class="row"><span>Base imponible</span><b>{{ formatPEN(exampleBase) }}</b></div>
        <div class="row total"><span>Total al cliente</span><b>{{ formatPEN(exampleTotal) }}</b></div>
      </div>
    </section>

    <section class="st-card">
      <div class="field-label"><span>Series de comprobantes</span></div>
      <div class="tax-series">
        <label class="tax-serie">
          <span>Boletas</span>
          <input v-model="form.boletaSerie" type="text" maxlength="4" :disabled="readonly">
        </label>
        <label class="tax-serie">
          <span>Facturas</span>
          <input v-model="form.facturaSerie" type="text" maxlength="4" :disabled="readonly">
        </label>
      </div>
      <p class="tax-note">
        <UIcon name="i-lucide-info" />
        La numeración es correlativa por serie. La facturación electrónica SUNAT llega en una fase posterior.
      </p>
    </section>

    <div class="st-cta">
      <button class="btn btn-primary btn-lg btn-block" :disabled="readonly || saving" @click="save">
        <UIcon name="i-lucide-check" /> Guardar cambios
      </button>
    </div>
  </div>
</template>

<style scoped>
.st-screen { max-width: 560px; margin: 0 auto; padding-bottom: 24px; }
.st-readonly { margin: 0 20px 16px; }
.st-card {
  margin: 0 20px 16px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 18px;
}
.tax-input { font-size: 18px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; max-width: 120px; }
.field-input:disabled { opacity: 0.6; cursor: not-allowed; }
.tax-toggle {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 0;
  cursor: pointer;
}
.tax-toggle-body { display: flex; flex-direction: column; gap: 1px; }
.tax-toggle-body b { font-size: 13.5px; color: var(--fg1); }
.tax-toggle-body span { font-size: 11.5px; color: var(--fg3); }
.tax-example {
  background: var(--crema-100);
  border-radius: 12px;
  padding: 12px 14px;
  margin-top: 4px;
}
.tax-example .row {
  display: flex; justify-content: space-between;
  font-size: 12.5px; color: var(--fg3);
  padding: 2px 0;
}
.tax-example .row b { color: var(--fg1); font-variant-numeric: tabular-nums; }
.tax-example .row.total { padding-top: 6px; font-weight: 600; color: var(--fg1); }
.tax-example .row.total b { color: var(--terracotta-700); }
.tax-series { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tax-serie { display: flex; flex-direction: column; gap: 3px; }
.tax-serie span {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg3);
}
.tax-serie input {
  background: var(--crema-50);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 15px; font-weight: 600;
  color: var(--fg1);
  outline: none;
  text-transform: uppercase;
}
.tax-serie input:focus { border-color: var(--terracotta); }
.tax-serie input:disabled { opacity: 0.6; }
.tax-note {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 11.5px; color: var(--fg3);
  margin: 12px 0 0;
  line-height: 1.45;
}
.tax-note .iconify { width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }
.st-cta { padding: 0 20px; }
</style>
