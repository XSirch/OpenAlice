import Decimal from 'decimal.js'
import type { FixedIncomePosition } from './fixed-income/contracts.js'

export interface MacroExposureContributor { label: string; amountBRL: string; premise: string }
export interface MacroExposure { dimension: 'interest_rates' | 'inflation' | 'liquidity' | 'concentration' | 'exchange_rate'; amountBRL: string; contributors: MacroExposureContributor[]; assumptions: string[]; gaps: string[] }

/** Explain portfolio characteristics from explicit product metadata only. */
export function calculateBrazilMacroExposure(positions: readonly FixedIncomePosition[]): MacroExposure[] {
  const rates = positions.filter((position) => position.product.rate.kind === 'fixed' || position.product.rate.kind === 'cdi_percentage')
  const inflation = positions.filter((position) => position.product.rate.kind === 'ipca_plus')
  const illiquid = positions.filter((position) => position.product.liquidity.redemption !== 'daily')
  const concentration = new Map<string, FixedIncomePosition[]>()
  for (const position of positions) { const key = position.product.issuer.conglomerate ?? position.product.issuer.legalName; concentration.set(key, [...(concentration.get(key) ?? []), position]) }
  return [
    exposure('interest_rates', rates, 'Rate/indexer was explicitly classified in the product definition.'),
    exposure('inflation', inflation, 'Only IPCA-plus products are treated as explicit inflation-linked exposure.'),
    exposure('liquidity', illiquid, 'Only products marked at maturity or scheduled redemption contribute.'),
    { dimension: 'concentration', amountBRL: total(positions).toFixed(2), contributors: [...concentration.entries()].map(([issuer, group]) => ({ label: issuer, amountBRL: total(group).toFixed(2), premise: 'Issuer/conglomerate comes from an explicit custody definition.' })).sort((a, b) => Number(b.amountBRL) - Number(a.amountBRL)), assumptions: ['This is concentration context, not a credit assessment.'], gaps: positions.some((position) => !position.product.issuer.conglomerate) ? ['Some positions have no explicitly supplied conglomerate.'] : [] },
    { dimension: 'exchange_rate', amountBRL: '0.00', contributors: [], assumptions: ['No foreign-currency fixed-income exposure was classified in this input.'], gaps: ['FX sensitivity requires explicit currency and hedge metadata; it is not inferred from issuer names.'] },
  ]
}
function exposure(dimension: MacroExposure['dimension'], positions: readonly FixedIncomePosition[], premise: string): MacroExposure { return { dimension, amountBRL: total(positions).toFixed(2), contributors: positions.map((position) => ({ label: position.product.issuer.legalName, amountBRL: position.currentAmountBRL, premise })), assumptions: [premise], gaps: [] } }
function total(positions: readonly FixedIncomePosition[]): Decimal { return positions.reduce((sum, position) => sum.plus(position.currentAmountBRL), new Decimal(0)) }
