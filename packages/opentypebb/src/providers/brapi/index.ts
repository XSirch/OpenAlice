/** brapi.dev provider — delayed Brazilian-market research data only. */
import { Provider } from '../../core/provider/abstract/provider.js'
import { BrapiEquitySearchFetcher } from './models/equity-search.js'
import { BrapiEquityQuoteFetcher } from './models/equity-quote.js'
import { BrapiEquityHistoricalFetcher } from './models/equity-historical.js'
import { BrapiEquityProfileFetcher } from './models/equity-profile.js'
import { BrapiKeyMetricsFetcher } from './models/key-metrics.js'
import { BrapiBalanceSheetFetcher } from './models/balance-sheet.js'
import { BrapiIncomeStatementFetcher } from './models/income-statement.js'
import { BrapiCashFlowStatementFetcher } from './models/cash-flow.js'
import { BrapiHistoricalDividendsFetcher } from './models/historical-dividends.js'

export const brapiProvider = new Provider({
  name: 'brapi',
  reprName: 'brapi.dev (Brasil)',
  website: 'https://brapi.dev/docs',
  credentials: ['api_key'],
  description: 'Brazilian equities, FIIs, BDRs and ETFs through brapi.dev. Delayed daily research data only.',
  instructions: 'Create a brapi.dev token in its dashboard. This provider is delayed and cannot be used for realtime B3 signals.',
  vendorMeta: {
    coverage: 'Brazilian B3 shares, FIIs, BDRs and ETFs; delayed research data.',
    howToUse: 'Enable brapi, configure its token under Market Data, then search by B3 ticker (for example PETR4, VALE3 or BOVA11). It is research-only: no realtime B3 signals or execution.',
  },
  fetcherDict: {
    EquitySearch: BrapiEquitySearchFetcher,
    EquityQuote: BrapiEquityQuoteFetcher,
    EquityHistorical: BrapiEquityHistoricalFetcher,
    EquityInfo: BrapiEquityProfileFetcher,
    KeyMetrics: BrapiKeyMetricsFetcher,
    BalanceSheet: BrapiBalanceSheetFetcher,
    IncomeStatement: BrapiIncomeStatementFetcher,
    CashFlowStatement: BrapiCashFlowStatementFetcher,
    HistoricalDividends: BrapiHistoricalDividendsFetcher,
  },
})
