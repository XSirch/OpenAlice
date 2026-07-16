import { assessObservationFreshness, type NormalizedMarketObservation } from './observation.js'

export interface B3SourceEvidence { observations: NormalizedMarketObservation[]; reconnectSucceeded: boolean; maxAgeSeconds: number; now: Date }
export interface B3SourceDecision { capability: 'realtime' | 'delayed' | 'eod' | 'research_only'; intradaySignalsAllowed: boolean; missing: string[] }
const REQUIRED = new Set(['PETR4', 'VALE3'])

/** Realtime is an evidence result, never a provider configuration claim. */
export function validateB3IntradaySource(evidence: B3SourceEvidence): B3SourceDecision {
  const missing: string[] = []
  for (const symbol of REQUIRED) {
    const observation = evidence.observations.find(item => item.symbol === symbol)
    if (!observation) { missing.push(`${symbol} observation`); continue }
    const freshness = assessObservationFreshness(observation, evidence.maxAgeSeconds, evidence.now)
    if (!freshness.fresh) missing.push(`${symbol} realtime freshness`)
    if (!observation.volume) missing.push(`${symbol} volume`)
  }
  if (!evidence.observations.some(item => /^(BOVA11|IBOV)$/i.test(item.symbol))) missing.push('index or ETF observation')
  if (!evidence.reconnectSucceeded) missing.push('reconnection evidence')
  if (missing.length === 0) return { capability: 'realtime', intradaySignalsAllowed: true, missing: [] }
  const reported = evidence.observations.some(item => item.capability === 'eod') ? 'eod' : evidence.observations.some(item => item.capability === 'delayed') ? 'delayed' : 'research_only'
  return { capability: reported, intradaySignalsAllowed: false, missing }
}
