import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface ExternalConversationBinding { connectorId: string; conversationIdHash: string; ownerIdHash: string; resumeId: string; updatedAt: string }
interface BindingFile { version: 1; bindings: ExternalConversationBinding[] }

export class ExternalConversationBindingStore {
  constructor(private readonly path: string) {}
  async resolve(connectorId: string, conversationId: string, ownerId: string): Promise<ExternalConversationBinding | null> {
    const key = identity(connectorId, conversationId, ownerId)
    return (await this.read()).bindings.find((binding) => binding.connectorId === connectorId && binding.conversationIdHash === key.conversation && binding.ownerIdHash === key.owner) ?? null
  }
  async bind(connectorId: string, conversationId: string, ownerId: string, resumeId: string): Promise<ExternalConversationBinding> {
    const key = identity(connectorId, conversationId, ownerId); const file = await this.read()
    const binding = { connectorId, conversationIdHash: key.conversation, ownerIdHash: key.owner, resumeId, updatedAt: new Date().toISOString() }
    const index = file.bindings.findIndex((candidate) => candidate.connectorId === connectorId && candidate.conversationIdHash === key.conversation && candidate.ownerIdHash === key.owner)
    if (index >= 0) file.bindings[index] = binding; else file.bindings.push(binding)
    await this.write(file); return binding
  }
  private async read(): Promise<BindingFile> { try { return JSON.parse(await readFile(this.path, 'utf8')) as BindingFile } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, bindings: [] }; throw error } }
  private async write(file: BindingFile): Promise<void> { await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp`; await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, this.path) }
}
function identity(connectorId: string, conversationId: string, ownerId: string) { const hash = (value: string) => createHash('sha256').update(`${connectorId}\u0000${value}`).digest('hex'); return { conversation: hash(conversationId), owner: hash(ownerId) } }
