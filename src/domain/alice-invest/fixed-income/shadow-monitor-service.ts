import { readFile } from 'node:fs/promises'
import { z } from 'zod'

import { readFixedIncomeAdvisorPolicy } from '../../../core/fixed-income-advisor-policy.js'
import { dataPath } from '../../../core/paths.js'
import { FixedIncomeOperationsStore } from './operations.js'
import { FixedIncomeShadowValidationStore, fixedIncomeShadowObservationSchema, type FixedIncomeShadowObservation } from './shadow-validation.js'

export const fixedIncomeShadowInputFileSchema = z.object({ version: z.literal(1), observations: z.array(fixedIncomeShadowObservationSchema).max(500) }).strict()

/** Bounded hand-off populated only by deterministic comparisons against an
 * explicit official reference. Missing input is an honest no-op. */
export class FixedIncomeShadowInputStore {
  constructor(private readonly path = dataPath('state', 'fixed-income-shadow-input.json')) {}
  async read(): Promise<FixedIncomeShadowObservation[]> {
    try { return fixedIncomeShadowInputFileSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))).observations }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
}

export interface FixedIncomeShadowMonitorOptions {
  input?: FixedIncomeShadowInputStore
  validation?: Pick<FixedIncomeShadowValidationStore, 'append'>
  operations?: Pick<FixedIncomeOperationsStore, 'appendAudit'>
  readPolicy?: typeof readFixedIncomeAdvisorPolicy
  intervalMs?: number
  now?: () => Date
}

/** Guardian-supervised read-only collector. It never downloads, calculates or
 * synthesizes evidence; producers must supply complete trace-linked records. */
export class FixedIncomeShadowMonitorService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private readonly input: FixedIncomeShadowInputStore
  private readonly validation: Pick<FixedIncomeShadowValidationStore, 'append'>
  private readonly operations: Pick<FixedIncomeOperationsStore, 'appendAudit'>
  private readonly readPolicy: typeof readFixedIncomeAdvisorPolicy
  private readonly intervalMs: number
  private readonly now: () => Date

  constructor(options: FixedIncomeShadowMonitorOptions = {}) {
    this.input = options.input ?? new FixedIncomeShadowInputStore()
    this.validation = options.validation ?? new FixedIncomeShadowValidationStore(dataPath('state', 'fixed-income-shadow-validation.json'))
    this.operations = options.operations ?? new FixedIncomeOperationsStore(dataPath('state', 'alice-invest-fixed-income-operations.json'))
    this.readPolicy = options.readPolicy ?? readFixedIncomeAdvisorPolicy
    this.intervalMs = options.intervalMs ?? 5 * 60_000
    this.now = options.now ?? (() => new Date())
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick().catch((error) => console.warn('fixed-income shadow monitor tick failed', error)), this.intervalMs)
    this.timer.unref()
    void this.tick().catch((error) => console.warn('fixed-income shadow monitor initial tick failed', error))
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  async tick(): Promise<{ accepted: number; replayed: number; skipped: boolean }> {
    if (this.running) return { accepted: 0, replayed: 0, skipped: true }
    this.running = true
    const at = this.now().toISOString()
    try {
      const policy = await this.readPolicy()
      if (!policy.enabled) return { accepted: 0, replayed: 0, skipped: true }
      const observations = await this.input.read()
      let accepted = 0
      for (const observation of observations) if (await this.validation.append(observation)) accepted += 1
      const replayed = observations.length - accepted
      if (observations.length > 0) await this.operations.appendAudit({ id: `shadow-collect:${at.slice(0, 16)}`, at, kind: 'scan', detail: `shadow validation accepted ${accepted} and replayed ${replayed} trace-linked observations` })
      return { accepted, replayed, skipped: false }
    } catch (error) {
      await this.operations.appendAudit({ id: `shadow-failure:${at.slice(0, 16)}`, at, kind: 'provider_failure', detail: 'shadow validation input rejected; no evidence was recorded' }).catch(() => undefined)
      throw error
    } finally { this.running = false }
  }
}
