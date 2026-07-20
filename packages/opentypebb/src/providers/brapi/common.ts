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

export async function historical(symbol: string, apiKey?: string): Promise<BrapiQuote[]> {
  const url = `${BRAPI_STOCKS_URL}/historical?symbols=${encodeURIComponent(symbol)}&range=1y&interval=1d`
  const response = await amakeRequest<BrapiResponse>(url, { headers: headers(apiKey) })
  return unpack(response)
}

export async function stockData<T>(path: string, symbol: string, apiKey?: string): Promise<Array<{ symbol: string; data: T }>> {
  const url = new URL(`${BRAPI_STOCKS_URL}/${path}`)
  url.searchParams.set('symbols', symbol)
  const response = await amakeRequest<BrapiDataResponse<T>>(url.toString(), { headers: headers(apiKey) })
  return (response.results ?? []).flatMap((result) => result.data === undefined
    ? []
    : [{ symbol: result.symbol ?? symbol, data: result.data }])
}

export function isoDate(value: number | string | undefined): string | null {
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
  }
  return null
}
