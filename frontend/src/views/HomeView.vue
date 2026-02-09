<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import {
  api,
  formatCurrency,
  type YearOption,
  type CampusOption,
  type AnalyticsResponse,
  type AnalyticsTopEarner,
} from '@/api/client'

const router = useRouter()
const years = ref<YearOption[]>([])
const campuses = ref<CampusOption[]>([])
const activeTab = ref<'name' | 'title' | 'department'>('name')
const summary = ref<AnalyticsResponse | null>(null)
const summaryLoading = ref(true)

const nameLast = ref('')
const nameFirst = ref('')
const nameYear = ref(0)
const nameCampus = ref(0)

const titleQuery = ref('')
const titleYear = ref(0)

const deptQuery = ref('')
const deptYear = ref(0)

async function loadSummary() {
  summaryLoading.value = true
  summary.value = null
  try {
    const year = years.value.length ? years.value[0].yearKey : 0
    summary.value = await api.getAnalytics(year)
  } catch (_) {
  } finally {
    summaryLoading.value = false
  }
}

onMounted(async () => {
  const [y, c] = await Promise.all([api.getYears(), api.getCampuses()])
  years.value = y
  campuses.value = c
  await loadSummary()
})

function goPerson(r: AnalyticsTopEarner) {
  router.push({ name: 'person', query: { lastName: r.lastName, firstName: r.firstName } })
}

function goDepartment(name: string) {
  router.push({ name: 'search-department', query: { department: name, year: years.value[0]?.yearKey ?? 0 } })
}

function formatCompactCurrency(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return formatCurrency(n)
}

function submitName() {
  const last = nameLast.value.trim()
  if (!last) return
  router.push({
    name: 'search-name',
    query: { lastName: last, firstName: nameFirst.value.trim(), year: nameYear.value, campus: nameCampus.value },
  })
}

function submitTitle() {
  const t = titleQuery.value.trim()
  if (!t) return
  router.push({
    name: 'search-title',
    query: { title: t, year: titleYear.value },
  })
}

function submitDepartment() {
  const d = deptQuery.value.trim()
  if (!d) return
  router.push({
    name: 'search-department',
    query: { department: d, year: deptYear.value },
  })
}
</script>

<template>
  <AppLayout>
    <div class="home">
      <h1 class="title">University of Michigan Salary Information</h1>
      <p class="subtitle">Search by name, job title, or department. Data from public salary disclosures.</p>

      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'name' }"
          @click="activeTab = 'name'"
        >
          By name
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'title' }"
          @click="activeTab = 'title'"
        >
          By title
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'department' }"
          @click="activeTab = 'department'"
        >
          By department
        </button>
      </div>

      <div v-show="activeTab === 'name'" class="panel">
        <form class="form" @submit.prevent="submitName">
          <div class="row">
            <label for="name-last">Last name *</label>
            <input id="name-last" v-model="nameLast" type="text" required placeholder="e.g. Smith" />
          </div>
          <div class="row">
            <label for="name-first">First name</label>
            <input id="name-first" v-model="nameFirst" type="text" placeholder="optional" />
          </div>
          <div class="row">
            <label for="name-year">Year</label>
            <select id="name-year" v-model.number="nameYear">
              <option v-for="y in years" :key="y.yearKey" :value="y.yearKey">{{ y.label }}</option>
            </select>
          </div>
          <div class="row">
            <label for="name-campus">Campus</label>
            <select id="name-campus" v-model.number="nameCampus">
              <option v-for="c in campuses" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Search</button>
        </form>
      </div>

      <div v-show="activeTab === 'title'" class="panel">
        <form class="form" @submit.prevent="submitTitle">
          <div class="row">
            <label for="title-q">Job title</label>
            <input id="title-q" v-model="titleQuery" type="text" required placeholder="e.g. Professor" />
          </div>
          <div class="row">
            <label for="title-year">Year</label>
            <select id="title-year" v-model.number="titleYear">
              <option v-for="y in years" :key="y.yearKey" :value="y.yearKey">{{ y.label }}</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Search</button>
        </form>
      </div>

      <div v-show="activeTab === 'department'" class="panel">
        <form class="form" @submit.prevent="submitDepartment">
          <div class="row">
            <label for="dept-q">Department</label>
            <input id="dept-q" v-model="deptQuery" type="text" required placeholder="e.g. Athletics" />
          </div>
          <div class="row">
            <label for="dept-year">Year</label>
            <select id="dept-year" v-model.number="deptYear">
              <option v-for="y in years" :key="y.yearKey" :value="y.yearKey">{{ y.label }}</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Search</button>
        </form>
      </div>

      <div class="links">
        <router-link to="/departments">Browse all departments</router-link>
        <router-link to="/titles">Browse all titles</router-link>
      </div>

      <section class="summary-section">
        <h2 class="summary-title">Snapshot</h2>
        <p v-if="summaryLoading" class="summary-muted">Loading…</p>
        <template v-else-if="summary">
          <div class="summary-stats">
            <div class="summary-stat">
              <span class="summary-stat-label">Headcount</span>
              <span class="summary-stat-value">{{ summary.overview.headcount.toLocaleString() }}</span>
            </div>
            <div class="summary-stat">
              <span class="summary-stat-label">Total payroll</span>
              <span class="summary-stat-value">{{ formatCompactCurrency(summary.overview.totalPayroll) }}</span>
            </div>
            <div class="summary-stat">
              <span class="summary-stat-label">Mean salary</span>
              <span class="summary-stat-value">{{ formatCurrency(summary.overview.meanFtr) }}</span>
            </div>
          </div>
          <div class="summary-grid">
            <div class="summary-block">
              <h3 class="summary-block-title">Top 5 earners</h3>
              <ul class="summary-list">
                <li v-for="r in summary.topEarners.slice(0, 5)" :key="r.id">
                  <button type="button" class="summary-link" @click="goPerson(r)">
                    {{ r.lastName }}, {{ r.firstName }}
                  </button>
                  <span class="summary-salary">{{ formatCurrency(r.ftr) }}</span>
                </li>
              </ul>
            </div>
            <div class="summary-block">
              <h3 class="summary-block-title">Top 5 departments</h3>
              <ul class="summary-list">
                <li v-for="d in summary.departments.slice(0, 5)" :key="d.name">
                  <button type="button" class="summary-link" @click="goDepartment(d.name)">
                    {{ d.name }}
                  </button>
                  <span class="summary-salary">{{ formatCurrency(d.totalFtr) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </section>
    </div>
  </AppLayout>
</template>

<style scoped>
.home {
  max-width: 640px;
  margin: 0 auto;
}

.summary-section {
  margin-top: 2.5rem;
  padding: 1.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.summary-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 1.25rem;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.summary-title::before {
  content: '';
  width: 4px;
  height: 1.25em;
  background: linear-gradient(180deg, var(--color-highlight) 0%, var(--color-accent) 100%);
  border-radius: 2px;
}

.summary-muted {
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.summary-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-stat {
  flex: 1;
  min-width: 0;
  padding: 1rem;
  background: rgba(30, 58, 95, 0.06);
  border-radius: var(--radius);
  border: 1px solid rgba(30, 58, 95, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.summary-stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.02em;
  word-break: break-word;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto auto;
  gap: 1.25rem;
}

.summary-block {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1.25rem;
  box-shadow: var(--shadow-sm);
  min-width: 0;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.summary-block:hover {
  box-shadow: var(--shadow-md);
  border-color: rgba(0, 39, 76, 0.15);
}

.summary-block-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  color: var(--color-text);
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.summary-block-title::before {
  content: '';
  width: 3px;
  height: 1em;
  background: linear-gradient(180deg, var(--color-highlight) 0%, var(--color-accent) 100%);
  border-radius: 2px;
  flex-shrink: 0;
}

.summary-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.summary-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  margin: 0 -0.75rem;
  border-radius: 6px;
  transition: background 0.15s ease;
  flex-wrap: wrap;
}

.summary-list li:hover {
  background: rgba(255, 255, 255, 0.5);
}

[data-theme='dark'] .summary-list li:hover {
  background: rgba(255, 255, 255, 0.05);
}

.summary-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--color-link);
  cursor: pointer;
  text-align: left;
  flex: 1;
  min-width: 0;
  font-weight: 500;
  transition: color 0.15s ease;
  word-break: break-word;
  white-space: normal;
}

.summary-link:hover {
  color: var(--color-accent-hover);
  text-decoration: underline;
}

.summary-salary {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
  flex-shrink: 0;
}

.title {
  font-size: 1.85rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  color: var(--color-text);
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, var(--color-text) 0%, var(--color-accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: var(--color-text-muted);
  margin-bottom: 1.75rem;
  font-size: 1rem;
  line-height: 1.6;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.tab {
  padding: 0.6rem 1.2rem;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  border-radius: 10px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
}

.tab:hover {
  border-color: var(--color-highlight);
  color: var(--color-accent);
  transform: translateY(-1px);
}

.tab.active {
  background: var(--color-highlight);
  color: #f8fafc;
  border-color: var(--color-highlight);
  box-shadow: 0 2px 8px rgba(15, 39, 68, 0.12);
  transform: translateY(-1px);
}

.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.25rem;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.panel:hover {
  box-shadow: var(--shadow-md);
}

.form .row {
  margin-bottom: 1rem;
}

.form label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
  color: var(--color-text-muted);
}

.form input,
.form select {
  width: 100%;
  padding: 0.6rem 0.9rem;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
}

.form input:focus,
.form select:focus {
  border-color: var(--color-highlight);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.15);
}

.btn {
  padding: 0.65rem 1.5rem;
  border-radius: 10px;
  font-weight: 600;
  border: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-highlight) 0%, var(--color-highlight-hover) 100%);
  color: #f8fafc;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(15, 39, 68, 0.12);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #2c5282 0%, var(--color-highlight) 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(15, 39, 68, 0.15);
}

.btn-primary:active {
  transform: translateY(0);
}

.links {
  display: flex;
  gap: 1.5rem;
  margin-top: 1.25rem;
  font-size: 0.95rem;
  font-weight: 500;
}

.links a {
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  transition: background 0.2s ease, color 0.2s ease;
}

.links a:hover {
  background: var(--color-highlight-muted);
  color: var(--color-accent);
}
</style>
