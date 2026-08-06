import { FileText, FolderKanban, MessageSquare } from 'lucide-react'
import { useMemo } from 'react'
import { useWorkspaces } from '../../contexts/workspaces-context'
import { useWorkspace } from '../../tabs/store'
import { getFocusedTab } from '../../tabs/types'
import { workspaceDisplayName } from './display'
import { orderWorkspacesForSidebar } from './sidebar-order'

export function AlicePortfolioSidebar({ onNavigate = () => undefined }: { onNavigate?: () => void }) {
  const { workspaces, hasLoaded } = useWorkspaces()
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)
  const portfolios = useMemo(() => orderWorkspacesForSidebar(
    workspaces.filter((workspace) => workspace.template === 'alice-portfolio'),
  ), [workspaces])
  const open = (wsId: string, sessionId?: string) => {
    openOrFocus({ kind: 'workspace', params: { wsId, ...(sessionId ? { sessionId } : {}), source: 'alice-portfolio' } })
    onNavigate()
  }
  const openGoal = (wsId: string) => {
    openOrFocus({ kind: 'file-viewer', params: { wsId, path: 'portfolio/goal.md', source: 'alice-portfolio' } })
    onNavigate()
  }

  return (
    <div className="h-full overflow-y-auto py-2">
      {!hasLoaded && <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>}
      {hasLoaded && portfolios.length === 0 && (
        <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">No Alice Portfolio workspace yet.</p>
      )}
      {portfolios.map((workspace) => {
        const active = focused?.kind === 'workspace' && focused.params.wsId === workspace.id
        return (
          <div key={workspace.id} className="mb-2">
            <button type="button" onClick={() => open(workspace.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${active && !focused.params.sessionId ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>
              <FolderKanban size={14} aria-hidden />
              <span className="truncate font-medium">{workspaceDisplayName(workspace)}</span>
            </button>
            <button type="button" onClick={() => openGoal(workspace.id)} className="flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-xs text-muted-foreground hover:bg-muted">
              <FileText size={12} aria-hidden />
              <span className="truncate">Objetivo (goal.md)</span>
            </button>
            {workspace.sessions.map((session) => (
              <button key={session.id} type="button" onClick={() => open(workspace.id, session.id)} className={`flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-xs hover:bg-muted ${active && focused.params.sessionId === session.id ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>
                <MessageSquare size={12} aria-hidden />
                <span className="truncate">{session.name}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
