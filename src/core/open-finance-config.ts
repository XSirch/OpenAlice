import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { dataPath } from './paths.js'
import { isSealedEnvelope, seal, unseal } from './sealing.js'

const FILE = dataPath('config', 'open-finance.json')

const schema = z.object({
  version: z.literal(1).default(1),
  pluggy: z.object({
    enabled: z.boolean().default(false),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
  }).default({ enabled: false }),
})

export type OpenFinanceConfig = z.infer<typeof schema>
export type PublicOpenFinanceConfig = { pluggy: { enabled: boolean; configured: boolean } }

export async function readOpenFinanceConfig(): Promise<OpenFinanceConfig> {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8')) as unknown
    return schema.parse(isSealedEnvelope(raw) ? await unseal(raw) : raw)
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return schema.parse({})
    throw error
  }
}

export async function readPublicOpenFinanceConfig(): Promise<PublicOpenFinanceConfig> {
  const config = await readOpenFinanceConfig()
  return { pluggy: { enabled: config.pluggy.enabled, configured: Boolean(config.pluggy.clientId && config.pluggy.clientSecret) } }
}

export async function writeOpenFinanceConfig(input: { enabled: boolean; clientId?: string; clientSecret?: string }): Promise<PublicOpenFinanceConfig> {
  const current = await readOpenFinanceConfig()
  const next = schema.parse({
    version: 1,
    pluggy: {
      enabled: input.enabled,
      clientId: input.clientId?.trim() || current.pluggy.clientId,
      clientSecret: input.clientSecret?.trim() || current.pluggy.clientSecret,
    },
  })
  const temp = `${FILE}.tmp-${process.pid}`
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(temp, `${JSON.stringify(await seal(next), null, 2)}\n`, { mode: 0o600 })
  await chmod(temp, 0o600).catch(() => undefined)
  await rename(temp, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return readPublicOpenFinanceConfig()
}
