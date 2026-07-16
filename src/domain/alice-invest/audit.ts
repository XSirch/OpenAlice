export type AuditStage='message'|'route'|'run'|'tool'|'source'|'risk'|'signal'|'inbox'|'delivery'
export interface AuditEvent{correlationId:string;stage:AuditStage;at:string;refs:Record<string,string>}
const allowed=new Set<AuditStage>(['message','route','run','tool','source','risk','signal','inbox','delivery'])
/** Redacts user-controlled values and bounds every persisted correlation reference. */
export function aliceInvestAudit(correlationId:string,stage:AuditStage,refs:Record<string,unknown>):AuditEvent{if(!allowed.has(stage))throw new Error('unsupported audit stage');const clean:Record<string,string>={};for(const [key,value]of Object.entries(refs)){if(/token|secret|password|chat|sender|body|text/i.test(key))continue;if(typeof value==='string'&&/^[a-zA-Z0-9._:-]{1,128}$/.test(value))clean[key]=value}return{correlationId:correlationId.slice(0,128),stage,at:new Date().toISOString(),refs:clean}}
