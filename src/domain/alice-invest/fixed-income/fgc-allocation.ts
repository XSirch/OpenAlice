import Decimal from 'decimal.js'
import { z } from 'zod'

const amount = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const inputSchema = z.object({
  portfolioTotalBRL: amount.refine((value) => new Decimal(value).gt(0), 'must be positive'),
  existingConglomerateExposureBRL: amount,
  requestedAllocationBRL: amount,
  minimumInvestmentBRL: amount,
  eligibility: z.enum(['eligible', 'ineligible', 'unknown']),
  conglomerateStatus: z.enum(['confirmed', 'unknown']),
  internalLimitPct: amount.refine((value) => new Decimal(value).lte(100), 'must not exceed 100'),
  internalLimitAbsoluteBRL: amount,
  fgcNominalLimitBRL: amount,
}).strict()

export interface FgcAllocationCapacity {
  maximumEligibleAllocationBRL: string
  acceptedAllocationBRL: string
  decision: 'full' | 'partial' | 'rejected'
  reasons: string[]
  effectiveConglomerateLimitBRL: string
  methodologyId: 'fgc-allocation-capacity@1'
}

export function calculateFgcAllocationCapacity(input: z.input<typeof inputSchema>): FgcAllocationCapacity {
  const value = inputSchema.parse(input)
  const percentageLimit = new Decimal(value.portfolioTotalBRL).mul(value.internalLimitPct).div(100)
  const limit = Decimal.min(percentageLimit, value.internalLimitAbsoluteBRL, value.fgcNominalLimitBRL)
  const reasons: string[] = []
  if (value.eligibility !== 'eligible') reasons.push('fgc_eligibility_unconfirmed')
  if (value.conglomerateStatus !== 'confirmed') reasons.push('conglomerate_unconfirmed')
  const rawCapacity = Decimal.max(0, limit.minus(value.existingConglomerateExposureBRL))
  const capacity = reasons.length ? new Decimal(0) : rawCapacity
  const requested = new Decimal(value.requestedAllocationBRL)
  let accepted = Decimal.min(requested, capacity)
  if (accepted.gt(0) && accepted.lt(value.minimumInvestmentBRL)) {
    reasons.push('partial_capacity_below_minimum_investment')
    accepted = new Decimal(0)
  }
  const decision = accepted.isZero() ? 'rejected' : accepted.eq(requested) ? 'full' : 'partial'
  if (requested.gt(capacity)) reasons.push('conglomerate_limit_exceeded')
  return {
    maximumEligibleAllocationBRL: money(capacity), acceptedAllocationBRL: money(accepted), decision, reasons,
    effectiveConglomerateLimitBRL: money(limit), methodologyId: 'fgc-allocation-capacity@1',
  }
}

function money(value: Decimal): string { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
