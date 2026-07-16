import type { ConnectorInboundTextMessage } from '@traderalice/connector-protocol'
import { ConnectorInboundJournal, type InboundJournalEntry } from './inbound-journal.js'

export interface InboundDispatchTarget {
  deliver(message: ConnectorInboundTextMessage): Promise<void>
}

export interface InboundDispatcherOptions {
  journal: ConnectorInboundJournal
  target: InboundDispatchTarget
  timeoutMs?: number
  maxAttempts?: number
  delay?: (milliseconds: number) => Promise<void>
}

/** Dispatches already-persisted envelopes. It never retries a completed item;
 * only explicitly transient errors receive bounded retry attempts. */
export class ConnectorInboundDispatcher {
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly delay: (milliseconds: number) => Promise<void>

  constructor(private readonly options: InboundDispatcherOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxAttempts = options.maxAttempts ?? 3
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  }

  async dispatch(entry: InboundJournalEntry): Promise<InboundJournalEntry> {
    if (entry.state === 'completed' || entry.state === 'dead_letter') return entry
    let current = entry
    while (current.attempts < this.maxAttempts) {
      if (current.state === 'persisted' || current.state === 'retry_scheduled') {
        current = await this.options.journal.transition(current.dedupeKey, 'forwarded')
      }
      try {
        await withTimeout(this.options.target.deliver(current.message), this.timeoutMs)
        return this.options.journal.transition(current.dedupeKey, 'completed')
      } catch (error) {
        if (!isTransient(error) || current.attempts >= this.maxAttempts) {
          return this.options.journal.transition(current.dedupeKey, 'dead_letter')
        }
        current = await this.options.journal.transition(current.dedupeKey, 'retry_scheduled')
        await this.delay(Math.min(1_000 * current.attempts, 5_000))
      }
    }
    return this.options.journal.transition(current.dedupeKey, 'dead_letter')
  }

  async recover(): Promise<InboundJournalEntry[]> {
    const pending = (await this.options.journal.entries())
      .filter((entry) => entry.state === 'persisted' || entry.state === 'retry_scheduled')
    return Promise.all(pending.map((entry) => this.dispatch(entry)))
  }
}

function isTransient(error: unknown): boolean {
  if (error instanceof InboundTransientError) return true
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined
  return typeof status === 'number' && (status === 408 || status === 429 || status >= 500)
}

export class InboundTransientError extends Error {}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => setTimeout(() => reject(new InboundTransientError(`Inbound delivery timed out after ${timeoutMs}ms`)), timeoutMs)),
  ])
}
