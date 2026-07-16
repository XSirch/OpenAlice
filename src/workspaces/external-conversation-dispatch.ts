import type { IInboxStore } from '../core/inbox-store.js'
import type { WorkspaceConversationControl } from '../core/workspace-tool-center.js'

export interface ExternalConversationDispatchTarget { run(resumeId: string, prompt: string): Promise<void> }

/** Adapts inbound turns to the existing Workspace conversation continuation
 * control; it never creates an agent runtime of its own. */
export function workspaceConversationDispatchTarget(control: WorkspaceConversationControl): ExternalConversationDispatchTarget {
  return {
    async run(resumeId, prompt) {
      const result = await control.ask({ target: { kind: 'resume', resumeId }, prompt, timeoutMs: 300_000 })
      if (result.status === 'unavailable') throw new Error('resumed Session is unavailable')
    },
  }
}

/** Server-owned serialization boundary: one external conversation can never
 * overlap its own resumed Session turn. */
export class ExternalConversationDispatcher {
  private readonly tails = new Map<string, Promise<void>>()
  constructor(private readonly target: ExternalConversationDispatchTarget, private readonly inbox: IInboxStore) {}
  dispatch(input: { resumeId: string; workspaceId: string; prompt: string }): Promise<void> {
    const prior = this.tails.get(input.resumeId) ?? Promise.resolve()
    const run = prior.catch(() => undefined).then(async () => {
      try { await this.target.run(input.resumeId, input.prompt) }
      catch { await this.inbox.append({ workspaceId: input.workspaceId, comments: 'The conversation agent is currently unavailable. Please try again shortly.', origin: { kind: 'manual', resumeId: input.resumeId } }) }
    })
    this.tails.set(input.resumeId, run.finally(() => { if (this.tails.get(input.resumeId) === run) this.tails.delete(input.resumeId) }))
    return run
  }
}
