import { describe, expect, it } from 'vitest'
import { cvmArchiveUrl, extractCvmStatementLines, parseCvmIssuerMapping, parseCvmStatementRow } from './cvm.js'

describe('CVM open data', () => {
  it('builds an official annual DFP URL', () => expect(cvmArchiveUrl('DFP', 2025)).toContain('/DFP/DADOS/dfp_cia_aberta_2025.zip'))
  it('parses a Brazilian decimal statement line', () => {
    expect(parseCvmStatementRow({ CD_CVM: '9512', DENOM_CIA: 'PETROLEO BRASILEIRO S.A.', DT_REFER: '2025-12-31', DT_RECEB: '2026-03-01', GRUP_DFP: 'DF Consolidado - Balanço Patrimonial Ativo', CD_CONTA: '1', DS_CONTA: 'Ativo Total', VL_CONTA: '1.234.567,89' })).toMatchObject({ cvmCode: '9512', value: 1234567.89 })
  })
  it('resolves a ticker only from an official FCA row', () => {
    expect(parseCvmIssuerMapping({ TICKER: 'PETR4', CD_CVM: '9512', DENOM_CIA: 'PETROLEO BRASILEIRO S.A.', DT_REFER: '2026-01-01' })).toMatchObject({ ticker: 'PETR4', cvmCode: '9512' })
    expect(parseCvmIssuerMapping({ TICKER: 'Petrobras', CD_CVM: '9512', DENOM_CIA: 'x' })).toBeNull()
  })
  it('filters an official-style quoted CSV archive by CVM code', () => {
    const lines = extractCvmStatementLines([{ path: 'dfp_cia_aberta_DRE_con_2025.csv', text: 'CD_CVM;DENOM_CIA;DT_REFER;DT_RECEB;GRUP_DFP;CD_CONTA;DS_CONTA;VL_CONTA\n9512;"PETROLEO; BRASILEIRO S.A.";2025-12-31;2026-03-01;DRE;3.11;"Lucro; líquido";1.234,56\n1;Outra;2025-12-31;2026-03-01;DRE;3.11;Lucro;2,00\n' }], '9512')
    expect(lines).toEqual([expect.objectContaining({ cvmCode: '9512', company: 'PETROLEO; BRASILEIRO S.A.', account: 'Lucro; líquido', value: 1234.56 })])
  })
})
