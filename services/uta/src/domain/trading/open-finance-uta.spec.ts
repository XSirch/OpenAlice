import { describe, expect, it } from 'vitest'
import { buildOpenFinanceUTAs } from './open-finance-uta.js'

describe('Open Finance UTA injection', () => {
  it('creates MeuPluggy as a funded read-only, non-vendor UTA', () => {
    const [uta] = buildOpenFinanceUTAs({ pluggy: { enabled: true, configured: true, itemIds: ['a'] } }, new Set())
    expect(uta).toMatchObject({
      id: 'meu-pluggy',
      label: 'MeuPluggy',
      presetId: 'pluggy-readonly',
      readOnly: true,
      keyless: false,
      asVendor: false,
      editable: false,
      presetConfig: {},
    })
  })

  it('does not create a UTA until Pluggy is both configured and enabled', () => {
    expect(buildOpenFinanceUTAs({ pluggy: { enabled: false, configured: true, itemIds: [] } }, new Set())).toEqual([])
    expect(buildOpenFinanceUTAs({ pluggy: { enabled: true, configured: false, itemIds: [] } }, new Set())).toEqual([])
  })

  it('never shadows an existing account id', () => {
    expect(buildOpenFinanceUTAs({ pluggy: { enabled: true, configured: true, itemIds: [] } }, new Set(['meu-pluggy']))).toEqual([])
  })
})
