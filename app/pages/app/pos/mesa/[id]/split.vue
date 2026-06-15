<script setup lang="ts">
import type { OrderPayment, PaymentMethod } from '#shared/types/domain'

definePageMeta({ layout: 'app' })

const route = useRoute()
const tableId = computed(() => String(route.params.id))
const { data } = useTable(tableId)
const payOrder = usePayOrder()
const splitOrder = useSplitOrder()

const table = computed(() => data.value?.table ?? null)
const order = computed(() => data.value?.order ?? null)
const totals = computed(() => orderTotals(order.value))

useSeoMeta({ title: () => `Dividir cuenta · Mesa ${table.value ? String(table.value.number).padStart(2, '0') : ''} — GastronomIA` })

const METHODS: Array<{ id: PaymentMethod, label: string, sub: string, icon: string }> = [
  { id: 'cash', label: 'Efectivo', sub: 'Caja', icon: 'i-lucide-banknote' },
  { id: 'yape', label: 'Yape', sub: 'QR · BCP', icon: 'i-lucide-smartphone' },
  { id: 'card', label: 'Tarjeta', sub: 'POS externo', icon: 'i-lucide-credit-card' },
  { id: 'plin', label: 'Plin', sub: 'QR · multi', icon: 'i-lucide-smartphone' },
]

const mode = ref<'persona' | 'items'>('persona')
const persons = ref(2)
const paidShares = ref<number[]>([])
const collectedPayments = ref<OrderPayment[]>([])
const success = ref(false)
const busy = ref(false)

// — Por items: asignación item → cuenta (A/B/C) —
const CUENTAS = ['A', 'B', 'C'] as const
const assignment = ref<Record<string, string>>({})
const paidCuentas = ref<string[]>([])

// HU-04-03 · Montos AUTORITATIVOS del backend (POST /api/orders/:id/split, no persiste).
// El reparto local (total/personas, Σítems por cuenta) se usa solo como fallback
// inmediato mientras llega la respuesta; el cobro usa siempre los montos del backend.
const personShares = ref<number[]>([]) // por persona: total de cada parte (índice = persona)
const cuentaShares = ref<Record<string, number>>({}) // por cuenta: total autoritativo

// Por persona: pide al backend `equal` con `parts = personas` cuando cambia el número.
watch([mode, persons, order], async () => {
  if (mode.value !== 'persona' || !order.value || paidShares.value.length > 0) return
  try {
    const res = await splitOrder.mutateAsync({ orderId: order.value.id, mode: 'equal', parts: persons.value })
    personShares.value = res.shares.map(s => Number(s.total))
  }
  catch {
    personShares.value = [] // fallback al reparto local
  }
}, { immediate: true })

// Por items: cuando TODOS los ítems están asignados, pide al backend `items` con
// las asignaciones reales (label = "Cuenta X", itemIds). El backend exige que cada
// ítem vivo esté asignado exactamente una vez → solo se llama con asignación completa.
watch([mode, assignment, order], async () => {
  if (mode.value !== 'items' || !order.value) return
  const items = order.value.items
  if (items.length === 0 || items.some(it => !assignment.value[it.id])) {
    cuentaShares.value = {}
    return
  }
  const activeCuentas = CUENTAS.filter(c => items.some(it => assignment.value[it.id] === c))
  const assignments = activeCuentas.map(c => ({
    label: `Cuenta ${c}`,
    itemIds: items.filter(it => assignment.value[it.id] === c).map(it => it.id),
  }))
  try {
    const res = await splitOrder.mutateAsync({ orderId: order.value.id, mode: 'items', assignments })
    const next: Record<string, number> = {}
    for (const share of res.shares) {
      const cuenta = share.label.replace('Cuenta ', '')
      next[cuenta] = Number(share.total)
    }
    cuentaShares.value = next
  }
  catch {
    cuentaShares.value = {} // fallback al reparto local por cuenta
  }
}, { deep: true, immediate: true })

// Monto por persona: backend si está disponible, si no el reparto local equitativo.
const perPerson = computed(() => personShares.value[0] ?? (totals.value.total / persons.value))
function personAmount(index: number): number {
  const fromBackend = personShares.value[index]
  return fromBackend ?? +(totals.value.total / persons.value).toFixed(2)
}

const cobrarTarget = ref<{ label: string, amount: number, key: string } | null>(null)
const cobrarMethod = ref<PaymentMethod | null>(null)

function openCobrarPersona(index: number): void {
  cobrarMethod.value = null
  cobrarTarget.value = {
    label: `Persona ${index + 1} de ${persons.value}`,
    amount: +personAmount(index).toFixed(2),
    key: `p${index}`,
  }
}

const cuentaTotals = computed(() => {
  const out: Record<string, { total: number, count: number }> = {}
  for (const c of CUENTAS) out[c] = { total: 0, count: 0 }
  for (const item of order.value?.items ?? []) {
    const cuenta = assignment.value[item.id]
    if (cuenta && out[cuenta]) {
      // Conteo siempre local; el total prefiere el monto autoritativo del backend.
      out[cuenta].count += item.qty
      out[cuenta].total += item.qty * item.unitPrice
    }
  }
  // Reemplaza el total local por el del backend cuando exista (asignación completa).
  for (const c of CUENTAS) {
    const fromBackend = cuentaShares.value[c]
    if (fromBackend !== undefined && out[c]) out[c].total = fromBackend
  }
  return out
})

const unassignedCount = computed(() =>
  (order.value?.items ?? []).filter(it => !assignment.value[it.id]).length,
)

function openCobrarCuenta(cuenta: string): void {
  const info = cuentaTotals.value[cuenta]
  if (!info || info.total <= 0) return
  cobrarMethod.value = null
  cobrarTarget.value = { label: `Cuenta ${cuenta}`, amount: +info.total.toFixed(2), key: `c${cuenta}` }
}

const allPaid = computed(() => {
  if (mode.value === 'persona') {
    return persons.value > 0 && paidShares.value.length >= persons.value
  }
  const active = CUENTAS.filter(c => (cuentaTotals.value[c]?.total ?? 0) > 0)
  return unassignedCount.value === 0 && active.length > 0 && active.every(c => paidCuentas.value.includes(c))
})

async function confirmCobrar(): Promise<void> {
  const target = cobrarTarget.value
  if (!target || !cobrarMethod.value) return

  collectedPayments.value.push({ method: cobrarMethod.value, amount: target.amount })
  if (target.key.startsWith('p')) {
    paidShares.value.push(Number(target.key.slice(1)))
  }
  else {
    paidCuentas.value.push(target.key.slice(1))
  }
  cobrarTarget.value = null

  if (allPaid.value && order.value && !busy.value) {
    busy.value = true
    try {
      await payOrder.mutateAsync({
        orderId: order.value.id,
        payments: collectedPayments.value,
        docType: 'boleta',
      })
      success.value = true
    }
    finally {
      busy.value = false
    }
  }
}

const pad = (n: number | undefined): string => String(n ?? '').padStart(2, '0')
</script>

<template>
  <div class="sb-screen">
    <UiScreenHeader
      :title="`Dividir cuenta · Mesa ${pad(table?.number)}`"
      :subtitle="order ? `${order.items.length} items · ${formatPEN(totals.total)} IGV incl.` : ''"
      :back="`/app/pos/mesa/${tableId}`"
    />

    <template v-if="order">
      <!-- Toggle modo -->
      <div class="sb-toggle" role="tablist">
        <button role="tab" :aria-selected="mode === 'persona'" :class="{ on: mode === 'persona' }" @click="mode = 'persona'">
          <UIcon name="i-lucide-users" /> Por persona
        </button>
        <button role="tab" :aria-selected="mode === 'items'" :class="{ on: mode === 'items' }" @click="mode = 'items'">
          <UIcon name="i-lucide-list" /> Por items
        </button>
      </div>

      <!-- ===== Por persona ===== -->
      <section v-if="mode === 'persona'" class="sb-panel">
        <div class="field-label" style="padding: 0 4px">
          <span>¿Entre cuántas personas?</span>
          <span class="hint">{{ formatPEN(perPerson) }} c/u</span>
        </div>
        <div class="stepper">
          <button class="step-btn" :disabled="persons <= 2 || paidShares.length > 0" aria-label="Menos personas" @click="persons -= 1">
            <UIcon name="i-lucide-minus" />
          </button>
          <div>
            <div class="step-value">{{ persons }}</div>
            <div class="step-value-label">personas</div>
          </div>
          <button class="step-btn plus" :disabled="persons >= 8 || paidShares.length > 0" aria-label="Más personas" @click="persons += 1">
            <UIcon name="i-lucide-plus" />
          </button>
        </div>

        <div class="sb-shares">
          <div
            v-for="i in persons"
            :key="i"
            class="sb-share"
            :class="{ paid: paidShares.includes(i - 1) }"
          >
            <span class="sb-share-avatar">{{ i }}</span>
            <span class="sb-share-body">
              <span class="sb-share-name">Persona {{ i }}</span>
              <span class="sb-share-amount">{{ formatPEN(personAmount(i - 1)) }}</span>
            </span>
            <span v-if="paidShares.includes(i - 1)" class="sb-share-paid">
              <UIcon name="i-lucide-check-circle-2" /> Pagado
            </span>
            <button v-else class="btn btn-primary" @click="openCobrarPersona(i - 1)">
              Cobrar
            </button>
          </div>
        </div>
      </section>

      <!-- ===== Por items ===== -->
      <section v-else class="sb-panel">
        <p class="sb-hint">
          <UIcon name="i-lucide-info" />
          Asigna cada item a una cuenta. {{ unassignedCount > 0 ? `Faltan ${unassignedCount} por asignar.` : 'Todo asignado.' }}
        </p>
        <div class="sb-items">
          <div v-for="item in order.items" :key="item.id" class="sb-item">
            <span class="sb-item-body">
              <span class="sb-item-name">{{ item.name }} <span v-if="item.qty > 1" class="pill">×{{ item.qty }}</span></span>
              <span class="sb-item-price">{{ formatPEN(item.qty * item.unitPrice) }}</span>
            </span>
            <div class="sb-item-cuentas" role="radiogroup" :aria-label="`Cuenta para ${item.name}`">
              <button
                v-for="c in CUENTAS"
                :key="c"
                role="radio"
                :aria-checked="assignment[item.id] === c"
                class="sb-cuenta-chip"
                :class="{ on: assignment[item.id] === c }"
                :disabled="paidCuentas.includes(c)"
                @click="assignment[item.id] = c"
              >{{ c }}</button>
            </div>
          </div>
        </div>

        <div class="sb-cuentas-resumen">
          <div
            v-for="c in CUENTAS"
            :key="c"
            class="sb-share"
            :class="{ paid: paidCuentas.includes(c), empty: (cuentaTotals[c]?.total ?? 0) === 0 }"
          >
            <span class="sb-share-avatar">{{ c }}</span>
            <span class="sb-share-body">
              <span class="sb-share-name">Cuenta {{ c }}</span>
              <span class="sb-share-amount">{{ cuentaTotals[c]?.count ?? 0 }} items · {{ formatPEN(cuentaTotals[c]?.total ?? 0) }}</span>
            </span>
            <span v-if="paidCuentas.includes(c)" class="sb-share-paid">
              <UIcon name="i-lucide-check-circle-2" /> Pagado
            </span>
            <button
              v-else
              class="btn btn-primary"
              :disabled="(cuentaTotals[c]?.total ?? 0) === 0"
              @click="openCobrarCuenta(c)"
            >
              Cobrar
            </button>
          </div>
        </div>
      </section>
    </template>

    <UiEmptyState
      v-else
      icon="i-lucide-split"
      title="No hay cuenta para dividir"
      subtitle="Esta mesa no tiene una orden abierta."
    >
      <UButton to="/app/pos" variant="outline" color="neutral" icon="i-lucide-arrow-left">Volver a mesas</UButton>
    </UiEmptyState>

    <!-- Mini modal de cobro -->
    <Teleport to="body">
      <div v-if="cobrarTarget" class="sb-modal-overlay" @click="cobrarTarget = null">
        <div class="sb-cobrar-modal" role="dialog" aria-modal="true" @click.stop>
          <div class="sb-cobrar-eyebrow">Cobrar · Mesa {{ pad(table?.number) }}</div>
          <h3 class="sb-cobrar-title">{{ cobrarTarget.label }}</h3>
          <div class="sb-cobrar-amount">{{ formatPEN(cobrarTarget.amount) }}</div>
          <div class="sb-cobrar-methods" role="radiogroup" aria-label="Método de pago">
            <button
              v-for="m in METHODS"
              :key="m.id"
              type="button"
              role="radio"
              :aria-checked="cobrarMethod === m.id"
              class="sb-cobrar-method"
              :class="{ on: cobrarMethod === m.id }"
              @click="cobrarMethod = m.id"
            >
              <UIcon :name="m.icon" />
              <span class="lbl">{{ m.label }}</span>
              <span class="sub">{{ m.sub }}</span>
            </button>
          </div>
          <div class="sb-cobrar-actions">
            <button class="btn btn-primary btn-lg btn-block" :disabled="!cobrarMethod" @click="confirmCobrar">
              <UIcon name="i-lucide-check-circle-2" /> Confirmar pago
            </button>
            <button class="btn btn-ghost btn-block" @click="cobrarTarget = null">Cancelar</button>
          </div>
        </div>
      </div>

      <!-- Éxito -->
      <div v-if="success" class="sb-modal-overlay">
        <div class="sb-cobrar-modal sb-success-card" role="dialog" aria-modal="true">
          <div class="sb-success-ico"><UIcon name="i-lucide-check" /></div>
          <h3 class="sb-cobrar-title">Mesa {{ pad(table?.number) }} cerrada</h3>
          <p class="sb-success-text">Pago completo. Mesa libre y disponible para el siguiente grupo.</p>
          <div class="sb-success-summary">
            <span class="lab">Cuentas cobradas</span>
            <span class="val">{{ collectedPayments.length }}</span>
            <span class="lab">Total cobrado</span>
            <span class="val">{{ formatPEN(collectedPayments.reduce((s, p) => s + p.amount, 0)) }}</span>
          </div>
          <button class="btn btn-dark btn-lg btn-block" @click="navigateTo('/app/pos')">
            <UIcon name="i-lucide-arrow-left" /> Volver al POS
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sb-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.sb-toggle {
  margin: 0 20px 16px;
  display: flex;
  background: var(--crema-200);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
}
.sb-toggle button {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: transparent; border: none;
  font: inherit; font-size: 13px; font-weight: 600;
  color: var(--fg2);
  padding: 10px;
  border-radius: 9px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.sb-toggle button.on { background: var(--pure-white); color: var(--fg1); box-shadow: var(--shadow-sm); }
.sb-toggle .iconify { width: 14px; height: 14px; }

.sb-panel { padding: 0 20px; }
.sb-hint {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--fg3);
  margin: 0 0 12px;
}
.sb-hint .iconify { width: 13px; height: 13px; }

.sb-shares, .sb-cuentas-resumen { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.sb-share {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  transition: opacity var(--dur) var(--ease-standard);
}
.sb-share.paid { background: var(--crema-100); }
.sb-share.empty { opacity: 0.55; }
.sb-share-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--terracotta-100); color: var(--terracotta-700);
  font-size: 15px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sb-share.paid .sb-share-avatar { background: var(--success-bg); color: var(--oliva-700); }
.sb-share-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sb-share-name { font-size: 14px; font-weight: 600; color: var(--fg1); }
.sb-share-amount { font-size: 12.5px; color: var(--fg3); font-variant-numeric: tabular-nums; }
.sb-share-paid {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: var(--oliva-700);
}
.sb-share-paid .iconify { width: 14px; height: 14px; }
.sb-share .btn { min-height: 36px; }

.sb-items {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.sb-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.sb-item:last-child { border-bottom: none; }
.sb-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sb-item-name {
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.sb-item-price { font-size: 12px; color: var(--fg3); font-family: var(--font-mono); }
.sb-item-cuentas { display: flex; gap: 4px; }
.sb-cuenta-chip {
  width: 32px; height: 32px; border-radius: 10px;
  font: inherit; font-size: 13px; font-weight: 700;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.sb-cuenta-chip.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.sb-cuenta-chip:disabled { opacity: 0.35; cursor: not-allowed; }
</style>

<style>
.sb-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.55);
  z-index: 54;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: sbFade 200ms ease;
}
@keyframes sbFade { from { opacity: 0; } to { opacity: 1; } }
.sb-cobrar-modal {
  background: var(--crema-100);
  border-radius: 18px;
  padding: 20px;
  width: 100%;
  max-width: 340px;
  animation: sbPop 280ms var(--ease-emphasis);
}
@keyframes sbPop {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.sb-cobrar-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
}
.sb-cobrar-title {
  font-size: 19px; font-weight: 600; color: var(--fg1);
  letter-spacing: -0.01em;
  margin: 4px 0 2px;
}
.sb-cobrar-amount {
  font-size: 34px; font-weight: 600; letter-spacing: -0.03em;
  color: var(--terracotta-700);
  font-variant-numeric: tabular-nums;
  margin-bottom: 14px;
}
.sb-cobrar-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
.sb-cobrar-method {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  background: var(--pure-white);
  border: 1.5px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease-standard);
}
.sb-cobrar-method.on { border-color: var(--terracotta); background: linear-gradient(160deg, var(--pure-white) 0%, #FCEEE6 100%); }
.sb-cobrar-method .iconify { width: 16px; height: 16px; color: var(--terracotta-700); margin-bottom: 3px; }
.sb-cobrar-method .lbl { font-size: 13px; font-weight: 600; color: var(--fg1); }
.sb-cobrar-method .sub { font-size: 10.5px; color: var(--fg3); }
.sb-cobrar-actions { display: flex; flex-direction: column; gap: 8px; }

.sb-success-card { text-align: center; }
.sb-success-ico {
  width: 60px; height: 60px; border-radius: 50%;
  background: var(--oliva); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 10px;
  animation: sbPop 320ms var(--ease-emphasis);
}
.sb-success-ico .iconify { width: 28px; height: 28px; }
.sb-success-text { font-size: 13px; color: var(--fg2); margin: 0 0 14px; line-height: 1.5; }
.sb-success-summary {
  display: grid; grid-template-columns: 1fr auto;
  gap: 6px 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  text-align: left;
}
.sb-success-summary .lab { font-size: 12.5px; color: var(--fg3); }
.sb-success-summary .val { font-size: 13px; font-weight: 600; color: var(--fg1); font-variant-numeric: tabular-nums; }
</style>
