import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateStructuredOutput } from './structured-output.js'

const schema = z.object({ action: z.enum(['ask_clarification', 'pass_through']), risk: z.literal('none') }).strict()
const response = (text: string) => ({ text, model: 'router-model', attempts: 1, latencyMs: 5, inputTokens: 3, outputTokens: 2 })
describe('structured output validation', () => {
  it('fails invalid JSON explicitly without fabricating a risk classification', () => {
    const result = validateStructuredOutput(response('not json'), schema)
    expect(result).toMatchObject({ kind: 'fallback', reason: 'invalid_json', telemetry: { outcome: 'fallback' } })
  })
  it('fails schema mismatch and emits redacted telemetry only', () => {
    const result = validateStructuredOutput(response('{"action":"execute","apiKey":"secret"}'), schema)
    expect(result).toMatchObject({ kind: 'fallback', reason: 'schema_mismatch' })
    expect(JSON.stringify(result.telemetry)).not.toContain('secret')
  })
  it('accepts only schema-validated output', () => {
    expect(validateStructuredOutput(response('{"action":"ask_clarification","risk":"none"}'), schema)).toMatchObject({ kind: 'accepted', value: { action: 'ask_clarification' } })
  })
})
