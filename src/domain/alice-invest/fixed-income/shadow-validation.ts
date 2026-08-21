import Decimal from 'decimal.js'
import { z } from 'zod'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const iso = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const checksum = z.string().regex(/^[a-f0-9]{64}$/)
export const fixedIncomeShadowObservationSchema = z.object({
  id: z.string().trim().min(1).max(128), observedAt: iso, referenceId: z.string().trim().min(1).max(256),
  calculationTraceId: checksum, expectedNetBRL: decimal, actualNetBRL: decimal,
  staleDataCount: z.number().int().min(0).max(1_000_000), providerFailureCount: z.number().int().min(0).max(1_000_000),
  alertCount: z.number().int().min(0).max(1_000_000), duplicateAlertCount: z.number().int().min(0).max(1_000_000),
  reviewedAlertCount: z.number().int().min(0).max(1_000_000), falsePositiveCount: z.number().int().min(0).max(1_000_000),
  thresholdVariant: z.string().trim().min(1).max(128), sourceChecksum: checksum,
}).strict().superRefine((value, context) => {
  if (value.duplicateAlertCount > value.alertCount) context.addIssue({ code: 'custom', path: ['duplicateAlertCount'], message: 'must not exceed alertCount' })
  if (value.reviewedAlertCount > value.alertCount) context.addIssue({ code: 'custom', path: ['reviewedAlertCount'], message: 'must not exceed alertCount' })
  if (value.falsePositiveCount > value.reviewedAlertCount) context.addIssue({ code: 'custom', path: ['falsePositiveCount'], message: 'must not exceed reviewedAlertCount' })
})
export const fixedIncomeShadowWalkthroughSchema = z.object({
  completedAt: iso, reviewer: z.string().trim().min(1).max(128), result: z.enum(['passed', 'failed']), notes: z.string().trim().min(1).max(2_000),
}).strict()
const reportInputSchema = z.object({
  observations: z.array(fixedIncomeShadowObservationSchema).max(10_000), walkthrough: fixedIncomeShadowWalkthroughSchema.nullable(), maximumCalculationDifferenceBRL: decimal.optional(),
}).strict()
export const fixedIncomeShadowFileV1Schema = z.object({ version: z.literal(1), observations: z.array(fixedIncomeShadowObservationSchema).max(10_000) }).strict()
export const fixedIncomeShadowFileSchema = z.object({
  version: z.literal(2), observations: z.array(fixedIncomeShadowObservationSchema).max(10_000),
  walkthroughs: z.array(fixedIncomeShadowWalkthroughSchema).max(100),
}).strict()

export type FixedIncomeShadowObservation = z.output<typeof fixedIncomeShadowObservationSchema>
export type FixedIncomeShadowWalkthrough = z.output<typeof fixedIncomeShadowWalkthroughSchema>

export interface FixedIncomeShadowReport {
  state: 'collecting' | 'validation_failed' | 'eligible_for_human_readiness_decision'
  distinctObservationDays: number
  observationCount: number
  period: { from: string | null; to: string | null }
  metrics: { staleDataEvents: number; providerFailures: number; alerts: number; duplicateAlerts: number; reviewedAlerts: number; falsePositives: number; falsePositiveRatePct: string }
  maximumAbsoluteCalculationDifferenceBRL: string
  thresholdSensitivity: Array<{ variant: string; observations: number; alerts: number; falsePositives: number; falsePositiveRatePct: string }>
  blockers: string[]
  walkthrough: FixedIncomeShadowWalkthrough | null
  methodologyId: 'fixed-income-shadow-validation@1'
  readiness: 'research_only'
  canEnableRecommendations: false
}

export function buildFixedIncomeShadowReport(input: z.input<typeof reportInputSchema>): FixedIncomeShadowReport {
  const value = reportInputSchema.parse(input)
  const ids = new Set<string>()
  for (const observation of value.observations) {
    if (ids.has(observation.id)) throw new Error(`duplicate observation id: ${observation.id}`)
    ids.add(observation.id)
  }
  const sorted = [...value.observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  const distinctDays = new Set(sorted.map((observation) => observation.observedAt.slice(0, 10))).size
  const metrics = sorted.reduce((total, observation) => ({
    staleDataEvents: total.staleDataEvents + observation.staleDataCount,
    providerFailures: total.providerFailures + observation.providerFailureCount,
    alerts: total.alerts + observation.alertCount,
    duplicateAlerts: total.duplicateAlerts + observation.duplicateAlertCount,
    reviewedAlerts: total.reviewedAlerts + observation.reviewedAlertCount,
    falsePositives: total.falsePositives + observation.falsePositiveCount,
  }), { staleDataEvents: 0, providerFailures: 0, alerts: 0, duplicateAlerts: 0, reviewedAlerts: 0, falsePositives: 0 })
  const maxDifference = sorted.reduce((maximum, observation) => Decimal.max(maximum, new Decimal(observation.actualNetBRL).minus(observation.expectedNetBRL).abs()), new Decimal(0))
  const allowedDifference = new Decimal(value.maximumCalculationDifferenceBRL ?? '100')
  const blockers = [
    ...(distinctDays < 30 ? ['minimum_30_distinct_days_not_met'] : []),
    ...(!value.walkthrough ? ['human_walkthrough_missing'] : value.walkthrough.result !== 'passed' ? ['human_walkthrough_failed'] : []),
    ...(maxDifference.gt(allowedDifference) ? ['calculation_difference_exceeds_tolerance'] : []),
  ]
  const sensitivity = new Map<string, { observations: number; alerts: number; falsePositives: number }>()
  for (const observation of sorted) {
    const current = sensitivity.get(observation.thresholdVariant) ?? { observations: 0, alerts: 0, falsePositives: 0 }
    current.observations += 1; current.alerts += observation.alertCount; current.falsePositives += observation.falsePositiveCount
    sensitivity.set(observation.thresholdVariant, current)
  }
  const state = blockers.some((blocker) => blocker === 'calculation_difference_exceeds_tolerance' || blocker === 'human_walkthrough_failed')
    ? 'validation_failed' as const
    : blockers.length ? 'collecting' as const : 'eligible_for_human_readiness_decision' as const
  return {
    state, distinctObservationDays: distinctDays, observationCount: sorted.length,
    period: { from: sorted[0]?.observedAt.slice(0, 10) ?? null, to: sorted.at(-1)?.observedAt.slice(0, 10) ?? null },
    metrics: { ...metrics, falsePositiveRatePct: percentage(metrics.falsePositives, metrics.reviewedAlerts) },
    maximumAbsoluteCalculationDifferenceBRL: money(maxDifference),
    thresholdSensitivity: [...sensitivity.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([variant, item]) => ({ variant, ...item, falsePositiveRatePct: percentage(item.falsePositives, item.alerts) })),
    blockers, walkthrough: value.walkthrough, methodologyId: 'fixed-income-shadow-validation@1', readiness: 'research_only', canEnableRecommendations: false,
  }
}

export class FixedIncomeShadowValidationStore {
  private static readonly queues = new Map<string, Promise<void>>()
  constructor(private readonly path: string) {}
  async read(): Promise<FixedIncomeShadowObservation[]> { return [...(await this.readFile()).observations] }
  async append(input: FixedIncomeShadowObservation): Promise<boolean> { return this.lock(async () => {
    const observation = fixedIncomeShadowObservationSchema.parse(input)
    const file = await this.readFile()
    const existing = file.observations.find((item) => item.id === observation.id)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(observation)) throw new Error(`conflicting shadow observation id: ${observation.id}`)
      return false
    }
    file.observations.push(observation)
    file.observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
    await this.writeFile(file)
    return true
  }) }
  async recordWalkthrough(input: FixedIncomeShadowWalkthrough): Promise<boolean> { return this.lock(async () => {
    const walkthrough = fixedIncomeShadowWalkthroughSchema.parse(input)
    const file = await this.readFile()
    const existing = file.walkthroughs.find((item) => item.completedAt === walkthrough.completedAt && item.reviewer === walkthrough.reviewer)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(walkthrough)) throw new Error(`conflicting shadow walkthrough: ${walkthrough.completedAt}:${walkthrough.reviewer}`)
      return false
    }
    file.walkthroughs.push(walkthrough)
    file.walkthroughs.sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.reviewer.localeCompare(b.reviewer))
    await this.writeFile(file)
    return true
  }) }
  async report(maximumCalculationDifferenceBRL?: string): Promise<FixedIncomeShadowReport> {
    const file = await this.readFile()
    const walkthrough = [...file.walkthroughs].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] ?? null
    return buildFixedIncomeShadowReport({ observations: file.observations, walkthrough, ...(maximumCalculationDifferenceBRL ? { maximumCalculationDifferenceBRL } : {}) })
  }
  private lock<T>(task: () => Promise<T>): Promise<T> {
    const queue = FixedIncomeShadowValidationStore.queues.get(this.path) ?? Promise.resolve()
    const run = queue.then(task, task)
    FixedIncomeShadowValidationStore.queues.set(this.path, run.then(() => undefined, () => undefined))
    return run
  }
  private async readFile(): Promise<z.output<typeof fixedIncomeShadowFileSchema>> {
    try { return fixedIncomeShadowFileSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, observations: [], walkthroughs: [] }; throw error }
  }
  private async writeFile(file: z.output<typeof fixedIncomeShadowFileSchema>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp-${process.pid}`
    await writeFile(temporary, `${JSON.stringify(file)}\n`, { mode: 0o600 })
    await rename(temporary, this.path); await chmod(this.path, 0o600).catch(() => undefined)
  }
}

function percentage(numerator: number, denominator: number): string { return denominator === 0 ? '0.00000000' : new Decimal(numerator).div(denominator).mul(100).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8) }
function money(value: Decimal): string { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
