import Decimal from 'decimal.js'
import { z } from 'zod'
import type { FixedIncomePosition } from './contracts.js'

const money = z.string().regex(/^\d+(?:\.\d+)?$/)
export const fgcCoveragePolicySchema = z.object({
  version: z.literal(1),
  perConglomerateLimitBRL: money,
  aggregateFourYearLimitBRL: money,
  paidWithinCurrentFourYearWindowBRL: money,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referenceUrl: z.string().url(),
}).strict()

export type FgcCoveragePolicy = z.infer<typeof fgcCoveragePolicySchema>

/** Defaults published by the FGC. They remain user-configurable and dated. */
export const defaultFgcCoveragePolicy: FgcCoveragePolicy = {
  version: 1,
  perConglomerateLimitBRL: '250000',
  aggregateFourYearLimitBRL: '1000000',
  paidWithinCurrentFourYearWindowBRL: '0',
  effectiveFrom: '2017-12-22',
  referenceUrl: 'https://www.fgc.org.br/sobre-garantia-fgc',
}

export interface FgcExposureGroup {
  conglomerate: string
  eligibleAmountBRL: string
  estimatedCoveredBeforeAggregateLimitBRL: string
  estimatedUncoveredBRL: string
}

export interface FgcExposure {
  groups: FgcExposureGroup[]
  eligibleAmountBRL: string
  estimatedCoverageBeforeAggregateLimitBRL: string
  estimatedCoverageAfterAggregateLimitBRL: string
  estimatedUncoveredBRL: string
  remainingAggregateLimitBRL: string
  ineligiblePositionIds: string[]
  unknownEligibilityPositionIds: string[]
  missingConglomeratePositionIds: string[]
  policy: FgcCoveragePolicy
  disclaimer: string
}

/**
 * Estimate FGC exposure only from explicitly eligible positions and disclosed
 * conglomerates. This does not confirm issuer association, ownership identity
 * or historical guarantees paid by the FGC.
 */
export function calculateFgcExposure(positions: FixedIncomePosition[], policyInput: FgcCoveragePolicy = defaultFgcCoveragePolicy): FgcExposure {
  const policy = fgcCoveragePolicySchema.parse(policyInput)
  const amounts = new Map<string, Decimal>()
  const ineligiblePositionIds: string[] = []
  const unknownEligibilityPositionIds: string[] = []
  const missingConglomeratePositionIds: string[] = []

  for (const position of positions) {
    if (position.product.fgc.status === 'ineligible') { ineligiblePositionIds.push(position.id); continue }
    if (position.product.fgc.status !== 'eligible') { unknownEligibilityPositionIds.push(position.id); continue }
    const conglomerate = position.product.issuer.conglomerate
    if (!conglomerate) { missingConglomeratePositionIds.push(position.id); continue }
    amounts.set(conglomerate, (amounts.get(conglomerate) ?? new Decimal(0)).plus(position.currentAmountBRL))
  }

  const perConglomerateLimit = new Decimal(policy.perConglomerateLimitBRL)
  const aggregateLimit = new Decimal(policy.aggregateFourYearLimitBRL)
  const paid = new Decimal(policy.paidWithinCurrentFourYearWindowBRL)
  const remainingAggregate = Decimal.max(0, aggregateLimit.minus(paid))
  const groups = [...amounts.entries()].map(([conglomerate, amount]) => {
    const covered = Decimal.min(amount, perConglomerateLimit)
    return { conglomerate, eligibleAmountBRL: value(amount), estimatedCoveredBeforeAggregateLimitBRL: value(covered), estimatedUncoveredBRL: value(amount.minus(covered)) }
  }).sort((a, b) => a.conglomerate.localeCompare(b.conglomerate, 'pt-BR'))
  const eligibleAmount = groups.reduce((total, group) => total.plus(group.eligibleAmountBRL), new Decimal(0))
  const coverageBeforeAggregate = groups.reduce((total, group) => total.plus(group.estimatedCoveredBeforeAggregateLimitBRL), new Decimal(0))
  const coverageAfterAggregate = Decimal.min(coverageBeforeAggregate, remainingAggregate)
  return {
    groups,
    eligibleAmountBRL: value(eligibleAmount),
    estimatedCoverageBeforeAggregateLimitBRL: value(coverageBeforeAggregate),
    estimatedCoverageAfterAggregateLimitBRL: value(coverageAfterAggregate),
    estimatedUncoveredBRL: value(eligibleAmount.minus(coverageAfterAggregate)),
    remainingAggregateLimitBRL: value(remainingAggregate),
    ineligiblePositionIds,
    unknownEligibilityPositionIds,
    missingConglomeratePositionIds,
    policy,
    disclaimer: 'Estimativa para apoio à decisão, não confirmação do FGC. Confirme a associação, o conglomerado e o histórico de garantias diretamente com o FGC.',
  }
}

function value(input: Decimal): string { return input.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
