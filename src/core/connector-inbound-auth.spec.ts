import { describe, expect, it } from 'vitest'
import { signConnectorInbound, verifyConnectorInbound } from './connector-inbound-auth.js'

describe('Connector inbound authentication', () => {
  it('binds the signature to both correlation and payload', async () => {
    const signature = await signConnectorInbound('c-1', '{"safe":true}')
    await expect(verifyConnectorInbound('c-1', '{"safe":true}', signature)).resolves.toBe(true)
    await expect(verifyConnectorInbound('c-2', '{"safe":true}', signature)).resolves.toBe(false)
    await expect(verifyConnectorInbound('c-1', '{"safe":false}', signature)).resolves.toBe(false)
  })
})
