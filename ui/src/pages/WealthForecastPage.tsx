import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import { MeasuredChartFrame } from '../components/MeasuredChartFrame'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/StateViews'
import { fmt, fmtPctSigned } from '../lib/format'
import { calculateWealthForecast } from './wealth-forecast'

interface ForecastSettings { monthlyContributionBRL: string; horizonYears: string; annualRate: string }
const STORAGE_KEY = 'openalice.wealth-forecast.v1'

function readSettings(): ForecastSettings {
  if (typeof window === 'undefined') return { monthlyContributionBRL: '', horizonYears: '10', annualRate: '8' }
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ForecastSettings>
    return { monthlyContributionBRL: value.monthlyContributionBRL ?? '', horizonYears: value.horizonYears ?? '10', annualRate: value.annualRate ?? '8' }
  } catch { return { monthlyContributionBRL: '', horizonYears: '10', annualRate: '8' } }
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
      if (!Number.isFinite(usd) || !brlRate || !Number.isFinite(brlRate) || brlRate <= 0) throw new Error('Não foi possível converter o patrimônio consolidado para BRL.')
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

  const monthlyContributionBRL = positiveNumber(settings.monthlyContributionBRL)
  const annualRate = positiveNumber(settings.annualRate)
  const horizonYears = positiveNumber(settings.horizonYears)
  const months = horizonYears != null ? Math.round(horizonYears * 12) : null
  const forecast = useMemo(() => currentBRL != null && monthlyContributionBRL != null && annualRate != null && months != null && months > 0
    ? calculateWealthForecast({ currentWealth: currentBRL, monthlyContribution: monthlyContributionBRL, months, expectedAnnualRatePercent: annualRate })
    : null, [annualRate, currentBRL, monthlyContributionBRL, months])

  return <div className="flex min-h-0 flex-1 flex-col">
    <PageHeader title="Previsão de patrimônio" description="Simule a evolução pelo seu aporte mensal e pela taxa de retorno esperada." live={{ lastUpdated: updatedAt }} right={<button className="btn-secondary-sm" onClick={() => void refresh()} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>} />
    <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6"><div className="mx-auto max-w-5xl space-y-5">
      <div className="grid gap-3 rounded-lg border border-border bg-secondary/35 p-4 md:grid-cols-3">
        <label className="text-[12px] text-muted-foreground">Aporte mensal (BRL)<input className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground outline-none focus:border-primary" inputMode="decimal" value={settings.monthlyContributionBRL} onChange={(event) => setSettings((value) => ({ ...value, monthlyContributionBRL: event.target.value }))} placeholder="Ex.: 2000" /></label>
        <label className="text-[12px] text-muted-foreground">Horizonte (anos)<input className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground outline-none focus:border-primary" inputMode="decimal" value={settings.horizonYears} onChange={(event) => setSettings((value) => ({ ...value, horizonYears: event.target.value }))} /></label>
        <label className="text-[12px] text-muted-foreground">Taxa esperada ao ano (%)<input className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-foreground outline-none focus:border-primary" inputMode="decimal" value={settings.annualRate} onChange={(event) => setSettings((value) => ({ ...value, annualRate: event.target.value }))} /></label>
      </div>
      {loading && currentBRL == null && <Skeleton className="h-44 w-full rounded-lg" />}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>}
      {currentBRL != null && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Patrimônio atual" value={fmt(currentBRL, 'BRL')} hint="Consolidado de todas as contas UTA" />
        <Metric label="Horizonte da projeção" value={months == null ? 'Defina o horizonte' : `${months} meses`} hint="Período escolhido para a simulação" />
        <Metric label="Aporte mensal" value={monthlyContributionBRL == null ? 'Defina o aporte' : fmt(monthlyContributionBRL, 'BRL')} hint="Considerado no fim de cada mês" emphasis />
        <Metric label="Taxa mensal equivalente" value={forecast ? fmtPctSigned(forecast.monthlyRate * 100) : '—'} hint="Derivada da taxa anual informada" />
      </div>}
      {forecast && <>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Patrimônio projetado" value={fmt(forecast.projectedWealth, 'BRL')} hint={`Ao fim de ${months} meses`} emphasis />
          <Metric label="Total aportado" value={fmt(forecast.totalContributions, 'BRL')} hint="Somente os novos aportes" />
          <Metric label="Juros acumulados" value={fmt(forecast.totalInterest, 'BRL')} hint="Retorno sobre patrimônio e aportes" />
        </div>
        <section className="rounded-lg border border-border bg-secondary/25 p-4"><div className="mb-3"><h2 className="text-[13px] font-semibold text-foreground">Evolução projetada</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Azul: capital inicial + aportes. Verde: juros acumulados.</p></div><MeasuredChartFrame className="h-72">{({ width, height }) => <AreaChart width={width} height={height} data={forecast.points} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}><defs><linearGradient id="forecastPrincipal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.42} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.04} /></linearGradient><linearGradient id="forecastInterest" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0.08} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} /><XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(month: number) => `${month}m`} stroke="var(--border)" minTickGap={36} /><YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(value: number) => `R$ ${(value / 1000).toFixed(0)}k`} stroke="var(--border)" width={54} /><Tooltip formatter={(value, name) => [fmt(Number(value), 'BRL'), name === 'principal' ? 'Capital + aportes' : 'Juros']} labelFormatter={(month) => `Mês ${month}`} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 11 }} /><Legend formatter={(value) => value === 'principal' ? 'Capital + aportes' : 'Juros'} wrapperStyle={{ fontSize: 11 }} /><Area type="monotone" dataKey="principal" stackId="wealth" stroke="var(--primary)" fill="url(#forecastPrincipal)" isAnimationActive={false} /><Area type="monotone" dataKey="interest" stackId="wealth" stroke="var(--success)" fill="url(#forecastInterest)" isAnimationActive={false} /></AreaChart>}</MeasuredChartFrame></section>
      </>}
      <p className="text-[11px] leading-relaxed text-muted-foreground">O patrimônio é atualizado ao consultar a página. A projeção considera aporte no fim de cada mês e capitalização mensal; não inclui impostos, taxas ou inflação. É uma simulação, não uma garantia de retorno.</p>
    </div></div>
  </div>
}

function Metric({ label, value, hint, emphasis = false }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return <div className="rounded-lg border border-border bg-secondary/35 p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${emphasis ? 'text-primary' : 'text-foreground'}`}>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>
}
