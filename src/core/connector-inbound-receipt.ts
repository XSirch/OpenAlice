import type { InboundJournalState } from '../../services/connector/src/core/inbound-state.js'

/**
 * Alice receives this contract only after Connector persistence. It is kept
 * separate from Workspace dispatch so a later bridge can record an idempotent
 * receipt before any Session or Inbox side effect occurs.
 */
export interface ConnectorInboundReceipt {
  correlationId: string
  dedupeKey: string
  state: Extract<InboundJournalState, 'persisted' | 'forwarded' | 'completed' | 'retry_scheduled' | 'dead_letter'>
}
