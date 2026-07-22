import { Provider } from '../../core/provider/abstract/provider.js'
import { HgEquitySearchFetcher, HgEquityQuoteFetcher, HgEquityHistoricalFetcher, HgKeyMetricsFetcher, HgBalanceSheetFetcher, HgIncomeStatementFetcher, HgCashFlowStatementFetcher } from './models.js'

export const hgbrasilProvider = new Provider({
  name: 'hgbrasil', reprName: 'HG Brasil Finance', website: 'https://hgbrasil.com/docs/finance', credentials: ['api_key'],
  description: 'Delayed Brazilian B3 research data through HG Brasil Finance. Never a realtime signal or execution source.',
  instructions: 'Configure an HG Brasil Finance key in Settings → Market Data. This source is delayed and research-only.',
  vendorMeta: { coverage: 'B3 shares, FIIs, BDRs, ETFs, dividends and fundamentals; delayed research data.', howToUse: 'Enable HG Brasil and add an API key under Market Data. It is research-only: no realtime B3 signals or execution.' },
  fetcherDict: { EquitySearch: HgEquitySearchFetcher, EquityQuote: HgEquityQuoteFetcher, EquityHistorical: HgEquityHistoricalFetcher, KeyMetrics: HgKeyMetricsFetcher, BalanceSheet: HgBalanceSheetFetcher, IncomeStatement: HgIncomeStatementFetcher, CashFlowStatement: HgCashFlowStatementFetcher },
})
