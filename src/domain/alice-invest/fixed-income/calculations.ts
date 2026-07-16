import Decimal from 'decimal.js'
import type { FixedIncomeProduct } from './contracts.js'

const IR_BRACKETS: ReadonlyArray<[number, string]> = [[180, '0.225'], [360, '0.20'], [720, '0.175'], [Infinity, '0.15']]
const IOF_RATES = ['0.96','0.93','0.90','0.86','0.83','0.80','0.76','0.73','0.70','0.66','0.63','0.60','0.56','0.53','0.50','0.46','0.43','0.40','0.36','0.33','0.30','0.26','0.23','0.20','0.16','0.13','0.10','0.06','0.03']

export interface FixedIncomeProjectionInput {
  product: FixedIncomeProduct
  principalBRL: string
  calendarDays: number
  businessDays: number
  annualCdiPct?: string
  annualIpcaPct?: string
}
export interface FixedIncomeProjection { grossBRL: string; netBRL: string; grossInterestBRL: string; incomeTaxBRL: string; iofBRL: string; incomeTaxRate: string; iofRate: string }

export function incomeTaxRate(days: number, exempt = false): Decimal {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a non-negative integer')
  if (exempt) return new Decimal(0)
  return new Decimal(IR_BRACKETS.find(([limit]) => days <= limit)![1])
}
export function iofRate(days: number): Decimal {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a non-negative integer')
  return new Decimal(IOF_RATES[days - 1] ?? '0')
}
export function projectFixedIncome(input: FixedIncomeProjectionInput): FixedIncomeProjection {
  if (!Number.isInteger(input.calendarDays) || input.calendarDays < 0 || !Number.isInteger(input.businessDays) || input.businessDays < 0) throw new Error('day counts must be non-negative integers')
  const principal = new Decimal(input.principalBRL)
  if (principal.lte(0)) throw new Error('principalBRL must be positive')
  const annualRate = rateFor(input.product, input.annualCdiPct, input.annualIpcaPct)
  const periods = input.product.rate.kind === 'cdi_percentage' ? new Decimal(input.businessDays).div(252) : new Decimal(input.calendarDays).div(365)
  const gross = principal.mul(new Decimal(1).plus(annualRate).pow(periods))
  const interest = gross.minus(principal)
  const iof = interest.mul(iofRate(input.calendarDays))
  const ir = interest.minus(iof).mul(incomeTaxRate(input.calendarDays, input.product.productType === 'lci' || input.product.productType === 'lca'))
  const net = gross.minus(iof).minus(ir)
  return { grossBRL: money(gross), netBRL: money(net), grossInterestBRL: money(interest), incomeTaxBRL: money(ir), iofBRL: money(iof), incomeTaxRate: incomeTaxRate(input.calendarDays, input.product.productType === 'lci' || input.product.productType === 'lca').toString(), iofRate: iofRate(input.calendarDays).toString() }
}
function rateFor(product: FixedIncomeProduct, cdi?: string, ipca?: string): Decimal {
  if (product.rate.kind === 'fixed') return new Decimal(product.rate.annualRatePct).div(100)
  if (product.rate.kind === 'cdi_percentage') { if (!cdi) throw new Error('annualCdiPct is required'); return new Decimal(cdi).mul(product.rate.cdiPct).div(10_000) }
  if (!ipca) throw new Error('annualIpcaPct is required')
  return new Decimal(1).plus(new Decimal(ipca).div(100)).mul(new Decimal(1).plus(new Decimal(product.rate.spreadPct).div(100))).minus(1)
}
function money(value: Decimal): string { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }
