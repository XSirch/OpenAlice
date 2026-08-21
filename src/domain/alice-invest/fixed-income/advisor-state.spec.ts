import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { FixedIncomeAdvisorStateStore } from './advisor-state.js'
import type { FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const provenance: FixedIncomeSourceProvenance = {
  publisher: 'User supplied BTG/AUVP offer artifact', sourceId: 'manual-offers:fixture', sourceUrl: 'https://openalice.local/manual-import/offers.json',
  decision: 'manual', access: 'user_supplied', method: 'manual_upload', parameters: { fileName: 'offers.json' }, license: 'user_supplied',
  termsReviewedAt: '2026-08-20', termsVersion: 'fixture@1', retrievedAt: '2026-08-20T12:00:00.000Z', dataAsOf: '2026-08-20T11:30:00.000Z',
  rawPayloadChecksum: 'a'.repeat(64), parserVersion: 'fixture@1', originalIdentifiers: { fileName: 'offers.json' },
}
const offer = {
  id: 'offer-1', observedAt: '2026-08-20T11:30:00.000Z', validUntil: '2026-08-20T13:00:00.000Z', minimumBRL: '1000',
  availability: 'confirmed' as const, distributor: 'BTG_PACTUAL' as const, origin: 'USER_IMPORT' as const,
  confirmation: { kind: 'user_confirmation' as const, confirmedAt: '2026-08-20T11:30:00.000Z' },
  rate: { kind: 'fixed' as const, annualRatePct: '12' }, liquidity: { redemption: 'at_maturity' as const, settlementBusinessDays: 1, noticeBusinessDays: 0 },
  product: { productType: 'lci' as const, issuer: { legalName: 'Banco Exemplo', conglomerate: 'Grupo Exemplo' }, rate: { kind: 'fixed' as const, annualRatePct: '12' }, issueDate: '2026-08-20', maturityDate: '2027-08-20', liquidity: { redemption: 'at_maturity' as const, settlementBusinessDays: 1, noticeBusinessDays: 0 }, fgc: { status: 'eligible' as const }, fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' }, assumptions: [] },
}

describe('fixed-income advisor state store', () => {
  it('persists private offer imports atomically and expires availability at read time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-fi-state-'))
    const path = join(root, 'offers.json')
    const store = new FixedIncomeAdvisorStateStore(path)
    const input = { checksum: 'a'.repeat(64), importedAt: '2026-08-20T12:00:00.000Z', provenance, offers: [offer] }
    expect(await store.recordImport(input)).toBe(true)
    expect(await store.recordImport(input)).toBe(false)
    expect((await store.listOpportunities(new Date('2026-08-20T12:30:00.000Z')))[0]?.availability).toBe('confirmed')
    expect((await store.listOpportunities(new Date('2026-08-20T13:00:00.000Z')))[0]?.availability).toBe('expired')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, imports: [{ checksum: 'a'.repeat(64) }] })
  })

  it('rejects conflicting checksum replays', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-fi-state-'))
    const store = new FixedIncomeAdvisorStateStore(join(root, 'offers.json'))
    await store.recordImport({ checksum: 'a'.repeat(64), importedAt: '2026-08-20T12:00:00.000Z', provenance, offers: [offer] })
    await expect(store.recordImport({ checksum: 'a'.repeat(64), importedAt: '2026-08-20T12:01:00.000Z', provenance, offers: [offer] })).rejects.toThrow(/conflicting/)
  })
})
