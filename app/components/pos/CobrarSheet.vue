<script setup lang="ts">
import type { DiningTable, Order, PaymentMethod } from '#shared/types/domain'

const props = defineProps<{
  order: Order
  table: DiningTable
}>()

const emit = defineEmits<{
  paid: [serie: string, number: number]
}>()

const open = defineModel<boolean>({ required: true })

const payOrder = usePayOrder()

const METHODS: Array<{ id: PaymentMethod, label: string, sub: string, icon: string }> = [
  { id: 'cash', label: 'Efectivo', sub: 'Caja', icon: 'i-lucide-banknote' },
  { id: 'card', label: 'Tarjeta', sub: 'POS externo', icon: 'i-lucide-credit-card' },
  { id: 'yape', label: 'Yape', sub: 'QR · BCP', icon: 'i-lucide-smartphone' },
  { id: 'plin', label: 'Plin', sub: 'QR · multibanco', icon: 'i-lucide-smartphone' },
]

const showDesglose = ref(false)
const withServicio = ref(false)
const method = ref<PaymentMethod | null>(null)
const received = ref('')
const receiptType = ref<'boleta' | 'factura'>('boleta')
const customerDoc = ref('')
const customerName = ref('')
const phase = ref<'input' | 'loading' | 'success'>('input')
const result = ref<{ serie: string, number: number } | null>(null)
const bump = ref(false)

const totals = computed(() => orderTotals(props.order))
const servicio = computed(() => +(totals.value.total * 0.1).toFixed(2))
const finalTotal = computed(() => withServicio.value ? totals.value.total + servicio.value : totals.value.total)
const subtotal = computed(() => +(finalTotal.value / 1.18).toFixed(2))
const igv = computed(() => +(finalTotal.value - subtotal.value).toFixed(2))
const productCount = computed(() => props.order.items.reduce((s, it) => s + it.qty, 0))

const receivedNum = computed(() => Number(received.value) || 0)
const change = computed(() => Math.max(0, receivedNum.value - finalTotal.value))
const CASH_CHIPS = computed(() => {
  const t = finalTotal.value
  const round10 = Math.ceil(t / 10) * 10
  const round50 = Math.ceil(t / 50) * 50
  const set = [...new Set([+t.toFixed(2), round10, round50, round50 + 50])]
  return set.slice(0, 4)
})

const docLabel = computed(() => receiptType.value === 'boleta' ? 'DNI (opcional)' : 'RUC (11 dígitos)')
const docOk = computed(() =>
  receiptType.value === 'boleta' || /^\d{11}$/.test(customerDoc.value),
)
const cashOk = computed(() =>
  method.value !== 'cash' || receivedNum.value >= finalTotal.value || received.value === '',
)
const canConfirm = computed(() => method.value !== null && docOk.value && cashOk.value && phase.value === 'input')

watch(open, (isOpen) => {
  if (isOpen) {
    showDesglose.value = false
    withServicio.value = false
    method.value = null
    received.value = ''
    receiptType.value = 'boleta'
    customerDoc.value = ''
    customerName.value = ''
    phase.value = 'input'
    result.value = null
  }
})

watch(withServicio, () => {
  bump.value = true
  setTimeout(() => { bump.value = false }, 380)
})

async function confirm(): Promise<void> {
  if (!canConfirm.value || !method.value) return
  phase.value = 'loading'
  try {
    const { sale } = await payOrder.mutateAsync({
      orderId: props.order.id,
      payments: [{ method: method.value, amount: finalTotal.value }],
      docType: receiptType.value,
      customer: customerName.value || undefined,
      customerDoc: customerDoc.value || undefined,
    })
    result.value = { serie: sale.serie, number: sale.number }
    phase.value = 'success'
  }
  catch {
    phase.value = 'input'
  }
}

function finish(close: () => void): void {
  if (result.value) {
    emit('paid', result.value.serie, result.value.number)
  }
  close()
}

const pad = (n: number): string => String(n).padStart(2, '0')

// QR mock determinístico (port del prototipo)
const qrCells = computed(() => {
  const seed = `${method.value}:${finalTotal.value}`
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const cells: Array<{ x: number, y: number }> = []
  for (let r = 0; r < 21; r++) {
    for (let c = 0; c < 21; c++) {
      const cc = c <= 10 ? c : 20 - c
      h = (h * 1103515245 + 12345) >>> 0
      const on = ((h ^ (r * 7 + cc * 13)) & 7) > 3
      const inFinder = (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7)
      if (!inFinder && on) cells.push({ x: c, y: r })
    }
  }
  return cells
})
</script>

<template>
  <UiBottomSheet v-model="open" :title="`Cobrar Mesa ${pad(table.number)}`" :subtitle="`${table.zone} · ${productCount} productos`">
    <!-- ===== Éxito ===== -->
    <div v-if="phase === 'success'" class="cb-success">
      <div class="cb-success-ico"><UIcon name="i-lucide-check" /></div>
      <h3 class="cb-success-title">Pago registrado</h3>
      <p class="cb-success-text">
        Comprobante <b>{{ result?.serie }}-{{ result?.number }}</b> emitido por {{ formatPEN(finalTotal) }}.
        La mesa quedó libre.
      </p>
    </div>

    <template v-else>
      <!-- Total destacado -->
      <section class="cb-total" aria-live="polite">
        <div class="cb-total-num" :class="{ bump }">
          <span class="currency">S/</span>
          <span class="live">{{ finalTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 }) }}</span>
        </div>
        <div class="cb-total-label">Total a cobrar · IGV incluido</div>
        <button class="cb-desglose-toggle" :aria-expanded="showDesglose" @click="showDesglose = !showDesglose">
          {{ showDesglose ? 'Ocultar desglose' : 'Ver desglose' }}
          <UIcon name="i-lucide-chevron-down" :class="{ flip: showDesglose }" />
        </button>
      </section>

      <!-- Desglose -->
      <section v-if="showDesglose" class="cb-desglose">
        <!-- Con descuento: mostrar bruto → descuento (con motivo) → subtotal/IGV. -->
        <div v-if="order.discount" class="row"><span class="lbl">Total bruto</span><span class="val">{{ formatPEN(totals.gross) }}</span></div>
        <div v-if="order.discount" class="row dsc">
          <span class="lbl">
            Descuento
            <span v-if="order.discount.type === 'pct'" class="cb-dsc-tag">{{ order.discount.value }}%</span>
            <span v-if="order.discount.reason" class="cb-dsc-reason">· {{ order.discount.reason }}</span>
          </span>
          <span class="val">− {{ formatPEN(totals.discount) }}</span>
        </div>
        <div class="row"><span class="lbl">Subtotal</span><span class="val">{{ formatPEN(subtotal) }}</span></div>
        <div class="row"><span class="lbl">IGV (18 %)</span><span class="val">{{ formatPEN(igv) }}</span></div>
        <div v-if="withServicio" class="row"><span class="lbl">Servicio (10 %)</span><span class="val">{{ formatPEN(servicio) }}</span></div>
      </section>

      <!-- Servicio toggle -->
      <section class="cb-servicio">
        <div class="cb-servicio-text">
          <b>Agregar servicio (10 %)</b>
          <span>+ {{ formatPEN(servicio) }} · voluntario</span>
        </div>
        <USwitch v-model="withServicio" aria-label="Agregar servicio del 10 por ciento" />
      </section>

      <!-- Métodos -->
      <section class="field-block">
        <div class="field-label"><span>Método de pago</span></div>
        <div class="cb-methods" role="radiogroup" aria-label="Método de pago">
          <button
            v-for="m in METHODS"
            :key="m.id"
            type="button"
            role="radio"
            :aria-checked="method === m.id"
            class="cb-method"
            :class="{ on: method === m.id }"
            @click="method = m.id"
          >
            <UIcon :name="m.icon" />
            <span class="lbl">{{ m.label }}</span>
            <span class="sub">{{ m.sub }}</span>
          </button>
        </div>
      </section>

      <!-- Efectivo: recibido y vuelto -->
      <section v-if="method === 'cash'" class="field-block">
        <div class="field-label">
          <span>Efectivo recibido</span>
          <span class="hint">Vuelto: {{ formatPEN(change) }}</span>
        </div>
        <input
          v-model="received"
          type="text"
          inputmode="decimal"
          class="field-input cb-cash-input"
          placeholder="0.00"
          aria-label="Monto recibido en soles"
        >
        <div class="cb-chips">
          <button
            v-for="c in CASH_CHIPS"
            :key="c"
            type="button"
            class="cb-chip"
            :class="{ on: receivedNum === c }"
            @click="received = String(c)"
          >S/ {{ c }}</button>
        </div>
      </section>

      <!-- QR para yape/plin -->
      <section v-if="method === 'yape' || method === 'plin'" class="cb-qr">
        <svg class="cb-qr-img" viewBox="0 0 21 21" shape-rendering="crispEdges" aria-label="QR de pago simulado">
          <rect x="0" y="0" width="21" height="21" fill="#fff" />
          <rect v-for="(c, i) in qrCells" :key="i" :x="c.x" :y="c.y" width="1" height="1" fill="#1A1A1A" />
          <g v-for="(f, i) in [[0, 0], [14, 0], [0, 14]]" :key="`f${i}`" :transform="`translate(${f[0]},${f[1]})`">
            <rect width="7" height="7" fill="#1A1A1A" />
            <rect x="1" y="1" width="5" height="5" fill="#fff" />
            <rect x="2" y="2" width="3" height="3" fill="#1A1A1A" />
          </g>
        </svg>
        <div class="cb-qr-text">
          <b>Escanea con {{ method === 'yape' ? 'Yape' : 'Plin' }}</b>
          <span>{{ formatPEN(finalTotal) }} · Motif Restobar</span>
        </div>
      </section>

      <!-- Comprobante -->
      <section class="field-block">
        <div class="field-label"><span>Comprobante</span></div>
        <div class="cb-receipt-toggle" role="tablist">
          <button type="button" role="tab" :aria-selected="receiptType === 'boleta'" :class="{ on: receiptType === 'boleta' }" @click="receiptType = 'boleta'">Boleta</button>
          <button type="button" role="tab" :aria-selected="receiptType === 'factura'" :class="{ on: receiptType === 'factura' }" @click="receiptType = 'factura'">Factura</button>
        </div>
        <input
          v-model="customerDoc"
          type="text"
          inputmode="numeric"
          class="field-input cb-doc-input"
          :placeholder="docLabel"
          :maxlength="receiptType === 'boleta' ? 8 : 11"
          :aria-label="docLabel"
        >
        <input
          v-if="receiptType === 'factura'"
          v-model="customerName"
          type="text"
          class="field-input cb-doc-input"
          placeholder="Razón social"
          aria-label="Razón social"
        >
      </section>
    </template>

    <template #cta="{ close }">
      <button v-if="phase === 'success'" class="btn btn-dark btn-lg btn-block" @click="finish(close)">
        <UIcon name="i-lucide-arrow-left" /> Volver al POS
      </button>
      <button
        v-else
        class="btn btn-primary btn-lg btn-block"
        :disabled="!canConfirm"
        @click="confirm"
      >
        <UIcon :name="phase === 'loading' ? 'i-lucide-loader-2' : 'i-lucide-check-circle-2'" :class="{ spin: phase === 'loading' }" />
        {{ phase === 'loading' ? 'Procesando…' : `Confirmar cobro · ${formatPEN(finalTotal)}` }}
      </button>
    </template>
  </UiBottomSheet>
</template>

<style scoped>
.cb-total { text-align: center; padding: 4px 0 12px; }
.cb-total-num {
  font-size: 44px; font-weight: 600; letter-spacing: -0.04em; line-height: 1;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: baseline; gap: 6px;
}
.cb-total-num .currency { font-size: 20px; font-weight: 500; color: var(--fg3); }
.cb-total-num.bump { animation: bumpAnim 380ms var(--ease-emphasis); }
@keyframes bumpAnim {
  0% { transform: scale(1); }
  40% { transform: scale(1.06); }
  100% { transform: scale(1); }
}
.cb-total-label { font-size: 12px; color: var(--fg3); margin-top: 6px; }
.cb-desglose-toggle {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: none;
  font: inherit; font-size: 12.5px; font-weight: 600;
  color: var(--terracotta-700);
  cursor: pointer;
  margin-top: 8px;
}
.cb-desglose-toggle .iconify { width: 14px; height: 14px; transition: transform var(--dur) var(--ease-standard); }
.cb-desglose-toggle .iconify.flip { transform: rotate(180deg); }

.cb-desglose {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
}
.cb-desglose .row {
  display: flex; justify-content: space-between;
  font-size: 13px; color: var(--fg2);
  padding: 3px 0;
}
.cb-desglose .row .val { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--fg1); }
.cb-desglose .row.dsc .val { color: var(--terracotta-700); }
.cb-dsc-tag {
  font-size: 10.5px; font-weight: 700;
  background: var(--terracotta-100); color: var(--terracotta-700);
  padding: 1px 6px; border-radius: 999px; margin-left: 4px;
}
.cb-dsc-reason { color: var(--fg3); font-weight: 500; }

.cb-servicio {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--crema-100);
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 18px;
}
.cb-servicio-text { display: flex; flex-direction: column; gap: 1px; }
.cb-servicio-text b { font-size: 13.5px; color: var(--fg1); }
.cb-servicio-text span { font-size: 11.5px; color: var(--fg3); }

.cb-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cb-method {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: var(--pure-white);
  border: 1.5px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px;
  font: inherit;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.cb-method.on {
  border-color: var(--terracotta);
  background: linear-gradient(160deg, var(--pure-white) 0%, #FCEEE6 100%);
}
.cb-method .iconify { width: 18px; height: 18px; color: var(--terracotta-700); margin-bottom: 4px; }
.cb-method .lbl { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.cb-method .sub { font-size: 11px; color: var(--fg3); }

.cb-cash-input { font-size: 18px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.cb-chips { display: flex; gap: 6px; margin-top: 10px; }
.cb-chip {
  flex: 1;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 8px 0;
  border-radius: 10px;
  cursor: pointer;
}
.cb-chip.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }

.cb-qr {
  display: flex; align-items: center; gap: 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 18px;
}
.cb-qr-img {
  width: 96px; height: 96px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.cb-qr-text { display: flex; flex-direction: column; gap: 2px; }
.cb-qr-text b { font-size: 14px; color: var(--fg1); }
.cb-qr-text span { font-size: 12px; color: var(--fg3); }

.cb-receipt-toggle {
  display: flex;
  background: var(--crema-200);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  margin-bottom: 10px;
}
.cb-receipt-toggle button {
  flex: 1;
  background: transparent; border: none;
  font: inherit; font-size: 13px; font-weight: 600;
  color: var(--fg2);
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}
.cb-receipt-toggle button.on { background: var(--pure-white); color: var(--fg1); box-shadow: var(--shadow-sm); }
.cb-doc-input { margin-bottom: 8px; }

.cb-success { text-align: center; padding: 20px 0 10px; }
.cb-success-ico {
  width: 64px; height: 64px; border-radius: 50%;
  background: var(--oliva); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
  animation: popIn 320ms var(--ease-emphasis);
}
@keyframes popIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.cb-success-ico .iconify { width: 30px; height: 30px; }
.cb-success-title { font-size: 20px; font-weight: 600; color: var(--fg1); margin: 0 0 6px; }
.cb-success-text { font-size: 13.5px; color: var(--fg2); margin: 0; line-height: 1.5; }
.cb-success-text b { color: var(--fg1); }

.spin { animation: spinAnim 0.9s linear infinite; }
@keyframes spinAnim { to { transform: rotate(360deg); } }
</style>
