import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { IInboxStore } from '../../../core/inbox-store.js'
import { readAliceInvestConfig } from '../../../core/alice-invest-config.js'
import { dataPath } from '../../../core/paths.js'
import { ReadinessEvidenceStore } from '../readiness/evidence-store.js'
import { projectAllReadiness } from '../readiness/projection.js'
import { SignalLedger } from './ledger.js'
import { MonitorDeliveryStore } from './monitor-delivery-store.js'
import { runSignalMonitorTick, type MonitorRunnerOutcome, type MonitoredSignal } from './monitor-runner.js'

const lifecycle = z.enum(['created', 'active', 'target_hit', 'stop_hit', 'expired', 'invalidated', 'trailing_activated', 'trailing_updated'])
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const iso = z.string().datetime({ offset: true })
const candidate = z.object({ strategyId:z.string(),strategyVersion:z.string(),symbol:z.string(),observations:z.array(z.object({symbol:z.string(),source:z.string(),sourceTimestamp:iso,receivedAt:iso,capability:z.enum(['realtime','delayed','eod','unknown']),close:decimal,volume:decimal.optional()})),targetPrice:decimal,stopPrice:decimal,validUntil:iso,riskNotes:z.array(z.string()),status:z.enum(['eligible','rejected','stale']) })
const signal = z.object({ capability:z.enum(['b3_signals','crypto_signals']),event:z.object({eventId:z.string(),signalId:z.string(),type:lifecycle,at:iso,candidate,reason:z.string().optional(),price:decimal.optional(),trailingStop:decimal.optional()}),price:decimal.optional(),low:decimal.optional(),high:decimal.optional(),sourceTimestamp:iso.optional(),workspaceId:z.string().min(1).max(128) })
const stateSchema = z.object({ version:z.literal(1),b3MarketOpen:z.boolean().default(false),maxAgeSeconds:z.number().int().min(1).max(3_600).default(60),signals:z.array(signal).max(500).default([]) }).strict()

/** The monitor input is a bounded, file-backed hand-off from a future source adapter. */
export class MonitorInputStore {
  constructor(private readonly path = dataPath('state', 'alice-invest-monitor-input.json')) {}
  async read(): Promise<{b3MarketOpen:boolean;maxAgeSeconds:number;signals:MonitoredSignal[]}> {
    try { return stateSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { b3MarketOpen:false, maxAgeSeconds:60, signals:[] }
      throw error
    }
  }
}

export interface MonitorServiceOptions { inputStore?:MonitorInputStore; evidenceStore?:ReadinessEvidenceStore; ledger?:SignalLedger; deliveries?:MonitorDeliveryStore; intervalMs?:number; now?:()=>Date }
/** Runs inside Alice, which Guardian already supervises. It is a bounded timer, never an agent loop. */
export class AliceInvestMonitorService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private readonly input: MonitorInputStore
  private readonly evidence: ReadinessEvidenceStore
  private readonly ledger: SignalLedger
  private readonly deliveries: MonitorDeliveryStore
  private readonly intervalMs: number
  private readonly now: ()=>Date
  constructor(private readonly inbox:IInboxStore, options:MonitorServiceOptions={}) {
    this.input=options.inputStore??new MonitorInputStore()
    this.evidence=options.evidenceStore??new ReadinessEvidenceStore()
    this.ledger=options.ledger??new SignalLedger(dataPath('state','alice-invest-signal-ledger.json'))
    this.deliveries=options.deliveries??new MonitorDeliveryStore(dataPath('state','alice-invest-monitor-deliveries.json'))
    this.intervalMs=options.intervalMs??60_000
    this.now=options.now??(()=>new Date())
  }
  start():void { if(this.timer)return; this.timer=setInterval(()=>void this.tick().catch(error=>console.warn('alice-invest monitor tick failed',error)),this.intervalMs); this.timer.unref(); void this.tick().catch(error=>console.warn('alice-invest monitor initial tick failed',error)) }
  stop():void { if(this.timer){clearInterval(this.timer);this.timer=null} }
  async tick():Promise<MonitorRunnerOutcome[]> {
    if(this.running)return []
    this.running=true
    try {
      const config=await readAliceInvestConfig()
      if(!config.kill_switches.active_signal_monitor_enabled)return []
      const [input]=await Promise.all([this.input.read(),this.evidence.init()])
      const readiness=Object.fromEntries(projectAllReadiness(this.evidence.list(),this.now()).filter(item=>item.capability==='b3_signals'||item.capability==='crypto_signals').map(item=>[item.capability,item.state])) as Record<'b3_signals'|'crypto_signals','not_ready'|'research_only'|'paper_alerts'>
      return runSignalMonitorTick({now:this.now(),enabled:true,notificationsEnabled:config.kill_switches.signal_notifications_enabled,readiness,b3MarketOpen:input.b3MarketOpen,maxAgeSeconds:input.maxAgeSeconds,signals:input.signals},this.ledger,this.inbox,this.deliveries)
    } finally { this.running=false }
  }
}
