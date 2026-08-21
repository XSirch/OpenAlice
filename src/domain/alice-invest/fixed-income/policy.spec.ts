import { describe, expect, it } from 'vitest'

import { defaultFixedIncomeAdvisorPolicy, fixedIncomeAdvisorPolicySchema } from './policy.js'

describe('fixed-income advisor policy', () => {
  it('defaults to a 20 percent reserve, research-only readiness, and no execution', () => {
    expect(defaultFixedIncomeAdvisorPolicy()).toMatchObject({
      version: 1,
      enabled: true,
      defaultRiskProfile: 'moderate',
      liquidityReservePct: '20',
      readiness: 'research_only',
      executionEnabled: false,
      recommendationGenerationEnabled: false,
    })
  })

  it('cannot parse execution or out-of-range reserves', () => {
    expect(() => fixedIncomeAdvisorPolicySchema.parse({ ...defaultFixedIncomeAdvisorPolicy(), executionEnabled: true })).toThrow()
    expect(() => fixedIncomeAdvisorPolicySchema.parse({ ...defaultFixedIncomeAdvisorPolicy(), liquidityReservePct: '101' })).toThrow()
  })
})
