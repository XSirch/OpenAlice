import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

import { fixedIncomeOpportunitySchema, type FixedIncomeOpportunity } from './opportunities.js'
import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const importSchema = z.object({
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  importedAt: z.string().datetime({ offset: true }),
  provenance: fixedIncomeSourceProvenanceSchema,
  offers: z.array(fixedIncomeOpportunitySchema).max(5_000),
}).strict()
const fileSchema = z.object({ version: z.literal(1), imports: z.array(importSchema).max(500) }).strict()

export interface FixedIncomeStoredImport {
  checksum: string
  importedAt: string
  provenance: FixedIncomeSourceProvenance
  offers: FixedIncomeOpportunity[]
}

/** Private, atomic offer catalog. Re-importing the same payload is idempotent. */
export class FixedIncomeAdvisorStateStore {
  private static readonly queues = new Map<string, Promise<void>>()
  constructor(private readonly path: string, private readonly maxImports = 100) {}

  async listOpportunities(now: Date): Promise<Array<FixedIncomeOpportunity & { provenance: FixedIncomeSourceProvenance }>> {
    const file = await this.readFile()
    const byId = new Map<string, FixedIncomeOpportunity & { provenance: FixedIncomeSourceProvenance }>()
    for (const item of file.imports) for (const offer of item.offers) {
      const normalized = offer.availability === 'confirmed' && offer.validUntil && Date.parse(offer.validUntil) <= now.getTime()
        ? { ...offer, availability: 'expired' as const }
        : offer
      const prior = byId.get(offer.id)
      if (!prior || prior.observedAt < normalized.observedAt) byId.set(offer.id, { ...normalized, provenance: item.provenance })
    }
    return [...byId.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id))
  }

  async recordImport(input: FixedIncomeStoredImport): Promise<boolean> {
    return this.lock(async () => {
      const value = importSchema.parse(input)
      const file = await this.readFile()
      const existing = file.imports.find((item) => item.checksum === value.checksum)
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error(`conflicting fixed-income import checksum: ${value.checksum}`)
        return false
      }
      file.imports.push(value)
      file.imports.sort((a, b) => a.importedAt.localeCompare(b.importedAt))
      file.imports = file.imports.slice(-this.maxImports)
      await this.writeFile(file)
      return true
    })
  }

  private lock<T>(task: () => Promise<T>): Promise<T> {
    const queued = FixedIncomeAdvisorStateStore.queues.get(this.path) ?? Promise.resolve()
    const run = queued.then(task, task)
    FixedIncomeAdvisorStateStore.queues.set(this.path, run.then(() => undefined, () => undefined))
    return run
  }
  private async readFile(): Promise<z.output<typeof fileSchema>> {
    try { return fileSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, imports: [] }; throw error }
  }
  private async writeFile(file: z.output<typeof fileSchema>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp-${process.pid}`
    await writeFile(temporary, `${JSON.stringify(file)}\n`, { mode: 0o600 })
    await chmod(temporary, 0o600).catch(() => undefined)
    await rename(temporary, this.path)
    await chmod(this.path, 0o600).catch(() => undefined)
  }
}
