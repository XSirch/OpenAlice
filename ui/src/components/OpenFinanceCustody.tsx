import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { CustodySnapshot } from '../api/open-finance'
import { fmt, fmtNum } from '../lib/format'

export function OpenFinanceCustody() {
  const [configured, setConfigured] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [itemIds, setItemIds] = useState<string[]>([])
  const [snapshot, setSnapshot] = useState<CustodySnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = useMemo(() => snapshot?.positions.reduce((sum, position) => sum + (position.currency === 'BRL' ? position.value ?? 0 : 0), 0) ?? 0, [snapshot])

  const load = useCallback(async () => {
    try {
      const config = await api.openFinance.load()
      setConfigured(config.pluggy.configured)
      setEnabled(config.pluggy.enabled)
      setItemIds(config.pluggy.itemIds)
      if (config.pluggy.enabled && config.pluggy.configured) setSnapshot(await api.openFinance.custody())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load Open Finance custody.') }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const parsedItemIds = itemIds.map((id) => id.trim()).filter(Boolean)
      const config = await api.openFinance.save({ enabled, clientId, clientSecret, itemIds: parsedItemIds })
      setConfigured(config.pluggy.configured)
      setClientId(''); setClientSecret('')
      if (config.pluggy.enabled && config.pluggy.configured) setSnapshot(await api.openFinance.custody())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save Pluggy settings.') }
    finally { setBusy(false) }
  }
  const refresh = async () => { setBusy(true); setError(null); try { setSnapshot(await api.openFinance.custody()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to refresh custody.') } finally { setBusy(false) } }

  return (
    <section className="border border-border rounded-lg bg-bg-secondary p-5" aria-label="Open Finance custody">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-sm font-semibold text-text">Open Finance custody</h2><p className="mt-1 text-[12px] text-text-muted">Read-only positions via MeuPluggy. No trading or payment permission is requested.</p></div>
        {configured && <span className="rounded border border-border px-2 py-0.5 text-[10px] text-text-muted">Pluggy configured</span>}
      </div>
      {!configured && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="input" value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Pluggy client ID" autoComplete="off" />
          <input className="input" type="password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} placeholder="Pluggy client secret" autoComplete="new-password" />
        </div>
      )}
      <div className="mt-4"><label className="text-[12px] text-text-muted" htmlFor="pluggy-item-ids">MeuPluggy item IDs (one per line)</label><textarea id="pluggy-item-ids" className="input mt-1 min-h-20 w-full font-mono text-[12px]" value={itemIds.join('\n')} onChange={event => setItemIds(event.target.value.split(/\r?\n/))} placeholder="Item UUID from the Pluggy Dashboard" /><p className="mt-1 text-[11px] text-text-muted">MeuPluggy does not allow applications to list proxy items. Copy each linked item ID from the Dashboard.</p></div>
      <label className="mt-4 flex items-center gap-2 text-[12px] text-text-muted"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enable read-only custody sync</label>
      <div className="mt-4 flex items-center gap-2"><button className="btn-primary text-[12px]" disabled={busy || (!configured && (!clientId || !clientSecret)) || (enabled && itemIds.every((id) => !id.trim()))} onClick={() => void save()}>{busy ? 'Saving...' : configured ? 'Update' : 'Save and connect'}</button>{configured && enabled && <button className="btn-secondary-sm" disabled={busy} onClick={() => void refresh()}>{busy ? 'Refreshing...' : 'Refresh custody'}</button>}</div>
      {error && <p role="alert" className="mt-3 text-[12px] text-red-400">{error}</p>}
      {snapshot && <div className="mt-5 border-t border-border pt-4"><div className="mb-3 flex items-center justify-between"><span className="text-[12px] text-text-muted">{snapshot.positions.length} positions · updated {new Date(snapshot.fetchedAt).toLocaleString()}</span><span className="text-sm font-semibold">{fmt(total, 'BRL')}</span></div><div className="space-y-2">{snapshot.positions.map(position => <div key={position.id} className="grid grid-cols-[1fr_auto_auto] gap-4 text-[12px]"><span><span className="font-medium text-text">{position.code ?? position.name}</span>{position.code && <span className="ml-2 text-text-muted">{position.name}</span>}<span className="ml-2 text-text-muted">{position.institution ?? ''}</span></span><span className="text-text-muted">{position.quantity == null ? '—' : fmtNum(position.quantity)}</span><span className="min-w-20 text-right text-text">{position.value == null ? '—' : fmt(position.value, position.currency)}</span></div>)}</div></div>}
    </section>
  )
}
