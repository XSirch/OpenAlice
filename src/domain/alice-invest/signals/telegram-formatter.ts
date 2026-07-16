import { informationalSignalSchema, type InformationalSignal, type SignalObservation } from './contracts.js'

/**
 * Renders an informational signal as a bounded plain-text Telegram message.
 * The formatter intentionally has no access to market data, clocks, accounts,
 * or order APIs: every displayed fact comes from the validated signal object.
 */
export function formatTelegramSignal(value: InformationalSignal): string {
  const signal = informationalSignalSchema.parse(value)
  const source = latestObservation(signal.candidate.observations)
  const lines = [
    `SINAL INFORMATIVO — ${signal.side} ${signal.candidate.symbol}`,
    `Estratégia: ${signal.candidate.strategyId} v${signal.candidate.strategyVersion}`,
    `Status: ${signal.status}`,
    `Fonte: ${source.source} (${source.capability})`,
    `Horário da fonte: ${source.sourceTimestamp}`,
    `Recebido em: ${source.receivedAt}`,
    `Validade: ${signal.candidate.validUntil}`,
    `Preço de referência: ${source.close}`,
    `Alvo: ${signal.candidate.targetPrice}`,
    `Invalidação: preço em ou abaixo de ${signal.candidate.stopPrice}`,
    `Fundamentos: ${signal.rationale.join('; ')}`,
    `Riscos: ${signal.candidate.riskNotes.join('; ')}`,
    'Nenhuma ordem será enviada. Este alerta é somente informativo e não garante resultado.',
  ]
  return lines.join('\n')
}

function latestObservation(observations: SignalObservation[]): SignalObservation {
  return observations.reduce((latest, observation) =>
    observation.sourceTimestamp > latest.sourceTimestamp ? observation : latest,
  )
}
