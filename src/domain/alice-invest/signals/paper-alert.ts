import type { IInboxStore } from '../../../core/inbox-store.js'
import type { InformationalSignal } from './contracts.js'
import { formatTelegramSignal } from './telegram-formatter.js'

export type PaperAlertCapability = 'b3_signals' | 'crypto_signals'
export interface PaperAlertInput {
  capability: PaperAlertCapability
  readiness: 'not_ready' | 'research_only' | 'paper_alerts'
  notificationsEnabled: boolean
  workspaceId: string
  signal: InformationalSignal
}
export type PaperAlertResult = { delivered: true; inboxId: string } | { delivered: false; reason: string }

/** Inbox is the only outbound boundary. This function has no broker/UTA path. */
export async function dispatchPaperAlert(store: IInboxStore, input: PaperAlertInput): Promise<PaperAlertResult> {
  if (input.readiness !== 'paper_alerts') return { delivered: false, reason: `${input.capability} is not paper_alerts` }
  if (!input.notificationsEnabled) return { delivered: false, reason: 'signal notifications are disabled' }
  const entry = await store.append({ workspaceId: input.workspaceId, comments: formatTelegramSignal(input.signal) })
  return { delivered: true, inboxId: entry.id }
}
