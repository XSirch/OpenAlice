import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

import { fixedIncomeCashFlowSchema } from './cashflows.js'
import { fixedIncomeLotSchema } from './lots.js'

const iso = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const score = z.number().int().min(0).max(100)

export const fixedIncomePositionRiskSchema = z.object({
  durationYears: decimal.nullable(), modifiedDurationYears: decimal.nullable(), convexity: decimal.nullable(), dv01BRL: decimal.nullable(),
  creditScore: score.nullable(), liquidityScore: score.nullable(), structuralScore: score.nullable(), confidenceScore: score.nullable(),
  methodologyIds: z.array(z.string().trim().min(1).max(128)).max(32), dataAsOf: z.string().date(),
}).strict()

export const fixedIncomePositionDocumentSchema = z.object({
  id: z.string().trim().min(1).max(128), documentType: z.string().trim().min(1).max(128),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/), sourceUrl: z.string().url().max(2_048), dataAsOf: z.string().date(),
}).strict()

export const fixedIncomePositionCalculationSchema = z.object({
  calculationTraceId: z.string().regex(/^[a-f0-9]{64}$/), calculatedAt: iso, targetDate: z.string().date(),
  decision: z.enum(['maintain', 'sell_partial', 'sell_and_reinvest', 'insufficient_data']),
  holdNetBRL: decimal, reinvestNetBRL: decimal, netDeltaBRL: decimal, annualizedUpliftPct: decimal,
  breakEvenAnnualNetRatePct: decimal, methodologyIds: z.array(z.string().trim().min(1).max(128)).max(32),
}).strict()

const recordSchema = z.object({
  positionId: z.string().trim().min(1).max(256), updatedAt: iso,
  lots: z.array(fixedIncomeLotSchema).max(10_000), cashFlows: z.array(fixedIncomeCashFlowSchema).max(100_000),
  risk: fixedIncomePositionRiskSchema.nullable(), documents: z.array(fixedIncomePositionDocumentSchema).max(256),
  calculations: z.array(fixedIncomePositionCalculationSchema).max(100),
}).strict().superRefine((record, context) => {
  record.lots.forEach((lot, index) => { if (lot.positionId !== record.positionId) context.addIssue({ code: 'custom', path: ['lots', index, 'positionId'], message: 'must match record positionId' }) })
  record.cashFlows.forEach((cashFlow, index) => { if (cashFlow.instrumentId !== record.positionId) context.addIssue({ code: 'custom', path: ['cashFlows', index, 'instrumentId'], message: 'must match record positionId' }) })
})
export const fixedIncomePositionStateFileSchema = z.object({ version: z.literal(1), records: z.array(recordSchema).max(2_000) }).strict()

export type FixedIncomePositionRecord = z.output<typeof recordSchema>
export type FixedIncomePositionRisk = z.output<typeof fixedIncomePositionRiskSchema>
export type FixedIncomePositionDocument = z.output<typeof fixedIncomePositionDocumentSchema>
export type FixedIncomePositionCalculation = z.output<typeof fixedIncomePositionCalculationSchema>

const emptyRecord = (positionId: string, updatedAt: string): FixedIncomePositionRecord => ({ positionId, updatedAt, lots: [], cashFlows: [], risk: null, documents: [], calculations: [] })

/** Private, atomic per-position evidence and calculation memory. Raw custody
 * IDs stay in this file and are redacted at HTTP/tool boundaries. */
export class FixedIncomePositionStateStore {
  private static readonly queues = new Map<string, Promise<void>>()
  constructor(private readonly path: string, private readonly now: () => Date = () => new Date()) {}

  async get(positionId: string): Promise<FixedIncomePositionRecord> {
    return (await this.read()).records.find((record) => record.positionId === positionId) ?? emptyRecord(positionId, this.now().toISOString())
  }

  async replaceEvidence(positionId: string, input: Pick<FixedIncomePositionRecord, 'lots' | 'cashFlows' | 'risk' | 'documents'>): Promise<FixedIncomePositionRecord> {
    return this.lock(async () => {
      const file = await this.read(); const existing = file.records.find((record) => record.positionId === positionId)
      const record = recordSchema.parse({ ...(existing ?? emptyRecord(positionId, this.now().toISOString())), ...input, positionId, updatedAt: this.now().toISOString() })
      file.records = [...file.records.filter((item) => item.positionId !== positionId), record].sort((a, b) => a.positionId.localeCompare(b.positionId))
      await this.write(file); return record
    })
  }

  async recordCalculation(positionId: string, input: FixedIncomePositionCalculation): Promise<boolean> {
    return this.lock(async () => {
      const value = fixedIncomePositionCalculationSchema.parse(input); const file = await this.read()
      const record = file.records.find((item) => item.positionId === positionId) ?? emptyRecord(positionId, this.now().toISOString())
      const existing = record.calculations.find((item) => item.calculationTraceId === value.calculationTraceId)
      if (existing) { if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error(`conflicting calculation trace: ${value.calculationTraceId}`); return false }
      record.calculations = [...record.calculations, value].sort((a, b) => a.calculatedAt.localeCompare(b.calculatedAt)).slice(-100)
      record.updatedAt = this.now().toISOString()
      file.records = [...file.records.filter((item) => item.positionId !== positionId), record].sort((a, b) => a.positionId.localeCompare(b.positionId))
      await this.write(file); return true
    })
  }

  private lock<T>(task: () => Promise<T>): Promise<T> {
    const prior = FixedIncomePositionStateStore.queues.get(this.path) ?? Promise.resolve(); const run = prior.then(task, task)
    FixedIncomePositionStateStore.queues.set(this.path, run.then(() => undefined, () => undefined)); return run
  }
  private async read(): Promise<z.output<typeof fixedIncomePositionStateFileSchema>> {
    try { return fixedIncomePositionStateFileSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, records: [] }; throw error }
  }
  private async write(file: z.output<typeof fixedIncomePositionStateFileSchema>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp-${process.pid}`
    await writeFile(temporary, `${JSON.stringify(file)}\n`, { mode: 0o600 }); await chmod(temporary, 0o600).catch(() => undefined)
    await rename(temporary, this.path); await chmod(this.path, 0o600).catch(() => undefined)
  }
}
