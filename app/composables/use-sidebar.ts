/**
 * Estado del sidebar de desktop (colapsado/expandido), compartido entre el
 * layout (`app.vue`) y el `DesktopSidebar`. Persistido en cookie para que la
 * preferencia sobreviva recargas y navegación.
 */
export function useSidebar(): {
  collapsed: Ref<boolean>
  toggle: () => void
} {
  const collapsed = useCookie<boolean>('gi-sidebar-collapsed', {
    default: () => false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  function toggle(): void {
    collapsed.value = !collapsed.value
  }

  return { collapsed, toggle }
}
