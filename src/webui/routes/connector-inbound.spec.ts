import { describe, expect, it, vi } from 'vitest'
import { signConnectorInbound } from '../../core/connector-inbound-auth.js'
import { createConnectorInboundRoutes } from './connector-inbound.js'
const message = { version: 1, connectorId: 'test', correlationId: 'c1', receivedAt: '2026-07-16T00:00:00.000Z', external: { updateId: 'u', senderId: 's', conversationId: 'c' }, content: { type: 'text', text: 'hi' } }
describe('Connector inbound route', () => {
  it('requires an authenticated envelope', async () => {
    const receive = vi.fn(async () => undefined); const app = createConnectorInboundRoutes(receive); const body = JSON.stringify(message)
    expect((await app.request('/', { method: 'POST', body })).status).toBe(401)
    expect((await app.request('/', { method: 'POST', body, headers: { 'x-openalice-connector-signature': await signConnectorInbound('c1', body) } })).status).toBe(202)
    expect(receive).toHaveBeenCalledOnce()
  })
})
