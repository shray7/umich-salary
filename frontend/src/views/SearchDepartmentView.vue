<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import { api, formatCurrency, type SalaryRecord } from '@/api/client'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const error = ref('')
const items = ref<SalaryRecord[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(30)
const totalPages = ref(0)
const aggregates = ref({ count: 0, minSalary: 0, maxSalary: 0, avgSalary: 0 })

async function load() {
  const department = (route.query.department as string) || ''
  if (!department) {
    router.replace('/')
    return
  }
  loading.value = true
  error.value = ''
  const year = Number(route.query.year) || 0
  const p = Number(route.query.page) || 1
  const ps = Number(route.query.pageSize) || 30
  try {
    const res = await api.searchByDepartment(department, year, p, ps)
    items.value = res.items
    totalCount.value = res.totalCount
    page.value = res.page
    pageSize.value = res.pageSize
    totalPages.value = res.totalPages
    aggregates.value = res.aggregates
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Search failed'
    items.value = []
  } finally {
    loading.value = false
  }
}

const yearLabel = computed(() => {
  const y = Number(route.query.year) || 0
  const labels = ['2025-2026', '2024-2025', '2023-2024']
  return labels[y] || `${y}`
})

function goPerson(r: SalaryRecord) {
  router.push({ name: 'person', query: { lastName: r.lastName, firstName: r.firstName } })
}

function goPage(p: number) {
  router.push({
    name: 'search-department',
    query: { ...route.query, page: String(p), pageSize: String(pageSize.value) },
  })
}

onMounted(load)
watch(() => route.query, load)
</script>

<template>
  <AppLayout>
    <div class="view">
      <router-link to="/" class="back">← Back to search</router-link>
      <h1 class="page-title">Department: {{ route.query.department }}</h1>
      <p class="muted">Year: {{ yearLabel }}</p>

      <div v-if="!loading && !error && aggregates.count > 0" class="aggregates">
        <span>Count: <strong>{{ aggregates.count }}</strong></span>
        <span>Min: <strong>{{ formatCurrency(aggregates.minSalary) }}</strong></span>
        <span>Avg: <strong>{{ formatCurrency(aggregates.avgSalary) }}</strong></span>
        <span>Max: <strong>{{ formatCurrency(aggregates.maxSalary) }}</strong></span>
      </div>

      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <div v-else-if="items.length === 0" class="empty">No results found.</div>
      <template v-else>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Department</th>
                <th class="num">FTR</th>
                <th class="num">GF</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in items" :key="r.id">
                <td>
                  <button type="button" class="link-btn" @click="goPerson(r)">
                    {{ r.lastName }}, {{ r.firstName }}
                  </button>
                </td>
                <td>{{ r.title }}</td>
                <td>{{ r.department }}</td>
                <td class="num">{{ formatCurrency(r.ftr) }}</td>
                <td class="num">{{ formatCurrency(r.gf) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="totalPages > 1" class="pagination">
          <button type="button" :disabled="page <= 1" @click="goPage(page - 1)">Previous</button>
          <span class="page-info">Page {{ page }} of {{ totalPages }}</span>
          <button type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">Next</button>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<style scoped>
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
  margin-bottom: 0.25rem;
}

.muted,
.empty {
  color: var(--color-text-muted);
}

.error {
  color: #c92a2a;
}

.aggregates {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.9rem;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  margin-bottom: 1rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.data-table th.num,
.data-table td.num {
  text-align: right;
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-link);
  font: inherit;
  padding: 0;
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.pagination button {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: 6px;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>
