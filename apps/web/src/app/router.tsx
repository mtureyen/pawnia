import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { parseAnalysisSearch } from '@/features/analysis/search'
import { parseSettingsSearch } from '@/features/settings/search'
import { parseStatsSearch } from '@/features/stats/search'
import { parseNotationSearch } from '@/features/training/notation/search'
import { parseOpeningsSearch } from '@/features/training/openings/search'
import { PlayPage } from '@/features/play/PlayPage'
import { RootLayout } from './RootLayout'

const rootRoute = createRootRoute({ component: RootLayout })

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PlayPage,
})

const analysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analysis',
  validateSearch: parseAnalysisSearch,
  // Pages other than the start page load on first visit (route-based code splitting).
  component: lazyRouteComponent(() => import('@/features/analysis/AnalysisRoute'), 'AnalysisRoute'),
})

const botRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bot',
  component: lazyRouteComponent(() => import('@/features/play/BotPage'), 'BotPage'),
})

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/games',
  component: lazyRouteComponent(() => import('@/features/library/LibraryPage'), 'LibraryPage'),
})

const openRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/open',
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search.url === 'string' && search.url ? { url: search.url } : {},
  component: lazyRouteComponent(() => import('@/features/library/OpenGamePage'), 'OpenGamePage'),
})

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: lazyRouteComponent(() => import('@/features/profile/WelcomePage'), 'WelcomePage'),
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: lazyRouteComponent(() => import('@/features/profile/ProfilePage'), 'ProfilePage'),
})

const trainingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training',
  component: lazyRouteComponent(() => import('@/features/training/TrainingPage'), 'TrainingPage'),
})

const openingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training/openings',
  validateSearch: parseOpeningsSearch,
  component: lazyRouteComponent(
    () => import('@/features/training/openings/OpeningsPage'),
    'OpeningsPage',
  ),
})

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training/library',
  validateSearch: (search: Record<string, unknown>): { id?: string } =>
    typeof search.id === 'string' && /^[a-z0-9-]{1,40}$/.test(search.id) ? { id: search.id } : {},
  component: lazyRouteComponent(
    () => import('@/features/training/library/LibraryPage'),
    'LibraryPage',
  ),
})

const repertoireRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training/repertoire',
  component: lazyRouteComponent(
    () => import('@/features/training/repertoire/RepertoirePage'),
    'RepertoirePage',
  ),
})

const puzzlesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training/puzzles',
  component: lazyRouteComponent(
    () => import('@/features/training/puzzles/PuzzlesPage'),
    'PuzzlesPage',
  ),
})

const notationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training/notation',
  validateSearch: parseNotationSearch,
  component: lazyRouteComponent(
    () => import('@/features/training/notation/NotationPage'),
    'NotationPage',
  ),
})

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  validateSearch: parseStatsSearch,
  component: lazyRouteComponent(() => import('@/features/stats/StatsPage'), 'StatsPage'),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: parseSettingsSearch,
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
})

const routeTree = rootRoute.addChildren([
  playRoute,
  botRoute,
  analysisRoute,
  gamesRoute,
  openRoute,
  welcomeRoute,
  profileRoute,
  trainingRoute,
  openingsRoute,
  libraryRoute,
  repertoireRoute,
  puzzlesRoute,
  notationRoute,
  statsRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
