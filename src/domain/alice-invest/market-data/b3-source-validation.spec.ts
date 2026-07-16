import { describe, expect, it } from 'vitest'
import { validateB3IntradaySource } from './b3-source-validation.js'
const now = new Date('2026-07-16T12:00:10Z')
const obs=(symbol:string, capability:'realtime'|'delayed'='realtime')=>({source:'fixture',symbol,sourceTimestamp:'2026-07-16T12:00:00.000Z',receivedAt:now.toISOString(),capability,volume:'100',bid:'1',ask:'2',spread:'1'})
describe('B3 source evidence',()=>{
  it('allows intraday only after complete fresh evidence and reconnect',()=>expect(validateB3IntradaySource({observations:[obs('PETR4'),obs('VALE3'),obs('BOVA11')],reconnectSucceeded:true,maxAgeSeconds:30,now})).toMatchObject({capability:'realtime',intradaySignalsAllowed:true}))
  it('keeps B3 research-only with missing/reconnect evidence',()=>expect(validateB3IntradaySource({observations:[obs('PETR4','delayed')],reconnectSucceeded:false,maxAgeSeconds:30,now})).toMatchObject({intradaySignalsAllowed:false,capability:'delayed'}))
})
