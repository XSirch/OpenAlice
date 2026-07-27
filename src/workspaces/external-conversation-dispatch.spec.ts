import { describe, expect, it, vi } from 'vitest'
import { createMemoryInboxStore } from '../core/inbox-store.js'
import { ExternalConversationDispatcher } from './external-conversation-dispatch.js'

describe('ExternalConversationDispatcher', () => {
  it('serializes one resume id, publishes a reply, and makes failures visible through Inbox', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ taskId: 'task-1', resumeId: 'r' })
      .mockRejectedValueOnce(new Error('down'))
    const read = vi.fn().mockResolvedValue({
      taskId: 'task-1', resumeId: 'r', workspaceId: 'w', agent: 'codex', status: 'done', startedAt: 0,
      structured: { assistantText: 'The answer.', schemaVersion: 1, blocks: [], metrics: { toolCalls: 0, toolFailures: 0 } },
    })
    const inbox = createMemoryInboxStore()
    const dispatcher = new ExternalConversationDispatcher({ run, read }, inbox, async () => undefined)

    await Promise.all([
      dispatcher.dispatch({ resumeId: 'r', workspaceId: 'w', prompt: 'a' }),
      dispatcher.dispatch({ resumeId: 'r', workspaceId: 'w', prompt: 'b' }),
    ])

    expect(run).toHaveBeenCalledTimes(2)
    expect((await inbox.read()).entries.map((entry) => entry.comments)).toEqual(expect.arrayContaining([
      'The answer.',
      'The conversation agent is currently unavailable. Please try again shortly.',
    ]))
  })
})
