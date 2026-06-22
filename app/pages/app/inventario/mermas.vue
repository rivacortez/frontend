<script setup lang="ts">
import type { InventoryMovement } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Mermas — GastronomIA' })

const { data: waste } = useWaste()

const items = computed<InventoryMovement[]>(() => waste.value?.items ?? [])
const totalCost = computed(() => waste.value?.totalWasteCost ?? 0)

function qtyLabel(m: InventoryMovement): string {
  // La merma se registra con qty negativa; mostramos la magnitud perdida.
  return `${Math.abs(m.qty)} ${m.unit}`
}
</script>

<template>
  <div class="wa-screen">
    <UiScreenHeader title="Mermas" subtitle="Pérdidas registradas (HU-05-09)" back="/app/inventario">
      <template #trailing>
        <UButton to="/app/inventario/movimiento" icon="i-lucide-plus" size="sm" color="primary">Registrar</UButton>
      </template>
    </UiScreenHeader>

    <section class="wa-summary" aria-label="Resumen de mermas">
      <div class="wa-sum-ico" aria-hidden="true"><UIcon name="i-lucide-trash-2" /></div>
      <div class="wa-sum-body">
        <div class="wa-sum-label">Costo total perdido</div>
        <div class="wa-sum-value">{{ formatPEN(totalCost) }}</div>
      </div>
      <div class="wa-sum-count">{{ items.length }} merma{{ items.length === 1 ? '' : 's' }}</div>
    </section>

    <div v-if="items.length" class="wa-list">
      <div v-for="m in items" :key="m.id" class="wa-row">
        <span class="wa-ico" aria-hidden="true"><UIcon name="i-lucide-trash-2" /></span>
        <div class="wa-body">
          <div class="wa-name">{{ m.ingredientName }}</div>
          <div class="wa-meta">
            {{ formatShortDate(m.date) }} · {{ formatTime(m.date) }}
            <template v-if="m.note"> · {{ m.note }}</template>
          </div>
        </div>
        <span class="wa-qty">−{{ qtyLabel(m) }}</span>
      </div>
    </div>

    <UiEmptyState
      v-else
      icon="i-lucide-leaf"
      title="Sin mermas registradas"
      subtitle="Cuando registres una salida por merma/daño aparecerá aquí su costo."
    >
      <UButton to="/app/inventario/movimiento" icon="i-lucide-plus">Registrar merma</UButton>
    </UiEmptyState>
  </div>
</template>

<style scoped>
.wa-screen { max-width: 640px; margin: 0 auto; padding-bottom: 24px; }

.wa-summary {
  display: flex; align-items: center; gap: 12px;
  margin: 0 20px 16px;
  background: linear-gradient(150deg, var(--pure-white), #FBF0ED);
  border: 1px solid rgba(179, 58, 42, 0.2);
  border-radius: 16px; padding: 14px;
}
.wa-sum-ico {
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--danger-bg); color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.wa-sum-ico .iconify { width: 20px; height: 20px; }
.wa-sum-body { flex: 1; min-width: 0; }
.wa-sum-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg3); }
.wa-sum-value { font-size: 22px; font-weight: 600; color: var(--danger); letter-spacing: -0.01em; margin-top: 2px; font-variant-numeric: tabular-nums; }
.wa-sum-count { font-size: 12px; color: var(--fg3); flex-shrink: 0; }

.wa-list {
  margin: 0 20px;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px; background: var(--pure-white); overflow: hidden;
}
.wa-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-bottom: 1px solid var(--border-subtle);
}
.wa-row:last-child { border-bottom: none; }
.wa-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--danger-bg); color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.wa-ico .iconify { width: 16px; height: 16px; }
.wa-body { flex: 1; min-width: 0; }
.wa-name { font-size: 14px; font-weight: 600; color: var(--fg1); }
.wa-meta { font-size: 11.5px; color: var(--fg3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-qty {
  font-family: var(--font-mono); font-size: 13px; font-weight: 700;
  color: var(--danger); font-variant-numeric: tabular-nums; flex-shrink: 0;
}
</style>
