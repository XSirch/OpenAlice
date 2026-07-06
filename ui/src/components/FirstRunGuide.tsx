import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Compass,
  KeyRound,
  ShieldCheck,
  X,
} from 'lucide-react'

import { configApi } from '../api/config'
import { tradingApi, type TradingServiceStatus } from '../api/trading'
import type { UTAConfig } from '../api/types'
import { Dialog } from './uta/Dialog'
import { installHintFor } from './workspace/agentInstall'
import { useWorkspaces } from '../contexts/workspaces-context'
import { useWorkspace } from '../tabs/store'

const DISMISS_KEY = 'openalice.onboarding.firstRunGuide.dismissed.v2'

interface GuideState {
  credentials: number
  tradingStatus: TradingServiceStatus | null
  utas: UTAConfig[]
}

const INITIAL_GUIDE_STATE: GuideState = {
  credentials: 0,
  tradingStatus: null,
  utas: [],
}

export function FirstRunGuide() {
  const { agents } = useWorkspaces()
  const openOrFocus = useWorkspace((s) => s.openOrFocus)
  const [state, setState] = useState<GuideState>(INITIAL_GUIDE_STATE)
  const [loaded, setLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    let live = true
    Promise.all([
      configApi.getCredentials(),
      tradingApi.status(),
      tradingApi.loadTradingConfig(),
    ])
      .then(([credentials, tradingStatus, tradingConfig]) => {
        if (!live) return
        setState({
          credentials: credentials.credentials.length,
          tradingStatus,
          utas: tradingConfig.utas,
        })
      })
      .catch(() => {
        if (live) setState(INITIAL_GUIDE_STATE)
      })
      .finally(() => {
        if (live) setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [])

  const model = useMemo(() => {
    const agentRuntimes = agents.filter((a) => a.kind !== 'utility')
    const agentsKnown = agentRuntimes.length > 0
    const installedAgents = agentRuntimes.filter((a) => a.installed !== false)
    const installedAgent = installedAgents[0]
    const hasAgentRuntime = agentsKnown && installedAgents.length > 0
    const noCredentials = state.credentials === 0
    const mode = state.tradingStatus?.mode ?? 'lite'
    const modeSource = state.tradingStatus?.modeSource ?? 'auto'
    const hasUTA = state.utas.length > 0 || state.tradingStatus?.hasUTAConfig === true
    const freshLite = mode === 'lite' && modeSource === 'auto' && !hasUTA
    const shouldShow = loaded && agentsKnown && !dismissed && (
      !hasAgentRuntime || (noCredentials && freshLite)
    )
    const preferredMissing = agentRuntimes.find((a) => a.id === 'codex')
      ?? agentRuntimes.find((a) => a.id === 'claude')
      ?? agentRuntimes[0]
    const installHint = preferredMissing ? installHintFor(preferredMissing.id) : undefined
    return {
      shouldShow,
      hasAgentRuntime,
      installedAgent,
      noCredentials,
      mode,
      modeSource,
      hasUTA,
      freshLite,
      installHint,
    }
  }, [agents, dismissed, loaded, state])

  const close = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Ignore storage failures; the current session still closes the guide.
    }
  }, [])

  const openAiProvider = () => {
    close()
    openOrFocus({ kind: 'settings', params: { category: 'ai-provider' } })
  }

  const openAgentPermissions = () => {
    close()
    openOrFocus({ kind: 'settings', params: { category: 'agent-permissions' } })
  }

  const openChecklist = () => {
    close()
    openOrFocus({ kind: 'onboarding', params: {} })
  }

  if (!model.shouldShow) return null

  return (
    <Dialog onClose={close} width="w-full sm:w-[720px]">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              First run
            </div>
            <h2 className="mt-1 text-[18px] font-semibold leading-snug text-text">
              Start Alice in Lite, then unlock more when you are ready.
            </h2>
            <p className="mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-text-muted">
              Lite keeps UTA disconnected. Set up one agent runtime first; broker accounts and trade permissions can wait.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close onboarding"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-overlay hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_230px]">
        <div className="space-y-3">
          <GuideItem
            icon={<Compass className="h-4 w-4" />}
            title={model.freshLite ? 'You are safely in Lite mode' : `${capitalize(model.mode)} mode is active`}
            body={
              model.freshLite
                ? 'Alice can analyze market context without broker accounts or order access.'
                : 'Trading mode controls which broker-backed surfaces can turn on.'
            }
            state="ready"
          />
          <GuideItem
            icon={<Bot className="h-4 w-4" />}
            title={model.hasAgentRuntime ? `${model.installedAgent?.displayName ?? 'Agent runtime'} is available` : 'Install one agent runtime'}
            body={
              model.hasAgentRuntime
                ? 'Alice can launch workspace sessions with an installed CLI.'
                : 'Codex or Claude Code is the shortest path. opencode and Pi also work with a vault credential.'
            }
            state={model.hasAgentRuntime ? 'ready' : 'attention'}
            code={model.hasAgentRuntime ? undefined : model.installHint?.cmd}
          />
          <GuideItem
            icon={<KeyRound className="h-4 w-4" />}
            title={model.noCredentials ? 'AI access can be CLI login or a vault key' : 'Vault credential is configured'}
            body={
              model.noCredentials
                ? 'Claude Code and Codex can use their own login. opencode and Pi need a credential in AI Provider.'
                : 'Workspace templates can inject the saved credential when needed.'
            }
            state={model.noCredentials ? 'attention' : 'ready'}
          />
          <GuideItem
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Upgrade only when the trust boundary is clear"
            body="Readonly lets Alice see positions. Pro adds broker write permissions and approval controls."
            state="optional"
          />
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary/55 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Suggested path
          </div>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={model.hasAgentRuntime ? openChecklist : openAiProvider}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md bg-accent px-3 py-2.5 text-left text-[13px] font-semibold text-white transition-colors hover:bg-accent/90"
            >
              <span className="min-w-0 truncate">
                {model.hasAgentRuntime ? 'Open setup checklist' : 'Set up runtime'}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={openAgentPermissions}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2.5 text-left text-[13px] font-medium text-text-muted transition-colors hover:border-accent/50 hover:text-accent"
            >
              <span className="min-w-0 truncate">Choose trading mode</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={close}
              className="flex w-full min-w-0 items-center justify-center rounded-md px-3 py-2 text-[12px] font-medium text-text-muted transition-colors hover:bg-overlay hover:text-text"
            >
              Continue in Lite
            </button>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
            This guide stays quiet after you close it. The setup checklist remains available at /onboarding.
          </p>
        </div>
      </div>
    </Dialog>
  )
}

function GuideItem({
  icon,
  title,
  body,
  state,
  code,
}: {
  icon: ReactNode
  title: string
  body: string
  state: 'ready' | 'attention' | 'optional'
  code?: string
}) {
  const stateClass = state === 'ready'
    ? 'bg-green/10 text-green border-green/25'
    : state === 'attention'
      ? 'bg-red/10 text-red border-red/25'
      : 'bg-bg-tertiary text-text-muted border-border'
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-tertiary text-text-muted">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-0 text-[13px] font-semibold text-text">{title}</div>
            <span className={`inline-flex min-h-5 items-center rounded-full border px-2 text-[10px] font-medium ${stateClass}`}>
              {state === 'ready' ? 'Ready' : state === 'attention' ? 'Next' : 'Later'}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{body}</p>
          {code && (
            <code className="mt-2 block rounded-md bg-bg-tertiary px-2 py-1.5 font-mono text-[11px] text-text">
              {code}
            </code>
          )}
        </div>
        {state === 'ready' && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-green" />}
      </div>
    </div>
  )
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`
}
