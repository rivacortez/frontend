<script setup lang="ts">
import type { DiningTable, Order, OrderItem } from '#shared/types/domain'

definePageMeta({ layout: 'app' })

const route = useRoute()
const tableId = computed(() => String(route.params.id))

const { data, refresh } = useTable(tableId)
const addItems = useAddOrderItems()
const sendKitchen = useSendToKitchen()
const patchOrder = usePatchOrder()
const toast = useToast()
const { user } = useUserSession()

const table = computed(() => data.value?.table ?? null)
const order = computed(() => data.value?.order ?? null)
const isOwner = computed(() => user.value?.role === 'owner')

useSeoMeta({ title: () => `Mesa ${table.value ? String(table.value.number).padStart(2, '0') : ''} — GastronomIA` })

// ===== Carrito local: "Por enviar" =====
interface CartLine {
  recipeId: string
  name: string
  qty: number
  unitPrice: number
}
const cart = ref<CartLine[]>([])

const catalogOpen = ref(false)
const actionsOpen = ref(false)
const discountOpen = ref(false)
const chargeOpen = ref(false)
const exitConfirm = ref(false)
const itemSheet = ref<OrderItem | null>(null)
const adjustItem = ref<OrderItem | null>(null)
const justSent = ref(false)

const { data: recipes } = useRecipes()

const cartTotal = computed(() => cart.value.reduce((s, l) => s + l.qty * l.unitPrice, 0))
const liveTotals = computed(() => orderTotals(order.value))
const total = computed(() => cartTotal.value + liveTotals.value.total)
const itemCount = computed(() =>
  cart.value.reduce((s, l) => s + l.qty, 0)
  + (order.value?.items.reduce((s, it) => s + it.qty, 0) ?? 0),
)
const hasPending = computed(() => cart.value.length > 0)

const PILL: Record<OrderItem['status'], { label: string, cls: string }> = {
  pending: { label: 'Preparando', cls: 'preparing' },
  preparing: { label: 'En cocina', cls: 'cooking' },
  served: { label: 'Servido', cls: 'served' },
}

const pad = (n: number | undefined): string => String(n ?? '').padStart(2, '0')

// ===== Catálogo → carrito =====
function onCatalogConfirm(items: Array<{ recipeId: string, qty: number }>): void {
  for (const line of items) {
    const recipe = (recipes.value ?? []).find(r => r.id === line.recipeId)
    if (!recipe) continue
    const existing = cart.value.find(l => l.recipeId === line.recipeId)
    if (existing) {
      existing.qty += line.qty
    }
    else {
      cart.value.push({ recipeId: recipe.id, name: recipe.name, qty: line.qty, unitPrice: recipe.sellPrice })
    }
  }
}

function cartDec(line: CartLine): void {
  if (line.qty <= 1) {
    cart.value = cart.value.filter(l => l !== line)
  }
  else {
    line.qty -= 1
  }
}

// ===== Enviar a cocina (HU-03-06) =====
async function sendToKitchen(): Promise<void> {
  if (!hasPending.value || !order.value) return
  const count = cart.value.length
  // 1) Persistir los ítems del carrito en la orden (quedan `pending`).
  await addItems.mutateAsync({
    orderId: order.value.id,
    items: cart.value.map(l => ({ recipeId: l.recipeId, qty: l.qty })),
  })
  // 2) Enviar la comanda a cocina: el backend rutea los pending a sus estaciones.
  await sendKitchen.mutateAsync({ orderId: order.value.id })
  cart.value = []
  justSent.value = true
  setTimeout(() => { justSent.value = false }, 700)
  await refresh()
  toast.add({ title: `${count === 1 ? '1 item enviado' : `${count} items enviados`} a cocina`, icon: 'i-lucide-send' })
}

// ===== Back con confirmación =====
function handleBack(): void {
  if (hasPending.value) {
    exitConfirm.value = true
  }
  else {
    void navigateTo('/app/pos')
  }
}
async function confirmSendAndExit(): Promise<void> {
  exitConfirm.value = false
  await sendToKitchen()
  await navigateTo('/app/pos')
}
function confirmDiscard(): void {
  cart.value = []
  exitConfirm.value = false
  void navigateTo('/app/pos')
}

// ===== Opciones de item en curso =====
async function markServed(): Promise<void> {
  if (!itemSheet.value || !order.value) return
  await patchOrder.mutateAsync({
    orderId: order.value.id,
    itemUpdates: [{ id: itemSheet.value.id, status: 'served' }],
  })
  toast.add({ title: `${itemSheet.value.name} marcado como servido`, icon: 'i-lucide-check-circle-2' })
  itemSheet.value = null
  await refresh()
}
function openAdjust(): void {
  adjustItem.value = itemSheet.value
  itemSheet.value = null
}
async function removeLive(): Promise<void> {
  if (!itemSheet.value || !order.value) return
  await patchOrder.mutateAsync({
    orderId: order.value.id,
    itemUpdates: [{ id: itemSheet.value.id, remove: true }],
  })
  toast.add({ title: `${itemSheet.value.name} eliminado`, icon: 'i-lucide-trash-2' })
  itemSheet.value = null
  await refresh()
}

// Snapshot de la orden+mesa al abrir el cobro: el sheet de éxito debe sobrevivir a
// que la mesa quede libre (refetch) tras el pago. Si dependiera de `order` (que pasa
// a null al liberarse), se desmontaría antes de que el usuario vea el comprobante.
const chargeCtx = ref<{ order: Order, table: DiningTable } | null>(null)
function openCharge(): void {
  if (!order.value || !table.value) return
  chargeCtx.value = { order: order.value, table: table.value }
  chargeOpen.value = true
}
watch(chargeOpen, (isOpen) => {
  if (!isOpen) chargeCtx.value = null
})

function onPaid(serie: string, number: number): void {
  toast.add({
    title: `Cobro registrado · ${serie}-${number}`,
    description: 'La mesa quedó libre.',
    icon: 'i-lucide-badge-check',
  })
  void navigateTo('/app/pos')
}
</script>

<template>
  <div class="md-screen">
    <template v-if="table">
      <!-- Header -->
      <header class="md-hdr">
        <button class="icon-btn" aria-label="Volver a mesas" @click="handleBack">
          <UIcon name="i-lucide-arrow-left" />
        </button>
        <div class="md-title-wrap">
          <h1 class="md-title">Mesa {{ pad(table.number) }}</h1>
          <div class="md-sub">{{ table.zone }} · {{ table.guests ?? '—' }} personas</div>
        </div>
        <div v-if="table.openedAt" class="md-time-badge" aria-label="Tiempo abierta">
          <UIcon name="i-lucide-clock" /> {{ elapsed(table.openedAt) }}
        </div>
      </header>

      <!-- Resumen sticky -->
      <section class="md-resumen">
        <div class="md-resumen-left">
          <div class="md-resumen-line">Resumen</div>
          <div class="md-resumen-total">
            <span class="count">{{ itemCount }} items</span>
            <span>·</span>
            <span>{{ formatPEN(total) }}</span>
            <span class="igv">IGV incl.</span>
          </div>
          <div v-if="order?.discount" class="md-discount-tag">
            <UIcon name="i-lucide-badge-percent" />
            Descuento {{ order.discount.type === 'pct' ? `${order.discount.value} %` : formatPEN(order.discount.value) }}
            (−{{ formatPEN(liveTotals.discount) }})
          </div>
        </div>
        <button class="md-more-btn" aria-label="Más opciones de mesa" @click="actionsOpen = true">
          <UIcon name="i-lucide-more-horizontal" />
        </button>
      </section>

      <!-- Por enviar -->
      <section v-if="hasPending" class="md-section pending">
        <div class="md-section-head">
          <span class="lab"><UIcon name="i-lucide-send" /> Por enviar</span>
          <span class="count">{{ cart.length }}</span>
        </div>
        <div class="md-items">
          <div v-for="line in cart" :key="line.recipeId" class="md-item pending">
            <div class="md-item-main">
              <div class="md-item-name">
                {{ line.name }}
                <span class="qty-pill">×{{ line.qty }}</span>
              </div>
              <div class="md-item-price">{{ formatPEN(line.qty * line.unitPrice) }}</div>
            </div>
            <div class="md-item-controls">
              <div class="qty-step" role="group" :aria-label="`Cantidad de ${line.name}`">
                <button aria-label="Disminuir" @click="cartDec(line)"><UIcon name="i-lucide-minus" /></button>
                <span class="val">{{ line.qty }}</span>
                <button aria-label="Aumentar" @click="line.qty += 1"><UIcon name="i-lucide-plus" /></button>
              </div>
              <button class="md-item-trash" :aria-label="`Eliminar ${line.name}`" @click="cart = cart.filter(l => l !== line)">
                <UIcon name="i-lucide-x" />
              </button>
            </div>
          </div>
        </div>
        <div class="md-section-foot">
          <UIcon name="i-lucide-info" /> Estos items aún no están en cocina
        </div>
      </section>

      <!-- En curso -->
      <section class="md-section live">
        <div class="md-section-head">
          <span class="lab"><UIcon name="i-lucide-utensils" /> En curso</span>
          <span class="count">{{ order?.items.length ?? 0 }}</span>
        </div>
        <div v-if="order && order.items.length" class="md-items">
          <button
            v-for="item in order.items"
            :key="item.id"
            class="md-item"
            :class="{ 'just-sent': justSent }"
            @click="itemSheet = item"
          >
            <div class="md-item-main">
              <div class="md-item-name">
                {{ item.name }}
                <span v-if="item.qty > 1" class="qty-pill">×{{ item.qty }}</span>
              </div>
            </div>
            <span class="md-pill" :class="PILL[item.status].cls">
              <span class="dot" />
              {{ PILL[item.status].label }}
            </span>
            <div class="md-item-meta">
              <UIcon name="i-lucide-clock-3" /> {{ order.openedAt ? elapsed(order.openedAt) : '' }}
              <span class="price">{{ formatPEN(item.qty * item.unitPrice) }}</span>
            </div>
          </button>
        </div>
        <UiEmptyState
          v-else
          icon="i-lucide-utensils"
          title="Sin items en la comanda"
          subtitle="Agrega platos desde el catálogo para empezar."
        />
      </section>

      <!-- IA banner -->
      <section class="md-ai" aria-label="Sugerencia IA">
        <div class="md-ai-ico"><UIcon name="i-lucide-bot" /></div>
        <div class="md-ai-body">
          <div class="md-ai-eyebrow">IA sugiere</div>
          <div class="md-ai-text">
            Ofrece <b>Maracuyá Sour</b> de bajada. <b>67 %</b> de mesas similares lo piden a esta hora.
          </div>
          <div class="md-ai-actions">
            <button class="btn btn-ghost" @click="onCatalogConfirm([{ recipeId: 'rec-maracuya-sour', qty: 1 }])">
              <UIcon name="i-lucide-plus" /> Agregar al pedido
            </button>
          </div>
        </div>
      </section>

      <div style="height: 90px" />

      <!-- Acciones sticky -->
      <div class="md-actions">
        <button class="btn btn-add" @click="catalogOpen = true">
          <UIcon name="i-lucide-plus" /> Agregar item
        </button>
        <button v-if="hasPending" class="btn btn-send" @click="sendToKitchen">
          <UIcon name="i-lucide-send" /> Enviar {{ cart.length }} a cocina
        </button>
        <button v-else class="btn btn-charge" :disabled="!order || order.items.length === 0" @click="openCharge">
          <UIcon name="i-lucide-credit-card" /> Cobrar {{ formatPEN(total) }}
        </button>
      </div>

      <!-- Sheets -->
      <PosCatalogSheet v-if="table" v-model="catalogOpen" :table="table" @confirm="onCatalogConfirm" />
      <PosMesaActionsSheet v-if="table" v-model="actionsOpen" :table="table" :order="order" @discount="discountOpen = true" />
      <PosDiscountSheet v-if="order" v-model="discountOpen" :order="order" @applied="refresh()" />
      <PosCobrarSheet v-if="chargeCtx" v-model="chargeOpen" :order="chargeCtx.order" :table="chargeCtx.table" @paid="onPaid" />
      <PosAdjustPriceSheet v-if="order" v-model="adjustItem" :order="order" @adjusted="refresh()" />

      <!-- Mini sheet: opciones de item -->
      <Teleport to="body">
        <template v-if="itemSheet">
          <div class="mini-sheet-overlay" @click="itemSheet = null" />
          <div class="mini-sheet" role="menu">
            <div class="mini-sheet-title">{{ itemSheet.name }}</div>
            <button v-if="itemSheet.status !== 'served'" @click="markServed">
              <UIcon name="i-lucide-check-circle-2" /> Marcar como servido
            </button>
            <button @click="openAdjust">
              <UIcon name="i-lucide-edit-3" /> Ajustar precio
              <span class="role-badge">Dueño</span>
            </button>
            <hr>
            <button class="danger" :disabled="!isOwner" @click="removeLive">
              <UIcon name="i-lucide-trash-2" /> Eliminar
              <span class="role-badge">Dueño</span>
            </button>
          </div>
        </template>
      </Teleport>

      <!-- Modal: salir con pendientes -->
      <Teleport to="body">
        <div v-if="exitConfirm" class="modal-overlay" @click="exitConfirm = false">
          <div class="modal" role="alertdialog" @click.stop>
            <div class="modal-ico"><UIcon name="i-lucide-alert-triangle" /></div>
            <h3 class="modal-title">Tienes {{ cart.length }} item{{ cart.length > 1 ? 's' : '' }} sin enviar a cocina</h3>
            <p class="modal-text">Si sales ahora, los items se descartan.</p>
            <div class="modal-actions">
              <button class="btn btn-primary" @click="confirmSendAndExit">
                <UIcon name="i-lucide-send" /> Enviar y salir
              </button>
              <button class="btn btn-discard" @click="confirmDiscard">
                Descartar items
              </button>
              <button class="btn btn-cancel" @click="exitConfirm = false">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <UiEmptyState
      v-else
      icon="i-lucide-armchair"
      title="Mesa no encontrada"
      subtitle="Es posible que la mesa haya sido liberada."
    >
      <UButton to="/app/pos" variant="outline" color="neutral" icon="i-lucide-arrow-left">
        Volver a mesas
      </UButton>
    </UiEmptyState>
  </div>
</template>

<style scoped>
.md-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  padding-bottom: 16px;
}
@media (min-width: 1024px) {
  .md-screen { padding-top: 24px; }
}

.md-hdr {
  padding: 4px 16px 14px;
  display: grid; grid-template-columns: 40px 1fr auto; align-items: center;
  gap: 12px;
}
/* .md-back → .icon-btn global (components.css) */
.md-title-wrap { text-align: center; min-width: 0; }
.md-title {
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.1;
  color: var(--fg1);
  margin: 0;
}
.md-sub { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.md-time-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-mono);
  font-size: 12px; font-weight: 500;
  background: var(--info-bg); color: var(--info);
  padding: 6px 10px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.md-time-badge .iconify { width: 13px; height: 13px; }

.md-resumen {
  position: sticky; top: 0;
  z-index: 4;
  margin: 0 16px 14px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  box-shadow: var(--shadow-sm);
}
.md-resumen-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.md-resumen-line {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3);
}
.md-resumen-total {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 17px; font-weight: 600; color: var(--fg1);
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.md-resumen-total .count { font-size: 13px; font-weight: 500; color: var(--fg3); }
.md-resumen-total .igv {
  font-size: 10px; font-weight: 500; color: var(--fg3);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.md-discount-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 600; color: var(--oliva-700);
  margin-top: 2px;
}
.md-discount-tag .iconify { width: 12px; height: 12px; }
.md-more-btn {
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent; color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.md-more-btn:hover { background: var(--crema-100); color: var(--fg1); }
.md-more-btn .iconify { width: 18px; height: 18px; }

.md-section { padding: 0 16px; margin-bottom: 16px; }
.md-section-head {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 4px 10px;
}
.md-section-head .lab {
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  display: inline-flex; align-items: center; gap: 6px;
}
.md-section-head .lab .iconify { width: 13px; height: 13px; }
.md-section-head .count {
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 999px;
}
.md-section.pending .lab { color: var(--info); }
.md-section.pending .count { background: var(--info-bg); color: var(--info); }
.md-section.live .lab { color: var(--fg2); }
.md-section.live .count { background: var(--crema-200); color: var(--fg2); }
.md-section-foot {
  font-size: 11.5px; color: var(--fg3);
  padding: 6px 4px 0;
  display: inline-flex; align-items: center; gap: 5px;
}
.md-section-foot .iconify { width: 11px; height: 11px; }

.md-items {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.md-section.pending .md-items {
  background: #F5FAFC;
  border-color: rgba(74, 107, 123, 0.18);
}
.md-item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "main controls"
    "meta meta";
  gap: 6px 10px;
  padding: 12px 14px;
  min-height: 60px;
  border-bottom: 1px solid var(--border-subtle);
  position: relative;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard);
  font: inherit;
  text-align: left;
  background: transparent;
  border-left: none; border-right: none; border-top: none;
}
.md-item:last-child { border-bottom: none; }
.md-item:hover { background: var(--crema-50); }
.md-section.pending .md-item:hover { background: rgba(74, 107, 123, 0.06); }
.md-item-main {
  grid-area: main;
  display: flex; flex-direction: column; gap: 3px;
  min-width: 0;
}
.md-item-name {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  line-height: 1.25;
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap;
}
.md-item-name .qty-pill {
  font-family: var(--font-mono);
  font-size: 11px; font-weight: 600;
  background: var(--crema-200); color: var(--fg2);
  padding: 1px 7px; border-radius: 999px;
}
.md-item-price {
  font-family: var(--font-mono);
  font-size: 13px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}
.md-item-controls {
  grid-area: controls;
  display: flex; align-items: center; gap: 8px;
  align-self: center;
}
.qty-step {
  display: inline-flex; align-items: center;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  height: 32px;
}
.qty-step button::after { content: ''; position: absolute; inset: -5px; }
.qty-step button {
  position: relative;
  width: 30px; height: 30px;
  background: transparent; border: none;
  color: var(--fg2);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur) var(--ease-standard);
}
.qty-step button:hover { background: var(--crema-200); color: var(--fg1); }
.qty-step button .iconify { width: 13px; height: 13px; }
.qty-step .val {
  font-family: var(--font-mono);
  font-size: 13px; font-weight: 600;
  color: var(--fg1);
  min-width: 22px;
  text-align: center;
}
.md-item-trash::after { content: ''; position: absolute; inset: -5px; }
.md-item-trash {
  position: relative;
  width: 30px; height: 30px; border-radius: 50%;
  background: transparent; border: 1px solid var(--border);
  color: var(--fg3);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.md-item-trash:hover { background: var(--danger-bg); border-color: var(--danger); color: var(--danger); }
.md-item-trash .iconify { width: 13px; height: 13px; }

.md-pill {
  grid-area: controls;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
  padding: 4px 9px;
  border-radius: 999px;
  white-space: nowrap;
  align-self: center;
}
.md-pill .dot { width: 6px; height: 6px; border-radius: 50%; }
.md-pill.served { background: var(--success-bg); color: var(--oliva-700); }
.md-pill.served .dot { background: var(--oliva); }
.md-pill.cooking { background: var(--warning-bg); color: var(--mostaza-700); }
.md-pill.cooking .dot { background: var(--mostaza); }
.md-pill.preparing { background: var(--info-bg); color: var(--info); }
.md-pill.preparing .dot { background: var(--info); animation: dotPulse 1.6s ease-in-out infinite; }
@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.md-item-meta {
  grid-area: meta;
  display: flex; align-items: center; gap: 10px;
  font-size: 11px; color: var(--fg3);
}
.md-item-meta .iconify { width: 11px; height: 11px; }
.md-item-meta .price {
  font-family: var(--font-mono); font-weight: 500; color: var(--fg2);
  margin-left: auto;
}
@keyframes itemFadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.md-item.just-sent { animation: itemFadeUp 320ms var(--ease-emphasis); }

.md-ai {
  margin: 0 16px 16px;
  padding: 14px;
  background: linear-gradient(140deg, #EAF1F4 0%, #F2EDE4 100%);
  border: 1px dashed rgba(74, 107, 123, 0.35);
  border-radius: 14px;
  display: flex; gap: 12px;
  align-items: flex-start;
}
.md-ai-ico {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--info); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.md-ai-ico .iconify { width: 16px; height: 16px; }
.md-ai-body { flex: 1; min-width: 0; }
.md-ai-eyebrow {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--info);
  margin-bottom: 3px;
}
.md-ai-text { font-size: 13px; line-height: 1.45; color: var(--fg2); }
.md-ai-text b { color: var(--fg1); font-weight: 600; }
.md-ai-actions { margin-top: 8px; }
.md-ai .btn { font-size: 12px; min-height: 32px; padding: 6px 12px; }

.md-actions {
  position: fixed; left: 0; right: 0;
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  max-width: 640px;
  margin: 0 auto;
  padding: 12px 16px;
  background: linear-gradient(180deg, rgba(243, 237, 228, 0) 0%, rgba(243, 237, 228, 0.95) 30%, var(--crema) 100%);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  z-index: 5;
}
@media (min-width: 1024px) {
  .md-actions { bottom: 0; left: 256px; }
}
.md-actions .btn {
  min-height: 48px; font-size: 14px; border-radius: 12px;
  justify-content: center;
}
.md-actions .btn-add {
  padding: 0 14px;
  background: var(--pure-white);
  border-color: var(--border);
  color: var(--fg1);
  font-weight: 600;
}
.md-actions .btn-add:hover { background: var(--crema-100); }
.md-actions .btn-send {
  background: var(--info);
  color: var(--crema-100);
  font-weight: 700;
  position: relative;
  overflow: hidden;
}
.md-actions .btn-send:hover { background: #3D5A6B; }
.md-actions .btn-send::after {
  content: ''; position: absolute; inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 0 0 rgba(74, 107, 123, 0.5);
  animation: sendPulse 1.8s ease-out infinite;
  pointer-events: none;
}
@keyframes sendPulse {
  0% { box-shadow: 0 0 0 0 rgba(74, 107, 123, 0.45); }
  70% { box-shadow: 0 0 0 10px rgba(74, 107, 123, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 107, 123, 0); }
}
.md-actions .btn-charge {
  background: var(--terracotta);
  color: var(--crema-100);
  font-weight: 700;
}
.md-actions .btn-charge:hover { background: var(--terracotta-700); }
.md-actions .btn .iconify { width: 16px; height: 16px; }
</style>

<style>
/* Mini sheet y modal van teleportados a body (sin scope) */
.mini-sheet-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.45);
  z-index: 52;
  animation: msFade 200ms ease;
}
@keyframes msFade { from { opacity: 0; } to { opacity: 1; } }
.mini-sheet {
  position: fixed; left: 12px; right: 12px;
  bottom: calc(78px + env(safe-area-inset-bottom, 0px));
  max-width: 480px;
  margin: 0 auto;
  background: var(--pure-white);
  border-radius: 16px;
  padding: 8px;
  z-index: 53;
  box-shadow: var(--shadow-lg);
  animation: msUp 240ms var(--ease-emphasis);
}
@media (min-width: 1024px) {
  .mini-sheet { bottom: 32px; }
}
@keyframes msUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.mini-sheet-title {
  font-size: 12px; font-weight: 600;
  color: var(--fg3);
  padding: 8px 12px 6px;
  letter-spacing: 0.04em;
}
.mini-sheet button {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  background: transparent; border: none;
  padding: 12px;
  border-radius: 10px;
  font: inherit; font-size: 14px; font-weight: 500;
  color: var(--fg1);
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.mini-sheet button:hover { background: var(--crema-100); }
.mini-sheet button:disabled { opacity: 0.45; cursor: not-allowed; }
.mini-sheet button .iconify { width: 18px; height: 18px; color: var(--fg2); }
.mini-sheet button.danger { color: var(--danger); }
.mini-sheet button.danger .iconify { color: var(--danger); }
.mini-sheet button .role-badge {
  margin-left: auto;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  background: var(--mostaza-100); color: var(--mostaza-700);
  padding: 2px 6px; border-radius: 4px;
}
.mini-sheet hr {
  border: none; border-top: 1px solid var(--border-subtle);
  margin: 4px 8px;
}

.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.55);
  z-index: 54;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: msFade 200ms ease;
}
.modal {
  background: var(--pure-white);
  border-radius: 16px;
  padding: 22px 20px 18px;
  width: 100%;
  max-width: 320px;
  animation: modalIn 280ms var(--ease-emphasis);
}
@keyframes modalIn {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.modal-ico {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--warning-bg); color: var(--mostaza-700);
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
.modal-actions { display: flex; flex-direction: column; gap: 8px; }
.modal-actions .btn {
  width: 100%; justify-content: center;
  min-height: 44px; font-size: 14px; border-radius: 10px;
}
.modal-actions .btn-cancel { background: transparent; color: var(--fg2); border: none; }
.modal-actions .btn-cancel:hover { background: var(--crema-100); color: var(--fg1); }
.modal-actions .btn-discard {
  background: transparent; color: var(--danger);
  border: 1px solid var(--danger-bg);
}
.modal-actions .btn-discard:hover { background: var(--danger-bg); }
</style>
