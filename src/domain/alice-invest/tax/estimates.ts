import Decimal from 'decimal.js'

export type TaxEstimateAssetClass = 'b3_equity_common' | 'b3_fii' | 'fixed_income' | 'fund' | 'crypto'
export interface TaxEstimateInput { assetClass: TaxEstimateAssetClass; grossSalesBRL?: string; netGainBRL?: string; withheldTaxBRL?: string; calendarDays?: number; hasDayTrade?: boolean; hasRequiredRecords: boolean }
export interface TaxEstimate { status: 'estimated' | 'unassessable'; assetClass: TaxEstimateAssetClass; estimatedTaxBRL: string | null; taxableGainBRL: string | null; assumptions: string[]; gaps: string[] }

/**
 * A deliberately narrow, parameter-free first estimator. It does not net
 * prior losses, create DARFs, or handle a mixed/day-trade book. Those gaps are
 * returned explicitly, never silently approximated.
 */
export function estimateBrazilTax(input: TaxEstimateInput): TaxEstimate {
  if (!input.hasRequiredRecords) return unavailable(input, 'Required source records are missing.')
  const gain = decimal(input.netGainBRL, 'netGainBRL')
  const sales = input.grossSalesBRL == null ? null : decimal(input.grossSalesBRL, 'grossSalesBRL')
  if (input.assetClass === 'b3_equity_common') {
    if (input.hasDayTrade) return unavailable(input, 'Day-trade operations require a separate 20% lane and are not included in this estimator.')
    if (!sales) return unavailable(input, 'Monthly gross sales are required to evaluate the B3 cash-equity exemption.')
    if (sales.lte(20_000)) return estimated(input, '0.00', gain, ['B3 cash-equity monthly gross sales are at or below the configured R$20,000 exemption threshold.', 'No prior-loss compensation was applied.'])
    return estimated(input, tax(gain, '0.15'), gain, ['15% rate for ordinary B3 operations; fees and taxes must already be reflected in net gain.', 'No prior-loss compensation or IRRF offset was applied.'])
  }
  if (input.assetClass === 'b3_fii') return estimated(input, tax(gain, '0.20'), gain, ['20% rate for net gain on B3 FII sale/redemption.', 'No prior-loss compensation or IRRF offset was applied.'])
  if (input.assetClass === 'fixed_income') {
    if (!Number.isInteger(input.calendarDays) || input.calendarDays! < 0) return unavailable(input, 'Holding period in calendar days is required for fixed-income estimation.')
    const rate = input.calendarDays! <= 180 ? '0.225' : input.calendarDays! <= 360 ? '0.20' : input.calendarDays! <= 720 ? '0.175' : '0.15'
    return estimated(input, tax(gain, rate), gain, [`Regressive fixed-income rate ${(new Decimal(rate).mul(100)).toFixed(1)}% from supplied holding period.`, 'Does not determine LCI/LCA/CRI/CRA exemption or withholding reconciliation.'])
  }
  if (input.assetClass === 'fund') return unavailable(input, 'Fund category, taxation regime and administrator withholding statement are required.')
  return unavailable(input, 'Crypto requires complete acquisition, disposal, exchange and monthly-sale records; no estimate was made.')
}

function decimal(value: string | undefined, field: string): Decimal { if (!value || !/^[-+]?\d+(?:\.\d+)?$/.test(value)) throw new Error(`${field} must be a decimal string.`); return new Decimal(value) }
function tax(gain: Decimal, rate: string): string { return gain.lte(0) ? '0.00' : gain.mul(rate).toFixed(2) }
function estimated(input: TaxEstimateInput, estimatedTaxBRL: string, gain: Decimal, assumptions: string[]): TaxEstimate { return { status: 'estimated', assetClass: input.assetClass, estimatedTaxBRL, taxableGainBRL: gain.toFixed(2), assumptions, gaps: [] } }
function unavailable(input: TaxEstimateInput, gap: string): TaxEstimate { return { status: 'unassessable', assetClass: input.assetClass, estimatedTaxBRL: null, taxableGainBRL: null, assumptions: [], gaps: [gap] } }
