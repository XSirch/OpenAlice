import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { EquitySearchQueryParamsSchema, EquitySearchDataSchema } from '../../../standard-models/equity-search.js'
import { quote, type BrapiQuote } from '../common.js'

export const BrapiEquitySearchQueryParamsSchema = EquitySearchQueryParamsSchema
export type BrapiEquitySearchQueryParams = z.infer<typeof BrapiEquitySearchQueryParamsSchema>

export class BrapiEquitySearchFetcher extends Fetcher {
  static override requireCredentials = false

  static override transformQuery(params: Record<string, unknown>): BrapiEquitySearchQueryParams {
    return BrapiEquitySearchQueryParamsSchema.parse(params)
  }

  static override async extractData(query: BrapiEquitySearchQueryParams, credentials: Record<string, string> | null): Promise<BrapiQuote[]> {
    const symbol = query.query.trim().toUpperCase().replace(/\.SA$/, '')
    if (!/^[A-Z]{4,5}\d{1,2}$/.test(symbol)) return []
    return quote([symbol], credentials?.brapi_api_key)
  }

  static override transformData(_query: BrapiEquitySearchQueryParams, data: BrapiQuote[]) {
    return data.map((row) => EquitySearchDataSchema.parse({
      symbol: row.symbol,
      name: row.longName ?? row.shortName ?? null,
    }))
  }
}
