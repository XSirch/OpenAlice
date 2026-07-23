import { describe, expect, it } from 'vitest'
import { calculateWealthForecast } from './wealth-forecast'

describe('wealth forecast math', () => {
  it('projects month-end contributions separately from compound interest', () => {
    const result = calculateWealthForecast({ currentWealth: 100_000, monthlyContribution: 1_000, months: 60, expectedAnnualRatePercent: 12 })
    expect(result?.totalContributions).toBe(60_000)
    expect(result?.totalInterest).toBeGreaterThan(0)
    expect(result?.projectedWealth).toBeCloseTo(result!.points.at(-1)!.balance, 8)
  })

  it('keeps the series entirely principal when the expected rate is zero', () => {
    const result = calculateWealthForecast({ currentWealth: 10_000, monthlyContribution: 500, months: 12, expectedAnnualRatePercent: 0 })
    expect(result?.projectedWealth).toBe(16_000)
    expect(result?.totalInterest).toBe(0)
  })
})
