<script setup lang="ts">
import type { InventoryMovement, MovementType } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Movimientos — GastronomIA' })

const { data: movements } = useMovements()

const filter = ref<'all' | MovementType>('all')

const TYPE_META: Record<MovementType, { label: string, icon: string, cls: string }> = {
  purchase: { label: 'Compra', icon: 'i-lucide-arrow-down-to-line', cls: 'in' },
  sale: { label: 'Consumo', icon: 'i-lucide-utensils', cls: 'out' },
  waste: { label: 'Merma', icon: 'i-lucide-trash-2', cls: 'waste' },
  adjustment: { label: 'Ajuste', icon: 'i-lucide-sliders-horizontal', cls: 'adj' },
  count: { label: 'Conteo', icon: 'i-lucide-clipboard-check', cls: 'adj' },
}

const FILTERS: Array<{ id: 'all' | MovementType, label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'purchase', label: 'Compras' },
  { id: 'sale', label: 'Consumo' },
  { id: 'waste', label: 'Mermas' },
  { id: 'adjustment', label: 'Ajustes' },
]

const filtered = computed(() => {
  const list = movements.value ?? []
  return filter.value === 'all' ? list : list.filter(m => m.type === filter.value)
})

function qtyLabel(m: InventoryMovement): string {
  const sign = m.qty > 0 ? '+' : ''
  return `${sign}${m.qty} ${m.unit}`
}
</script>

<template>
  <div class="mv-screen">
    <UiScreenHeader title="Movimientos" subtitle="Historial de entradas y salidas" back="/app/inventario">
      <template #trailing>
        <UButton to="/app/inventario/movimiento" icon="i-lucide-plus" size="sm" color="primary">Registrar</UButton>
      </template>
    </UiScreenHeader>

    <div class="mv-chips" role="tablist" aria-label="Filtrar por tipo">
      <button
        v-for="f in FILTERS"
        :key="f.id"
        role="tab"
        :aria-selected="filter === f.id"
        class="mv-chip"
        :class="{ active: filter === f.id }"
        @click="filter = f.id"
      >{{ f.label }}</button>
    </div>

    <div v-if="filtered.length" class="mv-list">
      <div v-for="m in filtered" :key="m.id" class="mv-row">
        <span class="mv-ico" :class="TYPE_META[m.type].cls" aria-hidden="true">
          <UIcon :name="TYPE_META[m.type].icon" />
        </span>
        <span class="mv-body">
          <span class="mv-name">{{ m.ingredientName }}</span>
          <span class="mv-meta">
            {{ TYPE_META[m.type].label }}
            <template v-if="m.note"> · {{ m.note }}</template>
            <template v-if="m.user"> · {{ m.user }}</template>
          </span>
        </span>
        <span class="mv-right">
          <span class="mv-qty" :class="{ pos: m.qty > 0, neg: m.qty < 0 }">{{ qtyLabel(m) }}</span>
          <span class="mv-time">{{ timeAgo(m.date) }}</span>
        </span>
      </div>
    </div>

    <UiEmptyState
      v-else
      icon="i-lucide-arrow-left-right"
      title="Sin movimientos"
      subtitle="Registra entradas y salidas para verlas aquí."
    >
      <UButton to="/app/inventario/movimiento" icon="i-lucide-plus">Registrar movimiento</UButton>
    </UiEmptyState>
  </div>
</template>

<style scoped>
.mv-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.mv-chips {
  display: flex; gap: 6px;
  padding: 0 20px 14px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mv-chips::-webkit-scrollbar { display: none; }
.mv-chip {
  font: inherit; font-size: 12.5px; font-weight: 500;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.mv-chip.active { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }

.mv-list {
  margin: 0 20px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.mv-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.mv-row:last-child { border-bottom: none; }
.mv-ico {
  width: 36px; height: 36px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mv-ico .iconify { width: 17px; height: 17px; }
.mv-ico.in { background: var(--success-bg); color: var(--oliva-700); }
.mv-ico.out { background: var(--info-bg); color: var(--info); }
.mv-ico.waste { background: var(--danger-bg); color: var(--danger); }
.mv-ico.adj { background: var(--crema-200); color: var(--fg2); }
.mv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mv-name { font-size: 14px; font-weight: 600; color: var(--fg1); }
.mv-meta {
  font-size: 11.5px; color: var(--fg3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mv-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.mv-qty {
  font-family: var(--font-mono);
  font-size: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.mv-qty.pos { color: var(--oliva-700); }
.mv-qty.neg { color: var(--danger); }
.mv-time { font-size: 10.5px; color: var(--fg3); }
</style>
