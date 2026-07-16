import type { FixedIncomeProjectionInput } from './calculations.js'
import Decimal from 'decimal.js'
import { projectFixedIncome } from './calculations.js'

export interface FixedIncomeComparison { entries: FixedIncomeComparisonEntry[]; assumptions: string[]; disclaimer: string }
export interface FixedIncomeComparisonEntry { productType: string; issuer: string; maturityDate: string; redemption: string; fgcEligible: boolean; projectedNetBRL: string; projectedGrossBRL: string; assumptions: string[]; gaps: string[] }

/** Deterministic comparison: presents inputs/results, never a buy recommendation. */
export function compareFixedIncome(inputs: FixedIncomeProjectionInput[]): FixedIncomeComparison {
  const entries = inputs.map((input) => {
    const projection = projectFixedIncome(input)
    const gaps = [
      ...(input.product.fgc.eligible ? [] : ['FGC eligibility is not available']),
      ...(input.product.assumptions.length === 0 ? ['Product-specific assumptions were not supplied'] : []),
    ]
    return { productType: input.product.productType, issuer: input.product.issuer.legalName, maturityDate: input.product.maturityDate, redemption: input.product.liquidity.redemption, fgcEligible: input.product.fgc.eligible, projectedNetBRL: projection.netBRL, projectedGrossBRL: projection.grossBRL, assumptions: input.product.assumptions, gaps }
  }).sort((a, b) => new Decimal(b.projectedNetBRL).cmp(a.projectedNetBRL))
  return { entries, assumptions: ['Projections use supplied rates, dates and day counts.', 'Taxes and fees can change; verify the offering documents.'], disclaimer: 'This comparison is informational, not an investment recommendation or return guarantee.' }
}
