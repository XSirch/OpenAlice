import type { z } from 'zod'
import type { StructuredRouterResponse } from './structured-router-client.js'

export type StructuredOutputResult<T> =
  | { kind: 'accepted'; value: T; telemetry: StructuredRouterTelemetry }
  | { kind: 'fallback'; reason: 'invalid_json' | 'schema_mismatch'; telemetry: StructuredRouterTelemetry }
export interface StructuredRouterTelemetry {
  outcome: 'accepted' | 'fallback'
  reason?: 'invalid_json' | 'schema_mismatch'
  model: string
  attempts: number
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
}

/** Parses untrusted model text without retaining it in telemetry or fallback. */
export function validateStructuredOutput<T>(response: StructuredRouterResponse, schema: z.ZodType<T>): StructuredOutputResult<T> {
  const base = { model: response.model, attempts: response.attempts, latencyMs: response.latencyMs, ...(response.inputTokens === undefined ? {} : { inputTokens: response.inputTokens }), ...(response.outputTokens === undefined ? {} : { outputTokens: response.outputTokens }) }
  let parsed: unknown
  try { parsed = JSON.parse(response.text) } catch { return { kind: 'fallback', reason: 'invalid_json', telemetry: { outcome: 'fallback', reason: 'invalid_json', ...base } } }
  const validated = schema.safeParse(parsed)
  if (!validated.success) return { kind: 'fallback', reason: 'schema_mismatch', telemetry: { outcome: 'fallback', reason: 'schema_mismatch', ...base } }
  return { kind: 'accepted', value: validated.data, telemetry: { outcome: 'accepted', ...base } }
}
