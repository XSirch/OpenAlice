import { describe, expect, it } from 'vitest'

import { readAliceLocalJson } from './alice-inbound-client.js'

describe('Alice Connector local reads', () => {
  it('rejects arbitrary and query-shaped paths before making a request', async () => {
    await expect(readAliceLocalJson('http://127.0.0.1:47331', '/api/alice-invest/fixed-income/positions')).rejects.toThrow('not allowed')
    await expect(readAliceLocalJson('http://127.0.0.1:47331', '/api/connector-inbound/fixed-income-summary?secret=1')).rejects.toThrow('not allowed')
  })
})
