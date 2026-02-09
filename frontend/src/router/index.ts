import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Search' } },
    { path: '/search/name', name: 'search-name', component: () => import('@/views/SearchNameView.vue'), meta: { title: 'Name search' } },
    { path: '/search/title', name: 'search-title', component: () => import('@/views/SearchTitleView.vue'), meta: { title: 'Title search' } },
    { path: '/search/department', name: 'search-department', component: () => import('@/views/SearchDepartmentView.vue'), meta: { title: 'Department search' } },
    { path: '/person', name: 'person', component: () => import('@/views/PersonView.vue'), meta: { title: 'Salary history' } },
    { path: '/departments', name: 'departments', component: () => import('@/views/DepartmentsListView.vue'), meta: { title: 'Departments' } },
    { path: '/titles', name: 'titles', component: () => import('@/views/TitlesListView.vue'), meta: { title: 'Titles' } },
    { path: '/analytics', name: 'analytics', component: () => import('@/views/AnalyticsView.vue'), meta: { title: 'Analytics' } },
  ],
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'UM Salary'
  document.title = `${title} – UM Salary`
})

export default router
