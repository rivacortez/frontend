export interface AppNavItem {
  id: string
  label: string
  icon: string
  to: string
  brand?: boolean
  exact?: boolean
}

/** Destinos principales del shell (tabs móvil = sidebar desktop). */
export function useAppNav(): AppNavItem[] {
  return [
    { id: 'home', label: 'Inicio', icon: 'i-lucide-home', to: '/app', exact: true },
    { id: 'pos', label: 'Mesas', icon: 'i-lucide-utensils', to: '/app/pos' },
    { id: 'stock', label: 'Inventario', icon: 'i-lucide-package', to: '/app/inventario' },
    { id: 'chat', label: 'Chat', icon: 'i-lucide-bot', to: '/app/chat', brand: true },
    { id: 'menu', label: 'Más', icon: 'i-lucide-more-horizontal', to: '/app/menu' },
  ]
}
