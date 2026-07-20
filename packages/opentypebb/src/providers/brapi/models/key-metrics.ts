import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { KeyMetricsQueryParamsSchema, KeyMetricsDataSchema } from '../../../standard-models/key-metrics.js'
import { EmptyDataError } from '../../../core/provider/utils/errors.js'
import { stockData } from '../common.js'

export const BrapiKeyMetricsQueryParamsSchema = KeyMetricsQueryParamsSchema
export type BrapiKeyMetricsQueryParams = z.infer<typeof BrapiKeyMetricsQueryParamsSchema>

export class BrapiKeyMetricsFetcher extends Fetcher {
  static override requireCredentials = false
  static override transformQuery(params: Record<string, unknown>): BrapiKeyMetricsQueryParams {
    return BrapiKeyMetricsQueryParamsSchema.parse(params)
  }
  static override async extractData(query: BrapiKeyMetricsQueryParams, credentials: Record<string, string> | null) {
    return stockData<Record<string, unknown>>('statistics?mode=current', query.symbol.replace(/\.SA$/i, ''), credentials?.brapi_api_key)
  }
  static override transformData(_query: BrapiKeyMetricsQueryParams, rows: Array<{ symbol: string; data: Record<string, unknown> }>) {
    if (!rows.length) throw new EmptyDataError('No brapi key metrics returned. Your brapi plan may not include statistics.')
    return rows.map(({ symbol, data }) => KeyMetricsDataSchema.parse({
      ...data,
      symbol,
      market_cap: data['marketCap'] ?? null,
      price_to_earnings: data['trailingPE'] ?? null,
      price_to_book: data['priceToBook'] ?? null,
      price_to_sales: data['priceToSalesTrailing12Months'] ?? null,
      peg_ratio: data['pegRatio'] ?? null,
      eps_ttm: data['trailingEps'] ?? data['earningsPerShare'] ?? null,
      ev_to_ebitda: data['enterpriseToEbitda'] ?? null,
      ev_to_sales: data['enterpriseToRevenue'] ?? null,
      enterprise_value: data['enterpriseValue'] ?? null,
      dividend_yield: data['dividendYield'] ?? data['yield'] ?? null,
      net_profit_margin: data['profitMargins'] ?? null,
      beta: data['beta'] ?? null,
      currency: 'BRL',
    }))
  }
}
