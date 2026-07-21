import { amakeRequest } from '../../core/provider/utils/helpers.js'

const BRAPI_STOCKS_URL = 'https://brapi.dev/api/v2/stocks'

export interface BrapiQuote {
  symbol?: string
  shortName?: string
  longName?: string
  regularMarketPrice?: number
  regularMarketOpen?: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketPreviousClose?: number
  regularMarketChange?: number
  regularMarketChangePercent?: number
  regularMarketVolume?: number
  regularMarketTime?: string
  currency?: string
  exchange?: string
  quoteType?: string
  historicalDataPrice?: BrapiHistoricalBar[]
}

export interface BrapiHistoricalBar {
  date?: number | string
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
}

interface BrapiResponse {
  results?: Array<{ symbol?: string; data?: BrapiQuote }>
}

interface BrapiDataResponse<T> {
  results?: Array<{ symbol?: string; data?: T }>
}

function unpack(response: BrapiResponse): BrapiQuote[] {
  return (response.results ?? []).flatMap((result) => result.data
    ? [{ ...result.data, symbol: result.data.symbol ?? result.symbol }]
    : [])
}

function headers(apiKey?: string): Record<string, string> | undefined {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
}

export async function quote(symbols: string[], apiKey?: string): Promise<BrapiQuote[]> {
  const url = `${BRAPI_STOCKS_URL}/quote?symbols=${encodeURIComponent(symbols.join(','))}`
  const response = await amakeRequest<BrapiResponse>(url, { headers: headers(apiKey) })
  return unpack(response)
}

export async function historical(
  symbol: string,
  options: { startDate?: string | null; endDate?: string | null } = {},
  apiKey?: string,
): Promise<BrapiQuote[]> {
  const url = new URL(`${BRAPI_STOCKS_URL}/historical`)
  url.searchParams.set('symbols', symbol)
  url.searchParams.set('interval', '1d')
  if (options.startDate) url.searchParams.set('startDate', options.startDate)
  if (options.endDate) url.searchParams.set('endDate', options.endDate)
  if (!options.startDate && !options.endDate) url.searchParams.set('range', '1y')
  const response = await amakeRequest<BrapiResponse>(url.toString(), { headers: headers(apiKey) })
  return unpack(response)
}

export async function stockData<T>(
  path: string,
  symbol: string,
  apiKey?: string,
  parameters: Record<string, string | undefined> = {},
): Promise<Array<{ symbol: string; data: T }>> {
  const url = new URL(`${BRAPI_STOCKS_URL}/${path}`)
  url.searchParams.set('symbols', symbol)
  for (const [key, value] of Object.entries(parameters)) {
    if (value) url.searchParams.set(key, value)
  }
  const response = await amakeRequest<BrapiDataResponse<T>>(url.toString(), { headers: headers(apiKey) })
  return (response.results ?? []).flatMap((result) => result.data === undefined
    ? []
    : [{ symbol: result.symbol ?? symbol, data: result.data }])
}

export async function stockStatements(
  path: string,
  symbol: string,
  period: 'annual' | 'quarter',
  apiKey?: string,
): Promise<Array<{ symbol: string; data: Record<string, unknown> }>> {
  const rows = await stockData<Record<string, unknown>[]>(path, symbol, apiKey, {
    period: period === 'quarter' ? 'quarterly' : 'annual',
  })
  return rows.flatMap(({ symbol: resolvedSymbol, data }) => data.map((row) => ({ symbol: resolvedSymbol, data: row })))
}

export function normalizeStatementRow(data: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  const endDate = typeof data['endDate'] === 'string' ? data['endDate'] : null
  const type = data['type'] === 'quarterly' ? 'Q' : 'FY'
  return {
    ...data,
    period_ending: endDate ?? '',
    fiscal_period: type,
    fiscal_year: endDate ? Number.parseInt(endDate.slice(0, 4), 10) : null,
    ...Object.fromEntries(Object.entries(aliases).map(([target, source]) => [target, data[source] ?? null])),
  }
}

export function isoDate(value: number | string | undefined): string | null {
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
  }
  return null
}
