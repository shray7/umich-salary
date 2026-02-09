<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Chart, registerables } from 'chart.js'
import AppLayout from '@/components/AppLayout.vue'
import {
  api,
  formatCurrency,
  type AnalyticsResponse,
  type AnalyticsTopEarner,
  type YearOption,
} from '@/api/client'

Chart.register(...registerables)

const CHART_COLORS_LIGHT = {
  bar: 'rgba(15, 39, 68, 0.9)',
  barFill: 'rgba(30, 58, 95, 0.6)',
  border: 'rgba(30, 58, 95, 0.2)',
  line: 'rgba(30, 58, 95, 0.9)',
  lineFill: 'rgba(30, 58, 95, 0.1)',
  secondary: 'rgba(91, 141, 201, 0.9)',
  secondaryFill: 'rgba(91, 141, 201, 0.5)',
}
const CHART_COLORS_DARK = {
  bar: 'rgba(91, 141, 201, 0.95)',
  barFill: 'rgba(91, 141, 201, 0.5)',
  border: 'rgba(148, 163, 184, 0.4)',
  line: 'rgba(123, 163, 212, 0.95)',
  lineFill: 'rgba(91, 141, 201, 0.15)',
  secondary: 'rgba(148, 163, 184, 0.9)',
  secondaryFill: 'rgba(148, 163, 184, 0.4)',
}

function isDarkMode(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

function chartScaleDefaults() {
  const dark = isDarkMode()
  const tickColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? 'rgba(248, 250, 252, 0.08)' : 'rgba(15, 39, 68, 0.08)'
  const titleColor = dark ? '#cbd5e1' : '#475569'
  return { tickColor, gridColor, titleColor }
}

const router = useRouter()
const years = ref<YearOption[]>([])
const selectedYear = ref(0)
const loading = ref(true)
const refetching = ref(false)
const error = ref('')
const data = ref<AnalyticsResponse | null>(null)

const chartRefs = { histogram: null as Chart | null, topEarners: null as Chart | null, deptPie: null as Chart | null, campus: null as Chart | null, concentration: null as Chart | null, professorSalaries: null as Chart | null }
const isDark = ref(false)

async function loadYears() {
  years.value = await api.getYears()
  if (years.value.length && selectedYear.value === 0 && !years.value.some((y) => y.yearKey === 0)) {
    selectedYear.value = years.value[0].yearKey
  }
}

async function load() {
  const isInitialLoad = !data.value
  if (isInitialLoad) {
    loading.value = true
  } else {
    refetching.value = true
  }
  error.value = ''
  try {
    data.value = await api.getAnalytics(selectedYear.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load analytics'
    data.value = null
  } finally {
    loading.value = false
    refetching.value = false
  }
}

function goPerson(r: AnalyticsTopEarner) {
  router.push({ name: 'person', query: { lastName: r.lastName, firstName: r.firstName } })
}

function goDepartment(name: string) {
  router.push({ name: 'search-department', query: { department: name, year: selectedYear.value } })
}

function buildCharts() {
  const d = data.value
  if (!d) return

  const dark = isDarkMode()
  const colors = dark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
  const scale = chartScaleDefaults()

  chartRefs.histogram?.destroy()
  chartRefs.topEarners?.destroy()
  chartRefs.deptPie?.destroy()
  chartRefs.campus?.destroy()
  chartRefs.concentration?.destroy()
  chartRefs.professorSalaries?.destroy()

  const scaleOptions = {
    x: { ticks: { color: scale.tickColor }, grid: { color: scale.gridColor } },
    y: { ticks: { color: scale.tickColor }, grid: { color: scale.gridColor }, beginAtZero: true as const },
  }

  if (d.histogram?.length) {
    const ctx = (document.getElementById('chart-histogram') as HTMLCanvasElement)?.getContext('2d')
    if (ctx)
      chartRefs.histogram = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: d.histogram.map((h) => h.label),
          datasets: [{ label: 'Count', data: d.histogram.map((h) => h.count), backgroundColor: colors.barFill, borderColor: colors.bar, borderWidth: 1 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: scaleOptions.x, y: scaleOptions.y } },
      })
  }

  if (d.topEarners?.length) {
    const ctx = (document.getElementById('chart-top-earners') as HTMLCanvasElement)?.getContext('2d')
    if (ctx)
      chartRefs.topEarners = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: d.topEarners.map((r) => `${r.lastName}, ${r.firstName}`),
          datasets: [{ label: 'FTR', data: d.topEarners.map((r) => r.ftr), backgroundColor: colors.barFill, borderColor: colors.bar, borderWidth: 1 }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false, labels: { color: scale.tickColor } } },
          scales: {
            x: { ...scaleOptions.x, beginAtZero: true, ticks: { ...scaleOptions.x.ticks, callback: (v: unknown) => '$' + (Number(v) / 1e6).toFixed(1) + 'M' } },
            y: { ...scaleOptions.y, ticks: { color: scale.tickColor }, grid: { drawOnChartArea: false } },
          },
        },
      })
  }

  if (d.departments?.length) {
    const ctx = (document.getElementById('chart-dept-pie') as HTMLCanvasElement)?.getContext('2d')
    if (ctx) {
      const pieColors = dark
        ? d.departments.map((_, i) => `hsla(215, 50%, ${55 + i * 2}%, 0.9)`)
        : d.departments.map((_, i) => `hsl(215, 60%, ${45 - i * 2}%)`)
      chartRefs.deptPie = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: d.departments.map((x) => x.name),
          datasets: [{ data: d.departments.map((x) => x.totalFtr), backgroundColor: pieColors, borderColor: dark ? 'rgba(30, 58, 95, 0.4)' : 'rgba(255,255,255,0.6)', borderWidth: 1 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: scale.tickColor } } } },
      })
    }
  }

  if (d.campus?.length) {
    const ctx = (document.getElementById('chart-campus') as HTMLCanvasElement)?.getContext('2d')
    if (ctx)
      chartRefs.campus = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: d.campus.map((c) => c.name.replace('UM_', '')),
          datasets: [
            { label: 'Headcount', data: d.campus.map((c) => c.count), backgroundColor: colors.barFill, borderColor: colors.bar, borderWidth: 1, yAxisID: 'y' },
            { label: 'Payroll ($M)', data: d.campus.map((c) => c.totalFtr / 1e6), backgroundColor: colors.secondaryFill, borderColor: colors.secondary, borderWidth: 1, yAxisID: 'y1' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: scale.tickColor } } },
          scales: {
            x: scaleOptions.x,
            y: { ...scaleOptions.y, type: 'linear', position: 'left' },
            y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: scale.tickColor, callback: (v: unknown) => '$' + v + 'M' } },
          },
        },
      })
  }

  if (d.concentration?.length) {
    const ctx = (document.getElementById('chart-concentration') as HTMLCanvasElement)?.getContext('2d')
    if (ctx)
      chartRefs.concentration = new Chart(ctx, {
        type: 'line',
        data: {
          labels: d.concentration.map((c) => c.pctEmployees + '%'),
          datasets: [{ label: 'Cumulative payroll %', data: d.concentration.map((c) => c.pctPayroll), borderColor: colors.line, backgroundColor: colors.lineFill, fill: true, tension: 0.3 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ...scaleOptions.x, title: { display: true, text: '% of employees (low to high salary)', color: scale.titleColor } },
            y: { ...scaleOptions.y, min: 0, max: 100, ticks: { ...scaleOptions.y.ticks, callback: (v: unknown) => v + '%' } },
          },
        },
      })
  }

  if (d.professorSalaries?.length) {
    const ctx = (document.getElementById('chart-professor-salaries') as HTMLCanvasElement)?.getContext('2d')
    if (ctx)
      chartRefs.professorSalaries = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: d.professorSalaries.map((p) => p.department),
          datasets: [{ label: 'Avg professor salary', data: d.professorSalaries.map((p) => p.avgFtr), backgroundColor: colors.barFill, borderColor: colors.bar, borderWidth: 1 }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ...scaleOptions.x, beginAtZero: true, ticks: { ...scaleOptions.x.ticks, callback: (v: unknown) => '$' + (Number(v) / 1000).toFixed(0) + 'k' } },
            y: { ...scaleOptions.y, grid: { drawOnChartArea: false } },
          },
        },
      })
  }
}

const BANDS = ['0-50k', '50-100k', '100-150k', '150-200k', '200-250k', '250-300k', '300k+']
const inequalityMetric = computed(() => {
  const conc = data.value?.concentration
  if (!conc?.length) return null
  const at90 = conc.find((c) => Math.abs(c.pctEmployees - 90) < 6) ?? conc[conc.length - 2]
  if (!at90) return null
  const top10Share = Math.round(100 - at90.pctPayroll)
  return { top10Share }
})

const heatmapData = computed(() => {
  const d = data.value
  if (!d?.salaryBands?.length) return { depts: [] as string[], bands: BANDS, matrix: [] as number[][], maxCount: 1 }
  const deptSet = new Set(d.salaryBands.map((s) => s.department))
  const depts = [...deptSet].slice(0, 15)
  const matrix: number[][] = depts.map((dept) => BANDS.map((b) => d.salaryBands!.find((s) => s.department === dept && s.band === b)?.count ?? 0))
  const maxCount = Math.max(...matrix.flat(), 1)
  return { depts, bands: BANDS, matrix, maxCount }
})

function onThemeChange() {
  isDark.value = isDarkMode()
  if (data.value) setTimeout(buildCharts, 50)
}

onMounted(async () => {
  isDark.value = isDarkMode()
  await loadYears()
  load()
  window.addEventListener('theme-change', onThemeChange)
})

watch(selectedYear, () => {
  load()
})

watch(
  () => data.value,
  () => {
    setTimeout(buildCharts, 50)
  },
  { deep: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('theme-change', onThemeChange)
  Object.values(chartRefs).forEach((c) => c?.destroy())
})
</script>

<template>
  <AppLayout>
    <div class="view">
      <div class="header-row">
        <div>
          <h1 class="page-title">Analytics</h1>
          <p class="subtitle">University-wide salary snapshot.</p>
        </div>
        <div class="year-select-wrap">
          <label for="analytics-year">Year</label>
          <div class="year-select-row">
            <select id="analytics-year" v-model.number="selectedYear" :disabled="refetching">
              <option v-for="y in years" :key="y.yearKey" :value="y.yearKey">{{ y.label }}</option>
            </select>
            <span v-if="refetching" class="year-refresh-spinner" aria-hidden="true"></span>
          </div>
        </div>
      </div>

      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <template v-else-if="data">
        <div class="analytics-content" :class="{ 'is-refetching': refetching }">
        <section class="section">
          <h2 class="section-title">Overview</h2>
          <div class="cards">
            <div class="card">
              <span class="card-label">Headcount</span>
              <span class="card-value">{{ data.overview.headcount.toLocaleString() }}</span>
            </div>
            <div class="card">
              <span class="card-label">Total payroll</span>
              <span class="card-value">{{ formatCurrency(data.overview.totalPayroll) }}</span>
            </div>
            <div class="card">
              <span class="card-label">Mean salary</span>
              <span class="card-value">{{ formatCurrency(data.overview.meanFtr) }}</span>
            </div>
            <div class="card">
              <span class="card-label">Median salary</span>
              <span class="card-value">{{ formatCurrency(data.overview.medianFtr) }}</span>
            </div>
            <div class="card">
              <span class="card-label">Min</span>
              <span class="card-value">{{ formatCurrency(data.overview.minFtr) }}</span>
            </div>
            <div class="card">
              <span class="card-label">Max</span>
              <span class="card-value">{{ formatCurrency(data.overview.maxFtr) }}</span>
            </div>
          </div>
        </section>

        <section v-if="inequalityMetric" class="inequality-card-wrap">
          <div class="inequality-card">
            <span class="inequality-label">Payroll concentration</span>
            <span class="inequality-value">Top 10% of earners receive <strong>{{ inequalityMetric.top10Share }}%</strong> of total payroll</span>
            <span class="inequality-desc">Higher values indicate greater salary inequality.</span>
          </div>
        </section>

        <div class="charts-grid">
          <section v-if="data.histogram?.length" class="section chart-section">
            <h2 class="section-title">Salary distribution</h2>
            <div class="chart-container">
              <canvas id="chart-histogram"></canvas>
            </div>
          </section>
          <section v-if="data.topEarners?.length" class="section chart-section">
            <h2 class="section-title">Top 10 earners</h2>
            <div class="chart-container chart-tall">
              <canvas id="chart-top-earners"></canvas>
            </div>
          </section>
          <section v-if="data.departments?.length" class="section chart-section">
            <h2 class="section-title">Department payroll</h2>
            <div class="chart-container chart-square">
              <canvas id="chart-dept-pie"></canvas>
            </div>
          </section>
          <section v-if="data.campus?.length" class="section chart-section">
            <h2 class="section-title">Campus comparison</h2>
            <div class="chart-container">
              <canvas id="chart-campus"></canvas>
            </div>
          </section>
          <section v-if="data.concentration?.length" class="section chart-section">
            <h2 class="section-title">Payroll concentration</h2>
            <p class="chart-desc">Cumulative % of total payroll earned by lowest-paid X% of employees.</p>
            <div class="chart-container">
              <canvas id="chart-concentration"></canvas>
            </div>
          </section>
          <section v-if="data.professorSalaries?.length" class="section chart-section">
            <h2 class="section-title">Professor salaries by department</h2>
            <p class="chart-desc">Avg salary for professors in top departments (by total payroll).</p>
            <div class="chart-container chart-tall">
              <canvas id="chart-professor-salaries"></canvas>
            </div>
          </section>
        </div>

        <section v-if="data.salaryBands?.length" class="section heatmap-section">
          <h2 class="section-title">Salary bands by department</h2>
          <p class="heatmap-desc">Number of employees in each salary band by department (top 15). Darker cells = more employees.</p>
          <div class="heatmap-card">
            <div class="heatmap-wrap">
              <table class="heatmap">
                <thead>
                  <tr>
                    <th class="heatmap-dept-header">Department</th>
                    <th v-for="b in heatmapData.bands" :key="b" class="heatmap-band-header">{{ b }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in heatmapData.matrix" :key="heatmapData.depts[i]">
                    <th class="heatmap-dept-cell">
                      <button type="button" class="heatmap-dept-link" @click="goDepartment(heatmapData.depts[i])">
                        {{ heatmapData.depts[i] }}
                      </button>
                    </th>
                    <td
                      v-for="(count, j) in row"
                      :key="j"
                      class="heatmap-cell"
                      :class="{ 'heatmap-cell-empty': !count }"
                      :style="count ? { backgroundColor: isDark ? `rgba(91, 141, 201, ${0.2 + (count / heatmapData.maxCount) * 0.6})` : `rgba(30, 58, 95, ${0.15 + (count / heatmapData.maxCount) * 0.75})`, color: (isDark || count / heatmapData.maxCount > 0.5) ? '#f8fafc' : 'inherit' } : undefined"
                    >
                      {{ count || '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section v-if="data.topEarners.length" class="section">
          <h2 class="section-title">Top 10 earners (table)</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Department</th>
                  <th class="num">FTR</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in data.topEarners" :key="r.id">
                  <td>
                    <button type="button" class="link-btn" @click="goPerson(r)">
                      {{ r.lastName }}, {{ r.firstName }}
                    </button>
                  </td>
                  <td>{{ r.title }}</td>
                  <td>{{ r.department }}</td>
                  <td class="num">{{ formatCurrency(r.ftr) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="data.departments.length" class="section">
          <h2 class="section-title">Departments (top 20 by payroll)</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th class="num">Headcount</th>
                  <th class="num">Total payroll</th>
                  <th class="num">Avg salary</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in data.departments" :key="d.name">
                  <td>
                    <button type="button" class="link-btn" @click="goDepartment(d.name)">
                      {{ d.name }}
                    </button>
                  </td>
                  <td class="num">{{ d.count.toLocaleString() }}</td>
                  <td class="num">{{ formatCurrency(d.totalFtr) }}</td>
                  <td class="num">{{ formatCurrency(d.avgFtr) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="data.yearOverYear.length" class="section">
          <h2 class="section-title">Year-over-year</h2>
          <div class="yoy-list">
            <div
              v-for="y in data.yearOverYear"
              :key="y.yearKey"
              class="yoy-row"
            >
              <span class="yoy-label">{{ y.label }}</span>
              <span class="yoy-count">{{ y.count.toLocaleString() }} people</span>
              <span class="yoy-payroll">{{ formatCurrency(y.totalPayroll) }}</span>
            </div>
          </div>
        </section>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<style scoped>
.view {
  width: 100%;
}

.header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.page-title {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: var(--color-text-muted);
  font-size: 0.95rem;
  margin-bottom: 0;
}

.year-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.year-select-wrap label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
}

.year-select-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.year-select-wrap select {
  padding: 0.5rem 0.9rem;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 500;
  min-width: 140px;
}

.year-select-wrap select:disabled {
  opacity: 0.8;
  cursor: wait;
}

.year-refresh-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: year-spin 0.7s linear infinite;
}

@keyframes year-spin {
  to {
    transform: rotate(360deg);
  }
}

.analytics-content.is-refetching {
  opacity: 0.92;
  transition: opacity 0.2s ease;
}

.muted {
  color: var(--color-text-muted);
}

.error {
  color: #c92a2a;
}

.section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--color-text);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.75rem;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.card-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.card-value {
  font-weight: 600;
  font-size: clamp(0.8125rem, 1.8vw, 1rem);
  letter-spacing: -0.02em;
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.inequality-card-wrap {
  margin-bottom: 2rem;
}

.inequality-card {
  background: linear-gradient(135deg, rgba(30, 58, 95, 0.08) 0%, rgba(30, 58, 95, 0.04) 100%);
  border: 1px solid rgba(30, 58, 95, 0.2);
  border-radius: var(--radius-lg);
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease;
}

.inequality-card:hover {
  box-shadow: var(--shadow-md);
}

.inequality-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.inequality-value {
  font-size: 1.25rem;
  color: var(--color-text);
  line-height: 1.5;
}

.inequality-value strong {
  color: var(--color-accent);
  font-weight: 700;
}

.inequality-desc {
  font-size: 0.85rem;
  color: var(--color-text-muted);
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

.yoy-list {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.yoy-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  align-items: center;
}

.yoy-row:last-child {
  border-bottom: none;
}

.yoy-label {
  font-weight: 500;
}

.yoy-count {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.yoy-payroll {
  font-weight: 500;
  text-align: right;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, auto);
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.chart-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1.25rem;
  box-shadow: var(--shadow-sm);
}

.chart-container {
  height: 240px;
  position: relative;
}

.chart-container.chart-tall {
  height: 320px;
}

.chart-container.chart-square {
  height: 280px;
  max-width: 360px;
}

.chart-desc {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.heatmap-section {
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.heatmap-desc {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.heatmap-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.heatmap-wrap {
  overflow-x: auto;
}

.heatmap {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.heatmap th,
.heatmap td {
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
}

.heatmap-dept-header {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  background: var(--color-bg);
  min-width: 140px;
  text-align: left;
  position: sticky;
  left: 0;
  z-index: 1;
}

.heatmap-band-header {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
  background: var(--color-bg);
  text-align: center;
  min-width: 80px;
}

.heatmap-dept-cell {
  font-weight: 500;
  background: var(--color-surface);
  text-align: left;
  position: sticky;
  left: 0;
  z-index: 1;
}

.heatmap-dept-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--color-link);
  cursor: pointer;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  text-align: left;
}

.heatmap-dept-link:hover {
  text-decoration: underline;
}

.heatmap-cell {
  text-align: center;
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.heatmap-cell:hover {
  opacity: 0.9;
}

.heatmap-cell-empty {
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-weight: 400;
}
</style>
