import { describe, expect, it } from 'vitest'
import { cvmArchiveUrl, parseCvmStatementRow } from './cvm.js'

describe('CVM open data', () => {
  it('builds an official annual DFP URL', () => expect(cvmArchiveUrl('DFP', 2025)).toContain('/DFP/DADOS/dfp_cia_aberta_2025.zip'))
  it('parses a Brazilian decimal statement line', () => {
    expect(parseCvmStatementRow({ CD_CVM: '9512', DENOM_CIA: 'PETROLEO BRASILEIRO S.A.', DT_REFER: '2025-12-31', DT_RECEB: '2026-03-01', GRUP_DFP: 'DF Consolidado - Balanço Patrimonial Ativo', CD_CONTA: '1', DS_CONTA: 'Ativo Total', VL_CONTA: '1.234.567,89' })).toMatchObject({ cvmCode: '9512', value: 1234567.89 })
  })
})
