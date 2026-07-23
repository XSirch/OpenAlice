import { useEffect, useMemo, useState } from 'react'
import { api, type Position } from '../../api'
import { fmt, fmtNum, fmtPctSigned } from '../../lib/format'
import { filterAccountTierUTAs } from '../../lib/uta-account-filter'
import { useWorkspace } from '../../tabs/store'

interface HoldingQuote {
  symbol: string
  name: string | null
  currency: string
  quantity: number
  marketValue: number
  accountLabels: string[]
  price: number | null
  changePercent: number | null
  quoteAt: string | null
  source: 'brapi' | 'portfolio'
}

function finite(value: string | number | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** B3 cash-equity and ETF symbols that brapi can resolve without ambiguity. */
function isB3Symbol(symbol: string, currency: string): boolean {
  return currency === 'BRL' && /^[A-Z]{4}\d{1,2}(?:F)?$/.test(symbol)
}

export function holdingsFromPositions(rows: Array<{ position: Position; accountLabel: string }>): HoldingQuote[] {
  const holdings = new Map<string, HoldingQuote>()
  for (const { position, accountLabel } of rows) {
    if (position.contract.secType !== 'STK') continue
    const symbol = position.contract.symbol?.trim().toUpperCase()
    const quantity = finite(position.quantity)
    const marketValue = finite(position.marketValue)
    if (!symbol || quantity == null || quantity <= 0 || marketValue == null || marketValue <= 0) continue
    const key = `${position.currency}:${symbol}`
    const existing = holdings.get(key)
    if (existing) {
      existing.quantity += quantity
      existing.marketValue += marketValue
      if (!existing.accountLabels.includes(accountLabel)) existing.accountLabels.push(accountLabel)
      continue
    }
    holdings.set(key, {
      symbol,
      name: position.contract.description ?? null,
      currency: position.currency,
      quantity,
      marketValue,
      accountLabels: [accountLabel],
      price: finite(position.marketPrice),
      changePercent: null,
      quoteAt: null,
      source: 'portfolio',
    })
  }
  return [...holdings.values()].sort((a, b) => b.marketValue - a.marketValue)
}

export function PortfolioEquityQuotes() {
  const [holdings, setHoldings] = useState<HoldingQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { utas } = await api.trading.listUTASummaries()
        const accounts = filterAccountTierUTAs(utas)
        const responses = await Promise.all(accounts.map(async (account) => {
          const response = await api.trading.utaPositions(account.id).catch(() => ({ positions: [] as Position[] }))
          return response.positions.map((position) => ({ position, accountLabel: account.label }))
        }))
        const next = holdingsFromPositions(responses.flat())
        const b3Symbols = next.filter((holding) => isB3Symbol(holding.symbol, holding.currency)).map((holding) => holding.symbol)
        if (b3Symbols.length > 0) {
          // brapi accepts a comma-separated batch. One read avoids a request
          // storm when the custody account holds several B3 positions.
          const quoteResponse = await api.market.equity.quote(b3Symbols.join(','), 'brapi').catch(() => null)
          for (const quote of quoteResponse?.results ?? []) {
            const symbol = typeof quote.symbol === 'string' ? quote.symbol.toUpperCase().replace(/\.SA$/, '') : ''
            const holding = next.find((entry) => entry.symbol === symbol && entry.currency === 'BRL')
            const lastPrice = typeof quote.last_price === 'number' ? quote.last_price : null
            if (!holding || lastPrice == null) continue
            holding.price = lastPrice
            holding.changePercent = typeof quote.change_percent === 'number' ? quote.change_percent * 100 : null
            holding.quoteAt = typeof quote.last_timestamp === 'string' ? quote.last_timestamp : null
            holding.source = 'brapi'
          }
        }
        if (active) setHoldings(next)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load portfolio equities.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const sourceSummary = useMemo(() => holdings.some((holding) => holding.source === 'brapi') ? 'brapi + carteira' : 'carteira', [holdings])

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Suas ações em carteira</h2>
        {!loading && holdings.length > 0 && <span className="text-[10px] text-muted-foreground">Fonte: {sourceSummary}</span>}
      </div>
      {loading && <div className="rounded-md border border-border bg-secondary/30 px-3 py-4 text-[12px] text-muted-foreground">Carregando posições e cotações…</div>}
      {error && <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] text-warning">{error}</div>}
      {!loading && !error && holdings.length === 0 && <p className="rounded-md border border-border bg-secondary/30 px-3 py-4 text-[12px] text-muted-foreground">Nenhuma posição em ações com saldo disponível.</p>}
      {holdings.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead><tr className="bg-secondary text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Ativo</th><th className="px-3 py-2 text-right font-medium">Última cotação</th><th className="px-3 py-2 text-right font-medium">Variação</th><th className="px-3 py-2 text-right font-medium">Quantidade</th><th className="px-3 py-2 text-right font-medium">Posição</th><th className="px-3 py-2 font-medium">Data-base</th>
            </tr></thead>
            <tbody>{holdings.map((holding) => (
              <tr key={`${holding.currency}:${holding.symbol}`} className="cursor-pointer border-t border-border transition-colors hover:bg-muted/30" onClick={() => openOrFocus({ kind: 'market-detail', params: { assetClass: 'equity', symbol: holding.symbol, ...(holding.source === 'brapi' ? { source: `brapi|${holding.symbol}` } : {}) } })}>
                <td className="px-3 py-2"><div className="font-mono font-semibold text-foreground">{holding.symbol}</div><div className="max-w-56 truncate text-[10px] text-muted-foreground">{holding.name ?? holding.accountLabels.join(', ')}</div></td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{fmt(holding.price, holding.currency)}{holding.source === 'portfolio' && <span className="ml-1 text-[10px] text-muted-foreground">carteira</span>}</td>
                <td className={`px-3 py-2 text-right font-mono ${holding.changePercent == null ? 'text-muted-foreground' : holding.changePercent >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtPctSigned(holding.changePercent)}</td>
                <td className="px-3 py-2 text-right text-foreground">{fmtNum(holding.quantity)}</td><td className="px-3 py-2 text-right text-foreground">{fmt(holding.marketValue, holding.currency)}</td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground">{holding.quoteAt ? new Date(holding.quoteAt).toLocaleString() : 'Última sincronização da carteira'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
