import { assessObservationFreshness, type NormalizedMarketObservation } from './observation.js'

export interface CryptoSourceEvidence { observations: NormalizedMarketObservation[]; reconnectSucceeded: boolean; maxAgeSeconds: number; now: Date; spotReadOnly: boolean; withdrawalsEnabled: boolean; marginEnabled: boolean; futuresEnabled: boolean; leverageEnabled: boolean }
export interface CryptoSourceDecision { capability: 'realtime' | 'delayed' | 'eod' | 'research_only'; spotReadOnly: boolean; signalsAllowed: boolean; missing: string[] }
const REQUIRED = new Set(['BTC/USDT', 'ETH/USDT'])

export function validateCryptoReadOnlySource(evidence: CryptoSourceEvidence): CryptoSourceDecision {
  const missing: string[] = []
  if (!evidence.spotReadOnly || evidence.withdrawalsEnabled || evidence.marginEnabled || evidence.futuresEnabled || evidence.leverageEnabled) missing.push('spot read-only capability')
  for (const symbol of REQUIRED) {
    const observation = evidence.observations.find(item => item.symbol === symbol)
    if (!observation) { missing.push(`${symbol} observation`); continue }
    if (!assessObservationFreshness(observation, evidence.maxAgeSeconds, evidence.now).fresh) missing.push(`${symbol} realtime freshness`)
  }
  if (!evidence.reconnectSucceeded) missing.push('reconnection evidence')
  if (missing.length === 0) return { capability: 'realtime', spotReadOnly: true, signalsAllowed: true, missing: [] }
  const capability = evidence.observations.some(item => item.capability === 'eod') ? 'eod' : evidence.observations.some(item => item.capability === 'delayed') ? 'delayed' : 'research_only'
  return { capability, spotReadOnly: false, signalsAllowed: false, missing }
}
