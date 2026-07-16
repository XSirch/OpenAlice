import { createHash } from 'node:crypto'
import type { ConnectorInboundTextMessage } from '@traderalice/connector-protocol'

export const inboundJournalStates = [
  'received',
  'persisted',
  'forwarded',
  'completed',
  'retry_scheduled',
  'dead_letter',
] as const
export type InboundJournalState = typeof inboundJournalStates[number]

const allowedTransitions: Record<InboundJournalState, readonly InboundJournalState[]> = {
  received: ['persisted'],
  persisted: ['forwarded'],
  forwarded: ['completed', 'retry_scheduled', 'dead_letter'],
  completed: [],
  retry_scheduled: ['forwarded', 'dead_letter'],
  dead_letter: [],
}

/**
 * Acknowledgement is an adapter concern, but its safety predicate belongs to
 * the transport state machine: a message is never acknowledged before its
 * received record has been made durable.
 */
export function canAcknowledgeInbound(state: InboundJournalState): boolean {
  return state !== 'received'
}

export function canTransitionInbound(
  from: InboundJournalState,
  to: InboundJournalState,
): boolean {
  return allowedTransitions[from].includes(to)
}

export function transitionInbound(
  from: InboundJournalState,
  to: InboundJournalState,
): InboundJournalState {
  if (!canTransitionInbound(from, to)) {
    throw new Error(`Invalid inbound transition: ${from} -> ${to}`)
  }
  return to
}

/**
 * Transport dedupe is scoped to one Connector and its external update/message
 * identity. Updates take precedence because a single update can carry the
 * same message more than once across retries; adapters without update IDs use
 * their message ID. The opaque digest keeps raw external IDs out of paths and
 * logs while remaining stable across process restart.
 */
export function inboundDedupeKey(message: ConnectorInboundTextMessage): string {
  const identity = message.external.updateId ?? message.external.messageId
  if (!identity) {
    throw new Error('Inbound message requires an external updateId or messageId for deduplication')
  }
  const digest = createHash('sha256')
    .update(`${message.connectorId}\u0000${identity}`, 'utf8')
    .digest('hex')
  return `connector:${message.connectorId}:${digest}`
}
