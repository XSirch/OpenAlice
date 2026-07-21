import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { HistoricalDividendsQueryParamsSchema, HistoricalDividendsDataSchema } from '../../../standard-models/historical-dividends.js'
import { isoDate, stockData } from '../common.js'

export const BrapiHistoricalDividendsQueryParamsSchema = HistoricalDividendsQueryParamsSchema
export type BrapiHistoricalDividendsQueryParams = z.infer<typeof BrapiHistoricalDividendsQueryParamsSchema>

type BrapiDividendEvent = { rate?: number; lastDatePrior?: string; paymentDate?: string }
type BrapiDividends = { cashDividends?: BrapiDividendEvent[] }

export class BrapiHistoricalDividendsFetcher extends Fetcher {
  static override requireCredentials = false
  static override transformQuery(params: Record<string, unknown>): BrapiHistoricalDividendsQueryParams {
    return BrapiHistoricalDividendsQueryParamsSchema.parse(params)
  }
  static override async extractData(query: BrapiHistoricalDividendsQueryParams, credentials: Record<string, string> | null) {
    return stockData<BrapiDividends>('dividends', query.symbol.replace(/\.SA$/i, ''), credentials?.brapi_api_key, {
      startDate: query.start_date ?? undefined,
      endDate: query.end_date ?? undefined,
    })
  }
  static override transformData(_query: BrapiHistoricalDividendsQueryParams, rows: Array<{ symbol: string; data: BrapiDividends }>) {
    return rows.flatMap(({ symbol, data }) => (data.cashDividends ?? []).flatMap((event) => {
      const date = isoDate(event.lastDatePrior ?? event.paymentDate)
      return typeof event.rate === 'number' && date
        ? [HistoricalDividendsDataSchema.parse({ symbol, ex_dividend_date: date, amount: event.rate })]
        : []
    }))
  }
}
