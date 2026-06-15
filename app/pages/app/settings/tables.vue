<script setup lang="ts">
import type { TableZone } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Mesas y zonas — GastronomIA' })

const { data: settings } = useAppSettings()
const update = useUpdateSettings('tables')
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner')

const zones = ref<TableZone[]>([])

watch(settings, (s) => {
  if (s) zones.value = s.tables.zones.map(z => ({ ...z }))
}, { immediate: true })

const totalTables = computed(() => zones.value.reduce((sum, z) => sum + z.tables, 0))

function addZone(): void {
  if (readonly.value) return
  zones.value.push({ id: `zone-${Date.now()}`, name: '', tables: 2 })
}

function removeZone(zone: TableZone): void {
  zones.value = zones.value.filter(z => z !== zone)
}

const saving = ref(false)

async function save(): Promise<void> {
  if (readonly.value || saving.value) return
  const valid = zones.value.filter(z => z.name.trim() && z.tables > 0)
  saving.value = true
  try {
    await update.mutateAsync({ zones: valid })
    toast.add({ title: 'Zonas guardadas', description: 'Los cambios aplican al abrir nuevas mesas.', icon: 'i-lucide-check' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="st-screen">
    <UiScreenHeader title="Mesas y zonas" :subtitle="`${totalTables} mesas en ${zones.length} zonas`" back="/app/settings" />

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo el propietario puede editar los ajustes"
      class="st-readonly"
    />

    <section class="st-zones">
      <div v-for="z in zones" :key="z.id" class="st-zone">
        <div class="st-zone-fields">
          <label class="st-zone-field name">
            <span>Zona</span>
            <input v-model="z.name" type="text" placeholder="Ej: Terraza" :disabled="readonly">
          </label>
          <label class="st-zone-field qty">
            <span>Mesas</span>
            <div class="st-zone-stepper">
              <button :disabled="readonly || z.tables <= 1" aria-label="Menos mesas" @click="z.tables -= 1">
                <UIcon name="i-lucide-minus" />
              </button>
              <b>{{ z.tables }}</b>
              <button :disabled="readonly || z.tables >= 30" aria-label="Más mesas" @click="z.tables += 1">
                <UIcon name="i-lucide-plus" />
              </button>
            </div>
          </label>
        </div>
        <button v-if="!readonly" class="st-zone-del" :aria-label="`Eliminar zona ${z.name}`" @click="removeZone(z)">
          <UIcon name="i-lucide-trash-2" />
        </button>
      </div>

      <button v-if="!readonly" class="st-zone-add" @click="addZone">
        <UIcon name="i-lucide-plus" /> Agregar zona
      </button>
    </section>

    <p class="st-hint">
      <UIcon name="i-lucide-info" />
      La numeración de mesas se asigna por orden de zona. Las mesas con órdenes abiertas no se ven afectadas.
    </p>

    <div class="st-cta">
      <button class="btn btn-primary btn-lg btn-block" :disabled="readonly || saving" @click="save">
        <UIcon name="i-lucide-check" /> Guardar zonas
      </button>
    </div>
  </div>
</template>

<style scoped>
.st-screen { max-width: 560px; margin: 0 auto; padding-bottom: 24px; }
.st-readonly { margin: 0 20px 16px; }
.st-zones {
  margin: 0 20px 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.st-zone {
  display: flex; align-items: center; gap: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
}
.st-zone-fields { flex: 1; display: flex; gap: 12px; align-items: flex-end; }
.st-zone-field { display: flex; flex-direction: column; gap: 3px; }
.st-zone-field.name { flex: 1; }
.st-zone-field span {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg3);
}
.st-zone-field input {
  background: var(--crema-50);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
  font: inherit; font-size: 14px; font-weight: 600;
  color: var(--fg1);
  outline: none;
  width: 100%;
}
.st-zone-field input:focus { border-color: var(--terracotta); }
.st-zone-field input:disabled { opacity: 0.6; }
.st-zone-stepper {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--crema-50);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px;
}
.st-zone-stepper button::after { content: ''; position: absolute; inset: -5px; }
.st-zone-stepper button {
  position: relative;
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  color: var(--fg2);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.st-zone-stepper button:disabled { opacity: 0.35; cursor: not-allowed; }
.st-zone-stepper button .iconify { width: 13px; height: 13px; }
.st-zone-stepper b {
  min-width: 28px;
  text-align: center;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
}
.st-zone-del {
  width: 36px; height: 36px; border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg3);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.st-zone-del:hover { background: var(--danger-bg); border-color: var(--danger); color: var(--danger); }
.st-zone-del .iconify { width: 15px; height: 15px; }
.st-zone-add {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font: inherit; font-size: 13.5px; font-weight: 600;
  background: transparent;
  border: 1.5px dashed var(--border);
  color: var(--fg2);
  padding: 13px;
  border-radius: 14px;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.st-zone-add:hover { border-color: var(--terracotta); color: var(--terracotta-700); }
.st-zone-add .iconify { width: 15px; height: 15px; }
.st-hint {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; color: var(--fg3);
  margin: 0 20px 16px;
  line-height: 1.45;
}
.st-hint .iconify { width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px; }
.st-cta { padding: 0 20px; }
</style>
