import { headers } from './client'

export interface HubStatus {
  enabled: boolean
  baseUrl: string
  reachable: boolean
}

export const marketDataApi = {
  async testProvider(provider: string, key: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/market-data/test-provider', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, key }),
    })
    const body = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null
    if (!res.ok) return { ok: false, error: body?.error ?? `Connection test failed (HTTP ${res.status})` }
    return { ok: body?.ok === true, error: body?.error ?? (body?.ok === true ? undefined : 'Connection test returned no diagnostic.') }
  },

  async hubStatus(baseUrl?: string): Promise<HubStatus> {
    const qs = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : ''
    const res = await fetch(`/api/market-data/hub-status${qs}`, { headers })
    return res.json()
  },
}
