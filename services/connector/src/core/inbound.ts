import {
  connectorInboundTextMessageSchema,
  type ConnectorInboundTextMessage,
} from '@traderalice/connector-protocol'

/**
 * Adapter-neutral seam for inbound Connector messages.
 *
 * This stage intentionally does not persist, acknowledge, route, or bind an
 * external conversation. Those delivery guarantees are introduced by the
 * subsequent inbound transport tasks.
 */
export interface ConnectorInboundMessageSink {
  accept(message: ConnectorInboundTextMessage): Promise<void>
}

export class ValidatingConnectorInboundSink {
  constructor(private readonly sink: ConnectorInboundMessageSink) {}

  async accept(message: unknown): Promise<void> {
    await this.sink.accept(connectorInboundTextMessageSchema.parse(message))
  }
}
