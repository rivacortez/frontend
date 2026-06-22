<script setup lang="ts">
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Exportar datos — GastronomIA' })

const { data: sales } = useSales()
const { data: ingredients } = useIngredients()
const { data: recipes } = useRecipes()
const toast = useToast()

interface Dataset {
  id: 'sales' | 'ingredients' | 'recipes'
  label: string
  sub: string
  icon: string
}

const DATASETS: Dataset[] = [
  { id: 'sales', label: 'Ventas', sub: 'Comprobantes emitidos con detalle', icon: 'i-lucide-receipt' },
  { id: 'ingredients', label: 'Insumos', sub: 'Inventario con stock y costos', icon: 'i-lucide-package' },
  { id: 'recipes', label: 'Recetas', sub: 'Catálogo con costos y márgenes', icon: 'i-lucide-utensils' },
]

const selected = ref<Dataset['id'][]>(['sales'])
const range = ref<'7d' | '30d' | 'all'>('30d')
const generating = ref(false)

const counts = computed<Record<Dataset['id'], number>>(() => ({
  sales: sales.value?.length ?? 0,
  ingredients: ingredients.value?.length ?? 0,
  recipes: recipes.value?.length ?? 0,
}))

function toggle(id: Dataset['id']): void {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(s => s !== id)
    : [...selected.value, id]
}

function csvEscape(value: string | number | boolean | undefined | null): string {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function buildCsv(rows: Array<Array<string | number | boolean | undefined | null>>): string {
  return rows.map(r => r.map(csvEscape).join(',')).join('\n')
}

function download(name: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function exportAll(): Promise<void> {
  if (selected.value.length === 0 || generating.value) return
  generating.value = true
  try {
    // simula la generación del archivo en el servidor
    await new Promise(resolve => setTimeout(resolve, 900))
    const today = new Date().toISOString().slice(0, 10)

    if (selected.value.includes('sales')) {
      const rows: Array<Array<string | number | undefined>> = [
        ['serie', 'numero', 'tipo', 'fecha', 'mesa', 'cliente', 'subtotal', 'igv', 'total', 'metodo', 'estado'],
        ...(sales.value ?? []).map(s => [
          s.serie, s.number, s.docType, s.date, s.tableLabel, s.customer, s.subtotal, s.igv, s.total, s.method, s.status,
        ]),
      ]
      download(`gastronomia-ventas-${today}.csv`, buildCsv(rows))
    }
    if (selected.value.includes('ingredients')) {
      const rows: Array<Array<string | number>> = [
        ['nombre', 'categoria', 'unidad', 'costo_unitario', 'stock', 'stock_minimo'],
        ...(ingredients.value ?? []).map(i => [i.name, i.category, i.unit, i.unitCost, i.stock, i.minStock]),
      ]
      download(`gastronomia-insumos-${today}.csv`, buildCsv(rows))
    }
    if (selected.value.includes('recipes')) {
      const rows: Array<Array<string | number | boolean>> = [
        ['nombre', 'categoria', 'tipo', 'precio_venta', 'costo', 'margen_pct', 'activo'],
        ...(recipes.value ?? []).map(r => [r.name, r.category, r.kind, r.sellPrice, r.cost, r.marginPct, r.active]),
      ]
      download(`gastronomia-recetas-${today}.csv`, buildCsv(rows))
    }

    toast.add({
      title: `${selected.value.length} archivo${selected.value.length > 1 ? 's' : ''} CSV descargado${selected.value.length > 1 ? 's' : ''}`,
      icon: 'i-lucide-download',
    })
  }
  finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="de-screen">
    <UiScreenHeader title="Exportar datos" subtitle="Tus datos siempre son tuyos" back="/app/menu" />

    <!-- Datasets -->
    <section class="de-section">
      <div class="field-label"><span>¿Qué quieres exportar?</span></div>
      <div class="de-datasets">
        <button
          v-for="d in DATASETS"
          :key="d.id"
          class="de-dataset"
          :class="{ on: selected.includes(d.id) }"
          role="checkbox"
          :aria-checked="selected.includes(d.id)"
          @click="toggle(d.id)"
        >
          <span class="de-check" aria-hidden="true"><UIcon name="i-lucide-check" /></span>
          <span class="de-ico" aria-hidden="true"><UIcon :name="d.icon" /></span>
          <span class="de-body">
            <span class="de-label">{{ d.label }}</span>
            <span class="de-sub">{{ d.sub }}</span>
          </span>
          <span class="de-count">{{ counts[d.id] }} filas</span>
        </button>
      </div>
    </section>

    <!-- Rango -->
    <section class="de-section">
      <div class="field-label"><span>Rango de fechas</span></div>
      <div class="de-range" role="radiogroup">
        <button
          v-for="r in ([['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días'], ['all', 'Todo']] as const)"
          :key="r[0]"
          role="radio"
          :aria-checked="range === r[0]"
          class="de-range-chip"
          :class="{ on: range === r[0] }"
          @click="range = r[0]"
        >{{ r[1] }}</button>
      </div>
    </section>

    <!-- Formato -->
    <section class="de-section">
      <div class="de-format">
        <span class="de-format-ico"><UIcon name="i-lucide-file-spreadsheet" /></span>
        <span class="de-format-body">
          <b>CSV (UTF-8)</b>
          <span>Compatible con Excel, Google Sheets y contadores</span>
        </span>
      </div>
    </section>

    <div class="de-cta">
      <button class="btn btn-primary btn-lg btn-block" :disabled="selected.length === 0 || generating" @click="exportAll">
        <UIcon :name="generating ? 'i-lucide-loader-2' : 'i-lucide-download'" :class="{ spin: generating }" />
        {{ generating ? 'Generando archivos…' : `Descargar ${selected.length || ''} CSV` }}
      </button>
      <p class="de-note">
        <UIcon name="i-lucide-shield-check" />
        La exportación se genera localmente con tus datos. Nada sale de tu cuenta.
      </p>
    </div>
  </div>
</template>

<style scoped>
.de-screen {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.de-section { padding: 0 20px; margin-bottom: 20px; }

.de-datasets { display: flex; flex-direction: column; gap: 8px; }
.de-dataset {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1.5px solid var(--border-subtle);
  border-radius: 14px;
  padding: 13px 14px;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.de-dataset.on { border-color: var(--terracotta); background: linear-gradient(160deg, var(--pure-white), #FCF4EE); }
.de-check {
  width: 22px; height: 22px; border-radius: 7px;
  border: 1.5px solid var(--border);
  background: transparent; color: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.de-dataset.on .de-check { background: var(--terracotta); border-color: var(--terracotta); color: var(--crema-100); }
.de-check .iconify { width: 13px; height: 13px; }
.de-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.de-ico .iconify { width: 17px; height: 17px; }
.de-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.de-label { font-size: 14px; font-weight: 600; color: var(--fg1); }
.de-sub { font-size: 11.5px; color: var(--fg3); }
.de-count {
  font-family: var(--font-mono);
  font-size: 11px; color: var(--fg3);
  flex-shrink: 0;
}

.de-range { display: flex; gap: 6px; }
.de-range-chip {
  flex: 1;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 9px 0;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.de-range-chip.on { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }

.de-format {
  display: flex; align-items: center; gap: 12px;
  background: var(--crema-100);
  border: 1px dashed var(--border);
  border-radius: 14px;
  padding: 13px 14px;
}
.de-format-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--success-bg); color: var(--oliva-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.de-format-ico .iconify { width: 17px; height: 17px; }
.de-format-body { display: flex; flex-direction: column; gap: 1px; }
.de-format-body b { font-size: 13.5px; color: var(--fg1); }
.de-format-body span { font-size: 11.5px; color: var(--fg3); }

.de-cta { padding: 0 20px; }
.de-note {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 11.5px; color: var(--fg3);
  margin: 12px 0 0;
}
.de-note .iconify { width: 13px; height: 13px; color: var(--oliva-700); }
.spin { animation: spinAnim 0.9s linear infinite; }
@keyframes spinAnim { to { transform: rotate(360deg); } }
</style>
