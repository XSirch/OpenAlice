import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'

import type { IInboxStore } from '../../../core/inbox-store.js'
import { readFixedIncomeAdvisorPolicy } from '../../../core/fixed-income-advisor-policy.js'
import { dataPath } from '../../../core/paths.js'
import {
  FixedIncomeCircuitBreaker,
  FixedIncomeOperationsStore,
  fixedIncomeOperationalAlertSchema,
  formatFixedIncomeTelegramDigest,
  planFixedIncomeAlertDelivery,
} from './operations.js'

const monitorInputSchema = z.object({
  version: z.literal(1),
  workspaceId: z.string().trim().min(1).max(128),
  alerts: z.array(fixedIncomeOperationalAlertSchema).max(500),
}).strict()

export type FixedIncomeMonitorInput = z.output<typeof monitorInputSchema>

/** Private, bounded hand-off from deterministic portfolio/credit producers. */
export class FixedIncomeMonitorInputStore {
  constructor(private readonly path = dataPath('state', 'fixed-income-monitor-input.json')) {}
  async read(): Promise<FixedIncomeMonitorInput | null> {
    try { return monitorInputSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
}

export interface FixedIncomeMonitorOptions {
  input?: Pick<FixedIncomeMonitorInputStore, 'read'>
  operations?: Pick<FixedIncomeOperationsStore, 'read' | 'recordDelivery' | 'appendAudit'>
  inbox: Pick<IInboxStore, 'append'>
  readPolicy?: typeof readFixedIncomeAdvisorPolicy
  breaker?: FixedIncomeCircuitBreaker
  intervalMs?: number
  now?: () => Date
}

export interface FixedIncomeMonitorTick {
  candidates: number
  planned: number
  delivered: number
  skipped: boolean
  reason?: 'monitor_disabled' | 'circuit_open' | 'no_input' | 'notifications_disabled' | 'overlapping_tick'
}

/** Guardian-owned research-only delivery loop. It reads only deterministic
 * alerts, applies durable cooldown/dedupe state, then appends one Inbox digest.
 * Connector projection may deliver that Inbox entry to Telegram; this service
 * has no broker, order, provider-refresh, or external-network capability. */
export class FixedIncomeMonitorService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private readonly input: Pick<FixedIncomeMonitorInputStore, 'read'>
  private readonly operations: Pick<FixedIncomeOperationsStore, 'read' | 'recordDelivery' | 'appendAudit'>
  private readonly inbox: Pick<IInboxStore, 'append'>
  private readonly readPolicy: typeof readFixedIncomeAdvisorPolicy
  private readonly breaker: FixedIncomeCircuitBreaker
  private readonly intervalMs: number
  private readonly now: () => Date

  constructor(options: FixedIncomeMonitorOptions) {
    this.input = options.input ?? new FixedIncomeMonitorInputStore()
    this.operations = options.operations ?? new FixedIncomeOperationsStore(dataPath('state', 'alice-invest-fixed-income-operations.json'))
    this.inbox = options.inbox
    this.readPolicy = options.readPolicy ?? readFixedIncomeAdvisorPolicy
    this.breaker = options.breaker ?? new FixedIncomeCircuitBreaker({ failureThreshold: 3, openDurationMs: 15 * 60_000 })
    this.intervalMs = options.intervalMs ?? 5 * 60_000
    this.now = options.now ?? (() => new Date())
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick().catch((error) => console.warn('fixed-income monitor tick failed', error)), this.intervalMs)
    this.timer.unref()
    void this.tick().catch((error) => console.warn('fixed-income monitor initial tick failed', error))
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }
  health(at = this.now()) { return this.breaker.health(at) }

  async tick(): Promise<FixedIncomeMonitorTick> {
    if (this.running) return { candidates: 0, planned: 0, delivered: 0, skipped: true, reason: 'overlapping_tick' }
    this.running = true
    const now = this.now()
    const at = now.toISOString()
    try {
      const policy = await this.readPolicy()
      if (!policy.enabled || (!policy.killSwitches.opportunityScanEnabled && !policy.killSwitches.creditMonitorEnabled)) {
        return { candidates: 0, planned: 0, delivered: 0, skipped: true, reason: 'monitor_disabled' }
      }
      if (!this.breaker.health(now).allowed) return { candidates: 0, planned: 0, delivered: 0, skipped: true, reason: 'circuit_open' }
      const input = await this.input.read()
      if (!input) { this.breaker.recordSuccess(); return { candidates: 0, planned: 0, delivered: 0, skipped: true, reason: 'no_input' } }
      const operational = await this.operations.read()
      const priorDeliveries = operational.deliveries.map(({ dedupeKey, deliveredAt, netDeltaBRL }) => ({ dedupeKey, deliveredAt, netDeltaBRL }))
      const planned = planFixedIncomeAlertDelivery(input.alerts, priorDeliveries, {
        now: at,
        cooldownDays: policy.recommendationThresholds.cooldownDays,
        materialDeltaBRL: policy.recommendationThresholds.minimumBenefitBRL,
      })
      await this.operations.appendAudit({ id: auditId('scan', at, input.alerts.map((alert) => alert.id)), at, kind: 'scan', detail: `fixed-income monitor evaluated ${input.alerts.length} alerts and planned ${planned.length}` })
      this.breaker.recordSuccess()
      if (!policy.killSwitches.notificationsEnabled) return { candidates: input.alerts.length, planned: planned.length, delivered: 0, skipped: true, reason: 'notifications_disabled' }
      if (planned.length === 0) return { candidates: input.alerts.length, planned: 0, delivered: 0, skipped: false }
      await this.inbox.append({ workspaceId: input.workspaceId, comments: formatFixedIncomeTelegramDigest(planned, at) })
      let delivered = 0
      for (const alert of planned) {
        const recorded = await this.operations.recordDelivery({ eventId: deliveryId(alert.id, alert.dedupeKey, alert.createdAt), dedupeKey: alert.dedupeKey, deliveredAt: at, netDeltaBRL: alert.netDeltaBRL, channel: 'inbox' })
        if (recorded) delivered += 1
      }
      await this.operations.appendAudit({ id: auditId('delivery', at, planned.map((alert) => alert.id)), at, kind: 'delivery', detail: `fixed-income Inbox digest recorded ${delivered} durable alert receipts` })
      return { candidates: input.alerts.length, planned: planned.length, delivered, skipped: false }
    } catch (error) {
      this.breaker.recordFailure(now)
      await this.operations.appendAudit({ id: auditId('failure', at, []), at, kind: this.breaker.health(now).state === 'open' ? 'circuit_open' : 'provider_failure', detail: 'fixed-income monitor failed closed before completing delivery' }).catch(() => undefined)
      throw error
    } finally { this.running = false }
  }
}

function deliveryId(id: string, dedupeKey: string, createdAt: string): string {
  return `fi:${createHash('sha256').update(`${id}:${dedupeKey}:${createdAt}`).digest('hex').slice(0, 48)}`
}
function auditId(kind: string, at: string, ids: string[]): string {
  return `fi-monitor:${kind}:${createHash('sha256').update(`${at.slice(0, 16)}:${ids.sort().join(',')}`).digest('hex').slice(0, 40)}`
}
