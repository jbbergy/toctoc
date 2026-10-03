import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Accueil' } },
    {
      path: '/historique',
      name: 'history',
      component: () => import('./views/HistoryView.vue'),
      meta: { title: 'Historique' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to) => {
  document.title = `${to.meta.title as string} · TocToc`
})

/** Nom de la route précédente, pour restaurer le focus après navigation. */
export let previousRoute: string | null = null
router.afterEach((_to, from) => {
  previousRoute = (from.name as string | undefined) ?? null
})
