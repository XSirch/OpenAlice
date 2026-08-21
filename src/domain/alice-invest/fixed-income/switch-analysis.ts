import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const nonnegativeDecimalString = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const percentageString = nonnegativeDecimalString.refine((value) => new Decimal(value).lte(100), 'must not exceed 100 percent')
const taxRateString = nonnegativeDecimalString.refine((value) => new Decimal(value).lt(1), 'must be below one')

export const fixedIncomeSwitchInputSchema = z.object({
  asOf: z.string().datetime({ offset: true }),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sellFraction: nonnegativeDecimalString.refine((value) => new Decimal(value).gt(0) && new Decimal(value).lte(1), 'must be greater than zero and at most one'),
  sameInstrument: z.boolean(),
  hold: z.object({
    principalBRL: nonnegativeDecimalString,
    annualIndexPct: decimalString,
    annualSpreadPct: decimalString,
    yearsFromAcquisition: nonnegativeDecimalString,
    incomeTaxRate: taxRateString,
    futureCostsBRL: nonnegativeDecimalString,
  }).strict(),
  sale: z.object({
    grossProceedsBRL: nonnegativeDecimalString,
    realizedIncomeTaxBRL: nonnegativeDecimalString,
    exitCostsBRL: nonnegativeDecimalString,
  }).strict(),
  replacement: z.object({
    annualRatePct: decimalString.refine((value) => new Decimal(value).gt(-100), 'must be greater than -100 percent'),
    years: nonnegativeDecimalString.refine((value) => new Decimal(value).gt(0), 'must be positive'),
    incomeTaxRate: taxRateString,
    costsBRL: nonnegativeDecimalString,
    availability: z.enum(['indicative', 'confirmed', 'expired', 'unknown']),
    validUntil: z.string().datetime({ offset: true }).optional(),
    fgcConfirmed: z.boolean(),
  }).strict(),
  constraints: z.object({
    portfolioTotalBRL: nonnegativeDecimalString.refine((value) => new Decimal(value).gt(0), 'must be positive'),
    liquidReserveAfterBRL: nonnegativeDecimalString,
    minimumReservePct: percentageString,
    concentrationValid: z.boolean(),
    dataQuality: percentageString,
    minimumDataQuality: percentageString,
    confidence: percentageString,
    minimumConfidence: percentageString,
    uncertaintyBRL: nonnegativeDecimalString,
    minimumBenefitUncertaintyRatio: nonnegativeDecimalString,
    minimumBenefitBRL: nonnegativeDecimalString,
    criticalDataFresh: z.boolean(),
  }).strict(),
  annualCdiPct: decimalString.optional(),
  sources: z.array(fixedIncomeSourceProvenanceSchema).min(1).max(32),
}).strict()

export interface SwitchConstraintResult {
  id: string
  passed: boolean
  actual: string
  required: string
}

export interface FixedIncomeSwitchResult {
  decision: 'maintain' | 'sell_partial' | 'sell_and_reinvest' | 'insufficient_data'
  actionable: false
  readiness: 'research_only'
  hold: { grossFinalBRL: string; incomeTaxBRL: string; costsBRL: string; netFinalBRL: string }
  sell: { grossProceedsBRL: string; incomeTaxBRL: string; costsBRL: string; netReinvestableBRL: string }
  reinvest: { grossFinalBRL: string; incomeTaxBRL: string; costsBRL: string; netFinalBRL: string }
  delta: { netBRL: string; netPct: string; annualizedUpliftPct: string; benefitUncertaintyRatio: string }
  breakEven: { annualNetRatePct: string; annualGrossRatePct: string; cdiEquivalentPct: string | null }
  constraints: SwitchConstraintResult[]
  reasons: string[]
  calculationTraceId: string
  methodologyIds: string[]
  sources: FixedIncomeSourceProvenance[]
}

export function simulateFixedIncomeSwitch(input: z.input<typeof fixedIncomeSwitchInputSchema>): FixedIncomeSwitchResult {
  const value = fixedIncomeSwitchInputSchema.parse(input)
  const holdPrincipal = new Decimal(value.hold.principalBRL)
  const holdGrowth = new Decimal(1).plus(new Decimal(value.hold.annualIndexPct).div(100))
    .mul(new Decimal(1).plus(new Decimal(value.hold.annualSpreadPct).div(100)))
    .pow(value.hold.yearsFromAcquisition)
  const holdGross = holdPrincipal.mul(holdGrowth)
  const holdTax = Decimal.max(0, holdGross.minus(holdPrincipal)).mul(value.hold.incomeTaxRate)
  const holdNet = holdGross.minus(holdTax).minus(value.hold.futureCostsBRL)

  const saleGross = new Decimal(value.sale.grossProceedsBRL)
  const saleTax = new Decimal(value.sale.realizedIncomeTaxBRL)
  const saleCosts = new Decimal(value.sale.exitCostsBRL)
  const netReinvestable = saleGross.minus(saleTax).minus(saleCosts)
  if (netReinvestable.isNegative()) throw new Error('sale tax and costs cannot exceed gross proceeds')

  const replacementRate = new Decimal(value.replacement.annualRatePct).div(100)
  const replacementYears = new Decimal(value.replacement.years)
  const reinvestGross = netReinvestable.mul(replacementRate.plus(1).pow(replacementYears))
  const reinvestTax = Decimal.max(0, reinvestGross.minus(netReinvestable)).mul(value.replacement.incomeTaxRate)
  const reinvestNet = reinvestGross.minus(reinvestTax).minus(value.replacement.costsBRL)
  const delta = reinvestNet.minus(holdNet)
  const annualizedUplift = reinvestNet.div(holdNet).pow(new Decimal(1).div(replacementYears)).minus(1)
  const reservePct = new Decimal(value.constraints.liquidReserveAfterBRL).div(value.constraints.portfolioTotalBRL).mul(100)
  const uncertainty = new Decimal(value.constraints.uncertaintyBRL)
  const benefitUncertaintyRatio = uncertainty.isZero()
    ? delta.isPositive() ? new Decimal('1e100') : new Decimal(0)
    : delta.div(uncertainty)
  const availabilityValid = value.replacement.availability === 'confirmed'
    && value.replacement.validUntil !== undefined
    && Date.parse(value.replacement.validUntil) > Date.parse(value.asOf)
  const falseArbitragePassed = !value.sameInstrument || reinvestNet.lte(holdNet)

  const constraints: SwitchConstraintResult[] = [
    gate('critical_data_fresh', value.constraints.criticalDataFresh, value.constraints.criticalDataFresh ? 'fresh' : 'stale', 'fresh'),
    gate('offer_availability', availabilityValid, value.replacement.availability, 'confirmed_and_valid'),
    gate('fgc_confirmation', value.replacement.fgcConfirmed, String(value.replacement.fgcConfirmed), 'true'),
    gate('liquidity_reserve', reservePct.gte(value.constraints.minimumReservePct), metric(reservePct), value.constraints.minimumReservePct),
    gate('concentration', value.constraints.concentrationValid, String(value.constraints.concentrationValid), 'true'),
    gate('data_quality', new Decimal(value.constraints.dataQuality).gte(value.constraints.minimumDataQuality), value.constraints.dataQuality, value.constraints.minimumDataQuality),
    gate('confidence', new Decimal(value.constraints.confidence).gte(value.constraints.minimumConfidence), value.constraints.confidence, value.constraints.minimumConfidence),
    gate('benefit_uncertainty', benefitUncertaintyRatio.gte(value.constraints.minimumBenefitUncertaintyRatio), metric(benefitUncertaintyRatio), value.constraints.minimumBenefitUncertaintyRatio),
    gate('materiality', delta.gte(value.constraints.minimumBenefitBRL), money(delta), value.constraints.minimumBenefitBRL),
    gate('false_arbitrage', falseArbitragePassed, falseArbitragePassed ? 'no_violation' : 'violation', 'no_violation'),
  ]
  const failed = constraints.filter((constraint) => !constraint.passed)
  const evidenceFailed = failed.some((constraint) => ['critical_data_fresh', 'data_quality', 'confidence'].includes(constraint.id))
  const decision: FixedIncomeSwitchResult['decision'] = evidenceFailed
    ? 'insufficient_data'
    : failed.length > 0
      ? 'maintain'
      : new Decimal(value.sellFraction).lt(1) ? 'sell_partial' : 'sell_and_reinvest'
  const reasons = failed.map((constraint) => constraint.id === 'false_arbitrage' ? 'false_arbitrage_invariant' : `${constraint.id}_failed`)

  const requiredNetTerminal = holdNet.plus(value.replacement.costsBRL)
  const replacementTaxRate = new Decimal(value.replacement.incomeTaxRate)
  const requiredGrossTerminal = netReinvestable.plus(requiredNetTerminal.minus(netReinvestable).div(new Decimal(1).minus(replacementTaxRate)))
  const breakEvenGrossRate = requiredGrossTerminal.div(netReinvestable).pow(new Decimal(1).div(replacementYears)).minus(1)
  const breakEvenNetRate = holdNet.div(netReinvestable).pow(new Decimal(1).div(replacementYears)).minus(1)
  const resultWithoutTrace = {
    decision,
    actionable: false as const,
    readiness: 'research_only' as const,
    hold: { grossFinalBRL: money(holdGross), incomeTaxBRL: money(holdTax), costsBRL: money(new Decimal(value.hold.futureCostsBRL)), netFinalBRL: money(holdNet) },
    sell: { grossProceedsBRL: money(saleGross), incomeTaxBRL: money(saleTax), costsBRL: money(saleCosts), netReinvestableBRL: money(netReinvestable) },
    reinvest: { grossFinalBRL: money(reinvestGross), incomeTaxBRL: money(reinvestTax), costsBRL: money(new Decimal(value.replacement.costsBRL)), netFinalBRL: money(reinvestNet) },
    delta: {
      netBRL: money(delta),
      netPct: metric(delta.div(holdNet).mul(100)),
      annualizedUpliftPct: metric(annualizedUplift.mul(100)),
      benefitUncertaintyRatio: metric(benefitUncertaintyRatio),
    },
    breakEven: {
      annualNetRatePct: metric(breakEvenNetRate.mul(100)),
      annualGrossRatePct: metric(breakEvenGrossRate.mul(100)),
      cdiEquivalentPct: value.annualCdiPct === undefined
        ? null
        : metric(breakEvenGrossRate.div(new Decimal(value.annualCdiPct).div(100)).mul(100)),
    },
    constraints,
    reasons,
    methodologyIds: ['fixed-income-switch@1', 'compound-annual-scenarios@1'],
    sources: value.sources,
  }
  const calculationTraceId = createHash('sha256').update(canonicalJson({ input: value, result: resultWithoutTrace }), 'utf8').digest('hex')
  return { ...resultWithoutTrace, calculationTraceId }
}

function gate(id: string, passed: boolean, actual: string, required: string): SwitchConstraintResult {
  return { id, passed, actual, required }
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

function metric(value: Decimal): string {
  if (!value.isFinite() || value.abs().gte('1e99')) return value.isNegative() ? '-infinite' : 'infinite'
  return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
