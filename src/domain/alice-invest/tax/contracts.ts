import { z } from 'zod'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

/**
 * This is a policy contract, not a tax calculator.  It deliberately starts
 * closed: a later estimator must prove that the source records and the human
 * review required for its asset class are present before it can produce a
 * number.
 */
export const brazilTaxAssetClassSchema = z.enum([
  'b3_equity', 'b3_etf', 'b3_fii', 'fixed_income', 'fund', 'crypto',
])
export type BrazilTaxAssetClass = z.infer<typeof brazilTaxAssetClassSchema>

export const taxSourceRequirementSchema = z.enum([
  'brokerage_note', 'custody_statement', 'transaction_history', 'withholding_statement',
])

export const brazilTaxPolicySchema = z.object({
  version: z.literal(1),
  jurisdiction: z.literal('BR'),
  /** A calculation must never be enabled merely because a provider is connected. */
  estimatesEnabled: z.boolean().default(false),
  asOf: dateOnly,
  /** Human verification of rules is required per class before future estimates. */
  reviewedAssetClasses: z.array(brazilTaxAssetClassSchema).max(6).default([]),
  requiredSources: z.record(brazilTaxAssetClassSchema, z.array(taxSourceRequirementSchema).min(1).max(4)),
  disclaimer: z.literal('Estimativa informativa para conferência. Não constitui aconselhamento tributário, declaração, DARF ou pagamento.'),
}).strict()

export type BrazilTaxPolicy = z.infer<typeof brazilTaxPolicySchema>

export const defaultBrazilTaxPolicy: BrazilTaxPolicy = {
  version: 1,
  jurisdiction: 'BR',
  estimatesEnabled: false,
  asOf: '2026-07-28',
  reviewedAssetClasses: [],
  requiredSources: {
    b3_equity: ['brokerage_note', 'transaction_history'],
    b3_etf: ['brokerage_note', 'transaction_history'],
    b3_fii: ['brokerage_note', 'transaction_history'],
    fixed_income: ['custody_statement', 'withholding_statement'],
    fund: ['custody_statement', 'withholding_statement'],
    crypto: ['transaction_history'],
  },
  disclaimer: 'Estimativa informativa para conferência. Não constitui aconselhamento tributário, declaração, DARF ou pagamento.',
}

export interface TaxEstimateReadiness {
  allowed: boolean
  reasons: string[]
  disclaimer: BrazilTaxPolicy['disclaimer']
}

/** Fail closed until a later, reviewed calculation feature explicitly changes policy. */
export function assessBrazilTaxEstimateReadiness(
  policy: BrazilTaxPolicy,
  assetClass: BrazilTaxAssetClass,
  suppliedSources: readonly z.infer<typeof taxSourceRequirementSchema>[],
): TaxEstimateReadiness {
  const required = policy.requiredSources[assetClass]
  const missing = required.filter((source) => !suppliedSources.includes(source))
  const reasons = [
    ...(!policy.estimatesEnabled ? ['Brazilian tax estimation is not enabled in the current policy.'] : []),
    ...(!policy.reviewedAssetClasses.includes(assetClass) ? [`${assetClass} has not received the required human tax-rule review.`] : []),
    ...missing.map((source) => `Required source is missing: ${source}.`),
  ]
  return { allowed: reasons.length === 0, reasons, disclaimer: policy.disclaimer }
}
