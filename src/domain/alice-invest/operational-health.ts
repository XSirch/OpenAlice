export type MetricName='messages'|'dedupe'|'latency_ms'|'models'|'scans'|'risk'|'alerts'|'stale'|'provider'|'monitor'
export interface OperationalHealth{counts:Record<MetricName,number>;healthy:boolean;reasons:string[]}
const names:MetricName[]=['messages','dedupe','latency_ms','models','scans','risk','alerts','stale','provider','monitor']
export function operationalHealth(values:Partial<Record<MetricName,number>>):OperationalHealth{const counts=Object.fromEntries(names.map(n=>[n,Math.max(0,Math.floor(values[n]??0))])) as Record<MetricName,number>;const reasons:string[]=[];if(counts.provider>0)reasons.push('provider failures');if(counts.monitor>0)reasons.push('monitor failures');return{counts,healthy:reasons.length===0,reasons}}
