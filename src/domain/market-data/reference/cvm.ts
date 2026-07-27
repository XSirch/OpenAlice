import unzipper from 'unzipper'

/** CVM open-data helpers. This module consumes only official public archives. */
export type CvmStatementKind = 'DFP' | 'ITR'

export interface CvmStatementLine {
  cvmCode: string
  company: string
  referenceDate: string
  filedAt: string | null
  statement: string
  accountCode: string
  account: string
  value: number
}

export interface CvmIssuerMapping { ticker: string; cvmCode: string; company: string; updatedAt: string | null }

export function cvmArchiveUrl(kind: CvmStatementKind, year: number): string {
  if (!Number.isInteger(year) || year < 2010 || year > new Date().getUTCFullYear()) throw new Error('Invalid CVM archive year.')
  return `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/${kind}/DADOS/${kind.toLowerCase()}_cia_aberta_${year}.zip`
}

export function cvmFcaArchiveUrl(year: number): string {
  if (!Number.isInteger(year) || year < 2010 || year > new Date().getUTCFullYear()) throw new Error('Invalid CVM FCA archive year.')
  return `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_${year}.zip`
}

export interface CvmStatementFetchInput { kind: CvmStatementKind; year: number; cvmCode: string }
interface CvmArchiveFile { path: string; buffer(): Promise<Buffer> }

/**
 * Download DFP/ITR public files and return only the requested issuer's
 * statement lines. The archive is official CVM data; it is research data and
 * a filing's reference/receipt dates remain attached to every line.
 */
export async function fetchCvmStatementLines(input: CvmStatementFetchInput): Promise<CvmStatementLine[]> {
  const response = await fetch(cvmArchiveUrl(input.kind, input.year), { signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`CVM returned HTTP ${response.status} for ${input.kind} ${input.year}.`)
  const archive = await unzipper.Open.buffer(Buffer.from(await response.arrayBuffer()))
  const files = archive.files.filter((file) => /_(BPA|BPP|DRE|DFC|DVA|DMPL)_(con|ind)_\d{4}\.csv$/i.test(file.path))
  return extractCvmStatementLines(await Promise.all(files.map(async (file) => ({ path: file.path, text: decodeCvmCsv(await file.buffer()) }))), input.cvmCode)
}

/** Parse CSV fixture/archive files without retaining unrelated issuer rows. */
export function extractCvmStatementLines(files: Array<{ path: string; text: string }>, cvmCode: string): CvmStatementLine[] {
  const lines: CvmStatementLine[] = []
  for (const file of files) {
    const records = parseSemicolonCsv(file.text)
    for (const row of records) {
      if (row.CD_CVM !== cvmCode) continue
      const parsed = parseCvmStatementRow(row)
      if (parsed) lines.push(parsed)
    }
  }
  return lines.sort((a, b) => a.referenceDate.localeCompare(b.referenceDate) || a.statement.localeCompare(b.statement) || a.accountCode.localeCompare(b.accountCode))
}

/** Read the public FCA archive and resolve one ticker only from a matching
 * official record. Ambiguous mappings are deliberately returned as null. */
export async function fetchCvmIssuerMapping(ticker: string, year: number): Promise<CvmIssuerMapping | null> {
  const response = await fetch(cvmFcaArchiveUrl(year), { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`CVM returned HTTP ${response.status} for FCA ${year}.`)
  const archive = await unzipper.Open.buffer(Buffer.from(await response.arrayBuffer()))
  const files = archive.files.filter((file) => /(?:^|_)cia_aberta(?:_valor_mobiliario)?_\d{4}\.csv$/i.test(file.path))
  return extractCvmIssuerMapping(await Promise.all(files.map(async (file) => ({ path: file.path, text: decodeCvmCsv(await file.buffer()) }))), ticker)
}

export function extractCvmIssuerMapping(files: Array<{ path: string; text: string }>, ticker: string): CvmIssuerMapping | null {
  const target = ticker.trim().toUpperCase()
  const matches: CvmIssuerMapping[] = []
  const issuersByCnpj = new Map<string, Omit<CvmIssuerMapping, 'ticker'>>()
  for (const file of files) {
    for (const row of parseSemicolonCsv(file.text)) {
      const issuer = parseCvmIssuerIdentity(row)
      const cnpj = row.CNPJ_CIA ?? row.CNPJ_Companhia
      if (issuer && cnpj) issuersByCnpj.set(cnpj, issuer)
    }
  }
  for (const file of files) {
    for (const row of parseSemicolonCsv(file.text)) {
      const cnpj = row.CNPJ_CIA ?? row.CNPJ_Companhia
      const mapping = parseCvmIssuerMapping(row)
      if (mapping?.ticker === target) matches.push(mapping)
      const listedTicker = (row.Codigo_Negociacao ?? row.CODIGO_NEGOCIACAO ?? '').trim().toUpperCase()
      if (listedTicker === target && cnpj) {
        const listedIssuer = issuersByCnpj.get(cnpj)
        if (listedIssuer) matches.push({ ...listedIssuer, ticker: listedTicker, updatedAt: iso(row.Data_Referencia) ?? listedIssuer.updatedAt })
      }
    }
  }
  const byCvmCode = new Map(matches.map((mapping) => [mapping.cvmCode, mapping]))
  if (byCvmCode.size !== 1) return null
  return [...byCvmCode.values()].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0] ?? null
}

/** Parses a semicolon CSV row from CVM's DFP/ITR statement files. */
export function parseCvmStatementRow(row: Record<string, string>): CvmStatementLine | null {
  const value = Number((row.VL_CONTA ?? '').replace(/\./g, '').replace(',', '.'))
  const referenceDate = iso(row.DT_REFER)
  if (!row.CD_CVM || !row.DENOM_CIA || !referenceDate || !row.GRUP_DFP || !row.CD_CONTA || !Number.isFinite(value)) return null
  return {
    cvmCode: row.CD_CVM, company: row.DENOM_CIA, referenceDate,
    filedAt: iso(row.DT_RECEB) ?? null, statement: row.GRUP_DFP,
    accountCode: row.CD_CONTA, account: row.DS_CONTA ?? row.CD_CONTA, value,
  }
}

/** FCA rows are the authoritative ticker-to-emitter join; symbols absent from
 * the public row remain unresolved instead of falling back to name matching. */
export function parseCvmIssuerMapping(row: Record<string, string>): CvmIssuerMapping | null {
  const ticker = (row.TICKER ?? row.CD_NEGOCIACAO ?? row.Codigo_Negociacao ?? row.CODIGO_NEGOCIACAO ?? '').trim().toUpperCase()
  const issuer = parseCvmIssuerIdentity(row)
  if (!/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(ticker) || !issuer) return null
  return { ...issuer, ticker }
}

function parseCvmIssuerIdentity(row: Record<string, string>): Omit<CvmIssuerMapping, 'ticker'> | null {
  const cvmCode = row.CD_CVM ?? row.Codigo_CVM
  const company = row.DENOM_CIA ?? row.Nome_Empresarial
  if (!cvmCode || !company) return null
  return { cvmCode, company, updatedAt: iso(row.DT_REFER) ?? iso(row.Data_Referencia) ?? iso(row.DT_RECEB) ?? null }
}

function decodeCvmCsv(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8')
  return utf8.includes('\uFFFD') ? buffer.toString('latin1') : utf8
}

function iso(value: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  return m ? value! : null
}

/** RFC-4180-style quoted cells with the semicolon delimiter used by CVM. */
export function parseSemicolonCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 } else quoted = !quoted
    } else if (char === ';' && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row) }
  const [header, ...body] = rows
  if (!header) return []
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key.replace(/^\uFEFF/, ''), values[index] ?? ''])))
}
