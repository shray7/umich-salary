<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import { api, formatCurrency, type PersonResponse, type SalaryRecord } from '@/api/client'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const error = ref('')
const person = ref<PersonResponse | null>(null)

async function load() {
  const lastName = (route.query.lastName as string) || ''
  if (!lastName) {
    router.replace('/')
    return
  }
  loading.value = true
  error.value = ''
  try {
    person.value = await api.getPerson(lastName, (route.query.firstName as string) || '')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Not found'
    person.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.query, load)

// Compute % change from previous year (in time); use DB value if present, else derive from FTR.
// salaryHistory is year_key ASC: index 0=newest, higher index=older. So previous year in time is index i+1.
function changePct(records: SalaryRecord[], i: number): number | null {
  const r = records[i]
  if (r.changeFromLastYearPct != null) return r.changeFromLastYearPct
  if (i + 1 >= records.length) return null
  const prevYear = records[i + 1]
  if (prevYear.ftr <= 0) return null
  return Math.round(((r.ftr - prevYear.ftr) / prevYear.ftr) * 1000) / 10
}

// Summary stats
const summary = computed(() => {
  const hist = person.value?.salaryHistory ?? []
  if (hist.length === 0) return null
  const highest = hist.reduce((a, b) => (a.ftr >= b.ftr ? a : b))
  const total = hist.reduce((sum, r) => sum + r.ftr, 0)
  let avgGrowth = 0
  let growthCount = 0
  for (let i = 0; i < hist.length - 1; i++) {
    const pct = changePct(hist, i)
    if (pct != null) {
      avgGrowth += pct
      growthCount++
    }
  }
  const avgGrowthPct = growthCount > 0 ? Math.round((avgGrowth / growthCount) * 10) / 10 : null
  return {
    highestYear: highest.fiscalYear,
    highestFtr: highest.ftr,
    totalEarnings: total,
    yearsOfService: hist.length,
    avgGrowthPct,
  }
})

// Records with computed changePct for table
const historyWithChange = computed(() => {
  const hist = person.value?.salaryHistory ?? []
  return hist.map((r, i) => ({ record: r, changePct: changePct(hist, i) }))
})

// Chart data for SVG (salary over time) - reverse so oldest is left, newest is right
const chartData = computed(() => {
  const hist = [...(person.value?.salaryHistory ?? [])].reverse()
  if (hist.length === 0) return null
  const ftrs = hist.map((r) => r.ftr)
  const minFtr = Math.min(...ftrs)
  const maxFtr = Math.max(...ftrs)
  const pad = (maxFtr - minFtr) * 0.1 || 1
  const lo = minFtr - pad
  const hi = maxFtr + pad
  const w = 320
  const h = 140
  const points = hist.map((r, i) => {
    const x = hist.length > 1 ? (i / (hist.length - 1)) * w : w / 2
    const y = h - ((r.ftr - lo) / (hi - lo)) * h
    return { x, y, ftr: r.ftr, label: r.fiscalYear }
  })
  return { points, w, h, lo, hi }
})
</script>

<template>
  <AppLayout>
    <div class="view">
      <router-link to="/" class="back">← Back to search</router-link>

      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <template v-else-if="person">
        <h1 class="page-title">Salary history: {{ person.firstName }} {{ person.lastName }}</h1>

        <!-- Summary stats -->
        <section v-if="summary" class="stats-section">
          <div class="stat-card">
            <span class="stat-label">Highest salary year</span>
            <span class="stat-value">{{ summary.highestYear }}</span>
            <span class="stat-sub">{{ formatCurrency(summary.highestFtr) }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Total career earnings</span>
            <span class="stat-value">{{ formatCurrency(summary.totalEarnings) }}</span>
            <span class="stat-sub">{{ summary.yearsOfService }} year{{ summary.yearsOfService !== 1 ? 's' : '' }}</span>
          </div>
          <div v-if="summary.avgGrowthPct != null" class="stat-card">
            <span class="stat-label">Avg annual growth</span>
            <span class="stat-value" :class="{ 'positive': summary.avgGrowthPct > 0, 'negative': summary.avgGrowthPct < 0 }">
              {{ summary.avgGrowthPct > 0 ? '+' : '' }}{{ summary.avgGrowthPct }}%
            </span>
          </div>
        </section>

        <!-- Salary trend chart -->
        <section v-if="chartData && chartData.points.length > 0" class="chart-section">
          <h3 class="chart-title">Salary over time</h3>
          <div class="chart-wrap">
            <svg :viewBox="`0 0 ${chartData.w} ${chartData.h}`" class="chart-svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="salary-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--color-highlight)" stop-opacity="0.3" />
                  <stop offset="100%" stop-color="var(--color-highlight)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <polygon
                :points="chartData.points.map(p => `${p.x},${p.y}`).join(' ') + ` ${chartData.w},${chartData.h} 0,${chartData.h}`"
                fill="url(#salary-area)"
              />
              <polyline
                :points="chartData.points.map(p => `${p.x},${p.y}`).join(' ')"
                fill="none"
                stroke="var(--color-accent)"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle
                v-for="(p, i) in chartData.points"
                :key="i"
                :cx="p.x"
                :cy="p.y"
                r="3"
                fill="var(--color-accent)"
              />
            </svg>
          </div>
          <div class="chart-labels">
            <span>{{ chartData.points[0]?.label }}</span>
            <span>{{ chartData.points[chartData.points.length - 1]?.label }}</span>
          </div>
        </section>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fiscal year</th>
                <th>Campus</th>
                <th>Title</th>
                <th>Department</th>
                <th>Period / FTE</th>
                <th class="num">GF</th>
                <th class="num">FTR</th>
                <th class="num">% change</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in historyWithChange" :key="item.record.id">
                <td>{{ item.record.fiscalYear }}</td>
                <td>{{ item.record.campus || '—' }}</td>
                <td>{{ item.record.title }}</td>
                <td>{{ item.record.department }}</td>
                <td>{{ item.record.periodFte || '—' }}</td>
                <td class="num">{{ formatCurrency(item.record.gf) }}</td>
                <td class="num">{{ formatCurrency(item.record.ftr) }}</td>
                <td class="num">
                  <span v-if="item.changePct != null" :class="{
                    'pct-positive': item.changePct > 0,
                    'pct-negative': item.changePct < 0
                  }">
                    {{ item.changePct > 0 ? '+' : '' }}{{ item.changePct }}%
                  </span>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
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
  margin-bottom: 1.25rem;
}

.muted {
  color: var(--color-text-muted);
}

.error {
  color: #c92a2a;
}

/* Summary stats */
.stats-section {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  flex: 1;
  min-width: 140px;
  padding: 1rem 1.25rem;
  background: rgba(30, 58, 95, 0.06);
  border: 1px solid rgba(30, 58, 95, 0.15);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text);
}

.stat-value.positive { color: #0d7d3d; }
.stat-value.negative { color: #c92a2a; }

.stat-sub {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

/* Chart */
.chart-section {
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.chart-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chart-wrap {
  width: 100%;
  max-width: 400px;
}

.chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.chart-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* Table */
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
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

.pct-positive { color: #0d7d3d; font-weight: 600; }
.pct-negative { color: #c92a2a; font-weight: 600; }
</style>
