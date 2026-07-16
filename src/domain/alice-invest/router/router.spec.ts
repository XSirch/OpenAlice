import { describe, expect, it, vi } from 'vitest'
import { InvestMessageRouter } from './router.js'

const response = (text: string) => ({ text, model: 'router', attempts: 1, latencyMs: 1 })
describe('InvestMessageRouter', () => {
  it('preserves correlation and keeps execution in the local fast path', async () => {
    const complete = vi.fn()
    const result = await new InvestMessageRouter({ complete }).route({ correlationId: 'c-1', text: 'compre PETR4' })
    expect(result).toMatchObject({ correlationId: 'c-1', source: 'fast_path', decision: { action: 'block_execution_request' } })
    expect(complete).not.toHaveBeenCalled()
  })
  it('uses only validated structured output', async () => {
    const result = await new InvestMessageRouter({ complete: vi.fn(async () => response('{"action":"pass_through","destinations":["workspace_session"],"risk":"none"}')) }).route({ correlationId: 'c-2', text: 'ambiguous request' })
    expect(result).toMatchObject({ correlationId: 'c-2', source: 'structured', decision: { action: 'pass_through' } })
  })
  it('falls back to clarification for malformed output or transport failure', async () => {
    const malformed = await new InvestMessageRouter({ complete: vi.fn(async () => response('no')) }).route({ correlationId: 'c-3', text: 'ambiguous' })
    const failed = await new InvestMessageRouter({ complete: vi.fn(async () => { throw new Error('timeout') }) }).route({ correlationId: 'c-4', text: 'ambiguous' })
    expect(malformed.decision.action).toBe('ask_clarification')
    expect(failed).toMatchObject({ correlationId: 'c-4', source: 'fallback' })
  })
})
