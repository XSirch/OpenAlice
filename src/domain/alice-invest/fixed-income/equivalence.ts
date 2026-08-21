import Decimal from 'decimal.js'
import { z } from 'zod'

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const taxRateString = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
  .refine((value) => new Decimal(value).gte(0) && new Decimal(value).lt(1), 'must be between zero inclusive and one exclusive')

const equivalenceInputSchema = z.object({
  annualGrossRatePct: decimalString,
  annualExemptRatePct: decimalString,
  annualInflationPct: decimalString,
  incomeTaxRate: taxRateString,
  annualCdiPct: decimalString.optional(),
}).strict()

export interface FixedIncomeEquivalenceResult {
  annualRealRatePct: string
  annualNetRatePct: string
  taxableGrossEquivalentPct: string
  cdiEquivalentPct: string | null
  methodologyId: 'annual-rate-equivalence@1'
}

export function calculateFixedIncomeEquivalence(input: z.input<typeof equivalenceInputSchema>): FixedIncomeEquivalenceResult {
  const value = equivalenceInputSchema.parse(input)
  const grossRate = new Decimal(value.annualGrossRatePct).div(100)
  const exemptRate = new Decimal(value.annualExemptRatePct).div(100)
  const inflation = new Decimal(value.annualInflationPct).div(100)
  if (inflation.lte(-1)) throw new Error('annual inflation must be greater than -100 percent')
  const taxRate = new Decimal(value.incomeTaxRate)
  const netRate = grossRate.mul(new Decimal(1).minus(taxRate))
  const realRate = new Decimal(1).plus(grossRate).div(new Decimal(1).plus(inflation)).minus(1)
  const grossEquivalent = exemptRate.div(new Decimal(1).minus(taxRate))
  let cdiEquivalentPct: string | null = null
  if (value.annualCdiPct !== undefined) {
    const cdi = new Decimal(value.annualCdiPct).div(100)
    if (cdi.isZero()) throw new Error('annualCdiPct must not be zero when equivalence is requested')
    cdiEquivalentPct = rate(netRate.div(cdi))
  }
  return {
    annualRealRatePct: rate(realRate),
    annualNetRatePct: rate(netRate),
    taxableGrossEquivalentPct: rate(grossEquivalent),
    cdiEquivalentPct,
    methodologyId: 'annual-rate-equivalence@1',
  }
}

function rate(value: Decimal): string {
  return value.mul(100).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8)
}
