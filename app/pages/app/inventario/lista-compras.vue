<script setup lang="ts">
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Lista de Compras — GastronomIA' })

const { data: items, refresh } = useShoppingList()
const patchItem = usePatchShoppingItem()
const createMovement = useCreateMovement()
const clearPurchased = useClearPurchased()
const toast = useToast()

const expanded = ref<string | null>(null)
const registering = ref(false)

const list = computed(() => items.value ?? [])
const pending = computed(() => list.value.filter(i => !i.checked))
const checked = computed(() => list.value.filter(i => i.checked))
const total = computed(() => pending.value.reduce((s, i) => s + i.estimatedCost, 0))
const urgentCount = computed(() => pending.value.filter(i => i.urgent).length)
const aiSavings = computed(() => +(total.value * 0.08).toFixed(0))

const dateLabel = computed(() => {
  const label = new Intl.DateTimeFormat('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Lima',
  }).format(new Date())
  return `HOY · ${label.toUpperCase()}`
})

async function toggle(id: string, value: boolean): Promise<void> {
  await patchItem.mutateAsync({ id, checked: value })
}

async function registerPurchases(): Promise<void> {
  if (checked.value.length === 0 || registering.value) return
  registering.value = true
  try {
    const purchased = [...checked.value]
    for (const item of purchased) {
      await createMovement.mutateAsync({
        ingredientId: item.ingredientId,
        type: 'purchase',
        qty: item.suggestedQty,
        note: 'Compra desde lista',
      })
    }
    // La lista no se persiste: limpiamos el estado local de lo comprado.
    clearPurchased(purchased.map(i => i.ingredientId))
    toast.add({
      title: `${purchased.length} compra${purchased.length > 1 ? 's' : ''} registrada${purchased.length > 1 ? 's' : ''} en inventario`,
      icon: 'i-lucide-check-circle-2',
    })
    await refresh()
    await navigateTo('/app/inventario')
  }
  finally {
    registering.value = false
  }
}

function share(): void {
  const lines = pending.value.map(i => `• ${i.name} — ${i.suggestedQty} ${i.unit} (~${formatPEN(i.estimatedCost)})`)
  const text = `Lista de compras Motif:\n${lines.join('\n')}\nTotal: ${formatPEN(total.value)}`
  if (navigator.share) {
    void navigator.share({ title: 'Lista de Compras', text })
  }
  else {
    void navigator.clipboard.writeText(text)
    toast.add({ title: 'Lista copiada al portapapeles', icon: 'i-lucide-clipboard-check' })
  }
}
</script>

<template>
  <div class="sl-screen">
    <UiScreenHeader title="Lista de Compras" :subtitle="dateLabel" back="/app/inventario">
      <template #trailing>
        <UButton icon="i-lucide-share-2" color="neutral" variant="outline" size="sm" aria-label="Compartir lista" @click="share" />
      </template>
    </UiScreenHeader>

    <!-- Resumen -->
    <section class="sl-summary" aria-label="Resumen de la lista">
      <div class="sl-sum-eyebrow">
        <span class="dot" aria-hidden="true" />
        Plan de hoy
      </div>
      <div class="sl-sum-grid">
        <div class="sl-sum-cell">
          <div class="lbl">Total estimado</div>
          <div class="val">{{ formatPEN(total) }}</div>
        </div>
        <div class="sl-sum-cell">
          <div class="lbl">Ítems</div>
          <div class="val">{{ pending.length }}</div>
        </div>
        <div class="sl-sum-cell">
          <div class="lbl">Urgentes</div>
          <div class="val urgent">{{ urgentCount }}</div>
        </div>
        <div class="sl-sum-cell savings">
          <div class="lbl">Ahorro IA</div>
          <div class="val">−S/ {{ aiSavings }}</div>
        </div>
      </div>
      <div class="sl-sum-foot">
        <span class="robot" aria-hidden="true"><UIcon name="i-lucide-bot" /></span>
        <span>IA generó esta lista según stock crítico y el forecast del fin de semana.</span>
      </div>
    </section>

    <!-- Pendientes -->
    <section class="sl-section" aria-label="Por comprar">
      <div class="sl-section-title">Por comprar <span class="count">{{ pending.length }}</span></div>
      <div v-if="pending.length" class="sl-list">
        <div
          v-for="item in pending"
          :key="item.id"
          class="sl-item"
          role="button"
          tabindex="0"
          @click="expanded = expanded === item.id ? null : item.id"
        >
          <button
            class="sl-check"
            :aria-label="`Marcar ${item.name} como comprado`"
            @click.stop="toggle(item.id, true)"
          >
            <UIcon name="i-lucide-check" />
          </button>
          <div class="sl-item-body">
            <span class="sl-item-name">
              {{ item.name }}
              <span v-if="item.urgent" class="sl-urgent">Urgente</span>
            </span>
            <span class="sl-item-qty">{{ item.suggestedQty }} {{ item.unit }}</span>
          </div>
          <div class="sl-item-price">{{ formatPEN(item.estimatedCost) }}</div>
          <div v-if="expanded === item.id" class="sl-item-detail" @click.stop>
            <div class="row"><span>Motivo</span><span class="v">{{ item.reason }}</span></div>
            <div class="row"><span>Cantidad sugerida</span><span class="v">{{ item.suggestedQty }} {{ item.unit }}</span></div>
            <div class="row"><span>Costo estimado</span><span class="v">{{ formatPEN(item.estimatedCost) }}</span></div>
            <NuxtLink :to="`/app/inventario/producto/${item.ingredientId}`" class="sl-detail-link">
              Ver insumo <UIcon name="i-lucide-arrow-right" />
            </NuxtLink>
          </div>
        </div>
      </div>
      <UiEmptyState
        v-else
        icon="i-lucide-shopping-cart"
        title="Nada por comprar"
        subtitle="Tu stock está cubierto. La IA agregará ítems cuando detecte faltantes."
      />
    </section>

    <!-- Comprados -->
    <section v-if="checked.length" class="sl-section" aria-label="Comprados">
      <div class="sl-section-title done">Comprados <span class="count">{{ checked.length }}</span></div>
      <div class="sl-list">
        <div v-for="item in checked" :key="item.id" class="sl-item done">
          <button
            class="sl-check checked"
            :aria-label="`Desmarcar ${item.name}`"
            @click.stop="toggle(item.id, false)"
          >
            <UIcon name="i-lucide-check" />
          </button>
          <div class="sl-item-body">
            <span class="sl-item-name">{{ item.name }}</span>
            <span class="sl-item-qty">{{ item.suggestedQty }} {{ item.unit }}</span>
          </div>
          <div class="sl-item-price">{{ formatPEN(item.estimatedCost) }}</div>
        </div>
      </div>
      <button class="btn btn-dark btn-lg btn-block sl-register" :disabled="registering" @click="registerPurchases">
        <UIcon name="i-lucide-package-check" />
        Registrar {{ checked.length }} compra{{ checked.length > 1 ? 's' : '' }} en inventario
      </button>
    </section>
  </div>
</template>

<style scoped>
.sl-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.sl-summary {
  margin: 0 20px 20px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px;
}
.sl-sum-eyebrow {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  margin-bottom: 10px;
}
.sl-sum-eyebrow .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--oliva);
}
.sl-sum-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sl-sum-cell {
  background: var(--crema-100);
  border-radius: 10px;
  padding: 8px 10px;
}
.sl-sum-cell .lbl { font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg3); }
.sl-sum-cell .val {
  font-size: 15px; font-weight: 600; color: var(--fg1);
  letter-spacing: -0.01em;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.sl-sum-cell .val.urgent { color: var(--danger); }
.sl-sum-cell.savings { background: #FBF4E3; }
.sl-sum-cell.savings .val { color: var(--mostaza-700); }
.sl-sum-foot {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 11.5px; color: var(--fg3);
  margin-top: 10px;
  line-height: 1.4;
}
.sl-sum-foot .robot {
  width: 20px; height: 20px; border-radius: 6px;
  background: var(--terracotta-100); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sl-sum-foot .robot .iconify { width: 12px; height: 12px; }

.sl-section { padding: 0 20px; margin-bottom: 20px; }
.sl-section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 600; color: var(--fg1);
  margin-bottom: 10px;
}
.sl-section-title.done { color: var(--fg3); }
.sl-section-title .count {
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 600;
  background: var(--crema-200); color: var(--fg2);
  padding: 2px 8px; border-radius: 999px;
}

.sl-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.sl-item {
  display: flex; align-items: center; gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard);
}
.sl-item:last-child { border-bottom: none; }
.sl-item:hover { background: var(--crema-50); }
.sl-item.done { opacity: 0.6; }
.sl-item.done .sl-item-name { text-decoration: line-through; }
/* área de toque ≥40px sin agrandar el control visible */
.sl-check::after { content: ''; position: absolute; inset: -7px; }
.sl-check {
  position: relative;
  width: 26px; height: 26px; border-radius: 8px;
  border: 1.5px solid var(--border);
  background: transparent;
  color: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.sl-check:hover { border-color: var(--oliva); }
.sl-check.checked, .sl-check:active { background: var(--oliva); border-color: var(--oliva); color: var(--crema-100); }
.sl-check .iconify { width: 14px; height: 14px; }
.sl-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sl-item-name {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.sl-urgent {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  background: var(--danger-bg); color: var(--danger);
  padding: 2px 6px; border-radius: 999px;
}
.sl-item-qty { font-size: 12px; color: var(--fg3); }
.sl-item-price {
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.sl-item-detail {
  flex-basis: 100%;
  background: var(--crema-100);
  border-radius: 10px;
  padding: 10px 12px;
  margin-top: 4px;
}
.sl-item-detail .row {
  display: flex; justify-content: space-between;
  font-size: 12px; color: var(--fg3);
  padding: 2px 0;
}
.sl-item-detail .row .v { color: var(--fg1); font-weight: 500; text-align: right; max-width: 60%; }
.sl-detail-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  color: var(--terracotta-700);
  text-decoration: none;
  margin-top: 6px;
}
.sl-detail-link .iconify { width: 12px; height: 12px; }
.sl-register { margin-top: 12px; }
</style>
