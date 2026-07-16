import { describe, expect, it, vi } from 'vitest'
import { ValidatingConnectorInboundSink } from './inbound.js'

const validMessage = {
  version: 1,
  connectorId: 'test-adapter',
  correlationId: 'inbound-test-1',
  receivedAt: '2026-07-16T00:00:00.000Z',
  external: { senderId: 'owner', conversationId: 'private-chat' },
  content: { type: 'text', text: 'Safe input' },
}

describe('ValidatingConnectorInboundSink', () => {
  it('passes a parsed generic envelope to its sink', async () => {
    const accept = vi.fn(async () => undefined)
    const inbound = new ValidatingConnectorInboundSink({ accept })

    await inbound.accept(validMessage)

    expect(accept).toHaveBeenCalledWith(validMessage)
  })

  it('rejects invalid input before the sink sees it', async () => {
    const accept = vi.fn(async () => undefined)
    const inbound = new ValidatingConnectorInboundSink({ accept })

    await expect(inbound.accept({ ...validMessage, version: 2 })).rejects.toThrow()
    expect(accept).not.toHaveBeenCalled()
  })
})
