import Decimal from 'decimal.js'
import { z } from 'zod'

const percentage = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const score = z.string().regex(/^\d+(?:\.\d+)?$/).refine((value) => new Decimal(value).lte(100), 'must not exceed 100')

const bankRiskInputSchema = z.object({
  institutionCode: z.string().trim().min(1).max(64),
  referencePeriod: z.string().regex(/^\d{6}$/),
  active: z.boolean(),
  baselRatioPct: percentage.optional(),
  equityToAssetsPct: percentage.optional(),
  returnOnAssetsPct: percentage.optional(),
  liquidAssetsToAssetsPct: percentage.optional(),
  fgcStatus: z.enum(['eligible_confirmed', 'ineligible', 'unknown']),
  sourceQualityScore: score,
}).strict()

export interface BankRiskScores {
  institutionCode: string
  referencePeriod: string
  intrinsicCreditScore: number
  liquidityScore: number | null
  regulatoryScore: number
  fgcProtectionScore: number | null
  dataConfidenceScore: number
  gaps: string[]
  methodologyId: 'ifdata-bank-risk@1'
}

export const bankRiskScoresSchema: z.ZodType<BankRiskScores> = z.object({
  institutionCode: z.string().trim().min(1).max(64), referencePeriod: z.string().regex(/^\d{6}$/),
  intrinsicCreditScore: z.number().int().min(0).max(100), liquidityScore: z.number().int().min(0).max(100).nullable(),
  regulatoryScore: z.number().int().min(0).max(100), fgcProtectionScore: z.number().int().min(0).max(100).nullable(),
  dataConfidenceScore: z.number().int().min(0).max(100), gaps: z.array(z.string().trim().min(1).max(160)).max(64),
  methodologyId: z.literal('ifdata-bank-risk@1'),
}).strict()

export function scoreBankFromIfData(input: z.input<typeof bankRiskInputSchema>): BankRiskScores {
  const value = bankRiskInputSchema.parse(input)
  const intrinsicParts: Decimal[] = []
  const gaps: string[] = []
  if (value.baselRatioPct === undefined) gaps.push('basel_ratio_missing')
  else intrinsicParts.push(linear(value.baselRatioPct, '8', '20'))
  if (value.equityToAssetsPct === undefined) gaps.push('equity_to_assets_missing')
  else intrinsicParts.push(linear(value.equityToAssetsPct, '5', '15'))
  if (value.returnOnAssetsPct === undefined) gaps.push('return_on_assets_missing')
  else intrinsicParts.push(linear(value.returnOnAssetsPct, '-2', '2'))
  if (value.liquidAssetsToAssetsPct === undefined) gaps.push('liquid_assets_to_assets_missing')
  const liquidityScore = value.liquidAssetsToAssetsPct === undefined ? null : integer(linear(value.liquidAssetsToAssetsPct, '5', '30'))
  const completeness = new Decimal(4 - gaps.length).div(4).mul(100)
  return bankRiskScoresSchema.parse({
    institutionCode: value.institutionCode,
    referencePeriod: value.referencePeriod,
    intrinsicCreditScore: intrinsicParts.length === 0 ? 0 : integer(average(intrinsicParts)),
    liquidityScore,
    regulatoryScore: value.active ? 100 : 0,
    fgcProtectionScore: value.fgcStatus === 'unknown' ? null : value.fgcStatus === 'eligible_confirmed' ? 100 : 0,
    dataConfidenceScore: integer(Decimal.min(completeness, value.sourceQualityScore)),
    gaps,
    methodologyId: 'ifdata-bank-risk@1',
  })
}

function linear(value: string, low: string, high: string): Decimal {
  return Decimal.max(0, Decimal.min(100, new Decimal(value).minus(low).div(new Decimal(high).minus(low)).mul(100)))
}
function average(values: Decimal[]): Decimal { return values.reduce((sum, value) => sum.plus(value), new Decimal(0)).div(values.length) }
function integer(value: Decimal): number { return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() }
