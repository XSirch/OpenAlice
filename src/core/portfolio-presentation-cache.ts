import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { dataPath } from './paths.js'

const FILE = dataPath('cache', 'portfolio-presentation.json')
const MAX_BYTES = 5 * 1024 * 1024

/** Read-only Portfolio projection. It deliberately contains no broker config,
 * tokens, or account credentials; the UTA remains the source of truth. */
const schema = z.object({
  version: z.literal(1),
  refreshedAt: z.string().datetime(),
  data: z.unknown(),
  aggregateCurve: z.unknown().nullable(),
  curvePoints: z.array(z.unknown()).max(2_000),
  curveAccountId: z.string(),
})

export type PortfolioPresentationCache = z.infer<typeof schema>

export async function readPortfolioPresentationCache(): Promise<PortfolioPresentationCache | null> {
  try {
    return schema.parse(JSON.parse(await readFile(FILE, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

export async function writePortfolioPresentationCache(input: unknown): Promise<PortfolioPresentationCache> {
  const cache = schema.parse(input)
  const serialized = `${JSON.stringify(cache)}\n`
  if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Portfolio cache is too large.')
  await mkdir(dirname(FILE), { recursive: true })
  const temporary = `${FILE}.tmp-${process.pid}`
  await writeFile(temporary, serialized, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return cache
}

export async function clearPortfolioPresentationCache(): Promise<void> {
  await rm(FILE, { force: true })
}
