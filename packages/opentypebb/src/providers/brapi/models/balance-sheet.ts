import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { BalanceSheetQueryParamsSchema, BalanceSheetDataSchema } from '../../../standard-models/balance-sheet.js'
import { normalizeStatementRow, stockStatements } from '../common.js'

export const BrapiBalanceSheetQueryParamsSchema = BalanceSheetQueryParamsSchema.extend({
  period: z.enum(['annual', 'quarter']).default('annual'),
  limit: z.coerce.number().int().min(1).max(20).nullable().default(5),
})
export type BrapiBalanceSheetQueryParams = z.infer<typeof BrapiBalanceSheetQueryParamsSchema>

const ALIASES = {
  cash_and_cash_equivalents: 'cash',
  short_term_investments: 'shortTermInvestments',
  net_receivables: 'netReceivables',
  inventory: 'inventory',
  total_current_assets: 'totalCurrentAssets',
  long_term_investments: 'longTermInvestments',
  plant_property_equipment_net: 'propertyPlantEquipment',
  total_assets: 'totalAssets',
  accounts_payable: 'accountsPayable',
  short_term_debt: 'shortLongTermDebt',
  total_current_liabilities: 'totalCurrentLiabilities',
  long_term_debt: 'longTermDebt',
  total_liabilities: 'totalLiab',
  total_common_equity: 'totalStockholderEquity',
  goodwill: 'goodWill',
  intangible_assets: 'intangibleAssets',
}

export class BrapiBalanceSheetFetcher extends Fetcher {
  static override requireCredentials = false
  static override transformQuery(params: Record<string, unknown>): BrapiBalanceSheetQueryParams {
    return BrapiBalanceSheetQueryParamsSchema.parse(params)
  }
  static override async extractData(query: BrapiBalanceSheetQueryParams, credentials: Record<string, string> | null) {
    return stockStatements('balance-sheet', query.symbol.replace(/\.SA$/i, ''), query.period, credentials?.brapi_api_key)
  }
  static override transformData(query: BrapiBalanceSheetQueryParams, rows: Array<{ symbol: string; data: Record<string, unknown> }>) {
    return rows.slice(0, query.limit ?? 5).map(({ data }) => BalanceSheetDataSchema.parse(normalizeStatementRow(data, ALIASES)))
  }
}
