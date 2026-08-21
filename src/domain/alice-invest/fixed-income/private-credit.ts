import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const nonnegative = decimal.refine((value) => new Decimal(value).gte(0), 'must be non-negative')
const score = z.number().int().min(0).max(100)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const issuerSchema = z.object({
  id: z.string().trim().min(1).max(128), legalName: z.string().trim().min(1).max(256), sector: z.string().trim().min(1).max(128),
  taxId: z.string().trim().min(1).max(32).optional(), economicGroupId: z.string().trim().min(1).max(128).optional(),
}).strict()
const instrumentSchema = z.object({
  series: z.string().trim().min(1).max(128), issueDate: dateOnly, maturityDate: dateOnly,
  seniority: z.enum(['senior_secured', 'senior_unsecured', 'subordinated', 'unknown']),
  guarantees: z.array(z.object({ type: z.string().trim().min(1).max(128), description: z.string().trim().min(1).max(512), evidenceId: z.string().trim().min(1).max(128) }).strict()).max(64),
  covenants: z.array(z.object({ id: z.string().trim().min(1).max(128), description: z.string().trim().min(1).max(512), headroomPct: decimal.optional(), status: z.enum(['comfortable', 'tight', 'breached', 'unknown']) }).strict()).max(128),
  trustee: z.string().trim().min(1).max(256), earlyRedemption: z.enum(['none', 'issuer_option', 'investor_option', 'unknown']), secondaryLiquidity: z.enum(['high', 'medium', 'low', 'unknown']),
}).strict().superRefine((instrument, context) => {
  if (instrument.maturityDate <= instrument.issueDate) context.addIssue({ code: 'custom', path: ['maturityDate'], message: 'must be after issueDate' })
})
const securitizationSchema = z.object({
  obligorIds: z.array(z.string().trim().min(1).max(128)).min(1).max(128), collateralDescription: z.string().trim().min(1).max(2_000),
  poolConcentrationPct: nonnegative, subordinationPct: nonnegative, overcollateralizationPct: nonnegative, reserveAccountPct: nonnegative,
  waterfallDocumented: z.boolean(), servicer: z.string().trim().min(1).max(256),
}).strict()

export const privateCreditAssetSchema = z.object({
  id: z.string().trim().min(1).max(256), productType: z.enum(['debenture', 'debenture_incentivada', 'cri', 'cra']),
  issuer: issuerSchema, instrument: instrumentSchema, securitization: securitizationSchema.optional(),
}).strict().superRefine((asset, context) => {
  const requiresStructure = asset.productType === 'cri' || asset.productType === 'cra'
  if (requiresStructure && !asset.securitization) context.addIssue({ code: 'custom', path: ['securitization'], message: 'CRI/CRA require a separate securitization structure' })
  if (!requiresStructure && asset.securitization) context.addIssue({ code: 'custom', path: ['securitization'], message: 'debentures must not be modeled as securitizations' })
})

const evidenceSchema = z.object({ id: z.string().trim().min(1).max(128), documentType: z.string().trim().min(1).max(128), documentHash: z.string().regex(/^[a-f0-9]{64}$/), locator: z.string().trim().min(1).max(256) }).strict()
const criticalEventSchema = z.object({ id: z.string().trim().min(1).max(128), kind: z.enum(['default', 'covenant_breach', 'payment_delay', 'recovery', 'regulatory', 'rating_downgrade']), status: z.enum(['resolved', 'unresolved']), evidenceId: z.string().trim().min(1).max(128) }).strict()
const componentScoresSchema = z.object({
  issuer: score, instrument: score, structure: score.optional(), collateral: score.optional(), guarantees: score,
  liquidity: score.nullable(), documentation: score, confidence: score,
}).strict()
export const privateCreditAnalysisInputSchema = z.object({
  asset: privateCreditAssetSchema, advertisedYieldPct: decimal, comparableSovereignYieldPct: decimal,
  expectedLossLowPct: nonnegative, expectedLossHighPct: nonnegative, liquidityPremiumPct: nonnegative,
  concentrationPenaltyPct: nonnegative, uncertaintyMarginPct: nonnegative,
  componentScores: componentScoresSchema, requiredDocumentTypes: z.array(z.string().trim().min(1).max(128)).max(64),
  evidence: z.array(evidenceSchema).max(256), criticalEvents: z.array(criticalEventSchema).max(128),
  minimumScore: score, minimumConfidence: score,
}).strict().superRefine((value, context) => {
  if (new Decimal(value.expectedLossHighPct).lt(value.expectedLossLowPct)) context.addIssue({ code: 'custom', path: ['expectedLossHighPct'], message: 'must be at least expectedLossLowPct' })
  const securitized = value.asset.productType === 'cri' || value.asset.productType === 'cra'
  if (securitized && (value.componentScores.structure === undefined || value.componentScores.collateral === undefined)) context.addIssue({ code: 'custom', path: ['componentScores'], message: 'CRI/CRA require structure and collateral scores' })
})

export interface PrivateCreditAnalysis {
  assetId: string
  deterministicScore: number
  decision: 'watch' | 'avoid' | 'review_credit' | 'insufficient_data'
  adjustedNetPremiumRangePct: { low: string; high: string }
  reasonCodes: string[]
  evidence: z.output<typeof evidenceSchema>[]
  calculationTraceId: string
  methodologyId: 'private-credit-analysis@1'
  readiness: 'research_only'
  actionable: false
}

export function analyzePrivateCredit(input: z.input<typeof privateCreditAnalysisInputSchema>): PrivateCreditAnalysis {
  const value = privateCreditAnalysisInputSchema.parse(input)
  const evidenceIds = new Set(value.evidence.map((evidence) => evidence.id))
  for (const event of value.criticalEvents) if (!evidenceIds.has(event.evidenceId)) throw new Error(`critical event ${event.id} references unknown evidence`)
  const suppliedDocuments = new Set(value.evidence.map((evidence) => evidence.documentType))
  const missingDocuments = value.requiredDocumentTypes.filter((type) => !suppliedDocuments.has(type))
  const securitized = value.asset.productType === 'cri' || value.asset.productType === 'cra'
  const scores = value.componentScores
  const deterministic = securitized
    ? weighted([[scores.issuer, 15], [scores.instrument, 15], [scores.structure!, 25], [scores.collateral!, 20], [scores.guarantees, 10], [scores.liquidity ?? 0, 5], [scores.documentation, 10]])
    : weighted([[scores.issuer, 35], [scores.instrument, 30], [scores.guarantees, 10], [scores.liquidity ?? 0, 10], [scores.documentation, 15]])
  const reasons = [
    ...(deterministic < value.minimumScore ? ['score_below_minimum'] : []),
    ...(scores.confidence < value.minimumConfidence ? ['confidence_below_minimum'] : []),
    ...(missingDocuments.length ? ['required_documents_missing'] : []),
    ...(scores.liquidity === null ? ['liquidity_score_missing'] : []),
    ...(value.criticalEvents.some((event) => event.status === 'unresolved') ? ['unresolved_critical_event'] : []),
    ...(value.asset.instrument.covenants.some((covenant) => covenant.status === 'breached') ? ['covenant_breached'] : []),
  ]
  const decision = reasons.includes('unresolved_critical_event') || reasons.includes('covenant_breached')
    ? 'review_credit' as const
    : reasons.includes('score_below_minimum') ? 'avoid' as const
      : reasons.length ? 'insufficient_data' as const : 'watch' as const
  const basePremium = new Decimal(value.advertisedYieldPct).minus(value.comparableSovereignYieldPct).minus(value.liquidityPremiumPct).minus(value.concentrationPenaltyPct).minus(value.uncertaintyMarginPct)
  const best = basePremium.minus(value.expectedLossLowPct)
  const worst = basePremium.minus(value.expectedLossHighPct)
  return {
    assetId: value.asset.id, deterministicScore: deterministic, decision,
    adjustedNetPremiumRangePct: { low: rate(worst), high: rate(best) }, reasonCodes: reasons, evidence: value.evidence,
    calculationTraceId: createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex'),
    methodologyId: 'private-credit-analysis@1', readiness: 'research_only', actionable: false,
  }
}

const explanationSchema = z.object({
  summary: z.string().trim().min(1).max(4_000), favorablePoints: z.array(z.string().trim().min(1).max(1_000)).max(32),
  attentionPoints: z.array(z.string().trim().min(1).max(1_000)).max(32), questions: z.array(z.string().trim().min(1).max(1_000)).max(32),
  claims: z.array(z.object({ text: z.string().trim().min(1).max(2_000), evidenceIds: z.array(z.string().trim().min(1).max(128)).min(1).max(16) }).strict()).max(128),
}).strict()

export function attachPrivateCreditExplanation(analysis: PrivateCreditAnalysis, modelOutput: unknown) {
  const explanation = explanationSchema.parse(modelOutput)
  const evidenceIds = new Set(analysis.evidence.map((evidence) => evidence.id))
  for (const claim of explanation.claims) {
    const unknown = claim.evidenceIds.find((id) => !evidenceIds.has(id))
    if (unknown) throw new Error(`model explanation references unknown evidence: ${unknown}`)
  }
  return { ...analysis, explanation }
}

function weighted(parts: Array<[number, number]>): number {
  return new Decimal(parts.reduce((sum, [value, weight]) => sum.plus(new Decimal(value).mul(weight)), new Decimal(0))).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}
function rate(value: Decimal): string { return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8) }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
