import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_CONNECTOR_INBOUND_TEXT_BYTES,
  connectorInboundTextMessageSchema,
  MAX_CONNECTOR_ATTACHMENT_BYTES,
  inboxNotificationSchema,
} from './types.js'

const baseNotification = {
  id: 'inbox-1',
  createdAt: '2026-07-13T00:00:00.000Z',
  workspaceId: 'ws-1',
  title: 'Report ready',
  body: '',
}

describe('Inbox notification attachments', () => {
  it('accepts a bounded Markdown file payload', () => {
    const content = Buffer.from('# Report\n')
    const source = Buffer.from('# Report\n', 'utf8')
    expect(inboxNotificationSchema.parse({
      ...baseNotification,
      attachments: [{
        filename: 'report.md',
        mediaType: 'text/markdown; charset=utf-8',
        sizeBytes: content.byteLength,
        contentSha256: createHash('sha256').update(content).digest('hex'),
        source: {
          sizeBytes: source.byteLength,
          contentSha256: createHash('sha256').update(source).digest('hex'),
          detectedEncoding: 'UTF-8',
          detectionConfidence: 100,
        },
        contentBase64: content.toString('base64'),
      }],
    }).attachments).toHaveLength(1)
  })

  it('rejects attachment metadata above the one-file limit', () => {
    expect(() => inboxNotificationSchema.parse({
      ...baseNotification,
      attachments: [{
        filename: 'too-large.md',
        mediaType: 'text/markdown; charset=utf-8',
        sizeBytes: MAX_CONNECTOR_ATTACHMENT_BYTES + 1,
        contentSha256: '0'.repeat(64),
        contentBase64: '',
      }],
    })).toThrow()
  })
})

describe('Connector inbound text contract', () => {
  const message = {
    version: 1,
    connectorId: 'example',
    correlationId: 'inbound-123',
    receivedAt: '2026-07-16T00:00:00.000Z',
    external: { updateId: '42', messageId: '7', senderId: 'user-1', conversationId: 'chat-1' },
    content: { type: 'text', text: 'Hello' },
  }

  it('accepts a versioned, platform-neutral text message', () => {
    expect(connectorInboundTextMessageSchema.parse(message)).toEqual(message)
  })

  it('rejects unbounded, non-text, and unexpected payload fields', () => {
    expect(() => connectorInboundTextMessageSchema.parse({
      ...message,
      content: { type: 'text', text: 'a'.repeat(MAX_CONNECTOR_INBOUND_TEXT_BYTES + 1) },
    })).toThrow(/UTF-8 bytes/)
    expect(() => connectorInboundTextMessageSchema.parse({
      ...message,
      content: { type: 'photo', text: 'Hello' },
    })).toThrow()
    expect(() => connectorInboundTextMessageSchema.parse({ ...message, token: 'not-allowed' })).toThrow()
  })
})
