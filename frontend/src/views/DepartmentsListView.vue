<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import { api, type YearOption } from '@/api/client'

const PAGE_SIZE = 50
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const years = ref<YearOption[]>([])
const departments = ref<string[]>([])
const filter = ref('')
const year = ref(0)
const visibleCount = ref(PAGE_SIZE)
const sentinel = ref<HTMLElement | null>(null)

const filtered = ref<string[]>([])

const visibleItems = computed(() => filtered.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < filtered.value.length)

async function load() {
  const y = Number(route.query.year) || 0
  year.value = y
  loading.value = true
  visibleCount.value = PAGE_SIZE
  try {
    if (years.value.length === 0) years.value = await api.getYears()
    const res = await api.getDepartments(y)
    departments.value = res.departments
    applyFilter()
  } catch {
    departments.value = []
  } finally {
    loading.value = false
  }
}

function applyFilter() {
  const q = filter.value.trim().toLowerCase()
  if (!q) {
    filtered.value = departments.value
  } else {
    filtered.value = departments.value.filter((d) => d.toLowerCase().includes(q))
  }
  visibleCount.value = PAGE_SIZE
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, filtered.value.length)
}

function goSearch(dept: string) {
  router.push({
    name: 'search-department',
    query: { department: dept, year: String(year.value) },
  })
}

onMounted(load)
watch(filter, applyFilter)
watch(() => route.query.year, load)

const observer = new IntersectionObserver(
  (entries) => {
    if (entries[0]?.isIntersecting) loadMore()
  },
  { root: null, rootMargin: '100px', threshold: 0 }
)
watch(sentinel, (el, prevEl) => {
  if (prevEl) observer.unobserve(prevEl)
  if (el) observer.observe(el)
}, { immediate: true })
onBeforeUnmount(() => observer.disconnect())
</script>

<template>
  <AppLayout>
    <div class="view">
      <router-link to="/" class="back">← Back to search</router-link>
      <h1 class="page-title">Departments</h1>
      <div class="toolbar">
        <label>
          Year
          <select v-model.number="year" @change="router.push({ query: { ...route.query, year: String(year) } })">
            <option v-for="y in years" :key="y.yearKey" :value="y.yearKey">{{ y.label }}</option>
          </select>
        </label>
        <label>
          Filter
          <input v-model="filter" type="text" placeholder="Type to filter…" />
        </label>
      </div>
      <p v-if="loading" class="muted">Loading…</p>
      <template v-else>
        <ul class="list">
          <li v-for="d in visibleItems" :key="d">
            <button type="button" class="list-btn" @click="goSearch(d)">{{ d }}</button>
          </li>
        </ul>
        <div ref="sentinel" class="sentinel" aria-hidden="true" />
        <p v-if="hasMore" class="load-more">Scroll for more…</p>
        <p v-if="filtered.length > 0 && !hasMore" class="muted count">Showing all {{ filtered.length }} departments.</p>
      </template>
      <p v-if="!loading && filtered.length === 0" class="muted">No departments match.</p>
    </div>
  </AppLayout>
</template>

<style scoped>
/* ========== Base (desktop) ========== */
.view {
  width: 100%;
}

.back {
  display: inline-block;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.page-title {
  font-size: 1.25rem;
  margin-bottom: 1rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.toolbar label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.toolbar select,
.toolbar input {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
}

.list {
  list-style: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.list li {
  border-bottom: 1px solid var(--color-border);
}

.list li:last-child {
  border-bottom: none;
}

.list-btn {
  display: block;
  width: 100%;
  padding: 0.6rem 1rem;
  text-align: left;
  background: none;
  border: none;
  color: var(--color-link);
  font: inherit;
  cursor: pointer;
}

.list-btn:hover {
  background: var(--color-bg);
  text-decoration: underline;
}

.muted {
  color: var(--color-text-muted);
}

.sentinel {
  height: 1px;
  visibility: hidden;
  pointer-events: none;
}

.load-more {
  text-align: center;
  padding: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.count {
  padding: 0.5rem 0;
  font-size: 0.875rem;
}

/* ========== Tablet (max-width: 1024px) ========== */
@media (max-width: 1024px) {
  /* No overrides needed */
}

/* ========== Mobile (max-width: 640px) ========== */
@media (max-width: 640px) {
  .toolbar {
    flex-direction: column;
    gap: 0.75rem;
  }

  .toolbar label {
    width: 100%;
  }

  .toolbar select,
  .toolbar input {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    min-height: 44px;
  }

  .list-btn {
    min-height: 44px;
    padding: 0.75rem 1rem;
  }
}
</style>
