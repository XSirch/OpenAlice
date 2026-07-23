import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AccountInfo, type Position } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/StateViews'
import { fmt } from '../lib/format'
import { filterAccountTierUTAs } from '../lib/uta-account-filter'
import { compareToBalancedModel } from './model-portfolio'

interface ValuedPosition { secType?: string; valueBRL: number }
interface AccountRead { positions: Position[]; account: AccountInfo | null }

function numberOrNull(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** UTA FX rates express one unit of each currency in USD. Normalize every
 * position through USD, then to BRL, preserving the same convention as the
 * consolidated Portfolio and wealth forecast views. */
const USD_EQUIVALENTS = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI'])

function usdRate(currency: string, fx: Map<string, number>): number | null {
  const normalized = currency.toUpperCase()
  if (USD_EQUIVALENTS.has(normalized)) return 1
  const rate = fx.get(normalized)
  return rate != null && Number.isFinite(rate) && rate > 0 ? rate : null
}

function valueInBRL(value: number, currency: string, fx: Map<string, number>, brlRate: number): number | null {
  const rate = usdRate(currency, fx)
  return rate == null ? null : value * rate / brlRate
}

function positionsInBRL(positions: Position[], rates: Array<{ currency: string; rate: number }>): ValuedPosition[] {
  const fx = new Map(rates.map((rate) => [rate.currency.toUpperCase(), rate.rate]))
  const brlRate = fx.get('BRL')
  if (!brlRate || brlRate <= 0) return []
  return positions.flatMap((position) => {
    const value = numberOrNull(position.marketValue)
    const valueBRL = value == null ? null : valueInBRL(value, position.currency, fx, brlRate)
    if (position.side !== 'long' || valueBRL == null || valueBRL <= 0) return []
    return [{ secType: position.contract.secType, valueBRL }]
  })
}

/** CCXT exchanges such as Binance expose stablecoins as account cash instead
 * of positions. Add only the account value not already represented by marked
 * positions, preventing the cash balance from being omitted or double-counted. */
function accountCashResidual(read: AccountRead, rates: Array<{ currency: string; rate: number }>): ValuedPosition[] {
  if (!read.account) return []
  const fx = new Map(rates.map((rate) => [rate.currency.toUpperCase(), rate.rate]))
  const brlRate = fx.get('BRL')
  const equity = numberOrNull(read.account.netLiquidation)
  if (!brlRate || brlRate <= 0 || equity == null || equity <= 0) return []
  const accountBRL = valueInBRL(equity, read.account.baseCurrency, fx, brlRate)
  if (accountBRL == null) return []
  const positionsBRL = positionsInBRL(read.positions, rates).reduce((sum, position) => sum + position.valueBRL, 0)
  const residual = Math.max(0, accountBRL - positionsBRL)
  return residual > 0.01 ? [{ secType: 'CASH', valueBRL: residual }] : []
}

export function ModelPortfolioPage() {
  const [positions, setPositions] = useState<ValuedPosition[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ utas }, { rates }] = await Promise.all([api.trading.listUTASummaries(), api.trading.fxRates()])
      const accounts = filterAccountTierUTAs(utas)
      const responses = await Promise.all(accounts.map(async (account): Promise<AccountRead> => {
        const [positionResponse, accountResponse] = await Promise.all([
          api.trading.utaPositions(account.id).catch(() => ({ positions: [] as Position[] })),
          api.trading.utaAccount(account.id).catch(() => null),
        ])
        return { positions: positionResponse.positions, account: accountResponse }
      }))
      setPositions(responses.flatMap((response) => [
        ...positionsInBRL(response.positions, rates),
        ...accountCashResidual(response, rates),
      ]))
      setUpdatedAt(new Date())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as posições para comparação.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  const comparison = useMemo(() => compareToBalancedModel(positions), [positions])

  return <div className="flex min-h-0 flex-1 flex-col">
    <PageHeader title="Carteira-modelo" description="Comparação educativa por classe de ativo; não é recomendação individual nem ordem de investimento." live={{ lastUpdated: updatedAt }} right={<button className="btn-secondary-sm" onClick={() => void refresh()} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>} />
    <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6"><div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-[12px] text-muted-foreground"><span className="font-semibold text-foreground">Modelo balanceado:</span> renda fixa 45%, ações 25%, fundos e ETFs 20%, criptoativos 5% e caixa 5%. Os ajustes abaixo são lacunas matemáticas de rebalanceamento; não escolhem ativos, não consideram seu perfil, prazo, impostos ou liquidez e não executam operações.</section>
      {loading && positions.length === 0 && <Skeleton className="h-64 w-full rounded-lg" />}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>}
      {!loading && !error && comparison.totalBRL === 0 && <div className="rounded-lg border border-border bg-secondary/30 p-6 text-center text-[13px] text-muted-foreground">Nenhuma posição com valor e câmbio disponível foi encontrada nas contas conectadas.</div>}
      {comparison.totalBRL > 0 && <>
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="Patrimônio comparado" value={fmt(comparison.totalBRL, 'BRL')} hint="Posições longas convertidas para BRL" /><Metric label="Classes no modelo" value="5" hint="Alocação-modelo balanceada" /><Metric label="Não classificado" value={fmt(comparison.unclassifiedBRL, 'BRL')} hint="Fora do cálculo dos alvos" /></div>
        <section className="overflow-hidden rounded-lg border border-border"><div className="border-b border-border bg-secondary/35 px-4 py-3"><h2 className="text-[13px] font-semibold text-foreground">Comparação e movimentos indicativos</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Use como referência de aporte ou rebalanceamento; valide antes de movimentar recursos.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[12px]"><thead><tr className="bg-secondary/25 text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2.5 font-medium">Classe</th><th className="px-4 py-2.5 text-right font-medium">Sua carteira</th><th className="px-4 py-2.5 text-right font-medium">Modelo</th><th className="px-4 py-2.5 text-right font-medium">Diferença</th><th className="px-4 py-2.5 font-medium">Indicação</th></tr></thead><tbody>{comparison.rows.map((row) => { const direction = row.differenceBRL > comparison.totalBRL * 0.005 ? 'Aumentar exposição' : row.differenceBRL < -comparison.totalBRL * 0.005 ? 'Acima do modelo' : 'Próximo do modelo'; const color = direction === 'Aumentar exposição' ? 'text-success' : direction === 'Acima do modelo' ? 'text-warning' : 'text-muted-foreground'; return <tr key={row.bucket} className="border-t border-border"><td className="px-4 py-3 font-medium text-foreground">{row.label}</td><td className="px-4 py-3 text-right tabular-nums text-foreground">{row.currentPercent.toFixed(1)}% · {fmt(row.currentValueBRL, 'BRL')}</td><td className="px-4 py-3 text-right tabular-nums text-foreground">{row.targetPercent}% · {fmt(row.targetValueBRL, 'BRL')}</td><td className="px-4 py-3 text-right tabular-nums text-foreground">{row.differenceBRL >= 0 ? '+' : '−'}{fmt(Math.abs(row.differenceBRL), 'BRL')}</td><td className={`px-4 py-3 font-medium ${color}`}>{direction}</td></tr> })}</tbody></table></div></section>
        {comparison.unclassifiedBRL > 0 && <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-warning">Há posições sem uma classe compatível com o modelo. Elas entram no patrimônio comparado, mas não recebem alvo ou indicação de movimentação.</p>}
      </>}
    </div></div>
  </div>
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-lg border border-border bg-secondary/35 p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>
}
