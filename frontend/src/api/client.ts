const BASE = import.meta.env.VITE_API_URL ?? ''

export interface SalaryRecord {
  id: string
  firstName: string
  lastName: string
  title: string
  department: string
  fiscalYear: string
  yearKey: number
  campus: string
  campusId?: number
  ftr: number
  gf: number
  periodFte?: string
  changeFromLastYearPct?: number
}

export interface YearOption {
  yearKey: number
  label: string
}

export interface CampusOption {
  id: number
  name: string
}

export interface NameSearchResponse {
  items: SalaryRecord[]
  totalCount: number
}

export interface PaginatedResponse {
  items: SalaryRecord[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
  aggregates: {
    count: number
    minSalary: number
    maxSalary: number
    avgSalary: number
  }
}

export interface PersonResponse {
  firstName: string
  lastName: string
  salaryHistory: SalaryRecord[]
}

export interface AnalyticsOverview {
  headcount: number
  totalPayroll: number
  meanFtr: number
  medianFtr: number
  minFtr: number
  maxFtr: number
}

export interface AnalyticsTopEarner {
  id: string
  firstName: string
  lastName: string
  title: string
  department: string
  ftr: number
}

export interface AnalyticsDepartment {
  name: string
  count: number
  totalFtr: number
  avgFtr: number
}

export interface AnalyticsYearPoint {
  yearKey: number
  label: string
  totalPayroll: number
  count: number
}

export interface AnalyticsHistogramBucket {
  bucket: number
  label: string
  count: number
}

export interface AnalyticsCampus {
  name: string
  count: number
  totalFtr: number
}

export interface AnalyticsSalaryBand {
  department: string
  band: string
  count: number
}

export interface AnalyticsConcentrationPoint {
  pctEmployees: number
  pctPayroll: number
}

export interface AnalyticsProfessorSalary {
  department: string
  profCount: number
  avgFtr: number
}

export interface AnalyticsResponse {
  yearKey: number
  overview: AnalyticsOverview
  topEarners: AnalyticsTopEarner[]
  departments: AnalyticsDepartment[]
  yearOverYear: AnalyticsYearPoint[]
  histogram?: AnalyticsHistogramBucket[]
  campus?: AnalyticsCampus[]
  salaryBands?: AnalyticsSalaryBand[]
  concentration?: AnalyticsConcentrationPoint[]
  professorSalaries?: AnalyticsProfessorSalary[]
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, BASE || window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== undefined) url.searchParams.set(k, String(v))
    })
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || res.statusText)
  }
  return res.json()
}

export const api = {
  getYears: () => get<YearOption[]>('/api/years'),
  getCampuses: () => get<CampusOption[]>('/api/campuses'),
  getDepartments: (year: number) => get<{ yearKey: number; departments: string[] }>('/api/departments', { year }),
  getTitles: (year: number) => get<{ yearKey: number; titles: string[] }>('/api/titles', { year }),
  searchByName: (lastName: string, firstName: string, year: number, campus: number) =>
    get<NameSearchResponse>('/api/search/name', { lastName, firstName, year, campus }),
  searchByTitle: (title: string, year: number, page: number, pageSize: number) =>
    get<PaginatedResponse>('/api/search/title', { title, year, page, pageSize }),
  searchByDepartment: (department: string, year: number, page: number, pageSize: number) =>
    get<PaginatedResponse>('/api/search/department', { department, year, page, pageSize }),
  getPerson: (lastName: string, firstName: string) =>
    get<PersonResponse>('/api/person', { lastName, firstName }),
  getAnalytics: (year?: number) =>
    get<AnalyticsResponse>('/api/analytics', year !== undefined ? { year } : {}),
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
