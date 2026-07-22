import { z } from 'zod'
import { Fetcher } from '../../core/provider/abstract/fetcher.js'
import { EmptyDataError } from '../../core/provider/utils/errors.js'
import { EquitySearchQueryParamsSchema, EquitySearchDataSchema } from '../../standard-models/equity-search.js'
import { EquityQuoteQueryParamsSchema, EquityQuoteDataSchema } from '../../standard-models/equity-quote.js'
import { EquityHistoricalQueryParamsSchema, EquityHistoricalDataSchema } from '../../standard-models/equity-historical.js'
import { KeyMetricsQueryParamsSchema, KeyMetricsDataSchema } from '../../standard-models/key-metrics.js'
import { BalanceSheetQueryParamsSchema, BalanceSheetDataSchema } from '../../standard-models/balance-sheet.js'
import { IncomeStatementQueryParamsSchema, IncomeStatementDataSchema } from '../../standard-models/income-statement.js'
import { CashFlowStatementQueryParamsSchema, CashFlowStatementDataSchema } from '../../standard-models/cash-flow.js'
import { request, ticker, symbolOf, numberAt, normalizeStatement, type HgResult } from './common.js'

const keyOf = (credentials: Record<string, string> | null) => credentials?.hgbrasil_api_key ?? ''
const symbolsOf = (value: string) => value.split(',').map(ticker).filter(Boolean)

export class HgEquitySearchFetcher extends Fetcher {
  static override transformQuery = (p: Record<string, unknown>) => EquitySearchQueryParamsSchema.parse(p)
  static override async extractData(q: { query: string }, c: Record<string, string> | null) { return request('quotes', [ticker(q.query)], keyOf(c)) }
  static override transformData(_q: unknown, rows: HgResult[]) { return rows.map(row => EquitySearchDataSchema.parse({ symbol: symbolOf(row), name: row.full_name ?? row.name ?? null, exchange: 'B3' })) }
}

export class HgEquityQuoteFetcher extends Fetcher {
  static override transformQuery = (p: Record<string, unknown>) => EquityQuoteQueryParamsSchema.parse(p)
  static override async extractData(q: { symbol: string }, c: Record<string, string> | null) { return request('quotes', symbolsOf(q.symbol), keyOf(c)) }
  static override transformData(_q: unknown, rows: HgResult[]) {
    if (!rows.length) throw new EmptyDataError('No HG Brasil quote returned for the requested symbol.')
    return rows.map(row => {
      const quote = row.quote ?? {}, market = row.market ?? {}
      return EquityQuoteDataSchema.parse({ symbol: symbolOf(row), name: row.full_name ?? row.name ?? null, exchange: 'B3', asset_type: row.kind ?? null,
        last_price: quote.value ?? null, open: market.open ?? null, high: market.high ?? null, low: market.low ?? null, close: market.close ?? quote.value ?? null,
        volume: market.volume ?? null, prev_close: market.previous_value ?? null, change: quote.change_value ?? null,
        change_percent: typeof quote.change_percent === 'number' ? quote.change_percent / 100 : null, last_timestamp: quote.updated_at ?? market.updated_at ?? null })
    })
  }
}

export const HgHistoricalQuery = EquityHistoricalQueryParamsSchema.extend({ interval: z.string().default('1d') })
export class HgEquityHistoricalFetcher extends Fetcher {
  static override transformQuery = (p: Record<string, unknown>) => HgHistoricalQuery.parse(p)
  static override async extractData(q: z.infer<typeof HgHistoricalQuery>, c: Record<string, string> | null) { return request('history', [ticker(q.symbol)], keyOf(c), { start_date: q.start_date, end_date: q.end_date }) }
  static override transformData(_q: unknown, rows: HgResult[]) {
    const bars = rows.flatMap(row => Array.isArray((row as Record<string, unknown>).history) ? (row as Record<string, unknown>).history as Array<Record<string, unknown>> : [])
    if (!bars.length) throw new EmptyDataError('No HG Brasil historical data returned for the requested symbol.')
    return bars.map(bar => EquityHistoricalDataSchema.parse({ date: bar.date, open: bar.open ?? null, high: bar.high ?? null, low: bar.low ?? null, close: bar.close ?? null, volume: bar.volume ?? null })).sort((a, b) => a.date.localeCompare(b.date))
  }
}

export class HgKeyMetricsFetcher extends Fetcher {
  static override transformQuery = (p: Record<string, unknown>) => KeyMetricsQueryParamsSchema.parse(p)
  static override async extractData(q: { symbol: string }, c: Record<string, string> | null) { return request('fundamentals', symbolsOf(q.symbol), keyOf(c)) }
  static override transformData(_q: unknown, rows: HgResult[]) {
    if (!rows.length) throw new EmptyDataError('No HG Brasil fundamentals returned for the requested symbol.')
    return rows.map(row => {
      const statement = row.statements?.[0] ?? {}
      const data = statement as Record<string, unknown>
      return KeyMetricsDataSchema.parse({ symbol: symbolOf(row), currency: row.currency ?? 'BRL', market_cap: numberAt(row, 'quote.market_cap'), enterprise_value: numberAt(data, 'valuation.enterprise_value'), price_to_earnings: numberAt(data, 'valuation.price_to_earnings_ratio'), price_to_book: numberAt(data, 'valuation.price_to_book_ratio'), price_to_sales: numberAt(data, 'valuation.price_to_sales_ratio'), eps_ttm: numberAt(data, 'valuation.earnings_per_share'), ev_to_ebitda: numberAt(data, 'valuation.ev_to_ebitda'), dividend_yield: numberAt(data, 'dividends.yield_percent'), current_ratio: numberAt(data, 'leverage.current_ratio'), debt_to_equity: numberAt(data, 'leverage.debt_to_equity_ratio'), gross_profit_margin: numberAt(data, 'margins.gross_profit_margin'), operating_profit_margin: numberAt(data, 'margins.ebit_margin'), net_profit_margin: numberAt(data, 'margins.net_profit_margin'), return_on_equity: numberAt(data, 'profitability.return_on_equity'), return_on_assets: numberAt(data, 'profitability.return_on_assets') })
    })
  }
}

const statementQuery = (schema: z.AnyZodObject) => schema.extend({ period: z.enum(['annual', 'quarter']).default('annual'), limit: z.coerce.number().int().min(1).max(20).nullable().default(5) })
const balanceAliases = { cash_and_cash_equivalents: 'cash_and_cash_equivalents', total_assets: 'total_assets', total_current_assets: 'total_current_assets', total_liabilities: 'total_liabilities', total_current_liabilities: 'total_current_liabilities', total_common_equity: 'total_equity', long_term_debt: 'long_term_debt' }
const incomeAliases = { revenue: 'revenue', gross_profit: 'gross_profit', total_operating_income: 'operating_income', ebit: 'ebit', ebitda: 'ebitda', consolidated_net_income: 'net_income' }
const cashAliases = { net_cash_from_operating_activities: 'operating_cash_flow', net_cash_from_investing_activities: 'investing_cash_flow', net_cash_from_financing_activities: 'financing_cash_flow', free_cash_flow: 'free_cash_flow' }
function statementFetcher(path: string, schema: z.AnyZodObject, dataSchema: z.ZodTypeAny, aliases: Record<string, string>) {
  const query = statementQuery(schema)
  return class extends Fetcher {
    static override transformQuery = (p: Record<string, unknown>) => query.parse(p)
    static override async extractData(q: { symbol: string; period: 'annual' | 'quarter' }, c: Record<string, string> | null) { return request(path, [ticker(q.symbol)], keyOf(c), { period: q.period === 'quarter' ? 'quarterly' : 'annual' }) }
    static override transformData(q: { limit?: number | null }, rows: HgResult[]) { return rows.flatMap(row => (row.statements ?? []).slice(0, q.limit ?? 5).map(statement => dataSchema.parse(normalizeStatement(statement, aliases)))) }
  }
}
export const HgBalanceSheetFetcher = statementFetcher('balance-sheets', BalanceSheetQueryParamsSchema, BalanceSheetDataSchema, balanceAliases)
export const HgIncomeStatementFetcher = statementFetcher('income-statements', IncomeStatementQueryParamsSchema, IncomeStatementDataSchema, incomeAliases)
export const HgCashFlowStatementFetcher = statementFetcher('cash-flow-statements', CashFlowStatementQueryParamsSchema, CashFlowStatementDataSchema, cashAliases)
