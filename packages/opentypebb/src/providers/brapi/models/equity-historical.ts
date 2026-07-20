import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { EquityHistoricalQueryParamsSchema, EquityHistoricalDataSchema } from '../../../standard-models/equity-historical.js'
import { EmptyDataError } from '../../../core/provider/utils/errors.js'
import { historical, isoDate, type BrapiHistoricalBar } from '../common.js'

export const BrapiEquityHistoricalQueryParamsSchema = EquityHistoricalQueryParamsSchema.extend({
  // The chart can request intraday widths, but this research adapter always
  // returns daily bars rather than pretending those widths are supported.
  interval: z.string().default('1d').describe('Requested chart interval; brapi research bars are daily.'),
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
    const rows = await historical(symbol, { startDate: query.start_date, endDate: query.end_date }, credentials?.brapi_api_key)
    return rows.flatMap((row) => (row.historicalDataPrice ?? []).map((bar) => ({ ...bar, symbol: row.symbol ?? symbol })))
  }

  static override transformData(_query: BrapiEquityHistoricalQueryParams, data: HistoricalHit[]) {
    const rows = data.flatMap((bar) => {
      const date = isoDate(bar.date)
      return date ? [EquityHistoricalDataSchema.parse({ date, open: bar.open ?? null, high: bar.high ?? null, low: bar.low ?? null, close: bar.close ?? null, volume: bar.volume ?? null })] : []
    })
    if (!rows.length) throw new EmptyDataError('No brapi daily historical data returned for the requested symbol.')
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  }
}
