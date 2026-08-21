import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { Hono } from 'hono'
import { z } from 'zod'

import { TesouroTransparenteProvider } from '../../domain/alice-invest/fixed-income/providers/tesouro-transparente.js'
import type { FixedIncomeProviderRequest, FixedIncomeSnapshot } from '../../domain/alice-invest/fixed-income/providers/provider-contract.js'
import { importManualFixedIncomeOffers } from '../../domain/alice-invest/fixed-income/opportunities.js'
import { fixedIncomeOpportunityRankingInputSchema, rankFixedIncomeOpportunities, type FixedIncomeOpportunityRanking } from '../../domain/alice-invest/fixed-income/opportunity-ranking.js'
import { analyzePrivateCredit, privateCreditAnalysisInputSchema, type PrivateCreditAnalysis } from '../../domain/alice-invest/fixed-income/private-credit.js'
import { fixedIncomeConcentrationLimitsSchema, fixedIncomeRecommendationThresholdsSchema, type FixedIncomeAdvisorPolicy } from '../../domain/alice-invest/fixed-income/policy.js'
import { FixedIncomeOperationsStore } from '../../domain/alice-invest/fixed-income/operations.js'
import { FixedIncomeAdvisorStateStore } from '../../domain/alice-invest/fixed-income/advisor-state.js'
import { dataPath } from '../../core/paths.js'
import { readFixedIncomeAdvisorPolicy, writeFixedIncomeAdvisorPolicy } from '../../core/fixed-income-advisor-policy.js'
import { readFixedIncomeCustodyDefinitions } from '../../core/fixed-income-custody.js'
import { readOpenFinanceConfig } from '../../core/open-finance-config.js'
import { fetchPluggyCustody, type CustodyPosition } from '../../domain/open-finance/pluggy.js'
import { reconcilePluggyFixedIncomeCustody, type FixedIncomeCustodyReconciliation } from '../../domain/alice-invest/fixed-income/reconciliation.js'
import { FixedIncomeShadowValidationStore, fixedIncomeShadowWalkthroughSchema, type FixedIncomeShadowReport } from '../../domain/alice-invest/fixed-income/shadow-validation.js'
import { CvmPrivateCreditProvider } from '../../domain/alice-invest/fixed-income/providers/cvm-private-credit.js'
import { ingestPrivateCreditDocumentWithExtraction, type PrivateCreditDocumentIngestion, type PrivateCreditPdfExtraction } from '../../domain/alice-invest/fixed-income/document-ingestion.js'
import { fixedIncomeSwitchInputSchema, simulateFixedIncomeSwitch, type FixedIncomeSwitchResult } from '../../domain/alice-invest/fixed-income/switch-analysis.js'
import { fixedIncomeCashFlowSchema } from '../../domain/alice-invest/fixed-income/cashflows.js'
import { fixedIncomeLotEvidenceSchema } from '../../domain/alice-invest/fixed-income/lots.js'
import { FixedIncomePositionStateStore, fixedIncomePositionDocumentSchema, fixedIncomePositionRiskSchema, type FixedIncomePositionCalculation, type FixedIncomePositionRecord } from '../../domain/alice-invest/fixed-income/position-state.js'

export interface FixedIncomeRouteDeps {
  fetchTreasury?: (request: FixedIncomeProviderRequest) => Promise<FixedIncomeSnapshot>
  simulateSwitch?: (input: Parameters<typeof simulateFixedIncomeSwitch>[0]) => FixedIncomeSwitchResult | unknown
  rankOpportunities?: (input: Parameters<typeof rankFixedIncomeOpportunities>[0]) => FixedIncomeOpportunityRanking | unknown
  analyzeCredit?: (input: Parameters<typeof analyzePrivateCredit>[0]) => PrivateCreditAnalysis | unknown
  fetchCreditEvidence?: (request: FixedIncomeProviderRequest) => Promise<FixedIncomeSnapshot>
  inspectCreditDocument?: (bytes: Uint8Array, metadata: Parameters<typeof ingestPrivateCreditDocumentWithExtraction>[1]) => Promise<PrivateCreditDocumentIngestion | (PrivateCreditDocumentIngestion & PrivateCreditPdfExtraction)>
  operations?: Pick<FixedIncomeOperationsStore, 'read' | 'recordManualOutcome'>
  state?: Pick<FixedIncomeAdvisorStateStore, 'listOpportunities' | 'recordImport'>
  readPolicy?: () => Promise<FixedIncomeAdvisorPolicy>
  writePolicy?: (input: unknown) => Promise<FixedIncomeAdvisorPolicy>
  loadPortfolio?: () => Promise<{ fetchedAt: string; custody: CustodyPosition[]; reconciliation: FixedIncomeCustodyReconciliation }>
  shadowValidation?: { report: (maximumCalculationDifferenceBRL?: string) => Promise<FixedIncomeShadowReport>; recordWalkthrough: FixedIncomeShadowValidationStore['recordWalkthrough'] }
  positionState?: Pick<FixedIncomePositionStateStore, 'get' | 'replaceEvidence' | 'recordCalculation'>
  now?: () => Date
}

export function createFixedIncomeRoutes(deps: FixedIncomeRouteDeps = {}) {
  const app = new Hono()
  const provider = new TesouroTransparenteProvider()
  const fetchTreasury = deps.fetchTreasury ?? ((request: FixedIncomeProviderRequest) => provider.fetch(request))
  const runSwitchSimulation = deps.simulateSwitch ?? simulateFixedIncomeSwitch
  const runOpportunityRanking = deps.rankOpportunities ?? rankFixedIncomeOpportunities
  const runCreditAnalysis = deps.analyzeCredit ?? analyzePrivateCredit
  const cvmProvider = new CvmPrivateCreditProvider()
  const fetchCreditEvidence = deps.fetchCreditEvidence ?? ((request: FixedIncomeProviderRequest) => cvmProvider.fetch(request))
  const inspectCreditDocument = deps.inspectCreditDocument ?? ingestPrivateCreditDocumentWithExtraction
  const operations = deps.operations ?? new FixedIncomeOperationsStore(dataPath('state', 'alice-invest-fixed-income-operations.json'))
  const state = deps.state ?? new FixedIncomeAdvisorStateStore(dataPath('state', 'fixed-income-opportunities.json'))
  const readPolicy = deps.readPolicy ?? readFixedIncomeAdvisorPolicy
  const writePolicy = deps.writePolicy ?? writeFixedIncomeAdvisorPolicy
  const loadPortfolio = deps.loadPortfolio ?? loadFixedIncomePortfolio
  const shadowValidation = deps.shadowValidation ?? new FixedIncomeShadowValidationStore(dataPath('state', 'fixed-income-shadow-validation.json'))
  const positionState = deps.positionState ?? new FixedIncomePositionStateStore(dataPath('state', 'fixed-income-position-state.json'))
  const now = deps.now ?? (() => new Date())

  app.get('/overview', async (c) => c.json({
    readiness: 'research_only', executionEnabled: false, generatedAt: now().toISOString(), policy: await readPolicy(),
    sourceStates: [
      { id: 'tesouro-transparente', label: 'Tesouro Transparente', mode: 'official_automatic', state: 'available_on_demand', freshness: 'daily' },
      { id: 'bcb-ifdata', label: 'BCB IFData', mode: 'official_automatic', state: 'available_on_demand', freshness: 'quarterly' },
      { id: 'anbima-public', label: 'ANBIMA pública', mode: 'manual_import', state: 'manual_only', freshness: 'source_dependent' },
      { id: 'btg-auvp-offers', label: 'BTG/AUVP', mode: 'user_confirmation', state: 'confirmation_required', freshness: 'up_to_2_hours' },
    ],
    capabilities: { treasuryPricing: true, switchSimulation: true, bankRanking: true, privateCreditAnalysis: true, financialExecution: false },
  }))

  app.get('/telegram-summary', async (c) => {
    try {
      const [portfolio, opportunities, operational, policy] = await Promise.all([loadPortfolio(), state.listOpportunities(now()), operations.read(), readPolicy()])
      return c.json({ message: formatFixedIncomeTelegramSummary({ portfolio, opportunities, deliveryCount: operational.deliveries.length, policy }) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })

  app.get('/positions', async (c) => {
    try {
      const portfolio = await loadPortfolio()
      const classified = portfolio.reconciliation.positions.map(publicPosition)
      const unclassified = portfolio.custody.filter((item) => portfolio.reconciliation.unclassifiedPositionIds.includes(item.id)).map(publicUnclassifiedPosition)
      return c.json({ readiness: 'research_only', executionEnabled: false, fetchedAt: portfolio.fetchedAt, positions: classified, unclassified, gaps: redactExternalIdentifiers(portfolio.reconciliation.unresolved) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })

  app.get('/positions/:id', async (c) => {
    try {
      const portfolio = await loadPortfolio()
      const position = portfolio.reconciliation.positions.find((item) => publicId(item.id) === c.req.param('id'))
      if (!position) return c.json({ error: 'Fixed-income position not found.' }, 404)
      const outcomes = (await operations.read()).manualOutcomes.filter((item) => item.recommendationId.startsWith(`${position.id}:`))
      const record = await positionState.get(position.id)
      const calculations = [...record.calculations].sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt))
      return c.json({ readiness: 'research_only', executionEnabled: false, position: publicPosition(position), detail: publicPositionRecord(record), gaps: positionDetailGaps(position, record), recommendationHistory: redactExternalIdentifiers(outcomes), calculationMemory: { available: calculations.length > 0, ...(calculations[0] ? { latest: calculations[0], history: calculations } : { reason: 'A position-linked calculation trace is created only by an explicit associated simulation.', history: [] }) } })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 502) }
  })

  app.put('/positions/:id/evidence', async (c) => {
    try {
      const portfolio = await loadPortfolio(); const position = portfolio.reconciliation.positions.find((item) => publicId(item.id) === c.req.param('id'))
      if (!position) return c.json({ error: 'Fixed-income position not found.' }, 404)
      const body = z.object({
        lots: z.array(fixedIncomeLotEvidenceSchema).max(10_000),
        cashFlows: z.array(fixedIncomeCashFlowSchema.omit({ instrumentId: true })).max(100_000),
        risk: fixedIncomePositionRiskSchema.nullable(), documents: z.array(fixedIncomePositionDocumentSchema).max(256),
      }).strict().parse(await c.req.json())
      const record = await positionState.replaceEvidence(position.id, {
        ...body,
        lots: body.lots.map((lot) => ({ ...lot, positionId: position.id })),
        cashFlows: body.cashFlows.map((cashFlow) => ({ ...cashFlow, instrumentId: position.id })),
      })
      return c.json({ stored: true, readiness: 'research_only', executionEnabled: false, detail: publicPositionRecord(record), gaps: positionDetailGaps(position, record) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  app.get('/opportunities', async (c) => c.json({ readiness: 'research_only', executionEnabled: false, opportunities: redactExternalIdentifiers(await state.listOpportunities(now())) }))
  app.get('/recommendations', (c) => c.json({ readiness: 'research_only', executionEnabled: false, generationEnabled: false, recommendations: [] }))
  app.get('/recommendations/:id', (c) => c.json({ error: `Fixed-income recommendation ${publicId(c.req.param('id'))} not found; generation is fail-closed.` }, 404))
  app.get('/shadow-validation', async (c) => c.json(await shadowValidation.report()))
  app.put('/shadow-validation/walkthrough', async (c) => {
    try {
      const walkthrough = fixedIncomeShadowWalkthroughSchema.parse(await c.req.json())
      const stored = await shadowValidation.recordWalkthrough(walkthrough)
      return c.json({ stored, readiness: 'research_only', executionEnabled: false, report: await shadowValidation.report() })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })
  app.get('/health', async (c) => {
    try {
      const [policy, shadow, operational] = await Promise.all([readPolicy(), shadowValidation.report(), operations.read()])
      return c.json({
        state: policy.enabled ? (shadow.state === 'validation_failed' ? 'degraded' : 'collecting') : 'disabled',
        readiness: 'research_only', executionEnabled: false, checkedAt: now().toISOString(),
        policy: { enabled: policy.enabled, providerRefreshEnabled: policy.killSwitches.providerRefreshEnabled, recommendationGenerationEnabled: false },
        shadow: { state: shadow.state, distinctObservationDays: shadow.distinctObservationDays, blockers: shadow.blockers },
        operations: { auditEvents: operational.audit.length, deliveries: operational.deliveries.length, manualOutcomes: operational.manualOutcomes.length },
        monitor: {
          enabled: policy.killSwitches.opportunityScanEnabled || policy.killSwitches.creditMonitorEnabled,
          notificationsEnabled: policy.killSwitches.notificationsEnabled,
          lastEvent: (() => { const event = [...operational.audit].sort((a, b) => b.at.localeCompare(a.at))[0]; return event ? { at: event.at, kind: event.kind, detail: event.detail } : null })(),
          circuitState: operational.audit.some((event) => event.kind === 'circuit_open' && Date.parse(event.at) >= now().getTime() - 15 * 60_000) ? 'open_recently' : 'no_recent_open_event',
        },
      })
    } catch (error) { return c.json({ state: 'unavailable', readiness: 'research_only', executionEnabled: false, error: error instanceof Error ? error.message : String(error) }, 503) }
  })

  app.get('/treasury/prices', async (c) => {
    try {
      const identifiers = Object.fromEntries([
        ['referenceDate', c.req.query('referenceDate')],
        ['productType', c.req.query('productType')],
        ['maturityDate', c.req.query('maturityDate')],
      ].filter((entry): entry is [string, string] => entry[1] !== undefined))
      const snapshot = await fetchTreasury({ dataset: 'treasury_prices', asOf: now().toISOString(), identifiers })
      return c.json({ readiness: 'research_only', executionEnabled: false, snapshot: redactExternalIdentifiers(snapshot) })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  app.post('/simulations/switch', async (c) => {
    try {
      const raw = z.record(z.string(), z.unknown()).parse(await c.req.json())
      const positionId = z.string().trim().min(1).max(256).optional().parse(raw['positionId'])
      const parsed = fixedIncomeSwitchInputSchema.parse(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'positionId')))
      const result = runSwitchSimulation(parsed)
      if (positionId) {
        const portfolio = await loadPortfolio(); const position = portfolio.reconciliation.positions.find((item) => publicId(item.id) === positionId)
        if (!position) return c.json({ error: 'Fixed-income position not found for calculation association.' }, 404)
        await positionState.recordCalculation(position.id, positionCalculation(result, parsed.targetDate, parsed.asOf))
      }
      return c.json(result)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  app.post('/simulations/invest', async (c) => {
    try {
      const parsed = fixedIncomeOpportunityRankingInputSchema.parse(await c.req.json())
      return c.json(runOpportunityRanking(parsed))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  app.post('/imports', async (c) => {
    try {
      const body = z.object({
        fileName: z.string().trim().min(1).max(256), contentBase64: z.string().min(1).max(8 * 1024 * 1024),
        importedAt: z.string().datetime({ offset: true }), termsReviewedAt: z.string().date(),
      }).strict().parse(await c.req.json())
      const imported = importManualFixedIncomeOffers(Buffer.from(body.contentBase64, 'base64'), body)
      const persisted = await state.recordImport({ checksum: imported.provenance.rawPayloadChecksum, importedAt: body.importedAt, ...imported })
      return c.json({ readiness: 'research_only', executionEnabled: false, persisted, ...redactExternalIdentifiers(imported) })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  app.post('/credit-analysis', async (c) => {
    try {
      const parsed = privateCreditAnalysisInputSchema.parse(await c.req.json())
      return c.json(runCreditAnalysis(parsed))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
  })

  app.get('/credit-sources/cvm', async (c) => {
    try {
      const identifiers = z.object({ cvmCode: z.string().regex(/^\d{1,12}$/), year: z.string().regex(/^20\d{2}$/) }).strict().parse({ cvmCode: c.req.query('cvmCode'), year: c.req.query('year') })
      const snapshot = await fetchCreditEvidence({ dataset: 'private_credit_documents', asOf: now().toISOString(), identifiers })
      return c.json({ readiness: 'research_only', executionEnabled: false, snapshot: redactExternalIdentifiers(snapshot) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  app.post('/credit-documents/inspect', async (c) => {
    try {
      const body = z.object({
        fileName: z.string().trim().min(1).max(256), contentType: z.enum(['text/plain', 'text/csv', 'application/json', 'text/html', 'application/pdf']),
        contentBase64: z.string().min(1).max(14 * 1024 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), sourceKind: z.enum(['cvm_official_download', 'anbima_manual_download', 'user_supplied']),
        sourceUrl: z.string().url().max(2_048), observedAt: z.string().datetime({ offset: true }), dataAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/), termsReviewedAt: z.string().date(),
      }).strict().parse(await c.req.json())
      const bytes = Buffer.from(body.contentBase64, 'base64')
      const inspected = await inspectCreditDocument(bytes, body)
      return c.json({ readiness: 'research_only', executionEnabled: false, persisted: false, document: redactExternalIdentifiers(inspected) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  app.get('/history', async (c) => {
    try {
      const history = await operations.read()
      return c.json({ readiness: 'research_only', executionEnabled: false, history: redactExternalIdentifiers(history) })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 500) }
  })

  app.post('/refresh', async (c) => {
    try {
      z.object({ scope: z.enum(['portfolio', 'treasury', 'ifdata', 'opportunities', 'all']).default('all') }).strict().parse(await c.req.json().catch(() => ({})))
      const policy = await readPolicy()
      if (!policy.killSwitches.providerRefreshEnabled) return c.json({ error: 'Fixed-income provider refresh is disabled by policy.', readiness: 'research_only', executionEnabled: false }, 409)
      return c.json({ accepted: false, error: 'No supervised refresh runner is configured.', readiness: 'research_only', executionEnabled: false }, 503)
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  app.patch('/policy', async (c) => {
    try {
      const patch = z.object({
        enabled: z.boolean().optional(), liquidityReservePct: z.string().optional(),
        concentrationLimits: fixedIncomeConcentrationLimitsSchema.partial().optional(),
        recommendationThresholds: fixedIncomeRecommendationThresholdsSchema.partial().optional(),
        killSwitches: z.object({ providerRefreshEnabled: z.boolean().optional(), opportunityScanEnabled: z.boolean().optional(), creditMonitorEnabled: z.boolean().optional(), notificationsEnabled: z.boolean().optional() }).strict().optional(),
      }).strict().parse(await c.req.json())
      const current = await readPolicy()
      const updated = await writePolicy({ ...current, ...patch, concentrationLimits: { ...current.concentrationLimits, ...patch.concentrationLimits }, recommendationThresholds: { ...current.recommendationThresholds, ...patch.recommendationThresholds }, readiness: 'research_only', executionEnabled: false, recommendationGenerationEnabled: false, killSwitches: { ...current.killSwitches, ...patch.killSwitches, recommendationGenerationEnabled: false } })
      return c.json({ policy: updated, readiness: 'research_only', executionEnabled: false })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  app.post('/recommendations/:id/review', async (c) => {
    try {
      const body = z.object({ reviewedAt: z.string().datetime({ offset: true }), note: z.string().trim().min(1).max(1_000).optional() }).strict().parse(await c.req.json())
      await operations.recordManualOutcome({ recommendationId: c.req.param('id'), recordedAt: body.reviewedAt, outcome: 'reviewed', ...(body.note ? { note: body.note } : {}) })
      return c.json({ stored: true, readiness: 'research_only', executionEnabled: false })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  app.post('/recommendations/:id/manual-outcome', async (c) => {
    try {
      const body = z.object({ recordedAt: z.string().datetime({ offset: true }), outcome: z.enum(['executed_elsewhere', 'not_executed', 'dismissed', 'expired', 'reviewed']), note: z.string().trim().min(1).max(1_000).optional() }).strict().parse(await c.req.json())
      await operations.recordManualOutcome({ recommendationId: c.req.param('id'), ...body })
      return c.json({ stored: true, readiness: 'research_only', executionEnabled: false })
    } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
  })

  return app
}

export function formatFixedIncomeTelegramSummary(input: {
  portfolio: { custody: CustodyPosition[]; reconciliation: FixedIncomeCustodyReconciliation }
  opportunities: Array<{ availability: string; product: { productType: string } }>
  deliveryCount: number
  policy: FixedIncomeAdvisorPolicy
}): string {
  const total = input.portfolio.reconciliation.positions.reduce((sum, position) => sum.plus(position.currentAmountBRL), new Decimal(0))
  const byProduct = new Map<string, number>()
  for (const position of input.portfolio.reconciliation.positions) byProduct.set(position.product.productType, (byProduct.get(position.product.productType) ?? 0) + 1)
  const productLines = [...byProduct.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([product, count]) => `- ${product.replaceAll('_', ' ')}: ${count}`)
  const confirmed = input.opportunities.filter((item) => item.availability === 'confirmed').length
  const indicative = input.opportunities.filter((item) => item.availability === 'indicative').length
  return [
    'RENDA FIXA — RESUMO READ-ONLY',
    `Carteira classificada: ${input.portfolio.reconciliation.positions.length} posição(ões) · ${formatBrl(total)}`,
    `Sem classificação: ${input.portfolio.reconciliation.unclassifiedPositionIds.length}`,
    ...(productLines.length ? ['', 'Produtos:', ...productLines] : []),
    '', `Oportunidades: ${confirmed} confirmada(s) · ${indicative} indicativa(s)`,
    `Alertas já registrados: ${input.deliveryCount}`,
    `Reserva mínima: ${input.policy.liquidityReservePct}%`,
    'Estado: research_only · recomendações automáticas desativadas',
    '', 'Abra Alice Invest para posições, Tesouro, pós-fixados, LCI/LCA, crédito, oportunidades, simulação, alertas e limites.',
    'Nenhuma ordem pode ser enviada pelo Telegram ou por Alice Invest.',
  ].join('\n')
}

function formatBrl(value: Decimal): string {
  const [integer, fraction] = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2).split('.') as [string, string]
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`
}

function positionCalculation(result: unknown, targetDate: string, calculatedAt: string): FixedIncomePositionCalculation {
  const value = z.object({
    calculationTraceId: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['maintain', 'sell_partial', 'sell_and_reinvest', 'insufficient_data']),
    hold: z.object({ netFinalBRL: z.string() }).passthrough(), reinvest: z.object({ netFinalBRL: z.string() }).passthrough(),
    delta: z.object({ netBRL: z.string(), annualizedUpliftPct: z.string() }).passthrough(),
    breakEven: z.object({ annualNetRatePct: z.string() }).passthrough(), methodologyIds: z.array(z.string()),
  }).passthrough().parse(result)
  return { calculationTraceId: value.calculationTraceId, calculatedAt, targetDate, decision: value.decision, holdNetBRL: value.hold.netFinalBRL, reinvestNetBRL: value.reinvest.netFinalBRL, netDeltaBRL: value.delta.netBRL, annualizedUpliftPct: value.delta.annualizedUpliftPct, breakEvenAnnualNetRatePct: value.breakEven.annualNetRatePct, methodologyIds: value.methodologyIds }
}

function publicPositionRecord(record: FixedIncomePositionRecord) {
  return {
    updatedAt: record.updatedAt,
    lots: record.lots.map(({ positionId: _positionId, source, ...lot }) => ({ ...lot, id: publicId(lot.id), source: redactExternalIdentifiers(source) })),
    cashFlows: record.cashFlows.map(({ instrumentId: _instrumentId, ...cashFlow }) => ({ ...cashFlow, id: publicId(cashFlow.id), ...(cashFlow.lotId ? { lotId: publicId(cashFlow.lotId) } : {}) })),
    risk: record.risk, documents: record.documents.map((document) => ({ ...document, id: publicId(document.id) })),
  }
}

function positionDetailGaps(position: FixedIncomeCustodyReconciliation['positions'][number], record: FixedIncomePositionRecord): string[] {
  return [
    ...(!position.acquiredDate ? ['acquisition_date_missing'] : []), ...(!position.marketValueBRL ? ['market_value_missing'] : []),
    ...(!position.redemptionAmountBRL ? ['redemption_value_missing'] : []), ...(!position.product.issuer.conglomerate ? ['issuer_conglomerate_missing'] : []),
    ...(record.lots.length === 0 ? ['lots_missing'] : []), ...(record.cashFlows.length === 0 ? ['cash_flows_missing'] : []),
    ...(!record.risk ? ['risk_metrics_missing'] : []), ...(record.documents.length === 0 ? ['documents_missing'] : []),
    ...(record.calculations.length === 0 ? ['position_calculation_missing'] : []), 'current_comparable_rate_missing',
  ]
}

async function loadFixedIncomePortfolio(): Promise<{ fetchedAt: string; custody: CustodyPosition[]; reconciliation: FixedIncomeCustodyReconciliation }> {
  const config = await readOpenFinanceConfig()
  if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) throw new Error('MeuPluggy is not configured.')
  const [definitions, snapshot] = await Promise.all([
    readFixedIncomeCustodyDefinitions(),
    fetchPluggyCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds, config.pluggy.itemInstitutions),
  ])
  return { fetchedAt: snapshot.fetchedAt, custody: snapshot.positions, reconciliation: reconcilePluggyFixedIncomeCustody(snapshot, definitions) }
}

function publicPosition<T extends { id: string; source: { positionId: string } }>(position: T): T & { id: string } {
  return redactExternalIdentifiers({ ...position, id: publicId(position.id) })
}
function publicUnclassifiedPosition(position: CustodyPosition) {
  return { id: publicId(position.id), name: position.name, code: position.code ?? null, type: position.type ?? null, value: position.value ?? null, currency: position.currency, institution: position.institution ?? null, asOf: position.asOf ?? null, classification: null }
}
function publicId(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24) }

function redactExternalIdentifiers<T>(value: T, key = ''): T {
  if (typeof value === 'string' && ['resourceId', 'resourceRevisionId', 'positionId', 'opportunityId', 'recommendationId', 'eventId', 'externalId', 'cvmCode'].includes(key)) {
    return `redacted:${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)}` as T
  }
  if (Array.isArray(value)) return value.map((entry) => redactExternalIdentifiers(entry)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactExternalIdentifiers(entryValue, entryKey)])) as T
  }
  return value
}
