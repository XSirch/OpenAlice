import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExternalConversationBindingStore } from './external-conversation-bindings.js'
describe('ExternalConversationBindingStore', () => { it('persists an owner-isolated resume binding without raw external ids', async () => { const path = join(await mkdtemp(join(tmpdir(), 'bindings-')), 'bindings.json'); const store = new ExternalConversationBindingStore(path); await store.bind('telegram', 'chat-1', 'owner-1', 'resume-a'); expect(await new ExternalConversationBindingStore(path).resolve('telegram', 'chat-1', 'owner-1')).toMatchObject({ resumeId: 'resume-a' }); expect(await store.resolve('telegram', 'chat-1', 'owner-2')).toBeNull(); expect(await readFile(path, 'utf8')).not.toContain('chat-1') }) })
