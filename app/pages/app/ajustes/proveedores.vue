<script setup lang="ts">
import type { Supplier } from '~/composables/use-suppliers'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Proveedores — GastronomIA' })

const { data: suppliers } = useSuppliers()
const { mutateAsync: createSupplier, isLoading: creating } = useCreateSupplier()
const { mutateAsync: updateSupplier, isLoading: updating } = useUpdateSupplier()
const { mutateAsync: deleteSupplier } = useDeleteSupplier()
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

const query = ref('')
const all = computed(() => suppliers.value ?? [])
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return all.value
  return all.value.filter(s => s.name.toLowerCase().includes(q) || s.ruc.includes(q))
})

/* ---- Crear / editar ---- */
const showForm = ref(false)
const editing = ref<Supplier | null>(null)
const form = reactive({
  ruc: '',
  name: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  paymentTerms: '',
  leadTimeDays: '' as string,
  active: true,
})

function resetForm(): void {
  form.ruc = ''
  form.name = ''
  form.contactName = ''
  form.contactEmail = ''
  form.contactPhone = ''
  form.paymentTerms = ''
  form.leadTimeDays = ''
  form.active = true
}

function openCreate(): void {
  if (readonly.value) return
  editing.value = null
  resetForm()
  showForm.value = true
}

function openEdit(s: Supplier): void {
  if (readonly.value) return
  editing.value = s
  form.ruc = s.ruc
  form.name = s.name
  form.contactName = s.contactName ?? ''
  form.contactEmail = s.contactEmail ?? ''
  form.contactPhone = s.contactPhone ?? ''
  form.paymentTerms = s.paymentTerms ?? ''
  form.leadTimeDays = s.leadTimeDays != null ? String(s.leadTimeDays) : ''
  form.active = s.active
  showForm.value = true
}

const busy = computed(() => creating.value || updating.value)

function buildPayload() {
  const lead = form.leadTimeDays.trim()
  return {
    ruc: form.ruc.trim(),
    name: form.name.trim(),
    contactName: form.contactName.trim() || undefined,
    contactEmail: form.contactEmail.trim() || undefined,
    contactPhone: form.contactPhone.trim() || undefined,
    paymentTerms: form.paymentTerms.trim() || undefined,
    leadTimeDays: lead ? Number(lead) : undefined,
    active: form.active,
  }
}

async function submit(): Promise<void> {
  if (!/^\d{11}$/.test(form.ruc.trim())) {
    toast.add({ title: 'El RUC debe tener 11 dígitos', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!form.name.trim()) {
    toast.add({ title: 'El nombre es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (form.contactEmail.trim() && !form.contactEmail.includes('@')) {
    toast.add({ title: 'El correo de contacto no es válido', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  try {
    if (editing.value) {
      await updateSupplier({ id: editing.value.id, ...buildPayload() })
      toast.add({ title: 'Proveedor actualizado', icon: 'i-lucide-check-circle-2' })
    }
    else {
      await createSupplier(buildPayload())
      toast.add({ title: 'Proveedor creado', icon: 'i-lucide-check-circle-2' })
    }
    showForm.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo guardar el proveedor'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function remove(s: Supplier): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Eliminar el proveedor "${s.name}"?`)) return
  try {
    await deleteSupplier(s.id)
    toast.add({ title: 'Proveedor eliminado', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo eliminar el proveedor'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const leadLabel = (d: number | null): string =>
  d == null ? 'sin lead time' : d === 0 ? 'entrega inmediata' : `${d} día${d === 1 ? '' : 's'} de entrega`
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader title="Proveedores" :subtitle="`${all.length} proveedores`" back="/app/ajustes">
      <template #trailing>
        <button v-if="!readonly" class="cat-add-btn" aria-label="Nuevo proveedor" @click="openCreate">
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

    <div class="sup-search-wrap">
      <label class="sup-search">
        <UIcon name="i-lucide-search" />
        <input v-model="query" type="search" placeholder="Buscar por nombre o RUC…" aria-label="Buscar proveedor">
      </label>
    </div>

    <div v-if="filtered.length" class="cat-list">
      <div v-for="s in filtered" :key="s.id" class="cat-row">
        <div class="cat-row-body">
          <div class="cat-row-name">
            {{ s.name }}
            <span v-if="!s.active" class="cat-badge off">Inactivo</span>
          </div>
          <div class="cat-row-sub">
            <span class="cat-row-mono">RUC {{ s.ruc }}</span> · {{ leadLabel(s.leadTimeDays) }}
          </div>
          <div v-if="s.contactName || s.contactPhone || s.paymentTerms" class="sup-meta">
            <span v-if="s.contactName"><UIcon name="i-lucide-user" /> {{ s.contactName }}</span>
            <span v-if="s.contactPhone"><UIcon name="i-lucide-phone" /> {{ s.contactPhone }}</span>
            <span v-if="s.paymentTerms"><UIcon name="i-lucide-wallet" /> {{ s.paymentTerms }}</span>
          </div>
        </div>
        <div v-if="!readonly" class="cat-row-actions">
          <button class="cat-icon-btn" aria-label="Editar" @click="openEdit(s)"><UIcon name="i-lucide-pencil" /></button>
          <button class="cat-icon-btn danger" aria-label="Eliminar" @click="remove(s)"><UIcon name="i-lucide-trash-2" /></button>
        </div>
      </div>
    </div>

    <UiEmptyState
      v-else-if="all.length === 0"
      icon="i-lucide-truck"
      title="Aún no hay proveedores"
      subtitle="Registra a tus proveedores con su RUC y datos de contacto."
    >
      <button v-if="!readonly" class="btn btn-primary" @click="openCreate">
        <UIcon name="i-lucide-plus" /> Nuevo proveedor
      </button>
    </UiEmptyState>
    <UiEmptyState
      v-else
      icon="i-lucide-search-x"
      title="Sin resultados"
      subtitle="Ningún proveedor coincide con tu búsqueda."
    />

    <p class="cat-intro link-hint">
      <UIcon name="i-lucide-link" />
      ¿Necesitas vincular un insumo con su proveedor y precio? Hazlo desde el <NuxtLink to="/app/ajustes/insumo-proveedor">vínculo insumo ↔ proveedor</NuxtLink>.
    </p>

    <UiBottomSheet v-model="showForm" :title="editing ? 'Editar proveedor' : 'Nuevo proveedor'">
      <form class="cat-form" @submit.prevent="submit">
        <div class="cat-field row">
          <label class="cat-field">
            <span>RUC</span>
            <input v-model="form.ruc" type="text" inputmode="numeric" maxlength="11" placeholder="20123456789" class="cat-row-mono">
          </label>
          <label class="cat-field">
            <span>Lead time (días)</span>
            <input v-model="form.leadTimeDays" type="number" min="0" inputmode="numeric" placeholder="3">
          </label>
        </div>
        <label class="cat-field">
          <span>Nombre / Razón social</span>
          <input v-model="form.name" type="text" placeholder="Distribuidora del Sur S.A.C.">
        </label>
        <label class="cat-field">
          <span>Contacto</span>
          <input v-model="form.contactName" type="text" placeholder="Nombre del contacto">
        </label>
        <div class="cat-field row">
          <label class="cat-field">
            <span>Teléfono</span>
            <input v-model="form.contactPhone" type="tel" placeholder="999 888 777">
          </label>
          <label class="cat-field">
            <span>Email</span>
            <input v-model="form.contactEmail" type="email" placeholder="ventas@proveedor.pe" autocapitalize="none">
          </label>
        </div>
        <label class="cat-field">
          <span>Términos de pago</span>
          <input v-model="form.paymentTerms" type="text" placeholder="Crédito 30 días / Contado">
        </label>
        <label v-if="editing" class="cat-check">
          <input v-model="form.active" type="checkbox"> Proveedor activo
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: busy }" />
            {{ editing ? 'Guardar cambios' : 'Crear proveedor' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.sup-search-wrap { padding: 0 20px; margin-bottom: 14px; }
.sup-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 42px;
}
.sup-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.16); }
.sup-search input { flex: 1; border: none; outline: none; background: transparent; font: inherit; font-size: 14px; color: var(--fg1); }
.sup-search .iconify { width: 16px; height: 16px; color: var(--fg3); }
.sup-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.sup-meta span { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--fg3); }
.sup-meta .iconify { width: 12px; height: 12px; }
.link-hint { margin-top: 18px; }
.link-hint a { color: var(--terracotta-700); font-weight: 600; }
</style>
