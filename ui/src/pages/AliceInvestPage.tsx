import { PageHeader } from '../components/PageHeader'

const capabilities = ['global', 'fixed_income', 'b3_signals', 'crypto_signals']
export function AliceInvestPage() {
  return <div className="flex flex-col flex-1 min-h-0">
    <PageHeader title="Alice Invest" description="Operational readiness and safety controls. This surface cannot execute financial actions." />
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-border bg-bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-text">Capability readiness</h2><p className="mt-1 text-xs text-text-muted">Readiness is evaluated by the server. Paper alerts are the maximum state.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{capabilities.map(capability=><div key={capability} className="rounded-lg border border-border bg-bg p-3"><p className="font-mono text-xs text-text">{capability}</p><p className="mt-1 text-xs text-text-muted">Evidence and blocking reasons appear here when configured.</p></div>)}</div>
      </section>
      <section className="rounded-2xl border border-border bg-bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-text">Operational switches</h2><p className="mt-1 text-xs text-text-muted">Inbound, scans, notifications and monitor switches are administrative safety controls. Execution is permanently unavailable in Alice Invest.</p></section>
      <section className="rounded-2xl border border-border bg-bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-text">Health</h2><p className="mt-1 text-xs text-text-muted">Provider, stale-data, monitor and alert health is reported without credentials or external identifiers.</p></section>
    </div></div>
  </div>
}
