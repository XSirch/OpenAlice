import { describe, expect, it } from 'vitest'
import { cvmArchiveUrl, cvmFcaArchiveUrl, cvmIpeArchiveUrl, extractCvmCapitalComposition, extractCvmIpeEvents, extractCvmIssuerMapping, extractCvmStatementLines, parseCvmIssuerMapping, parseCvmStatementRow } from './cvm.js'

describe('CVM open data', () => {
  it('builds an official annual DFP URL', () => expect(cvmArchiveUrl('DFP', 2025)).toContain('/DFP/DADOS/dfp_cia_aberta_2025.zip'))
  it('builds an official annual FCA URL', () => expect(cvmFcaArchiveUrl(2026)).toContain('/FCA/DADOS/fca_cia_aberta_2026.zip'))
  it('builds and parses the official IPE document archive without guessing document meaning', () => {
    expect(cvmIpeArchiveUrl(2026)).toContain('/IPE/DADOS/ipe_cia_aberta_2026.zip')
    const rows = extractCvmIpeEvents([{ path: 'ipe_cia_aberta_2026.csv', text: 'Codigo_CVM;Nome_Companhia;Data_Referencia;Categoria;Tipo;Assunto;Data_Entrega;Versao;Link_Download\n9512;PETROBRAS;2026-06-01;Fato Relevante;Comunicado;Evento;2026-06-02;2;https://example.test/doc\n' }], '9512')
    expect(rows).toEqual([expect.objectContaining({ cvmCode: '9512', category: 'Fato Relevante', revision: '2' })])
  })
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
  it('normalizes official capital composition without guessing missing share classes', () => {
    const rows = extractCvmCapitalComposition([{ path: 'dfp_cia_aberta_composicao_capital_2025.csv', text: 'CD_CVM;DENOM_CIA;DT_REFER;QT_ACOES_ORDINARIAS;QT_ACOES_PREFERENCIAIS;QT_ACOES_TESOURARIA\n9512;PETROBRAS;2025-12-31;13000000000;0;1000\n4770;VALE;2025-12-31;5000000000;;;\n' }], '9512')
    expect(rows).toEqual([expect.objectContaining({ cvmCode: '9512', commonShares: 13_000_000_000, preferredShares: 0, treasuryShares: 1000 })])
    expect(extractCvmCapitalComposition([{ path: 'x.csv', text: 'CD_CVM;DENOM_CIA;DT_REFER;QT_ACOES_ORDINARIAS\n4770;VALE;2025-12-31;5000000000\n' }], '4770')[0]).toMatchObject({ company: 'VALE', preferredShares: null })
  })
  it('resolves a ticker from FCA only when all matching rows identify one issuer', () => {
    const file = { path: 'fca.csv', text: 'TICKER;CD_CVM;DENOM_CIA;DT_REFER\nPETR4;9512;PETROBRAS;2026-01-01\nPETR4;9512;PETROBRAS;2026-02-01\n' }
    expect(extractCvmIssuerMapping([file], 'petr4')).toMatchObject({ cvmCode: '9512', updatedAt: '2026-02-01' })
    expect(extractCvmIssuerMapping([{ path: 'bad.csv', text: 'TICKER;CD_CVM;DENOM_CIA\nPETR4;9512;A\nPETR4;9999;B\n' }], 'PETR4')).toBeNull()
  })
  it('joins the published FCA company and security files by CNPJ', () => {
    const company = { path: 'fca_cia_aberta_2026.csv', text: 'CNPJ_CIA;DT_REFER;DENOM_CIA;CD_CVM\n33.000.167/0001-01;2026-01-01;PETROLEO BRASILEIRO S.A. PETROBRAS;009512\n' }
    const security = { path: 'fca_cia_aberta_valor_mobiliario_2026.csv', text: 'CNPJ_Companhia;Data_Referencia;Nome_Empresarial;Codigo_Negociacao\n33.000.167/0001-01;2026-01-01;PETROLEO BRASILEIRO S.A. PETROBRAS;PETR4\n' }
    expect(extractCvmIssuerMapping([security, company], 'PETR4')).toEqual({ ticker: 'PETR4', cvmCode: '009512', company: 'PETROLEO BRASILEIRO S.A. PETROBRAS', updatedAt: '2026-01-01' })
  })
})
