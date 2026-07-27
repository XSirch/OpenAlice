import { fetchJson, headers } from './client'

export interface PortfolioPresentationCache {
  version: 1
  refreshedAt: string
  data: unknown
  aggregateCurve: unknown | null
  curvePoints: unknown[]
  curveAccountId: string
}

export const portfolioCacheApi = {
  load: (): Promise<{ cache: PortfolioPresentationCache | null }> => fetchJson('/api/portfolio-cache'),
  save: (cache: PortfolioPresentationCache): Promise<{ cache: PortfolioPresentationCache }> =>
    fetchJson('/api/portfolio-cache', { method: 'PUT', headers, body: JSON.stringify(cache) }),
  clear: async (): Promise<void> => {
    const response = await fetch('/api/portfolio-cache', { method: 'DELETE' })
    if (!response.ok) throw new Error('Could not clear the Portfolio cache.')
  },
}
