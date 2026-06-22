<script setup lang="ts">
import type { CatalogCategory } from '~/composables/use-catalog-categories'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Categorías de insumo — GastronomIA' })

const { data: categories } = useCatalogCategories()
const { mutateAsync: createCategory, isLoading: creating } = useCreateCategory()
const { mutateAsync: updateCategory, isLoading: updating } = useUpdateCategory()
const { mutateAsync: deleteCategory } = useDeleteCategory()
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

const all = computed(() => categories.value ?? [])

// Árbol de 2 niveles: raíces (parentId == null) con sus hijos. El backend
// devuelve lista plana; aquí la agrupamos por `parentId`.
interface TreeNode { cat: CatalogCategory, children: CatalogCategory[] }
const tree = computed<TreeNode[]>(() => {
  const roots = all.value.filter(c => c.parentId === null)
  const childrenOf = (id: string) => all.value.filter(c => c.parentId === id)
  return roots.map(cat => ({ cat, children: childrenOf(cat.id) }))
})

const nameById = computed(() => new Map(all.value.map(c => [c.id, c.name])))

/* ---- Crear / editar ---- */
const showForm = ref(false)
const editing = ref<CatalogCategory | null>(null)
const form = reactive({ name: '', parentId: '' as string })

// Opciones de padre: solo categorías raíz (árbol de 2 niveles) y nunca la
// propia categoría que se edita (evita el ciclo que el backend rechaza con 400).
const parentOptions = computed(() =>
  all.value.filter(c => c.parentId === null && c.id !== editing.value?.id),
)

function openCreate(parentId: string | null = null): void {
  if (readonly.value) return
  editing.value = null
  form.name = ''
  form.parentId = parentId ?? ''
  showForm.value = true
}

function openEdit(c: CatalogCategory): void {
  if (readonly.value) return
  editing.value = c
  form.name = c.name
  form.parentId = c.parentId ?? ''
  showForm.value = true
}

const busy = computed(() => creating.value || updating.value)

async function submit(): Promise<void> {
  const name = form.name.trim()
  if (!name) {
    toast.add({ title: 'El nombre es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  const parentId = form.parentId || null
  try {
    if (editing.value) {
      await updateCategory({ id: editing.value.id, name, parentId })
      toast.add({ title: 'Categoría actualizada', icon: 'i-lucide-check-circle-2' })
    }
    else {
      await createCategory({ name, parentId })
      toast.add({ title: 'Categoría creada', icon: 'i-lucide-check-circle-2' })
    }
    showForm.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo guardar la categoría'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function remove(c: CatalogCategory): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return
  try {
    await deleteCategory(c.id)
    toast.add({ title: 'Categoría eliminada', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    // El backend devuelve 409 si la categoría tiene subcategorías.
    toast.add({ title: errorMessage(e, 'No se pudo eliminar la categoría'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader title="Categorías de insumo" :subtitle="`${all.length} categorías`" back="/app/ajustes">
      <template #trailing>
        <button v-if="!readonly" class="cat-add-btn" aria-label="Nueva categoría" @click="openCreate(null)">
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
      Organiza tus insumos en categorías y subcategorías (ej. <b>Carnes › Res</b>). No se puede eliminar una categoría que tiene subcategorías.
    </p>

    <div v-if="tree.length" class="cat-list">
      <template v-for="node in tree" :key="node.cat.id">
        <div class="cat-row">
          <div class="cat-row-body">
            <div class="cat-row-name">
              <UIcon name="i-lucide-folder" /> {{ node.cat.name }}
            </div>
            <div v-if="node.children.length" class="cat-row-sub">{{ node.children.length }} subcategoría{{ node.children.length === 1 ? '' : 's' }}</div>
          </div>
          <div v-if="!readonly" class="cat-row-actions">
            <button class="cat-icon-btn" aria-label="Agregar subcategoría" @click="openCreate(node.cat.id)"><UIcon name="i-lucide-plus" /></button>
            <button class="cat-icon-btn" aria-label="Editar" @click="openEdit(node.cat)"><UIcon name="i-lucide-pencil" /></button>
            <button class="cat-icon-btn danger" aria-label="Eliminar" @click="remove(node.cat)"><UIcon name="i-lucide-trash-2" /></button>
          </div>
        </div>
        <div v-for="child in node.children" :key="child.id" class="cat-row child">
          <div class="cat-row-body">
            <div class="cat-row-name"><UIcon name="i-lucide-corner-down-right" /> {{ child.name }}</div>
          </div>
          <div v-if="!readonly" class="cat-row-actions">
            <button class="cat-icon-btn" aria-label="Editar" @click="openEdit(child)"><UIcon name="i-lucide-pencil" /></button>
            <button class="cat-icon-btn danger" aria-label="Eliminar" @click="remove(child)"><UIcon name="i-lucide-trash-2" /></button>
          </div>
        </div>
      </template>
    </div>

    <UiEmptyState
      v-else
      icon="i-lucide-folder-tree"
      title="Aún no hay categorías"
      subtitle="Crea categorías para clasificar tus insumos (Carnes, Verduras, Abarrotes…)."
    >
      <button v-if="!readonly" class="btn btn-primary" @click="openCreate(null)">
        <UIcon name="i-lucide-plus" /> Nueva categoría
      </button>
    </UiEmptyState>

    <UiBottomSheet v-model="showForm" :title="editing ? 'Editar categoría' : 'Nueva categoría'">
      <form class="cat-form" @submit.prevent="submit">
        <label class="cat-field">
          <span>Nombre</span>
          <input v-model="form.name" type="text" placeholder="Ej: Carnes">
        </label>
        <label class="cat-field">
          <span>Categoría padre</span>
          <select v-model="form.parentId">
            <option value="">— Sin padre (categoría raíz) —</option>
            <option v-for="p in parentOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <small v-if="editing && nameById.size">Cambiar el padre reubica la categoría en el árbol.</small>
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="busy" @click="submit">
            <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: busy }" />
            {{ editing ? 'Guardar cambios' : 'Crear categoría' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.cat-row-name .iconify { width: 15px; height: 15px; color: var(--terracotta-700); }
.cat-row.child .cat-row-name .iconify { color: var(--fg3); }
</style>
