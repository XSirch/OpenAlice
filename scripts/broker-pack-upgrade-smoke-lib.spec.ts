import { describe, expect, it } from 'vitest'

import { selectPreviousBrokerPackRelease } from './broker-pack-upgrade-smoke-lib.js'

describe('Broker Pack upgrade release selection', () => {
  it('skips tags without a catalog for the current Linux target', () => {
    expect(selectPreviousBrokerPackRelease([
      {
        tag_name: 'v0.91.0-beta',
        assets: [{ name: 'OpenAlice-Broker-Packs-0.91.0-beta-linux-x64.json' }],
      },
      { tag_name: 'v0.90.0-beta', assets: [] },
      { tag_name: 'v0.89.1-beta', assets: [{ name: 'unrelated.tgz' }] },
      {
        tag_name: 'v0.89.0-beta',
        assets: [{ name: 'OpenAlice-Broker-Packs-0.89.0-beta-linux-x64.json' }],
      },
    ], '0.90.0-beta', 'linux', 'x64')).toBe('v0.89.0-beta')
  })

  it('ignores the candidate version and draft releases', () => {
    expect(selectPreviousBrokerPackRelease([
      {
        tag_name: 'v0.89.1-beta',
        assets: [{ name: 'OpenAlice-Broker-Packs-0.89.1-beta-linux-x64.json' }],
      },
      {
        tag_name: 'v0.89.0-beta',
        draft: true,
        assets: [{ name: 'OpenAlice-Broker-Packs-0.89.0-beta-linux-x64.json' }],
      },
    ], '0.89.1-beta', 'linux', 'x64')).toBeNull()
  })
})
