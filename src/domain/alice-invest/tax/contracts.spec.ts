import { describe, expect, it } from 'vitest'
import { assessBrazilTaxEstimateReadiness, brazilTaxPolicySchema, defaultBrazilTaxPolicy } from './contracts.js'

describe('Brazil tax policy', () => {
  it('is deliberately disabled and labels every future output as a review estimate', () => {
    const policy = brazilTaxPolicySchema.parse(defaultBrazilTaxPolicy)
    expect(policy.estimatesEnabled).toBe(false)
    expect(policy.disclaimer).toContain('Não constitui aconselhamento tributário')
  })

  it('fails closed when a B3 position lacks a brokerage note', () => {
    const result = assessBrazilTaxEstimateReadiness(defaultBrazilTaxPolicy, 'b3_equity', ['transaction_history'])
    expect(result).toMatchObject({ allowed: false, reasons: expect.arrayContaining([
      'Brazilian tax estimation is not enabled in the current policy.',
      'Required source is missing: brokerage_note.',
    ]) })
  })
})
