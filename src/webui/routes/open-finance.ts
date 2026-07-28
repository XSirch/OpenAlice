import { Hono } from 'hono'
import { z } from 'zod'
import { readFixedIncomeCustodyDefinitions, writeFixedIncomeCustodyDefinitions } from '../../core/fixed-income-custody.js'
import { readFgcCoveragePolicy, writeFgcCoveragePolicy } from '../../core/fgc-coverage-policy.js'
import { readOpenFinanceConfig, readPublicOpenFinanceConfig, writeOpenFinanceConfig } from '../../core/open-finance-config.js'
import { calculateFgcExposure } from '../../domain/alice-invest/fixed-income/fgc.js'
import { buildFixedIncomeLadder } from '../../domain/alice-invest/fixed-income/ladder.js'
import { reconcilePluggyFixedIncomeCustody } from '../../domain/alice-invest/fixed-income/reconciliation.js'
import { fetchPluggyCustody } from '../../domain/open-finance/pluggy.js'
import { triggerUTARestart } from '../../services/uta-supervisor/restart-trigger.js'
import { readBrokerageLedger, writeBrokerageLedger } from '../../core/alice-invest-tax-ledger.js'
import { calculateAveragePrices, confirmBrokerageImport, previewB3BrokerageCsv, type BrokerageImportPreview } from '../../domain/alice-invest/tax/ledger.js'
import { randomUUID } from 'node:crypto'
import { readBrazilTaxPolicy } from '../../core/alice-invest-tax-policy.js'
import { assessBrazilTaxEstimateReadiness, brazilTaxAssetClassSchema, taxSourceRequirementSchema } from '../../domain/alice-invest/tax/contracts.js'
import { estimateBrazilTax } from '../../domain/alice-invest/tax/estimates.js'
import { buildTaxReport, taxReportCsv, taxReportPdf } from '../../domain/alice-invest/tax/report.js'
import { readCorporateEvents } from '../../core/corporate-events.js'
import { associateCorporateEvents } from '../../domain/alice-invest/corporate-events/association.js'
import { calculateTotalReturn } from '../../domain/alice-invest/corporate-events/total-return.js'

const updateSchema = z.object({ enabled: z.boolean(), clientId: z.string().optional(), clientSecret: z.string().optional(), itemIds: z.array(z.string().uuid()).optional() })
const brokeragePreviewSchema = z.object({ sourceName: z.string().trim().min(1).max(256), content: z.string().max(5 * 1024 * 1024) })
const brokerageConfirmSchema = z.object({ previewId: z.string().uuid() })
const taxEstimateSchema = z.object({ assetClass: z.enum(['b3_equity_common', 'b3_fii', 'fixed_income', 'fund', 'crypto']), grossSalesBRL: z.string().optional(), netGainBRL: z.string().optional(), calendarDays: z.number().int().nonnegative().optional(), hasDayTrade: z.boolean().optional(), sources: z.array(taxSourceRequirementSchema).max(4) })

interface OpenFinanceRouteDeps {
  readDefinitions: typeof readFixedIncomeCustodyDefinitions
  writeDefinitions: typeof writeFixedIncomeCustodyDefinitions
  readFgcPolicy: typeof readFgcCoveragePolicy
  writeFgcPolicy: typeof writeFgcCoveragePolicy
  readConfig: typeof readOpenFinanceConfig
  fetchCustody: typeof fetchPluggyCustody
  readBrokerageLedger: typeof readBrokerageLedger
  writeBrokerageLedger: typeof writeBrokerageLedger
  readBrazilTaxPolicy: typeof readBrazilTaxPolicy
  readCorporateEvents: typeof readCorporateEvents
}

export function createOpenFinanceRoutes(overrides: Partial<OpenFinanceRouteDeps> = {}) {
  const deps: OpenFinanceRouteDeps = {
  readDefinitions: readFixedIncomeCustodyDefinitions,
  writeDefinitions: writeFixedIncomeCustodyDefinitions,
  readFgcPolicy: readFgcCoveragePolicy,
  writeFgcPolicy: writeFgcCoveragePolicy,
  readConfig: readOpenFinanceConfig,
  fetchCustody: fetchPluggyCustody,
  readBrokerageLedger,
  writeBrokerageLedger,
  readBrazilTaxPolicy,
  readCorporateEvents,
  ...overrides,
  }
  const pendingBrokeragePreviews = new Map<string, { preview: BrokerageImportPreview; expiresAt: number }>()
  const app = new Hono()
  app.get('/', async (c) => c.json(await readPublicOpenFinanceConfig()))
  app.put('/', async (c) => {
    try {
      const result = await writeOpenFinanceConfig(updateSchema.parse(await c.req.json()))
      triggerUTARestart().catch(() => { /* account health reports restart failures */ })
      return c.json(result)
    }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/custody', async (c) => {
    try {
      const config = await readOpenFinanceConfig()
      if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy is not configured.' }, 400)
      return c.json(await fetchPluggyCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds))
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  app.get('/fixed-income/definitions', async (c) => c.json(await deps.readDefinitions()))
  app.put('/fixed-income/definitions', async (c) => {
    try {
      return c.json(await deps.writeDefinitions(await c.req.json()))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })
  app.get('/fixed-income/reconcile', async (c) => {
    try {
      const config = await deps.readConfig()
      if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy is not configured.' }, 400)
      const [definitions, snapshot] = await Promise.all([
        deps.readDefinitions(),
        deps.fetchCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds),
      ])
      return c.json(reconcilePluggyFixedIncomeCustody(snapshot, definitions))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })
  app.get('/fixed-income/fgc-policy', async (c) => c.json(await deps.readFgcPolicy()))
  app.put('/fixed-income/fgc-policy', async (c) => {
    try { return c.json(await deps.writeFgcPolicy(await c.req.json())) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/fixed-income/fgc', async (c) => {
    try {
      const config = await deps.readConfig()
      if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy is not configured.' }, 400)
      const [definitions, policy, snapshot] = await Promise.all([
        deps.readDefinitions(),
        deps.readFgcPolicy(),
        deps.fetchCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds),
      ])
      const reconciliation = reconcilePluggyFixedIncomeCustody(snapshot, definitions)
      return c.json({ ...calculateFgcExposure(reconciliation.positions, policy), reconciliation })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })
  app.get('/fixed-income/ladder', async (c) => {
    try {
      const config = await deps.readConfig()
      if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy is not configured.' }, 400)
      const [definitions, snapshot] = await Promise.all([
        deps.readDefinitions(),
        deps.fetchCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds),
      ])
      const reconciliation = reconcilePluggyFixedIncomeCustody(snapshot, definitions)
      return c.json({ ...buildFixedIncomeLadder({ positions: reconciliation.positions, asOf: snapshot.fetchedAt, annualCdiPct: c.req.query('annualCdiPct'), annualIpcaPct: c.req.query('annualIpcaPct') }), reconciliation })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })
  app.get('/fixed-income/summary', async (c) => {
    try {
      const config = await deps.readConfig()
      if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy is not configured.' }, 400)
      const [definitions, policy, snapshot] = await Promise.all([
        deps.readDefinitions(),
        deps.readFgcPolicy(),
        deps.fetchCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds),
      ])
      const reconciliation = reconcilePluggyFixedIncomeCustody(snapshot, definitions)
      return c.json({ snapshot, fgc: calculateFgcExposure(reconciliation.positions, policy), ladder: buildFixedIncomeLadder({ positions: reconciliation.positions, asOf: snapshot.fetchedAt }), reconciliation })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  })
  /** Preview is memory-only and expires; no financial record is written here. */
  app.post('/tax/notes/preview', async (c) => {
    try {
      const input = brokeragePreviewSchema.parse(await c.req.json())
      const preview = previewB3BrokerageCsv(input.sourceName, input.content)
      const previewId = randomUUID()
      pendingBrokeragePreviews.set(previewId, { preview, expiresAt: Date.now() + 15 * 60_000 })
      return c.json({ previewId, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), sourceName: preview.sourceName, sourceHash: preview.sourceHash, operations: preview.operations, errors: preview.errors })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  /** Confirmation is an explicit, one-time mutation; expired previews cannot be replayed. */
  app.post('/tax/notes/confirm', async (c) => {
    try {
      const { previewId } = brokerageConfirmSchema.parse(await c.req.json())
      const pending = pendingBrokeragePreviews.get(previewId)
      pendingBrokeragePreviews.delete(previewId)
      if (!pending || pending.expiresAt < Date.now()) return c.json({ error: 'Brokerage-note preview expired or was not found. Generate a new preview.' }, 404)
      const ledger = await deps.readBrokerageLedger()
      const next = confirmBrokerageImport(ledger, pending.preview)
      await deps.writeBrokerageLedger(next)
      return c.json({ ledger: next, positions: calculateAveragePrices(next.entries) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/tax/ledger', async (c) => {
    try { const ledger = await deps.readBrokerageLedger(); return c.json({ ledger, positions: calculateAveragePrices(ledger.entries) }) }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  app.post('/tax/estimate', async (c) => {
    try {
      const input = taxEstimateSchema.parse(await c.req.json())
      const policyClass = input.assetClass === 'b3_equity_common' ? 'b3_equity' : input.assetClass === 'b3_fii' ? 'b3_fii' : input.assetClass
      const readiness = assessBrazilTaxEstimateReadiness(await deps.readBrazilTaxPolicy(), brazilTaxAssetClassSchema.parse(policyClass), input.sources)
      if (!readiness.allowed) return c.json({ readiness }, 409)
      return c.json({ estimate: estimateBrazilTax({ ...input, hasRequiredRecords: true }) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/tax/report', async (c) => {
    try {
      const format = c.req.query('format') === 'pdf' ? 'pdf' : c.req.query('format') === 'csv' ? 'csv' : null
      const from = c.req.query('from') ?? ''
      const to = c.req.query('to') ?? ''
      if (!format) return c.json({ error: 'format must be csv or pdf.' }, 400)
      const report = buildTaxReport(await deps.readBrokerageLedger(), { from, to, includeIdentifiers: c.req.query('includeIdentifiers') === '1' })
      const filename = `alice-invest-tax-report-${from}-${to}.${format}`
      if (format === 'csv') return c.body(taxReportCsv(report), 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' })
      const pdf = taxReportPdf(report)
      const body = new Uint8Array(pdf.length)
      body.set(pdf)
      return c.body(body, 200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/tax/corporate-event-associations', async (c) => {
    try {
      const [ledger, events] = await Promise.all([deps.readBrokerageLedger(), deps.readCorporateEvents()])
      const positions = calculateAveragePrices(ledger.entries).map((position) => ({ symbol: position.symbol, quantity: position.quantity }))
      const associations = associateCorporateEvents(events, positions)
      const byId = new Map(events.map((event) => [event.id, event]))
      return c.json({ associations: associations.map((association) => ({ association, event: byId.get(association.eventId)! })) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  app.get('/tax/total-return', async (c) => {
    try {
      const [ledger, events] = await Promise.all([deps.readBrokerageLedger(), deps.readCorporateEvents()])
      return c.json({ returns: calculateTotalReturn(ledger.entries, events), disclaimer: 'Retorno realizado e proventos confirmados; não inclui marcação a mercado sem cotação com fonte/data-base.' })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  app.post('/test', async (c) => {
    try {
      const config = await readOpenFinanceConfig()
      if (!config.pluggy.clientId || !config.pluggy.clientSecret) return c.json({ error: 'Pluggy client ID and secret are required.' }, 400)
      const snapshot = await fetchPluggyCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds)
      return c.json({ ok: true, positions: snapshot.positions.length })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })
  return app
}
