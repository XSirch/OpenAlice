import { defaultFixedIncomeAdvisorPolicy, fixedIncomeAdvisorPolicySchema } from '../../domain/alice-invest/fixed-income/policy.js'
import type { Migration } from '../types.js'

export const migration: Migration = {
  id: '0049_fixed_income_advisor',
  appVersion: '0.90.0-beta',
  introducedAt: '2026-08-20',
  affects: ['fixed-income-advisor-policy.json', 'fixed-income-custody.json'],
  summary: 'Seed the read-only fixed-income advisor policy while preserving existing custody classifications.',
  rationale: 'The advisor starts with a 20 percent liquidity reserve, research-only readiness, recommendation generation disabled, and no execution path.',
  async up(ctx) {
    const existing = await ctx.readJson<unknown>('fixed-income-advisor-policy.json')
    if (existing === undefined) {
      await ctx.writeJson('fixed-income-advisor-policy.json', defaultFixedIncomeAdvisorPolicy())
      return
    }
    fixedIncomeAdvisorPolicySchema.parse(existing)
  },
}
