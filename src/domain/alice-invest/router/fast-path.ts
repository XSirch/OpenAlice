export type InvestFastPathResult =
  | { kind: 'local_command'; command: 'help' | 'portfolio' | 'settings' | 'alerts' | 'status' | 'new' }
  | { kind: 'pass_through' }
  | { kind: 'block_execution_request'; reason: 'execution_disabled' }

type LocalCommand = Extract<InvestFastPathResult, { kind: 'local_command' }>['command']
const LOCAL_COMMANDS = new Set<LocalCommand>([
  'help', 'portfolio', 'settings', 'alerts', 'status', 'new',
])

// This intentionally detects a request to perform an operation, not a market
// recommendation. The former must be rejected before any model/provider path.
const EXECUTION_REQUEST = /^(?:(?:por\s+favor|please)\s+)?(?:buy|sell|execute|trade|place\s+(?:an?\s+)?order|compre|venda|execute|(?:fa[cç]a|coloque|envie)\s+(?:uma\s+)?ordem|(?:quero|vamos)\s+(?:comprar|vender|executar))\b/i
const CLEAR_INFORMATIONAL_REQUEST = /^(?:oi|ol[aá]|hello|help|ajuda|status|portfolio|carteira|configura[cç][aã]o|configura[cç][oõ]es|alertas|alerts)\s*[?.!]*$/i

/**
 * Handles only input whose meaning is independent of market analysis. Undefined
 * is deliberate: ambiguity proceeds to the structured-router decision rather
 * than being guessed locally.
 */
export function classifyInvestFastPath(input: string): InvestFastPathResult | undefined {
  const text = input.trim()
  if (!text) return undefined
  if (EXECUTION_REQUEST.test(text)) return { kind: 'block_execution_request', reason: 'execution_disabled' }

  const command = text.match(/^\/([a-z_]+)(?:\s+.*)?$/i)?.[1]?.toLowerCase()
  if (command && LOCAL_COMMANDS.has(command as LocalCommand)) {
    return { kind: 'local_command', command: command as LocalCommand }
  }
  if (CLEAR_INFORMATIONAL_REQUEST.test(text)) return { kind: 'pass_through' }
  return undefined
}
