import { describe, expect, it } from 'vitest'

import { calculateFixedIncomeFees } from './fees.js'

describe('fixed-income fees', () => {
  it('separates percentage fees and explicit costs with one rounding policy', () => {
    expect(calculateFixedIncomeFees({
      principalBRL: '1000.00', grossAmountBRL: '1100.00', grossIncomeBRL: '100.00', calendarDays: 365,
      administrationAnnualPct: '1', performancePct: '10', entryPct: '1', exitPct: '1',
      custodyBRL: '2.00', distributionBRL: '3.00', spreadBRL: '4.00', emolumentsBRL: '1.00',
      methodologyId: 'fees-linear@1',
    })).toEqual({
      methodologyId: 'fees-linear@1', entryBRL: '10.00', exitBRL: '11.00', administrationBRL: '10.00',
      performanceBRL: '10.00', custodyBRL: '2.00', distributionBRL: '3.00', spreadBRL: '4.00',
      emolumentsBRL: '1.00', totalFeesBRL: '51.00', rounding: 'BRL_HALF_UP_2',
    })
  })

  it('rejects negative values and percentages over 100', () => {
    expect(() => calculateFixedIncomeFees({
      principalBRL: '1000', grossAmountBRL: '1100', grossIncomeBRL: '100', calendarDays: 1,
      administrationAnnualPct: '101', performancePct: '0', entryPct: '0', exitPct: '0',
      custodyBRL: '0', distributionBRL: '0', spreadBRL: '0', emolumentsBRL: '0', methodologyId: 'fees@1',
    })).toThrow()
  })
})
