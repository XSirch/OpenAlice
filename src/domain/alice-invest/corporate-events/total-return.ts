import Decimal from 'decimal.js'
import type { BrokerageOperation } from '../tax/ledger.js'
import type { CorporateEvent } from './contracts.js'

export interface TotalReturnBreakdown { symbol: string; asOf: string; contributionsBRL: string; withdrawalsBRL: string; priceReturnBRL: string; dividendsBRL: string; costsBRL: string; quantity: string; dataBases: string[]; gaps: string[] }

/** Realized return plus confirmed cash events. Current mark-to-market is deliberately absent until a sourced quote is supplied. */
export function calculateTotalReturn(operations: readonly BrokerageOperation[], events: readonly CorporateEvent[]): TotalReturnBreakdown[] {
  const bySymbol = new Map<string, { quantity: Decimal; cost: Decimal; contributions: Decimal; withdrawals: Decimal; price: Decimal; dividends: Decimal; fees: Decimal; dates: Set<string>; gaps: string[] }>()
  const timeline = [
    ...operations.map((operation) => ({ date: operation.tradeDate, kind: 'operation' as const, operation })),
    ...events.filter((event) => ['dividend', 'jcp', 'amortization'].includes(event.type) && event.cashAmountPerUnitBRL).map((event) => ({ date: event.paymentDate ?? event.exDate ?? event.competence, kind: 'event' as const, event })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
  for (const item of timeline) {
    const symbol = item.kind === 'operation' ? item.operation.symbol : item.event.instrument
    const state = bySymbol.get(symbol) ?? { quantity: new Decimal(0), cost: new Decimal(0), contributions: new Decimal(0), withdrawals: new Decimal(0), price: new Decimal(0), dividends: new Decimal(0), fees: new Decimal(0), dates: new Set<string>(), gaps: [] }
    state.dates.add(item.date)
    if (item.kind === 'operation') {
      const operation = item.operation; const quantity = new Decimal(operation.quantity); const gross = quantity.mul(operation.unitPriceBRL); const costs = new Decimal(operation.feesBRL).plus(operation.taxesBRL); state.fees = state.fees.plus(costs)
      if (operation.side === 'buy') { state.quantity = state.quantity.plus(quantity); state.cost = state.cost.plus(gross).plus(costs); state.contributions = state.contributions.plus(gross).plus(costs) }
      else if (state.quantity.lt(quantity)) state.gaps.push(`Sale on ${operation.tradeDate} exceeds the recorded quantity.`)
      else { const average = state.quantity.isZero() ? new Decimal(0) : state.cost.div(state.quantity); const removed = average.mul(quantity); state.quantity = state.quantity.minus(quantity); state.cost = state.cost.minus(removed); const net = gross.minus(costs); state.withdrawals = state.withdrawals.plus(net); state.price = state.price.plus(net.minus(removed)) }
    } else state.dividends = state.dividends.plus(new Decimal(item.event.cashAmountPerUnitBRL!).mul(state.quantity))
    bySymbol.set(symbol, state)
  }
  return [...bySymbol.entries()].map(([symbol, value]) => ({ symbol, asOf: [...value.dates].sort().at(-1) ?? '', contributionsBRL: value.contributions.toFixed(2), withdrawalsBRL: value.withdrawals.toFixed(2), priceReturnBRL: value.price.toFixed(2), dividendsBRL: value.dividends.toFixed(2), costsBRL: value.fees.toFixed(2), quantity: value.quantity.toFixed(), dataBases: [...value.dates].sort(), gaps: value.gaps })).sort((a, b) => a.symbol.localeCompare(b.symbol))
}
