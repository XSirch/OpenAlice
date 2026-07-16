import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ConnectorInboundDispatcher, InboundTransientError } from './inbound-dispatcher.js'
import { ConnectorInboundJournal } from './inbound-journal.js'

const message = { version: 1 as const, connectorId: 'test', correlationId: 'c', receivedAt: '2026-07-16T00:00:00.000Z', external: { updateId: 'u', senderId: 's', conversationId: 'chat' }, content: { type: 'text' as const, text: 'hi' } }
async function journal() { return new ConnectorInboundJournal(join(await mkdtemp(join(tmpdir(), 'openalice-dispatch-')), 'journal.json')) }

describe('ConnectorInboundDispatcher', () => {
  it('retries only transient failures then completes', async () => {
    const store = await journal(); const persisted = (await store.persist(message)).entry
    const deliver = vi.fn().mockRejectedValueOnce(new InboundTransientError('temporary')).mockResolvedValueOnce(undefined)
    const result = await new ConnectorInboundDispatcher({ journal: store, target: { deliver }, delay: async () => undefined }).dispatch(persisted)
    expect(result).toMatchObject({ state: 'completed', attempts: 2 })
  })
  it('dead-letters permanent failures without retry', async () => {
    const store = await journal(); const persisted = (await store.persist(message)).entry
    const deliver = vi.fn().mockRejectedValue(new Error('bad request'))
    await expect(new ConnectorInboundDispatcher({ journal: store, target: { deliver } }).dispatch(persisted)).resolves.toMatchObject({ state: 'dead_letter', attempts: 1 })
    expect(deliver).toHaveBeenCalledOnce()
  })
  it('recovers an interruption after forwarding without re-delivering completed work', async () => {
    const store = await journal(); const first = (await store.persist(message)).entry
    const forwarded = await store.transition(first.dedupeKey, 'forwarded')
    const completed = await store.persist({ ...message, correlationId: 'done', external: { ...message.external, updateId: 'done' } })
    await store.transition(completed.entry.dedupeKey, 'forwarded'); await store.transition(completed.entry.dedupeKey, 'completed')
    const deliver = vi.fn(async () => undefined)
    await new ConnectorInboundDispatcher({ journal: store, target: { deliver } }).recover()
    expect(deliver).toHaveBeenCalledTimes(1)
    expect((await store.entries()).find((entry) => entry.dedupeKey === forwarded.dedupeKey)).toMatchObject({ state: 'completed' })
  })
})
