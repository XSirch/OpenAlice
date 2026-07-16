import { signConnectorInbound } from '@/core/connector-inbound-auth.js'
import type { ConnectorInboundTextMessage } from '@traderalice/connector-protocol'

export class AliceInboundClient {
  constructor(private readonly baseUrl: string) {}
  async deliver(message: ConnectorInboundTextMessage): Promise<void> {
    const body = JSON.stringify(message)
    const response = await fetch(new URL('/api/connector-inbound', this.baseUrl), {
      method: 'POST', body,
      headers: { 'content-type': 'application/json', 'x-openalice-connector-signature': await signConnectorInbound(message.correlationId, body) },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw Object.assign(new Error(`Alice inbound bridge failed: ${response.status}`), { status: response.status })
  }
}
