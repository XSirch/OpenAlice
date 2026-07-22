import type { PublicOpenFinanceConfig } from '@/core/open-finance-config.js'
import type { UTAConfig } from '@/core/config.js'

const PLUGGY_UTA_ID = 'meu-pluggy'

/**
 * Build the non-editable funded read-only UTA created from Open Finance setup.
 * The account record carries no credentials: the adapter reads the sealed
 * configuration directly when it connects.
 */
export function buildOpenFinanceUTAs(
  config: PublicOpenFinanceConfig,
  existingIds: ReadonlySet<string>,
): UTAConfig[] {
  if (!config.pluggy.enabled || !config.pluggy.configured || existingIds.has(PLUGGY_UTA_ID)) return []
  return [{
    id: PLUGGY_UTA_ID,
    label: 'MeuPluggy',
    presetId: 'pluggy-readonly',
    enabled: true,
    guards: [],
    presetConfig: {},
    keyless: false,
    readOnly: true,
    asVendor: false,
    editable: false,
  }]
}

export { PLUGGY_UTA_ID }
