/**
 * Reference-data routes — `/api/reference/*`.
 *
 * Thin HTTP adapters over the reference-data contract
 * (`domain/market-data/reference/`). This namespace is OpenAlice's own
 * low-frequency data standard — new frontend surfaces consume THIS, never
 * the OpenBB-compatible `/api/market-data-v1` passthrough (which is on its
 * way out).
 */

import { Hono } from 'hono'
import type { EngineContext } from '../../core/types.js'
import { readBrazilMacroSnapshots } from '../../core/brazil-macro-snapshots.js'
import { fetchCvmStatementLines, type CvmStatementFetchInput } from '../../domain/market-data/reference/cvm.js'

interface ReferenceRouteDeps {
  readBrazilMacroSnapshots: typeof readBrazilMacroSnapshots
  fetchCvmStatementLines: typeof fetchCvmStatementLines
}

export function createReferenceRoutes(ctx: EngineContext, overrides: Partial<ReferenceRouteDeps> = {}): Hono {
  const deps: ReferenceRouteDeps = { readBrazilMacroSnapshots, fetchCvmStatementLines, ...overrides }
  const app = new Hono()

  // GET /api/reference/movers → gainers / losers / active board
  app.get('/movers', async (c) => {
    try {
      return c.json(await ctx.reference.movers())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/calendar?days= → earnings / IPO / ex-dividend board
  app.get('/calendar', async (c) => {
    const daysRaw = c.req.query('days')
    const days = daysRaw ? Math.max(1, Math.min(60, Number(daysRaw) || 14)) : undefined
    try {
      return c.json(await ctx.reference.calendar(days ? { days } : undefined))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/term-structure → BTC/ETH futures curve (Deribit)
  app.get('/term-structure', async (c) => {
    try {
      return c.json(await ctx.reference.termStructure())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/fed → balance sheet + dealer positions + FOMC docs
  app.get('/fed', async (c) => {
    try {
      return c.json(await ctx.reference.fed())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/shipping → chokepoint transit volumes (IMF PortWatch)
  app.get('/shipping', async (c) => {
    try {
      return c.json(await ctx.reference.shipping())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/global-macro → cross-country CPI / rates / CLI (OECD)
  app.get('/global-macro', async (c) => {
    try {
      return c.json(await ctx.reference.globalMacro())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/valuation → S&P 500 valuation strip (multpl)
  app.get('/valuation', async (c) => {
    try {
      return c.json(await ctx.reference.valuation())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/macro → curated FRED regime dashboard
  app.get('/macro', async (c) => {
    try {
      return c.json(await ctx.reference.macro())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  // GET /api/reference/brazil â†’ BCB rates/inflation/FX + B3 index context
  app.get('/brazil', async (c) => {
    try {
      return c.json(await ctx.reference.brazil())
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 502)
    }
  })

  /** Durable, provenance-aware history used by Brazil macro panels. */
  app.get('/brazil/history', async (c) => {
    const series = c.req.query('series')?.trim()
    const limit = Math.max(1, Math.min(500, Number(c.req.query('limit')) || 90))
    const entries = await deps.readBrazilMacroSnapshots()
    const filtered = series ? entries.filter((entry) => entry.seriesId === series) : entries
    return c.json({ entries: filtered.slice(-limit) })
  })

  /** Official CVM DFP/ITR lines, filtered server-side to one issuer. */
  app.get('/cvm/statements', async (c) => {
    const cvmCode = c.req.query('cvmCode')?.trim()
    const kind = c.req.query('kind') === 'ITR' ? 'ITR' : c.req.query('kind') === 'DFP' ? 'DFP' : null
    const year = Number(c.req.query('year'))
    if (!cvmCode || !kind || !Number.isInteger(year)) return c.json({ error: 'cvmCode, kind (DFP or ITR), and year are required.' }, 400)
    try {
      return c.json({ lines: await deps.fetchCvmStatementLines({ cvmCode, kind, year } satisfies CvmStatementFetchInput) })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })

  return app
}
