import { z } from 'zod'

import { fetchCvmIpeArchive, fetchCvmStatementArchive, type CvmIpeEvent, type CvmOfficialArchiveSnapshot, type CvmStatementLine } from '../../../market-data/reference/cvm.js'
import { createFixedIncomeSnapshot, fixedIncomeProviderRequestSchema, type FixedIncomeProvider, type FixedIncomeProviderRequest, type FixedIncomeSnapshot, type FixedIncomeSourceProvenance } from './provider-contract.js'

const identifiersSchema = z.object({ cvmCode: z.string().regex(/^\d{1,12}$/), year: z.string().regex(/^20\d{2}$/) }).strict()

export interface CvmPrivateCreditProviderDeps {
  fetchStatement: (input: { kind: 'DFP' | 'ITR'; year: number; cvmCode: string }) => Promise<CvmOfficialArchiveSnapshot<CvmStatementLine>>
  fetchIpe: (year: number, cvmCode: string) => Promise<CvmOfficialArchiveSnapshot<CvmIpeEvent>>
  now: () => Date
}

export class CvmPrivateCreditProvider implements FixedIncomeProvider {
  readonly id = 'cvm-private-credit'
  constructor(private readonly deps: CvmPrivateCreditProviderDeps = { fetchStatement: fetchCvmStatementArchive, fetchIpe: fetchCvmIpeArchive, now: () => new Date() }) {}

  async fetch(requestInput: FixedIncomeProviderRequest): Promise<FixedIncomeSnapshot> {
    const request = fixedIncomeProviderRequestSchema.parse(requestInput)
    if (request.dataset !== 'private_credit_documents') throw new Error('CVM private-credit provider supports only private_credit_documents')
    const identifiers = identifiersSchema.parse(request.identifiers)
    const year = Number(identifiers.year)
    const dfpYear = year - 1
    const [dfp, itr, ipe] = await Promise.all([
      this.deps.fetchStatement({ kind: 'DFP', year: dfpYear, cvmCode: identifiers.cvmCode }),
      this.deps.fetchStatement({ kind: 'ITR', year, cvmCode: identifiers.cvmCode }),
      this.deps.fetchIpe(year, identifiers.cvmCode),
    ])
    const observedAt = this.deps.now().toISOString()
    const dfpRows = latestStatements(dfp.rows)
    const itrRows = latestStatements(itr.rows)
    const allDates = [...dfpRows.map((row) => row.referenceDate), ...itrRows.map((row) => row.referenceDate), ...ipe.rows.map((row) => row.referenceDate)].sort()
    const dataAsOf = allDates.at(-1) ?? `${identifiers.year}-01-01`
    // An empty IPE result is valid evidence that the official archive contains
    // no matching disclosure; it is not equivalent to a missing provider.
    const missing = [...(dfpRows.length ? [] : ['dfp_rows']), ...(itrRows.length ? [] : ['itr_rows'])]
    const provenance = [
      archiveProvenance('DFP', dfp, identifiers, String(dfpYear), latestDate(dfpRows.map((row) => row.referenceDate), `${dfpYear}-01-01`)),
      archiveProvenance('ITR', itr, identifiers, identifiers.year, latestDate(itrRows.map((row) => row.referenceDate), `${identifiers.year}-01-01`)),
      archiveProvenance('IPE', ipe, identifiers, identifiers.year, latestDate(ipe.rows.map((row) => row.referenceDate), `${identifiers.year}-01-01`)),
    ]
    return createFixedIncomeSnapshot({
      dataset: 'private_credit_documents', providerId: this.id, observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 8 * 86_400_000).toISOString(), provenance,
      quality: { score: Math.max(0, 100 - missing.length * 25), confidence: Math.max(0, 95 - missing.length * 20), criticalFieldsMissing: missing },
      payload: {
        cvmCode: identifiers.cvmCode, year: identifiers.year,
        statements: [...dfpRows.map((row) => statement('DFP', row)), ...itrRows.map((row) => statement('ITR', row))],
        events: ipe.rows.map((event) => ({ company: event.company, referenceDate: event.referenceDate, filedAt: event.filedAt, category: event.category, type: event.type, subject: event.subject, revision: event.revision, downloadUrl: event.downloadUrl })),
      },
    })
  }
}

function archiveProvenance(kind: 'DFP' | 'ITR' | 'IPE', archive: CvmOfficialArchiveSnapshot<unknown>, identifiers: { cvmCode: string; year: string }, sourceYear: string, dataAsOf: string): FixedIncomeSourceProvenance {
  return {
    publisher: 'Comissão de Valores Mobiliários', sourceId: `cvm.company_documents.v1:${kind.toLowerCase()}:${sourceYear}`,
    sourceUrl: archive.sourceUrl, decision: 'automate', access: 'official_public_download', method: 'GET',
    parameters: { cvmCode: identifiers.cvmCode, requestedYear: identifiers.year, sourceYear, documentKind: kind }, license: 'open_data',
    termsReviewedAt: '2026-08-20', termsVersion: 'cvm-open-data-odbl@2026-08-20', retrievedAt: archive.retrievedAt,
    dataAsOf, rawPayloadChecksum: archive.rawPayloadChecksum, parserVersion: 'cvm-private-credit@1',
    originalIdentifiers: { cvmCode: identifiers.cvmCode, requestedYear: identifiers.year, sourceYear, documentKind: kind },
  }
}

function statement(kind: 'DFP' | 'ITR', row: CvmStatementLine) {
  return { kind, company: row.company, referenceDate: row.referenceDate, filedAt: row.filedAt, statement: row.statement, accountCode: row.accountCode, account: row.account, value: String(row.value), revision: row.revision ?? '1' }
}

function latestStatements(rows: CvmStatementLine[]): CvmStatementLine[] {
  const currentExercise = rows.filter((row) => row.exerciseOrder === undefined || row.exerciseOrder.toLocaleUpperCase('pt-BR') === 'ÚLTIMO')
  const latestReference = latestDate(currentExercise.map((row) => row.referenceDate), '')
  const latest = currentExercise.filter((row) => row.referenceDate === latestReference)
  const byAccount = new Map<string, CvmStatementLine>()
  for (const row of latest) {
    const key = `${row.statement}\u0000${row.accountCode}`
    const prior = byAccount.get(key)
    if (!prior || Number(row.revision ?? '1') >= Number(prior.revision ?? '1')) byAccount.set(key, row)
  }
  return [...byAccount.values()].sort((a, b) => a.statement.localeCompare(b.statement) || a.accountCode.localeCompare(b.accountCode))
}
function latestDate(values: string[], fallback: string): string { return [...values].sort().at(-1) ?? fallback }
