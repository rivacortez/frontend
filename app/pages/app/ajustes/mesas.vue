<script setup lang="ts">
import type { Zone } from '~/composables/use-zones'
import type { TableConfig } from '~/composables/use-tables'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Zonas y mesas — GastronomIA' })

// Zonas + mesas REALES del backend E03 (HU-03-01). Reemplaza el mock de
// AppSettings.tables (que solo guardaba nombre de zona + conteo de mesas).
const { data: zonesData } = useZones()
const { data: tablesData } = useTablesConfig()
const { mutateAsync: createZone, isLoading: creatingZone } = useCreateZone()
const { mutateAsync: updateZone, isLoading: updatingZone } = useUpdateZone()
const { mutateAsync: deleteZone } = useDeleteZone()
const { mutateAsync: createTable, isLoading: creatingTable } = useCreateTable()
const { mutateAsync: updateTable, isLoading: updatingTable } = useUpdateTableConfig()
const { mutateAsync: deleteTable } = useDeleteTable()
const toast = useToast()
const { user } = useUserSession()

// Configurar el salón = owner/manager (CASL create/delete Zone y Table); staff
// solo lee (el backend 403ea su escritura igual). Alineado con units/suppliers.
const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

const zones = computed<Zone[]>(() => zonesData.value ?? [])
const tables = computed<TableConfig[]>(() => tablesData.value ?? [])

// Mesas agrupadas por zona (ordenadas por código), respetando el orden de zonas.
const tablesByZone = computed(() => {
  const map = new Map<string, TableConfig[]>()
  for (const t of tables.value) {
    const list = map.get(t.zoneId) ?? []
    list.push(t)
    map.set(t.zoneId, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  }
  return map
})

const totalTables = computed(() => tables.value.length)

/* ---------- Zona: crear / renombrar ---------- */
const showZoneForm = ref(false)
const editingZone = ref<Zone | null>(null)
const zoneName = ref('')

function openCreateZone(): void {
  if (readonly.value) return
  editingZone.value = null
  zoneName.value = ''
  showZoneForm.value = true
}

function openEditZone(z: Zone): void {
  if (readonly.value) return
  editingZone.value = z
  zoneName.value = z.name
  showZoneForm.value = true
}

const zoneBusy = computed(() => creatingZone.value || updatingZone.value)

async function submitZone(): Promise<void> {
  const name = zoneName.value.trim()
  if (!name) {
    toast.add({ title: 'El nombre de la zona es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  try {
    if (editingZone.value) {
      await updateZone({ id: editingZone.value.id, name })
      toast.add({ title: 'Zona actualizada', icon: 'i-lucide-check-circle-2' })
    }
    else {
      // Nueva zona al final (position = cantidad actual).
      await createZone({ name, position: zones.value.length })
      toast.add({ title: 'Zona creada', icon: 'i-lucide-check-circle-2' })
    }
    showZoneForm.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo guardar la zona'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function removeZone(z: Zone): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Eliminar la zona "${z.name}"?`)) return
  try {
    await deleteZone(z.id)
    toast.add({ title: 'Zona eliminada', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    // 409 del backend: "No se puede eliminar: la zona tiene mesas".
    toast.add({ title: errorMessage(e, 'No se pudo eliminar la zona'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

/* ---------- Mesa: crear / editar / mover ---------- */
const showTableForm = ref(false)
const editingTable = ref<TableConfig | null>(null)
const tableForm = reactive({ code: '', capacity: '2', zoneId: '' })

function openCreateTable(zoneId?: string): void {
  if (readonly.value) return
  if (!zones.value.length) {
    toast.add({ title: 'Crea una zona antes de agregar mesas', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  editingTable.value = null
  tableForm.code = ''
  tableForm.capacity = '2'
  tableForm.zoneId = zoneId ?? zones.value[0]!.id
  showTableForm.value = true
}

function openEditTable(t: TableConfig): void {
  if (readonly.value) return
  editingTable.value = t
  tableForm.code = t.code
  tableForm.capacity = String(t.capacity)
  tableForm.zoneId = t.zoneId
  showTableForm.value = true
}

const tableBusy = computed(() => creatingTable.value || updatingTable.value)

async function submitTable(): Promise<void> {
  const code = tableForm.code.trim()
  const capacity = Number(tableForm.capacity)
  if (!code) {
    toast.add({ title: 'El código de la mesa es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!tableForm.zoneId) {
    toast.add({ title: 'Selecciona una zona para la mesa', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    toast.add({ title: 'La capacidad debe ser un entero mayor que 0', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  try {
    if (editingTable.value) {
      await updateTable({ id: editingTable.value.id, code, capacity, zoneId: tableForm.zoneId })
      toast.add({ title: 'Mesa actualizada', icon: 'i-lucide-check-circle-2' })
    }
    else {
      await createTable({ code, capacity, zoneId: tableForm.zoneId })
      toast.add({ title: 'Mesa creada', icon: 'i-lucide-check-circle-2' })
    }
    showTableForm.value = false
  }
  catch (e) {
    // 409 del backend: "Ya existe una mesa con ese código".
    toast.add({ title: errorMessage(e, 'No se pudo guardar la mesa'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

async function removeTable(t: TableConfig): Promise<void> {
  if (readonly.value) return
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Eliminar la mesa "${t.code}"?`)) return
  try {
    await deleteTable(t.id)
    toast.add({ title: 'Mesa eliminada', icon: 'i-lucide-trash-2' })
  }
  catch (e) {
    // 409 del backend: "No se puede eliminar una mesa que no está libre".
    toast.add({ title: errorMessage(e, 'No se pudo eliminar la mesa'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
}

function statusClass(status: string): string {
  // Mapea el estado del backend a las variantes de badge disponibles.
  if (status === 'free') return 'ok'
  if (status === 'occupied' || status === 'bill') return 'busy'
  return 'pref'
}
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader title="Zonas y mesas" :subtitle="`${totalTables} mesas en ${zones.length} zonas`" back="/app/ajustes">
      <template #trailing>
        <button v-if="!readonly" class="cat-add-btn" aria-label="Nueva zona" @click="openCreateZone">
          <UIcon name="i-lucide-plus" />
        </button>
      </template>
    </UiScreenHeader>

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo propietario y encargado pueden configurar el salón"
      class="cat-readonly"
    />

    <p class="cat-intro">
      <UIcon name="i-lucide-info" />
      Organiza tu salón en <b>zonas</b> (Terraza, Salón…) y registra cada <b>mesa</b> con su código y capacidad. Estas mesas son las que aparecen en el mapa del POS.
    </p>

    <div v-if="zones.length" class="cat-groups">
      <section v-for="z in zones" :key="z.id" class="cat-group">
        <header class="tz-zone-head">
          <h2 class="cat-group-title">
            {{ z.name }}
            <span class="tz-count">{{ (tablesByZone.get(z.id) ?? []).length }} mesas</span>
          </h2>
          <div v-if="!readonly" class="tz-zone-actions">
            <button class="cat-icon-btn" aria-label="Renombrar zona" @click="openEditZone(z)"><UIcon name="i-lucide-pencil" /></button>
            <button class="cat-icon-btn danger" aria-label="Eliminar zona" @click="removeZone(z)"><UIcon name="i-lucide-trash-2" /></button>
          </div>
        </header>

        <div v-if="(tablesByZone.get(z.id) ?? []).length" class="cat-list">
          <div v-for="t in tablesByZone.get(z.id)" :key="t.id" class="cat-row">
            <span class="tz-code">{{ t.code }}</span>
            <div class="cat-row-body">
              <div class="cat-row-name">
                Mesa {{ t.code }}
                <span class="cat-badge" :class="statusClass(t.status)">{{ tableStatusLabel(t.status) }}</span>
              </div>
              <div class="cat-row-sub">{{ t.capacity }} {{ t.capacity === 1 ? 'persona' : 'personas' }}</div>
            </div>
            <div v-if="!readonly" class="cat-row-actions">
              <button class="cat-icon-btn" aria-label="Editar mesa" @click="openEditTable(t)"><UIcon name="i-lucide-pencil" /></button>
              <button class="cat-icon-btn danger" aria-label="Eliminar mesa" @click="removeTable(t)"><UIcon name="i-lucide-trash-2" /></button>
            </div>
          </div>
        </div>
        <p v-else class="tz-empty-zone">Sin mesas en esta zona.</p>

        <button v-if="!readonly" class="tz-add-table" @click="openCreateTable(z.id)">
          <UIcon name="i-lucide-plus" /> Agregar mesa
        </button>
      </section>
    </div>

    <UiEmptyState
      v-else
      icon="i-lucide-layout-grid"
      title="Aún no hay zonas"
      subtitle="Crea zonas como Terraza o Salón principal y registra sus mesas."
    >
      <button v-if="!readonly" class="btn btn-primary" @click="openCreateZone">
        <UIcon name="i-lucide-plus" /> Nueva zona
      </button>
    </UiEmptyState>

    <!-- Sheet: crear / renombrar zona -->
    <UiBottomSheet v-model="showZoneForm" :title="editingZone ? 'Renombrar zona' : 'Nueva zona'">
      <form class="cat-form" @submit.prevent="submitZone">
        <label class="cat-field">
          <span>Nombre de la zona</span>
          <input v-model="zoneName" type="text" maxlength="60" placeholder="Terraza">
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="zoneBusy" @click="submitZone">
            <UIcon :name="zoneBusy ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: zoneBusy }" />
            {{ editingZone ? 'Guardar cambios' : 'Crear zona' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>

    <!-- Sheet: crear / editar / mover mesa -->
    <UiBottomSheet v-model="showTableForm" :title="editingTable ? 'Editar mesa' : 'Nueva mesa'">
      <form class="cat-form" @submit.prevent="submitTable">
        <div class="cat-field row">
          <label class="cat-field">
            <span>Código</span>
            <input v-model="tableForm.code" type="text" maxlength="32" placeholder="12" autocapitalize="characters">
          </label>
          <label class="cat-field">
            <span>Capacidad</span>
            <input v-model="tableForm.capacity" type="number" min="1" step="1" inputmode="numeric" placeholder="4">
          </label>
        </div>
        <label class="cat-field">
          <span>Zona</span>
          <select v-model="tableForm.zoneId">
            <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</option>
          </select>
          <small v-if="editingTable">Cambiar la zona mueve la mesa a esa área del salón.</small>
        </label>
      </form>
      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" @click="close">Cancelar</button>
          <button class="btn btn-primary" :disabled="tableBusy" @click="submitTable">
            <UIcon :name="tableBusy ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: tableBusy }" />
            {{ editingTable ? 'Guardar cambios' : 'Crear mesa' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.tz-zone-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.tz-count {
  font-size: 10.5px; font-weight: 600; color: var(--fg3);
  margin-left: 6px; font-variant-numeric: tabular-nums;
}
.tz-zone-actions { display: flex; gap: 4px; flex-shrink: 0; }
.tz-code {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; height: 36px; padding: 0 8px;
  border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  font-family: var(--font-mono); font-size: 13px; font-weight: 700;
  flex-shrink: 0;
}
.cat-badge.ok { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
.cat-badge.busy { background: var(--danger-bg); color: var(--danger); }
.tz-empty-zone { font-size: 12px; color: var(--fg3); padding: 4px 2px 0; }
.tz-add-table {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: transparent;
  border: 1.5px dashed var(--border);
  color: var(--fg2);
  padding: 9px;
  border-radius: 12px;
  cursor: pointer;
  margin-top: 8px;
  width: 100%;
  transition: border-color var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.tz-add-table:hover { border-color: var(--terracotta); color: var(--terracotta-700); }
.tz-add-table .iconify { width: 14px; height: 14px; }
</style>
