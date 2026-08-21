import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { aliceInvestApi, type AliceInvestSnapshot, type FixedIncomeCreditAnalysisView, type FixedIncomeCvmEvidenceView, type FixedIncomeDocumentInspectionView, type FixedIncomeHealthView, type FixedIncomeHistoryView, type FixedIncomeOpportunitiesView, type FixedIncomePositionDetailView, type FixedIncomePositionsView, type FixedIncomeShadowView, type FixedIncomeSwitchView, type FixedIncomeWorkspaceOverview } from '../api/alice-invest'
import { openFinanceApi, type FixedIncomeSummary } from '../api/open-finance'

const capabilities = ['global', 'fixed_income', 'b3_signals', 'crypto_signals']
const sections = [
  ['overview', 'Visão geral'], ['positions', 'Posições'], ['opportunities', 'Oportunidades'], ['simulator', 'Simulador'],
  ['credit', 'Crédito'], ['limits', 'Limites'], ['history', 'Histórico'], ['sources', 'Fontes'], ['operations', 'Operação'],
] as const
type Section = typeof sections[number][0]

export function AliceInvestPage() {
  const [snapshot, setSnapshot] = useState<AliceInvestSnapshot | null>(null)
  const [fixedIncome, setFixedIncome] = useState<FixedIncomeWorkspaceOverview | null>(null)
  const [portfolio, setPortfolio] = useState<FixedIncomeSummary | null>(null)
  const [history, setHistory] = useState<FixedIncomeHistoryView | null>(null)
  const [opportunities, setOpportunities] = useState<FixedIncomeOpportunitiesView | null>(null)
  const [shadow, setShadow] = useState<FixedIncomeShadowView | null>(null)
  const [health, setHealth] = useState<FixedIncomeHealthView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [section, setSection] = useState<Section>('overview')
  useEffect(() => {
    void Promise.allSettled([aliceInvestApi.load(), aliceInvestApi.fixedIncomeOverview(), openFinanceApi.fixedIncomeSummary(), aliceInvestApi.fixedIncomeHistory(), aliceInvestApi.fixedIncomeOpportunities(), aliceInvestApi.fixedIncomeShadowValidation(), aliceInvestApi.fixedIncomeHealth()]).then(([readiness, overview, summary, operations, offers, validation, monitorHealth]) => {
      if (readiness.status === 'fulfilled') setSnapshot(readiness.value)
      if (overview.status === 'fulfilled') setFixedIncome(overview.value)
      if (summary.status === 'fulfilled') setPortfolio(summary.value)
      if (operations.status === 'fulfilled') setHistory(operations.value)
      if (offers.status === 'fulfilled') setOpportunities(offers.value)
      if (validation.status === 'fulfilled') setShadow(validation.value)
      if (monitorHealth.status === 'fulfilled') setHealth(monitorHealth.value)
      if ([readiness, overview, summary, operations, offers, validation, monitorHealth].some((result) => result.status === 'rejected')) setLoadFailed(true)
    })
  }, [])
  return <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
    <PageHeader title="Alice Invest · Renda Fixa" description="Pesquisa reproduzível, risco e simulações. Nenhuma ordem financeira pode ser executada nesta superfície." />
    <nav aria-label="Seções de renda fixa" className="shrink-0 overflow-x-auto border-b border-border bg-background px-4 md:px-6">
      <div className="flex min-w-max gap-1 py-2">{sections.map(([id, label]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={`oa-pressable rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${section === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{label}</button>)}</div>
    </nav>
    <div role="region" aria-label="Conteúdo de renda fixa" tabIndex={0} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 md:px-8"><div className="mx-auto min-w-0 max-w-6xl space-y-5">
      {loadFailed && <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">Parte dos dados não pôde ser carregada. Nenhuma capacidade deve ser tratada como pronta, e dados ausentes não foram estimados.</p>}
      {section === 'overview' && <Overview fixedIncome={fixedIncome} portfolio={portfolio} snapshot={snapshot} />}
      {section === 'positions' && <Positions portfolio={portfolio} />}
      {section === 'opportunities' && <Opportunities view={opportunities} />}
      {section === 'simulator' && <SwitchSimulator />}
      {section === 'credit' && <PrivateCreditEvidence />}
      {section === 'limits' && <Limits fixedIncome={fixedIncome} portfolio={portfolio} />}
      {section === 'history' && <History history={history} />}
      {section === 'sources' && <Sources fixedIncome={fixedIncome} />}
      {section === 'operations' && <Operations snapshot={snapshot} shadow={shadow} health={health} loadFailed={loadFailed} />}
    </div></div>
  </div>
}

function PrivateCreditEvidence() {
  const [cvmCode, setCvmCode] = useState('')
  const [year, setYear] = useState(String(new Date().getUTCFullYear()))
  const [view, setView] = useState<FixedIncomeCvmEvidenceView | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [documentView, setDocumentView] = useState<FixedIncomeDocumentInspectionView | null>(null)
  const [documentError, setDocumentError] = useState('')
  const [documentLoading, setDocumentLoading] = useState(false)
  const [issuer, setIssuer] = useState('')
  const [productType, setProductType] = useState<'debenture' | 'debenture_incentivada' | 'cri' | 'cra'>('debenture')
  const [advertisedYield, setAdvertisedYield] = useState('14')
  const [sovereignYield, setSovereignYield] = useState('11')
  const [score, setScore] = useState('70')
  const [confidence, setConfidence] = useState('70')
  const [analysis, setAnalysis] = useState<FixedIncomeCreditAnalysisView | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  async function fetchEvidence() {
    setLoading(true); setError(''); setView(null)
    try { setView(await aliceInvestApi.fixedIncomeCvmEvidence(cvmCode, year)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }
  async function inspectDocument(file: File) {
    setDocumentLoading(true); setDocumentError(''); setDocumentView(null)
    try {
      const contentType = supportedDocumentType(file.type)
      const contentBase64 = await fileBase64(file)
      const now = new Date().toISOString()
      setDocumentView(await aliceInvestApi.inspectFixedIncomeDocument({ fileName: file.name, contentType, contentBase64, sourceKind: 'user_supplied', sourceUrl: `https://openalice.local/user-upload/${encodeURIComponent(file.name)}`, observedAt: now, dataAsOf: now.slice(0, 10), termsReviewedAt: now.slice(0, 10) }))
    } catch (reason) { setDocumentError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setDocumentLoading(false) }
  }
  async function runAnalysis() {
    setAnalysisLoading(true); setAnalysisError(''); setAnalysis(null)
    const today = new Date().toISOString().slice(0, 10)
    const maturity = `${Number(today.slice(0, 4)) + 5}${today.slice(4)}`
    const evidence = documentView ? [{ id: 'uploaded-document', documentType: 'reviewed_document', documentHash: documentView.document.documentHash, locator: documentView.document.pageCount ? 'page:1' : 'text:0' }] : []
    const securitized = productType === 'cri' || productType === 'cra'
    try {
      setAnalysis(await aliceInvestApi.analyzeFixedIncomeCredit({
        asset: { id: `${productType}:${issuer.trim() || 'unidentified'}`, productType, issuer: { id: issuer.trim() || 'unidentified', legalName: issuer.trim() || 'Emissor não identificado', sector: 'não informado' }, instrument: { series: 'série informada pelo usuário', issueDate: today, maturityDate: maturity, seniority: 'unknown', guarantees: [], covenants: [], trustee: 'não informado', earlyRedemption: 'unknown', secondaryLiquidity: 'unknown' }, ...(securitized ? { securitization: { obligorIds: ['não identificado'], collateralDescription: 'não informada', poolConcentrationPct: '0', subordinationPct: '0', overcollateralizationPct: '0', reserveAccountPct: '0', waterfallDocumented: false, servicer: 'não informado' } } : {}) },
        advertisedYieldPct: advertisedYield, comparableSovereignYieldPct: sovereignYield, expectedLossLowPct: '0.5', expectedLossHighPct: '2', liquidityPremiumPct: '0.5', concentrationPenaltyPct: '0.5', uncertaintyMarginPct: '0.5',
        componentScores: { issuer: Number(score), instrument: Number(score), ...(securitized ? { structure: Number(score), collateral: Number(score) } : {}), guarantees: Number(score), liquidity: null, documentation: documentView ? Number(score) : 0, confidence: Number(confidence) },
        requiredDocumentTypes: ['reviewed_document'], evidence, criticalEvents: [], minimumScore: 65, minimumConfidence: 70,
      }))
    } catch (reason) { setAnalysisError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setAnalysisLoading(false) }
  }
  return <div className="space-y-4">
    <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Evidências oficiais CVM</h2><p className="mt-1 text-xs text-muted-foreground">Informe o código CVM explicitamente. O sistema consulta DFP do ano anterior e ITR/IPE do ano informado, preserva o hash dos arquivos e não transforma documentos em score automaticamente.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]"><label className="text-xs text-muted-foreground">Código CVM<input aria-label="Código CVM" inputMode="numeric" pattern="[0-9]*" className="input mt-1 w-full" value={cvmCode} onChange={(event) => setCvmCode(event.target.value.replace(/\D/g, '').slice(0, 12))} /></label><label className="text-xs text-muted-foreground">Ano<input aria-label="Ano CVM" inputMode="numeric" className="input mt-1 w-full" value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label><button type="button" className="oa-pressable self-end rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50" disabled={loading || !/^\d{1,12}$/.test(cvmCode) || !/^20\d{2}$/.test(year)} onClick={() => void fetchEvidence()}>{loading ? 'Consultando…' : 'Consultar sem recomendar'}</button></div>{error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}</section>
    {view && <section className="rounded-2xl border border-border bg-secondary/30 p-5"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Qualidade" value={`${view.snapshot.quality.score}%`} detail={view.snapshot.quality.criticalFieldsMissing.join(' / ') || 'famílias oficiais presentes'} /><Metric label="Confiança" value={`${view.snapshot.quality.confidence}%`} detail="Cobertura documental, não rating" /><Metric label="Documentos" value={`${view.snapshot.payload.statements.length + view.snapshot.payload.events.length}`} detail={`${view.snapshot.payload.statements.length} linhas financeiras · ${view.snapshot.payload.events.length} eventos`} /></div><div className="mt-4 space-y-2">{view.snapshot.provenance.map((source) => <article key={source.rawPayloadChecksum} className="rounded-xl border border-border bg-background p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-foreground">{source.publisher}</span><span className="text-muted-foreground">base {source.dataAsOf}</span></div><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {source.rawPayloadChecksum}</p></article>)}</div></section>}
    <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Inspecionar documento</h2><p className="mt-1 text-xs text-muted-foreground">PDF, texto, CSV, JSON ou HTML passivo; máximo 10 MiB. A inspeção não persiste o arquivo e todo texto permanece não confiável.</p><label className="mt-4 block text-xs text-muted-foreground">Documento<input aria-label="Documento de crédito" type="file" accept=".pdf,.txt,.csv,.json,.html,application/pdf,text/plain,text/csv,application/json,text/html" disabled={documentLoading} className="mt-1 block w-full text-xs" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectDocument(file) }} /></label>{documentLoading && <p role="status" className="mt-3 text-xs text-muted-foreground">Extraindo com limites…</p>}{documentError && <p role="alert" className="mt-3 text-xs text-destructive">{documentError}</p>}{documentView && <div className="mt-4 rounded-xl border border-border bg-background p-4 text-xs"><dl className="grid gap-2 sm:grid-cols-2"><Row label="Estado" value={documentView.document.extractionState} /><Row label="Páginas" value={String(documentView.document.pageCount ?? 'n/a')} /><Row label="Confiança" value={documentView.document.trust} /><Row label="Sinais" value={documentView.document.securitySignals.join(', ') || 'nenhum padrão detectado'} /></dl><p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {documentView.document.documentHash}</p>{documentView.document.extractedText && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-[11px] text-muted-foreground">{documentView.document.extractedText.slice(0, 2_000)}</pre>}</div>}</section>
    <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Análise determinística guiada</h2><p className="mt-1 text-xs text-muted-foreground">Os scores abaixo são entradas humanas explícitas. O documento apenas vira evidência citável; seu texto não altera cálculos ou gates.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Emissor" value={issuer} onChange={setIssuer} /><label className="text-xs text-muted-foreground">Produto<select aria-label="Produto de crédito" className="input mt-1 w-full" value={productType} onChange={(event) => setProductType(event.target.value as typeof productType)}><option value="debenture">Debênture</option><option value="debenture_incentivada">Debênture incentivada</option><option value="cri">CRI</option><option value="cra">CRA</option></select></label><Field label="Taxa anunciada (% a.a.)" value={advertisedYield} onChange={setAdvertisedYield} /><Field label="Soberano comparável (% a.a.)" value={sovereignYield} onChange={setSovereignYield} /><Field label="Score dos componentes (0–100)" value={score} onChange={setScore} /><Field label="Confiança (0–100)" value={confidence} onChange={setConfidence} /></div><button type="button" className="oa-pressable mt-4 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50" disabled={analysisLoading || !issuer.trim()} onClick={() => void runAnalysis()}>{analysisLoading ? 'Analisando…' : 'Calcular parecer sem executar'}</button>{analysisError && <p role="alert" className="mt-3 text-xs text-destructive">{analysisError}</p>}{analysis && <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Resultado" value={creditDecision(analysis.decision)} detail={analysis.reasonCodes.join(' / ') || 'gates mínimos atendidos'} /><Metric label="Score determinístico" value={`${analysis.deterministicScore}/100`} detail={`confiança informada ${confidence}%`} /><Metric label="Prêmio ajustado" value={`${analysis.adjustedNetPremiumRangePct.low}% a ${analysis.adjustedNetPremiumRangePct.high}%`} detail={`Trace ${analysis.calculationTraceId.slice(0, 12)}…`} /></div>}</section>
  </div>
}

function Opportunities({ view }: { view: FixedIncomeOpportunitiesView | null }) {
  if (!view) return <Loading />
  if (view.opportunities.length === 0) return <EmptyState title="Nenhuma oferta confirmada" detail="Importe um arquivo privado BTG/AUVP ou registre uma confirmação com validade. Catálogos públicos permanecem apenas indicativos." />
  return <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Ofertas observadas</h2><p className="mt-1 text-xs text-muted-foreground">Disponibilidade confirmada expira em até duas horas; nenhum item pode ser comprado por esta interface.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{view.opportunities.map((offer) => <article key={offer.id} className="rounded-xl border border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-medium text-foreground">{offer.product.issuer.legalName}</h3><p className="text-xs text-muted-foreground">{offer.product.productType.replaceAll('_', ' ')} · vence {date(offer.product.maturityDate)}</p></div><span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{offer.availability}</span></div><dl className="mt-3 space-y-1 text-xs"><Row label="Taxa" value={rateLabel(offer.rate)} /><Row label="Aplicação mínima" value={offer.minimumBRL ? brl(Number(offer.minimumBRL)) : 'não informada'} /><Row label="FGC" value={offer.product.fgc.status} /><Row label="Fonte" value={offer.provenance.publisher} /></dl></article>)}</div></section>
}

function Overview({ fixedIncome, portfolio, snapshot }: { fixedIncome: FixedIncomeWorkspaceOverview | null; portfolio: FixedIncomeSummary | null; snapshot: AliceInvestSnapshot | null }) {
  const total = portfolio?.snapshot.positions.reduce((sum, position) => sum + (position.value ?? 0), 0) ?? null
  const entries = useMemo(() => portfolio ? Object.values(portfolio.ladder.buckets).flatMap((bucket) => bucket.entries) : [], [portfolio])
  const fixedReadiness = snapshot?.readiness.find((item) => item.capability === 'fixed_income')
  return <>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Carteira observada" value={total === null ? 'Carregando…' : brl(total)} detail={`${portfolio?.snapshot.positions.length ?? 0} posições de custódia`} />
      <Metric label="Reserva mínima" value={`${fixedIncome?.policy.liquidityReservePct ?? '20'}%`} detail="Gate do perfil moderado" />
      <Metric label="Cobertura FGC estimada" value={portfolio ? brl(Number(portfolio.fgc.estimatedCoverageAfterAggregateLimitBRL)) : 'Carregando…'} detail="Somente elegibilidade e grupo confirmados" />
      <Metric label="Readiness" value={fixedIncome?.readiness ?? 'carregando'} detail="Execução permanentemente indisponível" />
    </section>
    <section className="rounded-2xl border border-border bg-secondary/30 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">Mapa da carteira</h2><p className="mt-1 text-xs text-muted-foreground">Vencimentos e liquidez conhecidos, sem preencher lacunas.</p></div><span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">{entries.length} instrumentos classificados</span></div>
      {entries.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">Nenhum instrumento classificado.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{entries.slice(0, 6).map((entry) => <article key={entry.id} className="rounded-xl border border-border bg-background p-4"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-medium text-foreground">{entry.issuer}</h3><p className="text-xs text-muted-foreground">{entry.productType.replaceAll('_', ' ')} · vence {date(entry.maturityDate)}</p></div><span className="text-sm font-semibold text-foreground">{brl(Number(entry.currentAmountBRL))}</span></div><p className="mt-3 text-[11px] text-muted-foreground">Liquidez: {entry.liquidityDays} dias · líquido anual: {entry.annualNetRatePct ? `${entry.annualNetRatePct}%` : 'não disponível'}</p></article>)}</div>}
    </section>
    <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Derived readiness</h2><p className="mt-1 text-xs text-muted-foreground">Estado derivado de evidências duráveis, não da configuração.</p><p className="mt-3 text-xs text-muted-foreground">State: {fixedReadiness?.state ?? 'not_ready'} · blockers: {fixedReadiness?.blockers.join(' / ') || 'none recorded'}</p></section>
  </>
}

function Positions({ portfolio }: { portfolio: FixedIncomeSummary | null }) {
  const [positions, setPositions] = useState<FixedIncomePositionsView | null>(null)
  const [detail, setDetail] = useState<FixedIncomePositionDetailView | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void aliceInvestApi.fixedIncomePositions().then(setPositions).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))) }, [])
  async function openDetail(id: string) {
    setError(''); setDetail(null)
    try { setDetail(await aliceInvestApi.fixedIncomePositionDetail(id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  if (!portfolio || !positions) return <Loading />
  return <div className="space-y-4"><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Posições conciliadas</h2><p className="mt-1 text-xs text-muted-foreground">MeuPluggy informa custódia; instituição, FGC e conglomerado só valem quando confirmados por evidência.</p>{error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2">Produto</th><th className="pb-2">Emissor</th><th className="pb-2">Valor atual</th><th className="pb-2">Vencimento</th><th className="pb-2"><span className="sr-only">Ação</span></th></tr></thead><tbody>{positions.positions.map((position) => <tr key={position.id} className="border-t border-border"><td className="py-3 font-medium text-foreground">{position.product.productType.replaceAll('_', ' ')}</td><td>{position.product.issuer.legalName}</td><td>{brl(Number(position.currentAmountBRL))}</td><td>{date(position.product.maturityDate)}</td><td className="text-right"><button type="button" className="oa-pressable rounded-md border border-border px-2 py-1 font-medium" onClick={() => void openDetail(position.id)}>Ver cálculo</button></td></tr>)}</tbody></table></div>{positions.unclassified.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{positions.unclassified.length} posição(ões) permanecem sem classificação e não entram em cálculos.</p>}</section>{detail && <PositionDetail detail={detail} onClose={() => setDetail(null)} />}</div>
}

function PositionDetail({ detail, onClose }: { detail: FixedIncomePositionDetailView; onClose: () => void }) {
  const position = detail.position
  const latest = detail.calculationMemory.latest
  return <section aria-label="Detalhe da posição" className="space-y-4 rounded-2xl border border-border bg-secondary/30 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">{position.product.issuer.legalName}</h2><p className="mt-1 text-xs text-muted-foreground">{position.product.productType.replaceAll('_', ' ')} · somente leitura</p></div><button type="button" className="oa-pressable rounded-md border border-border px-2 py-1 text-xs" onClick={onClose}>Fechar</button></div>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Row label="Conglomerado" value={position.product.issuer.conglomerate ?? 'não confirmado'} /><Row label="Custodiante / origem" value={position.source.provider} /><Row label="Investido" value={brl(Number(position.investedAmountBRL))} /><Row label="Valor atual" value={brl(Number(position.currentAmountBRL))} /><Row label="Valor de mercado" value={position.marketValueBRL ? brl(Number(position.marketValueBRL)) : 'não informado'} /><Row label="Valor de resgate" value={position.redemptionAmountBRL ? brl(Number(position.redemptionAmountBRL)) : 'não informado'} /><Row label="Aquisição" value={position.acquiredDate ? date(position.acquiredDate) : 'não informada'} /><Row label="Vencimento" value={date(position.product.maturityDate)} /><Row label="Taxa contratada" value={rateLabel({ ...position.product.rate } as FixedIncomeOpportunitiesView['opportunities'][number]['rate'])} /><Row label="Liquidez" value={`${position.product.liquidity.redemption.replaceAll('_', ' ')} · D+${position.product.liquidity.settlementBusinessDays} · carência ${position.product.liquidity.noticeBusinessDays} dia(s)`} /><Row label="FGC" value={position.product.fgc.status} /><Row label="Taxas" value={`adm. ${position.product.fees.administrationAnnualPct}% · saída ${position.product.fees.exitPct}%`} /><Row label="Data-base" value={date(position.custodyAsOf)} /></dl>
    <DetailTable title="Lotes" empty="Nenhum lote documentado." headings={['Aquisição', 'Quantidade', 'Custo unitário', 'Custo total', 'Taxas']} rows={detail.detail.lots.map((lot) => [date(lot.acquisitionDate), lot.quantity, brl(Number(lot.unitCostBRL)), brl(Number(lot.totalCostBRL)), brl(Number(lot.accruedFeesBRL))])} />
    <DetailTable title="Fluxos de caixa" empty="Nenhum fluxo documentado." headings={['Data', 'Tipo', 'Valor bruto', 'Estado']} rows={detail.detail.cashFlows.map((flow) => [date(flow.date), flow.kind, brl(Number(flow.grossBRL)), flow.status])} />
    <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border bg-background p-3 text-xs"><p className="font-medium text-foreground">Risco e metodologia</p>{detail.detail.risk ? <dl className="mt-3 grid gap-2 sm:grid-cols-2"><Row label="Duration" value={detail.detail.risk.durationYears ?? 'não disponível'} /><Row label="DV01" value={detail.detail.risk.dv01BRL ? brl(Number(detail.detail.risk.dv01BRL)) : 'não disponível'} /><Row label="Crédito" value={scoreLabel(detail.detail.risk.creditScore)} /><Row label="Liquidez" value={scoreLabel(detail.detail.risk.liquidityScore)} /><Row label="Estrutural" value={scoreLabel(detail.detail.risk.structuralScore)} /><Row label="Confiança" value={scoreLabel(detail.detail.risk.confidenceScore)} /></dl> : <p className="mt-2 text-muted-foreground">Métricas ainda não documentadas.</p>}</div><div className="rounded-xl border border-border bg-background p-3 text-xs"><p className="font-medium text-foreground">Documentos vinculados</p>{detail.detail.documents.length ? <ul className="mt-2 space-y-2 text-muted-foreground">{detail.detail.documents.map((document) => <li key={document.id}><a className="underline" href={document.sourceUrl} target="_blank" rel="noreferrer">{document.documentType}</a><span className="block break-all">SHA-256 {document.documentHash}</span></li>)}</ul> : <p className="mt-2 text-muted-foreground">Nenhum documento vinculado.</p>}</div></div>
    <div className="rounded-xl border border-border bg-background p-3 text-xs"><p className="font-medium text-foreground">Memória de cálculo</p>{latest ? <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Row label="Decisão" value={latest.decision} /><Row label="Diferença líquida" value={brl(Number(latest.netDeltaBRL))} /><Row label="Uplift anual" value={`${latest.annualizedUpliftPct}%`} /><Row label="Break-even" value={`${latest.breakEvenAnnualNetRatePct}% a.a.`} /><Row label="Data do cálculo" value={date(latest.calculatedAt)} /><Row label="Trace" value={latest.calculationTraceId} /></dl> : <p className="mt-1 text-muted-foreground">{detail.calculationMemory.reason ?? 'Ainda não produzida.'}</p>}<p className="mt-2 text-muted-foreground">{detail.calculationMemory.history.length} cálculo(s) associado(s) · {detail.recommendationHistory.length} revisão(ões) manual(is).</p></div>
    {detail.gaps.length > 0 && <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"><p className="font-medium text-foreground">Dados ausentes</p><ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">{detail.gaps.map((gap) => <li key={gap}>{gap.replaceAll('_', ' ')}</li>)}</ul></div>}
  </section>
}

function DetailTable({ title, empty, headings, rows }: { title: string; empty: string; headings: string[]; rows: string[][] }) {
  return <div className="rounded-xl border border-border bg-background p-3"><h3 className="text-xs font-medium text-foreground">{title}</h3>{rows.length ? <div aria-label={`Tabela: ${title}`} className="mt-2 overflow-x-auto" role="region" tabIndex={0}><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-muted-foreground"><tr>{headings.map((heading) => <th key={heading} className="pb-2 pr-3">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`} className="border-t border-border">{row.map((value, cell) => <td key={`${index}-${cell}`} className="py-2 pr-3">{value}</td>)}</tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-muted-foreground">{empty}</p>}</div>
}

function scoreLabel(value: number | null) { return value === null ? 'não disponível' : `${value}/100` }

function SwitchSimulator() {
  const [positions, setPositions] = useState<FixedIncomePositionsView['positions']>([])
  const [positionId, setPositionId] = useState('')
  const [sale, setSale] = useState('130000')
  const [replacementRate, setReplacementRate] = useState('10.5')
  const [result, setResult] = useState<FixedIncomeSwitchView | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  useEffect(() => { void aliceInvestApi.fixedIncomePositions().then((view) => { setPositions(view.positions); setPositionId(view.positions[0]?.id ?? '') }).catch(() => undefined) }, [])
  async function simulate() {
    setRunning(true); setError(''); setResult(null)
    try {
      const asOf = new Date().toISOString()
      const validUntil = new Date(Date.now() + 30 * 60 * 1_000).toISOString()
      setResult(await aliceInvestApi.simulateFixedIncomeSwitch({
        ...(positionId ? { positionId } : {}), asOf, targetDate: '2031-08-20', sellFraction: '1', sameInstrument: false,
        hold: { principalBRL: '100000', annualIndexPct: '4', annualSpreadPct: '6', yearsFromAcquisition: '7', incomeTaxRate: '0.15', futureCostsBRL: '1500' },
        sale: { grossProceedsBRL: sale, realizedIncomeTaxBRL: '4500', exitCostsBRL: '260' },
        replacement: { annualRatePct: replacementRate, years: '5', incomeTaxRate: '0', costsBRL: '0', availability: 'confirmed', validUntil, fgcConfirmed: true },
        constraints: { portfolioTotalBRL: '600000', liquidReserveAfterBRL: '125000', minimumReservePct: '20', concentrationValid: true, dataQuality: '95', minimumDataQuality: '85', confidence: '90', minimumConfidence: '80', uncertaintyBRL: '5000', minimumBenefitUncertaintyRatio: '2', minimumBenefitBRL: '100', criticalDataFresh: true },
        sources: [{ publisher: 'User-entered synthetic scenario', sourceId: 'ui-synthetic-scenario', sourceUrl: 'https://openalice.local/alice-invest/fixed-income/simulator', decision: 'manual', access: 'user_supplied', method: 'manual_upload', parameters: {}, license: 'user_supplied', termsReviewedAt: asOf.slice(0, 10), termsVersion: 'synthetic-scenario@1', retrievedAt: asOf, dataAsOf: asOf, rawPayloadChecksum: '0'.repeat(64), parserVersion: 'ui-fixed-income-simulator@1', originalIdentifiers: {} }],
      }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setRunning(false) }
  }
  return <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Simulador manter × vender × reinvestir</h2><p className="mt-1 text-xs text-muted-foreground">Caso sintético editável. Quando uma posição é escolhida, a memória do cálculo fica associada a ela. A saída é sempre research_only.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-muted-foreground">Posição associada<select aria-label="Posição associada" className="input mt-1 w-full" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="">Nenhuma</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.product.issuer.legalName} · {position.product.productType.replaceAll('_', ' ')}</option>)}</select></label><label className="text-xs text-muted-foreground">Preço bruto de venda (R$)<input aria-label="Preço bruto de venda" className="input mt-1 w-full" value={sale} onChange={(event) => setSale(event.target.value)} /></label><label className="text-xs text-muted-foreground">Taxa da alternativa (% a.a.)<input aria-label="Taxa da alternativa" className="input mt-1 w-full" value={replacementRate} onChange={(event) => setReplacementRate(event.target.value)} /></label></div><button type="button" className="oa-pressable mt-4 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50" disabled={running} onClick={() => void simulate()}>{running ? 'Calculando…' : 'Simular sem executar'}</button>{error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}{result && <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Decisão do motor" value={result.decision} detail="Não acionável" /><Metric label="Diferença líquida" value={brl(Number(result.delta.netBRL))} detail={`${result.delta.annualizedUpliftPct}% a.a.`} /><Metric label="Gates" value={`${result.constraints.filter((gate) => gate.passed).length}/${result.constraints.length}`} detail={`Trace ${result.calculationTraceId.slice(0, 12)}…`} /></div>}</section>
}

function Limits({ fixedIncome, portfolio }: { fixedIncome: FixedIncomeWorkspaceOverview | null; portfolio: FixedIncomeSummary | null }) {
  return <div className="grid gap-4 md:grid-cols-2"><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Política moderada</h2><dl className="mt-4 space-y-3 text-xs"><Row label="Reserva D+0/D+1" value={`mínimo ${fixedIncome?.policy.liquidityReservePct ?? '20'}%`} /><Row label="FGC por conglomerado" value="menor entre 15% e R$ 225 mil" /><Row label="Crédito privado" value="máximo 35%" /><Row label="Ativos ilíquidos" value="máximo 40%" /></dl></section><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">FGC por conglomerado</h2>{portfolio?.fgc.groups.length ? <div className="mt-4 space-y-3">{portfolio.fgc.groups.map((group) => <div key={group.conglomerate} className="rounded-xl border border-border bg-background p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-medium text-foreground">{group.conglomerate}</span><span>{brl(Number(group.eligibleAmountBRL))}</span></div><p className="mt-1 text-muted-foreground">Descoberto estimado: {brl(Number(group.estimatedUncoveredBRL))}</p></div>)}</div> : <p className="mt-4 text-xs text-muted-foreground">Sem exposição confirmada.</p>}</section></div>
}

function Sources({ fixedIncome }: { fixedIncome: FixedIncomeWorkspaceOverview | null }) {
  if (!fixedIncome) return <Loading />
  return <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Estado das fontes</h2><p className="mt-1 text-xs text-muted-foreground">Automação oficial, importação manual e confirmação de oferta são estados diferentes.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{fixedIncome.sourceStates.map((source) => <article key={source.id} className="rounded-xl border border-border bg-background p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-foreground">{source.label}</h3><span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{source.state.replaceAll('_', ' ')}</span></div><p className="mt-2 text-xs text-muted-foreground">{source.mode.replaceAll('_', ' ')} · {source.freshness.replaceAll('_', ' ')}</p></article>)}</div></section>
}

function History({ history }: { history: FixedIncomeHistoryView | null }) {
  if (!history) return <Loading />
  const events = [
    ...history.history.manualOutcomes.map((item) => ({ id: `outcome:${item.recommendationId}`, at: item.recordedAt, title: `Resultado manual: ${item.outcome}`, detail: item.note ?? 'Sem observação adicional.' })),
    ...history.history.audit.map((item) => ({ id: item.id, at: item.at, title: item.kind.replaceAll('_', ' '), detail: item.detail })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  if (events.length === 0) return <EmptyState title="Sem decisões registradas" detail="Simulações não são execução. Resultados manuais e revisões aparecerão aqui quando forem explicitamente registrados." />
  return <section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Histórico operacional</h2><div className="mt-4 space-y-3">{events.map((event) => <article key={`${event.id}:${event.at}`} className="border-b border-border pb-3 last:border-0"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-xs font-medium text-foreground">{event.title}</h3><time className="text-[11px] tabular-nums text-muted-foreground">{event.at}</time></div><p className="mt-1 text-xs text-muted-foreground">{event.detail}</p></article>)}</div></section>
}

function Operations({ snapshot, shadow, health, loadFailed }: { snapshot: AliceInvestSnapshot | null; shadow: FixedIncomeShadowView | null; health: FixedIncomeHealthView | null; loadFailed: boolean }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Shadow validation</h2>{shadow ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Dias reais" value={`${shadow.distinctObservationDays}/30`} detail={`${shadow.observationCount} observações persistidas`} /><Metric label="Estado" value={shadow.state} detail={shadow.blockers.join(' / ') || 'sem bloqueios métricos'} /><Metric label="Falsos positivos" value={`${shadow.metrics.falsePositiveRatePct}%`} detail={`${shadow.metrics.falsePositives}/${shadow.metrics.reviewedAlerts} revisados`} /></div> : <Loading />}</section><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Monitor de renda fixa</h2>{health ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Monitor" value={health.monitor.enabled ? health.state : 'desativado'} detail={health.monitor.circuitState.replaceAll('_', ' ')} /><Metric label="Notificações" value={health.monitor.notificationsEnabled ? 'habilitadas' : 'desabilitadas'} detail={`${health.operations.deliveries} entregas persistidas`} /><Metric label="Último evento" value={health.monitor.lastEvent?.kind ?? 'nenhum'} detail={health.monitor.lastEvent?.at ?? 'sem execução registrada'} /></div> : <Loading />}</section><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Derived readiness</h2>{loadFailed ? <p className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">Readiness could not be loaded. No capability should be treated as ready.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{capabilities.map((capability) => { const view = snapshot?.readiness.find((item) => item.capability === capability); return <div key={capability} className="rounded-lg border border-border bg-background p-3"><p className="font-mono text-xs text-foreground">{capability}</p><p className="mt-1 text-xs text-muted-foreground">State: {view?.state ?? 'not_ready'}</p>{view?.evidence.map((item) => <p key={`${item.criterion}-${item.observedAt}`} className="mt-1 text-xs text-muted-foreground">{item.criterion}: {item.status} - {item.source} at {item.observedAt}</p>)}</div> })}</div>}</section><section className="rounded-2xl border border-border bg-secondary/30 p-5"><h2 className="text-sm font-semibold text-foreground">Configuration and kill switches</h2><p className="mt-2 text-xs text-muted-foreground">{snapshot ? Object.entries(snapshot.switches).map(([name, enabled]) => `${name}: ${enabled ? 'on' : 'off'}`).join(' / ') : 'Loading switches'}.</p><p className="mt-2 text-xs text-muted-foreground">Execution is permanently unavailable in Alice Invest.</p></section></div>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-xl border border-border bg-background p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 break-words text-xl font-semibold text-foreground">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div> }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-muted-foreground">{label}<input aria-label={label} className="input mt-1 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label> }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <section className="rounded-2xl border border-dashed border-border bg-secondary/20 p-8 text-center"><h2 className="text-sm font-semibold text-foreground">{title}</h2><p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">{detail}</p></section> }
function Loading() { return <p className="rounded-xl border border-border bg-secondary/30 p-5 text-xs text-muted-foreground">Carregando dados com proveniência…</p> }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 justify-between gap-4 border-b border-border pb-2"><dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="min-w-0 break-all text-right font-medium text-foreground">{value}</dd></div> }
function brl(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) }
function date(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`)) }
function rateLabel(rate: FixedIncomeOpportunitiesView['opportunities'][number]['rate']) { return rate.annualRatePct ? `${rate.annualRatePct}% a.a.` : rate.cdiPct ? `${rate.cdiPct}% do CDI` : rate.spreadPct ? `+ ${rate.spreadPct}% a.a.` : rate.kind.replaceAll('_', ' ') }
function creditDecision(value: FixedIncomeCreditAnalysisView['decision']) { return ({ watch: 'observar', avoid: 'evitar', review_credit: 'revisar crédito', insufficient_data: 'dados insuficientes' } as const)[value] }
function supportedDocumentType(value: string): 'text/plain' | 'text/csv' | 'application/json' | 'text/html' | 'application/pdf' {
  if (['text/plain', 'text/csv', 'application/json', 'text/html', 'application/pdf'].includes(value)) return value as 'text/plain' | 'text/csv' | 'application/json' | 'text/html' | 'application/pdf'
  throw new Error('Tipo de documento não suportado.')
}
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o documento.'))
    reader.onload = () => { const result = String(reader.result ?? ''); const comma = result.indexOf(','); if (comma < 0) reject(new Error('Documento inválido.')); else resolve(result.slice(comma + 1)) }
    reader.readAsDataURL(file)
  })
}
