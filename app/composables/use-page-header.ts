/**
 * Header de página → topbar. Cada vista declara su título / subtítulo / "atrás"
 * y la AppTopbar (montada en el layout) lo renderiza. Las acciones contextuales
 * se inyectan por teleport a `#topbar-actions`.
 *
 * El estado vive en useState (compartido SSR/cliente). Un middleware global lo
 * resetea en cada navegación; la vista lo vuelve a setear en su setup. Las vistas
 * que no declaran nada caen al título derivado de la ruta (useRouteTitle).
 */
export interface PageHeaderState {
  title: string | null
  subtitle: string | null
  back: string | null
  hasBack: boolean
}

const EMPTY: PageHeaderState = { title: null, subtitle: null, back: null, hasBack: false }

export function usePageHeaderState() {
  return useState<PageHeaderState>('page-header', () => ({ ...EMPTY }))
}

export function resetPageHeader(): void {
  usePageHeaderState().value = { ...EMPTY }
}

export interface PageHeaderInput {
  title?: string
  subtitle?: string | null
  back?: string
  hasBack?: boolean
}

/**
 * Declara el header de la página actual. Pasá un getter para que sea reactivo
 * a props/estado (p. ej. un título que depende de datos cargados).
 */
export function definePageHeader(source: MaybeRefOrGetter<PageHeaderInput>): void {
  const state = usePageHeaderState()
  watchEffect(() => {
    const v = toValue(source)
    state.value = {
      title: v.title ?? null,
      subtitle: v.subtitle ?? null,
      back: v.back ?? null,
      hasBack: v.hasBack ?? (v.back != null),
    }
  })
}

// Títulos por ruta — fallback cuando la vista no declara uno propio. Solo se usan
// rutas "raíz" de cada sección; las subpáginas declaran su título vía ScreenHeader.
const ROUTE_TITLES: Record<string, string> = {
  '/app': 'Inicio',
  '/app/pos': 'Mesas',
  '/app/chat': 'Chat IA',
  '/app/menu': 'Menú',
  '/app/cocina': 'Cocina',
  '/app/recetas': 'Recetas',
  '/app/inventario': 'Inventario',
  '/app/costeo': 'Costeo y márgenes',
  '/app/comprobantes': 'Comprobantes',
  '/app/cierre': 'Cierre de caja',
  '/app/reportes': 'Reportes',
  '/app/datos/importar': 'Importar',
  '/app/datos/exportar': 'Exportar',
  '/app/ajustes': 'Ajustes',
  '/app/notificaciones': 'Notificaciones',
  '/app/perfil': 'Perfil',
  '/app/ayuda': 'Ayuda',
}

/** Título derivado de la ruta: match exacto → prefijo más largo (>'/app') → segmento. */
export function useRouteTitle() {
  const route = useRoute()
  return computed(() => {
    const path = route.path
    if (ROUTE_TITLES[path]) return ROUTE_TITLES[path]
    let best = ''
    for (const key of Object.keys(ROUTE_TITLES)) {
      if (key.length > 4 && path.startsWith(key) && key.length > best.length) best = key
    }
    if (best) return ROUTE_TITLES[best]!
    const seg = path.split('/').filter(Boolean).pop() ?? 'GastronomIA'
    return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
  })
}
