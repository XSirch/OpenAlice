import { fetchJson, headers } from './client'

export interface OpenFinanceConfig {
  pluggy: { enabled: boolean; configured: boolean; itemIds: string[] }
}

export interface CustodyPosition {
  id: string
  name: string
  code?: string
  type?: string
  quantity?: number
  value?: number
  grossAmount?: number
  unitValue?: number
  currency: string
  institution?: string
  asOf?: string
}

export interface CustodySnapshot {
  provider: 'pluggy'
  positions: CustodyPosition[]
  fetchedAt: string
}

export const openFinanceApi = {
  load: (): Promise<OpenFinanceConfig> => fetchJson('/api/open-finance'),
  save: (input: { enabled: boolean; clientId?: string; clientSecret?: string; itemIds?: string[] }): Promise<OpenFinanceConfig> =>
    fetchJson('/api/open-finance', { method: 'PUT', headers, body: JSON.stringify(input) }),
  custody: (): Promise<CustodySnapshot> => fetchJson('/api/open-finance/custody'),
  test: (): Promise<{ ok: boolean; positions: number }> => fetchJson('/api/open-finance/test', { method: 'POST' }),
}
