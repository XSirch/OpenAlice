import { describe, expect, it } from 'vitest'
import { calculateWealthForecast, monthsUntil } from './wealth-forecast'

describe('wealth forecast math', () => {
  it('solves the month-end contribution needed to reach the target', () => {
    const result = calculateWealthForecast({ currentWealth: 100_000, targetWealth: 200_000, months: 60, expectedAnnualRatePercent: 12 })
    expect(result?.requiredMonthlyContribution).toBeCloseTo(295, -1)
    expect(result?.projectedWithRequiredContributions).toBeCloseTo(200_000, 2)
  })

  it('returns zero contribution when existing wealth reaches the target by itself', () => {
    const result = calculateWealthForecast({ currentWealth: 100_000, targetWealth: 105_000, months: 12, expectedAnnualRatePercent: 12 })
    expect(result?.requiredMonthlyContribution).toBe(0)
  })

  it('uses calendar months remaining, rejecting an expired target', () => {
    expect(monthsUntil('2027-07-01', new Date('2026-07-23T12:00:00'))).toBe(12)
    expect(monthsUntil('2026-07-01', new Date('2026-07-23T12:00:00'))).toBeNull()
  })
})
