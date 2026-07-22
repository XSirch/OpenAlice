import { QuoteHeader } from '../../components/market/QuoteHeader'
import { ProfilePanel } from '../../components/market/ProfilePanel'
import { KeyMetricsPanel } from '../../components/market/KeyMetricsPanel'
import { FinancialStatementsPanel } from '../../components/market/FinancialStatementsPanel'
import { KlinePanel } from '../../components/market/KlinePanel'
import { TradeableContractsPanel } from '../../components/market/TradeableContractsPanel'

interface Props {
  symbol: string
  source?: string
  provider?: string
}

export function EquityDetail({ symbol, source, provider }: Props) {
  const klineOnly = source?.startsWith('eastmoney|') === true
  return (
    <div className="flex flex-col gap-3">
      {klineOnly ? (
        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          Eastmoney provides Chinese A-share discovery and forward-adjusted price history for this source.
          Quote and fundamental panels are not available in its native symbol namespace.
        </div>
      ) : <QuoteHeader symbol={symbol} provider={provider} />}

      <div className="h-[360px] shrink-0">
        <KlinePanel selection={{ symbol, assetClass: 'equity' }} source={source} />
      </div>

      {!klineOnly && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ProfilePanel symbol={symbol} provider={provider} />
        <KeyMetricsPanel symbol={symbol} provider={provider} />
      </div>}

      <TradeableContractsPanel symbol={symbol} assetClass="equity" />

      {!klineOnly && <FinancialStatementsPanel symbol={symbol} provider={provider} />}
    </div>
  )
}
