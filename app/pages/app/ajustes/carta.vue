<script setup lang="ts">
import type { MenuSettings } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Carta — GastronomIA' })

const { data: settings } = useAppSettings()
const { data: recipes } = useRecipes()
const update = useUpdateSettings('menu')
const updateRecipe = useUpdateRecipe()
const toast = useToast()
const { user } = useUserSession()

const readonly = computed(() => user.value?.role !== 'owner')

const form = reactive<MenuSettings>({ showPrices: true, showUnavailable: false, highlightPromos: true })

watch(settings, (s) => {
  if (s) Object.assign(form, s.menu)
}, { immediate: true })

const OPTIONS = [
  { key: 'showPrices' as const, label: 'Mostrar precios en el POS', sub: 'Los meseros ven el precio al tomar pedidos' },
  { key: 'showUnavailable' as const, label: 'Mostrar platos no disponibles', sub: 'Aparecen atenuados en el catálogo' },
  { key: 'highlightPromos' as const, label: 'Destacar promociones', sub: 'Resalta "Bebidas del día" y similares' },
]

const dishes = computed(() =>
  (recipes.value ?? []).filter(r => r.kind === 'dish'),
)
const activeCount = computed(() => dishes.value.filter(d => d.active).length)

async function toggleDish(id: string, active: boolean): Promise<void> {
  if (readonly.value) return
  await updateRecipe.mutateAsync({ id, active })
}

async function saveOptions(): Promise<void> {
  if (readonly.value) return
  await update.mutateAsync({ ...form })
  toast.add({ title: 'Preferencias de carta guardadas', icon: 'i-lucide-check' })
}
</script>

<template>
  <div class="st-screen">
    <UiScreenHeader title="Carta" :subtitle="`${activeCount} de ${dishes.length} platos activos`" back="/app/ajustes" />

    <UAlert
      v-if="readonly"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      title="Solo el propietario puede editar los ajustes"
      class="st-readonly"
    />

    <section class="st-list">
      <label v-for="o in OPTIONS" :key="o.key" class="sm-opt">
        <span class="sm-opt-body">
          <span class="sm-opt-label">{{ o.label }}</span>
          <span class="sm-opt-sub">{{ o.sub }}</span>
        </span>
        <USwitch v-model="form[o.key]" :disabled="readonly" @update:model-value="saveOptions" />
      </label>
    </section>

    <section class="sm-dishes">
      <div class="field-label sm-dishes-label">
        <span>Disponibilidad de platos</span>
        <span class="hint">se refleja al instante en el POS</span>
      </div>
      <div class="st-list">
        <label v-for="d in dishes" :key="d.id" class="sm-dish">
          <span class="sm-dish-emoji" aria-hidden="true">{{ d.emoji ?? '🍽️' }}</span>
          <span class="sm-opt-body">
            <span class="sm-opt-label">{{ d.name }}</span>
            <span class="sm-opt-sub">{{ d.category }} · {{ formatPEN(d.sellPrice) }} · margen {{ d.marginPct }} %</span>
          </span>
          <USwitch :model-value="d.active" :disabled="readonly" @update:model-value="toggleDish(d.id, $event)" />
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.st-screen { max-width: 560px; margin: 0 auto; padding-bottom: 24px; }
.st-readonly { margin: 0 20px 16px; }
.st-list {
  margin: 0 20px 18px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--pure-white);
  overflow: hidden;
}
.sm-opt, .sm-dish {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}
.sm-opt:last-child, .sm-dish:last-child { border-bottom: none; }
.sm-opt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sm-opt-label { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.sm-opt-sub { font-size: 11.5px; color: var(--fg3); }
.sm-dish-emoji {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}
.sm-dishes-label { padding: 0 20px 10px; }
.sm-dishes .st-list { margin-bottom: 0; }
</style>
