import { createHash } from 'node:crypto'
import { z } from 'zod'

import {
  createFixedIncomeSnapshot,
  fixedIncomeProviderRequestSchema,
  type FixedIncomeProvider,
  type FixedIncomeProviderRequest,
  type FixedIncomeSnapshot,
} from './provider-contract.js'

const PACKAGE_URL = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto'
const SOURCE_ID = 'tesouro_transparente.td_price_rate.v1'
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024

const metadataSchema = z.object({
  success: z.literal(true),
  result: z.object({
    license_id: z.literal('odc-odbl'),
    metadata_modified: z.string().min(1),
    resources: z.array(z.object({
      id: z.string().min(1),
      state: z.literal('active'),
      format: z.string(),
      url: z.string().url(),
      last_modified: z.string().nullable().optional(),
      revision_id: z.string().min(1),
    }).passthrough()),
  }).passthrough(),
}).passthrough()

export interface FixedIncomeHttpResponse {
  status: number
  contentType: string
  body: Uint8Array
}

export interface FixedIncomeHttpClient {
  get(url: string): Promise<FixedIncomeHttpResponse>
}

export interface TesouroTransparenteProviderOptions {
  http?: FixedIncomeHttpClient
  now?: () => Date
  validUntil?: (referenceDate: string, observedAt: Date) => string
}

export class TesouroTransparenteProvider implements FixedIncomeProvider {
  readonly id = 'tesouro-transparente'
  private readonly http: FixedIncomeHttpClient
  private readonly now: () => Date
  private readonly validUntil: (referenceDate: string, observedAt: Date) => string

  constructor(options: TesouroTransparenteProviderOptions = {}) {
    this.http = options.http ?? new FetchFixedIncomeHttpClient()
    this.now = options.now ?? (() => new Date())
    this.validUntil = options.validUntil ?? ((_referenceDate, observedAt) => new Date(observedAt.getTime() + 24 * 60 * 60 * 1_000).toISOString())
  }

  async fetch(requestInput: FixedIncomeProviderRequest): Promise<FixedIncomeSnapshot> {
    const request = fixedIncomeProviderRequestSchema.parse(requestInput)
    if (request.dataset !== 'treasury_catalog' && request.dataset !== 'treasury_prices') {
      throw new Error(`unsupported Tesouro Transparente dataset: ${request.dataset}`)
    }
    const metadataResponse = await this.http.get(PACKAGE_URL)
    assertResponse(metadataResponse, 'application/json', 'metadata')
    const metadata = metadataSchema.parse(JSON.parse(decodeUtf8(metadataResponse.body, 'metadata')))
    const resource = metadata.result.resources.find((candidate) => candidate.format.toUpperCase() === 'CSV')
    if (!resource) throw new Error('Tesouro Transparente metadata has no active CSV resource')

    const csvResponse = await this.http.get(resource.url)
    assertResponse(csvResponse, 'text/csv', 'prices')
    const rawCsv = decodeUtf8(csvResponse.body, 'prices')
    const parsedRows = parseTesouroCsv(rawCsv)
    const latestReferenceDate = parsedRows.reduce((latest, row) => row.referenceDate > latest ? row.referenceDate : latest, '')
    const requestedReferenceDate = request.identifiers['referenceDate'] ?? latestReferenceDate
    const rows = parsedRows.filter((row) => (
      row.referenceDate === requestedReferenceDate
      && (!request.identifiers['productType'] || row.productType === request.identifiers['productType'])
      && (!request.identifiers['maturityDate'] || row.maturityDate === request.identifiers['maturityDate'])
    ))
    if (rows.length === 0) throw new Error('Tesouro Transparente returned no rows for the requested identifiers')

    const observedAt = this.now()
    const observedAtIso = observedAt.toISOString()
    const publishedAt = resource.last_modified ? normalizeCkanDate(resource.last_modified) : undefined
    return createFixedIncomeSnapshot({
      dataset: request.dataset,
      providerId: this.id,
      observedAt: observedAtIso,
      expiresAt: this.validUntil(requestedReferenceDate, observedAt),
      provenance: [{
        publisher: 'Tesouro Nacional',
        sourceId: SOURCE_ID,
        sourceUrl: resource.url,
        decision: 'automate',
        access: 'official_public_download',
        method: 'GET',
        parameters: { packageUrl: PACKAGE_URL, resourceId: resource.id },
        license: 'open_data',
        termsReviewedAt: '2026-08-20',
        termsVersion: `odc-odbl:${metadata.result.metadata_modified}`,
        retrievedAt: observedAtIso,
        dataAsOf: requestedReferenceDate,
        ...(publishedAt ? { publishedAt } : {}),
        rawPayloadChecksum: createHash('sha256').update(csvResponse.body).digest('hex'),
        parserVersion: 'tesouro-transparente-csv@1',
        originalIdentifiers: { resourceId: resource.id, revisionId: resource.revision_id },
      }],
      quality: { score: 100, confidence: 100, criticalFieldsMissing: [] },
      payload: {
        resourceId: resource.id,
        resourceRevisionId: resource.revision_id,
        referenceDate: requestedReferenceDate,
        rows,
      },
    })
  }
}

class FetchFixedIncomeHttpClient implements FixedIncomeHttpClient {
  async get(url: string): Promise<FixedIncomeHttpResponse> {
    const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json,text/csv' }, redirect: 'error' })
    const body = new Uint8Array(await response.arrayBuffer())
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', body }
  }
}

function assertResponse(response: FixedIncomeHttpResponse, expectedContentType: string, label: string): void {
  if (response.status !== 200) throw new Error(`Tesouro Transparente ${label} request failed with HTTP ${response.status}`)
  if (!response.contentType.toLowerCase().includes(expectedContentType)) {
    throw new Error(`Tesouro Transparente ${label} returned unexpected content type ${response.contentType || '(missing)'}`)
  }
  if (response.body.byteLength === 0 || response.body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Tesouro Transparente ${label} response size is invalid`)
  }
}

function decodeUtf8(body: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new Error(`Tesouro Transparente ${label} is not valid UTF-8`)
  }
}

function parseTesouroCsv(raw: string): Array<Record<string, string>> {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0)
  const expectedHeader = 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha'
  if (lines[0] !== expectedHeader) throw new Error('Tesouro Transparente CSV header is unsupported')
  return lines.slice(1).map((line, index) => {
    const fields = line.split(';')
    if (fields.length !== 8) throw new Error(`Tesouro Transparente CSV row ${index + 2} has an invalid field count`)
    const [officialName, maturityDate, referenceDate, buyRatePct, sellRatePct, buyUnitPriceBRL, sellUnitPriceBRL, baseUnitPriceBRL] = fields as [string, string, string, string, string, string, string, string]
    return {
      officialName,
      productType: normalizeProductType(officialName),
      maturityDate: brazilianDate(maturityDate),
      referenceDate: brazilianDate(referenceDate),
      buyRatePct: brazilianDecimal(buyRatePct),
      sellRatePct: brazilianDecimal(sellRatePct),
      buyUnitPriceBRL: brazilianDecimal(buyUnitPriceBRL),
      sellUnitPriceBRL: brazilianDecimal(sellUnitPriceBRL),
      baseUnitPriceBRL: brazilianDecimal(baseUnitPriceBRL),
      classification: officialName.startsWith('Tesouro IGPM') ? 'generic_legacy' : 'specific',
    }
  })
}

function normalizeProductType(name: string): string {
  const mapping: Record<string, string> = {
    'Tesouro Selic': 'tesouro_selic',
    'Tesouro Prefixado': 'tesouro_prefixado',
    'Tesouro Prefixado com Juros Semestrais': 'tesouro_prefixado_coupon',
    'Tesouro IPCA+': 'tesouro_ipca',
    'Tesouro IPCA+ com Juros Semestrais': 'tesouro_ipca_coupon',
    'Tesouro Renda+ Aposentadoria Extra': 'tesouro_renda_mais',
    'Tesouro Educa+': 'tesouro_educa_mais',
  }
  return mapping[name] ?? 'tesouro_direto'
}

function brazilianDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) throw new Error(`invalid Tesouro date: ${value}`)
  const result = `${match[3]}-${match[2]}-${match[1]}`
  if (new Date(`${result}T00:00:00.000Z`).toISOString().slice(0, 10) !== result) throw new Error(`invalid Tesouro date: ${value}`)
  return result
}

function brazilianDecimal(value: string): string {
  const normalized = value.replace(',', '.')
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`invalid Tesouro decimal: ${value}`)
  return /^-0(?:\.0+)?$/.test(normalized) ? normalized.slice(1) : normalized
}

function normalizeCkanDate(value: string): string {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) throw new Error(`invalid CKAN publication date: ${value}`)
  return date.toISOString()
}
