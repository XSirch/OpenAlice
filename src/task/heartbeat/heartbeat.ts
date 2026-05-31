/**
 * Heartbeat — periodic Alice self-check, Pump-driven.
 *
 * Heartbeat is a recurring "ping Alice every N minutes" service. Prior
 * to this commit, it piggy-backed on the cron engine: registered an
 * internal `__heartbeat__` cron job, subscribed to `cron.fire` filtered
 * by jobName, did its work in the handler. That was conceptual debt —
 * the cron engine should be reserved for user-defined cron jobs from
 * the Automation > Cron UI, and heartbeat's lifecycle (active-hours,
 * dedup, hot enable/disable, configured prompt) doesn't belong in a
 * "user cron job" shape.
 *
 * Now: heartbeat owns a private Pump for its schedule and a
 * ProducerHandle for `agent.work.{requested,skip}` emits. The cron
 * engine is no longer in its dependency graph.
 *
 * On each tick:
 *   1. Active-hours pre-filter. Outside hours → emit
 *      `agent.work.skip { source: 'heartbeat', reason: 'outside-active-hours' }`
 *      and return; AI is never invoked, no token cost.
 *   2. Otherwise emit `agent.work.requested { source: 'heartbeat',
 *      prompt }`. The agent-work-listener routes it through the
 *      heartbeat source config (notify_user inspection + dedup gate)
 *      registered at start().
 *
 * State heartbeat owns: HeartbeatDedup (24h window), active-hours
 * config, the Pump, the ProducerHandle, the source config registered
 * with agent-work-listener. AgentWork pipeline state (sessions,
 * AI invocation) lives elsewhere.
 */

import { SessionStore } from '../../core/session.js'
import { writeConfigSection } from '../../core/config.js'
import type { ListenerRegistry } from '../../core/listener-registry.js'
import type { ProducerHandle } from '../../core/producer.js'
import { createPump, type Pump } from '../../core/pump.js'
import type { AgentWorkListener, AgentWorkSourceConfig } from '../../core/agent-work-listener.js'

// ==================== Config ====================

export interface HeartbeatConfig {
  enabled: boolean
  /** Interval between heartbeats, e.g. "30m", "1h". */
  every: string
  /** Prompt sent to the AI on each heartbeat. */
  prompt: string
  /** Active hours window. Null = always active. */
  activeHours: {
    start: string   // "HH:MM"
    end: string     // "HH:MM"
    timezone: string // IANA timezone or "local"
  } | null
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  enabled: false,
  every: '30m',
  prompt: `You're Alice in the heartbeat monitoring loop. The system pings you periodically so you can check on what's happening — markets, watchlists, pending items, anything trade-relevant the user might want surfaced.

Note: heartbeat delivery is currently stubbed — there is no user-facing push from this loop while its trigger chain is being reworked for the Harness scheduler. Just observe and respond briefly with what you noticed (or nothing at all). Don't attempt to notify the user from here.`,
  activeHours: null,
}

// ==================== Types ====================

export interface HeartbeatOpts {
  config: HeartbeatConfig
  /** Where to register the heartbeat source config so the agent-work
   *  pipeline knows how to handle heartbeat-sourced requests. */
  agentWorkListener: AgentWorkListener
  /** Listener registry — used to declare the heartbeat producer so its
   *  agent.work.{requested,skip} emits are validated + show in the
   *  topology graph. */
  registry: ListenerRegistry
  /** Optional: inject a session for testing. */
  session?: SessionStore
  /** Inject clock for testing. */
  now?: () => number
}

export interface Heartbeat {
  start(): Promise<void>
  stop(): void
  /** Hot-toggle heartbeat on/off (persists to config + updates pump). */
  setEnabled(enabled: boolean): Promise<void>
  /** Current enabled state. */
  isEnabled(): boolean
  /** Manually trigger a heartbeat tick — used by tests and "run now" UI. */
  runNow(): Promise<void>
}

// ==================== Factory ====================

export function createHeartbeat(opts: HeartbeatOpts): Heartbeat {
  const { config, agentWorkListener, registry } = opts
  const session = opts.session ?? new SessionStore('heartbeat')
  const now = opts.now ?? Date.now

  let enabled = config.enabled
  let started = false
  let producer: ProducerHandle<readonly ['agent.work.requested', 'agent.work.skip']> | null = null
  let pump: Pump | null = null

  // ---- Source config (registered with agent-work-listener) ----
  //
  // The push is STUBBED. Heartbeat keeps its scheduler (the Pump still
  // ticks, active-hours still filter, the AI still runs each tick), but
  // the output gate unconditionally skips delivery — nothing lands in
  // the user's inbox. The old notify_user-inspecting + dedup gate is
  // gone along with the notify_user tool; heartbeat's trigger chain
  // isn't closed in the current Harness architecture, so until Harness
  // scheduling lands there's no meaningful sink to push to. Making the
  // skip explicit (rather than relying on "the tool no longer exists so
  // find() returns undefined") keeps the behavior obvious to the next
  // reader. The agent-work-listener calls this when an
  // agent.work.requested event with source='heartbeat' arrives.
  const sourceConfig: AgentWorkSourceConfig = {
    source: 'heartbeat',
    session,
    preamble: () =>
      'You are operating in the heartbeat monitoring context (session: heartbeat). The following is the recent heartbeat conversation history.',
    outputGate: () => ({ kind: 'skip', reason: 'stubbed', payload: { reason: 'stubbed' } }),
  }

  /** The pump's tick callback — active-hours guard then emit. */
  async function onTick(): Promise<void> {
    const startMs = now()
    console.log(`heartbeat: firing at ${new Date(startMs).toISOString()}`)

    if (!isWithinActiveHours(config.activeHours, now())) {
      await producer!.emit('agent.work.skip', {
        source: 'heartbeat',
        reason: 'outside-active-hours',
      })
      console.log(`heartbeat: skipped (outside-active-hours)`)
      return
    }

    await producer!.emit('agent.work.requested', {
      source: 'heartbeat',
      prompt: config.prompt,
    })
  }

  return {
    async start() {
      if (started) return
      started = true

      producer = registry.declareProducer({
        name: 'heartbeat',
        emits: ['agent.work.requested', 'agent.work.skip'] as const,
      })
      agentWorkListener.registerSource(sourceConfig)

      pump = createPump({
        name: 'heartbeat',
        every: config.every,
        enabled,
        onTick,
      })
      pump.start()
    },

    stop() {
      if (!started) return
      pump?.stop()
      pump = null
      producer?.dispose()
      producer = null
      started = false
    },

    async setEnabled(newEnabled: boolean) {
      enabled = newEnabled
      pump?.setEnabled(newEnabled)
      await writeConfigSection('heartbeat', { ...config, enabled: newEnabled })
    },

    isEnabled() {
      return enabled
    },

    async runNow() {
      if (pump) await pump.runNow()
    },
  }
}

// ==================== Active Hours ====================

/**
 * Check if the current time falls within the active hours window.
 * Returns true if no activeHours configured (always active).
 */
export function isWithinActiveHours(
  activeHours: HeartbeatConfig['activeHours'],
  nowMs?: number,
): boolean {
  if (!activeHours) return true

  const { start, end, timezone } = activeHours

  const startMinutes = parseHHMM(start)
  const endMinutes = parseHHMM(end)
  if (startMinutes === null || endMinutes === null) return true

  const nowMinutes = currentMinutesInTimezone(timezone, nowMs)

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function currentMinutesInTimezone(tz: string, nowMs?: number): number {
  const date = nowMs ? new Date(nowMs) : new Date()
  if (tz === 'local') {
    return date.getHours() * 60 + date.getMinutes()
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
    const parts = fmt.formatToParts(date)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    return hour * 60 + minute
  } catch {
    return date.getHours() * 60 + date.getMinutes()
  }
}

