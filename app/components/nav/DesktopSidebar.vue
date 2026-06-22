<script setup lang="ts">
const items = useAppNav()
const route = useRoute()
const { user, clear } = useUserSession()

function isActive(item: AppNavItem): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/ingresar')
}

const initials = computed(() =>
  (user.value?.name ?? '')
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join(''),
)
</script>

<template>
  <aside class="sidebar hidden lg:flex" aria-label="Navegación principal">
    <NuxtLink to="/app" class="brand">
      <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="brand-logo">
    </NuxtLink>

    <nav class="nav-list">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="item.to"
        class="nav-item"
        :class="{ 'is-active': isActive(item) }"
        :aria-current="isActive(item) ? 'page' : undefined"
      >
        <UIcon :name="item.icon" class="nav-ico" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="sidebar-foot">
      <div class="user-row">
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <span class="user-meta">
          <span class="user-name">{{ user?.name }}</span>
          <span class="user-role">{{ user?.role }}</span>
        </span>
        <UButton
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Cerrar sesión"
          @click="logout"
        />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset-block: 0; left: 0;
  width: 256px;
  z-index: 40;
  flex-direction: column;
  background: var(--crema-100);
  border-right: 1px solid var(--border-subtle);
  padding: 20px 14px;
  gap: 24px;
}
.brand {
  display: flex; align-items: center;
  padding: 4px 10px;
  text-decoration: none;
}
.brand-logo { height: 21px; width: auto; display: block; }
.nav-list { display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px; font-weight: 500;
  color: var(--fg2);
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.nav-item:hover { background: var(--crema-200); color: var(--fg1); }
.nav-item.is-active {
  background: var(--terracotta-100);
  color: var(--terracotta-700);
  font-weight: 600;
}
.nav-ico { width: 19px; height: 19px; flex-shrink: 0; }
.sidebar-foot { margin-top: auto; }
.user-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
}
.avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 12px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.user-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.user-name {
  font-size: 13px; font-weight: 600; color: var(--fg1);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.user-role { font-size: 11px; color: var(--fg3); text-transform: capitalize; }
</style>
