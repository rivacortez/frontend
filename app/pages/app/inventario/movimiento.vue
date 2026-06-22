<script setup lang="ts">
import type { Ingredient } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Movimiento rápido — GastronomIA' })

const { data: ingredients } = useIngredients()
const createMovement = useCreateMovement()
const toast = useToast()

type Tipo = 'entrada' | 'salida'

interface Motivo {
  id: string
  name: string
  desc: string
  icon: string
}

const MOTIVOS_ENTRADA: Motivo[] = [
  { id: 'compra', name: 'Compra (sin factura)', desc: 'Sin documento adjunto', icon: 'i-lucide-shopping-bag' },
  { id: 'devolucion', name: 'Devolución', desc: 'Producto que regresa al stock', icon: 'i-lucide-undo-2' },
  { id: 'ajuste', name: 'Ajuste de inventario', desc: 'Corrección de conteo', icon: 'i-lucide-sliders-horizontal' },
  { id: 'regalo', name: 'Regalo / Donación', desc: 'Insumo recibido sin costo', icon: 'i-lucide-gift' },
  { id: 'otro', name: 'Otro', desc: '', icon: 'i-lucide-more-horizontal' },
]

const MOTIVOS_SALIDA: Motivo[] = [
  { id: 'consumo', name: 'Consumo (cocina)', desc: 'Se usó en preparación', icon: 'i-lucide-utensils' },
  { id: 'merma', name: 'Merma / Daño', desc: 'Producto en mal estado', icon: 'i-lucide-trash-2' },
  { id: 'vencimiento', name: 'Vencimiento', desc: 'Fecha de caducidad', icon: 'i-lucide-calendar-x' },
  { id: 'cortesia', name: 'Regalo / Cortesía', desc: 'A cliente o personal', icon: 'i-lucide-gift' },
  { id: 'ajuste', name: 'Ajuste de inventario', desc: 'Corrección de conteo', icon: 'i-lucide-sliders-horizontal' },
  { id: 'robo', name: 'Robo / Pérdida', desc: 'Stock no contabilizado', icon: 'i-lucide-alert-octagon' },
  { id: 'otro', name: 'Otro', desc: '', icon: 'i-lucide-more-horizontal' },
]

const PLACEHOLDERS: Record<Tipo, Record<string, string>> = {
  salida: {
    consumo: 'Ej: Servicio del mediodía',
    merma: 'Ej: Merma por mal estado',
    vencimiento: 'Ej: Vencimiento de lote',
    cortesia: 'Ej: Cliente devolvió plato',
    ajuste: 'Ej: Conteo físico no coincidía',
    robo: 'Ej: No se encontró stock al cierre',
    otro: 'Detalle del movimiento…',
  },
  entrada: {
    compra: 'Ej: Compra en mercado mayorista',
    devolucion: 'Ej: Devolución de pedido cancelado',
    ajuste: 'Ej: Conteo físico actualizado',
    regalo: 'Ej: Insumo donado por proveedor',
    otro: 'Detalle del movimiento…',
  },
}

const QTY_CHIPS = [0.5, 1, 2, 5, 10]

// motivo → MovementType del dominio
const TYPE_MAP: Record<string, 'purchase' | 'waste' | 'adjustment' | 'sale'> = {
  compra: 'purchase',
  devolucion: 'adjustment',
  ajuste: 'adjustment',
  regalo: 'purchase',
  consumo: 'sale',
  merma: 'waste',
  vencimiento: 'waste',
  cortesia: 'waste',
  robo: 'waste',
  otro: 'adjustment',
}

const tipo = ref<Tipo>('entrada')
const product = ref<Ingredient | null>(null)
const search = ref('')
const qty = ref<number | null>(null)
const motivo = ref('')
const note = ref('')
const busy = ref(false)

const motivos = computed(() => tipo.value === 'entrada' ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA)

watch(tipo, () => {
  motivo.value = ''
})

const results = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = ingredients.value ?? []
  return (q ? list.filter(p => p.name.toLowerCase().includes(q)) : list).slice(0, 5)
})

const newStock = computed(() => {
  if (!product.value || !qty.value) return null
  const delta = tipo.value === 'entrada' ? qty.value : -qty.value
  return +(product.value.stock + delta).toFixed(2)
})

const placeholder = computed(() => PLACEHOLDERS[tipo.value][motivo.value] ?? 'Detalle del movimiento…')

const canSave = computed(() =>
  product.value !== null && (qty.value ?? 0) > 0 && motivo.value !== ''
  && (tipo.value === 'entrada' || (newStock.value ?? 0) >= 0),
)

async function save(): Promise<void> {
  if (!canSave.value || !product.value || !qty.value || busy.value) return
  busy.value = true
  try {
    const motivoName = motivos.value.find(m => m.id === motivo.value)?.name ?? motivo.value
    const type = TYPE_MAP[motivo.value] ?? 'adjustment'
    const detail = note.value.trim() ? `${motivoName}: ${note.value.trim()}` : motivoName
    await createMovement.mutateAsync({
      ingredientId: product.value.id,
      type,
      qty: tipo.value === 'entrada' ? qty.value : -qty.value,
      note: detail,
      // La merma exige razón (HU-05-08): usamos el motivo (+ nota) elegido.
      reason: type === 'waste' ? detail : undefined,
    })
    toast.add({
      title: `${tipo.value === 'entrada' ? 'Entrada' : 'Salida'} registrada`,
      description: `${product.value.name} · nuevo stock ${newStock.value} ${product.value.unit}`,
      icon: 'i-lucide-check-circle-2',
    })
    await navigateTo('/app/inventario')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mr-screen">
    <UiScreenHeader title="Movimiento Rápido" subtitle="Registra entradas y salidas de stock" back="/app/inventario" />

    <!-- Tipo -->
    <section class="mr-section" aria-label="Tipo de movimiento">
      <div class="mr-tipo" role="radiogroup">
        <button
          role="radio"
          :aria-checked="tipo === 'entrada'"
          class="mr-tipo-card entrada"
          :class="{ active: tipo === 'entrada' }"
          @click="tipo = 'entrada'"
        >
          <span class="check" aria-hidden="true"><UIcon name="i-lucide-check" /></span>
          <span class="icon" aria-hidden="true"><UIcon name="i-lucide-arrow-down-to-line" /></span>
          <span class="title">📥 Entrada</span>
          <span class="desc">Agregar stock</span>
        </button>
        <button
          role="radio"
          :aria-checked="tipo === 'salida'"
          class="mr-tipo-card salida"
          :class="{ active: tipo === 'salida' }"
          @click="tipo = 'salida'"
        >
          <span class="check" aria-hidden="true"><UIcon name="i-lucide-check" /></span>
          <span class="icon" aria-hidden="true"><UIcon name="i-lucide-arrow-up-from-line" /></span>
          <span class="title">📤 Salida</span>
          <span class="desc">Reducir stock</span>
        </button>
      </div>
    </section>

    <!-- Insumo -->
    <section class="mr-section" aria-label="Insumo">
      <div class="mr-label">Insumo <span class="req" aria-hidden="true">*</span></div>
      <div v-if="product" class="mr-prod-card">
        <div class="mr-prod-ico" aria-hidden="true"><UIcon name="i-lucide-package" /></div>
        <div class="mr-prod-body">
          <div class="mr-prod-name">{{ product.name }}</div>
          <div class="mr-prod-stock">Stock: {{ product.stock }} {{ product.unit }} · mín. {{ product.minStock }} {{ product.unit }}</div>
        </div>
        <button class="mr-prod-change" @click="product = null; search = ''">Cambiar</button>
      </div>
      <template v-else>
        <label class="mr-search">
          <UIcon name="i-lucide-search" />
          <input v-model="search" type="search" placeholder="Buscar insumo…" aria-required="true">
        </label>
        <div v-if="search.length > 0 || results.length" class="mr-search-results" role="listbox">
          <button
            v-for="p in results"
            :key="p.id"
            class="mr-search-opt"
            role="option"
            @click="product = p"
          >
            <span class="name">{{ p.name }}</span>
            <span class="stk">{{ p.stock }} {{ p.unit }}</span>
          </button>
          <div v-if="results.length === 0" class="mr-no-results">Sin resultados</div>
        </div>
      </template>
    </section>

    <!-- Cantidad -->
    <section v-if="product" class="mr-section" aria-label="Cantidad">
      <div class="mr-label">Cantidad <span class="req" aria-hidden="true">*</span></div>
      <div class="mr-qty-row">
        <input
          v-model.number="qty"
          class="mr-qty-input"
          type="number"
          inputmode="decimal"
          placeholder="0"
          min="0"
          step="0.1"
        >
        <span class="mr-qty-unit">{{ product.unit }}</span>
      </div>
      <div class="mr-qty-chips" role="group" aria-label="Cantidades rápidas">
        <button
          v-for="c in QTY_CHIPS"
          :key="c"
          class="mr-qty-chip"
          :class="{ on: qty === c }"
          @click="qty = c"
        >{{ c }}</button>
      </div>
      <p v-if="newStock !== null" class="mr-new-stock" :class="{ neg: newStock < 0 }">
        <UIcon :name="newStock < 0 ? 'i-lucide-alert-triangle' : 'i-lucide-info'" />
        {{ newStock < 0 ? 'La salida excede el stock disponible.' : `Nuevo stock: ${newStock} ${product.unit}` }}
      </p>
    </section>

    <!-- Motivo -->
    <section v-if="product" class="mr-section" aria-label="Motivo">
      <div class="mr-label">Motivo <span class="req" aria-hidden="true">*</span></div>
      <div class="mr-motivos" role="radiogroup">
        <button
          v-for="m in motivos"
          :key="m.id"
          role="radio"
          :aria-checked="motivo === m.id"
          class="mr-motivo"
          :class="{ on: motivo === m.id }"
          @click="motivo = m.id"
        >
          <span class="mico" aria-hidden="true"><UIcon :name="m.icon" /></span>
          <span class="mbody">
            <span class="mname">{{ m.name }}</span>
            <span v-if="m.desc" class="mdesc">{{ m.desc }}</span>
          </span>
          <UIcon v-if="motivo === m.id" name="i-lucide-check-circle-2" class="mcheck" />
        </button>
      </div>
    </section>

    <!-- Nota -->
    <section v-if="product && motivo" class="mr-section" aria-label="Nota">
      <div class="mr-label">Nota <span class="hint">opcional</span></div>
      <input v-model="note" class="field-input" type="text" :placeholder="placeholder" maxlength="120" aria-label="Nota del movimiento">
    </section>

    <div class="mr-cta">
      <button class="btn btn-primary btn-lg btn-block" :disabled="!canSave || busy" @click="save">
        <UIcon name="i-lucide-check" /> Registrar {{ tipo }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mr-screen {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.mr-section { padding: 0 20px; margin-bottom: 18px; }
.mr-label {
  font-size: 13px; font-weight: 600; color: var(--fg2);
  margin-bottom: 10px;
  display: flex; align-items: center; gap: 6px;
}
.mr-label .req { color: var(--terracotta); }
.mr-label .hint { font-size: 11px; font-weight: 500; color: var(--fg3); }

.mr-tipo { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mr-tipo-card {
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: var(--pure-white);
  border: 1.5px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.mr-tipo-card .check {
  position: absolute; top: 10px; right: 10px;
  width: 20px; height: 20px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--crema-200); color: transparent;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.mr-tipo-card .check .iconify { width: 12px; height: 12px; }
.mr-tipo-card .icon {
  width: 34px; height: 34px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.mr-tipo-card .icon .iconify { width: 17px; height: 17px; }
.mr-tipo-card.entrada .icon { background: var(--success-bg); color: var(--oliva-700); }
.mr-tipo-card.salida .icon { background: var(--danger-bg); color: var(--danger); }
.mr-tipo-card .title { font-size: 14px; font-weight: 600; color: var(--fg1); }
.mr-tipo-card .desc { font-size: 11.5px; color: var(--fg3); }
.mr-tipo-card.entrada.active { border-color: var(--oliva); background: linear-gradient(160deg, var(--pure-white), #F3F6EF); }
.mr-tipo-card.entrada.active .check { background: var(--oliva); color: var(--crema-100); }
.mr-tipo-card.salida.active { border-color: var(--danger); background: linear-gradient(160deg, var(--pure-white), #FBF0ED); }
.mr-tipo-card.salida.active .check { background: var(--danger); color: var(--crema-100); }

.mr-prod-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
}
.mr-prod-ico {
  width: 40px; height: 40px; border-radius: 12px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mr-prod-ico .iconify { width: 18px; height: 18px; }
.mr-prod-body { flex: 1; min-width: 0; }
.mr-prod-name { font-size: 14px; font-weight: 600; color: var(--fg1); }
.mr-prod-stock { font-size: 12px; color: var(--fg3); margin-top: 2px; }
.mr-prod-change {
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 7px 12px;
  border-radius: 10px;
  cursor: pointer;
}
.mr-prod-change:hover { background: var(--crema-200); }

.mr-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 44px;
}
.mr-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.mr-search input {
  flex: 1; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.mr-search .iconify { width: 16px; height: 16px; color: var(--fg3); }
.mr-search-results {
  margin-top: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}
.mr-search-opt {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  background: transparent; border: none;
  border-bottom: 1px solid var(--border-subtle);
  padding: 12px 14px;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.mr-search-opt:last-child { border-bottom: none; }
.mr-search-opt:hover { background: var(--crema-100); }
.mr-search-opt .name { flex: 1; font-size: 14px; font-weight: 500; color: var(--fg1); }
.mr-search-opt .stk { font-size: 12px; color: var(--fg3); font-variant-numeric: tabular-nums; }
.mr-no-results { padding: 14px; color: var(--fg3); font-size: 13px; text-align: center; }

.mr-qty-row {
  display: flex; align-items: center; gap: 10px;
}
.mr-qty-input {
  flex: 1;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 16px;
  font: inherit; font-size: 30px; font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--fg1);
  font-variant-numeric: tabular-nums;
  outline: none;
  text-align: center;
  min-width: 0;
}
.mr-qty-input:focus { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.mr-qty-unit {
  font-size: 15px; font-weight: 600; color: var(--fg2);
  background: var(--crema-200);
  padding: 14px 16px;
  border-radius: 12px;
}
.mr-qty-chips { display: flex; gap: 6px; margin-top: 10px; }
.mr-qty-chip {
  flex: 1;
  font: inherit; font-size: 13px; font-weight: 600;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 8px 0;
  border-radius: 10px;
  cursor: pointer;
}
.mr-qty-chip.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.mr-new-stock {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: var(--fg2);
  margin: 10px 0 0;
}
.mr-new-stock.neg { color: var(--danger); }
.mr-new-stock .iconify { width: 13px; height: 13px; }

.mr-motivos {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.mr-motivo {
  display: flex; align-items: center; gap: 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  padding: 12px 14px;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.mr-motivo:last-child { border-bottom: none; }
.mr-motivo:hover { background: var(--crema-50); }
.mr-motivo.on { background: var(--terracotta-100); }
.mr-motivo .mico {
  width: 34px; height: 34px; border-radius: 10px;
  background: var(--crema-200); color: var(--fg2);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mr-motivo.on .mico { background: var(--terracotta); color: var(--crema-100); }
.mr-motivo .mico .iconify { width: 16px; height: 16px; }
.mr-motivo .mbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mr-motivo .mname { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.mr-motivo .mdesc { font-size: 11.5px; color: var(--fg3); }
.mr-motivo .mcheck { width: 18px; height: 18px; color: var(--terracotta-700); flex-shrink: 0; }

.mr-cta { padding: 0 20px; margin-top: 8px; }
</style>
