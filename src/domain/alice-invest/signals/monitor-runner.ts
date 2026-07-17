import { createHash } from 'node:crypto'
import type { IInboxStore } from '../../../core/inbox-store.js'
import type { AliceInvestReadinessState } from '../config.js'
import { assessObservationFreshness } from '../market-data/observation.js'
import { SignalLedger, type SignalLedgerEvent } from './ledger.js'
import { MonitorDeliveryStore } from './monitor-delivery-store.js'
import { monitorSignal, monitorTransition, type MonitorInput, type MonitorResult } from './monitor.js'

export type MonitorCapability = 'b3_signals' | 'crypto_signals'
export interface MonitoredSignal {
  capability: MonitorCapability
  event: SignalLedgerEvent
  price?: string
  low?: string
  high?: string
  sourceTimestamp?: string
  workspaceId: string
}
export interface MonitorRunnerInput {
  now: Date
  enabled: boolean
  notificationsEnabled: boolean
  readiness: Record<MonitorCapability, AliceInvestReadinessState>
  b3MarketOpen: boolean
  maxAgeSeconds: number
  signals: MonitoredSignal[]
}
export interface MonitorRunnerOutcome { signalId: string; capability: MonitorCapability; action: MonitorResult['action']; reason?: string; delivered: boolean }

/**
 * One Guardian-supervised tick. It has no timer, network client, or agent loop:
 * callers decide cadence and retry it after a process restart. Stop wins when a
 * candle spans both boundaries, avoiding optimistic target attribution.
 */
export async function runSignalMonitorTick(input: MonitorRunnerInput, ledger: SignalLedger, inbox: IInboxStore, deliveries: MonitorDeliveryStore): Promise<MonitorRunnerOutcome[]> {
  if (!input.enabled) return []
  const outcomes: MonitorRunnerOutcome[] = []
  for (const signal of input.signals) {
    const marketOpen = signal.capability === 'crypto_signals' ? true : input.b3MarketOpen
    const price = choosePrice(signal)
    const fresh = signal.sourceTimestamp ? assessObservationFreshness({ source: 'monitor', symbol: signal.event.candidate.symbol, sourceTimestamp: signal.sourceTimestamp, receivedAt: input.now.toISOString(), capability: 'realtime' }, input.maxAgeSeconds, input.now).fresh : false
    const monitorInput: MonitorInput = { event: signal.event, now: input.now, price, capabilityReady: fresh, marketOpen }
    const result = ambiguousCandleResult(signal, monitorInput) ?? monitorSignal(monitorInput)
    const transition = monitorTransition(monitorInput, result)
    if (!transition) { outcomes.push({ signalId: signal.event.signalId, capability: signal.capability, action: result.action, reason: result.reason, delivered: false }); continue }
    await ledger.append(transition)
    const deliverable = input.notificationsEnabled && input.readiness[signal.capability] === 'paper_alerts' && !await deliveries.wasDelivered(transition.eventId)
    if (deliverable) { await inbox.append({ workspaceId: signal.workspaceId, comments: monitorMessage(signal.capability, transition) }); await deliveries.markDelivered(transition.eventId) }
    outcomes.push({ signalId: signal.event.signalId, capability: signal.capability, action: result.action, reason: result.reason, delivered: deliverable })
  }
  return outcomes
}

function choosePrice(signal: MonitoredSignal): string | undefined { return signal.price ?? signal.low ?? signal.high }
function ambiguousCandleResult(signal: MonitoredSignal, input: MonitorInput): MonitorResult | null {
  if (input.event.type !== 'created' || !signal.low || !signal.high) return null
  const low = Number(signal.low), high = Number(signal.high), stop = Number(input.event.candidate.stopPrice), target = Number(input.event.candidate.targetPrice)
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null
  if (low <= stop && high >= target) return { action: 'invalidated', reason: 'ambiguous candle crossed stop and target; stop-first policy applied' }
  return null
}
function monitorMessage(capability: MonitorCapability, event: SignalLedgerEvent): string {
  const correlation = createHash('sha256').update(event.eventId).digest('hex').slice(0, 12)
  return `Alice Invest ${capability}: ${event.type.replaceAll('_', ' ')} for ${event.candidate.symbol}. Correlation: ${correlation}.`
}
