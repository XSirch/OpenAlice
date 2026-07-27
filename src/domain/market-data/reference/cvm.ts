/** CVM open-data helpers. Downloading/ZIP extraction stays at the adapter
 * boundary; this module owns stable URLs and parsing of the public CSV shape. */
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
  const ticker = (row.TP_MERC ?? row.CD_NEGOCIACAO ?? row.TICKER ?? '').trim().toUpperCase()
  if (!/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(ticker) || !row.CD_CVM || !row.DENOM_CIA) return null
  return { ticker, cvmCode: row.CD_CVM, company: row.DENOM_CIA, updatedAt: iso(row.DT_REFER) ?? iso(row.DT_RECEB) ?? null }
}

function iso(value: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  return m ? value! : null
}
