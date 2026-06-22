<script setup lang="ts">
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Insumos y proveedores — GastronomIA' })

const { data: ingredients } = useIngredients()
const { data: suppliers } = useSuppliers()
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

// Insumo seleccionado: el listado de proveedores del backend es por insumo
// (GET /api/ingredients/:id/suppliers), así que la pantalla es "insumo-first".
const ingredientId = ref('')
const ingredientList = computed(() => ingredients.value ?? [])
const supplierList = computed(() => suppliers.value ?? [])
const selectedIngredient = computed(() => ingredientList.value.find(i => i.id === ingredientId.value))

const { data: links, isLoading: loadingLinks } = useProductSuppliers(ingredientId)
const { mutateAsync: linkSupplier, isLoading: linking } = useLinkSupplier()
const { mutateAsync: unlinkSupplier } = useUnlinkSupplier()

const linkedIds = computed(() => new Set((links.value ?? []).map(l => l.supplierId)))
// Proveedores aún no asociados a este insumo (y activos).
const availableSuppliers = computed(() =>
  supplierList.value.filter(s => s.active && !linkedIds.value.has(s.id)),
)

/* ---- Asociar ---- */
const showForm = ref(false)
const form = reactive({ supplierId: '', supplierSku: '', lastPrice: '' as string, preferred: false })

function openLink(): void {
  if (readonly.value || !ingredientId.value) return
  form.supplierId = availableSuppliers.value[0]?.id ?? ''
  form.supplierSku = ''
  form.lastPrice = ''
  form.preferred = false
  showForm.value = true
}

async function submitLink(): Promise<void> {
  if (!form.supplierId) {
    toast.add({ title: 'Elige un proveedor', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  const price = form.lastPrice.trim()
  try {
    await linkSupplier({
      ingredientId: ingredientId.value,
      supplierId: form.supplierId,
      supplierSku: form.supplierSku.trim() || undefined,
      lastPrice: price ? Number(price) : undefined,
      preferred: form.preferred,
    })
    toast.add({ title: 'Proveedor asociado', icon: 'i-lucide-check-circle-2' })
    showForm.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo asociar el proveedor'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function unlink(supplierId: string, name: string): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Quitar a "${name}" de este insumo?`)) return
  try {
    await unlinkSupplier({ ingredientId: ingredientId.value, supplierId })
    toast.add({ title: 'Proveedor desvinculado', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo desvincular'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

const priceLabel = (p: string | null): string => (p == null ? 'sin precio' : `S/ ${p}`)
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader title="Insumos y proveedores" subtitle="Vínculo insumo ↔ proveedor" back="/app/ajustes" />

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
      Asocia cada insumo con sus proveedores, su <b>último precio</b> y marca el <b>preferido</b>. Elige un insumo para gestionar sus proveedores.
    </p>

    <div class="ps-picker">
      <label class="cat-field">
        <span>Insumo</span>
        <select v-model="ingredientId">
          <option value="">— Selecciona un insumo —</option>
          <option v-for="i in ingredientList" :key="i.id" :value="i.id">{{ i.name }}</option>
        </select>
      </label>
    </div>

    <template v-if="ingredientId">
      <div class="ps-head">
        <h2 class="ps-head-title">Proveedores de {{ selectedIngredient?.name }}</h2>
        <button
          v-if="!readonly"
          class="cat-add-btn"
          :disabled="availableSuppliers.length === 0"
          aria-label="Asociar proveedor"
          @click="openLink"
        >
          <UIcon name="i-lucide-plus" />
        </button>
      </div>

      <div v-if="loadingLinks" class="ps-loading">Cargando…</div>

      <div v-else-if="links && links.length" class="cat-list">
        <div v-for="l in links" :key="l.id" class="cat-row">
          <div class="cat-row-body">
            <div class="cat-row-name">
              {{ l.supplierName }}
              <span v-if="l.preferred" class="cat-badge pref">Preferido</span>
            </div>
            <div class="cat-row-sub">
              <span class="cat-row-mono">{{ priceLabel(l.lastPrice) }}</span>
              <template v-if="l.supplierSku"> · SKU {{ l.supplierSku }}</template>
            </div>
          </div>
          <div v-if="!readonly" class="cat-row-actions">
            <button class="cat-icon-btn danger" aria-label="Desvincular" @click="unlink(l.supplierId, l.supplierName)">
              <UIcon name="i-lucide-unlink" />
            </button>
          </div>
        </div>
      </div>

      <UiEmptyState
        v-else
        icon="i-lucide-link-2"
        title="Sin proveedores asociados"
        subtitle="Asocia proveedores a este insumo para comparar precios."
      >
        <button v-if="!readonly && availableSuppliers.length" class="btn btn-primary" @click="openLink">
          <UIcon name="i-lucide-plus" /> Asociar proveedor
        </button>
      </UiEmptyState>

      <p v-if="!readonly && supplierList.length === 0" class="ps-warn">
        <UIcon name="i-lucide-alert-triangle" />
        No tienes proveedores aún. Créalos en <NuxtLink to="/app/ajustes/proveedores">Proveedores</NuxtLink>.
      </p>
    </template>

    <UiEmptyState
      v-else
      icon="i-lucide-package-search"
      title="Elige un insumo"
      subtitle="Selecciona un insumo arriba para ver y gestionar sus proveedores."
    />

    <UiBottomSheet v-model="showForm" title="Asociar proveedor">
      <form class="cat-form" @submit.prevent="submitLink">
        <label class="cat-field">
          <span>Proveedor</span>
          <select v-model="form.supplierId">
            <option v-for="s in availableSuppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <div class="cat-field row">
          <label class="cat-field">
            <span>Último precio (S/)</span>
            <input v-model="form.lastPrice" type="number" step="any" min="0" inputmode="decimal" placeholder="0.00">
          </label>
          <label class="cat-field">
            <span>SKU del proveedor</span>
            <input v-model="form.supplierSku" type="text" placeholder="Opcional">
          </label>
        </div>
        <label class="cat-check">
          <input v-model="form.preferred" type="checkbox"> Marcar como proveedor preferido
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="linking" @click="submitLink">
            <UIcon :name="linking ? 'i-lucide-loader-circle' : 'i-lucide-link'" :class="{ spin: linking }" />
            Asociar
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.ps-picker { padding: 0 20px; margin-bottom: 18px; }
.ps-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px 12px; gap: 12px;
}
.ps-head-title { font-size: 15px; font-weight: 600; color: var(--fg1); margin: 0; min-width: 0; }
.cat-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ps-loading { padding: 24px 20px; text-align: center; color: var(--fg3); font-size: 13px; }
.ps-warn {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; color: var(--mostaza-700);
  margin: 14px 20px 0;
}
.ps-warn .iconify { width: 14px; height: 14px; flex-shrink: 0; }
.ps-warn a { color: var(--terracotta-700); font-weight: 600; }
</style>
