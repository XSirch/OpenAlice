import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { defaultFgcCoveragePolicy, fgcCoveragePolicySchema, type FgcCoveragePolicy } from '../domain/alice-invest/fixed-income/fgc.js'
import { dataPath } from './paths.js'

const FILE = dataPath('config', 'fgc-coverage-policy.json')

export async function readFgcCoveragePolicy(): Promise<FgcCoveragePolicy> {
  try { return fgcCoveragePolicySchema.parse(JSON.parse(await readFile(FILE, 'utf8'))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultFgcCoveragePolicy; throw error }
}

export async function writeFgcCoveragePolicy(input: unknown): Promise<FgcCoveragePolicy> {
  const policy = fgcCoveragePolicySchema.parse(input)
  const temporary = `${FILE}.tmp-${process.pid}`
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return policy
}
