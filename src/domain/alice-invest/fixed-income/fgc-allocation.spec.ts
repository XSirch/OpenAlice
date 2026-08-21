import { describe, expect, it } from 'vitest'
import { calculateFgcAllocationCapacity } from './fgc-allocation.js'

describe('FGC allocation capacity', () => {
  it('limits a new allocation to the moderate internal cap by confirmed conglomerate', () => {
    const result = calculateFgcAllocationCapacity({
      portfolioTotalBRL: '2000000', existingConglomerateExposureBRL: '220000', requestedAllocationBRL: '50000',
      minimumInvestmentBRL: '1000', eligibility: 'eligible', conglomerateStatus: 'confirmed',
      internalLimitPct: '15', internalLimitAbsoluteBRL: '225000', fgcNominalLimitBRL: '250000',
    })
    expect(result).toMatchObject({ maximumEligibleAllocationBRL: '5000.00', acceptedAllocationBRL: '5000.00', decision: 'partial' })
  })

  it('fails closed when eligibility or conglomerate is not confirmed or the partial amount misses the minimum', () => {
    expect(calculateFgcAllocationCapacity({
      portfolioTotalBRL: '600000', existingConglomerateExposureBRL: '0', requestedAllocationBRL: '50000', minimumInvestmentBRL: '1000',
      eligibility: 'unknown', conglomerateStatus: 'confirmed', internalLimitPct: '15', internalLimitAbsoluteBRL: '225000', fgcNominalLimitBRL: '250000',
    }).decision).toBe('rejected')
    expect(calculateFgcAllocationCapacity({
      portfolioTotalBRL: '2000000', existingConglomerateExposureBRL: '224500', requestedAllocationBRL: '50000', minimumInvestmentBRL: '1000',
      eligibility: 'eligible', conglomerateStatus: 'confirmed', internalLimitPct: '15', internalLimitAbsoluteBRL: '225000', fgcNominalLimitBRL: '250000',
    })).toMatchObject({ maximumEligibleAllocationBRL: '500.00', acceptedAllocationBRL: '0.00', decision: 'rejected' })
  })
})
