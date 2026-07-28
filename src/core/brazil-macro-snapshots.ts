import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { dataPath } from './paths.js'

const FILE = dataPath('cache', 'brazil-macro-snapshots.json')
const MAX_ENTRIES = 2_000

const entrySchema = z.object({
  seriesId: z.string().min(1),
  dataAsOf: z.string().date(),
  value: z.number().finite(),
  collectedAt: z.string().datetime(),
  provider: z.string().min(1),
})
const schema = z.object({ version: z.literal(1), entries: z.array(entrySchema).max(MAX_ENTRIES) })
export type BrazilMacroSnapshot = z.infer<typeof entrySchema>

export async function recordBrazilMacroSnapshots(entries: BrazilMacroSnapshot[]): Promise<void> {
  const current = await readBrazilMacroSnapshots()
  const next = mergeBrazilMacroSnapshots(current, entries)
  await mkdir(dirname(FILE), { recursive: true })
  const temporary = `${FILE}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify({ version: 1, entries: next })}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
}

/** Keep distinct values for the same data-base as observable source revisions. */
export function mergeBrazilMacroSnapshots(current: BrazilMacroSnapshot[], incoming: BrazilMacroSnapshot[]): BrazilMacroSnapshot[] {
  const all = [...current, ...incoming]
  const deduped = new Map<string, BrazilMacroSnapshot>()
  for (const entry of all) deduped.set(`${entry.seriesId}:${entry.dataAsOf}:${entry.value}`, entry)
  return [...deduped.values()].sort((a, b) => a.collectedAt.localeCompare(b.collectedAt)).slice(-MAX_ENTRIES)
}

export async function readBrazilMacroSnapshots(): Promise<BrazilMacroSnapshot[]> {
  try { return schema.parse(JSON.parse(await readFile(FILE, 'utf8'))).entries } catch { return [] }
}
