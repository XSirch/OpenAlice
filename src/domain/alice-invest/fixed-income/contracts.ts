import { z } from 'zod'

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

/** CDI is an index/reference rate, deliberately absent from productType. */
export const fixedIncomeProductTypeSchema = z.enum(['cdb', 'lci', 'lca', 'tesouro_direto', 'fixed_income_fund'])
export const fixedIncomeRateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), annualRatePct: decimalString }).strict(),
  z.object({ kind: z.literal('cdi_percentage'), cdiPct: decimalString }).strict(),
  z.object({ kind: z.literal('ipca_plus'), spreadPct: decimalString }).strict(),
])

export const fixedIncomeLiquiditySchema = z.object({
  redemption: z.enum(['daily', 'at_maturity', 'scheduled']),
  settlementBusinessDays: z.number().int().min(0).max(365),
  noticeBusinessDays: z.number().int().min(0).max(365).default(0),
}).strict()

export const fixedIncomeFeesSchema = z.object({
  administrationAnnualPct: decimalString.default('0'),
  performancePct: decimalString.default('0'),
  entryPct: decimalString.default('0'),
  exitPct: decimalString.default('0'),
}).strict()

export const fixedIncomeProductSchema = z.object({
  productType: fixedIncomeProductTypeSchema,
  issuer: z.object({ legalName: z.string().trim().min(1).max(256), taxId: z.string().trim().min(1).max(32).optional() }).strict(),
  rate: fixedIncomeRateSchema,
  issueDate: dateOnly,
  maturityDate: dateOnly,
  liquidity: fixedIncomeLiquiditySchema,
  fgc: z.object({ eligible: z.boolean(), coverageLimitBRL: decimalString.optional(), issuerExposureBRL: decimalString.optional() }).strict(),
  fees: fixedIncomeFeesSchema.default({ administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }),
  assumptions: z.array(z.string().trim().min(1).max(512)).max(32).default([]),
}).strict().superRefine((product, context) => {
  if (product.maturityDate <= product.issueDate) context.addIssue({ code: 'custom', path: ['maturityDate'], message: 'must be after issueDate' })
  if (!product.fgc.eligible && (product.fgc.coverageLimitBRL || product.fgc.issuerExposureBRL)) context.addIssue({ code: 'custom', path: ['fgc'], message: 'ineligible products cannot claim FGC coverage' })
})

export type FixedIncomeProduct = z.infer<typeof fixedIncomeProductSchema>
