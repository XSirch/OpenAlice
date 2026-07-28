import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { corporateEventSchema, dedupeCorporateEvents, type CorporateEvent } from '../domain/alice-invest/corporate-events/contracts.js'
import { dataPath } from './paths.js'

const FILE = dataPath('cache', 'corporate-events.json')
const storeSchema = corporateEventSchema.array().max(20_000)

export async function readCorporateEvents(): Promise<CorporateEvent[]> {
  try { return dedupeCorporateEvents(storeSchema.parse(JSON.parse(await readFile(FILE, 'utf8')))) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** Appends source-attributed rows while replacing only exact identity duplicates. */
export async function mergeCorporateEvents(incoming: readonly CorporateEvent[]): Promise<CorporateEvent[]> {
  const events = dedupeCorporateEvents([...await readCorporateEvents(), ...incoming])
  const temporary = `${FILE}.tmp-${process.pid}`
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(events, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600).catch(() => undefined)
  await rename(temporary, FILE)
  await chmod(FILE, 0o600).catch(() => undefined)
  return events
}
