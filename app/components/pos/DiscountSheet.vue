<script setup lang="ts">
import type { Order } from '#shared/types/domain'

const props = defineProps<{
  order: Order
}>()

const emit = defineEmits<{
  applied: []
}>()

const open = defineModel<boolean>({ required: true })

const toast = useToast()
const applyDiscount = useApplyDiscount()
const removeDiscount = useRemoveDiscount()

const REASONS = [
  { id: 'cortesia', label: 'Cortesía de la casa' },
  { id: 'frecuente', label: 'Cliente frecuente' },
  { id: 'promo', label: 'Promoción del día' },
  { id: 'error', label: 'Error de cocina' },
  { id: 'otro', label: 'Otro…' },
]
const PCT_CHIPS = [5, 10, 15, 20]
const AMT_CHIPS = [10, 20, 50]

const mode = ref<'percent' | 'amount'>('percent')
const pct = ref(10)
const amt = ref('')
const reason = ref('')
const otherText = ref('')
const busy = ref(false)

// Descuento ya aplicado a la orden (el backend lo persiste). Si existe, la
// pantalla lo precarga y ofrece quitarlo.
const existing = computed(() => props.order.discount ?? null)

// El descuento se calcula SOLO sobre lo ya enviado a cocina (`order.items`):
// es la única base que el backend conoce y sobre la que puede cobrar. Los
// ítems "por enviar" (carrito local de la pantalla de mesa) todavía no son
// parte de la orden — no tiene sentido descontarlos antes de enviarlos. Esta
// pantalla lo comunica explícitamente en vez de mostrar un "S/0.00" mudo
// (QA-05: fix de presentación; NO combina el carrito local en este total).
const total = computed(() => props.order.items.reduce((s, it) => s + it.qty * it.unitPrice, 0))
const hasSentItems = computed(() => props.order.items.length > 0)

// Motivo canónico → id del selector (los que no coinciden caen a "otro").
function reasonToId(label: string | undefined): string {
  if (!label) return ''
  return REASONS.find(r => r.label === label && r.id !== 'otro')?.id ?? 'otro'
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const d = existing.value
  if (d) {
    // Precarga el descuento vigente para editarlo o quitarlo.
    mode.value = d.type === 'pct' ? 'percent' : 'amount'
    pct.value = d.type === 'pct' ? d.value : 10
    amt.value = d.type === 'amount' ? String(d.value) : ''
    const id = reasonToId(d.reason)
    reason.value = id
    otherText.value = id === 'otro' ? (d.reason ?? '') : ''
  }
  else {
    mode.value = 'percent'
    pct.value = 10
    amt.value = ''
    reason.value = ''
    otherText.value = ''
  }
})

const pctNum = computed(() => Math.max(0, Math.min(50, pct.value || 0)))
const amtNum = computed(() => Math.max(0, Number(amt.value) || 0))
const amtOver = computed(() => amtNum.value > total.value)

const discount = computed(() =>
  mode.value === 'percent'
    ? (total.value * pctNum.value) / 100
    : Math.min(amtNum.value, total.value),
)
const finalTotal = computed(() => Math.max(0, total.value - discount.value))
const effectivePct = computed(() => (total.value > 0 ? (discount.value / total.value) * 100 : 0))
const hasDiscount = computed(() => discount.value > 0.005)

const reasonOk = computed(() => reason.value !== '' && (reason.value !== 'otro' || otherText.value.trim().length > 0))
const amountOk = computed(() => mode.value === 'percent' ? pctNum.value > 0 : (amtNum.value > 0 && !amtOver.value))
// Sin ítems enviados a cocina no hay base sobre la cual descontar — bloquea la
// aplicación en vez de dejar pasar un "10%" que numéricamente da S/0.00 (QA-05).
const canApply = computed(() => hasSentItems.value && amountOk.value && reasonOk.value)

const sliderFill = computed(() => `${(pctNum.value / 50) * 100}%`)

const hint = computed(() => {
  if (!hasSentItems.value) return 'Aún no hay ítems enviados a cocina para descontar.'
  if (!amountOk.value) {
    if (mode.value === 'percent') return 'Ingresa un porcentaje mayor a 0.'
    return amtOver.value ? 'Monto excede el total.' : 'Ingresa un monto a descontar.'
  }
  return 'Selecciona un motivo para continuar.'
})

async function apply(close: () => void): Promise<void> {
  if (!canApply.value || busy.value) return
  busy.value = true
  try {
    // Motivo obligatorio para el backend (min length 1). El label del select o el
    // texto libre en "Otro…".
    const reasonLabel = (reason.value === 'otro'
      ? otherText.value.trim()
      : REASONS.find(r => r.id === reason.value)?.label) ?? ''
    // El backend calcula el monto/total autoritativo; enviamos type/value/reason
    // y confiamos en su respuesta (que refresca `order.discount`).
    await applyDiscount.mutateAsync(
      mode.value === 'percent'
        ? { orderId: props.order.id, type: 'pct', value: pctNum.value, reason: reasonLabel }
        : { orderId: props.order.id, type: 'amount', value: +amtNum.value.toFixed(2), reason: reasonLabel },
    )
    // Toast de éxito SOLO tras 2xx.
    toast.add({
      title: `Descuento de ${mode.value === 'percent' ? `${pctNum.value} %` : formatPEN(amtNum.value)} aplicado`,
      icon: 'i-lucide-badge-percent',
    })
    close()
    emit('applied')
  }
  catch (e) {
    // 403 (staff sin permiso) y 400 (monto > bruto) se muestran con el mensaje
    // real del backend; el resto cae a un mensaje genérico.
    toast.add({
      title: errorMessage(e, 'No se pudo aplicar el descuento'),
      icon: 'i-lucide-alert-triangle',
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

async function remove(close: () => void): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await removeDiscount.mutateAsync(props.order.id)
    toast.add({ title: 'Descuento quitado', icon: 'i-lucide-badge-x' })
    close()
    emit('applied')
  }
  catch (e) {
    toast.add({
      title: errorMessage(e, 'No se pudo quitar el descuento'),
      icon: 'i-lucide-alert-triangle',
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UiBottomSheet v-model="open">
    <template #header>
      <h2 class="sheet-title dsc-title-row">
        Aplicar descuento
        <span class="dsc-owner-pill" title="Solo dueño/admin">
          <UIcon name="i-lucide-shield-check" /> Owner
        </span>
      </h2>
      <!-- El total SIEMPRE aclara su alcance: solo lo enviado a cocina, nunca el
           carrito "por enviar" (el backend todavía no conoce esos ítems). -->
      <div class="sheet-sub">Total actual {{ formatPEN(total) }} · solo ítems enviados a cocina</div>
    </template>

    <!-- Sin base: nada enviado a cocina todavía -->
    <div v-if="!hasSentItems" class="dsc-empty" role="status">
      <UIcon name="i-lucide-chef-hat" />
      <p class="dsc-empty-title">Aún no hay ítems enviados a cocina</p>
      <p class="dsc-empty-sub">El descuento se aplica sobre lo enviado a cocina. Envía el pedido y vuelve a abrir esta pantalla.</p>
    </div>

    <template v-else>
    <!-- Tipo -->
    <div class="dsc-toggle" role="tablist" aria-label="Tipo de descuento">
      <button type="button" role="tab" :aria-selected="mode === 'percent'" :class="{ on: mode === 'percent' }" @click="mode = 'percent'">
        <UIcon name="i-lucide-percent" /> Por porcentaje
      </button>
      <button type="button" role="tab" :aria-selected="mode === 'amount'" :class="{ on: mode === 'amount' }" @click="mode = 'amount'">
        <UIcon name="i-lucide-banknote" /> Monto fijo
      </button>
    </div>

    <!-- Porcentaje -->
    <section v-if="mode === 'percent'" class="dsc-block">
      <div class="field-label">
        <span>Porcentaje</span>
        <span class="hint">0–50 %</span>
      </div>
      <div class="dsc-slider-row">
        <div class="dsc-slider-shell" :style="{ '--pct': sliderFill }">
          <input
            v-model.number="pct"
            type="range"
            class="dsc-slider"
            min="0" max="50" step="1"
            aria-label="Porcentaje de descuento"
          >
        </div>
        <div class="dsc-input-wrap dsc-pct-input">
          <input
            v-model.number="pct"
            type="number"
            class="dsc-input"
            inputmode="numeric"
            min="0" max="50" step="1"
            aria-label="Porcentaje exacto"
          >
          <span class="dsc-affix" aria-hidden="true">%</span>
        </div>
      </div>
      <div class="dsc-chips" role="group" aria-label="Porcentajes rápidos">
        <button
          v-for="c in PCT_CHIPS"
          :key="c"
          type="button"
          class="dsc-chip"
          :class="{ on: pctNum === c }"
          @click="pct = c"
        >{{ c }}%</button>
      </div>
    </section>

    <!-- Monto -->
    <section v-else class="dsc-block">
      <div class="field-label">
        <span>Monto a descontar</span>
        <span class="hint">Máx {{ formatPEN(total) }}</span>
      </div>
      <div class="dsc-input-wrap" :class="{ 'is-error': amtOver }">
        <span class="dsc-affix-start" aria-hidden="true">S/</span>
        <input
          v-model="amt"
          type="text"
          class="dsc-input has-affix"
          inputmode="decimal"
          placeholder="0.00"
          aria-label="Monto del descuento en soles"
          :aria-invalid="amtOver"
        >
      </div>
      <div v-if="amtOver" class="dsc-error" role="alert">
        <UIcon name="i-lucide-alert-circle" />
        El descuento no puede exceder {{ formatPEN(total) }}.
      </div>
      <div class="dsc-chips" role="group" aria-label="Montos rápidos">
        <button
          v-for="c in AMT_CHIPS"
          :key="c"
          type="button"
          class="dsc-chip"
          :class="{ on: amtNum === c }"
          @click="amt = String(c)"
        >S/ {{ c }}</button>
      </div>
    </section>

    <!-- Vista previa -->
    <section class="dsc-preview" :class="{ 'is-active': hasDiscount }" aria-live="polite">
      <div class="dsc-pre-row">
        <span class="lab">Total original</span>
        <span class="val" :class="{ 'is-struck': hasDiscount }">{{ formatPEN(total) }}</span>
      </div>
      <div class="dsc-pre-row discount">
        <span class="lab">
          Descuento
          <span v-if="hasDiscount" class="pct">−{{ effectivePct.toFixed(effectivePct >= 10 ? 0 : 1) }}%</span>
        </span>
        <span class="val">{{ hasDiscount ? `− ${formatPEN(discount)}` : 'S/ 0.00' }}</span>
      </div>
      <div class="dsc-pre-divider" aria-hidden="true" />
      <div class="dsc-pre-row final" :class="{ 'is-active': hasDiscount }">
        <span class="lab">Total final</span>
        <span class="val">{{ formatPEN(finalTotal) }}</span>
      </div>
    </section>

    <!-- Motivo -->
    <section class="dsc-block">
      <div class="field-label">
        <span>Motivo del descuento</span>
        <span class="hint">Obligatorio</span>
      </div>
      <div class="dsc-select-wrap">
        <select v-model="reason" class="dsc-select" :class="{ 'is-empty': reason === '' }" aria-label="Motivo del descuento">
          <option value="" disabled>Selecciona un motivo…</option>
          <option v-for="r in REASONS" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>
        <span class="dsc-select-chev" aria-hidden="true"><UIcon name="i-lucide-chevron-down" /></span>
      </div>
      <input
        v-if="reason === 'otro'"
        v-model="otherText"
        type="text"
        class="field-input dsc-other"
        placeholder="Describe el motivo…"
        maxlength="80"
        aria-label="Motivo personalizado"
      >
    </section>
    </template>

    <template #cta="{ close }">
      <div v-if="hasSentItems && !canApply" class="dsc-cta-hint" role="status">
        <UIcon name="i-lucide-info" /> {{ hint }}
      </div>
      <!-- Con descuento vigente: permitir quitarlo, además de reemplazarlo. -->
      <button
        v-if="existing"
        type="button"
        class="dsc-remove-btn"
        :disabled="busy"
        @click="remove(close)"
      >
        <UIcon name="i-lucide-badge-x" /> Quitar descuento actual
      </button>
      <div class="dsc-cta-row">
        <button type="button" class="btn btn-ghost" @click="close">Cancelar</button>
        <button type="button" class="btn btn-primary" :disabled="!canApply || busy" @click="apply(close)">
          <UIcon name="i-lucide-check" /> {{ existing ? 'Actualizar descuento' : 'Aplicar descuento' }}
        </button>
      </div>
    </template>
  </UiBottomSheet>
</template>

<style scoped>
/* Sin ítems enviados a cocina: no hay base para descontar (QA-05) */
.dsc-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 6px;
  padding: 32px 16px;
  color: var(--fg2);
}
.dsc-empty > .iconify { width: 28px; height: 28px; color: var(--fg3); margin-bottom: 4px; }
.dsc-empty-title { font-size: 14.5px; font-weight: 600; color: var(--fg1); margin: 0; }
.dsc-empty-sub { font-size: 12.5px; color: var(--fg3); line-height: 1.5; max-width: 34ch; margin: 0; }

.dsc-title-row { display: flex; align-items: center; gap: 8px; }
.dsc-owner-pill {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  background: var(--mostaza-100); color: var(--mostaza-700);
  padding: 3px 8px; border-radius: 999px;
}
.dsc-owner-pill .iconify { width: 11px; height: 11px; }

.dsc-toggle {
  display: flex;
  background: var(--crema-200);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
  margin-bottom: 18px;
}
.dsc-toggle button {
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
.dsc-toggle button.on { background: var(--pure-white); color: var(--fg1); box-shadow: var(--shadow-sm); }
.dsc-toggle .iconify { width: 14px; height: 14px; }

.dsc-block { margin-bottom: 18px; }

.dsc-slider-row { display: flex; align-items: center; gap: 12px; }
.dsc-slider-shell { flex: 1; position: relative; height: 32px; display: flex; align-items: center; }
.dsc-slider {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--terracotta) var(--pct), var(--crema-200) var(--pct));
  outline: none;
  cursor: pointer;
}
.dsc-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--pure-white);
  border: 2px solid var(--terracotta);
  box-shadow: var(--shadow-sm);
  cursor: grab;
}
.dsc-slider::-moz-range-thumb {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--pure-white);
  border: 2px solid var(--terracotta);
  box-shadow: var(--shadow-sm);
  cursor: grab;
}
.dsc-pct-input { width: 110px; flex-shrink: 0; }

.dsc-input-wrap { position: relative; }
.dsc-input {
  width: 100%;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 34px 12px 14px;
  font: inherit; font-size: 18px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
  outline: none;
  text-align: right;
  transition: border-color var(--dur) var(--ease-standard), box-shadow var(--dur) var(--ease-standard);
}
.dsc-input:focus { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.dsc-input.has-affix { padding-left: 40px; text-align: left; }
.dsc-input-wrap.is-error .dsc-input { border-color: var(--danger); }
.dsc-affix {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  font-size: 14px; font-weight: 600; color: var(--fg3);
}
.dsc-affix-start {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  font-size: 14px; font-weight: 600; color: var(--fg3);
}
.dsc-error {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--danger);
  margin-top: 8px;
}
.dsc-error .iconify { width: 13px; height: 13px; }

.dsc-chips { display: flex; gap: 6px; margin-top: 12px; }
.dsc-chip {
  flex: 1;
  font: inherit; font-size: 13px; font-weight: 600;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 8px 0;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.dsc-chip.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }

.dsc-preview {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 18px;
  transition: border-color var(--dur) var(--ease-standard);
}
.dsc-preview.is-active { border-color: var(--terracotta-300); }
.dsc-pre-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13.5px; color: var(--fg2);
  padding: 4px 0;
}
.dsc-pre-row .val { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--fg1); }
.dsc-pre-row .val.is-struck { text-decoration: line-through; color: var(--fg3); font-weight: 500; }
.dsc-pre-row.discount .val { color: var(--terracotta-700); }
.dsc-pre-row .pct {
  font-size: 11px; font-weight: 700;
  background: var(--terracotta-100); color: var(--terracotta-700);
  padding: 1px 7px; border-radius: 999px;
  margin-left: 6px;
}
.dsc-pre-divider { border-top: 1px dashed var(--border); margin: 6px 0; }
.dsc-pre-row.final { font-size: 15px; }
.dsc-pre-row.final .val { font-size: 20px; letter-spacing: -0.02em; }
.dsc-pre-row.final.is-active .val { color: var(--terracotta-700); }

.dsc-select-wrap { position: relative; }
.dsc-select {
  width: 100%;
  appearance: none;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 38px 12px 14px;
  font: inherit; font-size: 14px;
  color: var(--fg1);
  outline: none;
  cursor: pointer;
}
.dsc-select.is-empty { color: var(--fg3); }
.dsc-select:focus { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.dsc-select-chev {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  color: var(--fg3);
  pointer-events: none;
}
.dsc-select-chev .iconify { width: 16px; height: 16px; }
.dsc-other { margin-top: 10px; }

.dsc-cta-hint {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--fg3);
  margin-bottom: 10px;
}
.dsc-cta-hint .iconify { width: 13px; height: 13px; }
.dsc-cta-row { display: grid; grid-template-columns: auto 1fr; gap: 10px; }
.dsc-cta-row .btn { min-height: 48px; border-radius: 12px; justify-content: center; font-size: 14px; }
.dsc-remove-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; margin-bottom: 10px;
  background: transparent; border: 1px solid var(--danger);
  color: var(--danger);
  font: inherit; font-size: 13px; font-weight: 600;
  padding: 10px; border-radius: 12px; cursor: pointer; min-height: 44px;
}
.dsc-remove-btn:disabled { opacity: 0.6; cursor: default; }
.dsc-remove-btn .iconify { width: 15px; height: 15px; }
</style>
