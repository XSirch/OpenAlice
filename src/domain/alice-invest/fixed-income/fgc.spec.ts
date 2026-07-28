import { describe, expect, it } from 'vitest'
import { calculateFgcExposure, defaultFgcCoveragePolicy } from './fgc.js'
import type { FixedIncomePosition } from './contracts.js'

const position = (id: string, value: string, status: 'eligible' | 'ineligible' | 'unknown', conglomerate?: string): FixedIncomePosition => ({
  id, investedAmountBRL: value, currentAmountBRL: value, custodyAsOf: '2026-07-27', source: { provider: 'pluggy', positionId: id },
  product: { productType: 'cdb', issuer: { legalName: `Banco ${id}`, ...(conglomerate ? { conglomerate } : {}) }, rate: { kind: 'fixed', annualRatePct: '10' }, issueDate: '2025-01-01', maturityDate: '2027-01-01', liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] },
})

describe('calculateFgcExposure', () => {
  it('caps eligible positions by disclosed conglomerate and then by the four-year aggregate cap', () => {
    const exposure = calculateFgcExposure([position('a', '200000', 'eligible', 'Grupo A'), position('b', '100000', 'eligible', 'Grupo A'), position('c', '200000', 'eligible', 'Grupo B')], { ...defaultFgcCoveragePolicy, aggregateFourYearLimitBRL: '300000', paidWithinCurrentFourYearWindowBRL: '50000' })
    expect(exposure.groups).toMatchObject([{ conglomerate: 'Grupo A', estimatedCoveredBeforeAggregateLimitBRL: '250000.00', estimatedUncoveredBRL: '50000.00' }, { conglomerate: 'Grupo B', estimatedCoveredBeforeAggregateLimitBRL: '200000.00' }])
    expect(exposure).toMatchObject({ estimatedCoverageBeforeAggregateLimitBRL: '450000.00', estimatedCoverageAfterAggregateLimitBRL: '250000.00', remainingAggregateLimitBRL: '250000.00' })
  })
  it('keeps noneligible, unknown and unmapped positions out of the estimate', () => {
    const exposure = calculateFgcExposure([position('no', '10', 'ineligible', 'Grupo'), position('unknown', '10', 'unknown', 'Grupo'), position('missing', '10', 'eligible')])
    expect(exposure.eligibleAmountBRL).toBe('0.00')
    expect(exposure.ineligiblePositionIds).toEqual(['no'])
    expect(exposure.unknownEligibilityPositionIds).toEqual(['unknown'])
    expect(exposure.missingConglomeratePositionIds).toEqual(['missing'])
  })
})
