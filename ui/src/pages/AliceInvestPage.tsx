import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { aliceInvestApi, type AliceInvestSnapshot } from '../api/alice-invest'

const capabilities = ['global', 'fixed_income', 'b3_signals', 'crypto_signals']
export function AliceInvestPage() {
  const [snapshot, setSnapshot] = useState<AliceInvestSnapshot | null>(null)
  useEffect(() => { void aliceInvestApi.load().then(setSnapshot).catch(() => setSnapshot(null)) }, [])
  return <div className="flex flex-col flex-1 min-h-0">
    <PageHeader title="Alice Invest" description="Operational readiness and safety controls. This surface cannot execute financial actions." />
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-border bg-bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-text">Capability readiness</h2><p className="mt-1 text-xs text-text-muted">Readiness is evaluated by the server. Paper alerts are the maximum state.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{capabilities.map(capability=>{const view=snapshot?.readiness.find(item=>item.capability===capability);return <div key={capability} className="rounded-lg border border-border bg-bg p-3"><p className="font-mono text-xs text-text">{capability}</p><p className="mt-1 text-xs text-text-muted">{view?.state ?? 'loading'}</p>{view?.blockers.length ? <p className="mt-2 text-xs text-text-muted">Blocked: {view.blockers.join(' · ')}</p> : <p className="mt-2 text-xs text-text-muted">No blockers recorded</p>}<p className="mt-2 text-xs text-text-muted">Evidence: {view?.evidence.length ?? 0} · {view?.evaluatedAt ?? 'not evaluated'}</p></div>})}</div>
      </section>
      <section className="rounded-2xl border border-border bg-bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-text">Operational switches</h2><p className="mt-1 text-xs text-text-muted">{snapshot ? Object.entries(snapshot.switches).map(([name, enabled]) => `${name}: ${enabled ? 'on' : 'off'}`).join(' · ') : 'Loading switches'}.</p><p className="mt-2 text-xs text-text-muted">Execution is permanently unavailable in Alice Invest.</p></section>
      <section className="rounded-2xl border border-border bg-bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-text">Health</h2><p className="mt-1 text-xs text-text-muted">Provider, stale-data, monitor and alert health is reported without credentials or external identifiers.</p></section>
    </div></div>
  </div>
}
