<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

const dark = ref(false)

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.setAttribute('data-theme', dark.value ? 'dark' : '')
  try {
    localStorage.setItem('um-salary-theme', dark.value ? 'dark' : 'light')
  } catch (_) {}
  window.dispatchEvent(new CustomEvent('theme-change'))
}

onMounted(() => {
  const saved = localStorage.getItem('um-salary-theme')
  dark.value = saved === 'dark'
  document.documentElement.setAttribute('data-theme', dark.value ? 'dark' : '')
})
</script>

<template>
  <div class="layout">
    <header class="header">
      <RouterLink to="/" class="logo">UM Salary</RouterLink>
      <nav class="nav">
        <RouterLink to="/">Search</RouterLink>
        <RouterLink to="/analytics">Analytics</RouterLink>
        <RouterLink to="/departments">Departments</RouterLink>
        <RouterLink to="/titles">Titles</RouterLink>
        <button type="button" class="theme-toggle" :aria-label="dark ? 'Switch to light' : 'Switch to dark'" @click="toggleTheme">
          {{ dark ? '☀️' : '🌙' }}
        </button>
      </nav>
    </header>
    <div class="header-stripe" aria-hidden="true" />
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(180deg, var(--color-header-bg) 0%, #1e3a5f 100%);
  padding: 0.9rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  box-shadow: 0 2px 12px rgba(15, 39, 68, 0.3);
}

.header-stripe {
  height: 6px;
  background: linear-gradient(90deg, var(--color-header-accent) 0%, #7ba3d4 50%, var(--color-header-accent) 100%);
  box-shadow: 0 2px 8px rgba(91, 141, 201, 0.3);
}

.logo {
  font-weight: 700;
  font-size: 1.35rem;
  color: var(--color-header-text);
  text-decoration: none;
  letter-spacing: -0.02em;
  transition: color 0.2s ease, transform 0.2s ease;
}

.logo:hover {
  color: var(--color-header-accent);
  text-decoration: underline;
  transform: translateY(-1px);
}

.nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.nav a {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  transition: color 0.2s ease, background 0.2s ease;
}

.nav a:hover {
  color: var(--color-header-accent);
  background: rgba(255, 255, 255, 0.08);
}

.nav a.router-link-active {
  color: var(--color-header-accent);
  background: rgba(255, 255, 255, 0.12);
}

.theme-toggle {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: var(--color-header-text);
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  font-size: 1.1rem;
  transition: background 0.2s ease, transform 0.2s ease;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

.main {
  flex: 1;
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
</style>
