import { amakeRequest } from '../../core/provider/utils/helpers.js'
import { OpenBBError } from '../../core/provider/utils/errors.js'

const BASE_URL = 'https://api.hgbrasil.com/v2/finance'

export type HgResult = Record<string, unknown> & { symbol?: string; ticker?: string; quote?: Record<string, unknown>; market?: Record<string, unknown>; statements?: Array<Record<string, unknown>> }

interface HgResponse {
  metadata?: { key_status?: string; message?: string }
  results?: HgResult[]
  message?: string
  error?: string | boolean
}

export function ticker(symbol: string): string {
  const bare = symbol.trim().toUpperCase().replace(/\.SA$/, '')
  return bare.startsWith('B3:') ? bare : `B3:${bare}`
}

export async function request(path: string, tickers: string[], key: string, params: Record<string, string | null | undefined> = {}): Promise<HgResult[]> {
  const url = new URL(`${BASE_URL}/${path}`)
  url.searchParams.set('tickers', tickers.join(','))
  url.searchParams.set('key', key)
  for (const [name, value] of Object.entries(params)) if (value) url.searchParams.set(name, value)
  const response = await amakeRequest<HgResponse>(url.toString())
  if (!Array.isArray(response.results)) {
    const keyStatus = response.metadata?.key_status
    const reason = response.message ?? response.metadata?.message ?? (typeof response.error === 'string' ? response.error : null)
    throw new OpenBBError(`HG Brasil returned no results${keyStatus ? ` (key status: ${keyStatus})` : ''}${reason ? `: ${reason}` : '. Check the key type, plan access, and endpoint availability.'}`)
  }
  return response.results
}

export function symbolOf(row: HgResult): string {
  return String(row.symbol ?? row.ticker?.replace(/^B3:/, '') ?? '')
}

export function numberAt(data: Record<string, unknown>, path: string): number | null {
  const value = path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : null, data)
  return typeof value === 'number' ? value : null
}

export function normalizeStatement(row: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  const end = typeof row.end_date === 'string' ? row.end_date : ''
  return {
    ...Object.fromEntries(Object.entries(aliases).map(([target, source]) => [target, row[source] ?? null])),
    period_ending: end,
    fiscal_year: typeof row.fiscal_year === 'number' ? row.fiscal_year : end ? Number.parseInt(end.slice(0, 4), 10) : null,
    fiscal_period: row.fiscal_period ?? (row.period_type === 'quarterly' ? 'Q' : 'FY'),
  }
}
