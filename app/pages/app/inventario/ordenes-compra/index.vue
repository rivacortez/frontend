<script setup lang="ts">
import type { PurchaseOrder, PurchaseOrderStatus } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Órdenes de Compra — GastronomIA' })

const { user } = useUserSession()
const readonly = computed(() => user.value?.role !== 'owner' && user.value?.role !== 'manager')

const toast = useToast()
const { data: orders, refresh } = usePurchaseOrders()
const { data: suppliers } = useSuppliers()
const { data: ingredients } = useIngredients()

const createPO = useCreatePurchaseOrder()
const sendPO = useSendPurchaseOrder()
const cancelPO = useCancelPurchaseOrder()
const receivePO = useReceivePurchaseOrder()

const STATUS_META: Record<PurchaseOrderStatus, { label: string, cls: string }> = {
  draft: { label: 'Borrador', cls: 'draft' },
  sent: { label: 'Enviada', cls: 'sent' },
  partially_received: { label: 'Parcial', cls: 'partial' },
  received: { label: 'Recibida', cls: 'received' },
  cancelled: { label: 'Cancelada', cls: 'cancelled' },
}

const list = computed(() => orders.value ?? [])

/* ===== Crear OC ===== */
interface DraftLine { ingredientId: string, qtyOrdered: string, unitCost: string }
const showCreate = ref(false)
const draftSupplier = ref('')
const draftNotes = ref('')
const draftExpected = ref('')
const draftLines = ref<DraftLine[]>([])
const creating = ref(false)

function openCreate(): void {
  draftSupplier.value = suppliers.value?.[0]?.id ?? ''
  draftNotes.value = ''
  draftExpected.value = ''
  draftLines.value = [{ ingredientId: ingredients.value?.[0]?.id ?? '', qtyOrdered: '', unitCost: '' }]
  showCreate.value = true
}

function addLine(): void {
  draftLines.value.push({ ingredientId: ingredients.value?.[0]?.id ?? '', qtyOrdered: '', unitCost: '' })
}
function removeLine(idx: number): void {
  draftLines.value.splice(idx, 1)
}

// Prellenar el costo con el del catálogo al elegir insumo (si está vacío).
function onPickIngredient(line: DraftLine): void {
  if (!line.unitCost) {
    const ing = ingredients.value?.find(i => i.id === line.ingredientId)
    if (ing && ing.unitCost > 0) line.unitCost = ing.unitCost.toFixed(2)
  }
}

const draftTotal = computed(() =>
  draftLines.value.reduce((sum, l) => sum + (Number.parseFloat(l.qtyOrdered) || 0) * (Number.parseFloat(l.unitCost) || 0), 0))

const canCreate = computed(() =>
  draftSupplier.value !== ''
  && draftLines.value.length > 0
  && draftLines.value.every(l => l.ingredientId && (Number.parseFloat(l.qtyOrdered) || 0) > 0 && (Number.parseFloat(l.unitCost) || 0) >= 0))

async function submitCreate(): Promise<void> {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    await createPO.mutateAsync({
      supplierId: draftSupplier.value,
      notes: draftNotes.value.trim() || undefined,
      expectedAt: draftExpected.value ? new Date(draftExpected.value).toISOString() : undefined,
      items: draftLines.value.map(l => ({
        ingredientId: l.ingredientId,
        qtyOrdered: Number.parseFloat(l.qtyOrdered),
        unitCost: Number.parseFloat(l.unitCost),
      })),
    })
    showCreate.value = false
    toast.add({ title: 'Orden de compra creada (borrador)', icon: 'i-lucide-check-circle-2' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo crear la OC'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    creating.value = false
  }
}

/* ===== Detalle + acciones ===== */
const selected = ref<PurchaseOrder | null>(null)
const showDetail = ref(false)
const acting = ref(false)
// Recepción: itemId → cantidad a recibir ahora.
const receiveQty = ref<Record<string, string>>({})

function openDetail(po: PurchaseOrder): void {
  selected.value = po
  receiveQty.value = {}
  showDetail.value = true
}

// Refrescar la OC seleccionada cuando llega data nueva (tras una acción).
watchEffect(() => {
  if (selected.value) {
    const fresh = list.value.find(p => p.id === selected.value!.id)
    if (fresh) selected.value = fresh
  }
})

const canSend = computed(() => selected.value?.status === 'draft')
const canCancel = computed(() => selected.value?.status === 'draft' || selected.value?.status === 'sent')
const canReceive = computed(() => selected.value?.status === 'sent' || selected.value?.status === 'partially_received')

function pending(itemId: string): number {
  const it = selected.value?.items.find(i => i.id === itemId)
  if (!it) return 0
  return +(Number(it.qtyOrdered) - Number(it.qtyReceived)).toFixed(3)
}

const receiveLines = computed(() =>
  Object.entries(receiveQty.value)
    .map(([itemId, qty]) => ({ itemId, qtyReceived: Number.parseFloat(qty) || 0 }))
    .filter(l => l.qtyReceived > 0))

const canSubmitReceive = computed(() =>
  receiveLines.value.length > 0
  && receiveLines.value.every(l => l.qtyReceived <= pending(l.itemId)))

async function doSend(): Promise<void> {
  if (!selected.value || acting.value) return
  acting.value = true
  try {
    await sendPO.mutateAsync(selected.value.id)
    toast.add({ title: 'OC enviada al proveedor', icon: 'i-lucide-send' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo enviar'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally { acting.value = false }
}

async function doCancel(): Promise<void> {
  if (!selected.value || acting.value) return
  acting.value = true
  try {
    await cancelPO.mutateAsync(selected.value.id)
    toast.add({ title: 'OC cancelada', icon: 'i-lucide-x-circle' })
    await refresh()
    showDetail.value = false
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo cancelar'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally { acting.value = false }
}

async function doReceive(): Promise<void> {
  if (!selected.value || !canSubmitReceive.value || acting.value) return
  acting.value = true
  try {
    await receivePO.mutateAsync({ id: selected.value.id, items: receiveLines.value })
    toast.add({ title: 'Recepción registrada · stock actualizado', icon: 'i-lucide-package-check' })
    receiveQty.value = {}
    await refresh()
  }
  catch (e) {
    toast.add({ title: errorMessage(e, 'No se pudo recepcionar'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally { acting.value = false }
}

function fillRemaining(itemId: string): void {
  receiveQty.value = { ...receiveQty.value, [itemId]: String(pending(itemId)) }
}
</script>

<template>
  <div class="po-screen">
    <UiScreenHeader title="Órdenes de Compra" subtitle="Pedidos a proveedores (E05)" back="/app/inventario">
      <template #trailing>
        <UButton v-if="!readonly" icon="i-lucide-plus" size="sm" color="primary" @click="openCreate">Nueva</UButton>
      </template>
    </UiScreenHeader>

    <div v-if="list.length" class="po-list">
      <button
        v-for="po in list"
        :key="po.id"
        class="po-card"
        @click="openDetail(po)"
      >
        <div class="po-card-main">
          <div class="po-card-supplier">{{ po.supplierName }}</div>
          <div class="po-card-meta">
            {{ po.items.length }} ítem{{ po.items.length === 1 ? '' : 's' }}
            <template v-if="po.expectedAt"> · llega {{ formatShortDate(po.expectedAt) }}</template>
          </div>
        </div>
        <div class="po-card-right">
          <span class="po-badge" :class="STATUS_META[po.status].cls">{{ STATUS_META[po.status].label }}</span>
          <span class="po-card-total">{{ formatPEN(Number(po.total)) }}</span>
        </div>
      </button>
    </div>

    <UiEmptyState
      v-else
      icon="i-lucide-clipboard-list"
      title="Sin órdenes de compra"
      subtitle="Crea una OC para pedir insumos a tus proveedores."
    >
      <UButton v-if="!readonly" icon="i-lucide-plus" @click="openCreate">Nueva orden</UButton>
    </UiEmptyState>

    <!-- ===== Sheet: crear OC ===== -->
    <UiBottomSheet v-model="showCreate" title="Nueva orden de compra" subtitle="Proveedor + insumos a pedir">
      <div class="po-field">
        <div class="lbl">Proveedor</div>
        <select v-model="draftSupplier" class="po-input">
          <option v-for="s in suppliers ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <div class="po-field">
        <div class="lbl">Fecha esperada <span class="opt">opcional</span></div>
        <input v-model="draftExpected" type="date" class="po-input">
      </div>

      <div class="po-lines">
        <div class="lbl">Insumos</div>
        <div v-for="(line, idx) in draftLines" :key="idx" class="po-line">
          <select v-model="line.ingredientId" class="po-input po-line-ing" @change="onPickIngredient(line)">
            <option v-for="i in ingredients ?? []" :key="i.id" :value="i.id">{{ i.name }}</option>
          </select>
          <input v-model="line.qtyOrdered" class="po-input po-line-qty" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Cant.">
          <input v-model="line.unitCost" class="po-input po-line-cost" type="number" inputmode="decimal" min="0" step="0.01" placeholder="S/ c/u">
          <button v-if="draftLines.length > 1" class="po-line-rm" aria-label="Quitar línea" @click="removeLine(idx)">
            <UIcon name="i-lucide-x" />
          </button>
        </div>
        <button class="po-add-line" @click="addLine">
          <UIcon name="i-lucide-plus" /> Agregar insumo
        </button>
      </div>

      <div class="po-field">
        <div class="lbl">Notas <span class="opt">opcional</span></div>
        <input v-model="draftNotes" class="po-input" type="text" placeholder="Ej: Entregar por la mañana">
      </div>

      <div class="po-total-row">
        <span>Total estimado</span>
        <b>{{ formatPEN(draftTotal) }}</b>
      </div>

      <template #cta>
        <div class="po-actions">
          <button class="btn btn-ghost" @click="showCreate = false">Cancelar</button>
          <button class="btn btn-primary" :disabled="!canCreate || creating" @click="submitCreate">
            <UIcon name="i-lucide-check" /> Crear borrador
          </button>
        </div>
      </template>
    </UiBottomSheet>

    <!-- ===== Sheet: detalle OC ===== -->
    <UiBottomSheet v-model="showDetail" :title="selected?.supplierName ?? 'Orden de compra'" :subtitle="selected ? STATUS_META[selected.status].label : ''">
      <template v-if="selected">
        <div class="po-detail-items">
          <div v-for="it in selected.items" :key="it.id" class="po-detail-item">
            <div class="po-di-main">
              <div class="po-di-name">{{ it.ingredientName }}</div>
              <div class="po-di-meta">
                {{ Number(it.qtyReceived) }} / {{ Number(it.qtyOrdered) }} recibido · {{ formatPEN(Number(it.unitCost)) }} c/u
              </div>
            </div>
            <div v-if="canReceive && !readonly && pending(it.id) > 0" class="po-di-receive">
              <input
                :value="receiveQty[it.id] ?? ''"
                class="po-input po-di-qty"
                type="number"
                inputmode="decimal"
                min="0"
                :max="pending(it.id)"
                step="0.1"
                placeholder="0"
                @input="receiveQty = { ...receiveQty, [it.id]: ($event.target as HTMLInputElement).value }"
              >
              <button class="po-di-fill" :aria-label="`Recibir todo (${pending(it.id)})`" @click="fillRemaining(it.id)">
                Todo
              </button>
            </div>
            <span v-else-if="Number(it.qtyReceived) >= Number(it.qtyOrdered)" class="po-di-done">
              <UIcon name="i-lucide-check" />
            </span>
            <span class="po-di-total">{{ formatPEN(Number(it.lineTotal)) }}</span>
          </div>
        </div>

        <div v-if="selected.notes" class="po-detail-notes">
          <UIcon name="i-lucide-sticky-note" /> {{ selected.notes }}
        </div>

        <div class="po-total-row">
          <span>Total</span>
          <b>{{ formatPEN(Number(selected.total)) }}</b>
        </div>
      </template>

      <template #cta>
        <div v-if="selected && !readonly" class="po-actions">
          <button v-if="canCancel" class="btn btn-ghost po-cancel-btn" :disabled="acting" @click="doCancel">
            <UIcon name="i-lucide-x-circle" /> Cancelar OC
          </button>
          <button v-if="canSend" class="btn btn-dark" :disabled="acting" @click="doSend">
            <UIcon name="i-lucide-send" /> Enviar al proveedor
          </button>
          <button v-if="canReceive" class="btn btn-primary" :disabled="!canSubmitReceive || acting" @click="doReceive">
            <UIcon name="i-lucide-package-check" /> Recepcionar
          </button>
        </div>
        <div v-else-if="selected" class="po-readonly-note">
          Solo lectura — pídele a un encargado registrar la recepción.
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.po-screen { max-width: 640px; margin: 0 auto; padding-bottom: 24px; }

.po-list { margin: 0 20px; display: flex; flex-direction: column; gap: 8px; }
.po-card {
  display: flex; align-items: center; gap: 12px;
  width: 100%; text-align: left; font: inherit;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard);
}
.po-card:hover { background: var(--crema-50); }
.po-card-main { flex: 1; min-width: 0; }
.po-card-supplier { font-size: 14px; font-weight: 600; color: var(--fg1); }
.po-card-meta { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.po-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
.po-card-total { font-size: 13px; font-weight: 600; color: var(--fg1); font-variant-numeric: tabular-nums; }

.po-badge {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.03em;
  padding: 3px 9px; border-radius: 999px;
}
.po-badge.draft { background: var(--crema-200); color: var(--fg2); }
.po-badge.sent { background: var(--info-bg); color: var(--info); }
.po-badge.partial { background: var(--warning-bg); color: var(--mostaza-700); }
.po-badge.received { background: var(--success-bg); color: var(--oliva-700); }
.po-badge.cancelled { background: var(--danger-bg); color: var(--danger); }

/* Form */
.po-field { padding: 8px 0; }
.po-field .lbl, .po-lines .lbl {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
}
.po-field .opt { text-transform: none; font-weight: 500; letter-spacing: 0; }
.po-input {
  width: 100%;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 11px 12px;
  font: inherit; font-size: 14px; color: var(--fg1);
  outline: none;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.po-input:focus { border-color: var(--terracotta); box-shadow: var(--focus-ring); }

.po-lines { padding: 8px 0; }
.po-line { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
.po-line-ing { flex: 2; min-width: 0; }
.po-line-qty { flex: 1; min-width: 0; }
.po-line-cost { flex: 1; min-width: 0; }
.po-line-rm {
  width: 34px; height: 38px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--danger-bg); color: var(--danger);
  border: none; border-radius: 9px; cursor: pointer;
}
.po-add-line {
  margin-top: 4px; width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: transparent; border: 1px dashed var(--border);
  color: var(--fg2); font: inherit; font-size: 13px; font-weight: 600;
  border-radius: 10px; padding: 10px; cursor: pointer;
}
.po-add-line:hover { background: var(--crema-100); }
.po-add-line .iconify { width: 14px; height: 14px; }

.po-total-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0 4px; font-size: 14px; color: var(--fg2);
}
.po-total-row b { font-size: 16px; color: var(--fg1); font-variant-numeric: tabular-nums; }

.po-actions { display: flex; gap: 8px; }
.po-actions .btn { flex: 1; justify-content: center; min-height: 44px; }
.po-cancel-btn { color: var(--danger); }

/* Detalle */
.po-detail-items { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.po-detail-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--crema-50); border-radius: 10px; padding: 10px 12px;
}
.po-di-main { flex: 1; min-width: 0; }
.po-di-name { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.po-di-meta { font-size: 11.5px; color: var(--fg3); margin-top: 2px; }
.po-di-receive { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.po-di-qty { width: 64px; padding: 7px 8px; font-size: 13px; text-align: center; }
.po-di-fill {
  font: inherit; font-size: 11px; font-weight: 600;
  background: var(--espresso); color: var(--crema-100);
  border: none; border-radius: 8px; padding: 7px 8px; cursor: pointer;
}
.po-di-done { color: var(--oliva-700); flex-shrink: 0; }
.po-di-total {
  font-size: 12.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums; flex-shrink: 0; min-width: 64px; text-align: right;
}
.po-detail-notes {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--fg2);
  background: var(--warning-bg); border-radius: 10px; padding: 10px 12px; margin-top: 8px;
}
.po-detail-notes .iconify { width: 14px; height: 14px; color: var(--mostaza-700); }
.po-readonly-note { font-size: 12.5px; color: var(--fg3); text-align: center; }
</style>
