import { describe, expect, it, vi } from 'vitest'

import { assessFixedIncomeSnapshot } from './provider-contract.js'
import { CvmPrivateCreditProvider } from './cvm-private-credit.js'

const archive = <T>(kind: string, rows: T[]) => ({ sourceUrl: `https://dados.cvm.gov.br/${kind}.zip`, retrievedAt: '2026-08-20T12:00:00.000Z', rawPayloadChecksum: kind[0]!.repeat(64), rows })

describe('CVM private-credit provider', () => {
  it('joins only the requested official issuer evidence and preserves archive checksums', async () => {
    const fetchStatement = vi.fn(async ({ kind }: { kind: 'DFP' | 'ITR' }) => archive(kind === 'DFP' ? 'a' : 'b', [{ cvmCode: '9512', company: 'Companhia Exemplo', referenceDate: kind === 'DFP' ? '2025-12-31' : '2026-06-30', filedAt: '2026-08-01', statement: 'DRE', accountCode: '3.11', account: 'Lucro líquido', value: 1234.56, revision: '1', exerciseOrder: 'ÚLTIMO', sourceUrl: 'https://dados.cvm.gov.br/source' }, { cvmCode: '9512', company: 'Companhia Exemplo', referenceDate: kind === 'DFP' ? '2025-12-31' : '2026-06-30', filedAt: '2026-08-01', statement: 'DRE', accountCode: '3.11', account: 'Lucro anterior', value: 999, revision: '1', exerciseOrder: 'PENÚLTIMO' }]))
    const fetchIpe = vi.fn(async () => archive('c', [{ cvmCode: '9512', company: 'Companhia Exemplo', referenceDate: '2026-08-10', filedAt: '2026-08-11', category: 'Fato Relevante', type: 'Comunicado', subject: 'Evento documentado', revision: '1', downloadUrl: 'https://www.rad.cvm.gov.br/doc' }]))
    const provider = new CvmPrivateCreditProvider({ fetchStatement: fetchStatement as never, fetchIpe, now: () => new Date('2026-08-20T12:00:00.000Z') })
    const snapshot = await provider.fetch({ dataset: 'private_credit_documents', asOf: '2026-08-20T12:00:00.000Z', identifiers: { cvmCode: '9512', year: '2026' } })
    expect(snapshot).toMatchObject({ dataset: 'private_credit_documents', providerId: 'cvm-private-credit', quality: { score: 100, confidence: 95, criticalFieldsMissing: [] }, payload: { cvmCode: '9512', year: '2026' } })
    expect(snapshot.provenance.map((source) => source.rawPayloadChecksum)).toEqual(['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)])
    expect((snapshot.payload.statements as unknown[])).toHaveLength(2)
    expect(snapshot.provenance.map((source) => source.dataAsOf)).toEqual(['2025-12-31', '2026-06-30', '2026-08-10'])
    expect(fetchStatement).toHaveBeenCalledWith({ kind: 'DFP', year: 2025, cvmCode: '9512' })
    expect(assessFixedIncomeSnapshot(snapshot, { critical: true, minimumQuality: 80, minimumConfidence: 80, now: new Date('2026-08-21T12:00:00.000Z') }).usableForRecommendation).toBe(true)
  })

  it('fails closed when one required official evidence family is empty', async () => {
    const provider = new CvmPrivateCreditProvider({ fetchStatement: async ({ kind }) => archive(kind === 'DFP' ? 'a' : 'b', kind === 'DFP' ? [] : [{ cvmCode: '1', company: 'X', referenceDate: '2026-06-30', filedAt: null, statement: 'DRE', accountCode: '1', account: 'X', value: 1 }]), fetchIpe: async () => archive('c', []), now: () => new Date('2026-08-20T12:00:00.000Z') })
    const snapshot = await provider.fetch({ dataset: 'private_credit_documents', asOf: '2026-08-20T12:00:00.000Z', identifiers: { cvmCode: '1', year: '2026' } })
    expect(snapshot.quality.criticalFieldsMissing).toEqual(['dfp_rows'])
    expect(assessFixedIncomeSnapshot(snapshot, { critical: true, minimumQuality: 80, minimumConfidence: 80 }).usableForRecommendation).toBe(false)
  })
})
