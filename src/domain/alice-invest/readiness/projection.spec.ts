import { describe, expect, it } from 'vitest'
import { projectCapabilityReadiness } from './projection.js'
const e = (criterion: string, status: 'passed'|'failed'|'blocked'|'not_run' = 'passed') => ({ id: criterion, capability: 'fixed_income' as const, criterion, status, observedAt: '2026-07-17T00:00:00.000Z', source: 'test', validationRunId: 'run' })
describe('readiness evidence projection', () => {
  it('fails closed while required evidence is missing', () => expect(projectCapabilityReadiness('fixed_income', [e('calculations')]).state).toBe('research_only'))
  it('caps complete evidence at paper alerts and rejects expiry', () => {
    const items=['calculations','decimal_precision','limitations_documented','no_automatic_recommendation','no_real_price_claim'].map(e)
    expect(projectCapabilityReadiness('fixed_income', items).state).toBe('paper_alerts')
    expect(projectCapabilityReadiness('fixed_income', [{...e('calculations'),expiresAt:'2020-01-01T00:00:00.000Z'},...items.slice(1)]).state).toBe('research_only')
  })
})
