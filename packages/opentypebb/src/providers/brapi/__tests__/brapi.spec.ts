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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createExecutor().execute('brapi', 'EquityHistorical', {
      symbol: 'PETR4', start_date: '2026-07-01', end_date: '2026-07-20',
    }) as Array<Record<string, unknown>>

    expect(result).toHaveLength(2)
    expect(result.map((row) => row.date)).toEqual(['2026-07-17', '2026-07-20'])
    expect(fetchMock.mock.calls[0]?.[0]).toContain('startDate=2026-07-01')
    expect(fetchMock.mock.calls[0]?.[0]).toContain('endDate=2026-07-20')
  })

  it('maps the Brazilian profile and statistics endpoints into the shared models', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: {
        website: 'https://petrobras.com.br', sector: 'Energia', industry: 'Petróleo e Gás Integrado',
        longBusinessSummary: 'Integrated energy company.', fullTimeEmployees: 41778,
      } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: {
        marketCap: 527149170000, trailingPE: 5.48, priceToBook: 1.18, enterpriseValue: 1156526200000,
      } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const executor = createExecutor()

    const profile = await executor.execute('brapi', 'EquityInfo', { symbol: 'PETR4' }) as Array<Record<string, unknown>>
    const metrics = await executor.execute('brapi', 'KeyMetrics', { symbol: 'PETR4' }) as Array<Record<string, unknown>>

    expect(profile[0]).toMatchObject({ symbol: 'PETR4', sector: 'Energia', employees: 41778 })
    expect(metrics[0]).toMatchObject({ symbol: 'PETR4', market_cap: 527149170000, price_to_earnings: 5.48 })
    expect(fetchMock.mock.calls[1]?.[0]).toContain('statistics?mode=current&symbols=PETR4')
  })
})
