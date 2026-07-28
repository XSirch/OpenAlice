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
import { fetchCvmCapitalComposition, fetchCvmIpeEvents, fetchCvmIssuerMapping, fetchCvmStatementLines, type CvmStatementFetchInput } from '../../domain/market-data/reference/cvm.js'
import { mergeCorporateEvents, readCorporateEvents } from '../../core/corporate-events.js'
import { normalizeBrapiCashDividends, normalizeCvmIpeCorporateEvent } from '../../domain/alice-invest/corporate-events/contracts.js'

interface ReferenceRouteDeps {
  readBrazilMacroSnapshots: typeof readBrazilMacroSnapshots
  fetchCvmStatementLines: typeof fetchCvmStatementLines
  fetchCvmCapitalComposition: typeof fetchCvmCapitalComposition
  fetchCvmIssuerMapping: typeof fetchCvmIssuerMapping
  fetchCvmIpeEvents: typeof fetchCvmIpeEvents
  readCorporateEvents: typeof readCorporateEvents
  mergeCorporateEvents: typeof mergeCorporateEvents
}

export function createReferenceRoutes(ctx: EngineContext, overrides: Partial<ReferenceRouteDeps> = {}): Hono {
  const deps: ReferenceRouteDeps = { readBrazilMacroSnapshots, fetchCvmStatementLines, fetchCvmCapitalComposition, fetchCvmIssuerMapping, fetchCvmIpeEvents, readCorporateEvents, mergeCorporateEvents, ...overrides }
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
  app.get('/cvm/issuer', async (c) => {
    const ticker = c.req.query('ticker')?.trim()
    const year = Number(c.req.query('year'))
    if (!ticker || !Number.isInteger(year)) return c.json({ error: 'ticker and year are required.' }, 400)
    try {
      const issuer = await deps.fetchCvmIssuerMapping(ticker, year)
      return issuer ? c.json({ issuer }) : c.json({ error: 'No unambiguous official FCA issuer mapping was found.' }, 404)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })
  app.get('/cvm/capital-composition', async (c) => {
    const cvmCode = c.req.query('cvmCode')?.trim()
    const year = Number(c.req.query('year'))
    if (!cvmCode || !Number.isInteger(year)) return c.json({ error: 'cvmCode and year are required.' }, 400)
    try { return c.json({ rows: await deps.fetchCvmCapitalComposition(year, cvmCode) }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })

  /**
   * Source-attributed Brazilian corporate events. `refresh=1` fetches BRAPI's
   * cash-dividend payload only after an official FCA issuer mapping resolves;
   * no name or ticker guess is persisted as an issuer.
   */
  app.get('/brazil/corporate-events', async (c) => {
    const symbol = c.req.query('symbol')?.trim().toUpperCase()
    if (!symbol || !/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(symbol)) return c.json({ error: 'A valid B3 symbol is required.' }, 400)
    try {
      if (c.req.query('refresh') === '1') {
        const issuer = await deps.fetchCvmIssuerMapping(symbol, new Date().getUTCFullYear())
        if (!issuer) return c.json({ error: 'No unambiguous official FCA issuer mapping was found; no event was persisted.' }, 404)
        const [rows, ipe] = await Promise.all([
          ctx.equityClient.getDividends({ symbol, provider: 'brapi' }),
          deps.fetchCvmIpeEvents(new Date().getUTCFullYear(), issuer.cvmCode),
        ])
        const events = normalizeBrapiCashDividends({
          issuer: `CVM:${issuer.cvmCode}`,
          instrument: symbol,
          retrievedAt: new Date().toISOString(),
          events: rows.map((row) => {
            const raw = row as unknown as Record<string, unknown>
            return {
              rate: typeof raw.amount === 'number' ? raw.amount : undefined,
              lastDatePrior: typeof raw.date_com === 'string' ? raw.date_com : undefined,
              paymentDate: typeof raw.payment_date === 'string' ? raw.payment_date : undefined,
            }
          }),
        })
        const officialEvents = ipe.flatMap((event) => {
          const normalized = normalizeCvmIpeCorporateEvent({ ...event, issuerCvmCode: issuer.cvmCode, instrument: symbol, retrievedAt: new Date().toISOString() })
          return normalized ? [normalized] : []
        })
        await deps.mergeCorporateEvents([...events, ...officialEvents])
      }
      const events = (await deps.readCorporateEvents()).filter((event) => event.instrument === symbol)
      return c.json({ events })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })

  return app
}
