import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import Decimal from 'decimal.js'
import { z } from 'zod'

const iso = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
export const fixedIncomeOperationalAlertSchema = z.object({
  id: z.string().trim().min(1).max(128), createdAt: iso, expiresAt: iso, dedupeKey: z.string().trim().min(1).max(512),
  severity: z.enum(['info', 'opportunity', 'warning', 'critical']), title: z.string().trim().min(1).max(160), summary: z.string().trim().min(1).max(1_000),
  decision: z.enum(['maintain', 'watch', 'sell_partial', 'sell_and_reinvest', 'allocate_new_cash', 'review_credit', 'avoid', 'insufficient_data']),
  netDeltaBRL: decimal, confidenceScore: decimal, dataQualityScore: decimal, critical: z.boolean(), sourceLabels: z.array(z.string().trim().min(1).max(160)).max(16),
  readiness: z.literal('research_only'), actionable: z.literal(false),
}).strict()
const deliverySchema = z.object({
  eventId: z.string().trim().min(1).max(128), dedupeKey: z.string().trim().min(1).max(512), deliveredAt: iso,
  netDeltaBRL: decimal, channel: z.enum(['telegram', 'inbox', 'digest']),
}).strict()
const outcomeSchema = z.object({
  recommendationId: z.string().trim().min(1).max(128), recordedAt: iso,
  outcome: z.enum(['executed_elsewhere', 'not_executed', 'dismissed', 'expired', 'reviewed']), note: z.string().trim().min(1).max(1_000).optional(),
}).strict()
const auditSchema = z.object({
  id: z.string().trim().min(1).max(128), at: iso,
  kind: z.enum(['scan', 'provider_failure', 'circuit_open', 'delivery', 'manual_outcome', 'prune', 'recovery']), detail: z.string().trim().min(1).max(512),
}).strict()
const operationsFileSchema = z.object({
  version: z.literal(1), deliveries: z.array(deliverySchema), manualOutcomes: z.array(outcomeSchema), audit: z.array(auditSchema),
}).strict()

export type FixedIncomeOperationalAlert = z.output<typeof fixedIncomeOperationalAlertSchema>
export type FixedIncomeDeliveryReceipt = z.output<typeof deliverySchema>
export type FixedIncomeManualOutcome = z.output<typeof outcomeSchema>
export type FixedIncomeAuditEvent = z.output<typeof auditSchema>
export type FixedIncomeOperationsFile = z.output<typeof operationsFileSchema>

export function planFixedIncomeAlertDelivery(
  alertsInput: unknown[],
  priorInput: Array<{ dedupeKey: string; deliveredAt: string; netDeltaBRL: string }>,
  options: { now: string; cooldownDays: number; materialDeltaBRL: string },
): FixedIncomeOperationalAlert[] {
  const alerts = z.array(fixedIncomeOperationalAlertSchema).max(5_000).parse(alertsInput)
  const prior = z.array(deliverySchema.pick({ dedupeKey: true, deliveredAt: true, netDeltaBRL: true })).max(50_000).parse(priorInput)
  const now = Date.parse(iso.parse(options.now))
  if (!Number.isInteger(options.cooldownDays) || options.cooldownDays < 0 || options.cooldownDays > 365) throw new Error('cooldownDays is invalid')
  const materialDelta = new Decimal(decimal.parse(options.materialDeltaBRL)).abs()
  return alerts.filter((alert) => {
    if (Date.parse(alert.expiresAt) <= now) return false
    const latest = prior.filter((item) => item.dedupeKey === alert.dedupeKey).sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))[0]
    if (!latest || alert.critical) return true
    const cooldownEndsAt = Date.parse(latest.deliveredAt) + options.cooldownDays * 86_400_000
    if (now >= cooldownEndsAt) return true
    return new Decimal(alert.netDeltaBRL).minus(latest.netDeltaBRL).abs().gte(materialDelta)
  })
}

export function formatFixedIncomeTelegramDigest(alertsInput: unknown[], generatedAtInput: string): string {
  const alerts = z.array(fixedIncomeOperationalAlertSchema).max(50).parse(alertsInput)
  const generatedAt = iso.parse(generatedAtInput)
  const lines = [
    'RENDA FIXA — RESUMO INFORMATIVO',
    `Gerado em: ${generatedAt}`,
    `Itens: ${alerts.length}`,
  ]
  for (const alert of alerts) {
    lines.push('', `${severityLabel(alert.severity)} ${alert.title}`, alert.summary,
      `Decisão do motor: ${alert.decision} · delta líquido: ${brl(alert.netDeltaBRL)}`,
      `Qualidade: ${alert.dataQualityScore}% · confiança: ${alert.confidenceScore}%`,
      `Fontes: ${alert.sourceLabels.join(', ') || 'não informadas'}`)
  }
  lines.push('', 'Research-only. Nenhuma ordem será enviada; confirme oferta, dados e adequação antes de qualquer ação manual.')
  const text = lines.join('\n')
  return text.length <= 3_500 ? text : `${text.slice(0, 3_430)}\n\nResumo truncado; consulte a interface para os itens restantes.`
}

export class FixedIncomeOperationsStore {
  private static readonly queues = new Map<string, Promise<void>>()
  private readonly retentionDays: number
  private readonly maxEntries: number
  private readonly now: () => Date
  constructor(private readonly path: string, options: { retentionDays?: number; maxEntries?: number; now?: () => Date } = {}) {
    this.retentionDays = options.retentionDays ?? 365
    this.maxEntries = options.maxEntries ?? 10_000
    this.now = options.now ?? (() => new Date())
    if (!Number.isInteger(this.retentionDays) || this.retentionDays < 1 || !Number.isInteger(this.maxEntries) || this.maxEntries < 1) throw new Error('invalid fixed-income operations retention policy')
  }
  async read(): Promise<FixedIncomeOperationsFile> { return this.prune(await this.readRaw()) }
  async recordDelivery(input: FixedIncomeDeliveryReceipt): Promise<boolean> { return this.lock(async () => {
    const value = deliverySchema.parse(input); const file = this.prune(await this.readRaw())
    if (file.deliveries.some((item) => item.eventId === value.eventId)) return false
    file.deliveries.push(value); await this.write(this.prune(file)); return true
  }) }
  async recordManualOutcome(input: FixedIncomeManualOutcome): Promise<void> { await this.lock(async () => {
    const value = outcomeSchema.parse(input); const file = this.prune(await this.readRaw())
    const index = file.manualOutcomes.findIndex((item) => item.recommendationId === value.recommendationId)
    if (index >= 0) file.manualOutcomes[index] = value; else file.manualOutcomes.push(value)
    file.audit.push({ id: `manual:${value.recommendationId}:${value.recordedAt}`, at: value.recordedAt, kind: 'manual_outcome', detail: value.outcome })
    await this.write(this.prune(file))
  }) }
  async appendAudit(input: FixedIncomeAuditEvent): Promise<boolean> { return this.lock(async () => {
    const value = auditSchema.parse(input); const file = this.prune(await this.readRaw())
    if (file.audit.some((item) => item.id === value.id)) return false
    file.audit.push(value); await this.write(this.prune(file)); return true
  }) }
  private lock<T>(task: () => Promise<T>): Promise<T> {
    const queue = FixedIncomeOperationsStore.queues.get(this.path) ?? Promise.resolve()
    const run = queue.then(task, task)
    FixedIncomeOperationsStore.queues.set(this.path, run.then(() => undefined, () => undefined))
    return run
  }
  private async readRaw(): Promise<FixedIncomeOperationsFile> {
    try { return operationsFileSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, deliveries: [], manualOutcomes: [], audit: [] }; throw error }
  }
  private prune(file: FixedIncomeOperationsFile): FixedIncomeOperationsFile {
    const cutoff = this.now().getTime() - this.retentionDays * 86_400_000
    return {
      version: 1,
      deliveries: file.deliveries.filter((item) => Date.parse(item.deliveredAt) >= cutoff).slice(-this.maxEntries),
      manualOutcomes: file.manualOutcomes.filter((item) => Date.parse(item.recordedAt) >= cutoff).slice(-this.maxEntries),
      audit: file.audit.filter((item) => Date.parse(item.at) >= cutoff).slice(-this.maxEntries),
    }
  }
  private async write(file: FixedIncomeOperationsFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp-${process.pid}`
    await writeFile(temporary, `${JSON.stringify(file)}\n`, { mode: 0o600 })
    await rename(temporary, this.path); await chmod(this.path, 0o600).catch(() => undefined)
  }
}

export class FixedIncomeCircuitBreaker {
  private consecutiveFailures = 0
  private openedAt: number | null = null
  constructor(private readonly options: { failureThreshold: number; openDurationMs: number }) {
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1 || !Number.isInteger(options.openDurationMs) || options.openDurationMs < 1) throw new Error('invalid circuit-breaker policy')
  }
  recordFailure(at: Date): void { this.consecutiveFailures += 1; if (this.consecutiveFailures >= this.options.failureThreshold && this.openedAt === null) this.openedAt = at.getTime() }
  recordSuccess(): void { this.consecutiveFailures = 0; this.openedAt = null }
  health(now: Date): { state: 'closed' | 'open' | 'half_open'; allowed: boolean; consecutiveFailures: number; openedAt: string | null } {
    const state = this.openedAt === null ? 'closed' : now.getTime() - this.openedAt >= this.options.openDurationMs ? 'half_open' : 'open'
    return { state, allowed: state !== 'open', consecutiveFailures: this.consecutiveFailures, openedAt: this.openedAt === null ? null : new Date(this.openedAt).toISOString() }
  }
}

function severityLabel(value: FixedIncomeOperationalAlert['severity']): string { return ({ info: 'INFO', opportunity: 'OPORTUNIDADE', warning: 'ATENÇÃO', critical: 'CRÍTICO' })[value] }
function brl(value: string): string {
  const fixed = new Decimal(value).abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
  const [integer, fraction] = fixed.split('.') as [string, string]
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${new Decimal(value).isNegative() ? '-' : ''}R$ ${grouped},${fraction}`
}
