import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
  type CandlestickData,
  type HistogramData,
} from 'lightweight-charts'
import { barsApi, type AssetClass, type HistoricalBar, type BarSourceCandidate, type BarMeta } from '../../api/market'
import { Skeleton } from '../StateViews'

type Interval = '1m' | '2m' | '5m' | '15m' | '30m' | '1h' | '90m' | '1d' | '5d' | '1wk' | '1mo' | '3mo'
type Timeframe = '1D' | '5D' | '7D' | '1M' | '3M' | '1Y' | '5Y' | 'All'

const INTERVALS: Interval[] = ['1m', '2m', '5m', '15m', '30m', '1h', '90m', '1d', '5d', '1wk', '1mo', '3mo']
const TIMEFRAMES: Timeframe[] = ['1D', '5D', '7D', '1M', '3M', '1Y', '5Y', 'All']
const DEFAULT_INTERVAL: Interval = '1d'
const DEFAULT_RANGE: Timeframe = '1Y'

function parseInterval(s: string | null): Interval {
  return (INTERVALS as string[]).includes(s ?? '') ? (s as Interval) : DEFAULT_INTERVAL
}

function parseTimeframe(s: string | null): Timeframe {
  return (TIMEFRAMES as string[]).includes(s ?? '') ? (s as Timeframe) : DEFAULT_RANGE
}

const INTRADAY: ReadonlySet<Interval> = new Set(['1m', '2m', '5m', '15m', '30m', '1h', '90m'])

function daysForTimeframe(tf: Timeframe): number | null {
  switch (tf) {
    case '1D': return 1
    case '5D': return 5
    case '7D': return 7
    case '1M': return 30
    case '3M': return 90
    case '1Y': return 365
    case '5Y': return 365 * 5
    case 'All': return null
  }
}

function startDateFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function toUTCTimestamp(s: string): UTCTimestamp {
  // Daily bars use `YYYY-MM-DD`; intraday uses `YYYY-MM-DD HH:MM:SS`.
  const iso = s.includes(' ') ? s.replace(' ', 'T') + 'Z' : `${s}T00:00:00Z`
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp
}

interface Props {
  selection: { symbol: string; assetClass: AssetClass } | null
}

interface HoveredCandle {
  bar: HistoricalBar
  x: number
  y: number
}

function formatCandleTime(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2})(?::\d{2})?)?$/)
  if (!match) return value
  return `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}` : ''}`
}

function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function formatVolume(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export function KlinePanel({ selection }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const interval = parseInterval(searchParams.get('interval'))
  const tf = parseTimeframe(searchParams.get('range'))
  // The provider picked at search time (a barId), if any — opens the chart on it.
  const sourceParam = searchParams.get('source')

  // Local setter named `selectInterval` rather than `setInterval` so it
  // doesn't shadow the global timer function we use for polling below.
  const selectInterval = (iv: Interval) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (iv === DEFAULT_INTERVAL) next.delete('interval')
      else next.set('interval', iv)
      return next
    }, { replace: true })
  }
  const setTf = (t: Timeframe) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (t === DEFAULT_RANGE) next.delete('range')
      else next.set('range', t)
      return next
    }, { replace: true })
  }

  const [bars, setBars] = useState<HistoricalBar[] | null>(null)
  const [meta, setMeta] = useState<BarMeta | null>(null)
  const [candidates, setCandidates] = useState<BarSourceCandidate[]>([])
  // null = vendor default for this symbol; a barId = an explicitly-picked source.
  // Seed from the URL so the very first fetch is the right source (no vendor flicker).
  const [selectedBarId, setSelectedBarId] = useState<string | null>(sourceParam)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle | null>(null)
  const selectedSourceId = selectedBarId?.split('|')[0] ?? meta?.sourceId
  const brapiIntraday = selectedSourceId === 'brapi' && INTRADAY.has(interval)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Build chart once.
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#c9d1d9',
        panes: { separatorColor: '#30363d', separatorHoverColor: '#58a6ff33' },
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      rightPriceScale: { borderColor: '#30363d' },
      timeScale: { borderColor: '#30363d', timeVisible: false, secondsVisible: false },
      autoSize: true,
    })

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    }, 1)
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } })

    chartRef.current = chart
    candleRef.current = candle
    volumeRef.current = volume

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
    }
  }, [])

  // Toggle time-axis detail when interval flips between intraday and daily.
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ timeVisible: INTRADAY.has(interval) })
  }, [interval])

  // Discover the available bar sources for this symbol (populates the picker).
  // Seed the picked source from the URL (?source=barId, set at search time);
  // otherwise null → vendor default.
  useEffect(() => {
    setSelectedBarId(sourceParam)
    setCandidates([])
    if (!selection || selection.assetClass === 'commodity') return
    let cancelled = false
    barsApi.searchSources(selection.symbol, 12)
      .then((r) => { if (!cancelled) setCandidates(r.candidates) })
      .catch(() => { if (!cancelled) setCandidates([]) })
    return () => { cancelled = true }
  }, [selection, sourceParam])

  // Fetch bars: an explicitly-picked source (barId) or the vendor default
  // (symbol+assetClass). Re-polls so a long-open tab doesn't show stale bars.
  useEffect(() => {
    if (!selection) { setBars(null); setMeta(null); setError(null); return }
    if (selection.assetClass === 'commodity') {
      setBars(null)
      setMeta(null)
      setError('Commodity K-line support is coming in the next step.')
      return
    }
    let cancelled = false
    const run = (isInitial: boolean) => {
      if (isInitial) setLoading(true)
      setError(null)
      const requestedDays = daysForTimeframe(tf)
      // BRAPI makes all intraday candle widths available, but its upstream
      // history endpoint retains at most seven days of them.
      const days = brapiIntraday && (requestedDays == null || requestedDays > 7) ? 7 : requestedDays
      const params: Parameters<typeof barsApi.bars>[0] = { interval }
      // A vendor barId alone is ambiguous across the provider-specific client
      // families. Keep the page's asset class when the source was selected so
      // `brapi|PETR4` routes to the equity client instead of failing closed.
      if (selectedBarId) {
        params.barId = selectedBarId
        params.assetClass = selection.assetClass
      }
      else { params.symbol = selection.symbol; params.assetClass = selection.assetClass }
      if (days != null) params.start = startDateFromToday(days)

      barsApi.bars(params)
        .then((res) => {
          if (cancelled) return
          if (res.error || !res.results) {
            setError(res.error ?? 'No data returned.'); setBars(null); setMeta(null)
          } else if (res.results.length === 0) {
            setError('No bars in this range.'); setBars([]); setMeta(res.meta)
          } else {
            setBars(res.results); setMeta(res.meta)
          }
        })
        .catch((e) => {
          if (cancelled) return
          setError(e instanceof Error ? e.message : String(e)); setBars(null); setMeta(null)
        })
        .finally(() => { if (!cancelled && isInitial) setLoading(false) })
    }
    run(true)
    // 60s for intraday intervals (1m/5m/1h) because each tick is a fresh bar;
    // 5min for daily because a refresh within a single day is cosmetic.
    const pollMs = INTRADAY.has(interval) ? 60_000 : 300_000
    const timer = setInterval(() => run(false), pollMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [selection, selectedBarId, interval, tf, brapiIntraday])

  // Push bars into chart and fit.
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || !chartRef.current) return
    if (!bars || bars.length === 0) {
      candleRef.current.setData([])
      volumeRef.current.setData([])
      return
    }

    const candleData: CandlestickData[] = bars.map((b) => ({
      time: toUTCTimestamp(b.date),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
    const volumeData: HistogramData[] = bars.map((b) => ({
      time: toUTCTimestamp(b.date),
      value: b.volume ?? 0,
      color: b.close >= b.open ? '#3fb95055' : '#f8514955',
    }))

    candleRef.current.setData(candleData)
    volumeRef.current.setData(volumeData)
    chartRef.current.timeScale().fitContent()
  }, [bars])

  // The chart owns pointer tracking; translate its crosshair position back to
  // the original bar so the detail card includes volume as well as OHLC.
  useEffect(() => {
    const chart = chartRef.current
    const candle = candleRef.current
    const container = containerRef.current
    if (!chart || !candle || !container || !bars?.length) {
      setHoveredCandle(null)
      return
    }
    const byTime = new Map(bars.map((bar) => [toUTCTimestamp(bar.date), bar]))
    const onCrosshairMove = (param: MouseEventParams) => {
      if (!param.point || typeof param.time !== 'number') {
        setHoveredCandle(null)
        return
      }
      const bar = byTime.get(param.time as UTCTimestamp)
      if (!bar) {
        setHoveredCandle(null)
        return
      }
      // Keep a fixed-size detail card inside the chart even at its right/bottom edge.
      const x = Math.min(Math.max(8, param.point.x + 14), Math.max(8, container.clientWidth - 218))
      const y = Math.min(Math.max(8, param.point.y + 14), Math.max(8, container.clientHeight - 172))
      setHoveredCandle({ bar, x, y })
    }
    chart.subscribeCrosshairMove(onCrosshairMove)
    return () => chart.unsubscribeCrosshairMove(onCrosshairMove)
  }, [bars])

  const title = useMemo(() => {
    if (!selection) return 'Select a symbol'
    return `${selection.symbol} · ${selection.assetClass}`
  }, [selection])

  // Source options for the picker — always include the currently-shown provider
  // (even if it wasn't in the search results), so the dropdown reflects reality.
  const sourceOptions = useMemo<BarSourceCandidate[]>(() => {
    const opts = [...candidates]
    if (meta?.barId && !opts.some((c) => c.barId === meta.barId)) {
      opts.unshift({ barId: meta.barId, source: meta.source, sourceId: meta.sourceId, symbol: meta.symbol, assetClass: 'unknown', label: meta.sourceId, barCapability: meta.barCapability })
    }
    return opts
  }, [candidates, meta])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between py-2 px-1 gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-text truncate">{title}</span>
          {meta && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium"
              title={`Provider: ${meta.barId}${meta.barCapability ? ` (${meta.barCapability})` : ''}`}
            >
              {meta.sourceId}{meta.barCapability ? ` · ${meta.barCapability}` : ''}
            </span>
          )}
          {bars && bars.length > 0 && (
            <span className="text-[11px] text-text-muted/60 truncate">
              {bars.length} bars · {bars[0].date} → {bars[bars.length - 1].date}
            </span>
          )}
          {brapiIntraday && (
            <span className="text-[11px] text-amber-300/80 truncate" title="BRAPI fornece candles intraday para, no máximo, os últimos sete dias.">
              BRAPI intraday: máximo de 7 dias
            </span>
          )}
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          {sourceOptions.length > 1 && (
            <label className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-text-muted/70">Source</span>
              <select
                value={selectedBarId ?? meta?.barId ?? ''}
                onChange={(e) => setSelectedBarId(e.target.value || null)}
                className="bg-bg-tertiary border border-border rounded px-2 py-1 text-[12px] text-text cursor-pointer max-w-[240px]"
                title="Which provider's K-line to show — sources are never merged; you pick"
              >
                {sourceOptions.map((c) => (
                  <option key={c.barId} value={c.barId}>
                    {c.sourceId} · {c.symbol}{c.barCapability ? ` (${c.barCapability})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-text-muted/70">Interval</span>
            <div className="flex border border-border rounded overflow-hidden" title="Candle width (how much time each bar covers)">
              {INTERVALS.map((iv, i) => (
                <button
                  key={iv}
                  onClick={() => selectInterval(iv)}
                  className={`px-2 py-1 text-[12px] transition-colors cursor-pointer ${
                    i > 0 ? 'border-l border-border' : ''
                  } ${interval === iv ? 'bg-bg-tertiary text-text' : 'text-text-muted hover:text-text'}`}
                >
                  {iv}
                </button>
              ))}
            </div>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-text-muted/70">Range</span>
            <div className="flex border border-border rounded overflow-hidden" title="How far back to load history">
              {TIMEFRAMES.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2 py-1 text-[12px] transition-colors cursor-pointer ${
                    i > 0 ? 'border-l border-border' : ''
                  } ${tf === t ? 'bg-bg-tertiary text-text' : 'text-text-muted hover:text-text'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </label>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 border border-border rounded bg-bg-secondary/30">
        <div ref={containerRef} className="absolute inset-0" />
        {hoveredCandle && (
          <div
            className="pointer-events-none absolute z-10 w-[204px] rounded border border-border bg-bg-secondary/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{ left: hoveredCandle.x, top: hoveredCandle.y }}
            role="status"
            aria-label={`Candle de ${formatCandleTime(hoveredCandle.bar.date)}`}
          >
            <div className="mb-1.5 text-[11px] font-medium text-text">{formatCandleTime(hoveredCandle.bar.date)}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-text-muted">Abertura <b className="ml-1 font-medium text-text">{formatPrice(hoveredCandle.bar.open)}</b></span>
              <span className="text-text-muted">Fechamento <b className="ml-1 font-medium text-text">{formatPrice(hoveredCandle.bar.close)}</b></span>
              <span className="text-text-muted">MÃ¡xima <b className="ml-1 font-medium text-[#3fb950]">{formatPrice(hoveredCandle.bar.high)}</b></span>
              <span className="text-text-muted">MÃ­nima <b className="ml-1 font-medium text-[#f85149]">{formatPrice(hoveredCandle.bar.low)}</b></span>
              <span className="col-span-2 text-text-muted">Volume <b className="ml-1 font-medium text-text">{formatVolume(hoveredCandle.bar.volume)}</b></span>
            </div>
          </div>
        )}
        {!selection && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-text-muted">
            Pick an asset to see the K-line.
          </div>
        )}
        {selection && loading && !bars && (
          <div className="absolute inset-0 p-2" aria-hidden="true">
            <Skeleton className="w-full h-full rounded" />
          </div>
        )}
        {selection && loading && (
          <div className="absolute top-2 right-2 text-[11px] text-text-muted">Loading…</div>
        )}
        {selection && error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-text-muted px-8 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
