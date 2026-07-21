import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { EquityInfoQueryParamsSchema, EquityInfoDataSchema } from '../../../standard-models/equity-info.js'
import { EmptyDataError } from '../../../core/provider/utils/errors.js'
import { stockData } from '../common.js'

export const BrapiEquityProfileQueryParamsSchema = EquityInfoQueryParamsSchema
export type BrapiEquityProfileQueryParams = z.infer<typeof BrapiEquityProfileQueryParamsSchema>

export class BrapiEquityProfileFetcher extends Fetcher {
  static override requireCredentials = false
  static override transformQuery(params: Record<string, unknown>): BrapiEquityProfileQueryParams {
    return BrapiEquityProfileQueryParamsSchema.parse(params)
  }
  static override async extractData(query: BrapiEquityProfileQueryParams, credentials: Record<string, string> | null) {
    return stockData<Record<string, unknown>>('profile', query.symbol.replace(/\.SA$/i, ''), credentials?.brapi_api_key)
  }
  static override transformData(_query: BrapiEquityProfileQueryParams, rows: Array<{ symbol: string; data: Record<string, unknown> }>) {
    if (!rows.length) throw new EmptyDataError('No brapi profile data returned.')
    return rows.map(({ symbol, data }) => EquityInfoDataSchema.parse({
      symbol,
      name: data['name'] ?? null,
      company_url: data['website'] ?? null,
      sector: data['sector'] ?? null,
      industry_category: data['industry'] ?? null,
      long_description: data['longBusinessSummary'] ?? data['description'] ?? null,
      employees: data['fullTimeEmployees'] ?? null,
      hq_address1: data['address1'] ?? null,
      hq_address_city: data['city'] ?? null,
      hq_state: data['state'] ?? null,
      hq_address_postal_code: data['zip'] ?? null,
      hq_country: data['country'] ?? null,
      business_phone_no: data['phone'] ?? null,
      first_fundamental_date: data['startDate'] ?? null,
    }))
  }
}
