import type { IInboxStore } from '../core/inbox-store.js'
import type { WorkspaceConversationControl, WorkspaceConversationTask } from '../core/workspace-tool-center.js'

export interface ExternalConversationDispatchTarget {
  run(resumeId: string, prompt: string): Promise<{ taskId: string; resumeId: string }>
  read(taskId: string): Promise<WorkspaceConversationTask | null>
}

/** Adapts inbound turns to the existing Workspace conversation continuation
 * control; it never creates an agent runtime of its own. */
export function workspaceConversationDispatchTarget(control: WorkspaceConversationControl): ExternalConversationDispatchTarget {
  return {
    async run(resumeId, prompt) {
      const result = await control.ask({ target: { kind: 'resume', resumeId }, prompt, timeoutMs: 300_000 })
      if (result.status === 'unavailable') throw new Error('resumed Session is unavailable')
      return { taskId: result.taskId, resumeId: result.resumeId }
    },
    read: (taskId) => control.read(taskId),
  }
}

/** Server-owned serialization boundary: one external conversation can never
 * overlap its own resumed Session turn. Agent replies remain durable Inbox
 * entries, so the existing Connector projection is the only outbound path. */
export class ExternalConversationDispatcher {
  private readonly tails = new Map<string, Promise<void>>()
  constructor(
    private readonly target: ExternalConversationDispatchTarget,
    private readonly inbox: IInboxStore,
    private readonly delay: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  dispatch(input: { resumeId: string; workspaceId: string; prompt: string }): Promise<void> {
    return this.enqueue(input.resumeId, input.workspaceId, () => this.target.run(input.resumeId, input.prompt))
  }

  /** Observe a newly-created Session turn using the same serialization lane
   * before later Telegram messages are allowed to resume it. */
  watch(input: { resumeId: string; workspaceId: string; taskId: string }): Promise<void> {
    return this.enqueue(input.resumeId, input.workspaceId, async () => ({ taskId: input.taskId, resumeId: input.resumeId }))
  }

  private enqueue(
    resumeId: string,
    workspaceId: string,
    start: () => Promise<{ taskId: string; resumeId: string }>,
  ): Promise<void> {
    const prior = this.tails.get(resumeId) ?? Promise.resolve()
    const run = prior.catch(() => undefined).then(async () => {
      try {
        const dispatched = await start()
        await this.publishReply(workspaceId, dispatched)
      } catch {
        await this.publishUnavailable(workspaceId, resumeId)
      }
    })
    const tail = run.finally(() => { if (this.tails.get(resumeId) === tail) this.tails.delete(resumeId) })
    this.tails.set(resumeId, tail)
    return tail
  }

  private async publishReply(workspaceId: string, dispatched: { taskId: string; resumeId: string }): Promise<void> {
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const task = await this.target.read(dispatched.taskId)
      if (task && task.status !== 'running') {
        const reply = task.structured?.assistantText?.trim()
        if (reply) {
          await this.inbox.append({ workspaceId, comments: reply, origin: { kind: 'manual', resumeId: dispatched.resumeId } })
          return
        }
        await this.publishUnavailable(workspaceId, dispatched.resumeId)
        return
      }
      await this.delay(500)
    }
    await this.publishUnavailable(workspaceId, dispatched.resumeId)
  }

  private async publishUnavailable(workspaceId: string, resumeId: string): Promise<void> {
    await this.inbox.append({ workspaceId, comments: 'The conversation agent is currently unavailable. Please try again shortly.', origin: { kind: 'manual', resumeId } })
  }
}
