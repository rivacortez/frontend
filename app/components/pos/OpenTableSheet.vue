<script setup lang="ts">
import type { DiningTable } from '#shared/types/domain'

const props = defineProps<{
  table: DiningTable | null
}>()

const emit = defineEmits<{
  opened: [tableId: string]
}>()

const open = defineModel<boolean>({ required: true })

const toast = useToast()
const openTable = useOpenTable()

const guests = ref(2)
const waiter = ref('')
const busy = ref(false)

const seats = computed(() => props.table?.seats ?? 8)
const shortcuts = computed(() => [1, 2, 3, 4, 5, 6, 7, 8].filter(n => n <= seats.value))
const tableLabel = computed(() => String(props.table?.number ?? '').padStart(2, '0'))

watch(open, (isOpen) => {
  if (isOpen) {
    guests.value = Math.min(2, seats.value)
    waiter.value = ''
  }
})

function dec(): void {
  guests.value = Math.max(1, guests.value - 1)
}

function inc(): void {
  guests.value = Math.min(seats.value, guests.value + 1)
}

async function confirm(close: () => void): Promise<void> {
  if (!props.table || busy.value) return
  const table = props.table
  busy.value = true
  try {
    await openTable.mutateAsync({
      id: table.id,
      guests: guests.value,
      waiter: waiter.value.trim() || undefined,
    })
    toast.add({
      title: `Mesa ${tableLabel.value} abierta · ${guests.value} ${guests.value === 1 ? 'persona' : 'personas'}`,
      icon: 'i-lucide-check-circle-2',
    })
    close()
    emit('opened', table.id)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UiBottomSheet
    v-model="open"
    :title="`Abrir Mesa ${tableLabel}`"
    :subtitle="props.table ? `${props.table.zone} · Capacidad ${seats} personas` : undefined"
  >
    <!-- ¿Cuántas personas? -->
    <div class="field-block">
      <div class="field-label">
        ¿Cuántas personas?
        <span class="hint">máx {{ seats }}</span>
      </div>
      <div class="stepper" role="group" aria-label="Cantidad de personas">
        <button class="step-btn minus" :disabled="guests <= 1" aria-label="Disminuir personas" @click="dec">
          <UIcon name="i-lucide-minus" />
        </button>
        <div>
          <div class="step-value" aria-live="polite">{{ guests }}</div>
          <div class="step-value-label">{{ guests === 1 ? 'persona' : 'personas' }}</div>
        </div>
        <button class="step-btn plus" :disabled="guests >= seats" aria-label="Aumentar personas" @click="inc">
          <UIcon name="i-lucide-plus" />
        </button>
      </div>
      <div class="pax-shortcuts">
        <button
          v-for="n in shortcuts"
          :key="n"
          class="pax-chip"
          :class="{ active: guests === n }"
          :aria-pressed="guests === n"
          @click="guests = n"
        >{{ n }}</button>
      </div>
    </div>

    <!-- Mozo -->
    <div class="field-block">
      <div class="field-label">Mozo asignado <span class="hint">opcional</span></div>
      <input
        v-model="waiter"
        class="field-input"
        type="text"
        placeholder="Ej: Lucía"
        aria-label="Mozo asignado"
      >
    </div>

    <template #cta="{ close }">
      <button class="btn btn-primary btn-lg btn-block" :disabled="busy" @click="confirm(close)">
        <UIcon name="i-lucide-door-open" /> Abrir Mesa
      </button>
    </template>
  </UiBottomSheet>
</template>
