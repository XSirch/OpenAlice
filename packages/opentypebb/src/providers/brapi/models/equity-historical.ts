import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { EquityHistoricalQueryParamsSchema, EquityHistoricalDataSchema } from '../../../standard-models/equity-historical.js'
import { EmptyDataError } from '../../../core/provider/utils/errors.js'
import { historical, isBrapiIntradayInterval, isoDate, isoTimestamp, type BrapiHistoricalBar } from '../common.js'

export const BrapiEquityHistoricalQueryParamsSchema = EquityHistoricalQueryParamsSchema.extend({
  interval: z.string().default('1d').describe('BRAPI OHLCV interval. Intraday intervals are limited to the latest seven days.'),
})
export type BrapiEquityHistoricalQueryParams = z.infer<typeof BrapiEquityHistoricalQueryParamsSchema>

interface HistoricalHit extends BrapiHistoricalBar { symbol: string }

export class BrapiEquityHistoricalFetcher extends Fetcher {
  static override requireCredentials = false

  static override transformQuery(params: Record<string, unknown>): BrapiEquityHistoricalQueryParams {
    return BrapiEquityHistoricalQueryParamsSchema.parse(params)
  }

  static override async extractData(query: BrapiEquityHistoricalQueryParams, credentials: Record<string, string> | null): Promise<HistoricalHit[]> {
    const symbol = query.symbol.trim().replace(/\.SA$/i, '')
    const rows = await historical(symbol, {
      startDate: query.start_date,
      endDate: query.end_date,
      interval: query.interval,
    }, credentials?.brapi_api_key)
    return rows.flatMap((row) => (row.historicalDataPrice ?? []).map((bar) => ({ ...bar, symbol: row.symbol ?? symbol })))
  }

  static override transformData(query: BrapiEquityHistoricalQueryParams, data: HistoricalHit[]) {
    const intraday = isBrapiIntradayInterval(query.interval)
    const rows = data.flatMap((bar) => {
      const date = intraday ? isoTimestamp(bar.date) : isoDate(bar.date)
      return date ? [EquityHistoricalDataSchema.parse({ date, open: bar.open ?? null, high: bar.high ?? null, low: bar.low ?? null, close: bar.close ?? null, volume: bar.volume ?? null })] : []
    })
    if (!rows.length) throw new EmptyDataError('No brapi historical data returned for the requested symbol and interval.')
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  }
}
