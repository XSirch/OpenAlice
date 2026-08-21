import Decimal from 'decimal.js'
import { z } from 'zod'

const datedCashFlowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date'),
  amountBRL: z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be a decimal string'),
}).strict()

export interface XirrResult {
  annualRatePct: string
  iterations: number
  residualBRL: string
  methodologyId: 'xirr-actual-365-bisection@1'
}

export function calculateXirr(input: ReadonlyArray<z.input<typeof datedCashFlowSchema>>): XirrResult {
  const parsed = z.array(datedCashFlowSchema).min(2).max(100_000).parse(input)
  const byDate = new Map<string, Decimal>()
  for (const flow of parsed) {
    parseDate(flow.date)
    byDate.set(flow.date, (byDate.get(flow.date) ?? new Decimal(0)).plus(flow.amountBRL))
  }
  const flows = [...byDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .filter((flow) => !flow.amount.isZero())
    .sort((left, right) => left.date.localeCompare(right.date))
  if (!flows.some((flow) => flow.amount.isNegative()) || !flows.some((flow) => flow.amount.isPositive())) {
    throw new Error('XIRR requires positive and negative cash flows')
  }
  let signChanges = 0
  for (let index = 1; index < flows.length; index += 1) {
    if (flows[index - 1]!.amount.isNegative() !== flows[index]!.amount.isNegative()) signChanges += 1
  }
  if (signChanges !== 1 || !flows[0]!.amount.isNegative()) {
    throw new Error('XIRR with multiple or non-conventional sign changes is ambiguous')
  }

  const origin = parseDate(flows[0]!.date)
  const withYears = flows.map((flow) => ({ amount: flow.amount, years: new Decimal(daysBetween(origin, parseDate(flow.date))).div(365) }))
  let low = new Decimal('-0.999999999')
  let high = new Decimal(1)
  const lowNpv = npv(withYears, low)
  let highNpv = npv(withYears, high)
  while (highNpv.isPositive() && high.lt(1_000_000)) {
    high = high.mul(2).plus(1)
    highNpv = npv(withYears, high)
  }
  if (!lowNpv.isPositive() || !highNpv.isNegative()) throw new Error('XIRR root could not be bracketed')

  let midpoint = new Decimal(0)
  let residual = new Decimal(0)
  let iterations = 0
  for (; iterations < 256; iterations += 1) {
    midpoint = low.plus(high).div(2)
    residual = npv(withYears, midpoint)
    if (residual.abs().lte('0.00000001') || high.minus(low).abs().lte('0.000000000001')) break
    if (residual.isPositive()) low = midpoint
    else high = midpoint
  }
  return {
    annualRatePct: midpoint.mul(100).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8),
    iterations: iterations + 1,
    residualBRL: residual.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8),
    methodologyId: 'xirr-actual-365-bisection@1',
  }
}

function npv(flows: ReadonlyArray<{ amount: Decimal; years: Decimal }>, rate: Decimal): Decimal {
  const base = rate.plus(1)
  return flows.reduce((sum, flow) => sum.plus(flow.amount.div(base.pow(flow.years))), new Decimal(0))
}

function parseDate(value: string): Date {
  const result = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new Error('cash-flow date must be a valid ISO calendar date')
  return result
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}
