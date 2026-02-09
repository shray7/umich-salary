import { createRouter, createWebHistory } from 'vue-router'

const DEFAULT_DESCRIPTION = 'Search University of Michigan salary data by name, job title, or department. Public salary disclosures for UM employees.'

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Search', description: DEFAULT_DESCRIPTION } },
  { path: '/search/name', name: 'search-name', component: () => import('@/views/SearchNameView.vue'), meta: { title: 'Name search', description: 'Search UM employees by last name and first name. View salary and job details.' } },
  { path: '/search/title', name: 'search-title', component: () => import('@/views/SearchTitleView.vue'), meta: { title: 'Title search', description: 'Search UM salary data by job title. View employees and salary ranges by title.' } },
  { path: '/search/department', name: 'search-department', component: () => import('@/views/SearchDepartmentView.vue'), meta: { title: 'Department search', description: 'Browse UM salary data by department. View headcount, payroll, and employee list.' } },
  { path: '/person', name: 'person', component: () => import('@/views/PersonView.vue'), meta: { title: 'Salary history', description: 'View salary history and career earnings for a UM employee.' } },
  { path: '/departments', name: 'departments', component: () => import('@/views/DepartmentsListView.vue'), meta: { title: 'Departments', description: 'Browse all University of Michigan departments. Select a department to view salary data.' } },
  { path: '/titles', name: 'titles', component: () => import('@/views/TitlesListView.vue'), meta: { title: 'Titles', description: 'Browse all job titles at the University of Michigan. Select a title to view salary data.' } },
  { path: '/analytics', name: 'analytics', component: () => import('@/views/AnalyticsView.vue'), meta: { title: 'Analytics', description: 'University-wide salary analytics: headcount, payroll distribution, top earners, and department breakdowns.' } },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

function setMetaTag(attr: 'name' | 'property', key: string, value: string) {
  const selector = attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`
  let el = document.querySelector(selector) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = value
}

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'UM Salary'
  const description = (to.meta.description as string) || DEFAULT_DESCRIPTION
  const fullTitle = `${title} – UM Salary`

  document.title = fullTitle
  setMetaTag('name', 'description', description)
  setMetaTag('property', 'og:title', fullTitle)
  setMetaTag('property', 'og:description', description)
  setMetaTag('property', 'og:url', window.location.href)
  setMetaTag('name', 'twitter:title', fullTitle)
  setMetaTag('name', 'twitter:description', description)
})

/** Preload the Analytics route chunk (and its dependencies) so navigation is faster. */
export function preloadAnalyticsRoute(): void {
  const r = router.getRoutes().find((rr) => rr.name === 'analytics')
  const comp = r?.components?.default
  if (typeof comp === 'function') (comp as () => Promise<unknown>)()
}

export default router
