import { describe, expect, it } from 'vitest'
import {
  canAcknowledgeInbound,
  canTransitionInbound,
  inboundDedupeKey,
  transitionInbound,
} from './inbound-state.js'

const message = {
  version: 1 as const,
  connectorId: 'example',
  correlationId: 'inbound-1',
  receivedAt: '2026-07-16T00:00:00.000Z',
  external: { updateId: 'update-1', messageId: 'message-1', senderId: 'sender', conversationId: 'chat' },
  content: { type: 'text' as const, text: 'Hello' },
}

describe('inbound journal state machine', () => {
  it('allows only the durable delivery lifecycle', () => {
    expect(canTransitionInbound('received', 'persisted')).toBe(true)
    expect(canTransitionInbound('persisted', 'forwarded')).toBe(true)
    expect(canTransitionInbound('forwarded', 'retry_scheduled')).toBe(true)
    expect(canTransitionInbound('retry_scheduled', 'forwarded')).toBe(true)
    expect(canTransitionInbound('forwarded', 'completed')).toBe(true)
    expect(canTransitionInbound('forwarded', 'dead_letter')).toBe(true)
    expect(canTransitionInbound('completed', 'forwarded')).toBe(false)
    expect(() => transitionInbound('received', 'forwarded')).toThrow(/Invalid inbound transition/)
  })

  it('permits acknowledgement only after durable persistence', () => {
    expect(canAcknowledgeInbound('received')).toBe(false)
    expect(canAcknowledgeInbound('persisted')).toBe(true)
    expect(canAcknowledgeInbound('completed')).toBe(true)
  })

  it('deduplicates a connector update before its message identity', () => {
    expect(inboundDedupeKey(message)).toBe(inboundDedupeKey({
      ...message,
      external: { ...message.external, messageId: 'message-replayed' },
    }))
    expect(inboundDedupeKey({
      ...message,
      external: { senderId: 'sender', conversationId: 'chat', messageId: 'message-1' },
    })).not.toBe(inboundDedupeKey({
      ...message,
      external: { senderId: 'sender', conversationId: 'chat', messageId: 'message-2' },
    }))
  })
})
