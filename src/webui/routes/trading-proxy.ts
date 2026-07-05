/**
 * BFF proxy for `/api/trading/*` — Alice → UTA.
 *
 * UI talks to Alice on a single origin (decision #2 of UTA-split v1); this
 * route forwards every trading request unchanged to the UTA service. v1
 * has no auth between the two — UTA is bound to 127.0.0.1 only, so the
 * trust boundary is the host, not the request.
 *
 * Stream-friendly: forwards request body, returns UTA's Response as-is so
 * `Content-Type` / chunked transfer / SSE headers pass through. A short
 * connect timeout (1s) fails fast when UTA is down, so the agent loop
 * doesn't hang on a dead backend.
 */

import { Hono } from 'hono'

// Total request timeout. UTA is on the loopback interface so connect is
// instant — this guards against handlers that legitimately take seconds
// (broker queries, contract searches) hanging Alice forever. 30s is
// well above the typical broker-API SLA without being a footgun.
const PROXY_TIMEOUT_MS = 30_000
const STATUS_TIMEOUT_MS = 1_000

/** Methods Hono's `app.all` actually dispatches. Empty body methods get a
 *  null body forwarded. */
const PASSTHROUGH_HEADERS: readonly string[] = [
  // Forward common identifying headers; strip hop-by-hop / Host so the UTA
  // sees its own host.
  'accept', 'accept-language', 'content-type', 'content-length',
  'user-agent', 'cache-control', 'pragma', 'x-request-id',
]

export function createTradingProxyRoutes(opts: { utaBaseUrl?: string; disabledReason?: 'lite_mode' }): Hono {
  const app = new Hono()
  const base = opts.utaBaseUrl?.replace(/\/$/, '')
  const disabledReason = opts.disabledReason

  app.get('/status', async (c) => {
    if (disabledReason === 'lite_mode') {
      return c.json({
        available: false,
        state: 'unavailable',
        reason: 'lite_mode',
        hint: 'Trading service is disabled by OPENALICE_LITE_MODE. Alice is running in lite mode.',
      })
    }
    if (!base) {
      return c.json({
        available: false,
        state: 'unavailable',
        reason: 'not_configured',
        hint: 'Trading service is not configured. Alice is running in lite mode.',
      })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS)
    try {
      const res = await fetch(`${base}/__uta/health`, { signal: controller.signal })
      if (!res.ok) {
        return c.json({
          available: false,
          state: 'unavailable',
          reason: `health_${res.status}`,
          hint: 'Trading service is not healthy. Alice is running in lite mode.',
        })
      }
      const health = await res.json() as { startedAt?: string; utas?: number }
      return c.json({
        available: true,
        state: 'available',
        startedAt: health.startedAt,
        utas: health.utas ?? 0,
      })
    } catch (err) {
      return c.json({
        available: false,
        state: 'unavailable',
        reason: err instanceof Error ? err.message : String(err),
        hint: 'Trading service is not reachable. Alice is running in lite mode.',
      })
    } finally {
      clearTimeout(timer)
    }
  })

  app.all('*', async (c) => {
    if (disabledReason === 'lite_mode') {
      return c.json({
        error: 'UTA disabled',
        detail: 'OPENALICE_LITE_MODE is enabled',
        hint: 'Trading service is disabled. Alice is running in lite mode.',
      }, 503)
    }
    if (!base) {
      return c.json({
        error: 'UTA unavailable',
        detail: 'UTA URL is not configured',
        hint: 'Trading service is not reachable. Alice is running in lite mode.',
      }, 503)
    }
    const incoming = c.req.raw
    // Reconstruct target URL: Hono's `c.req.path` is the *full* path
    // including the mount prefix (`/api/trading/uta`, not `/uta`), so
    // we forward it as-is.
    const target = `${base}${c.req.path}${url(incoming).search}`

    const forwardHeaders = new Headers()
    for (const name of PASSTHROUGH_HEADERS) {
      const v = incoming.headers.get(name)
      if (v !== null) forwardHeaders.set(name, v)
    }

    const controller = new AbortController()
    const connectTimer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)

    let upstream: Response
    try {
      upstream = await fetch(target, {
        method: incoming.method,
        headers: forwardHeaders,
        body: hasBody(incoming.method) ? incoming.body : null,
        // duplex required when streaming request body — Node fetch needs it
        // when body is a ReadableStream.
        ...(hasBody(incoming.method) ? { duplex: 'half' } : {}),
        signal: controller.signal,
        redirect: 'manual',
      } as RequestInit)
    } catch (err) {
      clearTimeout(connectTimer)
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({
        error: 'UTA unavailable',
        detail: msg,
        hint: 'Trading service is not reachable. Alice is running in lite mode.',
      }, 502)
    } finally {
      clearTimeout(connectTimer)
    }

    // Re-wrap with a fresh Headers object so downstream middleware (CORS,
    // etc.) can still mutate them. `fetch()` returns a Response whose
    // headers carry an immutable guard per the WHATWG spec — handing it
    // back as-is makes any later `headers.set(...)` throw.
    const headers = new Headers()
    upstream.headers.forEach((value, name) => { headers.set(name, value) })
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  })

  return app
}

function url(req: Request): URL {
  try { return new URL(req.url) } catch { return new URL('http://localhost/') }
}

function hasBody(method: string): boolean {
  const m = method.toUpperCase()
  return m !== 'GET' && m !== 'HEAD'
}
