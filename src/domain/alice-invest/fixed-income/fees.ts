import Decimal from 'decimal.js'
import { z } from 'zod'

const nonnegativeDecimalString = z.string().regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const percentageString = nonnegativeDecimalString.refine((value) => new Decimal(value).lte(100), 'must not exceed 100 percent')

export const fixedIncomeFeeInputSchema = z.object({
  principalBRL: nonnegativeDecimalString,
  grossAmountBRL: nonnegativeDecimalString,
  grossIncomeBRL: nonnegativeDecimalString,
  calendarDays: z.number().int().min(0).max(36_600),
  administrationAnnualPct: percentageString,
  performancePct: percentageString,
  entryPct: percentageString,
  exitPct: percentageString,
  custodyBRL: nonnegativeDecimalString,
  distributionBRL: nonnegativeDecimalString,
  spreadBRL: nonnegativeDecimalString,
  emolumentsBRL: nonnegativeDecimalString,
  methodologyId: z.string().trim().min(1).max(128),
}).strict()

export interface FixedIncomeFeeResult {
  methodologyId: string
  entryBRL: string
  exitBRL: string
  administrationBRL: string
  performanceBRL: string
  custodyBRL: string
  distributionBRL: string
  spreadBRL: string
  emolumentsBRL: string
  totalFeesBRL: string
  rounding: 'BRL_HALF_UP_2'
}

export function calculateFixedIncomeFees(input: z.input<typeof fixedIncomeFeeInputSchema>): FixedIncomeFeeResult {
  const value = fixedIncomeFeeInputSchema.parse(input)
  const principal = new Decimal(value.principalBRL)
  const grossAmount = new Decimal(value.grossAmountBRL)
  const grossIncome = new Decimal(value.grossIncomeBRL)
  const entry = principal.mul(value.entryPct).div(100)
  const exit = grossAmount.mul(value.exitPct).div(100)
  const administration = principal.mul(value.administrationAnnualPct).div(100).mul(value.calendarDays).div(365)
  const performance = grossIncome.mul(value.performancePct).div(100)
  const explicit = [value.custodyBRL, value.distributionBRL, value.spreadBRL, value.emolumentsBRL].map((amount) => new Decimal(amount))
  const total = [entry, exit, administration, performance, ...explicit].reduce((sum, amount) => sum.plus(amount), new Decimal(0))
  return {
    methodologyId: value.methodologyId,
    entryBRL: money(entry),
    exitBRL: money(exit),
    administrationBRL: money(administration),
    performanceBRL: money(performance),
    custodyBRL: money(explicit[0]!),
    distributionBRL: money(explicit[1]!),
    spreadBRL: money(explicit[2]!),
    emolumentsBRL: money(explicit[3]!),
    totalFeesBRL: money(total),
    rounding: 'BRL_HALF_UP_2',
  }
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}
