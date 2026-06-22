<script setup lang="ts">
import type { DayHours } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Horarios — GastronomIA' })

const { data: settings } = useAppSettings()
const update = useUpdateSettings('hours')
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner')

const days = ref<DayHours[]>([])

watch(settings, (s) => {
  if (s) days.value = s.hours.days.map(d => ({ ...d }))
}, { immediate: true })

const saving = ref(false)

async function save(): Promise<void> {
  if (readonly.value || saving.value) return
  saving.value = true
  try {
    await update.mutateAsync({ days: days.value })
    toast.add({ title: 'Horarios guardados', icon: 'i-lucide-check' })
  }
  finally {
    saving.value = false
  }
}

function copyToAll(source: DayHours): void {
  if (readonly.value) return
  for (const d of days.value) {
    if (d.day === source.day || d.closed) continue
    d.opens = source.opens
    d.closes = source.closes
  }
  toast.add({ title: `Horario de ${source.day} copiado a los días abiertos`, icon: 'i-lucide-copy' })
}
</script>

<template>
  <div class="st-screen">
    <UiScreenHeader title="Horarios" subtitle="Cuándo opera tu restaurante" back="/app/ajustes" />

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo el propietario puede editar los ajustes"
      class="st-readonly"
    />

    <section class="st-days">
      <div v-for="d in days" :key="d.day" class="st-day" :class="{ closed: d.closed }">
        <div class="st-day-head">
          <span class="st-day-name">{{ d.day }}</span>
          <div class="st-day-toggle">
            <span class="st-day-state">{{ d.closed ? 'Cerrado' : 'Abierto' }}</span>
            <USwitch :model-value="!d.closed" :disabled="readonly" @update:model-value="d.closed = !$event" />
          </div>
        </div>
        <div v-if="!d.closed" class="st-day-times">
          <label class="st-time">
            <span>Abre</span>
            <input v-model="d.opens" type="time" :disabled="readonly">
          </label>
          <span class="st-time-sep" aria-hidden="true">—</span>
          <label class="st-time">
            <span>Cierra</span>
            <input v-model="d.closes" type="time" :disabled="readonly">
          </label>
          <button v-if="!readonly" class="st-copy" :aria-label="`Copiar horario de ${d.day} a todos`" @click="copyToAll(d)">
            <UIcon name="i-lucide-copy" />
          </button>
        </div>
      </div>
    </section>

    <p class="st-hint">
      <UIcon name="i-lucide-info" />
      Los horarios alimentan el forecast de demanda: la IA no proyecta ventas en días cerrados.
    </p>

    <div class="st-cta">
      <button class="btn btn-primary btn-lg btn-block" :disabled="readonly || saving" @click="save">
        <UIcon name="i-lucide-check" /> Guardar horarios
      </button>
    </div>
  </div>
</template>

<style scoped>
.st-screen { max-width: 560px; margin: 0 auto; padding-bottom: 24px; }
.st-readonly { margin: 0 20px 16px; }
.st-days {
  margin: 0 20px 14px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--pure-white);
  overflow: hidden;
}
.st-day {
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.st-day:last-child { border-bottom: none; }
.st-day.closed { background: var(--crema-50); }
.st-day-head {
  display: flex; align-items: center; justify-content: space-between;
}
.st-day-name { font-size: 14px; font-weight: 600; color: var(--fg1); }
.st-day.closed .st-day-name { color: var(--fg3); }
.st-day-toggle { display: flex; align-items: center; gap: 10px; }
.st-day-state { font-size: 12px; color: var(--fg3); }
.st-day-times {
  display: flex; align-items: flex-end; gap: 8px;
  margin-top: 10px;
}
.st-time { min-width: 0; }
.st-time input { width: 100%; min-width: 0; }
.st-time { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.st-time span {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg3);
}
.st-time input {
  background: var(--crema-50);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit; font-size: 14px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
  outline: none;
}
.st-time input:focus { border-color: var(--terracotta); }
.st-time input:disabled { opacity: 0.6; }
.st-time-sep { color: var(--fg3); padding-bottom: 10px; }
.st-copy::after { content: ''; position: absolute; inset: -4px; }
.st-copy {
  position: relative;
  width: 32px; height: 36px; border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg3);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.st-copy:hover { background: var(--crema-200); color: var(--fg1); }
.st-copy .iconify { width: 15px; height: 15px; }
.st-hint {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: var(--fg3);
  margin: 0 20px 16px;
  line-height: 1.45;
}
.st-hint .iconify { width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px; }
.st-cta { padding: 0 20px; }
</style>
