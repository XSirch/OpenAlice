import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

import { addBusinessDays, businessDaysBetween, fixedIncomeCalendarSchema } from '../calendars.js'
import { fixedIncomeCashFlowScheduleSchema, fixedIncomeCashFlowSchema, type FixedIncomeCashFlowSchedule } from '../cashflows.js'
import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from '../providers/provider-contract.js'

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string')
const nonnegativeDecimalString = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')

const treasuryPricingInputSchema = z.object({
  valuationDate: dateOnly,
  yieldAnnualPct: decimalString.refine((value) => new Decimal(value).gt(-100), 'must be greater than -100 percent'),
  accruedInterestBRL: nonnegativeDecimalString,
  faceValueBRL: nonnegativeDecimalString,
  calendar: fixedIncomeCalendarSchema,
  cashFlows: z.array(fixedIncomeCashFlowSchema).min(1).max(10_000),
  methodologyId: z.string().trim().min(1).max(128),
  sources: z.array(fixedIncomeSourceProvenanceSchema).min(1).max(16),
}).strict()

export interface TreasuryPricingResult {
  dirtyPriceBRL: string
  cleanPriceBRL: string
  accruedInterestBRL: string
  macaulayDurationYears: string
  modifiedDurationYears: string
  convexity: string
  dv01BRL: string
  premiumDiscountBRL: string
  yieldToMaturityPct: string
  methodologyId: string
  calculationTraceId: string
  sources: FixedIncomeSourceProvenance[]
}

export function priceTreasuryCashFlows(input: z.input<typeof treasuryPricingInputSchema>): TreasuryPricingResult {
  const value = treasuryPricingInputSchema.parse(input)
  const yieldRate = new Decimal(value.yieldAnnualPct).div(100)
  const timedFlows = value.cashFlows.map((cashFlow) => {
    if (cashFlow.status === 'paid') throw new Error(`paid cash flow ${cashFlow.id} cannot be priced as future value`)
    const businessDays = businessDaysBetween(value.valuationDate, cashFlow.date, value.calendar)
    if (businessDays <= 0) throw new Error(`cash flow ${cashFlow.id} must be after valuationDate`)
    return { cashFlow, years: new Decimal(businessDays).div(252) }
  })
  const priceAt = (rate: Decimal): Decimal => timedFlows.reduce((sum, flow) => (
    sum.plus(new Decimal(flow.cashFlow.grossBRL).div(rate.plus(1).pow(flow.years)))
  ), new Decimal(0))
  const dirtyPrice = priceAt(yieldRate)
  const accruedInterest = new Decimal(value.accruedInterestBRL)
  const cleanPrice = dirtyPrice.minus(accruedInterest)
  if (cleanPrice.isNegative()) throw new Error('accruedInterestBRL cannot exceed dirty price')
  const weightedTime = timedFlows.reduce((sum, flow) => {
    const presentValue = new Decimal(flow.cashFlow.grossBRL).div(yieldRate.plus(1).pow(flow.years))
    return sum.plus(presentValue.mul(flow.years))
  }, new Decimal(0))
  const macaulay = weightedTime.div(dirtyPrice)
  const modified = macaulay.div(yieldRate.plus(1))
  const convexityNumerator = timedFlows.reduce((sum, flow) => {
    const presentValue = new Decimal(flow.cashFlow.grossBRL).div(yieldRate.plus(1).pow(flow.years))
    return sum.plus(presentValue.mul(flow.years).mul(flow.years.plus(1)))
  }, new Decimal(0))
  const convexity = convexityNumerator.div(dirtyPrice.mul(yieldRate.plus(1).pow(2)))
  const basisPoint = new Decimal('0.0001')
  const dv01 = priceAt(yieldRate.minus(basisPoint)).minus(priceAt(yieldRate.plus(basisPoint))).div(2)
  const resultWithoutTrace = {
    dirtyPriceBRL: money(dirtyPrice),
    cleanPriceBRL: money(cleanPrice),
    accruedInterestBRL: money(accruedInterest),
    macaulayDurationYears: metric(macaulay),
    modifiedDurationYears: metric(modified),
    convexity: metric(convexity),
    dv01BRL: metric(dv01),
    premiumDiscountBRL: money(dirtyPrice.minus(value.faceValueBRL)),
    yieldToMaturityPct: new Decimal(value.yieldAnnualPct).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8),
    methodologyId: value.methodologyId,
    sources: value.sources,
  }
  const calculationTraceId = createHash('sha256').update(canonicalJson({ input: value, result: resultWithoutTrace }), 'utf8').digest('hex')
  return { ...resultWithoutTrace, calculationTraceId }
}

const treasuryScenarioInputSchema = treasuryPricingInputSchema.omit({ yieldAnnualPct: true }).extend({
  scenarios: z.array(z.object({
    id: z.enum(['base', 'favorable', 'adverse', 'stress']),
    yieldAnnualPct: decimalString.refine((value) => new Decimal(value).gt(-100), 'must be greater than -100 percent'),
    weight: nonnegativeDecimalString.refine((value) => new Decimal(value).lte(1), 'must not exceed one').optional(),
  }).strict()).length(4),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.scenarios.map((scenario) => scenario.id))
  if (ids.size !== 4) context.addIssue({ code: 'custom', path: ['scenarios'], message: 'base, favorable, adverse, and stress scenarios are required exactly once' })
  const withWeight = value.scenarios.filter((scenario) => scenario.weight !== undefined)
  if (withWeight.length !== 0 && withWeight.length !== value.scenarios.length) {
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'scenario weights must be supplied for every scenario or none' })
  }
  if (withWeight.length === value.scenarios.length) {
    const total = withWeight.reduce((sum, scenario) => sum.plus(scenario.weight!), new Decimal(0))
    if (!total.eq(1)) context.addIssue({ code: 'custom', path: ['scenarios'], message: 'scenario weights must sum to one' })
  }
})

export function priceTreasuryScenarios(input: z.input<typeof treasuryScenarioInputSchema>): {
  scenarios: Array<{ id: 'base' | 'favorable' | 'adverse' | 'stress'; yieldAnnualPct: string; dirtyPriceBRL: string; calculationTraceId: string }>
  interval: { minimumBRL: string; maximumBRL: string }
  probabilityWeightedPriceBRL: string | null
  methodologyId: string
} {
  const value = treasuryScenarioInputSchema.parse(input)
  const { scenarios: scenarioInputs, ...pricingBase } = value
  const scenarios = scenarioInputs.map((scenario) => {
    const priced = priceTreasuryCashFlows({ ...pricingBase, yieldAnnualPct: scenario.yieldAnnualPct })
    return { id: scenario.id, yieldAnnualPct: scenario.yieldAnnualPct, dirtyPriceBRL: priced.dirtyPriceBRL, calculationTraceId: priced.calculationTraceId }
  })
  const prices = scenarios.map((scenario) => new Decimal(scenario.dirtyPriceBRL))
  const weighted = scenarioInputs.every((scenario) => scenario.weight !== undefined)
    ? scenarios.reduce((sum, scenario, index) => sum.plus(new Decimal(scenario.dirtyPriceBRL).mul(scenarioInputs[index]!.weight!)), new Decimal(0))
    : null
  return {
    scenarios,
    interval: { minimumBRL: money(Decimal.min(...prices)), maximumBRL: money(Decimal.max(...prices)) },
    probabilityWeightedPriceBRL: weighted ? money(weighted) : null,
    methodologyId: value.methodologyId,
  }
}

const treasuryCashFlowBuilderInputSchema = z.object({
  instrumentId: z.string().trim().min(1).max(256),
  tradeDate: dateOnly,
  settlementBusinessDays: z.number().int().min(0).max(30),
  maturityDate: dateOnly,
  originalPrincipalBRL: nonnegativeDecimalString.refine((value) => new Decimal(value).gt(0), 'must be positive'),
  calendar: fixedIncomeCalendarSchema,
  couponEvents: z.array(z.object({
    date: dateOnly,
    ratePctOfOutstanding: nonnegativeDecimalString,
  }).strict()).max(1_000),
  amortizationEvents: z.array(z.object({
    date: dateOnly,
    fractionOfOriginal: nonnegativeDecimalString.refine((value) => new Decimal(value).gt(0) && new Decimal(value).lte(1), 'must be greater than zero and at most one'),
  }).strict()).max(1_000),
  generatedAt: z.string().datetime({ offset: true }),
  methodologyId: z.string().trim().min(1).max(128),
  sources: z.array(fixedIncomeSourceProvenanceSchema).min(1).max(16),
}).strict()

export function buildTreasuryCashFlowSchedule(input: z.input<typeof treasuryCashFlowBuilderInputSchema>): {
  settlementDate: string
  schedule: FixedIncomeCashFlowSchedule
  calculationTraceId: string
  sources: FixedIncomeSourceProvenance[]
} {
  const value = treasuryCashFlowBuilderInputSchema.parse(input)
  const settlementDate = addBusinessDays(value.tradeDate, value.settlementBusinessDays, value.calendar)
  if (value.maturityDate <= settlementDate) throw new Error('maturityDate must be after settlementDate')
  assertUniqueEventDates(value.couponEvents, 'coupon')
  assertUniqueEventDates(value.amortizationEvents, 'amortization')
  for (const event of [...value.couponEvents, ...value.amortizationEvents]) {
    if (event.date < settlementDate || event.date > value.maturityDate) throw new Error(`cash-flow event ${event.date} must be between settlement and maturity`)
    businessDaysBetween(value.tradeDate, event.date, value.calendar)
  }
  const coupons = new Map(value.couponEvents.map((event) => [event.date, event]))
  const amortizations = new Map(value.amortizationEvents.map((event) => [event.date, event]))
  const eventDates = [...new Set([...coupons.keys(), ...amortizations.keys(), value.maturityDate])].sort()
  const originalPrincipal = new Decimal(value.originalPrincipalBRL)
  let outstanding = originalPrincipal
  const cashFlows: FixedIncomeCashFlowSchedule['cashFlows'] = []
  for (const date of eventDates) {
    const coupon = coupons.get(date)
    if (coupon) {
      cashFlows.push({
        id: `${value.instrumentId}:${date}:coupon`, instrumentId: value.instrumentId, date, kind: 'coupon',
        grossBRL: money(outstanding.mul(coupon.ratePctOfOutstanding).div(100)), status: 'projected',
      })
    }
    const amortization = amortizations.get(date)
    if (amortization) {
      const amount = originalPrincipal.mul(amortization.fractionOfOriginal)
      if (amount.gt(outstanding)) throw new Error('amortization events exceed outstanding principal')
      cashFlows.push({
        id: `${value.instrumentId}:${date}:amortization`, instrumentId: value.instrumentId, date, kind: 'amortization',
        grossBRL: money(amount), status: 'projected',
      })
      outstanding = outstanding.minus(amount)
    }
    if (date === value.maturityDate && outstanding.isPositive()) {
      cashFlows.push({
        id: `${value.instrumentId}:${date}:principal`, instrumentId: value.instrumentId, date, kind: 'principal',
        grossBRL: money(outstanding), status: 'projected',
      })
      outstanding = new Decimal(0)
    }
  }
  const schedule = fixedIncomeCashFlowScheduleSchema.parse({
    version: 1, methodologyId: value.methodologyId, generatedAt: value.generatedAt, cashFlows,
  })
  const calculationTraceId = createHash('sha256').update(canonicalJson({ input: value, settlementDate, schedule }), 'utf8').digest('hex')
  return { settlementDate, schedule, calculationTraceId, sources: value.sources }
}

const indexedNotionalInputSchema = z.object({
  baseNotionalBRL: nonnegativeDecimalString,
  baseReferenceDate: dateOnly,
  targetDate: dateOnly,
  annualIndexPct: decimalString.refine((value) => new Decimal(value).gt(-100), 'must be greater than -100 percent'),
  indexLagMonths: z.number().int().min(0).max(120),
  methodologyId: z.string().trim().min(1).max(128),
}).strict()

export function projectTreasuryIndexedNotional(input: z.input<typeof indexedNotionalInputSchema>): {
  projectedNotionalBRL: string
  effectiveIndexDate: string
  indexAccrualDays: number
  methodologyId: string
} {
  const value = indexedNotionalInputSchema.parse(input)
  const effectiveIndexDate = subtractUtcMonths(value.targetDate, value.indexLagMonths)
  const start = parseDate(value.baseReferenceDate)
  const end = parseDate(effectiveIndexDate)
  const indexAccrualDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  if (indexAccrualDays < 0) throw new Error('effective index date must not precede baseReferenceDate')
  const growth = new Decimal(1).plus(new Decimal(value.annualIndexPct).div(100)).pow(new Decimal(indexAccrualDays).div(365))
  return {
    projectedNotionalBRL: money(new Decimal(value.baseNotionalBRL).mul(growth)),
    effectiveIndexDate,
    indexAccrualDays,
    methodologyId: value.methodologyId,
  }
}

function subtractUtcMonths(value: string, months: number): string {
  const date = parseDate(value)
  const originalDay = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(originalDay, lastDay))
  return date.toISOString().slice(0, 10)
}

function assertUniqueEventDates(events: ReadonlyArray<{ date: string }>, label: string): void {
  if (new Set(events.map((event) => event.date)).size !== events.length) throw new Error(`duplicate ${label} event date`)
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('date must be a valid ISO calendar date')
  return date
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

function metric(value: Decimal): string {
  return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
