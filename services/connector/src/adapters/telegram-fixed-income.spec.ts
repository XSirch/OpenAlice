import { describe, expect, it, vi } from 'vitest'

import { CommandRegistry, type ConnectorAdapterContext } from '../core/adapter.js'
import { registerFixedIncomeTelegramCommand } from './telegram.js'

function context(readLocalJson: ConnectorAdapterContext['readLocalJson']): ConnectorAdapterContext {
  return {
    commands: new CommandRegistry('telegram'), updateSettings: vi.fn(), getServiceStatus: () => 'healthy', sendTest: vi.fn(),
    acceptInbound: vi.fn(), rotateConversation: vi.fn(), readLocalJson,
  }
}

describe('Telegram fixed-income command', () => {
  it('returns the bounded local read-only summary to the linked owner', async () => {
    const readLocalJson = vi.fn(async () => ({ message: 'RENDA FIXA — RESUMO READ-ONLY\nNenhuma ordem pode ser enviada.' }))
    const value = context(readLocalJson)
    registerFixedIncomeTelegramCommand(value, (userId) => userId === 'owner')
    const reply = vi.fn(async (_message: string) => undefined)
    await expect(value.commands.execute({ connectorId: 'telegram', command: '/renda_fixa', userId: 'owner', chatId: 'private', reply })).resolves.toBe(true)
    expect(readLocalJson).toHaveBeenCalledWith('/api/connector-inbound/fixed-income-summary')
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Nenhuma ordem'))
  })

  it('rejects an unlinked account before reading Alice data', async () => {
    const readLocalJson = vi.fn()
    const value = context(readLocalJson)
    registerFixedIncomeTelegramCommand(value, () => false)
    const reply = vi.fn(async (_message: string) => undefined)
    await value.commands.execute({ connectorId: 'telegram', command: 'renda_fixa', userId: 'stranger', reply })
    expect(readLocalJson).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith('This command is only available to the linked owner.')
  })
})
