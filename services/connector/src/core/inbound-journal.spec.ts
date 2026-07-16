import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConnectorInboundJournal } from './inbound-journal.js'

const message = {
  version: 1 as const, connectorId: 'example', correlationId: 'inbound-1',
  receivedAt: '2026-07-16T00:00:00.000Z',
  external: { updateId: 'update-1', messageId: 'message-1', senderId: 'sender', conversationId: 'chat' },
  content: { type: 'text' as const, text: 'Hello' },
}

describe('ConnectorInboundJournal', () => {
  it('persists before returning and deduplicates across a restart', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'openalice-inbound-')), 'inbound.json')
    const first = new ConnectorInboundJournal(path)
    const accepted = await first.persist(message)
    expect(accepted).toMatchObject({ duplicate: false, entry: { state: 'persisted' } })
    await first.transition(accepted.entry.dedupeKey, 'forwarded')
    await first.transition(accepted.entry.dedupeKey, 'completed')
    const restarted = new ConnectorInboundJournal(path)
    await expect(restarted.persist({ ...message, correlationId: 'replay' })).resolves.toMatchObject({
      duplicate: true, entry: { state: 'completed' },
    })
  })
})
