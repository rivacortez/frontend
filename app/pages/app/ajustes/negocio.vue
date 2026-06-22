<script setup lang="ts">
import type { BusinessSettings } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Negocio — GastronomIA' })

const { data: settings } = useAppSettings()
const update = useUpdateSettings('business')
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner')

const form = reactive<BusinessSettings>({
  name: '', legalName: '', ruc: '', address: '', district: '', phone: '', email: '',
})

watch(settings, (s) => {
  if (s) Object.assign(form, s.business)
}, { immediate: true })

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
    <UiScreenHeader title="Negocio" subtitle="Identidad y datos fiscales" back="/app/ajustes" />

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
        <div class="field-label"><span>Nombre comercial</span></div>
        <input v-model="form.name" class="field-input" type="text" aria-label="Nombre comercial" :disabled="readonly">
      </div>
      <div class="field-block">
        <div class="field-label"><span>Razón social</span></div>
        <input v-model="form.legalName" class="field-input" type="text" aria-label="Razón social" :disabled="readonly">
      </div>
      <div class="field-block">
        <div class="field-label"><span>RUC</span></div>
        <input v-model="form.ruc" class="field-input" type="text" inputmode="numeric" maxlength="11" aria-label="RUC" :disabled="readonly">
      </div>
    </section>

    <section class="st-card">
      <div class="field-block">
        <div class="field-label"><span>Dirección</span></div>
        <input v-model="form.address" class="field-input" type="text" aria-label="Dirección" :disabled="readonly">
      </div>
      <div class="field-block">
        <div class="field-label"><span>Distrito / Ciudad</span></div>
        <input v-model="form.district" class="field-input" type="text" aria-label="Distrito o ciudad" :disabled="readonly">
      </div>
      <div class="st-row-2">
        <div class="field-block">
          <div class="field-label"><span>Teléfono</span></div>
          <input v-model="form.phone" class="field-input" type="tel" aria-label="Teléfono" :disabled="readonly">
        </div>
        <div class="field-block">
          <div class="field-label"><span>Email</span></div>
          <input v-model="form.email" class="field-input" type="email" aria-label="Email" :disabled="readonly">
        </div>
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
.st-card {
  margin: 0 20px 16px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 18px;
}
.st-card .field-block:last-child { margin-bottom: 0; }
.st-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.st-row-2 .field-block { margin-bottom: 0; }
.field-input:disabled { opacity: 0.6; cursor: not-allowed; }
.st-cta { padding: 0 20px; }
</style>
