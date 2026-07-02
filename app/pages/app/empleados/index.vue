<script setup lang="ts">
import type { Employee, EmployeePosition } from '~/composables/use-employees'

definePageMeta({ layout: 'app', middleware: 'require-manager' })
useSeoMeta({ title: 'Empleados — GastronomIA' })

const toast = useToast()
const { user } = useUserSession()

const isOwner = computed(() => user.value?.role === 'owner')

const { data: employees, isLoading } = useEmployees()
const { mutateAsync: createEmployee, isLoading: creating } = useCreateEmployee()
const { mutateAsync: updateEmployee, isLoading: updating } = useUpdateEmployee()
const { mutateAsync: deleteEmployee } = useDeleteEmployee()

const all = computed(() => employees.value ?? [])

/* ── Búsqueda ──────────────────────────────────────────────── */
const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return all.value
  return all.value.filter(e =>
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(q)
    || e.dni.includes(q)
    || e.position.includes(q),
  )
})

/* ── Etiquetas de puesto ────────────────────────────────────── */
const POSITION_LABELS: Record<EmployeePosition, string> = {
  mozo: 'Mozo/a',
  cocina: 'Cocina',
  caja: 'Caja',
  otro: 'Otro',
}

function fullName(e: Employee): string {
  return `${e.lastName}, ${e.firstName}`
}

/**
 * Formatea una fecha ISO de contratación en formato local corto.
 * Devuelve '—' cuando el campo es nulo (contratación sin fecha registrada).
 */
function formatHiredAt(isoDate: string | null): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  })
}

/* ── Formulario (crear / editar) ────────────────────────────── */
const showForm = ref(false)
const editing = ref<Employee | null>(null)
const dniError = ref('')

const form = reactive({
  firstName: '',
  lastName: '',
  dni: '',
  position: 'mozo' as EmployeePosition,
  phone: '',
  hiredAt: '',
  active: true,
  salary: '',
})

function resetForm(): void {
  form.firstName = ''
  form.lastName = ''
  form.dni = ''
  form.position = 'mozo'
  form.phone = ''
  form.hiredAt = ''
  form.active = true
  form.salary = ''
  dniError.value = ''
}

function openCreate(): void {
  editing.value = null
  resetForm()
  showForm.value = true
}

function openEdit(emp: Employee): void {
  editing.value = emp
  form.firstName = emp.firstName
  form.lastName = emp.lastName
  form.dni = emp.dni
  form.position = emp.position
  form.phone = emp.phone ?? ''
  // The date input expects YYYY-MM-DD; hiredAt is an ISO datetime string.
  form.hiredAt = emp.hiredAt ? emp.hiredAt.slice(0, 10) : ''
  form.active = emp.active
  form.salary = emp.salary ?? ''
  dniError.value = ''
  showForm.value = true
}

const busy = computed(() => creating.value || updating.value)

function buildPayload() {
  const base = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    dni: form.dni.trim(),
    position: form.position,
    phone: form.phone.trim() || null,
    hiredAt: form.hiredAt || null,
    active: form.active,
  }
  // Salary is only included when the user is owner and provided a value.
  // The BFF enforces this server-side too; this is a UX guard.
  if (isOwner.value && form.salary.trim()) {
    return { ...base, salary: form.salary.trim() }
  }
  return base
}

async function submit(): Promise<void> {
  if (!form.firstName.trim()) {
    toast.add({ title: 'El nombre es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!form.lastName.trim()) {
    toast.add({ title: 'El apellido es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (!form.dni.trim()) {
    toast.add({ title: 'El DNI es obligatorio', icon: 'i-lucide-alert-triangle', color: 'error' })
    return
  }
  if (isOwner.value && form.salary.trim() && !/^\d+(\.\d{1,2})?$/.test(form.salary.trim())) {
    toast.add({
      title: 'El sueldo debe ser un número válido (ej. 1500 o 1500.50)',
      icon: 'i-lucide-alert-triangle',
      color: 'error',
    })
    return
  }

  dniError.value = ''

  try {
    if (editing.value) {
      await updateEmployee({ id: editing.value.id, ...buildPayload() })
      toast.add({ title: 'Empleado actualizado', icon: 'i-lucide-check-circle-2' })
    }
    else {
      await createEmployee(buildPayload())
      toast.add({ title: 'Empleado registrado', icon: 'i-lucide-check-circle-2' })
    }
    showForm.value = false
  }
  catch (e) {
    const err = e as { statusCode?: number }
    if (err.statusCode === 409) {
      // Show inline error on DNI field — more informative than a generic toast.
      dniError.value = errorMessage(e, 'Ya existe un empleado con ese DNI.')
    }
    else {
      toast.add({
        title: errorMessage(e, 'No se pudo guardar el empleado'),
        icon: 'i-lucide-alert-triangle',
        color: 'error',
      })
    }
  }
}

async function deactivate(emp: Employee): Promise<void> {
  // eslint-disable-next-line no-alert
  if (!confirm(`¿Dar de baja a ${emp.firstName} ${emp.lastName}?`)) return
  try {
    await deleteEmployee(emp.id)
    toast.add({ title: `${emp.firstName} ${emp.lastName} dado/a de baja`, icon: 'i-lucide-user-x' })
  }
  catch (e) {
    toast.add({
      title: errorMessage(e, 'No se pudo dar de baja al empleado'),
      icon: 'i-lucide-alert-triangle',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="cat-screen">
    <UiScreenHeader
      title="Empleados"
      :subtitle="`${all.length} empleado${all.length === 1 ? '' : 's'}`"
      back="/app"
    >
      <template #trailing>
        <button class="cat-add-btn" aria-label="Nuevo empleado" @click="openCreate">
          <UIcon name="i-lucide-plus" />
        </button>
      </template>
    </UiScreenHeader>

    <!-- Búsqueda -->
    <div class="emp-search-wrap">
      <label class="emp-search">
        <UIcon name="i-lucide-search" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          placeholder="Buscar por nombre, DNI o puesto…"
          aria-label="Buscar empleado"
        >
      </label>
    </div>

    <!-- Lista de empleados -->
    <div v-if="filtered.length" class="cat-list">
      <div v-for="emp in filtered" :key="emp.id" class="cat-row">
        <div class="cat-row-body">
          <div class="cat-row-name">
            {{ fullName(emp) }}
            <span class="emp-badge">{{ POSITION_LABELS[emp.position] }}</span>
            <span v-if="!emp.active" class="cat-badge off">Inactivo</span>
          </div>
          <div class="cat-row-sub">
            <span v-if="emp.phone" class="emp-meta-item">
              <UIcon name="i-lucide-phone" class="emp-inline-ico" aria-hidden="true" />
              {{ emp.phone }}
            </span>
            <span v-else class="emp-dim">Sin teléfono</span>
            <span class="emp-dot" aria-hidden="true"> · </span>
            <span class="emp-meta-item">
              <UIcon name="i-lucide-calendar" class="emp-inline-ico" aria-hidden="true" />
              {{ formatHiredAt(emp.hiredAt) }}
            </span>
          </div>
          <!-- Salary row: only visible to owners, only when the backend included the field -->
          <div v-if="isOwner && emp.salary" class="cat-row-sub emp-salary">
            <UIcon name="i-lucide-banknote" class="emp-inline-ico" aria-hidden="true" />
            S/ {{ emp.salary }}
          </div>
        </div>

        <div class="cat-row-actions">
          <button
            class="cat-icon-btn"
            :aria-label="`Editar ${emp.firstName} ${emp.lastName}`"
            @click="openEdit(emp)"
          >
            <UIcon name="i-lucide-pencil" />
          </button>
          <button
            v-if="emp.active"
            class="cat-icon-btn danger"
            :aria-label="`Dar de baja a ${emp.firstName} ${emp.lastName}`"
            @click="deactivate(emp)"
          >
            <UIcon name="i-lucide-user-x" />
          </button>
        </div>
      </div>
    </div>

    <!-- Estado vacío: sin empleados -->
    <UiEmptyState
      v-else-if="!isLoading && all.length === 0"
      icon="i-lucide-users"
      title="Aún no hay empleados"
      subtitle="Registra el primer empleado del equipo para hacer seguimiento del personal."
    >
      <button class="btn btn-primary" @click="openCreate">
        <UIcon name="i-lucide-plus" /> Nuevo empleado
      </button>
    </UiEmptyState>

    <!-- Estado vacío: sin resultados de búsqueda -->
    <UiEmptyState
      v-else-if="!isLoading && filtered.length === 0"
      icon="i-lucide-search-x"
      title="Sin resultados"
      subtitle="Ningún empleado coincide con tu búsqueda."
    />

    <!-- Sheet de crear / editar -->
    <UiBottomSheet
      v-model="showForm"
      :title="editing ? 'Editar empleado' : 'Nuevo empleado'"
    >
      <form class="cat-form" @submit.prevent="submit">
        <div class="cat-field row">
          <label class="cat-field">
            <span>Nombre</span>
            <input
              v-model="form.firstName"
              type="text"
              autocomplete="given-name"
              placeholder="María"
            >
          </label>
          <label class="cat-field">
            <span>Apellido</span>
            <input
              v-model="form.lastName"
              type="text"
              autocomplete="family-name"
              placeholder="González"
            >
          </label>
        </div>

        <div class="cat-field row">
          <label class="cat-field" :class="{ 'emp-field-error-wrap': dniError }">
            <span>DNI</span>
            <input
              v-model="form.dni"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="12345678"
              :class="{ 'emp-input-error': dniError }"
            >
            <small v-if="dniError" class="emp-error-msg">{{ dniError }}</small>
          </label>
          <label class="cat-field">
            <span>Puesto</span>
            <select v-model="form.position">
              <option value="mozo">Mozo/a</option>
              <option value="cocina">Cocina</option>
              <option value="caja">Caja</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </div>

        <div class="cat-field row">
          <label class="cat-field">
            <span>Teléfono</span>
            <input
              v-model="form.phone"
              type="tel"
              autocomplete="tel"
              placeholder="999 888 777"
            >
          </label>
          <label class="cat-field">
            <span>Fecha de ingreso</span>
            <input v-model="form.hiredAt" type="date">
          </label>
        </div>

        <!-- Salary: only rendered for owners -->
        <label v-if="isOwner" class="cat-field">
          <span>Sueldo (S/)</span>
          <input
            v-model="form.salary"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="1500.00"
          >
          <small>Solo visible para ti como propietario/a.</small>
        </label>

        <!-- Active toggle: only shown when editing an existing employee -->
        <label v-if="editing" class="cat-check">
          <input v-model="form.active" type="checkbox">
          Empleado activo
        </label>
      </form>

      <template #cta="{ close }">
        <div class="cat-cta">
          <button class="btn btn-ghost" type="button" @click="close">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="busy" @click="submit">
            <UIcon
              :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-check'"
              :class="{ spin: busy }"
            />
            {{ editing ? 'Guardar cambios' : 'Registrar empleado' }}
          </button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
/* ── Buscador ─────────────────────────────────────────────── */
.emp-search-wrap { padding: 0 20px; margin-bottom: 14px; }
.emp-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 42px;
  cursor: text;
}
.emp-search:focus-within {
  border-color: var(--terracotta);
  box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.16);
}
.emp-search .iconify { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }
.emp-search input {
  flex: 1; border: none; outline: none;
  background: transparent; font: inherit; font-size: 14px; color: var(--fg1);
}
.emp-search input::placeholder { color: var(--fg3); }

/* ── Fila de empleado ─────────────────────────────────────── */
.emp-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
  padding: 2px 7px; border-radius: 999px;
  background: var(--crema-200); color: var(--fg2);
  text-transform: uppercase;
  white-space: nowrap;
}

.emp-meta-item { display: inline-flex; align-items: center; gap: 4px; }
.emp-inline-ico { width: 12px; height: 12px; color: var(--fg3); flex-shrink: 0; }
.emp-dot { margin: 0 4px; color: var(--fg3); }
.emp-dim { color: var(--fg3); font-style: italic; }

.emp-salary {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 4px;
  color: var(--oliva-700); font-weight: 600;
}

/* ── Errores de campo ─────────────────────────────────────── */
.emp-input-error { border-color: var(--danger) !important; }
.emp-error-msg {
  font-size: 11px;
  color: var(--danger);
  margin-top: 2px;
  line-height: 1.4;
}
</style>
