import { FolderKanban } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useWorkspaces } from '../contexts/workspaces-context'
import { useWorkspace } from '../tabs/store'
import { workspaceDisplayName } from '../components/workspace/display'

export function AlicePortfolioLandingPage() {
  const { workspaces, hasLoaded } = useWorkspaces()
  const openOrFocus = useWorkspace((state) => state.openOrFocus)
  const portfolios = useMemo(() => workspaces.filter((workspace) => workspace.template === 'alice-portfolio'), [workspaces])
  useEffect(() => {
    if (hasLoaded && portfolios.length === 1) {
      openOrFocus({ kind: 'workspace', params: { wsId: portfolios[0]!.id, source: 'alice-portfolio' } })
    }
  }, [hasLoaded, openOrFocus, portfolios])

  if (!hasLoaded) return <div className="p-8 text-sm text-muted-foreground">Loading Alice Portfolio…</div>
  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-10">
      <h2 className="text-xl font-semibold">Alice Portfolio</h2>
      <p className="mt-2 text-sm text-muted-foreground">Open a durable portfolio-planning workspace to review conversations and files such as <code>portfolio/goal.md</code>.</p>
      {portfolios.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Create an Alice Portfolio workspace from Workspaces → Templates to get started.</div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {portfolios.map((workspace) => (
            <button key={workspace.id} type="button" onClick={() => openOrFocus({ kind: 'workspace', params: { wsId: workspace.id, source: 'alice-portfolio' } })} className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:bg-muted">
              <FolderKanban className="text-primary" size={18} aria-hidden />
              <span className="min-w-0"><span className="block truncate font-medium">{workspaceDisplayName(workspace)}</span><span className="text-xs text-muted-foreground">{workspace.sessions.length} sessions</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
