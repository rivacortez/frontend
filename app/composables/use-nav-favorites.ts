/**
 * Favoritos del sidebar — destinos que el usuario fija para acceso rápido.
 * Persistidos en localStorage (por dispositivo); el estado se comparte vía
 * useState para que SSR y cliente arranquen consistentes. La hidratación desde
 * localStorage corre una sola vez en cliente y se envuelve en <ClientOnly> en
 * la vista para evitar mismatch de hidratación.
 */
const STORAGE_KEY = 'gastronomia:nav-favorites'
// Set inicial razonable para un dueño/gerente; el usuario lo edita con la ★.
const DEFAULTS = ['reportes', 'costeo', 'inventario']

let hydrated = false

export function useNavFavorites() {
  const ids = useState<string[]>('nav-favorites', () => [...DEFAULTS])

  if (import.meta.client && !hydrated) {
    hydrated = true
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed)) ids.value = parsed.filter((x): x is string => typeof x === 'string')
      }
      catch {
        // localStorage corrupto: ignorar y mantener defaults
      }
    }
    watch(
      ids,
      v => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)),
      { deep: true },
    )
  }

  const isFavorite = (id: string): boolean => ids.value.includes(id)

  function toggle(id: string): void {
    ids.value = isFavorite(id) ? ids.value.filter(x => x !== id) : [...ids.value, id]
  }

  return { ids, isFavorite, toggle }
}
