import type { StructuredRouterClient } from '../ai/structured-router-client.js'
import { validateStructuredOutput, type StructuredRouterTelemetry } from '../ai/structured-output.js'
import { classifyInvestFastPath } from './fast-path.js'
import { investRouterDecisionSchema, type InvestRouterDecision } from './schema.js'

export interface InvestRouterResult {
  correlationId: string
  decision: InvestRouterDecision
  source: 'fast_path' | 'structured' | 'fallback'
  telemetry?: StructuredRouterTelemetry
}

export class InvestMessageRouter {
  constructor(private readonly client: Pick<StructuredRouterClient, 'complete'>) {}

  async route(input: { correlationId: string; text: string }): Promise<InvestRouterResult> {
    const fast = classifyInvestFastPath(input.text)
    if (fast) return { correlationId: input.correlationId, source: 'fast_path', decision: fastDecision(fast) }
    try {
      const validated = validateStructuredOutput(await this.client.complete(input.text), investRouterDecisionSchema)
      if (validated.kind === 'accepted') return { correlationId: input.correlationId, source: 'structured', decision: validated.value, telemetry: validated.telemetry }
      return fallback(input.correlationId, validated.telemetry)
    } catch {
      return fallback(input.correlationId)
    }
  }
}
function fastDecision(value: NonNullable<ReturnType<typeof classifyInvestFastPath>>): InvestRouterDecision {
  if (value.kind === 'local_command') return { action: 'local_command', destinations: [], risk: 'none', tasks: [] }
  if (value.kind === 'block_execution_request') return { action: 'block_execution_request', destinations: [], risk: 'none', tasks: [] }
  return { action: 'pass_through', destinations: ['workspace_session'], risk: 'none', tasks: [] }
}
function fallback(correlationId: string, telemetry?: StructuredRouterTelemetry): InvestRouterResult {
  return { correlationId, source: 'fallback', telemetry, decision: { action: 'ask_clarification', destinations: [], clarification: 'I need clarification before continuing.', risk: 'none', tasks: [] } }
}
