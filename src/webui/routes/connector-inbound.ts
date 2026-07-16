import { Hono } from 'hono'
import { connectorInboundTextMessageSchema, type ConnectorInboundTextMessage } from '@traderalice/connector-protocol'
import { verifyConnectorInbound } from '../../core/connector-inbound-auth.js'

export function createConnectorInboundRoutes(
  receive: (message: ConnectorInboundTextMessage) => Promise<void>,
  rotate?: (input: { connectorId: string; conversationId: string; ownerId: string }) => Promise<void>,
) {
  const app = new Hono()
  app.post('/', async (c) => {
    const body = await c.req.text()
    let message: ConnectorInboundTextMessage
    try { message = connectorInboundTextMessageSchema.parse(JSON.parse(body)) } catch { return c.json({ error: 'invalid inbound envelope' }, 400) }
    if (!await verifyConnectorInbound(message.correlationId, body, c.req.header('x-openalice-connector-signature'))) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    await receive(message)
    return c.json({ accepted: true, correlationId: message.correlationId }, 202)
  })
  app.post('/rotate', async (c) => {
    const body = await c.req.text()
    let input: { correlationId: string; connectorId: string; conversationId: string; ownerId: string }
    try {
      const value = JSON.parse(body) as Record<string, unknown>
      if (![value.correlationId, value.connectorId, value.conversationId, value.ownerId].every((item) => typeof item === 'string' && item.length > 0)) throw new Error('invalid')
      input = value as typeof input
    } catch { return c.json({ error: 'invalid rotation request' }, 400) }
    if (!await verifyConnectorInbound(input.correlationId, body, c.req.header('x-openalice-connector-signature'))) return c.json({ error: 'unauthorized' }, 401)
    if (!rotate) return c.json({ error: 'conversation rotation unavailable' }, 503)
    await rotate({ connectorId: input.connectorId, conversationId: input.conversationId, ownerId: input.ownerId })
    return c.json({ accepted: true, correlationId: input.correlationId }, 202)
  })
  return app
}
