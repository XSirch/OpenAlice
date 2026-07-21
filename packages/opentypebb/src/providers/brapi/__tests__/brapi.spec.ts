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

  it('maps the Brazilian profile, statistics, and financial data endpoints into the shared models', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: {
        website: 'https://petrobras.com.br', sector: 'Energia', industry: 'Petróleo e Gás Integrado',
        longBusinessSummary: 'Integrated energy company.', fullTimeEmployees: 41778,
      } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: {
        marketCap: 527149170000, trailingPE: 5.48, priceToBook: 1.18, enterpriseValue: 1156526200000,
      } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: {
        returnOnEquity: 0.21, returnOnAssets: 0.08, grossMargins: 0.34, operatingMargins: 0.18,
        currentRatio: 1.4, debtToEquity: 0.7, financialCurrency: 'BRL',
      } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const executor = createExecutor()

    const profile = await executor.execute('brapi', 'EquityInfo', { symbol: 'PETR4' }) as Array<Record<string, unknown>>
    const metrics = await executor.execute('brapi', 'KeyMetrics', { symbol: 'PETR4' }) as Array<Record<string, unknown>>

    expect(profile[0]).toMatchObject({ symbol: 'PETR4', sector: 'Energia', employees: 41778 })
    expect(metrics[0]).toMatchObject({
      symbol: 'PETR4', market_cap: 527149170000, price_to_earnings: 5.48,
      return_on_equity: 0.21, return_on_assets: 0.08, gross_profit_margin: 0.34,
      operating_profit_margin: 0.18, current_ratio: 1.4, debt_to_equity: 0.7,
    })
    expect(fetchMock.mock.calls[1]?.[0]).toContain('statistics?mode=current&symbols=PETR4')
    expect(fetchMock.mock.calls[2]?.[0]).toContain('financial-data?mode=current&symbols=PETR4')
  })

  it('maps dividends and annual financial statements into the shared research contracts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: {
        cashDividends: [{ rate: 0.75, lastDatePrior: '2026-04-15T03:00:00.000Z' }],
      } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: [{
        type: 'yearly', endDate: '2025-12-31', cash: 35608000000, totalAssets: 1223389000000,
      }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: [{
        type: 'yearly', endDate: '2025-12-31', totalRevenue: 497549000000, netIncome: 110605000000,
      }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ symbol: 'PETR4', data: [{
        type: 'yearly', endDate: '2025-12-31', operatingCashFlow: 200333000000, freeCashFlow: 114219000000,
      }] }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const executor = createExecutor()

    const dividends = await executor.execute('brapi', 'HistoricalDividends', { symbol: 'PETR4', start_date: '2026-01-01' }) as Array<Record<string, unknown>>
    const balance = await executor.execute('brapi', 'BalanceSheet', { symbol: 'PETR4', period: 'annual' }) as Array<Record<string, unknown>>
    const income = await executor.execute('brapi', 'IncomeStatement', { symbol: 'PETR4', period: 'annual' }) as Array<Record<string, unknown>>
    const cash = await executor.execute('brapi', 'CashFlowStatement', { symbol: 'PETR4', period: 'annual' }) as Array<Record<string, unknown>>

    expect(dividends[0]).toMatchObject({ symbol: 'PETR4', ex_dividend_date: '2026-04-15', amount: 0.75 })
    expect(balance[0]).toMatchObject({ period_ending: '2025-12-31', cash_and_cash_equivalents: 35608000000, total_assets: 1223389000000 })
    expect(income[0]).toMatchObject({ period_ending: '2025-12-31', revenue: 497549000000, consolidated_net_income: 110605000000 })
    expect(cash[0]).toMatchObject({ period_ending: '2025-12-31', net_cash_from_operating_activities: 200333000000, free_cash_flow: 114219000000 })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('dividends?symbols=PETR4&startDate=2026-01-01')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('balance-sheet?symbols=PETR4&period=annual')
    expect(fetchMock.mock.calls[2]?.[0]).toContain('income-statement?symbols=PETR4&period=annual')
    expect(fetchMock.mock.calls[3]?.[0]).toContain('cash-flow?symbols=PETR4&period=annual')
  })
})
