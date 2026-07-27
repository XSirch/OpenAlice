import Decimal from 'decimal.js'
import { projectFixedIncome } from './calculations.js'
import type { FixedIncomePosition } from './contracts.js'

export type MaturityBucket = 'past_due' | 'up_to_30_days' | '31_to_90_days' | '91_to_180_days' | '181_to_365_days' | 'over_365_days'

export interface FixedIncomeLadderInput {
  positions: FixedIncomePosition[]
  asOf: string
  annualCdiPct?: string
  annualIpcaPct?: string
}

export interface FixedIncomeLadderEntry {
  id: string
  issuer: string
  productType: FixedIncomePosition['product']['productType']
  maturityDate: string
  bucket: MaturityBucket
  daysToMaturity: number
  redemption: FixedIncomePosition['product']['liquidity']['redemption']
  liquidityDays: number
  currentAmountBRL: string
  marketValueBRL: string | null
  redemptionAmountBRL: string | null
  annualGrossRatePct: string | null
  annualNetRatePct: string | null
  benchmark: 'CDI' | 'IPCA' | 'fixed' | 'other'
  assumptions: string[]
  gaps: string[]
}

export interface FixedIncomeLadder {
  asOf: string
  buckets: Record<MaturityBucket, { currentAmountBRL: string; entries: FixedIncomeLadderEntry[] }>
  disclaimer: string
}

/**
 * Builds a read-only liquidity/maturity ladder. A net-rate estimate is shown
 * only when the custody has an acquisition date and all required indexers are
 * supplied; otherwise the missing fact is explicit rather than guessed.
 */
export function buildFixedIncomeLadder(input: FixedIncomeLadderInput): FixedIncomeLadder {
  const asOf = parseDate(input.asOf)
  const orderedBuckets: MaturityBucket[] = ['past_due', 'up_to_30_days', '31_to_90_days', '91_to_180_days', '181_to_365_days', 'over_365_days']
  const buckets = orderedBuckets.reduce<FixedIncomeLadder['buckets']>((result, bucket) => {
    result[bucket] = { currentAmountBRL: '0.00', entries: [] }
    return result
  }, {} as FixedIncomeLadder['buckets'])
  for (const position of input.positions) {
    const maturity = parseDate(position.product.maturityDate)
    const daysToMaturity = Math.ceil((maturity.getTime() - asOf.getTime()) / 86_400_000)
    const bucket = toBucket(daysToMaturity)
    const gaps: string[] = []
    const assumptions = [...position.product.assumptions]
    const annualGrossRatePct = grossRate(position, input.annualCdiPct, input.annualIpcaPct, gaps)
    const annualNetRatePct = netRate(position, asOf, input, gaps, assumptions)
    const entry: FixedIncomeLadderEntry = {
      id: position.id,
      issuer: position.product.issuer.legalName,
      productType: position.product.productType,
      maturityDate: position.product.maturityDate,
      bucket,
      daysToMaturity,
      redemption: position.product.liquidity.redemption,
      liquidityDays: position.product.liquidity.settlementBusinessDays + position.product.liquidity.noticeBusinessDays,
      currentAmountBRL: money(new Decimal(position.currentAmountBRL)),
      marketValueBRL: position.marketValueBRL ?? null,
      redemptionAmountBRL: position.redemptionAmountBRL ?? null,
      annualGrossRatePct,
      annualNetRatePct,
      benchmark: position.product.rate.kind === 'cdi_percentage' ? 'CDI' : position.product.rate.kind === 'ipca_plus' ? 'IPCA' : position.product.rate.kind === 'fixed' ? 'fixed' : 'other',
      assumptions,
      gaps,
    }
    buckets[bucket].entries.push(entry)
    buckets[bucket].currentAmountBRL = money(new Decimal(buckets[bucket].currentAmountBRL).plus(position.currentAmountBRL))
  }
  return { buckets, asOf: input.asOf, disclaimer: 'Estimativas informativas: não representam oferta, recomendação, garantia de resgate ou cálculo tributário individual.' }
}

function grossRate(position: FixedIncomePosition, cdi: string | undefined, ipca: string | undefined, gaps: string[]): string | null {
  const rate = position.product.rate
  if (rate.kind === 'fixed') return rate.annualRatePct
  if (rate.kind === 'other') return rate.annualRatePct ?? null
  if (rate.kind === 'cdi_percentage') {
    if (!cdi) { gaps.push('CDI annualized is required to compare this position.'); return null }
    return new Decimal(cdi).mul(rate.cdiPct).div(100).toDecimalPlaces(4).toFixed(4)
  }
  if (!ipca) { gaps.push('IPCA annualized is required to compare this position.'); return null }
  return new Decimal(1).plus(new Decimal(ipca).div(100)).mul(new Decimal(1).plus(new Decimal(rate.spreadPct).div(100))).minus(1).mul(100).toDecimalPlaces(4).toFixed(4)
}

function netRate(position: FixedIncomePosition, asOf: Date, input: FixedIncomeLadderInput, gaps: string[], assumptions: string[]): string | null {
  if (!position.acquiredDate) { gaps.push('Custody did not provide an acquisition date; net rate is not estimated.'); return null }
  const acquired = parseDate(position.acquiredDate)
  const maturity = parseDate(position.product.maturityDate)
  const holdingDays = Math.max(0, Math.round((maturity.getTime() - acquired.getTime()) / 86_400_000))
  if (holdingDays <= 0 || maturity <= asOf) { gaps.push('Position is at or past maturity; no forward net-rate estimate is available.'); return null }
  try {
    const projection = projectFixedIncome({
      product: position.product,
      principalBRL: position.investedAmountBRL,
      calendarDays: holdingDays,
      businessDays: Math.round(holdingDays * 252 / 365),
      annualCdiPct: input.annualCdiPct,
      annualIpcaPct: input.annualIpcaPct,
    })
    assumptions.push('Net rate assumes contractual rate, the supplied indexer and current Brazilian IOF/IR brackets; it excludes issuer/default, reinvestment and mark-to-market effects.')
    return new Decimal(projection.netBRL).div(position.investedAmountBRL).pow(new Decimal(365).div(holdingDays)).minus(1).mul(100).toDecimalPlaces(4).toFixed(4)
  } catch (error) {
    gaps.push(error instanceof Error ? error.message : String(error))
    return null
  }
}

function toBucket(days: number): MaturityBucket {
  if (days < 0) return 'past_due'
  if (days <= 30) return 'up_to_30_days'
  if (days <= 90) return '31_to_90_days'
  if (days <= 180) return '91_to_180_days'
  if (days <= 365) return '181_to_365_days'
  return 'over_365_days'
}
function parseDate(value: string): Date { return new Date(`${value.slice(0, 10)}T00:00:00.000Z`) }
function money(value: Decimal): string { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
