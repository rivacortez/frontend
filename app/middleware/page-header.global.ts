// Resetea el header de página en cada navegación, ANTES de que monte la nueva
// vista. Así, si la vista no declara header propio, la topbar cae al título de
// ruta en vez de heredar el de la pantalla anterior.
export default defineNuxtRouteMiddleware(() => {
  resetPageHeader()
})
