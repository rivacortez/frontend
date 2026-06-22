<script setup lang="ts">
useSeoMeta({ title: 'Importa tus datos — GastronomIA' })

const store = useOnboardingStore()

if (!store.account.email) {
  await navigateTo('/registro')
}

const selected = ref<'tumisoft' | 'csv' | 'none' | null>(null)

const SOURCES = [
  { id: 'tumisoft' as const, label: 'TumiSoft', sub: 'Importa ventas e inventario automáticamente', icon: 'i-lucide-plug-zap', badge: 'Recomendado' },
  { id: 'csv' as const, label: 'Archivo CSV / Excel', sub: 'Exporta desde tu sistema actual y súbelo', icon: 'i-lucide-file-spreadsheet' },
  { id: 'none' as const, label: 'Empezar desde cero', sub: 'Registra todo directamente en GastronomIA', icon: 'i-lucide-sparkles' },
]

function next(): void {
  if (!selected.value) return
  store.importDone = selected.value !== 'none'
  void navigateTo('/registro/listo')
}
</script>

<template>
  <OnboardingStepShell
    :step="5"
    title="¿Traes datos de otro sistema?"
    subtitle="Si ya usas un POS o llevas Excel, podemos importar tu historial para que la IA aprenda de él."
    back="/registro/configuracion"
  >
    <div class="im-sources" role="radiogroup" aria-label="Fuente de datos">
      <button
        v-for="s in SOURCES"
        :key="s.id"
        role="radio"
        :aria-checked="selected === s.id"
        class="im-source"
        :class="{ on: selected === s.id }"
        @click="selected = s.id"
      >
        <span class="im-ico" aria-hidden="true"><UIcon :name="s.icon" /></span>
        <span class="im-body">
          <span class="im-label">
            {{ s.label }}
            <span v-if="s.badge" class="im-badge">{{ s.badge }}</span>
          </span>
          <span class="im-sub">{{ s.sub }}</span>
        </span>
        <span class="im-radio" aria-hidden="true"><UIcon name="i-lucide-check" /></span>
      </button>
    </div>

    <p class="im-note">
      <UIcon name="i-lucide-info" />
      La importación corre en segundo plano: podrás usar la app mientras procesamos tus datos desde <b>Datos → Importar</b>.
    </p>

    <template #cta>
      <UButton size="xl" block trailing-icon="i-lucide-arrow-right" :disabled="!selected" @click="next">
        {{ selected === 'none' ? 'Empezar desde cero' : 'Continuar' }}
      </UButton>
    </template>
  </OnboardingStepShell>
</template>

<style scoped>
.im-sources { display: flex; flex-direction: column; gap: 10px; }
.im-source {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1.5px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.im-source.on { border-color: var(--terracotta); background: linear-gradient(160deg, var(--pure-white), #FCF4EE); }
.im-ico {
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.im-ico .iconify { width: 20px; height: 20px; }
.im-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.im-label {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.im-badge {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--success-bg); color: var(--oliva-700);
  padding: 2px 7px; border-radius: 999px;
}
.im-sub { font-size: 12px; color: var(--fg3); line-height: 1.4; }
.im-radio {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1.5px solid var(--border);
  color: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.im-source.on .im-radio { background: var(--terracotta); border-color: var(--terracotta); color: var(--crema-100); }
.im-radio .iconify { width: 13px; height: 13px; }
.im-note {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: var(--fg3);
  margin: 16px 0 0;
  line-height: 1.5;
}
.im-note .iconify { width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px; }
.im-note b { color: var(--fg2); }
</style>
