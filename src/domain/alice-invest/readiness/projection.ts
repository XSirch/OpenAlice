import type { ReadinessEvidence, ReadinessCapability } from './evidence-store.js'

export type DerivedReadiness = 'not_ready' | 'research_only' | 'paper_alerts'
export interface CapabilityReadinessProjection { capability: ReadinessCapability; state: DerivedReadiness; evaluatedAt: string; evidence: ReadinessEvidence[]; blockers: string[] }

const criteria: Record<ReadinessCapability, readonly string[]> = {
  global: ['valid_config', 'execution_disabled', 'persistence', 'connector_recovery', 'inbox', 'ci', 'health', 'owner_binding'],
  fixed_income: ['calculations', 'decimal_precision', 'limitations_documented', 'no_automatic_recommendation', 'no_real_price_claim'],
  b3_signals: ['real_source', 'freshness', 'reconnect', 'strategy', 'risk_validator', 'backtest', 'shadow_temporal', 'ledger', 'formatter', 'monitor', 'paper_alert_e2e'],
  crypto_signals: ['real_source', 'freshness', 'reconnect', 'strategy', 'risk_validator', 'backtest', 'shadow_temporal', 'ledger', 'formatter', 'monitor', 'paper_alert_e2e'],
}

/** Derive only from persisted evidence. Missing evidence is a blocker; neither
 * config nor fixtures can make a capability ready. */
export function projectCapabilityReadiness(capability: ReadinessCapability, evidence: ReadinessEvidence[], now = new Date()): CapabilityReadinessProjection {
  const current = evidence.filter((item) => item.capability === capability)
  const latest = new Map<string, ReadinessEvidence>()
  for (const item of current) {
    const previous = latest.get(item.criterion)
    if (!previous || item.observedAt > previous.observedAt) latest.set(item.criterion, item)
  }
  const blockers: string[] = []
  for (const criterion of criteria[capability]) {
    const item = latest.get(criterion)
    if (!item) blockers.push(`${criterion}: evidence not recorded`)
    else if (item.expiresAt && Date.parse(item.expiresAt) <= now.getTime()) blockers.push(`${criterion}: evidence expired`)
    else if (item.status !== 'passed') blockers.push(`${criterion}: ${item.status}`)
  }
  const state: DerivedReadiness = blockers.length > 0
    ? capability === 'global' ? 'not_ready' : 'research_only'
    : 'paper_alerts'
  return { capability, state, evaluatedAt: now.toISOString(), evidence: [...latest.values()], blockers }
}

export function projectAllReadiness(evidence: ReadinessEvidence[], now = new Date()): CapabilityReadinessProjection[] {
  return (Object.keys(criteria) as ReadinessCapability[]).map((capability) => projectCapabilityReadiness(capability, evidence, now))
}
