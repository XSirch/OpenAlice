import { describe, expect, it } from 'vitest'

import { fixedIncomeCashFlowScheduleSchema, fixedIncomeCashFlowSchema } from './cashflows.js'

describe('fixed-income cash flows', () => {
  it('represents dated projected, announced, and paid instrument flows', () => {
    expect(fixedIncomeCashFlowSchema.parse({
      id: 'flow-1',
      instrumentId: 'instrument-1',
      lotId: 'lot-1',
      date: '2027-01-01',
      kind: 'coupon',
      grossBRL: '62.50',
      indexationRuleId: 'ipca-vna@2026-08',
      taxRuleId: 'br-pf-fixed-income@2026-01',
      status: 'projected',
    })).toMatchObject({ kind: 'coupon', grossBRL: '62.50', status: 'projected' })
  })

  it('requires reproducible methodology and unique flow identities', () => {
    const flow = {
      id: 'flow-1', instrumentId: 'instrument-1', date: '2027-01-01', kind: 'principal', grossBRL: '1000.00', status: 'announced',
    }
    expect(() => fixedIncomeCashFlowScheduleSchema.parse({
      version: 1,
      methodologyId: 'tesouro-cashflows@1',
      generatedAt: '2026-08-20T12:00:00.000Z',
      cashFlows: [flow, flow],
    })).toThrow(/duplicate/)
    expect(() => fixedIncomeCashFlowSchema.parse({ ...flow, grossBRL: -1000 })).toThrow()
  })
})
