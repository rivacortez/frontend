<script setup lang="ts">
import type { PaymentsSettings } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Pagos — GastronomIA' })

const { data: settings } = useAppSettings()
const update = useUpdateSettings('payments')
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner')

const form = reactive<PaymentsSettings>({ cash: true, card: true, yape: true, plin: true, tipPct: 10 })

watch(settings, (s) => {
  if (s) Object.assign(form, s.payments)
}, { immediate: true })

const METHODS = [
  { key: 'cash' as const, label: 'Efectivo', sub: 'Caja con control de vuelto', icon: 'i-lucide-banknote' },
  { key: 'card' as const, label: 'Tarjeta', sub: 'POS externo (Izipay, Niubiz)', icon: 'i-lucide-credit-card' },
  { key: 'yape' as const, label: 'Yape', sub: 'QR · BCP', icon: 'i-lucide-smartphone' },
  { key: 'plin' as const, label: 'Plin', sub: 'QR · multibanco', icon: 'i-lucide-smartphone' },
]

const TIP_OPTIONS = [0, 5, 10, 15]

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
    <UiScreenHeader title="Pagos" subtitle="Métodos que aceptas en el POS" back="/app/ajustes" />

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo el propietario puede editar los ajustes"
      class="st-readonly"
    />

    <section class="st-list">
      <label v-for="m in METHODS" :key="m.key" class="st-method">
        <span class="st-method-ico" aria-hidden="true"><UIcon :name="m.icon" /></span>
        <span class="st-method-body">
          <span class="st-method-label">{{ m.label }}</span>
          <span class="st-method-sub">{{ m.sub }}</span>
        </span>
        <USwitch v-model="form[m.key]" :disabled="readonly" />
      </label>
    </section>

    <section class="st-card">
      <div class="field-label">
        <span>Servicio sugerido</span>
        <span class="hint">se ofrece al cobrar</span>
      </div>
      <div class="st-tip-chips" role="radiogroup">
        <button
          v-for="t in TIP_OPTIONS"
          :key="t"
          role="radio"
          :aria-checked="form.tipPct === t"
          class="st-tip-chip"
          :class="{ on: form.tipPct === t }"
          :disabled="readonly"
          @click="form.tipPct = t"
        >{{ t === 0 ? 'Sin servicio' : `${t} %` }}</button>
      </div>
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
.st-list {
  margin: 0 20px 16px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--pure-white);
  overflow: hidden;
}
.st-method {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}
.st-method:last-child { border-bottom: none; }
.st-method-ico {
  width: 38px; height: 38px; border-radius: 11px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.st-method-ico .iconify { width: 18px; height: 18px; }
.st-method-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.st-method-label { font-size: 14px; font-weight: 600; color: var(--fg1); }
.st-method-sub { font-size: 11.5px; color: var(--fg3); }
.st-card {
  margin: 0 20px 16px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
}
.st-tip-chips { display: flex; gap: 6px; }
.st-tip-chip {
  flex: 1;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 9px 0;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.st-tip-chip.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.st-tip-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.st-cta { padding: 0 20px; }
</style>
