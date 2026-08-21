import { describe, expect, it } from 'vitest'

import { calculateXirr } from './xirr.js'

describe('fixed-income XIRR', () => {
  it('calculates an annual rate for dated irregular cash flows', () => {
    expect(calculateXirr([
      { date: '2026-01-01', amountBRL: '-1000.00' },
      { date: '2027-01-01', amountBRL: '1100.00' },
    ])).toMatchObject({ annualRatePct: '10.00000000', methodologyId: 'xirr-actual-365-bisection@1' })
  })

  it('fails closed without both signs or with multiple sign changes', () => {
    expect(() => calculateXirr([
      { date: '2026-01-01', amountBRL: '100' },
      { date: '2027-01-01', amountBRL: '110' },
    ])).toThrow(/positive and negative/)
    expect(() => calculateXirr([
      { date: '2026-01-01', amountBRL: '-100' },
      { date: '2026-06-01', amountBRL: '200' },
      { date: '2027-01-01', amountBRL: '-50' },
    ])).toThrow(/multiple/)
  })
})
