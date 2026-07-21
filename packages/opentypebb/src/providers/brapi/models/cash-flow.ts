import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { CashFlowStatementQueryParamsSchema, CashFlowStatementDataSchema } from '../../../standard-models/cash-flow.js'
import { normalizeStatementRow, stockStatements } from '../common.js'

export const BrapiCashFlowStatementQueryParamsSchema = CashFlowStatementQueryParamsSchema.extend({
  period: z.enum(['annual', 'quarter']).default('annual'),
  limit: z.coerce.number().int().min(1).max(20).nullable().default(5),
})
export type BrapiCashFlowStatementQueryParams = z.infer<typeof BrapiCashFlowStatementQueryParamsSchema>

const ALIASES = {
  net_cash_from_operating_activities: 'operatingCashFlow',
  net_cash_from_investing_activities: 'investmentCashFlow',
  net_cash_from_financing_activities: 'financingCashFlow',
  free_cash_flow: 'freeCashFlow',
  cash_at_end_of_period: 'finalCashBalance',
  cash_at_beginning_of_period: 'initialCashBalance',
  net_change_in_cash_and_equivalents: 'increaseOrDecreaseInCash',
  change_in_working_capital: 'changesInAssetsAndLiabilities',
}

export class BrapiCashFlowStatementFetcher extends Fetcher {
  static override requireCredentials = false
  static override transformQuery(params: Record<string, unknown>): BrapiCashFlowStatementQueryParams {
    return BrapiCashFlowStatementQueryParamsSchema.parse(params)
  }
  static override async extractData(query: BrapiCashFlowStatementQueryParams, credentials: Record<string, string> | null) {
    return stockStatements('cash-flow', query.symbol.replace(/\.SA$/i, ''), query.period, credentials?.brapi_api_key)
  }
  static override transformData(query: BrapiCashFlowStatementQueryParams, rows: Array<{ symbol: string; data: Record<string, unknown> }>) {
    return rows.slice(0, query.limit ?? 5).map(({ data }) => CashFlowStatementDataSchema.parse(normalizeStatementRow(data, ALIASES)))
  }
}
