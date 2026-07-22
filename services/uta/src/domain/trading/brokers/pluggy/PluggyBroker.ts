/**
 * MeuPluggy read-only broker adapter.
 *
 * Pluggy is an Open Finance custody source, not an execution venue.  It is
 * nevertheless modelled as a funded, read-only UTA so it shares the account
 * list, equity aggregation, health monitoring and position surfaces used by
 * every other portfolio account.  Secrets remain in sealed open-finance.json.
 */

import Decimal from 'decimal.js'
import { Contract, type ContractDescription, type ContractDetails, type Order, type OrderCancel } from '@traderalice/ibkr'
import type {
  AccountCapabilities,
  AccountInfo,
  Bar,
  BarParams,
  IBroker,
  MarketClock,
  OpenOrder,
  PlaceOrderResult,
  Position,
  Quote,
  TpSlParams,
} from '../types.js'
import { BrokerError } from '../types.js'
import { readOpenFinanceConfig } from '@/core/open-finance-config.js'
import { fetchPluggyCustody, type CustodySnapshot } from '@/domain/open-finance/pluggy.js'

const REFRESH_MS = 30_000

export class PluggyBroker implements IBroker {
  readonly brokerEngine = 'pluggy'
  readonly id: string
  readonly label: string

  private snapshot: CustodySnapshot | null = null
  private loadedAt = 0
  /** A portfolio render asks for equity and positions concurrently. Reuse the
   * same Pluggy round trip instead of authenticating and reading custody twice. */
  private loadInFlight: Promise<CustodySnapshot> | null = null

  constructor(config: { id: string; label?: string }) {
    this.id = config.id
    this.label = config.label ?? 'MeuPluggy'
  }

  async init(): Promise<void> {
    await this.load(true)
  }

  async close(): Promise<void> {}

  async searchContracts(_pattern: string): Promise<ContractDescription[]> { return [] }
  async getContractDetails(_query: Contract): Promise<ContractDetails | null> { return null }

  async placeOrder(_contract: Contract, _order: Order, _tpsl?: TpSlParams): Promise<PlaceOrderResult> {
    return { success: false, error: 'MeuPluggy is a read-only custody account.' }
  }
  async modifyOrder(_orderId: string, _changes: Partial<Order>): Promise<PlaceOrderResult> {
    return { success: false, error: 'MeuPluggy is a read-only custody account.' }
  }
  async cancelOrder(_orderId: string, _orderCancel?: OrderCancel): Promise<PlaceOrderResult> {
    return { success: false, error: 'MeuPluggy is a read-only custody account.' }
  }
  async closePosition(_contract: Contract, _quantity?: Decimal): Promise<PlaceOrderResult> {
    return { success: false, error: 'MeuPluggy is a read-only custody account.' }
  }

  async getAccount(): Promise<AccountInfo> {
    const snapshot = await this.load()
    const value = snapshot.positions.reduce((total, position) => total.plus(position.value ?? 0), new Decimal(0))
    const profit = snapshot.positions.reduce((total, position) => total.plus(this.positionProfit(position)), new Decimal(0))
    const currencies = new Set(snapshot.positions.map((position) => position.currency))
    if (currencies.size > 1) {
      throw new BrokerError('CONFIG', 'MeuPluggy returned multiple currencies. Split custody by currency before using it as one UTA account.')
    }
    return {
      baseCurrency: snapshot.positions[0]?.currency ?? 'BRL',
      netLiquidation: value.toString(),
      totalCashValue: '0',
      unrealizedPnL: profit.toString(),
      realizedPnL: '0',
    }
  }

  async getPositions(): Promise<Position[]> {
    const snapshot = await this.load()
    return snapshot.positions.map((position) => {
      const quantity = new Decimal(position.quantity ?? 1)
      const value = new Decimal(position.value ?? 0)
      const unitValue = position.unitValue == null
        ? (quantity.isZero() ? new Decimal(0) : value.div(quantity))
        : new Decimal(position.unitValue)
      const originalAmount = position.originalAmount == null ? null : new Decimal(position.originalAmount)
      // `amountOriginal` is a total, while UTA's avgCost is per unit. When
      // Pluggy does not provide it, retain the current mark rather than invent
      // a purchase price or a return.
      const avgCost = originalAmount && !quantity.isZero() ? originalAmount.div(quantity) : unitValue
      const contract = this.contractFor(position.id, position.code ?? position.name, position.name, position.currency, position.type)
      return {
        contract,
        currency: position.currency,
        side: 'long',
        quantity,
        avgCost: avgCost.toString(),
        marketPrice: unitValue.toString(),
        marketValue: value.toString(),
        // Prefer Pluggy's post-fee/tax return. Fall back to the difference
        // only when it supplied a cost basis but no aggregate return.
        unrealizedPnL: this.positionProfit(position).toString(),
        realizedPnL: '0',
        multiplier: '1',
      }
    })
  }

  async getOrders(_orderIds: string[]): Promise<OpenOrder[]> { return [] }
  async getOrder(_orderId: string, _symbolHint?: string): Promise<OpenOrder | null> { return null }
  async getOpenOrders(): Promise<OpenOrder[]> { return [] }
  async getQuote(_contract: Contract): Promise<Quote> {
    throw new BrokerError('CONFIG', 'MeuPluggy provides custody balances, not executable market quotes.')
  }
  async getMarketClock(): Promise<MarketClock> { return { isOpen: false, timestamp: new Date() } }
  async getHistorical(_contract: Contract, _params: BarParams): Promise<Bar[]> { return [] }

  getCapabilities(): AccountCapabilities {
    return { supportedSecTypes: [], supportedOrderTypes: [] }
  }

  getNativeKey(contract: Contract): string {
    return contract.aliceId?.split('|').at(-1) ?? contract.symbol ?? ''
  }

  resolveNativeKey(nativeKey: string): Contract {
    return this.contractFor(nativeKey, nativeKey, nativeKey, 'BRL')
  }

  private async load(force = false): Promise<CustodySnapshot> {
    if (!force && this.snapshot && Date.now() - this.loadedAt < REFRESH_MS) return this.snapshot
    if (this.loadInFlight) return this.loadInFlight
    this.loadInFlight = this.refreshSnapshot()
    try {
      return await this.loadInFlight
    } finally {
      this.loadInFlight = null
    }
  }

  private async refreshSnapshot(): Promise<CustodySnapshot> {
    const config = await readOpenFinanceConfig()
    const pluggy = config.pluggy
    if (!pluggy.enabled || !pluggy.clientId || !pluggy.clientSecret) {
      throw new BrokerError('CONFIG', 'MeuPluggy is not configured or enabled in Open Finance settings.')
    }
    try {
      this.snapshot = await fetchPluggyCustody({ clientId: pluggy.clientId, clientSecret: pluggy.clientSecret }, pluggy.itemIds)
      this.loadedAt = Date.now()
      return this.snapshot
    } catch (error) {
      throw BrokerError.from(error)
    }
  }

  private contractFor(id: string, symbol: string, name: string, currency: string, type?: string): Contract {
    const contract = new Contract()
    contract.aliceId = `${this.id}|${id}`
    contract.symbol = symbol.slice(0, 80)
    contract.secType = pluggySecType(type)
    contract.exchange = 'PLUGGY'
    contract.currency = currency
    contract.description = name
    return contract
  }

  private positionProfit(position: CustodySnapshot['positions'][number]): Decimal {
    if (position.profit != null) return new Decimal(position.profit)
    if (position.originalAmount != null) return new Decimal(position.value ?? 0).minus(position.originalAmount)
    return new Decimal(0)
  }
}

function pluggySecType(type?: string): string {
  const normalized = type?.toLowerCase() ?? ''
  if (normalized.includes('stock') || normalized.includes('equity') || normalized.includes('ação')) return 'STK'
  if (normalized.includes('fund')) return 'FUND'
  if (normalized.includes('bond') || normalized.includes('fixed')) return 'BOND'
  return 'FUND'
}
