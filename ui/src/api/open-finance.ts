import { fetchJson, headers } from './client'

export interface OpenFinanceConfig {
  pluggy: { enabled: boolean; configured: boolean; itemIds: string[] }
}

export interface CustodyPosition {
  id: string
  name: string
  code?: string
  type?: string
  quantity?: number
  value?: number
  originalAmount?: number
  profit?: number
  acquiredAt?: string
  costBasisSource?: 'reported' | 'transactions'
  grossAmount?: number
  unitValue?: number
  currency: string
  institution?: string
  asOf?: string
}

export interface CustodySnapshot {
  provider: 'pluggy'
  positions: CustodyPosition[]
  fetchedAt: string
}

export interface FgcExposure {
  groups: Array<{ conglomerate: string; eligibleAmountBRL: string; estimatedCoveredBeforeAggregateLimitBRL: string; estimatedUncoveredBRL: string }>
  eligibleAmountBRL: string
  estimatedCoverageAfterAggregateLimitBRL: string
  estimatedUncoveredBRL: string
  remainingAggregateLimitBRL: string
  policy: { effectiveFrom: string; referenceUrl: string }
  disclaimer: string
}

export interface FixedIncomeLadder {
  asOf: string
  buckets: Record<string, { currentAmountBRL: string; entries: Array<{ id: string; issuer: string; productType: string; maturityDate: string; redemption: string; liquidityDays: number; currentAmountBRL: string; marketValueBRL: string | null; redemptionAmountBRL: string | null; annualGrossRatePct: string | null; annualNetRatePct: string | null; gaps: string[] }> }>
  disclaimer: string
}
export interface FixedIncomeSummary { snapshot: CustodySnapshot; fgc: FgcExposure; ladder: FixedIncomeLadder }
export interface MacroExposure {
  dimension: 'interest_rates' | 'inflation' | 'liquidity' | 'concentration' | 'exchange_rate'
  amountBRL: string
  contributors: Array<{ label: string; amountBRL: string; premise: string }>
  assumptions: string[]
  gaps: string[]
}
export interface CorporateEventCalendarItem { association: { confidence: 'exact' | 'mapped' | 'review_required'; positionSymbol: string | null; reason: string; sourceUrl: string }; event: { id: string; instrument: string; type: string; competence: string; status: string; dateCom?: string; exDate?: string; paymentDate?: string; cashAmountPerUnitBRL?: string; title: string; source: { url: string; retrievedAt: string } } }
export interface TotalReturnBreakdown { symbol: string; asOf: string; contributionsBRL: string; withdrawalsBRL: string; priceReturnBRL: string; dividendsBRL: string; costsBRL: string; quantity: string; dataBases: string[]; gaps: string[] }

export const openFinanceApi = {
  load: (): Promise<OpenFinanceConfig> => fetchJson('/api/open-finance'),
  save: (input: { enabled: boolean; clientId?: string; clientSecret?: string; itemIds?: string[] }): Promise<OpenFinanceConfig> =>
    fetchJson('/api/open-finance', { method: 'PUT', headers, body: JSON.stringify(input) }),
  custody: (): Promise<CustodySnapshot> => fetchJson('/api/open-finance/custody'),
  fgc: (): Promise<FgcExposure> => fetchJson('/api/open-finance/fixed-income/fgc'),
  fixedIncomeLadder: (): Promise<FixedIncomeLadder> => fetchJson('/api/open-finance/fixed-income/ladder'),
  fixedIncomeSummary: (): Promise<FixedIncomeSummary> => fetchJson('/api/open-finance/fixed-income/summary'),
  macroExposure: (): Promise<{ exposures: MacroExposure[]; disclaimer: string }> => fetchJson('/api/open-finance/fixed-income/macro-exposure'),
  corporateEventAssociations: (): Promise<{ associations: CorporateEventCalendarItem[] }> => fetchJson('/api/open-finance/tax/corporate-event-associations'),
  totalReturn: (): Promise<{ returns: TotalReturnBreakdown[]; disclaimer: string }> => fetchJson('/api/open-finance/tax/total-return'),
  test: (): Promise<{ ok: boolean; positions: number }> => fetchJson('/api/open-finance/test', { method: 'POST' }),
}
