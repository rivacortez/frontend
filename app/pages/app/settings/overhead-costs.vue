<script setup lang="ts">
import type { OverheadCost } from '~/composables/use-costing'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Costos indirectos (CIF) — GastronomIA' })

const toast = useToast()
const { user } = useUserSession()

// Costeo = info de gestión (CASL Report): owner/manager. El backend devuelve 403 a
// staff igualmente; aquí solo se bloquea la edición y se avisa.
const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

// Período seleccionado (YYYY-MM). Por defecto el mes actual (zona America/Lima).
function currentPeriod(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Lima',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  return `${y}-${m}`
}
const period = ref(currentPeriod())

const { data: costs, isLoading } = useOverheadCosts(period)
const { mutateAsync: createCost, isLoading: creating } = useCreateOverheadCost()
const { mutateAsync: updateCost, isLoading: updating } = useUpdateOverheadCost()
const { mutateAsync: deleteCost } = useDeleteOverheadCost()

const all = computed(() => costs.value ?? [])
const total = computed(() => all.value.reduce((sum, c) => sum + Number(c.amount), 0))

function periodLabel(p: string): string {
  const [y, m] = p.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
}

/* ---- Crear / editar ---- */
const showForm = ref(false)
const editing = ref<OverheadCost | null>(null)
const form = reactive({ concept: '', amount: '' })

function openCreate(): void {
  if (readonly.value) return
  editing.value = null
  form.concept = ''
  form.amount = ''
  showForm.value = true
}

function openEdit(c: OverheadCost): void {
  if (readonly.value) return
  editing.value = c
  form.concept = c.concept
  form.amount = c.amount
  showForm.value = true
}

const busy = computed(() => creating.value || updating.value)

async function submit(): Promise<void> {
  const concept = form.concept.trim()
  const amount = Number(form.amount)
  if (!concept) {
    toast.add({ title: 'El concepto es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!(amount > 0)) {
    toast.add({ title: 'El monto debe ser mayor que 0', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  try {
    if (editing.value) {
      await updateCost({ id: editing.value.id, concept, amount })
      toast.add({ title: 'CIF actualizado', icon: 'i-lucide-check-circle-2' })
    }
    else {
      await createCost({ period: period.value, concept, amount })
      toast.add({ title: 'CIF agregado', icon: 'i-lucide-check-circle-2' })
    }
    showForm.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo guardar el costo indirecto'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function remove(c: OverheadCost): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Eliminar el costo "${c.concept}"?`)) return
  try {
    await deleteCost(c.id)
    toast.add({ title: 'CIF eliminado', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo eliminar el costo indirecto'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader title="Costos indirectos (CIF)" :subtitle="`${all.length} concepto${all.length === 1 ? '' : 's'} · ${periodLabel(period)}`" back="/app/settings">
      <template #trailing>
        <button v-if="!readonly" class="cat-add-btn" aria-label="Nuevo costo indirecto" @click="openCreate">
          <UIcon name="i-lucide-plus" />
        </button>
      </template>
    </UiScreenHeader>

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo propietario y encargado gestionan los costos indirectos"
      class="cat-readonly"
    />

    <p class="cat-intro">
      <UIcon name="i-lucide-info" />
      Los <b>costos indirectos de fabricación (CIF)</b> —alquiler, sueldos, servicios— se cargan por mes y se prorratean entre las unidades vendidas para calcular el costo total de cada plato.
    </p>

    <!-- Selector de período -->
    <div class="ovh-period">
      <label class="ovh-period-field">
        <span>Período</span>
        <input v-model="period" type="month" aria-label="Período (mes)">
      </label>
      <div class="ovh-period-total">
        <span class="ovh-period-total-label">Total CIF del mes</span>
        <span class="ovh-period-total-val">{{ formatPEN(total) }}</span>
      </div>
    </div>

    <div v-if="all.length" class="cat-list ovh-list">
      <div v-for="c in all" :key="c.id" class="cat-row">
        <span class="ovh-ico" aria-hidden="true"><UIcon name="i-lucide-receipt-text" /></span>
        <div class="cat-row-body">
          <div class="cat-row-name">{{ c.concept }}</div>
          <div class="cat-row-sub">{{ formatPEN(Number(c.amount)) }}</div>
        </div>
        <div v-if="!readonly" class="cat-row-actions">
          <button class="cat-icon-btn" aria-label="Editar" @click="openEdit(c)"><UIcon name="i-lucide-pencil" /></button>
          <button class="cat-icon-btn danger" aria-label="Eliminar" @click="remove(c)"><UIcon name="i-lucide-trash-2" /></button>
        </div>
      </div>
    </div>

    <UiEmptyState
      v-else-if="!isLoading"
      icon="i-lucide-receipt-text"
      title="Sin costos indirectos este mes"
      :subtitle="`Agrega los CIF de ${periodLabel(period)} (alquiler, sueldos, servicios) para prorratearlos sobre las ventas.`"
    >
      <button v-if="!readonly" class="btn btn-primary" @click="openCreate">
        <UIcon name="i-lucide-plus" /> Nuevo costo indirecto
      </button>
    </UiEmptyState>

    <UiBottomSheet v-model="showForm" :title="editing ? 'Editar costo indirecto' : 'Nuevo costo indirecto'" :subtitle="periodLabel(period)">
      <form class="cat-form" @submit.prevent="submit">
        <label class="cat-field">
          <span>Concepto</span>
          <input v-model="form.concept" type="text" placeholder="Alquiler del local">
        </label>
        <label class="cat-field">
          <span>Monto del mes (S/)</span>
          <input v-model="form.amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="3500.00">
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: busy }" />
            {{ editing ? 'Guardar cambios' : 'Agregar CIF' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.ovh-period {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;
  margin: 4px 0 16px;
}
.ovh-period-field { display: flex; flex-direction: column; gap: 6px; }
.ovh-period-field span { font-size: 12px; font-weight: 600; color: var(--fg2); }
.ovh-period-field input {
  font: inherit; font-size: 14px; color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
}
.ovh-period-field input:focus { outline: none; border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.ovh-period-total { text-align: right; }
.ovh-period-total-label { display: block; font-size: 11px; color: var(--fg3); }
.ovh-period-total-val {
  font-size: 18px; font-weight: 700; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.ovh-list { margin: 0; }
.ovh-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ovh-ico .iconify { width: 18px; height: 18px; }
</style>
