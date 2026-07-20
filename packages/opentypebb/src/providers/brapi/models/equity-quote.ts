import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { EquityQuoteQueryParamsSchema, EquityQuoteDataSchema } from '../../../standard-models/equity-quote.js'
import { EmptyDataError } from '../../../core/provider/utils/errors.js'
import { quote, type BrapiQuote } from '../common.js'

export const BrapiEquityQuoteQueryParamsSchema = EquityQuoteQueryParamsSchema
export type BrapiEquityQuoteQueryParams = z.infer<typeof BrapiEquityQuoteQueryParamsSchema>

export class BrapiEquityQuoteFetcher extends Fetcher {
  static override requireCredentials = false

  static override transformQuery(params: Record<string, unknown>): BrapiEquityQuoteQueryParams {
    return BrapiEquityQuoteQueryParamsSchema.parse(params)
  }

  static override async extractData(query: BrapiEquityQuoteQueryParams, credentials: Record<string, string> | null): Promise<BrapiQuote[]> {
    const symbols = query.symbol.split(',').map((symbol) => symbol.trim().replace(/\.SA$/i, '')).filter(Boolean)
    return quote(symbols, credentials?.brapi_api_key)
  }

  static override transformData(_query: BrapiEquityQuoteQueryParams, data: BrapiQuote[]) {
    if (!data.length) throw new EmptyDataError('No brapi quote returned for the requested symbol.')
    return data.map((row) => EquityQuoteDataSchema.parse({
      symbol: row.symbol,
      name: row.longName ?? row.shortName ?? null,
      exchange: row.exchange ?? 'B3',
      asset_type: row.quoteType ?? null,
      last_price: row.regularMarketPrice ?? null,
      open: row.regularMarketOpen ?? null,
      high: row.regularMarketDayHigh ?? null,
      low: row.regularMarketDayLow ?? null,
      close: row.regularMarketPrice ?? null,
      volume: row.regularMarketVolume ?? null,
      prev_close: row.regularMarketPreviousClose ?? null,
      change: row.regularMarketChange ?? null,
      change_percent: typeof row.regularMarketChangePercent === 'number' ? row.regularMarketChangePercent / 100 : null,
      last_timestamp: row.regularMarketTime ?? null,
    }))
  }
}
