import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { brokerageLedgerSchema, emptyBrokerageLedger, type BrokerageLedger } from '../domain/alice-invest/tax/ledger.js'
import { dataPath } from './paths.js'

const FILE = dataPath('config', 'alice-invest-tax-ledger.json')
export async function readBrokerageLedger(): Promise<BrokerageLedger> { try { return brokerageLedgerSchema.parse(JSON.parse(await readFile(FILE, 'utf8'))) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyBrokerageLedger; throw error } }
export async function writeBrokerageLedger(input: unknown): Promise<BrokerageLedger> { const ledger = brokerageLedgerSchema.parse(input); const temp = `${FILE}.tmp-${process.pid}`; await mkdir(dirname(FILE), { recursive: true }); await writeFile(temp, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 }); await chmod(temp, 0o600).catch(() => undefined); await rename(temp, FILE); await chmod(FILE, 0o600).catch(() => undefined); return ledger }
