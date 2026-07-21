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

export const BRAPI_INTRADAY_INTERVALS = new Set([
  '1m', '2m', '5m', '15m', '30m', '60m', '1h', '90m',
])

export function isBrapiIntradayInterval(interval: string): boolean {
  return BRAPI_INTRADAY_INTERVALS.has(interval)
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
  options: { startDate?: string | null; endDate?: string | null; interval?: string } = {},
  apiKey?: string,
): Promise<BrapiQuote[]> {
  const url = new URL(`${BRAPI_STOCKS_URL}/historical`)
  url.searchParams.set('symbols', symbol)
  const interval = options.interval ?? '1d'
  url.searchParams.set('interval', interval)
  const window = clampBrapiIntradayWindow(options, interval)
  if (window.startDate) url.searchParams.set('startDate', window.startDate)
  if (window.endDate) url.searchParams.set('endDate', window.endDate)
  if (!window.startDate && !window.endDate) url.searchParams.set('range', isBrapiIntradayInterval(interval) ? '7d' : '1y')
  const response = await amakeRequest<BrapiResponse>(url.toString(), { headers: headers(apiKey) })
  return unpack(response)
}

/** BRAPI serves intraday candles for a maximum seven-day window. Clamp here so
 * CLI/API callers get the same safe request as the chart, rather than a 400 or
 * an unexpected daily fallback from the upstream service. */
function clampBrapiIntradayWindow(
  options: { startDate?: string | null; endDate?: string | null },
  interval: string,
): { startDate?: string | null; endDate?: string | null } {
  if (!isBrapiIntradayInterval(interval) || !options.startDate) return options
  const end = parseUtcDate(options.endDate) ?? new Date()
  const earliest = new Date(end)
  earliest.setUTCDate(earliest.getUTCDate() - 7)
  const requestedStart = parseUtcDate(options.startDate)
  if (!requestedStart || requestedStart >= earliest) return options
  return { ...options, startDate: earliest.toISOString().slice(0, 10) }
}

function parseUtcDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
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

/** Preserve the time component of intraday candles. */
export function isoTimestamp(value: number | string | undefined): string | null {
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ')
}
