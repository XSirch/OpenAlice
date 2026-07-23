import { describe, expect, it } from 'vitest'
import { bucketForSecType, compareToBalancedModel } from './model-portfolio'

describe('balanced model portfolio', () => {
  it('maps UTA security types into transparent allocation buckets', () => {
    expect(bucketForSecType('BOND')).toBe('fixed-income')
    expect(bucketForSecType('STK')).toBe('equities')
    expect(bucketForSecType('FUND')).toBe('funds-etfs')
    expect(bucketForSecType('CRYPTO')).toBe('crypto')
    expect(bucketForSecType('CASH')).toBe('cash')
  })

  it('calculates the informational rebalance gap without selecting securities', () => {
    const result = compareToBalancedModel([
      { secType: 'BOND', valueBRL: 50_000 },
      { secType: 'STK', valueBRL: 50_000 },
    ])
    expect(result.totalBRL).toBe(100_000)
    expect(result.rows.find((row) => row.bucket === 'fixed-income')?.differenceBRL).toBeCloseTo(-5_000)
    expect(result.rows.find((row) => row.bucket === 'funds-etfs')?.differenceBRL).toBe(20_000)
  })

  it('raises fixed-income allocation to preserve six months of salary and rescales the remainder', () => {
    const result = compareToBalancedModel([{ secType: 'STK', valueBRL: 100_000 }], { monthlySalaryBRL: 10_000 })
    const fixedIncome = result.rows.find((row) => row.bucket === 'fixed-income')
    expect(result.requiredSafetyReserveBRL).toBe(60_000)
    expect(fixedIncome?.targetValueBRL).toBe(60_000)
    expect(result.rows.reduce((sum, row) => sum + row.targetValueBRL, 0)).toBeCloseTo(100_000)
  })
})
