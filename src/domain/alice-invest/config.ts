import { isAbsolute, normalize, sep } from 'node:path'
import { z } from 'zod'

export const ALICE_INVEST_CONFIG_VERSION = 1
export const ALICE_INVEST_PRIVATE_FILE_MODE = 0o600

export const aliceInvestReadinessStateSchema = z.enum([
  'not_ready',
  'research_only',
  'paper_alerts',
  'validated_alerts',
  'read_only_broker',
  'live_execution',
])
export type AliceInvestReadinessState = z.infer<typeof aliceInvestReadinessStateSchema>

/** Product safety ceiling for this fork. Future documentary states remain
 * representable for evidence, but configuration can never enable them. */
export const aliceInvestEnabledReadinessSchema = z.enum([
  'not_ready',
  'research_only',
  'paper_alerts',
])

const readinessByCapabilitySchema = z.object({
  global: aliceInvestEnabledReadinessSchema.default('not_ready'),
  fixed_income: aliceInvestEnabledReadinessSchema.default('research_only'),
  crypto_signals: aliceInvestEnabledReadinessSchema.default('research_only'),
  b3_signals: aliceInvestEnabledReadinessSchema.default('research_only'),
}).strict()
const defaultReadinessByCapability = {
  global: 'not_ready',
  fixed_income: 'research_only',
  crypto_signals: 'research_only',
  b3_signals: 'research_only',
} as const

const killSwitchesSchema = z.object({
  telegram_inbound_enabled: z.boolean().default(false),
  market_scans_enabled: z.boolean().default(false),
  signal_notifications_enabled: z.boolean().default(false),
  active_signal_monitor_enabled: z.boolean().default(false),
}).strict()
const defaultKillSwitches = {
  telegram_inbound_enabled: false,
  market_scans_enabled: false,
  signal_notifications_enabled: false,
  active_signal_monitor_enabled: false,
} as const

const limitsSchema = z.object({
  max_inbound_text_bytes: z.number().int().min(1).max(65_536).default(16_384),
  max_external_id_chars: z.number().int().min(1).max(512).default(256),
  max_correlation_id_chars: z.number().int().min(1).max(256).default(128),
  max_pending_inbound_messages: z.number().int().min(1).max(100_000).default(1_000),
}).strict()
const defaultLimits = {
  max_inbound_text_bytes: 16_384,
  max_external_id_chars: 256,
  max_correlation_id_chars: 128,
  max_pending_inbound_messages: 1_000,
} as const

const securityPolicySchema = z.object({
  redact_external_identifiers: z.literal(true).default(true),
  allow_absolute_paths: z.literal(false).default(false),
  allow_path_traversal: z.literal(false).default(false),
  require_private_file_permissions: z.literal(true).default(true),
}).strict()
const defaultSecurityPolicy = {
  redact_external_identifiers: true,
  allow_absolute_paths: false,
  allow_path_traversal: false,
  require_private_file_permissions: true,
} as const

/**
 * Central, intentionally narrow product configuration. Execution is not a
 * toggle: only false parses. Secrets stay in the existing sealed vaults.
 */
export const aliceInvestConfigSchema = z.object({
  version: z.literal(ALICE_INVEST_CONFIG_VERSION).default(ALICE_INVEST_CONFIG_VERSION),
  execution_enabled: z.literal(false).default(false),
  readiness: readinessByCapabilitySchema.default(defaultReadinessByCapability),
  kill_switches: killSwitchesSchema.default(defaultKillSwitches),
  limits: limitsSchema.default(defaultLimits),
  security: securityPolicySchema.default(defaultSecurityPolicy),
}).strict()
export type AliceInvestConfig = z.infer<typeof aliceInvestConfigSchema>

export function defaultAliceInvestConfig(): AliceInvestConfig {
  return aliceInvestConfigSchema.parse({})
}

/** Shared file-policy guard for future Alice Invest state and artifacts. */
export function assertSafeAliceInvestRelativePath(value: string): string {
  if (!value || value.includes('\0') || isAbsolute(value)) {
    throw new Error('Alice Invest paths must be non-empty relative paths')
  }
  const normalized = normalize(value)
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error('Alice Invest paths must not escape their configured root')
  }
  return normalized
}
