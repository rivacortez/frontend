<script setup lang="ts">
import type { Unit, UnitFamily } from '~/composables/use-units'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Unidades de medida — GastronomIA' })

const { data: units } = useUnits()
const { mutateAsync: createUnit, isLoading: creating } = useCreateUnit()
const { mutateAsync: updateUnit, isLoading: updating } = useUpdateUnit()
const { mutateAsync: deleteUnit } = useDeleteUnit()
const toast = useToast()
const { user } = useUserSession()

// Config de catálogo: owner y manager editan; staff solo lee (alineado al CASL del backend).
const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

const FAMILY_LABEL: Record<UnitFamily, string> = {
  mass: 'Masa',
  volume: 'Volumen',
  count: 'Conteo',
}
const FAMILY_BASE: Record<UnitFamily, string> = {
  mass: 'g',
  volume: 'ml',
  count: 'unidad',
}

const all = computed(() => units.value ?? [])
const grouped = computed(() => {
  const map = new Map<UnitFamily, Unit[]>()
  for (const u of all.value) {
    const list = map.get(u.family) ?? []
    list.push(u)
    map.set(u.family, list)
  }
  return (['mass', 'volume', 'count'] as UnitFamily[])
    .filter(f => map.has(f))
    .map(f => ({ family: f, units: map.get(f)! }))
})

/* ---- Crear / editar ---- */
const showForm = ref(false)
const editing = ref<Unit | null>(null)
const form = reactive({ code: '', name: '', family: 'mass' as UnitFamily, factorToBase: '1' })

function openCreate(): void {
  if (readonly.value) return
  editing.value = null
  form.code = ''
  form.name = ''
  form.family = 'mass'
  form.factorToBase = '1'
  showForm.value = true
}

function openEdit(u: Unit): void {
  if (readonly.value) return
  editing.value = u
  form.code = u.code
  form.name = u.name
  form.family = u.family
  form.factorToBase = String(u.factorToBase)
  showForm.value = true
}

const busy = computed(() => creating.value || updating.value)

async function submit(): Promise<void> {
  const code = form.code.trim()
  const name = form.name.trim()
  const factor = Number(form.factorToBase)
  if (!code || !name) {
    toast.add({ title: 'Código y nombre son obligatorios', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!(factor > 0)) {
    toast.add({ title: 'El factor debe ser mayor que 0', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  try {
    if (editing.value) {
      await updateUnit({ id: editing.value.id, code, name, family: form.family, factorToBase: factor })
      toast.add({ title: 'Unidad actualizada', icon: 'i-lucide-check-circle-2' })
    }
    else {
      await createUnit({ code, name, family: form.family, factorToBase: factor })
      toast.add({ title: 'Unidad creada', icon: 'i-lucide-check-circle-2' })
    }
    showForm.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo guardar la unidad'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function remove(u: Unit): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Eliminar la unidad "${u.name}"?`)) return
  try {
    await deleteUnit(u.id)
    toast.add({ title: 'Unidad eliminada', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo eliminar la unidad'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

function factorLabel(u: Unit): string {
  if (u.factorToBase === 1) return `unidad base (${FAMILY_BASE[u.family]})`
  return `1 ${u.code} = ${u.factorToBase} ${FAMILY_BASE[u.family]}`
}
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader title="Unidades de medida" :subtitle="`${all.length} unidades`" back="/app/ajustes">
      <template #trailing>
        <button v-if="!readonly" class="cat-add-btn" aria-label="Nueva unidad" @click="openCreate">
          <UIcon name="i-lucide-plus" />
        </button>
      </template>
    </UiScreenHeader>

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo propietario y encargado pueden editar el catálogo"
      class="cat-readonly"
    />

    <p class="cat-intro">
      <UIcon name="i-lucide-info" />
      El <b>factor a base</b> normaliza cada unidad a la base de su familia (masa → g, volumen → ml, conteo → unidad) para convertir cantidades y costear recetas.
    </p>

    <div v-if="all.length" class="cat-groups">
      <section v-for="g in grouped" :key="g.family" class="cat-group">
        <h2 class="cat-group-title">{{ FAMILY_LABEL[g.family] }} <span class="cat-group-base">base: {{ FAMILY_BASE[g.family] }}</span></h2>
        <div class="cat-list">
          <div v-for="u in g.units" :key="u.id" class="cat-row">
            <span class="unit-code">{{ u.code }}</span>
            <div class="cat-row-body">
              <div class="cat-row-name">{{ u.name }}</div>
              <div class="cat-row-sub">{{ factorLabel(u) }}</div>
            </div>
            <div v-if="!readonly" class="cat-row-actions">
              <button class="cat-icon-btn" aria-label="Editar" @click="openEdit(u)"><UIcon name="i-lucide-pencil" /></button>
              <button class="cat-icon-btn danger" aria-label="Eliminar" @click="remove(u)"><UIcon name="i-lucide-trash-2" /></button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <UiEmptyState
      v-else
      icon="i-lucide-ruler"
      title="Aún no hay unidades"
      subtitle="Crea unidades como kg, g, L o unidad para medir tus insumos."
    >
      <button v-if="!readonly" class="btn btn-primary" @click="openCreate">
        <UIcon name="i-lucide-plus" /> Nueva unidad
      </button>
    </UiEmptyState>

    <UiBottomSheet v-model="showForm" :title="editing ? 'Editar unidad' : 'Nueva unidad'">
      <form class="cat-form" @submit.prevent="submit">
        <label class="cat-field">
          <span>Código</span>
          <input v-model="form.code" type="text" maxlength="16" placeholder="kg" autocapitalize="none">
        </label>
        <label class="cat-field">
          <span>Nombre</span>
          <input v-model="form.name" type="text" placeholder="Kilogramo">
        </label>
        <label class="cat-field">
          <span>Familia</span>
          <select v-model="form.family">
            <option value="mass">Masa (base: g)</option>
            <option value="volume">Volumen (base: ml)</option>
            <option value="count">Conteo (base: unidad)</option>
          </select>
        </label>
        <label class="cat-field">
          <span>Factor a base ({{ FAMILY_BASE[form.family] }})</span>
          <input v-model="form.factorToBase" type="number" step="any" min="0" inputmode="decimal">
          <small>Ej.: 1 kg = 1000 g → factor 1000. La unidad base usa factor 1.</small>
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: busy }" />
            {{ editing ? 'Guardar cambios' : 'Crear unidad' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.unit-code {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; height: 36px; padding: 0 8px;
  border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  font-family: var(--font-mono); font-size: 13px; font-weight: 700;
  flex-shrink: 0;
}
.cat-group-base {
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
  color: var(--fg3); margin-left: 6px;
}
</style>
