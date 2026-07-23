/**
 * Brazil market-context board.
 *
 * BCB SGS is public and does not require a user credential. Its series are
 * official reference data, not executable prices. B3 index closes are fetched
 * through the existing keyless Yahoo index adapter and are therefore delayed.
 */

import type { IndexClientLike } from '../client/types.js'
import type { BrazilMarketBoard, MacroPoint, MacroSeriesCard, MacroUnit } from './types.js'

const BCB_SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'
const MAX_POINTS = 90

interface SgsRow { data: string; valor: string }

const BCB_SERIES = {
  selic: { id: 432, label: 'Selic meta', unit: 'percent' as const, days: 180 },
  cdi: { id: 12, label: 'CDI anualizado', unit: 'percent' as const, days: 90 },
  ipca: { id: 433, label: 'IPCA acumulado 12 meses', unit: 'percent' as const, days: 30 },
  usdBrl: { id: 1, label: 'Dólar comercial (venda)', unit: 'brl' as const, days: 90 },
} as const

function toIsoDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

function toNumber(value: string): number | null {
  // SGS normally uses a comma decimal separator, while some gateway responses
  // use a dot. Only discard dots when the string also carries a comma.
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

async function sgsSeries(id: number, days: number): Promise<MacroPoint[]> {
  const response = await fetch(`${BCB_SGS}.${id}/dados/ultimos/${days}?formato=json`)
  if (!response.ok) throw new Error(`Banco Central returned HTTP ${response.status} for SGS ${id}`)
  const rows = await response.json() as SgsRow[]
  if (!Array.isArray(rows)) throw new Error(`Banco Central returned an invalid SGS ${id} payload`)
  return rows
    .map((row) => ({ date: toIsoDate(row.data), value: toNumber(row.valor) }))
    .filter((row): row is MacroPoint => row.date != null && row.value != null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function card(id: string, label: string, unit: MacroUnit, points: MacroPoint[]): MacroSeriesCard {
  const recent = points.slice(-MAX_POINTS)
  const latest = recent.at(-1) ?? null
  const previous = recent.at(-2) ?? null
  return {
    id,
    label,
    unit,
    points: recent,
    latest: latest?.value ?? null,
    latestDate: latest?.date ?? null,
    change: latest && previous ? latest.value - previous.value : null,
  }
}

/** SGS 12 is a daily CDI rate in percent. Convert each observation to the
 * conventional annualized equivalent used in Brazilian fixed-income screens. */
function annualizeCdi(points: MacroPoint[]): MacroPoint[] {
  return points.map((point) => ({
    ...point,
    value: (Math.pow(1 + point.value / 100, 252) - 1) * 100,
  }))
}

/** SGS 433 publishes monthly IPCA variation. Compound rolling 12-month
 * windows instead of summing percentages so the displayed inflation is exact. */
function rollingIpca12m(points: MacroPoint[]): MacroPoint[] {
  return points.flatMap((point, index) => {
    if (index < 11) return []
    const value = points.slice(index - 11, index + 1)
      .reduce((acc, row) => acc * (1 + row.value / 100), 1)
    return [{ date: point.date, value: (value - 1) * 100 }]
  })
}

async function b3Indices(indexClient: IndexClientLike): Promise<MacroSeriesCard[]> {
  const start = new Date()
  start.setDate(start.getDate() - 120)
  const rows = await indexClient.getHistorical({
    provider: 'yfinance',
    symbol: 'br_bvsp,^IFIX',
    start_date: start.toISOString().slice(0, 10),
  })
  const rowsFor = (symbol: string): MacroPoint[] => rows
    .filter((row) => row.symbol?.toUpperCase() === symbol)
    .flatMap((row) => typeof row.close === 'number' && Number.isFinite(row.close)
      ? [{ date: row.date, value: row.close }]
      : [])
    .sort((a, b) => a.date.localeCompare(b.date))
  return [
    card('IBOV', 'Ibovespa', 'index', rowsFor('^BVSP')),
    card('IFIX', 'IFIX', 'index', rowsFor('^IFIX')),
  ]
}

export async function fetchBrazilMarketBoard(indexClient: IndexClientLike): Promise<BrazilMarketBoard> {
  const results = await Promise.allSettled([
    sgsSeries(BCB_SERIES.selic.id, BCB_SERIES.selic.days),
    sgsSeries(BCB_SERIES.cdi.id, BCB_SERIES.cdi.days),
    sgsSeries(BCB_SERIES.ipca.id, BCB_SERIES.ipca.days),
    sgsSeries(BCB_SERIES.usdBrl.id, BCB_SERIES.usdBrl.days),
    b3Indices(indexClient),
  ])
  const errors: Record<string, string> = {}
  const value = <T>(result: PromiseSettledResult<T>, key: string, fallback: T): T => {
    if (result.status === 'fulfilled') return result.value
    errors[key] = result.reason instanceof Error ? result.reason.message : String(result.reason)
    return fallback
  }
  const [selic, cdi, ipca, usdBrl, indices] = [
    value(results[0], 'selic', [] as MacroPoint[]),
    value(results[1], 'cdi', [] as MacroPoint[]),
    value(results[2], 'ipca', [] as MacroPoint[]),
    value(results[3], 'usdBrl', [] as MacroPoint[]),
    value(results[4], 'indices', [] as MacroSeriesCard[]),
  ]
  return {
    cards: [
      card('SELIC', BCB_SERIES.selic.label, 'percent', selic),
      card('CDI', BCB_SERIES.cdi.label, 'percent', annualizeCdi(cdi)),
      card('IPCA_12M', BCB_SERIES.ipca.label, 'percent', rollingIpca12m(ipca)),
      card('USDBRL', BCB_SERIES.usdBrl.label, 'brl', usdBrl),
      ...indices,
    ],
    ...(Object.keys(errors).length ? { errors } : {}),
    meta: { provider: 'Banco Central do Brasil + Yahoo Finance', asOf: new Date().toISOString(), origin: 'local' },
  }
}
