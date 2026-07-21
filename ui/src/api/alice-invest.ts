import { fetchJson } from './client'
export interface AliceInvestEvidence { criterion: string; status: string; observedAt: string; source: string; details?: string }
export interface AliceInvestReadiness { capability: string; state: string; evaluatedAt: string; evidence: AliceInvestEvidence[]; blockers: string[] }
export interface AliceInvestSnapshot { readiness: AliceInvestReadiness[]; switches: Record<string, boolean>; executionEnabled: false }
export const aliceInvestApi = { load: () => fetchJson<AliceInvestSnapshot>('/api/alice-invest') }
