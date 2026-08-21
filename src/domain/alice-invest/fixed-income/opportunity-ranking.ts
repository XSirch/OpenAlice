import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

import { bankRiskScoresSchema } from './bank-risk.js'
import { projectFixedIncome } from './calculations.js'
import { calculateFgcAllocationCapacity } from './fgc-allocation.js'
import { fixedIncomeOpportunitySchema } from './opportunities.js'
import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const amount = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const pct = amount.refine((value) => new Decimal(value).lte(100), 'must not exceed 100 percent')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const candidateSchema = z.object({
  opportunity: fixedIncomeOpportunitySchema,
  source: fixedIncomeSourceProvenanceSchema,
  bankRisk: bankRiskScoresSchema,
  existingConglomerateExposureBRL: amount,
  conglomerateStatus: z.enum(['confirmed', 'unknown']),
}).strict()
export const fixedIncomeOpportunityRankingInputSchema = z.object({
  contributionDate: dateOnly, targetDate: dateOnly, now: z.string().datetime({ offset: true }), contributionBRL: amount,
  portfolioTotalAfterContributionBRL: amount, liquidReserveAfterContributionBRL: amount,
  calendarDays: z.number().int().min(0).max(36_600), businessDays: z.number().int().min(0).max(25_200),
  annualCdiPct: amount, annualInflationPct: z.string().regex(/^-?\d+(?:\.\d+)?$/),
  policy: z.object({
    liquidityReservePct: pct, minimumCreditScore: z.number().int().min(0).max(100), minimumConfidenceScore: z.number().int().min(0).max(100),
    riskPenaltyPct: pct, liquidityPenaltyPct: pct,
  }).strict(),
  candidates: z.array(candidateSchema).min(1).max(5_000),
}).strict().superRefine((value, context) => {
  if (value.targetDate <= value.contributionDate) context.addIssue({ code: 'custom', path: ['targetDate'], message: 'must be after contributionDate' })
  const actualDays = Math.round((Date.parse(`${value.targetDate}T00:00:00.000Z`) - Date.parse(`${value.contributionDate}T00:00:00.000Z`)) / 86_400_000)
  if (actualDays !== value.calendarDays) context.addIssue({ code: 'custom', path: ['calendarDays'], message: 'must match contributionDate and targetDate' })
})

export interface RankedFixedIncomeAlternative {
  opportunityId: string
  allocatedBRL: string
  projectedGrossBRL: string
  projectedNetBRL: string
  adjustedUtilityBRL: string
  riskPenaltyBRL: string
  liquidityPenaltyBRL: string
  realNetGainPct: string
  allocationDecision: 'full' | 'partial'
  intrinsicCreditScore: number
  liquidityScore: number
  reasons: string[]
  calculationTraceId: string
  sources: FixedIncomeSourceProvenance[]
}

export interface FixedIncomeOpportunityRanking {
  bestAlternative: RankedFixedIncomeAlternative | null
  lowerRiskAlternative: RankedFixedIncomeAlternative | null
  eligibleAlternatives: RankedFixedIncomeAlternative[]
  rejectedAlternatives: Array<{ opportunityId: string; reasons: string[] }>
  maintenance: { projectedNetBRL: string; adjustedUtilityBRL: string }
  calculationTraceId: string
  methodologyId: 'fixed-income-opportunity-ranking@1'
  readiness: 'research_only'
  actionable: false
}

export function rankFixedIncomeOpportunities(input: z.input<typeof fixedIncomeOpportunityRankingInputSchema>): FixedIncomeOpportunityRanking {
  const value = fixedIncomeOpportunityRankingInputSchema.parse(input)
  const contribution = new Decimal(value.contributionBRL)
  if (contribution.lte(0)) throw new Error('contributionBRL must be positive')
  const reservePct = new Decimal(value.liquidReserveAfterContributionBRL).div(value.portfolioTotalAfterContributionBRL).mul(100)
  const sharedReasons = reservePct.lt(value.policy.liquidityReservePct) ? ['liquidity_reserve_below_minimum'] : []
  const eligible: RankedFixedIncomeAlternative[] = []
  const rejected: Array<{ opportunityId: string; reasons: string[] }> = []
  for (const candidate of value.candidates) {
    const offer = candidate.opportunity
    const reasons = [...sharedReasons]
    if (!['cdb', 'rdb', 'lc', 'lci', 'lca'].includes(offer.product.productType)) reasons.push('unsupported_bank_product')
    if (offer.availability !== 'confirmed') reasons.push('availability_not_confirmed')
    if (!offer.validUntil || Date.parse(value.now) > Date.parse(offer.validUntil)) reasons.push('offer_expired')
    if (offer.product.maturityDate < value.targetDate && offer.liquidity.redemption !== 'daily') reasons.push('maturity_before_target_without_reinvestment_model')
    if (offer.product.maturityDate > value.targetDate && offer.liquidity.redemption !== 'daily') reasons.push('capital_unavailable_at_target')
    if (offer.liquidity.gracePeriodEndDate && offer.liquidity.gracePeriodEndDate > value.targetDate) reasons.push('grace_period_exceeds_target')
    if (candidate.bankRisk.intrinsicCreditScore < value.policy.minimumCreditScore) reasons.push('credit_score_below_minimum')
    if (candidate.bankRisk.dataConfidenceScore < value.policy.minimumConfidenceScore) reasons.push('confidence_below_minimum')
    if (candidate.bankRisk.regulatoryScore < 100) reasons.push('institution_not_active')
    if (candidate.bankRisk.liquidityScore === null) reasons.push('liquidity_score_missing')
    if (candidate.bankRisk.fgcProtectionScore !== 100) reasons.push('fgc_protection_unconfirmed')
    const minimum = offer.minimumBRL ?? '0'
    const requested = Decimal.min(contribution, offer.maximumAvailableBRL ?? contribution).toFixed()
    const fgc = calculateFgcAllocationCapacity({
      portfolioTotalBRL: value.portfolioTotalAfterContributionBRL,
      existingConglomerateExposureBRL: candidate.existingConglomerateExposureBRL,
      requestedAllocationBRL: requested, minimumInvestmentBRL: minimum,
      eligibility: offer.product.fgc.status, conglomerateStatus: candidate.conglomerateStatus,
      internalLimitPct: '15', internalLimitAbsoluteBRL: '225000', fgcNominalLimitBRL: '250000',
    })
    if (fgc.decision === 'rejected') reasons.push(...fgc.reasons)
    if (new Decimal(requested).lt(minimum)) reasons.push('minimum_investment_not_met')
    const uniqueReasons = [...new Set(reasons)]
    if (uniqueReasons.length > 0) { rejected.push({ opportunityId: offer.id, reasons: uniqueReasons }); continue }
    const allocation = fgc.acceptedAllocationBRL
    const projection = projectFixedIncome({
      product: offer.product, principalBRL: allocation, calendarDays: value.calendarDays, businessDays: value.businessDays,
      annualCdiPct: value.annualCdiPct, acquisitionDate: value.contributionDate, redemptionDate: value.targetDate,
      exemptionConfirmed: offer.product.productType === 'lci' || offer.product.productType === 'lca',
    })
    if (!projection.taxActionable) { rejected.push({ opportunityId: offer.id, reasons: projection.taxReasons }); continue }
    const liquidityScore = candidate.bankRisk.liquidityScore!
    const riskPenalty = new Decimal(allocation).mul(100 - candidate.bankRisk.intrinsicCreditScore).div(100).mul(value.policy.riskPenaltyPct).div(100)
    const liquidityPenalty = new Decimal(allocation).mul(100 - liquidityScore).div(100).mul(value.policy.liquidityPenaltyPct).div(100)
    const adjusted = new Decimal(projection.netBRL).minus(riskPenalty).minus(liquidityPenalty)
    const nominalNetReturn = new Decimal(projection.netBRL).div(allocation).minus(1)
    const inflation = new Decimal(value.annualInflationPct).div(100)
    const realNetGain = new Decimal(1).plus(nominalNetReturn).div(new Decimal(1).plus(inflation)).minus(1).mul(100)
    eligible.push({
      opportunityId: offer.id, allocatedBRL: money(allocation), projectedGrossBRL: projection.grossBRL, projectedNetBRL: projection.netBRL,
      adjustedUtilityBRL: money(adjusted), riskPenaltyBRL: money(riskPenalty), liquidityPenaltyBRL: money(liquidityPenalty),
      realNetGainPct: rate(realNetGain), allocationDecision: fgc.decision === 'full' ? 'full' : 'partial', intrinsicCreditScore: candidate.bankRisk.intrinsicCreditScore,
      liquidityScore, reasons: fgc.reasons, calculationTraceId: projection.calculationTraceId, sources: [candidate.source, ...projection.sources],
    })
  }
  eligible.sort((a, b) => new Decimal(b.adjustedUtilityBRL).cmp(a.adjustedUtilityBRL) || a.opportunityId.localeCompare(b.opportunityId))
  const lowerRisk = [...eligible].sort((a, b) => b.intrinsicCreditScore - a.intrinsicCreditScore || new Decimal(b.adjustedUtilityBRL).cmp(a.adjustedUtilityBRL))[0] ?? null
  const tracePayload = { input: value, eligible, rejected }
  return {
    bestAlternative: eligible[0] ?? null, lowerRiskAlternative: lowerRisk, eligibleAlternatives: eligible, rejectedAlternatives: rejected,
    maintenance: { projectedNetBRL: money(contribution), adjustedUtilityBRL: money(contribution) },
    calculationTraceId: createHash('sha256').update(canonicalJson(tracePayload), 'utf8').digest('hex'),
    methodologyId: 'fixed-income-opportunity-ranking@1', readiness: 'research_only', actionable: false,
  }
}

function money(value: Decimal.Value): string { return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
function rate(value: Decimal): string { return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8) }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
