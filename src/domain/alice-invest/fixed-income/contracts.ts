import { z } from 'zod'

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const nonnegativeDecimalString = decimalString.refine((value) => !value.startsWith('-'), 'must be a non-negative decimal string')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

/** CDI is an index/reference rate, deliberately absent from productType. */
export const fixedIncomeProductTypeSchema = z.enum([
  'tesouro_selic', 'tesouro_prefixado', 'tesouro_prefixado_coupon',
  'tesouro_ipca', 'tesouro_ipca_coupon', 'tesouro_renda_mais',
  'tesouro_educa_mais', 'cdb', 'rdb', 'lc', 'lci', 'lca', 'debenture',
  'debenture_incentivada', 'cri', 'cra',
  // Retained for classified custody created before the advisor expansion.
  'tesouro_direto', 'fixed_income_fund',
])
export const fixedIncomeRateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), annualRatePct: decimalString }).strict(),
  z.object({ kind: z.literal('cdi_percentage'), cdiPct: decimalString }).strict(),
  z.object({ kind: z.literal('cdi_plus'), spreadPct: decimalString }).strict(),
  z.object({ kind: z.literal('selic_plus'), spreadPct: decimalString }).strict(),
  z.object({ kind: z.literal('ipca_plus'), spreadPct: decimalString }).strict(),
  z.object({ kind: z.literal('igpm_plus'), spreadPct: decimalString }).strict(),
  z.object({
    kind: z.literal('custom'),
    label: z.string().trim().min(1).max(96),
    methodologyId: z.string().trim().min(1).max(128),
  }).strict(),
  // Retained for existing classifications whose provider supplied a named rate.
  z.object({ kind: z.literal('other'), label: z.string().trim().min(1).max(96), annualRatePct: decimalString.optional() }).strict(),
])

export const fixedIncomeLiquiditySchema = z.object({
  redemption: z.enum(['daily', 'at_maturity', 'scheduled']),
  settlementBusinessDays: z.number().int().min(0).max(365),
  noticeBusinessDays: z.number().int().min(0).max(365).default(0),
  gracePeriodEndDate: dateOnly.optional(),
}).strict()

export const fixedIncomeFeesSchema = z.object({
  administrationAnnualPct: decimalString.default('0'),
  performancePct: decimalString.default('0'),
  entryPct: decimalString.default('0'),
  exitPct: decimalString.default('0'),
}).strict()

export const fixedIncomeProductSchema = z.object({
  productType: fixedIncomeProductTypeSchema,
  issuer: z.object({
    legalName: z.string().trim().min(1).max(256),
    taxId: z.string().trim().min(1).max(32).optional(),
    // This must come from a disclosed source; name matching must never assign
    // a conglomerate for FGC concentration purposes.
    conglomerate: z.string().trim().min(1).max(256).optional(),
  }).strict(),
  rate: fixedIncomeRateSchema,
  issueDate: dateOnly,
  maturityDate: dateOnly,
  liquidity: fixedIncomeLiquiditySchema,
  fgc: z.object({
    status: z.enum(['eligible', 'ineligible', 'unknown']),
    coverageLimitBRL: decimalString.optional(),
    issuerExposureBRL: decimalString.optional(),
  }).strict(),
  fees: fixedIncomeFeesSchema.default({ administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }),
  assumptions: z.array(z.string().trim().min(1).max(512)).max(32).default([]),
}).strict().superRefine((product, context) => {
  if (product.maturityDate <= product.issueDate) context.addIssue({ code: 'custom', path: ['maturityDate'], message: 'must be after issueDate' })
  if (product.liquidity.gracePeriodEndDate && (product.liquidity.gracePeriodEndDate < product.issueDate || product.liquidity.gracePeriodEndDate > product.maturityDate)) {
    context.addIssue({ code: 'custom', path: ['liquidity', 'gracePeriodEndDate'], message: 'must be between issueDate and maturityDate' })
  }
  if (product.fgc.status !== 'eligible' && (product.fgc.coverageLimitBRL || product.fgc.issuerExposureBRL)) context.addIssue({ code: 'custom', path: ['fgc'], message: 'only eligible products can claim FGC coverage' })
})

export type FixedIncomeProduct = z.infer<typeof fixedIncomeProductSchema>

/**
 * A custody-normalized holding. Financial values are decimal strings so no
 * floating-point value from an Open Finance provider leaks into calculations.
 */
export const fixedIncomePositionSchema = z.object({
  id: z.string().trim().min(1).max(256),
  product: fixedIncomeProductSchema,
  investedAmountBRL: nonnegativeDecimalString,
  currentAmountBRL: nonnegativeDecimalString,
  marketValueBRL: nonnegativeDecimalString.optional(),
  redemptionAmountBRL: nonnegativeDecimalString.optional(),
  /** Investor acquisition date when the custody provider can establish it. */
  acquiredDate: dateOnly.optional(),
  custodyAsOf: dateOnly,
  source: z.object({ provider: z.string().trim().min(1).max(64), positionId: z.string().trim().min(1).max(256) }).strict(),
}).strict().superRefine((position, context) => {
  if (position.marketValueBRL && position.redemptionAmountBRL && position.marketValueBRL === position.redemptionAmountBRL) {
    context.addIssue({ code: 'custom', path: ['redemptionAmountBRL'], message: 'omit duplicate redemption amount; currentAmountBRL carries the custody value' })
  }
})

export type FixedIncomePosition = z.infer<typeof fixedIncomePositionSchema>

/** Parse an already classified custody record without making product/FGC guesses. */
export function normalizeFixedIncomePosition(input: unknown): FixedIncomePosition {
  return fixedIncomePositionSchema.parse(input)
}

/** Product metadata explicitly associated with one read-only custody record. */
export const fixedIncomeCustodyDefinitionSchema = z.object({
  source: z.object({ provider: z.literal('pluggy'), positionId: z.string().trim().min(1).max(256) }).strict(),
  product: fixedIncomeProductSchema,
}).strict()

export const fixedIncomeCustodyDefinitionsSchema = z.object({
  version: z.literal(1),
  entries: z.array(fixedIncomeCustodyDefinitionSchema).max(2_000),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>()
  value.entries.forEach((entry, index) => {
    if (seen.has(entry.source.positionId)) context.addIssue({ code: 'custom', path: ['entries', index, 'source', 'positionId'], message: 'a custody position can have only one fixed-income definition' })
    seen.add(entry.source.positionId)
  })
})

export type FixedIncomeCustodyDefinition = z.infer<typeof fixedIncomeCustodyDefinitionSchema>
export type FixedIncomeCustodyDefinitions = z.infer<typeof fixedIncomeCustodyDefinitionsSchema>
