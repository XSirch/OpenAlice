export interface StructuredRouterClientConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  maxAttempts: number
  maxContextChars: number
}
export interface StructuredRouterResponse {
  text: string
  model: string
  attempts: number
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
}
export type FetchLike = typeof fetch

class ProviderError extends Error {
  constructor(message: string, readonly transient: boolean) { super(message) }
}

/** Narrow OpenAI-chat transport. It has no tools, Session access, or logging. */
export class StructuredRouterClient {
  constructor(private readonly config: StructuredRouterClientConfig, private readonly request: FetchLike = fetch) {}

  async complete(context: string): Promise<StructuredRouterResponse> {
    const prompt = context.slice(0, this.config.maxContextChars)
    const started = Date.now()
    let lastError: Error | undefined
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      try {
        const response = await this.request(new URL('chat/completions', ensureTrailingSlash(this.config.baseUrl)), {
          method: 'POST', headers: { authorization: `Bearer ${this.config.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.config.model, messages: [{ role: 'user', content: prompt }], temperature: 0 }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        })
        if (!response.ok) {
          const error = new ProviderError(`Structured router provider failed: ${response.status}`, response.status === 429 || response.status >= 500)
          if (!error.transient || attempt === this.config.maxAttempts) throw error
          lastError = error; continue
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }
        return { text: payload.choices?.[0]?.message?.content ?? '', model: this.config.model, attempts: attempt, latencyMs: Date.now() - started, inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Structured router request failed')
        if (!isTransientError(lastError) || attempt === this.config.maxAttempts) throw lastError
      }
    }
    throw lastError ?? new Error('Structured router request failed')
  }
}
function ensureTrailingSlash(value: string): string { return value.endsWith('/') ? value : `${value}/` }
function isTransientError(error: Error): boolean {
  return error instanceof ProviderError ? error.transient : error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError
}
