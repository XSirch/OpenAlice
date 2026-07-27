import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { dataPath } from './paths.js'
import { isSealedEnvelope, seal, unseal } from './sealing.js'

const FILE = dataPath('config', 'openrouter-analytics.json')
const schema = z.object({ version: z.literal(1), managementKey: z.string().min(1).optional() })
export type OpenRouterAnalyticsConfig = z.infer<typeof schema>

export async function readOpenRouterAnalyticsConfig(): Promise<OpenRouterAnalyticsConfig> {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8')) as unknown
    return schema.parse(isSealedEnvelope(raw) ? await unseal(raw) : raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 }
    throw error
  }
}

export async function writeOpenRouterAnalyticsConfig(input: { managementKey?: string }): Promise<{ configured: boolean }> {
  const next = schema.parse({ version: 1, ...(input.managementKey?.trim() ? { managementKey: input.managementKey.trim() } : {}) })
  await mkdir(dirname(FILE), { recursive: true })
  const temporary = `${FILE}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(await seal(next), null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return { configured: Boolean(next.managementKey) }
}

export async function readPublicOpenRouterAnalyticsConfig(): Promise<{ configured: boolean }> {
  return { configured: Boolean((await readOpenRouterAnalyticsConfig()).managementKey) }
}
