import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Position } from '../api'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, Skeleton } from '../components/StateViews'
import { contractPrimary } from '../lib/contract-display'
import { fmt, fmtNum, fmtPctSigned, fmtPnl } from '../lib/format'
import { displayProviderForUTA, filterAccountTierUTAs } from '../lib/uta-account-filter'

interface ReturnPosition extends Position {
  accountLabel: string
  accountProvider: string
}

interface FxRateInfo {
  currency: string
  rate: number
}

export function InvestmentReturnsPage() {
  const [positions, setPositions] = useState<ReturnPosition[]>([])
  const [fxRates, setFxRates] = useState<FxRateInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [utasResult, fxResult] = await Promise.all([
        api.trading.listUTASummaries(),
        api.trading.fxRates(['BRL']).catch(() => ({ rates: [] })),
      ])
      const accounts = filterAccountTierUTAs(utasResult.utas)
      const results = await Promise.all(accounts.map(async (account) => {
        const result = await api.trading.utaPositions(account.id).catch(() => ({ positions: [] as Position[] }))
        return result.positions.map((position) => ({
          ...position,
          accountLabel: account.label,
          accountProvider: displayProviderForUTA(account),
        }))
      }))
      setPositions(results.flat())
      setFxRates(fxResult.rates)
      setLastRefresh(new Date())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load investment returns.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const totals = useMemo(() => {
    const result = new Map<string, { cost: number; value: number; pnl: number }>()
    for (const position of positions) {
      const currency = position.currency || 'USD'
      const multiplier = Number(position.contract.multiplier ?? 1)
      const cost = Number(position.quantity) * Number(position.avgCost) * (Number.isFinite(multiplier) ? multiplier : 1)
      const entry = result.get(currency) ?? { cost: 0, value: 0, pnl: 0 }
      entry.cost += Number.isFinite(cost) ? cost : 0
      entry.value += Number(position.marketValue) || 0
      entry.pnl += Number(position.unrealizedPnL) || 0
      result.set(currency, entry)
    }
    return [...result.entries()]
  }, [positions])

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <PageHeader
        title="Investment returns"
        description="Cost basis and current performance across your connected accounts."
        live={{ lastUpdated: lastRefresh }}
        right={<button className="btn-secondary-sm" onClick={() => void refresh()} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>}
      />
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {loading && !lastRefresh ? <ReturnsSkeleton /> : (
          <div className="space-y-5">
            {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
            {totals.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {totals.map(([currency, total]) => {
                const pct = total.cost > 0 ? total.pnl / total.cost * 100 : null
                return <div key={currency} className="rounded-lg border border-border bg-secondary p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total return · {currency}</p>
                  <p className={`mt-2 text-xl font-semibold tabular-nums ${total.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtPnl(total.pnl, currency)}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{fmtPctSigned(pct)} · invested {fmt(total.cost, currency)} · current {fmt(total.value, currency)}</p>
                </div>
              })}
            </div>}
            {positions.length > 0 ? <InvestmentReturnsTable positions={positions} fxRates={fxRates} /> : !error && <EmptyState title="No open investments." />}
          </div>
        )}
      </div>
    </div>
  )
}

function InvestmentReturnsTable({ positions, fxRates }: { positions: ReturnPosition[]; fxRates: FxRateInfo[] }) {
  const rateMap = Object.fromEntries(fxRates.map((rate) => [rate.currency, rate.rate]))
  const hasNonUsd = positions.some((position) => position.currency && position.currency !== 'USD')
  return <div>
    <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Positions</h3>
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[13px]">
        <thead><tr className="bg-secondary text-left text-muted-foreground">
          <th className="px-3 py-2 font-medium">Asset</th><th className="px-3 py-2 text-center font-medium">Ccy</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Avg Cost</th><th className="px-3 py-2 text-right font-medium">Acquired</th><th className="px-3 py-2 text-right font-medium">Current</th><th className="px-3 py-2 text-right font-medium">Mkt Value</th>{hasNonUsd && <th className="px-3 py-2 text-right font-medium">USD Value</th>}<th className="px-3 py-2 text-right font-medium">Return</th><th className="px-3 py-2 text-right font-medium">Return %</th>
        </tr></thead>
        <tbody>{positions.map((position, index) => {
          const currency = position.currency || 'USD'
          const multiplier = Number(position.contract.multiplier ?? 1)
          const cost = Number(position.avgCost) * Number(position.quantity) * (Number.isFinite(multiplier) ? multiplier : 1)
          const pnl = Number(position.unrealizedPnL)
          const hasCostBasis = position.accountProvider !== 'pluggy' || position.costBasisSource != null
          const display = contractPrimary(position.contract)
          const usdValue = Number(position.marketValue) * (currency === 'USD' ? 1 : (rateMap[currency] ?? 1))
          const positive = pnl >= 0
          return <tr key={`${position.accountLabel}-${position.contract.aliceId ?? index}`} className="border-t border-border transition-colors hover:bg-muted/30">
            <td className="px-3 py-2"><div className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-foreground">{display}</span><span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground">{position.contract.secType || 'UNK'}</span><span className="text-[10px] text-muted-foreground">{position.accountLabel}</span></div></td>
            <td className="px-3 py-2 text-center text-[11px] text-muted-foreground">{currency}</td><td className="px-3 py-2 text-right text-foreground">{fmtNum(position.quantity)}</td><td className="px-3 py-2 text-right text-muted-foreground">{hasCostBasis ? fmt(position.avgCost, currency) : '—'}</td><td className="px-3 py-2 text-right text-[11px] text-muted-foreground">{position.acquiredAt ? new Date(position.acquiredAt).toLocaleDateString() : '—'}</td><td className="px-3 py-2 text-right text-foreground">{fmt(position.marketPrice, currency)}</td><td className="px-3 py-2 text-right text-foreground">{fmt(position.marketValue, currency)}</td>
            {hasNonUsd && <td className="px-3 py-2 text-right text-muted-foreground">{currency === 'USD' ? '—' : fmt(usdValue)}</td>}<td className={`px-3 py-2 text-right font-medium ${positive ? 'text-success' : 'text-destructive'}`}>{hasCostBasis ? fmtPnl(position.unrealizedPnL, currency) : '—'}</td><td className={`px-3 py-2 text-right ${positive ? 'text-success' : 'text-destructive'}`}>{hasCostBasis ? fmtPctSigned(cost > 0 ? pnl / cost * 100 : null) : '—'}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </div>
}

function ReturnsSkeleton() {
  return <div className="space-y-5" aria-hidden="true"><div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}</div><Skeleton className="h-64 w-full rounded-lg" /></div>
}
