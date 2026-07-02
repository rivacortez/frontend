<script setup lang="ts">
import type { ForecastDriver } from '#shared/types/domain'

/**
 * Renders the exogenous forecast drivers (holidays, gastro events, weather,
 * weekends, payday) as a compact, dedup'd row of chips. Presentational only —
 * grouping/dedup logic lives in `groupForecastDrivers` (app/utils/forecast-drivers.ts)
 * so it stays testable and reusable between the shopping list and the
 * dashboard "Lo que se viene" panel.
 */
const props = withDefaults(defineProps<{
  drivers: ForecastDriver[]
  maxChips?: number
}>(), { maxChips: 4 })

const chips = computed(() => groupForecastDrivers(props.drivers, props.maxChips))
</script>

<template>
  <ul v-if="chips.length" class="driver-chips" role="list">
    <li v-for="chip in chips" :key="chip.key" class="driver-chip" :aria-label="chip.ariaLabel">
      <UIcon :name="chip.icon" class="driver-chip-ico" aria-hidden="true" />
      <span class="driver-chip-text">
        <span class="driver-chip-label">{{ chip.label }}</span>
        <span class="driver-chip-date">{{ chip.dateLabel }}</span>
      </span>
      <span
        v-if="chip.impactLabel"
        class="driver-chip-impact"
        :class="chip.isPositive ? 'is-up' : 'is-down'"
      >
        {{ chip.impactLabel }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
/* Neutral, un-tinted pills — the parent screen owns its single tinted-surface
   budget (anti-slop rule), so this component never adds background color. */
.driver-chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.driver-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--pure-white, #fff);
  min-height: 32px;
}
.driver-chip-ico {
  width: 14px;
  height: 14px;
  color: var(--fg2);
  flex-shrink: 0;
}
.driver-chip-text {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}
.driver-chip-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--fg1);
  white-space: nowrap;
}
.driver-chip-date {
  font-size: 11.5px;
  color: var(--fg2);
  white-space: nowrap;
}
.driver-chip-impact {
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.driver-chip-impact.is-up { color: var(--oliva-700); }
.driver-chip-impact.is-down { color: var(--danger); }
</style>
