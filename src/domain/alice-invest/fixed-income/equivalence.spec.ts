import { describe, expect, it } from 'vitest'

import { calculateFixedIncomeEquivalence } from './equivalence.js'

describe('fixed-income return equivalence', () => {
  it('calculates real, net, taxable-gross-equivalent, and CDI-equivalent rates', () => {
    expect(calculateFixedIncomeEquivalence({
      annualGrossRatePct: '10', annualExemptRatePct: '10', annualInflationPct: '4', incomeTaxRate: '0.175', annualCdiPct: '10',
    })).toEqual({
      annualRealRatePct: '5.76923077',
      annualNetRatePct: '8.25000000',
      taxableGrossEquivalentPct: '12.12121212',
      cdiEquivalentPct: '82.50000000',
      methodologyId: 'annual-rate-equivalence@1',
    })
  })

  it('fails when inflation would make the real-return denominator non-positive', () => {
    expect(() => calculateFixedIncomeEquivalence({ annualGrossRatePct: '10', annualExemptRatePct: '10', annualInflationPct: '-100', incomeTaxRate: '0.15' })).toThrow(/inflation/)
  })
})
