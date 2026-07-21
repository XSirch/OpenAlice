import { z } from 'zod'
import { Fetcher } from '../../../core/provider/abstract/fetcher.js'
import { IncomeStatementQueryParamsSchema, IncomeStatementDataSchema } from '../../../standard-models/income-statement.js'
import { normalizeStatementRow, stockStatements } from '../common.js'

export const BrapiIncomeStatementQueryParamsSchema = IncomeStatementQueryParamsSchema.extend({
  period: z.enum(['annual', 'quarter']).default('annual'),
  limit: z.coerce.number().int().min(1).max(20).nullable().default(5),
})
export type BrapiIncomeStatementQueryParams = z.infer<typeof BrapiIncomeStatementQueryParamsSchema>

const ALIASES = {
  revenue: 'totalRevenue',
  cost_of_revenue: 'costOfRevenue',
  gross_profit: 'grossProfit',
  research_and_development_expense: 'researchDevelopment',
  selling_general_and_admin_expense: 'sellingGeneralAdministrative',
  total_operating_income: 'operatingIncome',
  ebit: 'ebit',
  ebitda: 'cleanEbitda',
  income_tax_expense: 'incomeTaxExpense',
  consolidated_net_income: 'netIncome',
  basic_earnings_per_share: 'basicEarningsPerCommonShare',
  diluted_earnings_per_share: 'dilutedEarningsPerCommonShare',
}

export class BrapiIncomeStatementFetcher extends Fetcher {
  static override requireCredentials = false
  static override transformQuery(params: Record<string, unknown>): BrapiIncomeStatementQueryParams {
    return BrapiIncomeStatementQueryParamsSchema.parse(params)
  }
  static override async extractData(query: BrapiIncomeStatementQueryParams, credentials: Record<string, string> | null) {
    return stockStatements('income-statement', query.symbol.replace(/\.SA$/i, ''), query.period, credentials?.brapi_api_key)
  }
  static override transformData(query: BrapiIncomeStatementQueryParams, rows: Array<{ symbol: string; data: Record<string, unknown> }>) {
    return rows.slice(0, query.limit ?? 5).map(({ data }) => IncomeStatementDataSchema.parse(normalizeStatementRow(data, ALIASES)))
  }
}
