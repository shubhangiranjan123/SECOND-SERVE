import { useEffect, useState } from 'react'

// Tiny hash router: #/ is the story page, #/app/<role>/<tab> is the app.
export type Role = 'coordinator' | 'donor' | 'partner' | 'runner'
export type CoordTab = 'live' | 'food' | 'partners' | 'runners' | 'planning' | 'impact'

export type Route =
  | { page: 'story' }
  | { page: 'app'; role: Role; tab: CoordTab }

const ROLES: Role[] = ['coordinator', 'donor', 'partner', 'runner']
const TABS: CoordTab[] = ['live', 'food', 'partners', 'runners', 'planning', 'impact']

function parse(hash: string): Route {
  const [, page, role, tab] = hash.replace(/^#/, '').split('/')
  if (page !== 'app') return { page: 'story' }
  return {
    page: 'app',
    role: ROLES.includes(role as Role) ? (role as Role) : 'coordinator',
    tab: TABS.includes(tab as CoordTab) ? (tab as CoordTab) : 'live',
  }
}

export function href(role: Role, tab?: CoordTab) {
  return `#/app/${role}${tab ? `/${tab}` : ''}`
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))
  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}
