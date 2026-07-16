import { describe, expect, it, vi } from 'vitest'
import { StructuredRouterClient } from './structured-router-client.js'

const config = { baseUrl: 'https://router.example/v1', apiKey: 'secret', model: 'router-model', timeoutMs: 1_000, maxAttempts: 2, maxContextChars: 8 }
describe('StructuredRouterClient', () => {
  it('bounds context and returns only allowed response metadata', async () => {
    const request = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).messages[0].content).toBe('12345678')
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"ask"}' } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await new StructuredRouterClient(config, request).complete('123456789')
    expect(out).toMatchObject({ text: '{"action":"ask"}', model: 'router-model', attempts: 1, inputTokens: 4, outputTokens: 2 })
  })
  it('retries only a transient provider response', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })) as unknown as typeof fetch
    await expect(new StructuredRouterClient(config, request).complete('x')).resolves.toMatchObject({ attempts: 2 })
  })
  it('does not retry a non-transient response', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 400 })) as unknown as typeof fetch
    await expect(new StructuredRouterClient(config, request).complete('x')).rejects.toThrow('400')
    expect(request).toHaveBeenCalledOnce()
  })
  it('retries timeout and 5xx failures', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const request = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })) as unknown as typeof fetch
    await expect(new StructuredRouterClient(config, request).complete('x')).resolves.toMatchObject({ attempts: 2 })
  })
})
