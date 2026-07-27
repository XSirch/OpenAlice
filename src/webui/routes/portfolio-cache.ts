import { Hono } from 'hono'
import { clearPortfolioPresentationCache, readPortfolioPresentationCache, writePortfolioPresentationCache } from '../../core/portfolio-presentation-cache.js'

export function createPortfolioCacheRoutes(deps = {
  read: readPortfolioPresentationCache,
  write: writePortfolioPresentationCache,
  clear: clearPortfolioPresentationCache,
}) {
  const app = new Hono()
  app.get('/', async (c) => c.json({ cache: await deps.read() }))
  app.put('/', async (c) => {
    try {
      return c.json({ cache: await deps.write(await c.req.json()) })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })
  app.delete('/', async (c) => {
    await deps.clear()
    return c.body(null, 204)
  })
  return app
}
