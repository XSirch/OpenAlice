# Changelog

All notable changes to OpenAlice will be documented in this file.

## [Unreleased]

### Alice Invest

- Add B3 shadow-mode signal recording with source/session gates, idempotent
  ledger creation and explicit no-delivery behavior.
- Add a reproducible 24/7 spot-crypto backtest with versioned candles,
  next-candle fills, fees, slippage and no-lookahead signal decisions.
- Add a reproducible B3 strategy backtest over versioned fixtures with explicit
  America/Sao_Paulo session checks, next-session fills, fees, slippage and
  no-lookahead signal decisions.
- Add a pure Telegram signal formatter that renders only validated structured
  signal data, preserves Decimal precision, states validity/invalidation and
  explicitly confirms that no order is sent or result guaranteed.
- Add an append-only, private signal ledger with idempotent event handling and
  a current-state projection; migration 0027 seeds its persisted shape.
- Add a deterministic fail-closed signal risk validator for freshness, spread,
  liquidity, reward/risk, cooldown, limits and prohibited operational capabilities.
- Add a transparent spot-only crypto crossover candidate strategy that rejects
  stale data and cannot model derivatives, margin or leverage.
- Add a transparent B3 trailing SMA-crossover candidate strategy that emits
  only on fresh realtime input and remains silent for delayed or stale data.
- Add trailing annualized volatility to the existing no-lookahead indicator
  suite, which already covers SMA, EMA, RSI, MACD, ATR, VWAP, bands, ROC and volume.
- Define strict observation, candidate and informational-signal contracts with
  decimal strings, provenance, validity and `BUY` as the sole initial side.
- Add bounded B3/crypto universes and explicit scan gates for switch, session,
  realtime capability and Decimal liquidity.
- Add fail-closed crypto source evidence checks for fresh spot-only data; no
  configured source exists yet, so crypto remains `research_only`.
- Add fail-closed B3 intraday-source evidence evaluation and record the current
  credential block; B3 remains `research_only` until real read-only evidence exists.
- Add a deterministic fixed-income comparison that exposes projected return,
  liquidity, issuer, maturity, FGC, assumptions and gaps without recommendations.
- Add Decimal-only fixed-income projection, including CDI/IPCA rates and the
  Brazilian regressive IR/IOF schedules.
- Connect the fast path and validated structured transport in a correlation-
  preserving router that fails safely to clarification.
- Define an allowlisted router-decision schema with bounded tasks and explicit
  clarification; it contains no executable tool destination.
- Validate structured-router output fail-closed, with redacted telemetry and
  explicit fallback for malformed JSON or schema mismatch.
- Add a narrow direct structured-router transport with bounded context,
  timeout and transient retry; it has no tool, Session or vault access.
- Add a fail-closed normalized market-observation contract: timestamps and
  source are mandatory, quote fields are retained when available, and an
  unproven source remains `unknown` rather than realtime.
- Define strict fixed-income product contracts for issuer, rate, dates,
  liquidity, FGC, fees and assumptions; CDI is retained solely as a reference
  rate, never as a product.
- Add a conservative local router fast path with allowlisted commands and
  pre-provider blocking for imperative execution requests.
- Decide the structured-router boundary: local rules remain the fast path and
  execution block, while a future narrow direct client handles validated
  ambiguity. The live OpenRouter measurement is explicitly blocked pending an
  owner-created Custom experiment credential; no runtime integration is added.
- Add owner-authorized `/new` conversation rotation for Telegram and Discord.
  The Connector authenticates the rotation request to Alice and retains the
  previous Session history.
- Route authenticated inbound conversations through their bound resumed Session,
  with per-conversation serialization and Inbox unavailability fallback.
- Recover persisted/forwarded inbound work after Connector restart and retain
  pending Telegram updates now that journal deduplication protects replay.
- Add an authenticated, correlation-preserving Connector-to-Alice inbound
  bridge with process-local idempotency protection.
- Add bounded generic inbound dispatch with transient-only retry, timeout, and
  durable dead-letter state.
- Persist and deduplicate inbound Connector envelopes atomically, retaining
  pending work while compacting only terminal journal records.
- Define the Connector inbound lifecycle, acknowledgement boundary, and stable
  update/message dedupe key before durable storage is introduced.
- Define the strict, versioned generic Connector inbound-text contract with
  bounded UTF-8 text, external IDs, correlation, and receipt time. It does not
  yet persist, dispatch, bind conversations, or enable an adapter.
- Add the fail-closed Alice Invest safety foundation: private configuration,
  disabled execution, default-off switches, payload/path limits, and migration
  seeding. No runtime capability is enabled.
- Define fork governance before functional Alice Invest work: XSirch/OpenAlice
  is the sole automatic remote, while any TraderAlice/OpenAlice synchronization
  requires explicit owner authorization.
- Add the Alice Invest architecture diagnosis and phased executable backlog.
- Keep the initial product read-only and cap readiness at `paper_alerts`; this
  documentation increment enables no Telegram, model, signal, or execution
  behavior.
- Reorganize the backlog around a topological delivery graph, remove artificial
  fixed-income and scan dependencies, and split inbound, signal, security, and
  observability work into focused tasks.
- Move basic security controls to the foundation and add decision gates for
  OpenRouter, validated B3 intraday data, shadow mode, and signal monitoring;
  no runtime functionality is enabled.
- Require completed inbound recovery before Session binding, decouple B3 and
  crypto backtests/shadow/readiness/alerts, and move the readiness core before
  alert delivery. Fork governance now precedes functional implementation; no
  runtime functionality is enabled.

### 🏗️ Architecture — UTA-split v1

Split the trading domain into a dedicated UTA service co-located with
Alice. Broker connections, the git-like approval state machine, snapshot
scheduling, FX, and the broker SDKs (CCXT / Alpaca / Longbridge / IBKR
TWS port) all live in `services/uta/` now. Alice talks to UTA over
loopback HTTP through `UTAManagerSDK` + `UTAAccountSDK` — the public
surface (`ctx.utaManager`, the 19 AI trading tools, `UnifiedTradingAccount`
method shapes) is preserved, the implementation underneath swapped to
an HTTP adapter.

Three carriers of the L2 supervisor (Guardian) now share a module:
`scripts/guardian/{shared.ts, dev.ts, prod.mjs}`. Guardian probes
ports, spawns UTA + Alice (+ Vite in dev), gates Alice's boot on
`/__uta/health`, and watches `data/control/restart-uta.flag` for
config-change-triggered UTA respawns.

Docker image now produces both `dist/main.js` (Alice) and
`services/uta/dist/uta.js` (UTA), runs them under tini + Guardian.

Shared wire types + the broker preset catalog moved into a new
`@traderalice/uta-protocol` workspace package. Alice ↔ UTA both depend
on this; it's the long-term boundary contract if UTA later migrates to
a separate carrier (mobile / home server / etc).

Not yet shipped: auth gate between Alice and UTA (deliberately deferred
— v1 binds UTA to 127.0.0.1 and trusts same-host); public-internet
deployment + admin-token session cookie path; physical UTA migration
off the Alice host.

### Config

- Default crypto to bybit demo, securities to alpaca paper with tickers

### Merge

- Unified trading architecture + AGPL-3.0 relicense

### ⚙️ CI

- Add GitHub Actions workflow and fix time-sensitive test

### ⚡ Performance

- Decouple CCXT init from startup, allow plugins to start immediately

### 🎨 UI

- Polish frontend design — chat input, sidebar, card system
- Round 2 polish — shared components, transitions, table hover
- Round 3 polish — toast system, send spinner, mobile fixes

### 🐛 Bug Fixes

- Inject persona + brain state into Claude Code provider
- Extract assistant text when Claude Code result is empty
- Align SettingsPanel with actual backend config structure
- Use --disallowedTools instead of --allowedTools for evolution mode
- Restore --allowedTools and hot-reload evolutionMode
- **ui**: Batch quality fixes — XSS, toggle, SSE dedup, error feedback
- Default mcpPort to 3001 so MCP tools server always starts
- Inject MCP tool permissions via --allowedTools, gitignore .claude/
- Skip crypto trading tools when engine is null
- **openbb**: Remove commodity from provider config, fix provider option lists
- Pass ccxt options under `options` key instead of spreading at top level
- **tools**: Set correct providers for equity fundamental and news tools
- **openbb**: Split news providers and handle 204 No Content
- Make MCP Server always-on — Claude Code provider depends on it for tools
- **test**: Update engine.spec.ts to match new VercelAIProvider constructor
- Connectors config auto-init and migration defaults
- Derive validSections from sectionSchemas to prevent config API drift
- **news-collector**: Retry RSS fetch once on failure
- **docs**: Replace Mermaid & syntax for broader renderer compatibility
- SSE stability — auto-reconnect with exponential backoff
- Clarify searchContracts/getContractDetails tool descriptions
- Update stale equitySearch/cryptoSearch references in tool descriptions
- Soften marketSearchForResearch description to avoid mandatory pre-search
- Seed platforms.json + accounts.json to disk on legacy migration
- Sequential loadMarkets with per-type retries for CCXT
- Add init retry with exponential backoff for AlpacaAccount
- Enforce aliceId as required contract identifier for trading tools
- **opentypebb**: Point exports to src/ so tsx resolves without build
- Upgrade opentypebb hono 4.7.4 → 4.12.7 to resolve type mismatch
- Allow 'agent-sdk' in backend switch API validation
- **ui**: Persist streamed tool calls and show thinking dots during text generation
- **ci**: Let pnpm version come from package.json packageManager field
- **streaming**: Push intermediate text events from Claude Code and Agent SDK providers
- **session**: Persist intermediate text blocks during tool loops

### 📚 Documentation

- Sync README with recent features
- Document Web UI dev workflow and dual-port architecture
- Sync README with OpenBB integration and provider default change
- Overhaul README to reflect recent architecture changes
- Delete stale scheduling.md, fix mcp-ask config section
- Add Key Concepts glossary and simplify Quick Start
- Delete stale scheduling_zh.md
- Remove dead live demo link, update header badges
- Add browser tool description prefix clarifying Chrome extension requirement
- Update README for unified trading architecture and AGPL-3.0
- Update README to reflect TypeScript-native OpenBB engine
- Update README for Engine removal, Agent SDK, and ConnectorCenter rename
- Add CI and license badges, remove redundant license section
- Add contributing guide (issues welcome, PRs not accepted)

### 🔧 Refactoring

- Split persona/heartbeat into default + user override
- Move Settings from slide drawer to dedicated page tab
- Unify AI provider default into Zod config system
- **ui**: Replace header tabs with sidebar navigation and widescreen layout
- Split analysis-kit into thinking-kit + analysis-tools
- Split Sandbox into KlineStore + NewsStore
- Merge analysis-kit + analysis-tools into archive-analysis
- Disconnect archive-analysis from runtime
- Remove lookback from indicator formula, use interval-based data window
- Extract unified indicator calculator to extension/analysis-kit
- **openbb**: Per-asset-class default provider instead of single global default
- **ui**: Extract shared form components and deduplicate config pages
- Absorb archive-analysis into news-collector, delete dead module
- Remove trading whitelist, replace with optional symbol-whitelist guard
- Consolidate AI provider config into single file and dedicated page
- Unify connector interface with structured delivery
- Introduce ConnectorCenter to centralize outbound notification logic
- Event-driven interaction tracking in ConnectorCenter
- Simplify heartbeat status to binary HEARTBEAT_OK / CHAT_YES
- Rename wallet* to trading*, make commit/push/sync source optional
- Provider tool injection + slim AccountCapabilities
- Remove adjustLeverage and leverage from OrderRequest
- IBKR-aligned OrderRequest + modifyOrder + dead code cleanup
- Split resolveContract into searchContracts + getContractDetails
- Unify equitySearch + cryptoSearch + currencySearch into marketSearchForResearch
- Merge platform into account flow in TradingPage
- Replace slide panel with centered modal dialogs
- Split CcxtAccount into smaller modules
- Split AlpacaAccount into smaller modules
- **ai-provider**: Align VercelAIProvider with ClaudeCodeProvider interface
- **ui**: Redesign DataSourcesPage with two distinct conceptual zones
- AgentCenter becomes orchestration center, providers slim down, Engine deleted
- **persistence**: Unify session persistence in AgentCenter

### 🚀 Features

- Add MCP Ask connector for external agent conversation
- Add evolution mode — two-tier permission system
- Auto-seed config files on first startup, untrack from git
- **ui**: Add responsive sidebar — collapse to hamburger menu on narrow screens
- **ui**: Add section descriptions to Settings and fix nav highlight
- **ui**: Beautify chat — ChatGPT/Claude-style layout, code copy, animations
- **ui**: Polish layout — SVG sidebar icons, Alice avatar, message grouping, safe area
- Add OpenBB equity data layer (src/openbb/equity)
- Equity symbol search with local regex index
- Equity indicator calculator with OpenBB data
- Make interval a required parameter in indicator formula syntax
- Add OpenBB crypto data layer (types + client)
- Add OpenBB commodity data layer (types + client)
- Add EIA petroleum status and energy outlook endpoints to commodity client
- Add OpenBB currency data layer (types + client)
- Add crypto search tool (adapter layer)
- Add currency search tool (adapter layer)
- Register crypto search, currency search, and analysis-kit tools
- Add Data Sources page with connection test and provider key management
- **web**: Render tool calls as collapsible groups in chat history
- Add multi-provider model support with hot-reload
- **openbb**: Inject provider credentials via HTTP header and add economy client
- **ui**: Expand provider keys to 8 providers with descriptions
- **ui**: Add per-provider Test button for API key validation
- **ccxt**: Add ticker, funding rate queries and fix realizedPnL
- **ccxt**: Expose order book depth query for liquidity evaluation
- **alpaca**: Add real-time quote and native closePosition
- **crypto**: Add extensible guard pipeline for trading operations
- **ui**: Add Crypto Trading config page with exchange and guard management
- **ui**: Replace manual save buttons with auto-save and debounce
- **securities**: Add extensible guard pipeline for trading operations
- **ui**: Add Securities Trading config page with broker and guard management
- **openbb**: Add News client and complete Commodity client coverage
- **tools**: Expose equity fundamentals and news tools to AI loop
- **ui**: Add Portfolio Dashboard + split routes and API into domain modules
- **ui**: Add card-based SDK selector and enable/disable toggles to trading pages
- **ui**: Add sidebar nested navigation for trading config pages
- Consolidate connector configs into connectors.json with enable/disable toggles
- **ui**: Multi-select card grid for connectors enable/disable
- **news-collector**: Add persistent news collection with RSS and OpenBB piggyback
- Hot-reload connector enable/disable without restart
- **ui**: Add News Collector section to DataSourcesPage with enable/disable cards
- Add Custom provider option for relay/proxy endpoints
- Add /dev debug page + rename deliver() to send() with kind
- Persist push messages to session for history survival
- Persistent media store with 3-word content-addressable names
- Image ContentBlock + date-based media storage
- Add paginated event log with full disk history
- Add dedicated Heartbeat page with config, prompt editor, and recent events
- Add Tool Panel for granular tool enable/disable with hot-reload
- Add unified trading types — Contract, ITradingAccount, AccountManager, TradingGit
- Add unified guard pipeline — merge crypto + securities guards
- Unified trading architecture — provider adapters, tool factory, main.ts rewrite
- Add test coverage, fix CCXT bug, merge frontend trading UI
- Unified multi-account tool routing with source parameter
- Aggregate getQuote across all accounts
- Add read-only mode to CcxtAccount for keyless market data access
- Introduce Platform layer for multi-account trading
- Trading config CRUD API + table/panel UI redesign
- Alpaca realized PnL via FILL activities + Portfolio page redesign
- Add React Router for URL-based navigation
- Replace Python OpenBB sidecar with in-process OpenTypeBB SDK
- **openbb**: Add backend selector and embedded API server support
- **opentypebb**: Add ~40 economy/commodity routes with FRED, OECD, BLS, EIA providers
- **web**: Add sub-channel support with per-channel AI config
- **ui**: Redesign channel UI with popover + config modal
- Per-channel Vercel AI SDK model override (provider/model/baseUrl/apiKey)
- Add Agent SDK as third AI provider backend
- **ui**: Add Agent SDK to frontend provider UI
- Add streaming event layer to AI providers
- **ui**: Consume SSE streaming events for real-time AI response progress

### 🧪 Testing

- Add 48 unit tests for equity indicator calculator
- Add unit tests for trading dispatchers and wallet state machines
- Add message pipeline integration tests (42 tests)
- Add core module unit tests (134 tests)

