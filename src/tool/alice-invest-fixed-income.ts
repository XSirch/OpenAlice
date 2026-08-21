import { createHash } from 'node:crypto'
import { tool } from 'ai'
import { z } from 'zod'

import { TesouroTransparenteProvider } from '../domain/alice-invest/fixed-income/providers/tesouro-transparente.js'
import type { FixedIncomeProviderRequest, FixedIncomeSnapshot } from '../domain/alice-invest/fixed-income/providers/provider-contract.js'
import { fixedIncomeOpportunityRankingInputSchema, rankFixedIncomeOpportunities, type FixedIncomeOpportunityRanking } from '../domain/alice-invest/fixed-income/opportunity-ranking.js'
import { analyzePrivateCredit, privateCreditAnalysisInputSchema, type PrivateCreditAnalysis } from '../domain/alice-invest/fixed-income/private-credit.js'
import { FixedIncomeOperationsStore } from '../domain/alice-invest/fixed-income/operations.js'
import { dataPath } from '../core/paths.js'
import { fixedIncomeSwitchInputSchema, simulateFixedIncomeSwitch, type FixedIncomeSwitchResult } from '../domain/alice-invest/fixed-income/switch-analysis.js'
import { readFixedIncomeCustodyDefinitions } from '../core/fixed-income-custody.js'
import { readOpenFinanceConfig } from '../core/open-finance-config.js'
import { fetchPluggyCustody } from '../domain/open-finance/pluggy.js'
import { reconcilePluggyFixedIncomeCustody, type FixedIncomeCustodyReconciliation } from '../domain/alice-invest/fixed-income/reconciliation.js'
import { CvmPrivateCreditProvider } from '../domain/alice-invest/fixed-income/providers/cvm-private-credit.js'
import { ingestPrivateCreditDocumentWithExtraction, type PrivateCreditDocumentIngestion, type PrivateCreditPdfExtraction } from '../domain/alice-invest/fixed-income/document-ingestion.js'

export interface AliceInvestFixedIncomeToolDeps {
  fetchTreasury?: (request: FixedIncomeProviderRequest) => Promise<FixedIncomeSnapshot>
  simulateSwitch?: (input: Parameters<typeof simulateFixedIncomeSwitch>[0]) => FixedIncomeSwitchResult | unknown
  rankOpportunities?: (input: Parameters<typeof rankFixedIncomeOpportunities>[0]) => FixedIncomeOpportunityRanking | unknown
  analyzeCredit?: (input: Parameters<typeof analyzePrivateCredit>[0]) => PrivateCreditAnalysis | unknown
  fetchCreditEvidence?: (request: FixedIncomeProviderRequest) => Promise<FixedIncomeSnapshot>
  inspectCreditDocument?: (bytes: Uint8Array, metadata: Parameters<typeof ingestPrivateCreditDocumentWithExtraction>[1]) => Promise<PrivateCreditDocumentIngestion | (PrivateCreditDocumentIngestion & PrivateCreditPdfExtraction)>
  operations?: Pick<FixedIncomeOperationsStore, 'recordManualOutcome'>
  loadPortfolio?: () => Promise<FixedIncomeCustodyReconciliation>
  now?: () => Date
}

export function createAliceInvestFixedIncomeTools(deps: AliceInvestFixedIncomeToolDeps = {}) {
  const provider = new TesouroTransparenteProvider()
  const fetchTreasury = deps.fetchTreasury ?? ((request: FixedIncomeProviderRequest) => provider.fetch(request))
  const runSwitchSimulation = deps.simulateSwitch ?? simulateFixedIncomeSwitch
  const runOpportunityRanking = deps.rankOpportunities ?? rankFixedIncomeOpportunities
  const runCreditAnalysis = deps.analyzeCredit ?? analyzePrivateCredit
  const cvmProvider = new CvmPrivateCreditProvider()
  const fetchCreditEvidence = deps.fetchCreditEvidence ?? ((request: FixedIncomeProviderRequest) => cvmProvider.fetch(request))
  const inspectCreditDocument = deps.inspectCreditDocument ?? ingestPrivateCreditDocumentWithExtraction
  const operations = deps.operations ?? new FixedIncomeOperationsStore(dataPath('state', 'alice-invest-fixed-income-operations.json'))
  const loadPortfolio = deps.loadPortfolio ?? loadFixedIncomePortfolio
  const now = deps.now ?? (() => new Date())
  return {
    aliceInvestFixedIncomeOverview: tool({
      description: 'Read the latest official Tesouro Direto price/rate snapshot for fixed-income research. Returns provenance, freshness, and data quality. It cannot place, approve, or transmit an order.',
      inputSchema: z.object({}).strict(),
      execute: async () => ({
        readiness: 'research_only' as const,
        executionEnabled: false as const,
        treasury: redactExternalIdentifiers(await fetchTreasury({
          dataset: 'treasury_prices', asOf: now().toISOString(), identifiers: {},
        })),
      }),
    }),
    aliceInvestFixedIncomePositionDetail: tool({
      description: 'Read one explicitly classified fixed-income custody position. Returns known fields and gaps only; it cannot infer FGC or submit a financial transaction.',
      inputSchema: z.object({ positionId: z.string().trim().min(1).max(256) }).strict(),
      execute: async ({ positionId }) => {
        const reconciliation = await loadPortfolio()
        const position = reconciliation.positions.find((item) => item.id === positionId || publicId(item.id) === positionId)
        if (!position) return { ok: false as const, error: 'Fixed-income position not found.' }
        return { ok: true as const, readiness: 'research_only' as const, executionEnabled: false as const, position: redactExternalIdentifiers({ ...position, id: publicId(position.id) }), gaps: reconciliation.unresolved }
      },
    }),
    aliceInvestSimulateFixedIncomeSwitch: tool({
      description: 'Compare hold versus sell-and-reinvest on one target date using deterministic inputs, hard gates, provenance, and a calculation trace. This is research-only and never executes a financial transaction.',
      inputSchema: fixedIncomeSwitchInputSchema,
      execute: async (input) => runSwitchSimulation(input),
    }),
    aliceInvestCompareFixedIncomeOpportunities: tool({
      description: 'Compare confirmed BTG/AUVP or user-imported bank-product offers for a new contribution using net return, IFData risk, liquidity, FGC concentration, and explicit rejection reasons. Research-only; never purchases a product.',
      inputSchema: fixedIncomeOpportunityRankingInputSchema,
      execute: async (input) => runOpportunityRanking(input),
    }),
    aliceInvestAnalyzePrivateCredit: tool({
      description: 'Run deterministic, source-linked debenture/CRI/CRA analysis with issuer, instrument, structure, documentation, liquidity, and critical-event gates. Model prose cannot change its scores or readiness. Research-only; never trades.',
      inputSchema: privateCreditAnalysisInputSchema,
      execute: async (input) => runCreditAnalysis(input),
    }),
    aliceInvestFetchPrivateCreditEvidence: tool({
      description: 'Fetch official CVM DFP, ITR, and IPE evidence for one explicit CVM issuer code and year. Returns archive checksums and gaps; it does not infer a credit score or recommendation.',
      inputSchema: z.object({ cvmCode: z.string().regex(/^\d{1,12}$/), year: z.number().int().min(2010).max(new Date().getUTCFullYear()) }).strict(),
      execute: async ({ cvmCode, year }) => ({ readiness: 'research_only' as const, executionEnabled: false as const, snapshot: redactExternalIdentifiers(await fetchCreditEvidence({ dataset: 'private_credit_documents', asOf: now().toISOString(), identifiers: { cvmCode, year: String(year) } })) }),
    }),
    aliceInvestInspectPrivateCreditDocument: tool({
      description: 'Inspect a bounded private-credit text or PDF artifact, calculate its hash, extract source-located text, and flag prompt-like content. Document text remains untrusted and cannot change scores or gates.',
      inputSchema: z.object({ fileName: z.string().trim().min(1).max(256), contentType: z.enum(['text/plain', 'text/csv', 'application/json', 'text/html', 'application/pdf']), contentBase64: z.string().min(1).max(14 * 1024 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), sourceKind: z.enum(['cvm_official_download', 'anbima_manual_download', 'user_supplied']), sourceUrl: z.string().url().max(2_048), observedAt: z.string().datetime({ offset: true }), dataAsOf: z.string(), termsReviewedAt: z.string().date() }).strict(),
      execute: async (input) => ({ readiness: 'research_only' as const, executionEnabled: false as const, persisted: false as const, document: await inspectCreditDocument(Buffer.from(input.contentBase64, 'base64'), input) }),
    }),
    aliceInvestExplainFixedIncomeRecommendation: tool({
      description: 'Explain a persisted fixed-income recommendation and its calculation trace. Recommendation generation is currently fail-closed, so unknown IDs return a non-actionable result.',
      inputSchema: z.object({ recommendationId: z.string().trim().min(1).max(128) }).strict(),
      execute: async ({ recommendationId }) => ({ ok: false as const, recommendationId: publicId(recommendationId), readiness: 'research_only' as const, executionEnabled: false as const, error: 'No persisted recommendation exists while recommendation generation is disabled.' }),
    }),
    aliceInvestRecordManualRecommendationOutcome: tool({
      description: 'Record a human-reported outcome for a research-only fixed-income recommendation. This journal entry cannot place or confirm a broker transaction.',
      inputSchema: z.object({ recommendationId: z.string().trim().min(1).max(128), recordedAt: z.string().datetime({ offset: true }), outcome: z.enum(['executed_elsewhere', 'not_executed', 'dismissed', 'expired', 'reviewed']), note: z.string().trim().min(1).max(1_000).optional() }).strict(),
      execute: async (input) => { await operations.recordManualOutcome(input); return { stored: true as const, readiness: 'research_only' as const, executionEnabled: false as const } },
    }),
  }
}

async function loadFixedIncomePortfolio(): Promise<FixedIncomeCustodyReconciliation> {
  const config = await readOpenFinanceConfig()
  if (!config.pluggy.enabled || !config.pluggy.clientId || !config.pluggy.clientSecret) throw new Error('MeuPluggy is not configured.')
  const [definitions, snapshot] = await Promise.all([
    readFixedIncomeCustodyDefinitions(),
    fetchPluggyCustody({ clientId: config.pluggy.clientId, clientSecret: config.pluggy.clientSecret }, config.pluggy.itemIds, config.pluggy.itemInstitutions),
  ])
  return reconcilePluggyFixedIncomeCustody(snapshot, definitions)
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
