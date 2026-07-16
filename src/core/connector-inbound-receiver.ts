import type { ConnectorInboundTextMessage } from '@traderalice/connector-protocol'

/** Process-local idempotency gate for the authenticated bridge. T115 replaces
 * this restart-local receipt set with durable recovery evidence. */
export class ConnectorInboundReceiver {
  private readonly accepted = new Set<string>()
  constructor(private readonly onMessage: (message: ConnectorInboundTextMessage) => Promise<void> = async () => undefined) {}
  async receive(message: ConnectorInboundTextMessage): Promise<void> {
    if (this.accepted.has(message.correlationId)) return
    this.accepted.add(message.correlationId)
    try { await this.onMessage(message) } catch (error) { this.accepted.delete(message.correlationId); throw error }
  }
}
