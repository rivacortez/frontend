export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (to.path.startsWith('/app') && !loggedIn.value) {
    return navigateTo({ path: '/ingresar', query: { redirect: to.fullPath } })
  }

  if (to.path === '/ingresar' && loggedIn.value) {
    return navigateTo('/app')
  }
})
