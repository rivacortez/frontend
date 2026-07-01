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

/* ===== Conversor de unidades (E02-7) ===== */
const convFrom = ref('')
const convTo = ref('')
const convQty = ref('1')
const convResult = ref<number | null>(null)
const convResultLabel = ref('')
const convError = ref<string | null>(null)
const converting = ref(false)

/**
 * Llama al BFF `/api/units/convert` que a su vez usa los factores registrados
 * en la base de datos — no una tabla hardcodeada. El backend devuelve 400 si
 * las unidades pertenecen a familias distintas (masa ↔ volumen, etc.).
 */
async function convertUnits(): Promise<void> {
  const qty = Number(convQty.value)
  if (!convFrom.value || !convTo.value || !(qty > 0)) return
  converting.value = true
  convResult.value = null
  convError.value = null
  try {
    const res = await $fetch<{ data: { qty: number, result: number, from: string, to: string } }>(
      '/api/units/convert',
      { query: { qty, from: convFrom.value, to: convTo.value } },
    )
    convResult.value = res.data.result
    convResultLabel.value = `${qty} ${res.data.from} = ${res.data.result} ${res.data.to}`
  }
  catch (e) {
    convError.value = errorMessage(e, 'Conversión no disponible entre estas unidades')
  }
  finally {
    converting.value = false
  }
}

// Limpiar resultado al cambiar selección
watch([convFrom, convTo, convQty], () => {
  convResult.value = null
  convError.value = null
  convResultLabel.value = ''
})
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

    <!-- ============ Conversor de unidades (E02-7) ============ -->
    <section class="conv-section" aria-label="Conversor de unidades">
      <div class="conv-title">
        <UIcon name="i-lucide-arrow-left-right" />
        Conversor de unidades
      </div>
      <p class="conv-sub">Convierte cantidades usando los factores registrados en el sistema.</p>
      <div class="conv-form">
        <label class="conv-field" for="conv-qty">
          <span>Cantidad</span>
          <input
            id="conv-qty"
            v-model="convQty"
            type="number"
            inputmode="decimal"
            step="any"
            min="0"
            placeholder="1"
          >
        </label>
        <label class="conv-field" for="conv-from">
          <span>Desde</span>
          <select id="conv-from" v-model="convFrom">
            <option value="" disabled>Unidad…</option>
            <option v-for="u in all" :key="u.code" :value="u.code">{{ u.code }} — {{ u.name }}</option>
          </select>
        </label>
        <label class="conv-field" for="conv-to">
          <span>Hasta</span>
          <select id="conv-to" v-model="convTo">
            <option value="" disabled>Unidad…</option>
            <option v-for="u in all" :key="u.code" :value="u.code">{{ u.code }} — {{ u.name }}</option>
          </select>
        </label>
        <button
          class="conv-btn"
          :disabled="!convFrom || !convTo || !convQty || converting"
          @click="convertUnits"
        >
          <UIcon :name="converting ? 'i-lucide-loader-circle' : 'i-lucide-arrow-left-right'" :class="{ spin: converting }" />
          Convertir
        </button>
      </div>
      <div v-if="convResult !== null" class="conv-result" role="status" aria-live="polite">
        <UIcon name="i-lucide-check-circle-2" />
        <span>{{ convResultLabel }}</span>
      </div>
      <div v-if="convError" class="conv-error" role="alert">
        <UIcon name="i-lucide-alert-triangle" />
        <span>{{ convError }}</span>
      </div>
    </section>

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

/* ============ CONVERSOR (E02-7) ============ */
.conv-section {
  margin: 0 20px 24px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 16px;
}
.conv-title {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 700;
  color: var(--fg1);
  margin-bottom: 4px;
}
.conv-title .iconify { width: 15px; height: 15px; color: var(--terracotta-700); }
.conv-sub {
  font-size: 12px; color: var(--fg3);
  margin: 0 0 14px;
  line-height: 1.4;
}
.conv-form {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: end;
}
@media (max-width: 600px) {
  .conv-form { grid-template-columns: 1fr 1fr; }
  .conv-btn { grid-column: 1 / -1; }
}
.conv-field {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 11.5px; font-weight: 600; color: var(--fg2);
  letter-spacing: 0.02em;
}
.conv-field input,
.conv-field select {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--fg1);
  background: var(--crema-50);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 11px;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  min-height: 40px;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.conv-field input:focus,
.conv-field select:focus {
  border-color: var(--terracotta);
  box-shadow: var(--focus-ring);
  background: var(--pure-white);
}
.conv-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--terracotta);
  color: var(--crema-100);
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-family: var(--font-sans);
  font-size: 13.5px; font-weight: 600;
  cursor: pointer;
  min-height: 40px;
  white-space: nowrap;
  transition: background var(--dur);
}
.conv-btn:hover { background: var(--terracotta-700); }
.conv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.conv-btn .iconify { width: 15px; height: 15px; }
.conv-btn .spin { animation: convSpin 700ms linear infinite; }
@keyframes convSpin { to { transform: rotate(360deg); } }
.conv-result {
  margin-top: 12px;
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--success-bg);
  color: var(--oliva-700);
  border: 1px solid rgba(110, 123, 97, 0.22);
  border-radius: 10px;
  padding: 9px 13px;
  font-family: var(--font-mono);
  font-size: 14px; font-weight: 500;
}
.conv-result .iconify { width: 15px; height: 15px; flex-shrink: 0; }
.conv-error {
  margin-top: 10px;
  display: flex; align-items: flex-start; gap: 7px;
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid rgba(179, 58, 42, 0.2);
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 13px; line-height: 1.4;
}
.conv-error .iconify { width: 14px; height: 14px; flex-shrink: 0; margin-top: 2px; }
</style>
