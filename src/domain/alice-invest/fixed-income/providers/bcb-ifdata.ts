import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'

import {
  createFixedIncomeSnapshot,
  fixedIncomeProviderRequestSchema,
  type FixedIncomeProvider,
  type FixedIncomeProviderRequest,
  type FixedIncomeSnapshot,
} from './provider-contract.js'
import type { FixedIncomeHttpClient, FixedIncomeHttpResponse } from './tesouro-transparente.js'

export type { FixedIncomeHttpClient } from './tesouro-transparente.js'

const BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata'
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024
const cadastroRowSchema = z.object({
  CodInst: z.string().min(1), Data: z.string().regex(/^\d{6}$/), NomeInstituicao: z.string().min(1), Situacao: z.string().min(1),
  CodConglomeradoFinanceiro: z.string().nullable().optional(), CodConglomeradoPrudencial: z.string().nullable().optional(),
  CnpjInstituicaoLider: z.string().nullable().optional(),
}).passthrough()
const valueRowSchema = z.object({
  CodInst: z.string().min(1), AnoMes: z.string().regex(/^\d{6}$/), NumeroRelatorio: z.literal('1'), Conta: z.string().min(1),
  NomeColuna: z.string().min(1), Saldo: z.string().regex(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/),
}).passthrough()

export interface BcbIfDataProviderOptions {
  http?: FixedIncomeHttpClient
  now?: () => Date
  validUntil?: (referencePeriod: string, observedAt: Date) => string
}

export class BcbIfDataProvider implements FixedIncomeProvider {
  readonly id = 'bcb-ifdata'
  private readonly http: FixedIncomeHttpClient
  private readonly now: () => Date
  private readonly validUntil: (referencePeriod: string, observedAt: Date) => string

  constructor(options: BcbIfDataProviderOptions = {}) {
    this.http = options.http ?? new IfDataFetchClient()
    this.now = options.now ?? (() => new Date())
    this.validUntil = options.validUntil ?? ((period, observedAt) => {
      const expected = nextIfDataPublicationDeadline(period)
      return new Date(Math.max(expected.getTime(), observedAt.getTime() + 1)).toISOString()
    })
  }

  async fetch(requestInput: FixedIncomeProviderRequest): Promise<FixedIncomeSnapshot> {
    const request = fixedIncomeProviderRequestSchema.parse(requestInput)
    if (request.dataset !== 'bank_financials') throw new Error(`unsupported BCB IFData dataset: ${request.dataset}`)
    const referencePeriod = requireIdentifier(request, 'referencePeriod', /^\d{4}(?:03|06|09|12)$/)
    const institutionCode = requireIdentifier(request, 'institutionCode', /^[A-Za-z0-9_-]{1,64}$/)
    const institutionType = requireIdentifier(request, 'institutionType', /^\d+$/)
    const escapedCode = institutionCode.replaceAll("'", "''")
    const cadastroUrl = `${BASE_URL}/IfDataCadastro(AnoMes=@AnoMes)?@AnoMes=${referencePeriod}&$filter=CodInst%20eq%20'${escapedCode}'&$format=json`
    const valuesUrl = `${BASE_URL}/IfDataValores(AnoMes=@AnoMes,TipoInstituicao=@TipoInstituicao,Relatorio=@Relatorio)?@AnoMes=${referencePeriod}&@TipoInstituicao=${institutionType}&@Relatorio='1'&$filter=CodInst%20eq%20'${escapedCode}'&$format=json`
    const cadastroResponse = await this.http.get(cadastroUrl)
    const valuesResponse = await this.http.get(valuesUrl)
    const cadastroRaw = responseText(cadastroResponse, 'cadastro')
    const valuesRaw = responseText(valuesResponse, 'values')
    const cadastro = parseEnvelope(cadastroRaw, cadastroRowSchema)
    const rows = parseEnvelope(quoteSaldoNumbers(valuesRaw), valueRowSchema)
    if (cadastro.length !== 1) throw new Error('BCB IFData must return exactly one cadastro row for the requested institution')
    if (rows.length === 0) throw new Error('BCB IFData returned no report rows for the requested institution')
    const institution = cadastro[0]!
    if (institution.Data !== referencePeriod || institution.CodInst !== institutionCode) throw new Error('BCB IFData cadastro identifiers do not match the request')
    if (rows.some((row) => row.AnoMes !== referencePeriod || row.CodInst !== institutionCode)) throw new Error('BCB IFData report identifiers do not match the request')
    const balances = new Map(rows.map((row) => [row.Conta, row.Saldo]))
    const required = ['140200', '140220', '140246', '141870', '79664'] as const
    const missing = required.filter((account) => !balances.has(account))
    const observedAt = this.now()
    const observedAtIso = observedAt.toISOString()
    const latestExpectedPeriod = latestExpectedIfDataPeriod(observedAt)
    const periodIsStale = referencePeriod < latestExpectedPeriod
    const criticalFieldsMissing = [...missing.map((account) => `ifdata_account_${account}`), ...(periodIsStale ? ['ifdata_reference_period_not_latest_expected'] : [])]
    const totalAssets = balances.get('140220')
    const equity = balances.get('140246')
    const netIncome = balances.get('141870')
    const liquidSecurities = balances.get('140200')
    const baselRatio = balances.get('79664')
    const rawChecksum = createHash('sha256').update(cadastroResponse.body).update('\n').update(valuesResponse.body).digest('hex')
    return createFixedIncomeSnapshot({
      dataset: 'bank_financials', providerId: this.id, observedAt: observedAtIso,
      expiresAt: this.validUntil(referencePeriod, observedAt),
      provenance: [{
        publisher: 'Banco Central do Brasil', sourceId: 'bcb.ifdata.cadastro-resumo.v1', sourceUrl: valuesUrl,
        decision: 'automate', access: 'official_public_api', method: 'GET',
        parameters: { referencePeriod, institutionCode, institutionType, cadastroUrl }, license: 'open_data',
        termsReviewedAt: '2026-08-20', termsVersion: 'bcb-open-data-odbl@2026-08-20', retrievedAt: observedAtIso,
        dataAsOf: referencePeriodEndDate(referencePeriod), rawPayloadChecksum: rawChecksum,
        parserVersion: 'bcb-ifdata-cadastro-resumo@1', originalIdentifiers: {
          institutionCode, referencePeriod, reportNumber: '1',
          ...(institution.CodConglomeradoFinanceiro ? { financialConglomerateCode: institution.CodConglomeradoFinanceiro } : {}),
          ...(institution.CodConglomeradoPrudencial ? { prudentialConglomerateCode: institution.CodConglomeradoPrudencial } : {}),
        },
      }],
      quality: { score: criticalFieldsMissing.length === 0 ? 100 : Math.max(0, 100 - criticalFieldsMissing.length * 20), confidence: criticalFieldsMissing.length === 0 ? 95 : 60, criticalFieldsMissing },
      payload: {
        referencePeriod, institutionCode, institutionName: institution.NomeInstituicao, active: String(institution.Situacao === 'A'),
        ...(institution.CodConglomeradoFinanceiro ? { financialConglomerateCode: institution.CodConglomeradoFinanceiro } : {}),
        ...(institution.CodConglomeradoPrudencial ? { prudentialConglomerateCode: institution.CodConglomeradoPrudencial } : {}),
        ...(institution.CnpjInstituicaoLider ? { leaderTaxId: institution.CnpjInstituicaoLider } : {}),
        ...(totalAssets ? { totalAssetsBRL: decimal(totalAssets) } : {}),
        ...(equity ? { equityBRL: decimal(equity) } : {}),
        ...(netIncome ? { netIncomeBRL: decimal(netIncome) } : {}),
        ...(liquidSecurities ? { liquidSecuritiesBRL: decimal(liquidSecurities) } : {}),
        ...(baselRatio ? { baselRatioPct: decimal(new Decimal(baselRatio).mul(100).toString()) } : {}),
      },
    })
  }
}

class IfDataFetchClient implements FixedIncomeHttpClient {
  async get(url: string): Promise<FixedIncomeHttpResponse> {
    const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error' })
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', body: new Uint8Array(await response.arrayBuffer()) }
  }
}

function requireIdentifier(request: FixedIncomeProviderRequest, key: string, pattern: RegExp): string {
  const value = request.identifiers[key]
  if (!value || !pattern.test(value)) throw new Error(`BCB IFData identifier ${key} is required and invalid`)
  return value
}
function responseText(response: FixedIncomeHttpResponse, label: string): string {
  if (response.status !== 200) throw new Error(`BCB IFData ${label} request failed with HTTP ${response.status}`)
  if (!response.contentType.toLowerCase().includes('application/json')) throw new Error(`BCB IFData ${label} returned an unexpected content type`)
  if (response.body.byteLength === 0 || response.body.byteLength > MAX_RESPONSE_BYTES) throw new Error(`BCB IFData ${label} response size is invalid`)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(response.body) } catch { throw new Error(`BCB IFData ${label} is not valid UTF-8`) }
}
function parseEnvelope<T>(raw: string, schema: z.ZodType<T>): T[] {
  const envelope = z.object({ value: z.array(schema) }).passthrough().parse(JSON.parse(raw))
  return envelope.value
}
function quoteSaldoNumbers(raw: string): string {
  return raw.replace(/("Saldo"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, '$1"$2"')
}
function decimal(value: string): string {
  const parsed = new Decimal(value)
  if (!parsed.isFinite()) throw new Error('BCB IFData returned an invalid decimal')
  return parsed.toFixed()
}

function referencePeriodEndDate(period: string): string {
  const year = Number(period.slice(0, 4)); const month = Number(period.slice(4))
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function nextIfDataPublicationDeadline(period: string): Date {
  const year = Number(period.slice(0, 4)); const month = Number(period.slice(4))
  if (![3, 6, 9, 12].includes(month)) throw new Error('BCB IFData referencePeriod must be a quarter end')
  const quarterEnd = new Date(Date.UTC(year, month, 0))
  const publicationLagDays = month === 12 ? 90 : 60
  const currentDeadline = new Date(quarterEnd.getTime() + publicationLagDays * 86_400_000)
  const nextQuarterEnd = new Date(Date.UTC(year, month + 3, 0))
  const nextLagDays = nextQuarterEnd.getUTCMonth() === 11 ? 90 : 60
  const nextDeadline = new Date(nextQuarterEnd.getTime() + nextLagDays * 86_400_000)
  return new Date(Math.max(currentDeadline.getTime() + 1, nextDeadline.getTime()))
}

function latestExpectedIfDataPeriod(asOf: Date): string {
  let latest = ''
  for (let year = asOf.getUTCFullYear() - 2; year <= asOf.getUTCFullYear(); year += 1) {
    for (const month of [3, 6, 9, 12]) {
      const end = new Date(Date.UTC(year, month, 0))
      const deadline = new Date(end.getTime() + (month === 12 ? 90 : 60) * 86_400_000)
      if (deadline <= asOf) latest = `${year}${String(month).padStart(2, '0')}`
    }
  }
  if (!latest) throw new Error('could not derive the latest expected IFData period')
  return latest
}
