import { fetchJson } from './client'
export interface AliceInvestSnapshot { readiness: Record<string, string>; switches: Record<string, boolean>; executionEnabled: false }
export const aliceInvestApi = { load: () => fetchJson<AliceInvestSnapshot>('/api/alice-invest') }
