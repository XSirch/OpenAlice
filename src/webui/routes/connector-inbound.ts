import { Hono } from 'hono'
import { connectorInboundTextMessageSchema, type ConnectorInboundTextMessage } from '@traderalice/connector-protocol'
import { verifyConnectorInbound } from '../../core/connector-inbound-auth.js'

export function createConnectorInboundRoutes(receive: (message: ConnectorInboundTextMessage) => Promise<void>) {
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
  return app
}
