import { Hono } from 'hono'
import { z } from 'zod'
import { readOpenRouterAnalyticsConfig, readPublicOpenRouterAnalyticsConfig, writeOpenRouterAnalyticsConfig } from '../../core/openrouter-analytics-config.js'

const updateSchema = z.object({ managementKey: z.string().optional() })
const rangeSchema = z.object({ start: z.string().datetime(), end: z.string().datetime() })

export function createOpenRouterAnalyticsRoutes() {
  const app = new Hono()
  app.get('/', async (c) => c.json(await readPublicOpenRouterAnalyticsConfig()))
  app.put('/', async (c) => c.json(await writeOpenRouterAnalyticsConfig(updateSchema.parse(await c.req.json()))))
  app.get('/usage', async (c) => {
    const config = await readOpenRouterAnalyticsConfig()
    if (!config.managementKey) return c.json({ error: 'OpenRouter Management Key is not configured.' }, 400)
    const range = rangeSchema.parse({ start: c.req.query('start'), end: c.req.query('end') })
    const response = await fetch('https://openrouter.ai/api/v1/analytics/query', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.managementKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ metrics: ['total_usage', 'tokens_total', 'request_count', 'cache_hit_rate'], dimensions: ['model'], order_by: { field: 'total_usage', direction: 'desc' }, time_range: range, limit: 100 }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return c.json({ error: `OpenRouter Analytics returned HTTP ${response.status}` }, 502)
    return c.json(await response.json())
  })
  return app
}
