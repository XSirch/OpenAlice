import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { dataPath } from '../../../core/paths.js'

export const readinessCapabilitySchema = z.enum(['global', 'fixed_income', 'b3_signals', 'crypto_signals'])
export const readinessEvidenceStatusSchema = z.enum(['passed', 'failed', 'blocked', 'not_run'])
export const readinessEvidenceSchema = z.object({
  id: z.string().min(1).max(128),
  capability: readinessCapabilitySchema,
  criterion: z.string().min(1).max(256),
  status: readinessEvidenceStatusSchema,
  observedAt: z.string().datetime({ offset: true }),
  source: z.string().min(1).max(128),
  validationRunId: z.string().min(1).max(128),
  details: z.string().max(512).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).strict()
export type ReadinessEvidence = z.infer<typeof readinessEvidenceSchema>
export type ReadinessCapability = z.infer<typeof readinessCapabilitySchema>

const DEFAULT_PATH = dataPath('alice-invest', 'readiness-evidence.jsonl')

/** Append-only, idempotent local evidence journal. It deliberately accepts no
 * caller-supplied readiness state, so a fixture cannot promote a capability. */
export class ReadinessEvidenceStore {
  private readonly seen = new Set<string>()
  private readonly entries: ReadinessEvidence[] = []
  private writeChain: Promise<unknown> = Promise.resolve()
  constructor(private readonly path = DEFAULT_PATH) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    try {
      for (const line of (await readFile(this.path, 'utf8')).split(/\r?\n/)) {
        if (!line.trim()) continue
        const entry = readinessEvidenceSchema.parse(JSON.parse(line))
        if (!this.seen.has(entry.id)) { this.seen.add(entry.id); this.entries.push(entry) }
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) throw error
    }
  }

  async append(input: ReadinessEvidence): Promise<boolean> {
    const entry = readinessEvidenceSchema.parse(input)
    const next = this.writeChain.then(async () => {
      if (this.seen.has(entry.id)) return false
      await appendFile(this.path, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 })
      this.seen.add(entry.id); this.entries.push(entry); return true
    })
    this.writeChain = next.catch(() => undefined)
    return next
  }

  list(capability?: ReadinessCapability): ReadinessEvidence[] {
    return this.entries.filter((entry) => !capability || entry.capability === capability).map((entry) => ({ ...entry }))
  }
}
