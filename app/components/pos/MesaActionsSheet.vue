<script setup lang="ts">
import type { ApiResponse } from '#shared/types/api'
import type { DiningTable, Order, PreBill } from '#shared/types/domain'

const props = defineProps<{
  table: DiningTable
  order: Order | null
}>()

const emit = defineEmits<{
  discount: []
}>()

const open = defineModel<boolean>({ required: true })

const toast = useToast()
const patchTable = usePatchTable()
const patchOrder = usePatchOrder()

const tableLabel = computed(() => String(props.table.number).padStart(2, '0'))
const itemCount = computed(() => props.order?.items.reduce((s, it) => s + it.qty, 0) ?? 0)
const total = computed(() => orderTotals(props.order).total)

interface MesaAction {
  id: string
  icon: string
  label: string
  sub: string
  ownerOnly?: boolean
  danger?: boolean
  separated?: boolean
}

const actions: MesaAction[] = [
  { id: 'descuento', icon: 'i-lucide-badge-percent', label: 'Aplicar descuento', sub: 'Por porcentaje o monto fijo', ownerOnly: true },
  { id: 'pre-cuenta', icon: 'i-lucide-receipt-text', label: 'Pre-cuenta', sub: 'Genera ticket sin cobrar' },
  { id: 'transferir', icon: 'i-lucide-arrow-right-left', label: 'Transferir mesa', sub: 'Mover el pedido a otra mesa', ownerOnly: true },
  { id: 'dividir', icon: 'i-lucide-split', label: 'Dividir cuenta', sub: 'Por persona o por items' },
  { id: 'notas', icon: 'i-lucide-sticky-note', label: 'Notas de la mesa', sub: 'Comentarios para cocina' },
  { id: 'cerrar-sin-cobrar', icon: 'i-lucide-circle-x', label: 'Cerrar sin cobrar', sub: 'Requiere motivo', danger: true, ownerOnly: true, separated: true },
]

const CLOSE_REASONS = [
  { id: 'cortesia', label: 'Cortesía de la casa' },
  { id: 'error', label: 'Error de cocina' },
  { id: 'cliente', label: 'Cliente insatisfecho' },
  { id: 'otro', label: 'Otro' },
] as const

const confirmClose = ref(false)
const reason = ref('')
const otherText = ref('')
const busy = ref(false)

const canConfirm = computed(() =>
  reason.value !== '' && (reason.value !== 'otro' || otherText.value.trim().length > 0),
)

async function handleAction(action: MesaAction, close: () => void): Promise<void> {
  close()
  switch (action.id) {
    case 'descuento':
      emit('discount')
      break
    case 'pre-cuenta':
      // HU-04-01: la pre-cuenta usa los totales AUTORITATIVOS del backend
      // (GET /api/orders/:id/pre-bill, preview que no persiste) y marca la mesa
      // como "pedir cuenta". El monto mostrado sale del backend, no del cálculo local.
      try {
        if (props.order) {
          const { data: preBill } = await $fetch<ApiResponse<PreBill>>(`/api/orders/${props.order.id}/pre-bill`)
          await patchTable.mutateAsync({ id: props.table.id, status: 'bill' })
          toast.add({ title: `Pre-cuenta · ${formatPEN(Number(preBill.total))}`, description: 'Enviada a impresora (IGV incluido).', icon: 'i-lucide-printer' })
        }
        else {
          await patchTable.mutateAsync({ id: props.table.id, status: 'bill' })
          toast.add({ title: 'Pre-cuenta enviada a impresora', icon: 'i-lucide-printer' })
        }
      }
      catch (err) {
        toast.add({ title: 'No se pudo generar la pre-cuenta', description: errorMessage(err, 'Intenta de nuevo.'), icon: 'i-lucide-alert-triangle', color: 'error' })
      }
      break
    case 'dividir':
      await navigateTo(`/app/pos/mesa/${props.table.id}/dividir`)
      break
    case 'transferir':
      toast.add({ title: 'Transferir mesa', description: 'Disponible próximamente', icon: 'i-lucide-arrow-right-left' })
      break
    case 'notas':
      toast.add({ title: 'Notas de la mesa', description: 'Disponible próximamente', icon: 'i-lucide-sticky-note' })
      break
    case 'cerrar-sin-cobrar':
      reason.value = ''
      otherText.value = ''
      confirmClose.value = true
      break
  }
}

async function closeWithoutCharge(): Promise<void> {
  if (!canConfirm.value || busy.value) return
  busy.value = true
  try {
    const reasonLabel = reason.value === 'otro'
      ? otherText.value.trim()
      : CLOSE_REASONS.find(r => r.id === reason.value)?.label ?? ''
    if (props.order) {
      // HU-03-11: el backend exige razón; va en `voidReason` y libera la mesa.
      await patchOrder.mutateAsync({ orderId: props.order.id, status: 'void', voidReason: reasonLabel })
    }
    else {
      // Sin orden activa (p. ej. mesa reservada): solo liberar la mesa.
      await patchTable.mutateAsync({ id: props.table.id, status: 'free' })
    }
    confirmClose.value = false
    toast.add({ title: `Mesa ${tableLabel.value} cerrada sin cobrar · ${reasonLabel}`, icon: 'i-lucide-circle-x' })
    await navigateTo('/app/pos')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UiBottomSheet
    v-model="open"
    :title="`Mesa ${tableLabel}`"
    :subtitle="`${itemCount} items · ${formatPEN(total)}`"
  >
    <template #default="{ close }">
      <nav class="mas-list" aria-label="Acciones secundarias de la mesa">
        <button
          v-for="a in actions"
          :key="a.id"
          type="button"
          class="mas-row"
          :class="{ 'is-danger': a.danger, 'mas-row--separated': a.separated }"
          :aria-label="`${a.label}. ${a.sub}`"
          @click="handleAction(a, close)"
        >
          <span class="mas-ico" aria-hidden="true">
            <UIcon :name="a.icon" />
          </span>
          <span class="mas-body">
            <span class="mas-label">
              {{ a.label }}
              <span v-if="a.ownerOnly" class="mas-owner" title="Solo dueño/admin">Owner</span>
            </span>
            <span class="mas-sub">{{ a.sub }}</span>
          </span>
          <span class="mas-chev" aria-hidden="true">
            <UIcon name="i-lucide-chevron-right" />
          </span>
        </button>
      </nav>
    </template>
  </UiBottomSheet>

  <!-- Confirmación: cerrar sin cobrar -->
  <Teleport to="body">
    <div v-if="confirmClose" class="modal-overlay" role="presentation" @click="confirmClose = false">
      <div
        class="modal"
        role="alertdialog"
        aria-modal="true"
        :aria-label="`Cerrar Mesa ${tableLabel} sin cobrar`"
        @click.stop
      >
        <div class="modal-ico" aria-hidden="true">
          <UIcon name="i-lucide-alert-triangle" />
        </div>
        <h3 class="modal-title">Cerrar Mesa {{ tableLabel }} sin cobrar</h3>
        <p class="modal-text">
          Esta acción libera la mesa sin generar venta. Selecciona el motivo — quedará
          registrado en el reporte de cierres.
        </p>

        <div class="mas-field-label">Motivo</div>
        <div class="mas-reasons" role="radiogroup" aria-label="Motivo de cierre sin cobro">
          <button
            v-for="r in CLOSE_REASONS"
            :key="r.id"
            type="button"
            role="radio"
            :aria-checked="reason === r.id"
            class="mas-reason"
            :class="{ on: reason === r.id }"
            @click="reason = r.id"
          >
            <span class="radio" aria-hidden="true" />
            <span>{{ r.label }}</span>
          </button>
        </div>

        <div class="mas-reason-other" :class="{ open: reason === 'otro' }" :aria-hidden="reason !== 'otro'">
          <div class="inner">
            <textarea
              v-model="otherText"
              placeholder="Describe el motivo…"
              aria-label="Descripción del motivo"
              maxlength="140"
            />
          </div>
        </div>

        <div class="mas-confirm-actions">
          <button type="button" class="btn btn-danger btn-lg btn-block" :disabled="!canConfirm || busy" @click="closeWithoutCharge">
            <UIcon name="i-lucide-circle-x" />
            Sí, cerrar sin cobrar
          </button>
          <button type="button" class="btn btn-ghost btn-block" @click="confirmClose = false">
            Volver
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ---------- Lista de acciones ---------- */
.mas-list {
  display: flex;
  flex-direction: column;
  padding: 4px 0 8px;
}
.mas-row {
  display: grid;
  grid-template-columns: 40px 1fr 18px;
  gap: 14px;
  align-items: center;
  min-height: 60px;
  padding: 10px 4px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--fg1);
  width: 100%;
  transition: background var(--dur);
  border-radius: 10px;
}
.mas-row:last-child { border-bottom: none; }
.mas-row:hover { background: var(--crema-50); }
.mas-row:active { background: var(--crema-200); }

.mas-ico {
  width: 40px; height: 40px;
  border-radius: 999px;
  background: var(--crema-200);
  color: var(--fg1);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mas-ico .iconify { width: 18px; height: 18px; }

.mas-body { min-width: 0; }
.mas-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg1);
  letter-spacing: -0.005em;
  line-height: 1.25;
  display: flex; align-items: center; gap: 8px;
}
.mas-sub {
  font-size: 12.5px;
  color: var(--fg2);
  margin-top: 2px;
  line-height: 1.35;
  display: block;
}

.mas-chev {
  color: var(--fg3);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mas-chev .iconify { width: 16px; height: 16px; }
.mas-row:hover .mas-chev { color: var(--fg2); }

.mas-owner {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--terracotta-700);
  background: var(--crema-200);
  border: 1px solid var(--terracotta-100);
  padding: 2px 6px;
  border-radius: 999px;
  line-height: 1;
  flex-shrink: 0;
}

.mas-row.is-danger .mas-label { color: var(--danger); }
.mas-row.is-danger .mas-ico {
  background: var(--danger-bg);
  color: var(--danger);
}
.mas-row.is-danger .mas-sub { color: var(--danger); opacity: 0.75; }

.mas-row.mas-row--separated {
  margin-top: 6px;
  position: relative;
}
.mas-row.mas-row--separated::before {
  content: '';
  position: absolute;
  top: -3px; left: 4px; right: 4px;
  height: 1px;
  background: var(--border-subtle);
}

/* ---------- Modal cerrar sin cobrar ---------- */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.55);
  z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: mas-fade 200ms ease;
}
@keyframes mas-fade { from { opacity: 0; } to { opacity: 1; } }
.modal {
  background: var(--pure-white);
  border-radius: 16px;
  padding: 22px 20px 18px;
  width: 100%;
  max-width: 340px;
  text-align: left;
  animation: mas-modal-in 280ms var(--ease-emphasis);
}
@keyframes mas-modal-in {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.modal-ico {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--danger-bg); color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 12px;
}
.modal-ico .iconify { width: 22px; height: 22px; }
.modal-title {
  font-size: 17px; font-weight: 600;
  color: var(--fg1);
  letter-spacing: -0.01em;
  margin: 0 0 6px;
}
.modal-text {
  font-size: 13.5px; line-height: 1.45; color: var(--fg2);
  margin: 0 0 16px;
}
.mas-field-label {
  margin: 4px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg2);
  letter-spacing: 0.02em;
}

.mas-reasons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.mas-reason {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--crema-50);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  font-size: 13.5px;
  color: var(--fg1);
  text-align: left;
  width: 100%;
  transition: all var(--dur);
}
.mas-reason:hover { background: var(--crema-100); border-color: var(--border); }
.mas-reason .radio {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: var(--pure-white);
  flex-shrink: 0;
  position: relative;
  transition: all var(--dur);
}
.mas-reason.on {
  border-color: var(--danger);
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 600;
}
.mas-reason.on .radio {
  border-color: var(--danger);
  background: var(--danger);
}
.mas-reason.on .radio::after {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: var(--pure-white);
}

.mas-reason-other {
  margin: 2px 0 16px;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 240ms var(--ease-emphasis);
}
.mas-reason-other.open { grid-template-rows: 1fr; }
.mas-reason-other > .inner {
  overflow: hidden;
  min-height: 0;
}
.mas-reason-other textarea {
  width: 100%;
  min-height: 64px;
  resize: none;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: 13.5px;
  color: var(--fg1);
  outline: none;
  margin-top: 6px;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.mas-reason-other textarea:focus {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px rgba(179, 58, 42, 0.16);
}

.mas-confirm-actions {
  display: flex; flex-direction: column; gap: 8px;
  margin-top: 4px;
}
</style>
