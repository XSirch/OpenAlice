import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { aliceInvestApi, type AliceInvestSnapshot } from '../api/alice-invest'

const capabilities = ['global', 'fixed_income', 'b3_signals', 'crypto_signals']
export function AliceInvestPage() {
  const [snapshot, setSnapshot] = useState<AliceInvestSnapshot | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => { void aliceInvestApi.load().then(setSnapshot).catch(() => setLoadFailed(true)) }, [])
  return <div className="flex flex-col flex-1 min-h-0">
    <PageHeader title="Alice Invest" description="Operational readiness and safety controls. This surface cannot execute financial actions." />
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Derived readiness</h2><p className="mt-1 text-xs text-muted-foreground">This is server-derived from durable evidence, not configuration. Paper alerts are the maximum state.</p>
        {loadFailed ? <p className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">Readiness could not be loaded. No capability should be treated as ready.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{capabilities.map(capability=>{
          const view=snapshot?.readiness.find(item=>item.capability===capability)
          return <div key={capability} className="rounded-lg border border-border bg-background p-3"><p className="font-mono text-xs text-foreground">{capability}</p>
            {!snapshot ? <p className="mt-1 text-xs text-muted-foreground">Loading evidence...</p> : !view ? <p className="mt-1 text-xs text-muted-foreground">No evidence recorded.</p> : <>
              <p className="mt-1 text-xs text-muted-foreground">State: {view.state}</p><p className="mt-1 text-xs text-muted-foreground">Evaluated: {view.evaluatedAt}</p>
              <p className="mt-2 text-xs text-muted-foreground">Approved evidence: {view.evidence.filter(item=>item.status==='passed').length}; total: {view.evidence.length}</p>
              {view.evidence.length ? <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{view.evidence.map(item=><li key={`${item.criterion}-${item.observedAt}`}>{item.criterion}: {item.status} - {item.source} at {item.observedAt}{item.details?`: ${item.details}`:''}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No evidence yet.</p>}
              {view.blockers.length ? <p className="mt-2 text-xs text-muted-foreground">Blocked or missing: {view.blockers.join(' / ')}</p> : <p className="mt-2 text-xs text-muted-foreground">No blockers recorded.</p>}
            </>}
          </div>
        })}</div>}
      </section>
      <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Configuration and kill switches</h2><p className="mt-1 text-xs text-muted-foreground">These switches constrain operations; they are not readiness evidence.</p><p className="mt-2 text-xs text-muted-foreground">{snapshot ? Object.entries(snapshot.switches).map(([name, enabled]) => `${name}: ${enabled ? 'on' : 'off'}`).join(' / ') : 'Loading switches'}.</p><p className="mt-2 text-xs text-muted-foreground">Execution is permanently unavailable in Alice Invest.</p></section>
      <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Health</h2><p className="mt-1 text-xs text-muted-foreground">Provider, stale-data, monitor and alert health is reported without credentials or external identifiers.</p></section>
    </div></div>
  </div>
}
