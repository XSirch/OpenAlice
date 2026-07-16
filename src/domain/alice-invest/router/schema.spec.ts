import { describe, expect, it } from 'vitest'
import { investRouterDecisionSchema } from './schema.js'

describe('Invest router decision schema', () => {
  it('accepts only allowlisted logical destinations', () => {
    expect(investRouterDecisionSchema.parse({ action: 'pass_through', destinations: ['workspace_session'], risk: 'none' })).toMatchObject({ action: 'pass_through' })
    expect(() => investRouterDecisionSchema.parse({ action: 'pass_through', destinations: ['trade_tool'], risk: 'none' })).toThrow()
  })
  it('requires clarification for ambiguity and bounded tasks for multi-intent', () => {
    expect(() => investRouterDecisionSchema.parse({ action: 'ask_clarification', destinations: [], risk: 'none' })).toThrow()
    expect(investRouterDecisionSchema.parse({ action: 'split_into_tasks', destinations: ['fixed_income'], tasks: [{ destination: 'fixed_income', instruction: 'compare' }, { destination: 'market_research', instruction: 'research' }], risk: 'none' }).tasks).toHaveLength(2)
  })
  it('rejects free output and execution-like dispatch', () => {
    expect(() => investRouterDecisionSchema.parse({ action: 'block_execution_request', destinations: ['workspace_session'], risk: 'none' })).toThrow()
    expect(() => investRouterDecisionSchema.parse({ action: 'pass_through', destinations: [], risk: 'none', tool: 'order.submit' })).toThrow()
  })
})
