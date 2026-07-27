import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fixedIncomeCustodyDefinitionsSchema, type FixedIncomeCustodyDefinitions } from '../domain/alice-invest/fixed-income/contracts.js'
import { dataPath } from './paths.js'

const FILE = dataPath('config', 'fixed-income-custody.json')

export async function readFixedIncomeCustodyDefinitions(): Promise<FixedIncomeCustodyDefinitions> {
  try {
    return fixedIncomeCustodyDefinitionsSchema.parse(JSON.parse(await readFile(FILE, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] }
    throw error
  }
}

export async function writeFixedIncomeCustodyDefinitions(input: unknown): Promise<FixedIncomeCustodyDefinitions> {
  const definitions = fixedIncomeCustodyDefinitionsSchema.parse(input)
  const temporary = `${FILE}.tmp-${process.pid}`
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(definitions, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return definitions
}
