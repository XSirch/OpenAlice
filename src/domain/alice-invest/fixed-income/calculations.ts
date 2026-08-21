import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import type { FixedIncomeProduct } from './contracts.js'
import type { FixedIncomeSourceProvenance } from './providers/provider-contract.js'
import {
  defaultBrazilPfIncomeTaxRate,
  defaultBrazilPfIofRate,
  defaultBrazilPfTaxRuleRegistry,
  type TaxRuleRegistry,
} from './tax-rules.js'

export interface FixedIncomeProjectionInput {
  product: FixedIncomeProduct
  principalBRL: string
  calendarDays: number
  businessDays: number
  annualCdiPct?: string
  annualSelicPct?: string
  annualIpcaPct?: string
  annualIgpmPct?: string
  acquisitionDate?: string
  redemptionDate?: string
  exemptionConfirmed?: boolean
  taxRuleRegistry?: TaxRuleRegistry
}
export interface FixedIncomeProjection { grossBRL: string; netBRL: string; grossInterestBRL: string; incomeTaxBRL: string; iofBRL: string; incomeTaxRate: string; iofRate: string; taxRuleId: string; taxActionable: boolean; taxReasons: string[]; calculationTraceId: string; methodologyIds: string[]; sources: FixedIncomeSourceProvenance[] }

export function incomeTaxRate(days: number, exempt = false): Decimal {
  return defaultBrazilPfIncomeTaxRate(days, exempt)
}
export function iofRate(days: number): Decimal {
  return defaultBrazilPfIofRate(days)
}
export function projectFixedIncome(input: FixedIncomeProjectionInput): FixedIncomeProjection {
  if (!Number.isInteger(input.calendarDays) || input.calendarDays < 0 || !Number.isInteger(input.businessDays) || input.businessDays < 0) throw new Error('day counts must be non-negative integers')
  const principal = new Decimal(input.principalBRL)
  if (principal.lte(0)) throw new Error('principalBRL must be positive')
  const annualRate = rateFor(input.product, input.annualCdiPct, input.annualSelicPct, input.annualIpcaPct, input.annualIgpmPct)
  const businessDayRate = input.product.rate.kind === 'cdi_percentage' || input.product.rate.kind === 'cdi_plus' || input.product.rate.kind === 'selic_plus'
  const periods = businessDayRate ? new Decimal(input.businessDays).div(252) : new Decimal(input.calendarDays).div(365)
  const gross = principal.mul(new Decimal(1).plus(annualRate).pow(periods))
  const interest = gross.minus(principal)
  const taxDates = resolveTaxDates(input)
  const isLegacyConfirmedExemption = input.product.productType === 'lci' || input.product.productType === 'lca'
  const tax = (input.taxRuleRegistry ?? defaultBrazilPfTaxRuleRegistry).calculate({
    investorType: 'PF_BR',
    productType: input.product.productType,
    acquisitionDate: taxDates.acquisitionDate,
    redemptionDate: taxDates.redemptionDate,
    grossIncomeBRL: interest.toString(),
    exemptionConfirmed: input.exemptionConfirmed ?? isLegacyConfirmedExemption,
  })
  const net = gross.minus(tax.iofBRL).minus(tax.incomeTaxBRL)
  const result = {
    grossBRL: money(gross),
    netBRL: money(net),
    grossInterestBRL: money(interest),
    incomeTaxBRL: tax.incomeTaxBRL,
    iofBRL: tax.iofBRL,
    incomeTaxRate: tax.incomeTaxRate,
    iofRate: tax.iofRate,
    taxRuleId: tax.ruleId,
    taxActionable: tax.actionable,
    taxReasons: tax.reasons,
    methodologyIds: ['fixed-income-projection@2', tax.ruleId],
    sources: tax.sources,
  }
  const calculationTraceId = createHash('sha256').update(canonicalJson({
    product: input.product,
    principalBRL: input.principalBRL,
    calendarDays: input.calendarDays,
    businessDays: input.businessDays,
    annualCdiPct: input.annualCdiPct ?? null,
    annualSelicPct: input.annualSelicPct ?? null,
    annualIpcaPct: input.annualIpcaPct ?? null,
    annualIgpmPct: input.annualIgpmPct ?? null,
    acquisitionDate: taxDates.acquisitionDate,
    redemptionDate: taxDates.redemptionDate,
    exemptionConfirmed: input.exemptionConfirmed ?? isLegacyConfirmedExemption,
    result,
  }), 'utf8').digest('hex')
  return { ...result, calculationTraceId }
}
function rateFor(product: FixedIncomeProduct, cdi?: string, selic?: string, ipca?: string, igpm?: string): Decimal {
  if (product.rate.kind === 'fixed') return new Decimal(product.rate.annualRatePct).div(100)
  if (product.rate.kind === 'cdi_percentage') { if (!cdi) throw new Error('annualCdiPct is required'); return new Decimal(cdi).mul(product.rate.cdiPct).div(10_000) }
  if (product.rate.kind === 'cdi_plus') return indexedPlusRate(cdi, product.rate.spreadPct, 'annualCdiPct')
  if (product.rate.kind === 'selic_plus') return indexedPlusRate(selic, product.rate.spreadPct, 'annualSelicPct')
  if (product.rate.kind === 'ipca_plus') return indexedPlusRate(ipca, product.rate.spreadPct, 'annualIpcaPct')
  if (product.rate.kind === 'igpm_plus') return indexedPlusRate(igpm, product.rate.spreadPct, 'annualIgpmPct')
  if (product.rate.kind === 'custom') throw new Error(`custom rate methodology is not implemented: ${product.rate.methodologyId}`)
  if (product.rate.kind === 'other') {
    if (!product.rate.annualRatePct) throw new Error('annualRatePct is required for other indexers')
    return new Decimal(product.rate.annualRatePct).div(100)
  }
  throw new Error('unsupported fixed-income rate')
}
function indexedPlusRate(indexPct: string | undefined, spreadPct: string, requiredField: string): Decimal {
  if (!indexPct) throw new Error(`${requiredField} is required`)
  return new Decimal(1).plus(new Decimal(indexPct).div(100)).mul(new Decimal(1).plus(new Decimal(spreadPct).div(100))).minus(1)
}
function resolveTaxDates(input: FixedIncomeProjectionInput): { acquisitionDate: string; redemptionDate: string } {
  if ((input.acquisitionDate && !input.redemptionDate) || (!input.acquisitionDate && input.redemptionDate)) {
    throw new Error('acquisitionDate and redemptionDate must be provided together')
  }
  const acquisitionDate = input.acquisitionDate ?? input.product.issueDate
  const redemptionDate = input.redemptionDate ?? addDays(acquisitionDate, input.calendarDays)
  const actualDays = Math.round((Date.parse(`${redemptionDate}T00:00:00.000Z`) - Date.parse(`${acquisitionDate}T00:00:00.000Z`)) / 86_400_000)
  if (actualDays !== input.calendarDays) throw new Error('calendarDays must match acquisitionDate and redemptionDate')
  return { acquisitionDate, redemptionDate }
}
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function money(value: Decimal): string { return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
