import { describe, expect, it } from 'vitest'
import { formatTelegramSignal } from './telegram-formatter.js'

const signal = {
  id: '00000000-0000-4000-8000-000000000001',
  side: 'BUY' as const,
  status: 'informational' as const,
  createdAt: '2026-07-16T12:00:00.000Z',
  rationale: ['Cruzamento confirmado com dados recentes'],
  candidate: {
    strategyId: 'b3-trend-crossover', strategyVersion: '1', symbol: 'PETR4',
    observations: [
      { symbol: 'PETR4', source: 'B3 fixture', sourceTimestamp: '2026-07-16T11:58:00.000Z', receivedAt: '2026-07-16T11:58:01.000Z', capability: 'realtime' as const, close: '30.0100' },
      { symbol: 'PETR4', source: 'B3 fixture', sourceTimestamp: '2026-07-16T11:59:00.000Z', receivedAt: '2026-07-16T11:59:02.000Z', capability: 'realtime' as const, close: '30.0200', volume: '1000.00' },
    ],
    targetPrice: '31.234500', stopPrice: '29.9900', validUntil: '2026-07-16T13:00:00.000Z',
    riskNotes: ['Liquidez e spread devem permanecer dentro dos limites configurados'], status: 'eligible' as const,
  },
}

describe('Telegram signal formatter', () => {
  it('renders only structured signal fields in a conservative Telegram snapshot', () => {
    expect(formatTelegramSignal(signal)).toMatchInlineSnapshot(`
      "SINAL INFORMATIVO — BUY PETR4
      Estratégia: b3-trend-crossover v1
      Status: informational
      Fonte: B3 fixture (realtime)
      Horário da fonte: 2026-07-16T11:59:00.000Z
      Recebido em: 2026-07-16T11:59:02.000Z
      Validade: 2026-07-16T13:00:00.000Z
      Preço de referência: 30.0200
      Alvo: 31.234500
      Invalidação: preço em ou abaixo de 29.9900
      Fundamentos: Cruzamento confirmado com dados recentes
      Riscos: Liquidez e spread devem permanecer dentro dos limites configurados
      Nenhuma ordem será enviada. Este alerta é somente informativo e não garante resultado."
    `)
  })

  it('preserves Decimal strings exactly and never introduces a result promise', () => {
    const message = formatTelegramSignal(signal)
    expect(message).toContain('Preço de referência: 30.0200')
    expect(message).toContain('Alvo: 31.234500')
    expect(message).toContain('Invalidação: preço em ou abaixo de 29.9900')
    expect(message).toContain('Nenhuma ordem será enviada')
    expect(message).toContain('não garante resultado')
  })
})
