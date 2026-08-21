import { describe, expect, it } from 'vitest'

import { BcbIfDataProvider, type FixedIncomeHttpClient } from './bcb-ifdata.js'

const cadastro = JSON.stringify({ value: [{
  CodInst: 'C0080312', Data: '202603', NomeInstituicao: 'BANCO FIXTURE - PRUDENCIAL', Situacao: 'A',
  CodConglomeradoFinanceiro: 'C0041856', CodConglomeradoPrudencial: 'C0080312', CnpjInstituicaoLider: '28195667',
}] })
const values = `{"value":[
  {"CodInst":"C0080312","AnoMes":"202603","NumeroRelatorio":"1","Conta":"140200","NomeColuna":"Títulos e Valores Mobiliários","Saldo":29074933980.53},
  {"CodInst":"C0080312","AnoMes":"202603","NumeroRelatorio":"1","Conta":"140220","NomeColuna":"Ativo Total","Saldo":69283220969},
  {"CodInst":"C0080312","AnoMes":"202603","NumeroRelatorio":"1","Conta":"140246","NomeColuna":"Patrimônio Líquido","Saldo":7164970268.62},
  {"CodInst":"C0080312","AnoMes":"202603","NumeroRelatorio":"1","Conta":"141870","NomeColuna":"Lucro Líquido","Saldo":233030384.3},
  {"CodInst":"C0080312","AnoMes":"202603","NumeroRelatorio":"1","Conta":"79664","NomeColuna":"Índice de Basileia","Saldo":0.158333752005285}
]}`

describe('BcbIfDataProvider', () => {
  it('normalizes official cadastro/report rows into decimal strings and provenance', async () => {
    const urls: string[] = []
    const http: FixedIncomeHttpClient = { get: async (url) => {
      urls.push(url)
      return { status: 200, contentType: 'application/json; charset=utf-8', body: Buffer.from(url.includes('IfDataCadastro') ? cadastro : values, 'utf8') }
    } }
    const provider = new BcbIfDataProvider({ http, now: () => new Date('2026-08-20T12:00:00.000Z'), validUntil: () => '2026-11-30T00:00:00.000Z' })
    const snapshot = await provider.fetch({ dataset: 'bank_financials', asOf: '2026-08-20T12:00:00.000Z', identifiers: {
      referencePeriod: '202603', institutionCode: 'C0080312', institutionType: '1',
    } })
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('IfDataCadastro')
    expect(urls[1]).toContain("Relatorio='1'")
    expect(snapshot.payload).toMatchObject({
      referencePeriod: '202603', institutionCode: 'C0080312', active: 'true', baselRatioPct: '15.8333752005285',
      totalAssetsBRL: '69283220969', equityBRL: '7164970268.62', netIncomeBRL: '233030384.3', liquidSecuritiesBRL: '29074933980.53',
      financialConglomerateCode: 'C0041856', prudentialConglomerateCode: 'C0080312',
    })
    expect(snapshot.provenance[0]).toMatchObject({ publisher: 'Banco Central do Brasil', decision: 'automate', access: 'official_public_api' })
    expect(snapshot.provenance[0]?.dataAsOf).toBe('2026-03-31')
  })

  it('fails closed when identifiers, rows, or required official accounts are missing', async () => {
    const http: FixedIncomeHttpClient = { get: async (url) => ({ status: 200, contentType: 'application/json', body: Buffer.from(url.includes('IfDataCadastro') ? '{"value":[]}' : '{"value":[]}', 'utf8') }) }
    const provider = new BcbIfDataProvider({ http })
    await expect(provider.fetch({ dataset: 'bank_financials', asOf: '2026-08-20T12:00:00.000Z', identifiers: {} })).rejects.toThrow(/referencePeriod/)
    await expect(provider.fetch({ dataset: 'bank_financials', asOf: '2026-08-20T12:00:00.000Z', identifiers: {
      referencePeriod: '202603', institutionCode: 'missing', institutionType: '1',
    } })).rejects.toThrow(/cadastro row/)
  })
})
