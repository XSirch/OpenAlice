import { signConnectorInbound } from '@/core/connector-inbound-auth.js'
import type { ConnectorInboundTextMessage } from '@traderalice/connector-protocol'
import { randomUUID } from 'node:crypto'

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

export async function rotateAliceConversation(baseUrl: string, connectorId: string, ownerId: string, conversationId: string): Promise<void> {
  const correlationId = `rotate-${randomUUID()}`
  const body = JSON.stringify({ correlationId, connectorId, ownerId, conversationId })
  const response = await fetch(new URL('/api/connector-inbound/rotate', baseUrl), {
    method: 'POST', body, headers: { 'content-type': 'application/json', 'x-openalice-connector-signature': await signConnectorInbound(correlationId, body) }, signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Alice conversation rotation failed: ${response.status}`)
}
