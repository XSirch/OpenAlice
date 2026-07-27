import { Bot, InputFile } from 'grammy'
import { autoRetry } from '@grammyjs/auto-retry'
import type {
  ConnectorAdapterConfig,
  ConnectorAdapterHealth,
  ConnectorInboundTextMessage,
  InboxNotification,
} from '@traderalice/connector-protocol'
import { TELEGRAM_CONNECTOR_DEFINITION } from '@traderalice/connector-protocol'
import type {
  ConnectorAdapter,
  ConnectorAdapterContext,
  ConnectorAdapterRegistration,
} from '../core/adapter.js'
import {
  AdapterHealthTracker,
  decodeInboxAttachments,
  formatPlainInboxNotification,
} from './shared.js'

const TELEGRAM_INITIALIZATION_TIMEOUT_MS = 15_000

export class TelegramConnectorAdapter implements ConnectorAdapter {
  readonly id = 'telegram'
  private readonly tracker = new AdapterHealthTracker(this.id)
  private bot?: Bot
  private ownerUserId?: string
  private chatId?: string

  async start(config: ConnectorAdapterConfig, context: ConnectorAdapterContext): Promise<void> {
    const token = requiredString(config, 'botToken')
    this.ownerUserId = optionalString(config, 'ownerUserId')
    this.chatId = optionalString(config, 'chatId')
    // grammY defaults to node-fetch in Node. The production image can reach
    // Telegram through Node's native fetch while node-fetch stalls, so use the
    // runtime client that also powers the verified health diagnostics.
    const bot = new Bot(token, { client: { fetch: globalThis.fetch as never } })
    this.bot = bot

    for (const command of TELEGRAM_CONNECTOR_DEFINITION.commands) {
      bot.command(command.name, async (ctx) => {
        if (ctx.chat.type !== 'private' || !ctx.from) return
        const handled = await context.commands.execute({
          connectorId: this.id,
          command: command.name,
          userId: String(ctx.from.id),
          chatId: String(ctx.chat.id),
          reply: async (message) => { await ctx.reply(message) },
        }).catch(async (error) => {
          this.tracker.degraded(error)
          await ctx.reply('Connector command failed. Check OpenAlice logs.').catch(() => undefined)
          return true
        })
        if (!handled) await ctx.reply('Unknown connector command.')
      })
    }
    bot.on('message:text', async (ctx) => {
      if (ctx.chat.type !== 'private' || !ctx.from) return
      const text = ctx.message.text.trim()
      // grammY command handlers own slash commands; ordinary text is the only
      // payload allowed through the generic inbound conversation contract.
      if (!text || text.startsWith('/')) return
      const userId = String(ctx.from.id)
      const chatId = String(ctx.chat.id)
      if (!this.isOwner(userId) || this.chatId !== chatId) return
      const message: ConnectorInboundTextMessage = {
        version: 1,
        connectorId: this.id,
        correlationId: `telegram-${ctx.update.update_id}`,
        receivedAt: new Date(ctx.message.date * 1_000).toISOString(),
        external: {
          updateId: String(ctx.update.update_id),
          messageId: String(ctx.message.message_id),
          senderId: userId,
          conversationId: chatId,
        },
        content: { type: 'text', text },
      }
      try {
        await context.acceptInbound(message)
      } catch (error) {
        this.tracker.degraded(error)
        await ctx.reply('OpenAlice could not accept this message yet. Please try again shortly.').catch(() => undefined)
      }
    })
    this.registerCommands(context)
    // Do not hold the Connector HTTP server hostage to Telegram's network
    // round trips. Guardian needs its loopback health endpoint immediately so
    // the UI can distinguish a slow/unreachable Telegram API from a missing
    // Connector process and surface the adapter error to the operator.
    void this.initializeBot(bot)
  }

  private async initializeBot(bot: Bot): Promise<void> {
    try {
      // `init()` performs the authenticated getMe request required before
      // polling. Command-menu registration is cosmetic: a Telegram rate
      // limit there must not prevent an operator from sending `/link`.
      await initializationDeadline(bot.init())
      // A stop/restart can happen while Telegram initialization is in flight.
      // Never resume polling for an adapter that Guardian has already stopped.
      if (this.bot !== bot) return
      // Do not use retry middleware for getMe above: authentication and rate
      // failures must reach the operator immediately. Delivery and polling
      // may retry transient Telegram failures after identity is verified.
      bot.api.config.use(autoRetry())
      if (this.ownerUserId && this.chatId) this.tracker.healthy(this.ownerUserId)
      else this.tracker.awaitingLink()
      void this.syncCommands(bot)
      // Inbound envelopes are journaled/deduplicated before dispatch, so pending
      // updates are safe to replay after a Connector restart.
      void bot.start().catch((error) => {
        if (this.bot !== bot) return
        this.tracker.degraded(error)
        console.warn('[connector] Telegram polling stopped:', error instanceof Error ? error.message : error)
      })
    } catch (error) {
      if (this.bot !== bot) return
      this.bot = undefined
      this.tracker.degraded(error)
      console.warn('[connector] Telegram authentication failed:', error instanceof Error ? error.message : error)
    }
  }

  private async syncCommands(bot: Bot): Promise<void> {
    try {
      await initializationDeadline(bot.api.setMyCommands(TELEGRAM_CONNECTOR_DEFINITION.commands.map(({ name, description }) => ({
        command: name,
        description,
      }))))
    } catch (error) {
      // Slash commands remain available to Telegram even when their suggested
      // menu cannot be refreshed. Do not downgrade a live delivery adapter.
      if (this.bot !== bot) return
      console.warn('[connector] Telegram command registration deferred:', error instanceof Error ? error.message : error)
    }
  }

  async stop(): Promise<void> {
    await this.bot?.stop().catch(() => undefined)
    this.bot = undefined
    this.tracker.stopped()
  }

  async deliver(notification: InboxNotification): Promise<void> {
    if (!this.bot) throw new Error('Telegram bot is not ready')
    if (!this.chatId) throw new Error('Telegram private chat is not linked')
    this.tracker.attempt()
    try {
      await this.bot.api.sendMessage(this.chatId, formatPlainInboxNotification(notification))
      for (const attachment of decodeInboxAttachments(notification)) {
        await this.bot.api.sendDocument(
          this.chatId,
          new InputFile(attachment.content, attachment.filename),
        )
      }
      this.tracker.success(this.ownerUserId)
    } catch (error) {
      this.tracker.degraded(error)
      throw error
    }
  }

  health(): ConnectorAdapterHealth {
    return this.tracker.get()
  }

  private registerCommands(context: ConnectorAdapterContext): void {
    context.commands.register('link', async ({ userId, chatId, reply }) => {
      if (this.ownerUserId && this.ownerUserId !== userId) {
        await reply('This connector is already linked to another account.')
        return
      }
      if (!chatId) throw new Error('Telegram private chat ID is missing')
      this.ownerUserId = userId
      this.chatId = chatId
      await context.updateSettings({ ownerUserId: userId, chatId })
      this.tracker.healthy(userId)
      await reply('Telegram is linked to this OpenAlice installation.')
    })
    context.commands.register('status', async ({ userId, reply }) => {
      if (!this.isOwner(userId)) return reply('This command is only available to the linked owner.')
      await reply(`OpenAlice Connector Service: ${context.getServiceStatus()}. Telegram: ${this.health().status}.`)
    })
    context.commands.register('test', async ({ userId, reply }) => {
      if (!this.isOwner(userId)) return reply('This command is only available to the linked owner.')
      const probeId = await context.sendTest(this.id)
      await reply(`Test notification sent. Probe: ${probeId}`)
    })
    context.commands.register('new', async ({ userId, chatId, reply }) => {
      if (!this.isOwner(userId)) return reply('This command is only available to the linked owner.')
      if (!chatId) throw new Error('Telegram private chat ID is missing')
      try {
        await context.rotateConversation(this.id, userId, chatId)
      } catch (error) {
        if (error instanceof Error && error.message.includes('external conversation is not bound')) {
          await reply('There is no linked bot conversation to restart yet. Telegram currently delivers Inbox notifications; use the OpenAlice web app to start a new chat.')
          return
        }
        throw error
      }
      await reply('Started a new conversation. Send your next message to begin; previous history is retained.')
    })
  }

  private isOwner(userId: string): boolean {
    return Boolean(this.ownerUserId && this.ownerUserId === userId)
  }
}

export function telegramConnectorRegistration(): ConnectorAdapterRegistration {
  return { definition: TELEGRAM_CONNECTOR_DEFINITION, create: () => new TelegramConnectorAdapter() }
}

function requiredString(config: ConnectorAdapterConfig, key: string): string {
  const value = config.settings[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Telegram setting ${key} is required`)
  return value.trim()
}

function optionalString(config: ConnectorAdapterConfig, key: string): string | undefined {
  const value = config.settings[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function initializationDeadline<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Telegram initialization timed out after ${TELEGRAM_INITIALIZATION_TIMEOUT_MS / 1_000}s`))
        }, TELEGRAM_INITIALIZATION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
