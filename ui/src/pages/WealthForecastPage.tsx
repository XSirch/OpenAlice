import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/StateViews'
import { fmt, fmtPctSigned } from '../lib/format'
import { calculateWealthForecast, monthsUntil } from './wealth-forecast'

interface ForecastSettings { targetBRL: string; targetDate: string; annualRate: string }
const STORAGE_KEY = 'openalice.wealth-forecast.v1'

function defaultDate(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 10)
  return date.toISOString().slice(0, 10)
}

function readSettings(): ForecastSettings {
  if (typeof window === 'undefined') return { targetBRL: '', targetDate: defaultDate(), annualRate: '8' }
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ForecastSettings>
    return { targetBRL: value.targetBRL ?? '', targetDate: value.targetDate ?? defaultDate(), annualRate: value.annualRate ?? '8' }
  } catch { return { targetBRL: '', targetDate: defaultDate(), annualRate: '8' } }
}

function positiveNumber(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function WealthForecastPage() {
  const [settings, setSettings] = useState<ForecastSettings>(readSettings)
  const [currentBRL, setCurrentBRL] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* best-effort browser preference */ }
  }, [settings])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [equity, fx] = await Promise.all([api.trading.equity(), api.trading.fxRates(['BRL'])])
      const usd = Number(equity.totalEquity)
      const brlRate = fx.rates.find((rate) => rate.currency === 'BRL')?.rate
      if (!Number.isFinite(usd) || !brlRate || !Number.isFinite(brlRate) || brlRate <= 0) {
        throw new Error('Não foi possível converter o patrimônio consolidado para BRL.')
      }
      // UTA aggregates equity in USD. FxService's BRL rate is USD per BRL.
      setCurrentBRL(usd / brlRate)
      setUpdatedAt(new Date())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o patrimônio atual.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(timer)
  }, [refresh])

  const targetBRL = positiveNumber(settings.targetBRL)
  const annualRate = positiveNumber(settings.annualRate)
  const months = monthsUntil(settings.targetDate)
  const forecast = useMemo(() => currentBRL != null && targetBRL != null && annualRate != null && months != null
    ? calculateWealthForecast({ currentWealth: currentBRL, targetWealth: targetBRL, months, expectedAnnualRatePercent: annualRate })
    : null, [annualRate, currentBRL, months, targetBRL])

  return <div className="flex min-h-0 flex-1 flex-col">
    <PageHeader title="Previsão de patrimônio" description="Planeje a meta em BRL a partir do patrimônio consolidado e da taxa esperada." live={{ lastUpdated: updatedAt }} right={<button className="btn-secondary-sm" onClick={() => void refresh()} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>} />
    <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="grid gap-3 rounded-lg border border-border bg-secondary/35 p-4 md:grid-cols-3">
          <label className="text-[12px] text-muted-foreground">Meta de patrimônio (BRL)<input className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground outline-none focus:border-primary" inputMode="decimal" value={settings.targetBRL} onChange={(event) => setSettings((value) => ({ ...value, targetBRL: event.target.value }))} placeholder="Ex.: 1000000" /></label>
          <label className="text-[12px] text-muted-foreground">Data da meta<input className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground outline-none focus:border-primary" type="date" value={settings.targetDate} onChange={(event) => setSettings((value) => ({ ...value, targetDate: event.target.value }))} /></label>
          <label className="text-[12px] text-muted-foreground">Taxa esperada ao ano (%)<input className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground outline-none focus:border-primary" inputMode="decimal" value={settings.annualRate} onChange={(event) => setSettings((value) => ({ ...value, annualRate: event.target.value }))} /></label>
        </div>
        {loading && currentBRL == null && <Skeleton className="h-44 w-full rounded-lg" />}
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>}
        {currentBRL != null && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Patrimônio atual" value={fmt(currentBRL, 'BRL')} hint="Consolidado de todas as contas UTA" />
          <Metric label="Prazo restante" value={months == null ? 'Defina uma data futura' : `${months} meses`} hint="Recalculado conforme o calendário avança" />
          <Metric label="Aporte mensal necessário" value={forecast ? fmt(forecast.requiredMonthlyContribution, 'BRL') : 'Defina a meta'} hint="Aporte no fim de cada mês" emphasis />
          <Metric label="Taxa mensal equivalente" value={forecast ? fmtPctSigned(forecast.monthlyRate * 100) : '—'} hint="Derivada da taxa anual informada" />
        </div>}
        {forecast && targetBRL != null && <div className="grid gap-3 md:grid-cols-2">
          <Metric label="Projeção sem novos aportes" value={fmt(forecast.projectedWithoutContributions, 'BRL')} hint={`Na data da meta, contra ${fmt(targetBRL, 'BRL')} desejados`} />
          <Metric label="Projeção com o aporte calculado" value={fmt(forecast.projectedWithRequiredContributions, 'BRL')} hint="Usa capitalização mensal; não inclui impostos, taxas ou inflação." emphasis />
        </div>}
        <p className="text-[11px] leading-relaxed text-muted-foreground">O patrimônio é atualizado ao consultar a página. O aporte necessário é recalculado automaticamente a cada mês porque o prazo restante diminui; altere a meta, o prazo ou a taxa sempre que seu plano mudar. Esta é uma simulação, não uma garantia de retorno.</p>
      </div>
    </div>
  </div>
}

function Metric({ label, value, hint, emphasis = false }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return <div className="rounded-lg border border-border bg-secondary/35 p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${emphasis ? 'text-primary' : 'text-foreground'}`}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>
}
