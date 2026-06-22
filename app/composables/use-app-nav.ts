export interface AppNavItem {
  id: string
  label: string
  icon: string
  to: string
  brand?: boolean
  exact?: boolean
  /** Solo visible para owner/manager (info de gestión; el backend 403ea a staff). */
  manageOnly?: boolean
}

export interface AppNavSection {
  /** Título de sección (eyebrow). Omitir en la sección principal. */
  title?: string
  items: AppNavItem[]
}

/** Destinos principales del tab bar móvil (5 slots). */
export function useAppNav(): AppNavItem[] {
  return [
    { id: 'home', label: 'Inicio', icon: 'i-lucide-home', to: '/app', exact: true },
    { id: 'pos', label: 'Mesas', icon: 'i-lucide-utensils', to: '/app/pos' },
    { id: 'stock', label: 'Inventario', icon: 'i-lucide-package', to: '/app/inventario' },
    { id: 'chat', label: 'Chat', icon: 'i-lucide-bot', to: '/app/chat', brand: true },
    { id: 'menu', label: 'Más', icon: 'i-lucide-more-horizontal', to: '/app/menu' },
  ]
}

/**
 * Navegación agrupada del sidebar de desktop. A diferencia del tab bar móvil
 * (5 slots + "Más"), en desktop hay espacio para exponer los destinos reales
 * agrupados por bounded context, sin esconderlos tras un hub.
 */
export function useAppNavSections(): AppNavSection[] {
  return [
    {
      items: [
        { id: 'home', label: 'Inicio', icon: 'i-lucide-home', to: '/app', exact: true },
        { id: 'pos', label: 'Mesas', icon: 'i-lucide-utensils', to: '/app/pos' },
        { id: 'chat', label: 'Chat IA', icon: 'i-lucide-bot', to: '/app/chat', brand: true },
      ],
    },
    {
      title: 'Operación',
      items: [
        { id: 'cocina', label: 'Cocina (KDS)', icon: 'i-lucide-chef-hat', to: '/app/cocina' },
        { id: 'recetas', label: 'Recetas', icon: 'i-lucide-book-open', to: '/app/recetas' },
        { id: 'inventario', label: 'Inventario', icon: 'i-lucide-package', to: '/app/inventario' },
        { id: 'costeo', label: 'Costeo y márgenes', icon: 'i-lucide-percent', to: '/app/costeo', manageOnly: true },
        { id: 'comprobantes', label: 'Comprobantes', icon: 'i-lucide-receipt', to: '/app/comprobantes' },
        { id: 'cierre', label: 'Cierre de caja', icon: 'i-lucide-lock', to: '/app/cierre', manageOnly: true },
        { id: 'reportes', label: 'Reportes', icon: 'i-lucide-bar-chart-3', to: '/app/reportes' },
      ],
    },
    {
      title: 'Datos',
      items: [
        { id: 'importar', label: 'Importar', icon: 'i-lucide-upload', to: '/app/datos/importar' },
        { id: 'exportar', label: 'Exportar', icon: 'i-lucide-download', to: '/app/datos/exportar' },
      ],
    },
  ]
}
