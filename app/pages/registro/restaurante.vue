<script setup lang="ts">
useSeoMeta({ title: 'Tu restaurante — GastronomIA' })

const store = useOnboardingStore()

if (!store.account.email) {
  await navigateTo('/registro')
}

const CUISINES = ['Criolla', 'Marina', 'Chifa', 'Pollería', 'Parrillas', 'Café', 'Bar / Restobar', 'Otra']

const canContinue = computed(() =>
  store.restaurant.name.trim().length >= 2 && store.restaurant.cuisine !== '',
)

function next(): void {
  if (!canContinue.value) return
  void navigateTo('/registro/configuracion')
}
</script>

<template>
  <OnboardingStepShell
    :step="3"
    :title="`Hola ${store.firstName}, cuéntanos de tu local`"
    subtitle="Esto personaliza tus reportes y el chat IA."
    back="/registro/verificar"
  >
    <div class="rs-form">
      <div class="field-block">
        <div class="field-label"><span>Nombre del restaurante</span></div>
        <input v-model="store.restaurant.name" class="field-input" type="text" placeholder="Ej: Motif Restobar Karaoke" aria-label="Nombre del restaurante">
      </div>

      <div class="field-block">
        <div class="field-label"><span>Tipo de cocina</span></div>
        <div class="rs-cuisines" role="radiogroup" aria-label="Tipo de cocina">
          <button
            v-for="c in CUISINES"
            :key="c"
            role="radio"
            :aria-checked="store.restaurant.cuisine === c"
            class="rs-cuisine"
            :class="{ on: store.restaurant.cuisine === c }"
            @click="store.restaurant.cuisine = c"
          >{{ c }}</button>
        </div>
      </div>

      <div class="field-block">
        <div class="field-label">
          <span>Dirección</span>
          <span class="hint">opcional</span>
        </div>
        <input v-model="store.restaurant.address" class="field-input" type="text" placeholder="Av. Próceres 1532, SJL" aria-label="Dirección">
      </div>

      <div class="rs-row">
        <div class="field-block">
          <div class="field-label">
            <span>Teléfono</span>
            <span class="hint">opcional</span>
          </div>
          <input v-model="store.restaurant.phone" class="field-input" type="tel" placeholder="+51 987 654 321" aria-label="Teléfono">
        </div>
        <div class="field-block">
          <div class="field-label">
            <span>RUC</span>
            <span class="hint">opcional</span>
          </div>
          <input v-model="store.restaurant.ruc" class="field-input" type="text" inputmode="numeric" maxlength="11" placeholder="20…" aria-label="RUC">
        </div>
      </div>
    </div>

    <template #cta>
      <UButton size="xl" block trailing-icon="i-lucide-arrow-right" :disabled="!canContinue" @click="next">
        Continuar
      </UButton>
    </template>
  </OnboardingStepShell>
</template>

<style scoped>
.rs-cuisines { display: flex; flex-wrap: wrap; gap: 6px; }
.rs-cuisine {
  font: inherit; font-size: 13px; font-weight: 600;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.rs-cuisine.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.rs-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>
