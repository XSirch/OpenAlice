import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { CustodySnapshot } from '../../open-finance/pluggy.js'
import type { FixedIncomeCustodyDefinitions } from './contracts.js'
import { reconcilePluggyFixedIncomeCustody } from './reconciliation.js'

interface RedactedPluggyFixture {
  fixtureVersion: 1
  redaction: { syntheticIdentifiers: true; containsCredentials: false }
  snapshot: CustodySnapshot
  documentedGaps: string[]
}

describe('redacted MeuPluggy fixed-income fixture', () => {
  it('preserves available custody evidence while leaving unsupported positions explicit', () => {
    const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/pluggy-custody-redacted.json'), 'utf8')) as RedactedPluggyFixture
    const definitions: FixedIncomeCustodyDefinitions = {
      version: 1,
      entries: [{
        source: { provider: 'pluggy', positionId: 'pluggy-position-redacted-001' },
        product: {
          productType: 'cdb',
          issuer: { legalName: 'Banco Exemplo Confirmado', conglomerate: 'Conglomerado Exemplo Confirmado' },
          rate: { kind: 'cdi_percentage', cdiPct: '105' },
          issueDate: '2025-08-20',
          maturityDate: '2027-08-20',
          liquidity: { redemption: 'at_maturity', settlementBusinessDays: 1, noticeBusinessDays: 0 },
          fgc: { status: 'eligible' },
          fees: { administrationAnnualPct: '0', performancePct: '0', entryPct: '0', exitPct: '0' },
          assumptions: ['Classification confirmed by the user from a redacted statement.'],
        },
      }],
    }

    const reconciliation = reconcilePluggyFixedIncomeCustody(fixture.snapshot, definitions)

    expect(fixture.redaction).toEqual({ syntheticIdentifiers: true, containsCredentials: false })
    expect(fixture.documentedGaps).toContain('Pluggy does not provide tax-lot identity for every connector.')
    expect(reconciliation.positions[0]).toMatchObject({
      id: 'pluggy:pluggy-position-redacted-001',
      acquiredDate: '2025-08-20',
      investedAmountBRL: '10000',
      currentAmountBRL: '11342.57',
    })
    expect(reconciliation.unclassifiedPositionIds).toEqual(['pluggy-position-redacted-002'])
  })
})
