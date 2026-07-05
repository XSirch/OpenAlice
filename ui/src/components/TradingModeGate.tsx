import { useEffect } from 'react'
import { Gauge, LockKeyhole, ShieldCheck } from 'lucide-react'
import { ensureTradingModePolling, useTradingMode } from '../live/trading-mode'
import type { TradingMode } from '../api/types'

interface TradingModeGateProps {
  title: string
  description: string
}

export function TradingModeGate({ title, description }: TradingModeGateProps) {
  const status = useTradingMode((s) => s.status)
  const saving = useTradingMode((s) => s.saving)
  const setMode = useTradingMode((s) => s.setMode)

  useEffect(() => { ensureTradingModePolling() }, [])

  const switchMode = (mode: TradingMode) => {
    void setMode(mode).catch(() => {})
  }

  return (
    <div className="flex min-h-[420px] items-center justify-center px-0 py-8 sm:px-4 sm:py-10">
      <div className="w-full max-w-[560px] rounded-lg border border-border bg-bg-secondary px-4 py-5 sm:px-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-tertiary text-text-muted">
            <Gauge size={18} strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Lite mode</div>
            <h2 className="mt-1 text-[17px] font-semibold text-text">{title}</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">{description}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ModeAction
            icon={LockKeyhole}
            label="Readonly"
            description="Connect UTA for account and position analysis. Venue writes stay blocked."
            disabled={status.envLocked || saving !== null}
            loading={saving === 'readonly'}
            onClick={() => switchMode('readonly')}
          />
          <ModeAction
            icon={ShieldCheck}
            label="Pro"
            description="Enable UTA with per-account write permissions and approval controls."
            disabled={status.envLocked || saving !== null}
            loading={saving === 'pro'}
            onClick={() => switchMode('pro')}
          />
        </div>

        {status.envLocked && (
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted/70">
            This install is locked by the environment mode. Remove OPENALICE_TRADING_MODE or legacy lite env flags to change it from the UI.
          </p>
        )}
      </div>
    </div>
  )
}

function ModeAction({
  icon: Icon,
  label,
  description,
  disabled,
  loading,
  onClick,
}: {
  icon: typeof LockKeyhole
  label: string
  description: string
  disabled: boolean
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[92px] items-start gap-2.5 rounded-md border border-border bg-bg px-3 py-3 text-left transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:border-accent/50 hover:bg-bg-tertiary disabled:cursor-default disabled:opacity-60"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
        <Icon size={15} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-text">{loading ? 'Switching...' : `Switch to ${label}`}</span>
        <span className="mt-1 block text-[11px] leading-snug text-text-muted">{description}</span>
      </span>
    </button>
  )
}
