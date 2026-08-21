import Decimal from 'decimal.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'

import { fixedIncomeProductTypeSchema, type FixedIncomeProduct } from './contracts.js'
import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO calendar date')
const nonnegativeDecimalString = z.string()
  .regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
const rateString = nonnegativeDecimalString.refine((value) => new Decimal(value).lte(1), 'must be between zero and one')

const taxBracketsSchema = z.array(z.object({
  upToDays: z.number().int().positive().optional(),
  rate: rateString,
}).strict()).min(1).max(32).superRefine((brackets, context) => {
  let previous = 0
  brackets.forEach((bracket, index) => {
    if (index < brackets.length - 1 && bracket.upToDays === undefined) {
      context.addIssue({ code: 'custom', path: [index, 'upToDays'], message: 'only the final bracket may be open-ended' })
    }
    if (bracket.upToDays !== undefined && bracket.upToDays <= previous) {
      context.addIssue({ code: 'custom', path: [index, 'upToDays'], message: 'bracket limits must increase' })
    }
    previous = bracket.upToDays ?? previous
  })
  if (brackets.at(-1)?.upToDays !== undefined) {
    context.addIssue({ code: 'custom', path: [brackets.length - 1, 'upToDays'], message: 'the final bracket must be open-ended' })
  }
})

const incomeTaxFormulaSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('regressive'), brackets: taxBracketsSchema }).strict(),
  z.object({ kind: z.literal('exempt') }).strict(),
  z.object({ kind: z.literal('conditional_exempt'), fallbackBrackets: taxBracketsSchema }).strict(),
])

const iofFormulaSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({
    kind: z.literal('daily'),
    rates: z.array(z.object({ day: z.number().int().min(0).max(365), rate: rateString }).strict()).max(366),
  }).strict().superRefine((formula, context) => {
    const days = new Set<number>()
    formula.rates.forEach((entry, index) => {
      if (days.has(entry.day)) context.addIssue({ code: 'custom', path: ['rates', index, 'day'], message: 'duplicate IOF day' })
      days.add(entry.day)
    })
  }),
])

export const taxRuleSchema = z.object({
  id: z.string().trim().min(1).max(128),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.optional(),
  investorType: z.literal('PF_BR'),
  productTypes: z.array(fixedIncomeProductTypeSchema).min(1),
  incomeTax: incomeTaxFormulaSchema,
  iof: iofFormulaSchema,
  exemptionConditions: z.array(z.string().trim().min(1).max(512)).max(32),
  source: fixedIncomeSourceProvenanceSchema.refine((value) => value.decision !== 'blocked', 'blocked sources cannot define tax rules'),
  supportingSources: z.array(fixedIncomeSourceProvenanceSchema).max(8).default([]),
}).strict().superRefine((rule, context) => {
  if (rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) {
    context.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'effectiveTo must not be before effectiveFrom' })
  }
})

export const taxRuleSetSchema = z.object({
  version: z.literal(1),
  rules: z.array(taxRuleSchema).min(1).max(1_000),
}).strict()

export type TaxRule = z.infer<typeof taxRuleSchema>
export type TaxRuleSet = z.infer<typeof taxRuleSetSchema>

export interface FixedIncomeTaxInput {
  investorType: 'PF_BR'
  productType: FixedIncomeProduct['productType']
  acquisitionDate: string
  redemptionDate: string
  grossIncomeBRL: string
  exemptionConfirmed: boolean
}

export interface FixedIncomeTaxResult {
  ruleId: string
  holdingPeriodDays: number
  iofRate: string
  iofBRL: string
  incomeTaxRate: string
  incomeTaxBRL: string
  netIncomeBRL: string
  actionable: boolean
  reasons: string[]
  sources: FixedIncomeSourceProvenance[]
}

export class TaxRuleRegistry {
  readonly ruleSet: TaxRuleSet

  constructor(input: TaxRuleSet) {
    this.ruleSet = taxRuleSetSchema.parse(input)
    assertNoAmbiguousWindows(this.ruleSet.rules)
  }

  calculate(input: FixedIncomeTaxInput): FixedIncomeTaxResult {
    const acquisition = parseDate(input.acquisitionDate, 'acquisitionDate')
    const redemption = parseDate(input.redemptionDate, 'redemptionDate')
    const holdingPeriodDays = Math.round((redemption.getTime() - acquisition.getTime()) / 86_400_000)
    if (holdingPeriodDays < 0) throw new Error('redemptionDate must not be before acquisitionDate')
    const grossIncome = new Decimal(input.grossIncomeBRL)
    if (!grossIncome.isFinite() || grossIncome.isNegative()) throw new Error('grossIncomeBRL must be a non-negative decimal string')

    const matching = this.ruleSet.rules.filter((rule) => (
      rule.investorType === input.investorType
      && rule.productTypes.includes(input.productType)
      && rule.effectiveFrom <= input.redemptionDate
      && (!rule.effectiveTo || rule.effectiveTo >= input.redemptionDate)
    ))
    if (matching.length === 0) throw new Error('no tax rule matches the redemption event')
    if (matching.length > 1) throw new Error('ambiguous tax rules match the redemption event')
    const rule = matching[0]!

    const iofRate = rule.iof.kind === 'daily'
      ? new Decimal(rule.iof.rates.find((entry) => entry.day === holdingPeriodDays)?.rate ?? 0)
      : new Decimal(0)
    const iof = grossIncome.mul(iofRate)
    const taxableIncome = Decimal.max(0, grossIncome.minus(iof))
    const exemptionUnconfirmed = rule.incomeTax.kind === 'conditional_exempt' && !input.exemptionConfirmed
    let incomeTaxRate = new Decimal(0)
    if (rule.incomeTax.kind === 'regressive') {
      incomeTaxRate = bracketRate(rule.incomeTax.brackets, holdingPeriodDays)
    } else if (rule.incomeTax.kind === 'conditional_exempt' && exemptionUnconfirmed) {
      incomeTaxRate = bracketRate(rule.incomeTax.fallbackBrackets, holdingPeriodDays)
    }
    const incomeTax = taxableIncome.mul(incomeTaxRate)
    return {
      ruleId: rule.id,
      holdingPeriodDays,
      iofRate: iofRate.toString(),
      iofBRL: money(iof),
      incomeTaxRate: incomeTaxRate.toString(),
      incomeTaxBRL: money(incomeTax),
      netIncomeBRL: money(grossIncome.minus(iof).minus(incomeTax)),
      actionable: !exemptionUnconfirmed,
      reasons: exemptionUnconfirmed ? ['exemption_unconfirmed'] : [],
      sources: [rule.source, ...rule.supportingSources],
    }
  }
}

const regressiveBrackets = [
  { upToDays: 180, rate: '0.225' },
  { upToDays: 360, rate: '0.20' },
  { upToDays: 720, rate: '0.175' },
  { rate: '0.15' },
] as const
const iofRates = ['0.96', '0.93', '0.90', '0.86', '0.83', '0.80', '0.76', '0.73', '0.70', '0.66', '0.63', '0.60', '0.56', '0.53', '0.50', '0.46', '0.43', '0.40', '0.36', '0.33', '0.30', '0.26', '0.23', '0.20', '0.16', '0.13', '0.10', '0.06', '0.03'] as const

const incomeTaxSource = reviewedSource({
  publisher: 'Receita Federal do Brasil',
  sourceId: 'receita.tributacao-2026.renda-fixa',
  sourceUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
  termsVersion: 'page-updated-2026-04-27',
  capturedEvidence: JSON.stringify(regressiveBrackets),
  rawPayloadChecksum: '157498edb13dcdedba011fce3d2469f5395f30e4eef5da349e2a1a0bd0ce0f6c',
})
const iofSource = reviewedSource({
  publisher: 'Presidência da República',
  sourceId: 'planalto.decreto-6306-compilado.anexo',
  sourceUrl: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306compilado.htm',
  termsVersion: 'compiled-decree-reviewed-2026-08-20',
  capturedEvidence: JSON.stringify(iofRates),
})

/**
 * Reviewed 2026 PF baseline. The rules remain data, carry their evidence, and
 * can be replaced by a later effective window without changing calculations.
 */
export const defaultBrazilPfTaxRuleSet2026: TaxRuleSet = taxRuleSetSchema.parse({
  version: 1,
  rules: [
    {
      id: 'br-pf-renda-fixa-tributavel@2026-01',
      effectiveFrom: '2026-01-01',
      investorType: 'PF_BR',
      productTypes: [
        'tesouro_selic', 'tesouro_prefixado', 'tesouro_prefixado_coupon',
        'tesouro_ipca', 'tesouro_ipca_coupon', 'tesouro_renda_mais',
        'tesouro_educa_mais', 'tesouro_direto', 'cdb', 'rdb', 'lc',
        'debenture', 'fixed_income_fund',
      ],
      incomeTax: { kind: 'regressive', brackets: regressiveBrackets },
      iof: { kind: 'daily', rates: iofRates.map((rate, index) => ({ day: index + 1, rate })) },
      exemptionConditions: [],
      source: incomeTaxSource,
      supportingSources: [iofSource],
    },
    {
      id: 'br-pf-renda-fixa-isenta@2026-01',
      effectiveFrom: '2026-01-01',
      investorType: 'PF_BR',
      productTypes: ['lci', 'lca', 'cri', 'cra', 'debenture_incentivada'],
      incomeTax: { kind: 'conditional_exempt', fallbackBrackets: regressiveBrackets },
      iof: { kind: 'daily', rates: iofRates.map((rate, index) => ({ day: index + 1, rate })) },
      exemptionConditions: ['PF_BR residence and instrument/event eligibility must be confirmed'],
      source: reviewedSource({
        publisher: 'Receita Federal do Brasil',
        sourceId: 'receita.rendimentos-capital.isentos',
        sourceUrl: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-capital',
        termsVersion: 'page-reviewed-2026-08-20',
        capturedEvidence: 'PF_BR|LCI|LCA|CRI|CRA|debentures-infraestrutura|isentos',
        rawPayloadChecksum: '5a7069bc1c946ad66138b464b310a3131fdbb6ad2f862a32ed3d27c29f70590d',
      }),
      supportingSources: [iofSource],
    },
  ],
})

export const defaultBrazilPfTaxRuleRegistry = new TaxRuleRegistry(defaultBrazilPfTaxRuleSet2026)

export function defaultBrazilPfIncomeTaxRate(holdingPeriodDays: number, exempt: boolean): Decimal {
  if (!Number.isInteger(holdingPeriodDays) || holdingPeriodDays < 0) throw new Error('days must be a non-negative integer')
  if (exempt) return new Decimal(0)
  return bracketRate(regressiveBrackets, holdingPeriodDays)
}

export function defaultBrazilPfIofRate(holdingPeriodDays: number): Decimal {
  if (!Number.isInteger(holdingPeriodDays) || holdingPeriodDays < 0) throw new Error('days must be a non-negative integer')
  return new Decimal(iofRates[holdingPeriodDays - 1] ?? 0)
}

function bracketRate(brackets: ReadonlyArray<{ upToDays?: number; rate: string }>, holdingPeriodDays: number): Decimal {
  return new Decimal(brackets.find((bracket) => bracket.upToDays === undefined || holdingPeriodDays <= bracket.upToDays)!.rate)
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be an ISO calendar date`)
  const result = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new Error(`${field} must be a valid ISO calendar date`)
  return result
}

function assertNoAmbiguousWindows(rules: TaxRule[]): void {
  for (let leftIndex = 0; leftIndex < rules.length; leftIndex += 1) {
    const left = rules[leftIndex]!
    for (let rightIndex = leftIndex + 1; rightIndex < rules.length; rightIndex += 1) {
      const right = rules[rightIndex]!
      if (left.investorType !== right.investorType) continue
      if (!left.productTypes.some((productType) => right.productTypes.includes(productType))) continue
      const leftEnd = left.effectiveTo ?? '9999-12-31'
      const rightEnd = right.effectiveTo ?? '9999-12-31'
      if (left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd) {
        throw new Error(`ambiguous tax-rule windows: ${left.id} and ${right.id}`)
      }
    }
  }
}

function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

function reviewedSource(input: {
  publisher: string
  sourceId: string
  sourceUrl: string
  termsVersion: string
  capturedEvidence: string
  rawPayloadChecksum?: string
}): z.input<typeof fixedIncomeSourceProvenanceSchema> {
  return {
    publisher: input.publisher,
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl,
    decision: 'manual',
    access: 'official_public_page',
    method: 'manual_upload',
    parameters: {},
    license: 'official_public',
    termsReviewedAt: '2026-08-20',
    termsVersion: input.termsVersion,
    retrievedAt: '2026-08-20T12:00:00.000Z',
    dataAsOf: '2026-08-20',
    rawPayloadChecksum: input.rawPayloadChecksum ?? createHash('sha256').update(input.capturedEvidence, 'utf8').digest('hex'),
    parserVersion: 'manual-rule-capture@1',
    originalIdentifiers: { sourceId: input.sourceId },
  }
}
