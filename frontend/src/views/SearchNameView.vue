<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import { api, formatCurrency, type SalaryRecord } from '@/api/client'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const error = ref('')
const items = ref<SalaryRecord[]>([])

async function load() {
  const lastName = (route.query.lastName as string) || ''
  if (!lastName) {
    router.replace('/')
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await api.searchByName(
      lastName,
      (route.query.firstName as string) || '',
      Number(route.query.year) || 0,
      Number(route.query.campus) || 0
    )
    items.value = res.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Search failed'
    items.value = []
  } finally {
    loading.value = false
  }
}

function goPerson(r: SalaryRecord) {
  router.push({
    name: 'person',
    query: { lastName: r.lastName, firstName: r.firstName },
  })
}

onMounted(load)
watch(() => route.query, load)
</script>

<template>
  <AppLayout>
    <div class="view">
      <router-link to="/" class="back">← Back to search</router-link>
      <h1 class="page-title">Name search results</h1>

      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <div v-else-if="items.length === 0" class="empty">No results found.</div>
      <div v-else class="table-wrap">
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
  margin-bottom: 1rem;
}

.muted,
.empty {
  color: var(--color-text-muted);
}

.error {
  color: #c92a2a;
}

[data-theme="dark"] .error {
  color: #ff6b6b;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
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
</style>
