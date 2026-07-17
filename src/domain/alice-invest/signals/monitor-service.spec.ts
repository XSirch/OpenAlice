import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createMemoryInboxStore } from '../../../core/inbox-store.js'
import { AliceInvestMonitorService, MonitorInputStore } from './monitor-service.js'
import { ReadinessEvidenceStore } from '../readiness/evidence-store.js'
import { SignalLedger } from './ledger.js'
import { MonitorDeliveryStore } from './monitor-delivery-store.js'
import { MonitorTelemetryStore } from './monitor-telemetry-store.js'

const signal={capability:'b3_signals',workspaceId:'w',price:'12',sourceTimestamp:'2026-07-16T12:09:55.000Z',event:{eventId:'created',signalId:'s',type:'created',at:'2026-07-16T12:00:00.000Z',candidate:{strategyId:'x',strategyVersion:'1',symbol:'PETR4',observations:[{symbol:'PETR4',source:'fixture',sourceTimestamp:'2026-07-16T12:00:00.000Z',receivedAt:'2026-07-16T12:00:00.000Z',capability:'realtime',close:'10'}],targetPrice:'12',stopPrice:'9',validUntil:'2026-07-16T13:00:00.000Z',riskNotes:[],status:'eligible'}}}
describe('AliceInvestMonitorService',()=>it('keeps the Guardian-supervised service fail-closed while the monitor switch is off',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'monitor-service-'));const input=join(dir,'input.json');try{
    await writeFile(input,JSON.stringify({version:1,b3MarketOpen:true,maxAgeSeconds:60,signals:[signal]}))
    const config=await import('../../../core/alice-invest-config.js');const spy=vi.spyOn(config,'readAliceInvestConfig').mockResolvedValue({version:1,execution_enabled:false,readiness:{global:'not_ready',fixed_income:'research_only',b3_signals:'research_only',crypto_signals:'research_only'},kill_switches:{telegram_inbound_enabled:false,market_scans_enabled:false,signal_notifications_enabled:false,active_signal_monitor_enabled:false},limits:{max_inbound_text_bytes:1,max_external_id_chars:1,max_correlation_id_chars:1,max_pending_inbound_messages:1},security:{redact_external_identifiers:true,allow_absolute_paths:false,allow_path_traversal:false,require_private_file_permissions:true}})
    const service=new AliceInvestMonitorService(createMemoryInboxStore(),{inputStore:new MonitorInputStore(input),evidenceStore:new ReadinessEvidenceStore(join(dir,'evidence.json')),ledger:new SignalLedger(join(dir,'ledger.json')),deliveries:new MonitorDeliveryStore(join(dir,'deliveries.json')),now:()=>new Date('2026-07-16T12:10:00.000Z')})
    expect(await service.tick()).toEqual([]);spy.mockRestore()
  }finally{await rm(dir,{recursive:true,force:true})}
}))

describe('AliceInvestMonitorService telemetry',()=>it('records stale input without emitting an alert',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'monitor-service-'));const input=join(dir,'input.json');try{
    await writeFile(input,JSON.stringify({version:1,b3MarketOpen:true,maxAgeSeconds:60,signals:[{...signal,sourceTimestamp:'2026-07-16T12:00:00.000Z'}]}))
    const config=await import('../../../core/alice-invest-config.js');const spy=vi.spyOn(config,'readAliceInvestConfig').mockResolvedValue({version:1,execution_enabled:false,readiness:{global:'not_ready',fixed_income:'research_only',b3_signals:'research_only',crypto_signals:'research_only'},kill_switches:{telegram_inbound_enabled:false,market_scans_enabled:false,signal_notifications_enabled:false,active_signal_monitor_enabled:true},limits:{max_inbound_text_bytes:1,max_external_id_chars:1,max_correlation_id_chars:1,max_pending_inbound_messages:1},security:{redact_external_identifiers:true,allow_absolute_paths:false,allow_path_traversal:false,require_private_file_permissions:true}} as never)
    const telemetry=new MonitorTelemetryStore(join(dir,'telemetry.json')),service=new AliceInvestMonitorService(createMemoryInboxStore(),{inputStore:new MonitorInputStore(input),evidenceStore:new ReadinessEvidenceStore(join(dir,'evidence.json')),ledger:new SignalLedger(join(dir,'ledger.json')),deliveries:new MonitorDeliveryStore(join(dir,'deliveries.json')),telemetry,now:()=>new Date('2026-07-16T12:10:00.000Z')})
    expect(await service.tick()).toMatchObject([{action:'none',delivered:false}]);expect(await telemetry.list()).toMatchObject([{kind:'stale',capability:'b3_signals'}]);spy.mockRestore()
  }finally{await rm(dir,{recursive:true,force:true})}
}))
