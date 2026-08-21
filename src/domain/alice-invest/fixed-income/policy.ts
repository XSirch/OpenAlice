import Decimal from 'decimal.js'
import { z } from 'zod'

const percentageString = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
  .refine((value) => new Decimal(value).lte(100), 'must not exceed 100 percent')

export const fixedIncomeConcentrationLimitsSchema = z.object({
  privateCreditPct: percentageString,
  illiquidAssetsPct: percentageString,
  singleFgcConglomeratePct: percentageString,
  singleFgcConglomerateBRL: z.string().regex(/^\d+(?:\.\d+)?$/),
}).strict()

export const fixedIncomeRecommendationThresholdsSchema = z.object({
  minimumBenefitBRL: z.string().regex(/^\d+(?:\.\d+)?$/),
  minimumBenefitPct: percentageString,
  cooldownDays: z.number().int().min(0).max(365),
}).strict()

export const fixedIncomeAdvisorPolicySchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  defaultRiskProfile: z.literal('moderate'),
  liquidityReservePct: percentageString,
  concentrationLimits: fixedIncomeConcentrationLimitsSchema.default({ privateCreditPct: '35', illiquidAssetsPct: '40', singleFgcConglomeratePct: '15', singleFgcConglomerateBRL: '225000' }),
  recommendationThresholds: fixedIncomeRecommendationThresholdsSchema.default({ minimumBenefitBRL: '100', minimumBenefitPct: '0.5', cooldownDays: 7 }),
  taxPolicyId: z.string().trim().min(1).max(128).default('br-fixed-income-tax@2026-06-11'),
  scenarioPolicyId: z.string().trim().min(1).max(128).default('moderate-default-v1'),
  killSwitches: z.object({
    providerRefreshEnabled: z.boolean(),
    opportunityScanEnabled: z.boolean(),
    creditMonitorEnabled: z.boolean(),
    recommendationGenerationEnabled: z.literal(false),
    notificationsEnabled: z.boolean(),
  }).strict().default({ providerRefreshEnabled: false, opportunityScanEnabled: false, creditMonitorEnabled: false, recommendationGenerationEnabled: false, notificationsEnabled: false }),
  readiness: z.literal('research_only'),
  executionEnabled: z.literal(false),
  recommendationGenerationEnabled: z.literal(false),
}).strict()

export type FixedIncomeAdvisorPolicy = z.infer<typeof fixedIncomeAdvisorPolicySchema>

export function defaultFixedIncomeAdvisorPolicy(): FixedIncomeAdvisorPolicy {
  return fixedIncomeAdvisorPolicySchema.parse({
    version: 1,
    enabled: true,
    defaultRiskProfile: 'moderate',
    liquidityReservePct: '20',
    concentrationLimits: { privateCreditPct: '35', illiquidAssetsPct: '40', singleFgcConglomeratePct: '15', singleFgcConglomerateBRL: '225000' },
    recommendationThresholds: { minimumBenefitBRL: '100', minimumBenefitPct: '0.5', cooldownDays: 7 },
    taxPolicyId: 'br-fixed-income-tax@2026-06-11',
    scenarioPolicyId: 'moderate-default-v1',
    killSwitches: { providerRefreshEnabled: false, opportunityScanEnabled: false, creditMonitorEnabled: false, recommendationGenerationEnabled: false, notificationsEnabled: false },
    readiness: 'research_only',
    executionEnabled: false,
    recommendationGenerationEnabled: false,
  })
}
