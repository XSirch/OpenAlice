import { Hono } from 'hono'
import { z } from 'zod'
import { readOpenFinanceConfig, readPublicOpenFinanceConfig, writeOpenFinanceConfig } from '../../core/open-finance-config.js'
import { fetchPluggyCustody } from '../../domain/open-finance/pluggy.js'

const updateSchema = z.object({ enabled: z.boolean(), clientId: z.string().optional(), clientSecret: z.string().optional() })

export function createOpenFinanceRoutes() {
  const app = new Hono()
  app.get('/', async (c) => c.json(await readPublicOpenFinanceConfig()))
  app.put('/', async (c) => {
    try { return c.json(await writeOpenFinanceConfig(updateSchema.parse(await c.req.json()))) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/custody', async (c) => {
    try {
      const config = await readOpenFinanceConfig()
      if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy is not configured.' }, 400)
      return c.json(await fetchPluggyCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }))
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  app.post('/test', async (c) => {
    try {
      const config = await readOpenFinanceConfig()
      if (!config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy client ID and secret are required.' }, 400)
      const snapshot = await fetchPluggyCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret })
      return c.json({ ok: true, positions: snapshot.positions.length })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  return app
}
