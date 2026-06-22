<script setup lang="ts">
useSeoMeta({ title: 'Verifica tu email — GastronomIA' })

const store = useOnboardingStore()
const toast = useToast()

// Sin cuenta empezada, vuelve al paso 1
if (!store.account.email) {
  await navigateTo('/registro')
}

const digits = ref<string[]>(['', '', '', '', '', ''])
const inputs = ref<HTMLInputElement[]>([])
const countdown = ref(45)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    if (countdown.value > 0) countdown.value -= 1
  }, 1000)
  inputs.value[0]?.focus()
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const code = computed(() => digits.value.join(''))
const complete = computed(() => code.value.length === 6 && digits.value.every(d => /^\d$/.test(d)))

function onInput(index: number, event: Event): void {
  const input = event.target as HTMLInputElement
  const value = input.value.replace(/\D/g, '')
  if (value.length > 1) {
    // pegado de código completo
    const chars = value.slice(0, 6).split('')
    chars.forEach((c, i) => { digits.value[i] = c })
    inputs.value[Math.min(chars.length, 5)]?.focus()
    return
  }
  digits.value[index] = value
  if (value && index < 5) inputs.value[index + 1]?.focus()
}

function onKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    inputs.value[index - 1]?.focus()
  }
}

function resend(): void {
  countdown.value = 45
  toast.add({ title: `Código reenviado a ${store.account.email}`, icon: 'i-lucide-mail' })
}

function verify(): void {
  if (!complete.value) return
  store.emailVerified = true
  void navigateTo('/registro/restaurante')
}
</script>

<template>
  <OnboardingStepShell
    :step="2"
    title="Revisa tu correo"
    :subtitle="`Enviamos un código de 6 dígitos a ${store.account.email}`"
    back="/registro"
  >
    <div class="vf-code" role="group" aria-label="Código de verificación">
      <input
        v-for="(_, i) in digits"
        :key="i"
        :ref="el => { if (el) inputs[i] = el as HTMLInputElement }"
        v-model="digits[i]"
        type="text"
        inputmode="numeric"
        maxlength="6"
        class="vf-digit"
        :aria-label="`Dígito ${i + 1}`"
        @input="onInput(i, $event)"
        @keydown="onKeydown(i, $event)"
      >
    </div>

    <div class="vf-resend">
      <template v-if="countdown > 0">
        Reenviar código en <b>0:{{ String(countdown).padStart(2, '0') }}</b>
      </template>
      <button v-else class="vf-resend-btn" @click="resend">
        <UIcon name="i-lucide-rotate-ccw" /> Reenviar código
      </button>
    </div>

    <p class="vf-hint">
      <UIcon name="i-lucide-info" />
      Demo: cualquier código de 6 dígitos es válido.
    </p>

    <template #cta>
      <UButton size="xl" block trailing-icon="i-lucide-arrow-right" :disabled="!complete" @click="verify">
        Verificar
      </UButton>
    </template>
  </OnboardingStepShell>
</template>

<style scoped>
.vf-code {
  display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.vf-digit {
  aspect-ratio: 0.85;
  width: 100%;
  background: var(--pure-white);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  font: inherit; font-size: 24px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
  text-align: center;
  outline: none;
  transition: border-color var(--dur) var(--ease-standard), box-shadow var(--dur) var(--ease-standard);
}
.vf-digit:focus { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(201, 106, 67, 0.18); }
.vf-resend {
  text-align: center;
  font-size: 13px; color: var(--fg3);
  margin-top: 18px;
}
.vf-resend b { color: var(--fg1); font-variant-numeric: tabular-nums; }
.vf-resend-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 13px; font-weight: 600;
  background: transparent; border: none;
  color: var(--terracotta-700);
  cursor: pointer;
}
.vf-resend-btn .iconify { width: 14px; height: 14px; }
.vf-hint {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 11.5px; color: var(--fg3);
  margin-top: 22px;
}
.vf-hint .iconify { width: 13px; height: 13px; }
</style>
