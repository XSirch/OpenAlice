/**
 * Dedicated file viewer tab — the "open a file" surface, modelled on
 * VS Code's editor. Opened from the Tracked backlink list and the
 * workspace Files panel; renders one workspace file read-only.
 *
 * Markdown (`[[name]]` wikilinks included) uses MarkdownContent; static HTML
 * uses the isolated report renderer; everything else falls back to monospace
 * plain text. Rendering + tombstones are shared with the Inbox doc pane via
 * FileContentView.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Eye, FileText, Pencil, Save, X } from 'lucide-react'

import { FileContentView } from '../components/FileContentView'
import { CenteredLoading } from '../components/StateViews'
import { useWorkspaces } from '../contexts/workspaces-context'
import { readWorkspaceFile, updateWorkspaceMarkdown, type ReadFileResult } from '../components/workspace/api'
import { workspaceDisplayName, workspaceDisplayTitle } from '../components/workspace/display'
import { useTrackedSelection } from '../live/tracked-selection'
import { useWorkspace } from '../tabs/store'
import type { ViewSpec } from '../tabs/types'

interface Props {
  spec: Extract<ViewSpec, { kind: 'file-viewer' }>
}

export function FileViewerPage({ spec }: Props) {
  const { t } = useTranslation()
  const { wsId, path, source, returnSessionId, returnTrackedName } = spec.params
  const { workspaces } = useWorkspaces()
  const openOrFocus = useWorkspace((s) => s.openOrFocus)
  const setSidebar = useWorkspace((s) => s.setSidebar)
  const selectTracked = useTrackedSelection((s) => s.select)
  const workspace = workspaces.find((w) => w.id === wsId)
  const workspaceName = workspace ? workspaceDisplayName(workspace) : wsId.slice(0, 8)
  const workspaceTitle = workspace ? workspaceDisplayTitle(workspace) : workspaceName
  const backLabel = source === 'tracked'
    ? t('fileViewer.backToTracked')
    : t('fileViewer.backToWorkspace', { workspace: workspaceName })

  const [result, setResult] = useState<ReadFileResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setResult(null)
    readWorkspaceFile(wsId, path).then((r) => {
      if (!cancelled) {
        setResult(r)
        if (r.kind === 'ok') setDraft(r.content)
        setEditing(false)
        setSaveError(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [wsId, path])

  const canEdit = path.toLowerCase().endsWith('.md') && result?.kind === 'ok' && Boolean(result.revision)
  const save = async () => {
    if (result?.kind !== 'ok') return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateWorkspaceMarkdown(wsId, path, draft, result.revision)
      setResult({ kind: 'ok', content: draft, revision: updated.revision })
      setEditing(false)
    } catch (error) {
      setSaveError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const goBack = () => {
    if (source === 'tracked') {
      if (returnTrackedName) selectTracked(returnTrackedName)
      setSidebar('tracked')
      openOrFocus({ kind: 'tracked', params: {} })
      return
    }
    setSidebar(
      source === 'chat'
        ? 'chat'
        : source === 'auto-quant' ? 'auto-quant' : source === 'alice-portfolio' ? 'alice-portfolio' : 'workspaces',
    )
    openOrFocus({
      kind: 'workspace',
      params: {
        wsId,
        ...(returnSessionId ? { sessionId: returnSessionId } : {}),
        ...(source ? { source } : {}),
      },
    })
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex shrink-0 items-start gap-2 border-b border-border bg-secondary/30 px-4 py-2 sm:items-center">
        <button
          type="button"
          onClick={goBack}
          aria-label={backLabel}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-0 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-7 sm:w-auto sm:px-2"
          title={backLabel}
        >
          <ArrowLeft size={14} strokeWidth={1.8} aria-hidden />
          <span className="hidden sm:inline">{t('fileViewer.back')}</span>
        </button>
        <FileText size={13} strokeWidth={1.75} className="mt-1 shrink-0 text-muted-foreground/70 sm:mt-0" aria-hidden />
        <div className="min-w-0 flex-1 sm:contents">
          <span
            className="block break-all font-mono text-[12px] leading-4 text-foreground sm:min-w-0 sm:flex-1 sm:truncate sm:leading-normal"
            title={path}
          >
            {path}
          </span>
          {canEdit && (
            <div className="mt-2 flex shrink-0 gap-1 sm:ml-2 sm:mt-0">
              {editing ? (
                <>
                  <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    <Save size={13} aria-hidden />{saving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setDraft(result.content); setEditing(false); setSaveError(null) }} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium">
                    <X size={13} aria-hidden />Cancel
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setEditing(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted">
                  <Pencil size={13} aria-hidden />Edit
                </button>
              )}
            </div>
          )}
          <span
            className="mt-1 block break-all text-[11px] text-muted-foreground/70 sm:ml-auto sm:mt-0 sm:max-w-[min(35vw,20rem)] sm:truncate sm:text-right"
            title={workspaceTitle}
          >
            {workspaceName}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[820px] mx-auto px-6 py-6">
          {saveError && <div role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</div>}
          {editing && result?.kind === 'ok' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Eye size={13} aria-hidden />Markdown source</div>
              <textarea
                aria-label={`Edit ${path}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-[65vh] w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm leading-6 text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                spellCheck
              />
            </div>
          ) : result === null ? (
            <CenteredLoading />
          ) : (
            <FileContentView path={path} result={result} />
          )}
        </div>
      </div>
    </div>
  )
}
