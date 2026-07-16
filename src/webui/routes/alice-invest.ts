import { Hono } from 'hono'
import { readAliceInvestConfig } from '../../core/alice-invest-config.js'

/** Read-only operational snapshot: config has no secrets and execution is not writable. */
export function createAliceInvestRoutes() {
  const app = new Hono()
  app.get('/', async (c) => {
    const config = await readAliceInvestConfig()
    return c.json({ readiness: config.readiness, switches: config.kill_switches, executionEnabled: false })
  })
  return app
}
