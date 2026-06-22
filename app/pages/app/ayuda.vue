<script setup lang="ts">
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Ayuda — GastronomIA' })

const toast = useToast()
const query = ref('')
const openFaq = ref<string | null>('faq-1')

interface Faq {
  id: string
  q: string
  a: string
}

const FAQS: Faq[] = [
  { id: 'faq-1', q: '¿Cómo calculo el costo de un plato?', a: 'Crea la receta en Recetas → Nueva receta. Agrega los ingredientes con sus cantidades y merma; GastronomIA calcula el costo total y el margen automáticamente con los precios de tus últimas compras.' },
  { id: 'faq-2', q: '¿Cómo registro una compra al proveedor?', a: 'La forma más rápida es Magic Upload: toma una foto de la factura y la IA extrae las líneas. También puedes usar Stock → Ingreso Manual para registrar entradas una a una.' },
  { id: 'faq-3', q: '¿Por qué cambió el margen de mis platos?', a: 'El margen se recalcula cuando sube o baja el costo de un insumo. Si el limón sube 30 %, todas las recetas que lo usan reflejan el nuevo costo y recibes una alerta si el margen cae del umbral.' },
  { id: 'faq-4', q: '¿Cómo divido la cuenta de una mesa?', a: 'En el detalle de la mesa toca ⋯ → Dividir cuenta. Puedes dividir en partes iguales por persona o asignar items a cuentas separadas, y cobrar cada una con un método distinto.' },
  { id: 'faq-5', q: '¿Qué puedo preguntarle al chat?', a: 'Lo que le preguntarías a un contador que conoce tu negocio: "¿cuál es mi plato más rentable?", "¿cuánto vendí el sábado?", "¿qué insumos debo comprar?". Responde con datos reales de tu operación.' },
  { id: 'faq-6', q: '¿Mis datos están seguros?', a: 'Sí. Cada restaurante tiene sus datos aislados (multi-tenant), la sesión usa cookies cifradas y nunca compartimos tu información. Puedes exportar tus datos cuando quieras desde Datos → Exportar.' },
]

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return FAQS
  return FAQS.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
})

function contact(channel: string): void {
  toast.add({ title: `Abriendo ${channel}…`, icon: 'i-lucide-message-circle' })
}
</script>

<template>
  <div class="hp-screen">
    <UiScreenHeader title="Centro de ayuda" subtitle="Estamos para ayudarte" back="/app/menu" />

    <!-- Buscador -->
    <div class="hp-search-wrap">
      <label class="hp-search">
        <UIcon name="i-lucide-search" />
        <input v-model="query" type="search" placeholder="¿Qué necesitas resolver?" aria-label="Buscar en la ayuda">
      </label>
    </div>

    <!-- Contacto rápido -->
    <section class="hp-contact">
      <button class="hp-contact-card whatsapp" @click="contact('WhatsApp')">
        <UIcon name="i-lucide-message-circle" />
        <b>WhatsApp</b>
        <span>Respuesta en minutos</span>
      </button>
      <button class="hp-contact-card" @click="contact('el correo de soporte')">
        <UIcon name="i-lucide-mail" />
        <b>Email</b>
        <span>soporte@gastronomia.pe</span>
      </button>
    </section>

    <!-- FAQ -->
    <section class="hp-section">
      <div class="eyebrow hp-eyebrow">Preguntas frecuentes</div>
      <div class="hp-faqs">
        <div v-for="f in filtered" :key="f.id" class="hp-faq" :class="{ open: openFaq === f.id }">
          <button class="hp-faq-q" :aria-expanded="openFaq === f.id" @click="openFaq = openFaq === f.id ? null : f.id">
            <span>{{ f.q }}</span>
            <UIcon name="i-lucide-chevron-down" class="hp-faq-chev" />
          </button>
          <p v-if="openFaq === f.id" class="hp-faq-a">{{ f.a }}</p>
        </div>
        <UiEmptyState
          v-if="filtered.length === 0"
          icon="i-lucide-search-x"
          title="Sin resultados"
          subtitle="Prueba con otras palabras o escríbenos por WhatsApp."
        />
      </div>
    </section>

    <!-- Guías -->
    <section class="hp-section">
      <div class="eyebrow hp-eyebrow">Primeros pasos</div>
      <div class="hp-guides">
        <NuxtLink to="/app/recetas/nueva" class="hp-guide">
          <span class="num">1</span>
          <span class="body"><b>Crea tu primera receta</b><span>Con costos y margen en vivo</span></span>
        </NuxtLink>
        <NuxtLink to="/app/datos/importar" class="hp-guide">
          <span class="num">2</span>
          <span class="body"><b>Importa tus ventas</b><span>Desde TumiSoft u otro CSV</span></span>
        </NuxtLink>
        <NuxtLink to="/app/chat" class="hp-guide">
          <span class="num">3</span>
          <span class="body"><b>Pregúntale a tus datos</b><span>El chat responde en español</span></span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hp-screen {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.hp-search-wrap { padding: 0 20px 14px; }
.hp-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 44px;
}
.hp-search:focus-within { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.hp-search input {
  flex: 1; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.hp-search .iconify { width: 16px; height: 16px; color: var(--fg3); }

.hp-contact {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 0 20px;
  margin-bottom: 20px;
}
.hp-contact-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.hp-contact-card:hover { background: var(--crema-100); border-color: var(--border); }
.hp-contact-card .iconify { width: 20px; height: 20px; color: var(--terracotta-700); margin-bottom: 6px; }
.hp-contact-card.whatsapp .iconify { color: var(--oliva-700); }
.hp-contact-card b { font-size: 14px; color: var(--fg1); }
.hp-contact-card span { font-size: 11.5px; color: var(--fg3); }

.hp-section { padding: 0 20px; margin-bottom: 20px; }
.hp-eyebrow { padding: 4px 0 10px; }
.hp-faqs {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.hp-faq { border-bottom: 1px solid var(--border-subtle); }
.hp-faq:last-child { border-bottom: none; }
.hp-faq-q {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%;
  background: transparent; border: none;
  padding: 14px;
  font: inherit; font-size: 14px; font-weight: 600;
  color: var(--fg1);
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.hp-faq-q:hover { background: var(--crema-50); }
.hp-faq-chev {
  width: 16px; height: 16px; color: var(--fg3);
  flex-shrink: 0;
  transition: transform var(--dur) var(--ease-standard);
}
.hp-faq.open .hp-faq-chev { transform: rotate(180deg); }
.hp-faq-a {
  font-size: 13px; line-height: 1.55; color: var(--fg2);
  padding: 0 14px 14px;
  margin: 0;
}

.hp-guides { display: flex; flex-direction: column; gap: 8px; }
.hp-guide {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard);
}
.hp-guide:hover { background: var(--crema-100); }
.hp-guide .num {
  width: 32px; height: 32px; border-radius: 10px;
  background: var(--terracotta-100); color: var(--terracotta-700);
  font-size: 14px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.hp-guide .body { display: flex; flex-direction: column; gap: 1px; }
.hp-guide b { font-size: 13.5px; color: var(--fg1); }
.hp-guide .body span { font-size: 11.5px; color: var(--fg3); }
</style>
