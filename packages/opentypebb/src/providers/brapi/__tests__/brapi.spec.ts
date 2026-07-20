import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExecutor } from '../../../core/api/app-loader.js'

const quotePayload = {
  results: [{ symbol: 'PETR4', data: {
    shortName: 'PETR4', longName: 'Petroleo Brasileiro SA Pfd', currency: 'BRL',
    regularMarketPrice: 41.33, regularMarketOpen: 41.2, regularMarketDayHigh: 41.44,
    regularMarketDayLow: 40.47, regularMarketPreviousClose: 41.35,
    regularMarketChange: 0.43, regularMarketChangePercent: 1.05,
    regularMarketVolume: 22534600, regularMarketTime: '2026-07-20T19:50:30.000Z',
  } }],
}

afterEach(() => vi.unstubAllGlobals())

describe('brapi provider', () => {
  it('normalizes the nested quote response and sends a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(quotePayload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createExecutor().execute('brapi', 'EquityQuote', { symbol: 'PETR4' }, { brapi_api_key: 'test-token' }) as Array<Record<string, unknown>>

    expect(result[0]).toMatchObject({ symbol: 'PETR4', exchange: 'B3', close: 41.33, change_percent: 0.0105 })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('symbols=PETR4'), expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }))
  })

  it('normalizes and sorts daily history', async () => {
    const payload = { results: [{ symbol: 'PETR4', data: { historicalDataPrice: [
      { date: 1784516400, open: 41.2, high: 41.44, low: 40.47, close: 41.33, volume: 22534600 },
      { date: 1784257200, open: 40.41, high: 41.11, low: 40.41, close: 40.9, volume: 32148200 },
    ] } }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })))

    const result = await createExecutor().execute('brapi', 'EquityHistorical', { symbol: 'PETR4' }) as Array<Record<string, unknown>>

    expect(result).toHaveLength(2)
    expect(result.map((row) => row.date)).toEqual(['2026-07-17', '2026-07-20'])
  })
})
