import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  ALICE_INVEST_PRIVATE_FILE_MODE,
  aliceInvestConfigSchema,
  defaultAliceInvestConfig,
  type AliceInvestConfig,
} from '../domain/alice-invest/config.js'
import { dataPath } from './paths.js'

const ALICE_INVEST_CONFIG_FILE = dataPath('config', 'alice-invest.json')

export async function readAliceInvestConfig(): Promise<AliceInvestConfig> {
  try {
    return aliceInvestConfigSchema.parse(JSON.parse(await readFile(ALICE_INVEST_CONFIG_FILE, 'utf8')))
  } catch (error) {
    if (isENOENT(error)) return defaultAliceInvestConfig()
    throw error
  }
}

export async function writeAliceInvestConfig(config: AliceInvestConfig): Promise<void> {
  const parsed = aliceInvestConfigSchema.parse(config)
  const temp = `${ALICE_INVEST_CONFIG_FILE}.tmp-${process.pid}`
  await mkdir(dirname(ALICE_INVEST_CONFIG_FILE), { recursive: true })
  await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, { mode: ALICE_INVEST_PRIVATE_FILE_MODE })
  await chmod(temp, ALICE_INVEST_PRIVATE_FILE_MODE).catch(() => undefined)
  await rename(temp, ALICE_INVEST_CONFIG_FILE)
  await chmod(ALICE_INVEST_CONFIG_FILE, ALICE_INVEST_PRIVATE_FILE_MODE).catch(() => undefined)
}

function isENOENT(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
