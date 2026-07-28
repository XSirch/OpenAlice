import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { brazilTaxPolicySchema, defaultBrazilTaxPolicy, type BrazilTaxPolicy } from '../domain/alice-invest/tax/contracts.js'
import { dataPath } from './paths.js'

const FILE = dataPath('config', 'alice-invest-tax-policy.json')

export async function readBrazilTaxPolicy(): Promise<BrazilTaxPolicy> {
  try {
    return brazilTaxPolicySchema.parse(JSON.parse(await readFile(FILE, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultBrazilTaxPolicy
    throw error
  }
}

/** Kept private until tax estimation has its separate reviewed delivery task. */
export async function writeBrazilTaxPolicy(input: unknown): Promise<BrazilTaxPolicy> {
  const policy = brazilTaxPolicySchema.parse(input)
  const temporary = `${FILE}.tmp-${process.pid}`
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return policy
}
