import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { defaultFixedIncomeAdvisorPolicy, fixedIncomeAdvisorPolicySchema, type FixedIncomeAdvisorPolicy } from '../domain/alice-invest/fixed-income/policy.js'
import { dataPath } from './paths.js'

const FILE = dataPath('config', 'fixed-income-advisor-policy.json')

export async function readFixedIncomeAdvisorPolicy(): Promise<FixedIncomeAdvisorPolicy> {
  try {
    return fixedIncomeAdvisorPolicySchema.parse(JSON.parse(await readFile(FILE, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultFixedIncomeAdvisorPolicy()
    throw error
  }
}

export async function writeFixedIncomeAdvisorPolicy(input: unknown): Promise<FixedIncomeAdvisorPolicy> {
  const policy = fixedIncomeAdvisorPolicySchema.parse(input)
  await mkdir(dirname(FILE), { recursive: true })
  const temporary = `${FILE}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return policy
}
