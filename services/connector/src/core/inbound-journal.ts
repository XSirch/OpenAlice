import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  connectorInboundTextMessageSchema,
  type ConnectorInboundTextMessage,
} from '@traderalice/connector-protocol'
import { inboundDedupeKey, type InboundJournalState, transitionInbound } from './inbound-state.js'

const VERSION = 1
const MAX_TERMINAL_ENTRIES = 1_000
const terminalStates = new Set<InboundJournalState>(['completed', 'dead_letter'])

export interface InboundJournalEntry {
  dedupeKey: string
  message: ConnectorInboundTextMessage
  state: InboundJournalState
  attempts: number
  updatedAt: string
}

interface InboundJournalFile {
  version: 1
  entries: InboundJournalEntry[]
}

export class ConnectorInboundJournal {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  /** Persist first. A duplicate returns its durable entry and never creates a
   * second dispatch candidate, including after a process restart. */
  async persist(message: unknown): Promise<{ entry: InboundJournalEntry; duplicate: boolean }> {
    const parsed = connectorInboundTextMessageSchema.parse(message)
    const dedupeKey = inboundDedupeKey(parsed)
    return this.withLock(async () => {
      const journal = await this.read()
      const existing = journal.entries.find((entry) => entry.dedupeKey === dedupeKey)
      if (existing) return { entry: existing, duplicate: true }
      const entry: InboundJournalEntry = {
        dedupeKey,
        message: parsed,
        state: 'persisted',
        attempts: 0,
        updatedAt: new Date().toISOString(),
      }
      journal.entries.push(entry)
      await this.write(compact(journal))
      return { entry, duplicate: false }
    })
  }

  async transition(dedupeKey: string, to: InboundJournalState): Promise<InboundJournalEntry> {
    return this.withLock(async () => {
      const journal = await this.read()
      const entry = journal.entries.find((candidate) => candidate.dedupeKey === dedupeKey)
      if (!entry) throw new Error(`Unknown inbound journal entry: ${dedupeKey}`)
      entry.state = transitionInbound(entry.state, to)
      if (to === 'forwarded') entry.attempts += 1
      entry.updatedAt = new Date().toISOString()
      await this.write(compact(journal))
      return entry
    })
  }

  async entries(): Promise<InboundJournalEntry[]> {
    return (await this.read()).entries
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation)
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  private async read(): Promise<InboundJournalFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as InboundJournalFile
      if (parsed.version !== VERSION || !Array.isArray(parsed.entries)) throw new Error('Invalid inbound journal')
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: VERSION, entries: [] }
      throw error
    }
  }

  private async write(journal: InboundJournalFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, this.path)
    await chmod(this.path, 0o600).catch(() => undefined)
  }
}

function compact(journal: InboundJournalFile): InboundJournalFile {
  const terminal = journal.entries.filter((entry) => terminalStates.has(entry.state))
  if (terminal.length <= MAX_TERMINAL_ENTRIES) return journal
  const remove = new Set(terminal
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(0, terminal.length - MAX_TERMINAL_ENTRIES)
    .map((entry) => entry.dedupeKey))
  return { ...journal, entries: journal.entries.filter((entry) => !remove.has(entry.dedupeKey)) }
}
