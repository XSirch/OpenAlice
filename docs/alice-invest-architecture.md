# Alice Invest Architecture

Status: proposed foundation. This document enables no runtime behavior.

## Purpose and boundary

Alice Invest is a private, single-owner investment assistant delivered through
Telegram. Version 1 may research, compare, screen, and publish informational
alerts. It must never submit, amend, cancel, or cause a financial order. Its
maximum readiness is `paper_alerts`, and `execution_enabled` is fixed to
`false` rather than being an operator-controlled switch.

The product extends OpenAlice's Workspace, Session, Issue, Inbox, Connector,
credential, ToolCenter, analysis, and market-data abstractions. It does not add
a second agent loop, scheduler, Inbox, session manager, credential store, or
database.

## Execution order and focused delivery

The backlog is executed by its dependency graph (`execution_order: topological`
in `tasks.json`), not merely by phase number. The current delivery order is:

1. `AINV-P0` Architecture, basic security, and fork governance.
2. `AINV-P1` Telegram inbound and reliable transport.
3. `AINV-P2` External-conversation binding and Session dispatch.
4. `AINV-P3` OpenRouter and the structured-router decision.
5. `AINV-P4` Message orchestrator.
6. `AINV-P5` Fixed income.
7. `AINV-P6` Market data.
8. `AINV-P7` Signal contracts and engine.
9. `AINV-P8` Shadow mode and validation.
10. `AINV-P9` Alerts and monitoring.
11. `AINV-P10` Observability, documentation, and readiness.

Each task is one focused commit and PR. Generic OpenAlice changes are isolated
from Alice Invest product modules, and no implementation task is considered
done merely because its design exists. Deterministic fixed-income work can
proceed after the security foundation without waiting for Telegram, OpenRouter,
or the router. Likewise, market scanning depends on validated data, the signal
engine, risk validation, and readiness — never on fixed income.

Fork governance is a prerequisite for the first functional task: the initial
path is architecture (`AINV-T000`), executable backlog (`AINV-T001`), fork
governance (`AINV-T005`), security foundation (`AINV-T006`), then the generic
inbound contract (`AINV-T110`).

## Current architecture

Guardian supervises Alice, optional UTA, and optional Connector Service. Alice
owns Workspaces, native CLI agent runtimes, ToolCenter, HTTP/IPC, file-backed
state, Issues, Sessions, provenance, and Inbox. UTA exclusively owns broker
connections, account state, and trading writes. It remains optional and gains
no Alice Invest write path.

Connector Service currently projects durable Inbox entries outward. Alice
appends locally before a non-blocking bridge posts an `InboxNotification` to
the loopback service. Telegram uses grammY long polling, serves one private
owner/chat, supports `/link`, `/status`, and `/test`, and sends text/report
attachments. Ordinary messages are ignored. Startup currently sets
`drop_pending_updates: true`; reliable inbound work must remove that loss mode
and add persistence rather than create a separate bot.

Conversation continuity already exists. `ResumeRegistry` owns product
`resumeId` values and mappings to runtime-native conversations;
`SessionRegistry` and the headless registry own materialized sessions and
turns. A Workspace is context, not identity. Telegram needs a durable external
conversation binding to an existing `resumeId`, not a new session store.

Automation is a Markdown Issue at `.alice/issues/<id>.md`. `ScheduleScanner`
interprets `when`, records last-fired markers, and dispatches canonical Issue
Markdown to a native CLI. User-visible output uses `inbox_push`; a successful
no-op is silent. Cron is a wall clock, not an exchange calendar.

Market data has TraderHub/reference boards for low-frequency research,
`BarService` for explicit `barId` K-lines and quantitative work, and a private
provider compatibility layer. New price-history sources belong behind
BarService. Existing deterministic analysis/indicator code should be extended.

ToolCenter is the single tool registry; WorkspaceToolCenter supplies trusted
Workspace/Session identity. Credentials are sealed centrally and injected into
compatible native CLIs. `src/ai-providers` is a preset catalog, not a model
engine. OpenRouter should therefore enter through the credential vault and
native runtime wire configuration. A direct client is justified only for the
structured router if a measured spike proves native CLI latency/cost unsuitable.

## Reuse and ownership

| Need | Existing owner | Decision |
| --- | --- | --- |
| Context | Workspace/template | One durable Alice Invest Workspace |
| Continuity | Resume/Session registries | Bind private chat to `resumeId`; `/new` rotates it |
| Agent turns | Native CLI runtime | Reuse headless continuation |
| Scheduling | Markdown Issues | Hourly scan and monitor are Issues |
| Delivery | Inbox + Connector | All replies/alerts append before Telegram delivery |
| Tools | ToolCenter | Register deterministic product tools |
| Data | TraderHub + BarService | Reference research and timestamped bars |
| Analysis | `src/domain/analysis` | Extend indicators/simulation |
| Secrets | sealed configs/provider vault | Telegram/OpenRouter keys never enter git |
| Audit | journals, runs, provenance, tool log | Correlate existing evidence |
| Brokers | UTA | Future read-only source only; no execution |

Generic core changes:

- Versioned, bounded `ConnectorInboundMessage` schema in connector protocol.
- Generic adapter inbound publication without platform-ID dispatch branches.
- Authenticated loopback Connector-to-Alice endpoint; loopback alone is not
  authentication.
- Durable inbound journal, atomic checkpoints, dedupe, retry, and recovery.
- Alice inbound dispatcher using Workspace Sessions and Inbox.
- OpenRouter credential preset with `openai-chat` wire and configurable models.
- Safe correlation, health, counters, and redaction.

Before any of those modules, the security foundation defines one central Alice
Invest configuration schema. It begins at `not_ready`, treats
`execution_enabled: false` as a type-level invariant rather than an operational
switch, and defines the four default-deny kill switches:
`telegram_inbound_enabled`, `market_scans_enabled`,
`signal_notifications_enabled`, and `active_signal_monitor_enabled`. The same
foundation owns payload limits, redaction, correlation IDs, file-path and
permission policy, and parsing tests that fail closed. Advanced audit views,
aggregate metrics, and operational UI deliberately arrive later.

Product-specific code belongs in an isolated domain/template/skills: proposed
`src/domain/alice-invest/`, `src/workspaces/templates/alice-invest/`, and
`default/skills/alice-invest-*`. It owns Brazilian fixed income, router policy,
universe/freshness policy, strategies, risk, formatting, signal state, and
readiness. Final placement must follow template packaging/upgrade conventions.

## Telegram flow

```text
Telegram private text
  -> Telegram adapter (linked owner, type/size checks)
  -> durable inbound journal (update/message dedupe)
  -> authenticated loopback delivery + correlation id
  -> Alice inbound dispatcher
  -> connector+chat+owner binding -> Workspace resumeId
  -> local command / Invest Message Router / native Session turn
  -> Inbox append with provenance and reply correlation
  -> existing Inbox bridge -> Connector -> Telegram
```

The Connector persists before forwarding. Alice stores an idempotent receipt
before dispatch, serializes turns per conversation, and completes only after
Inbox append. Retries may repeat transport, never the model turn or visible
reply. `/new` replaces only the binding; it does not delete history. Bounds
cover UTF-8 size, timeouts, attempts, pending count/age, and visible dead-letter
state. Agent-unavailable replies also go through Inbox.

The inbound transport is not ready at authenticated bridging alone. Its journal,
retry/dead-letter handling, and restart/recovery validation must complete before
an external conversation can bind to a `resumeId` or dispatch a Workspace
Session. The binding and dispatch sequence is therefore: contract, state
machine, persistence, retry/dead-letter, authenticated bridge, recovery,
`resumeId` binding, then Session/Inbox dispatch.

Only private text from the `/link`-learned owner/chat is accepted. Authorization
is checked in the adapter and Alice boundary. `/help`, `/portfolio`,
`/settings`, and `/alerts` may be local commands; no execution command exists.

## Router

Local parsing handles known commands, clear single-intent advisory prompts,
and execution attempts. A structured router is used for ambiguity, multiple
intents, automation changes, cross-domain decomposition, complex references,
or unsafe uncertainty. Allowed actions are `pass_through`,
`rewrite_and_dispatch`, `split_into_tasks`, `local_command`,
`ask_clarification`, and `block_execution_request`.

The router never analyzes investments or selects sensitive tools from free
text. JSON Schema constrains action, destinations, risk, clarification, and
task count. Invalid output fails closed with clarification.

## OpenRouter is a decision gate

OpenRouter integration is not decided by this document. `AINV-T300` first
compares three structured-router implementations: (A) Pi or opencode through
their native `openai-chat` runtime configuration, (B) a direct Alice Invest
client with schema-validated output, and (C) deterministic local rules with no
model call. It measures latency, cost, valid JSON rate and real JSON Schema
support, retry/timeout behavior, context control, telemetry, credential
isolation, testability, maintenance cost, and fallback behavior. The result is
an ADR before router implementation.

The existing `Custom` credential preset already permits the initial functional
spike with `baseUrl: https://openrouter.ai/api/v1` and
`wireShape: openai-chat`; Pi and opencode already support that wire. A dedicated
OpenRouter visual preset is useful only if the ADR justifies it and never blocks
the spike. Any selected path keeps keys write-only/sealed and role models
configurable rather than hard-coded. Environment variables may import headless
deployment settings but must converge on the same vault/config boundary.

Calls record purpose, requested/resolved model, tokens, provider cost, latency,
run ID, and `resumeId` when available. They never record keys or sensitive
credential content. Timeout, transient-only retry, backoff, attempt/context/cost
limits, structured validation, and explicit fallback are enforced in code.

## Fixed income

Brazilian knowledge is isolated from core. Deterministic `decimal.js` functions
own gross/net returns, regressive IR/IOF, CDI percentages, CDB versus LCI/LCA
equivalence, projections, approximate real return, issuer exposure, and FGC
coverage. CDI is a reference rate, not a product. The LLM explains structured
results and missing assumptions but never invents calculations or guarantees.

## Market data, scans, signals, and shadow mode

Every observation contains source, source timestamp, receipt timestamp,
`ageSeconds`, and `realtime|delayed|eod` capability, plus bid/ask/spread/volume
when present. Delayed/EOD B3 data may support research but cannot support an
intraday signal. Crypto is read-only spot without withdrawal, futures, margin,
or leverage. A future MT5 bridge is a read-only BarService source.

Before a B3 strategy exists, a source-validation gate must prove intraday
OHLCV for PETR4, VALE3, and an index or ETF; source timestamps; bid/ask and
spread when available; measured delay; and reconnection behavior. The provider
is classified by observed evidence as `realtime`, `delayed`, or `eod`, never by
assumption. An intraday B3 signal is blocked unless the observed source is
`realtime` within the configured freshness limit. Without this evidence B3
remains `research_only`. Crypto source validation is separate, read-only, and
must independently prove its freshness/capability contract.

```text
scheduled Issue: 0 8-16 * * 1-5 America/Sao_Paulo
  -> kill switch + exchange calendar/state + provider/freshness checks
  -> bounded configured B3/crypto universe
  -> deterministic batch screening
  -> small shortlist
  -> optional LLM contextual rejection
  -> deterministic risk validator (final authority)
  -> structured signal -> code formatter -> inbox_push -> Telegram
```

No candidate is a successful silent run. Cron weekdays do not replace B3
holiday/session checks. An LLM is not called per asset.

Indicators extend the existing analysis system. Strategies are few,
transparent, and versioned, declaring ID, version, markets, timeframes, and
parameters. Prices and ratios use Decimal/decimal strings. Risk rejects stale
or incomplete data, bad spread/liquidity, insufficient reward/risk, duplicates,
cooldowns, and alert limits. The LLM may reject but never override rejection.
Telegram text is generated from the structured signal and always says no order
was sent.

Active signals use an append-only event ledger plus a current projection. A
scheduled Issue deterministically evaluates target, stop, trailing, expiry,
and invalidation, then sends only relevant state changes through Inbox. It does
not continuously call an LLM or run sleep loops inside agents. A separate
supervised process is considered only if measured timing requirements cannot be
met by Issues.

Before Telegram alerts, scans run in shadow mode: candidates and lifecycle
events are recorded but not sent. Shadow evidence records entry, target, stop,
trailing stop, expiry, invalidation, subsequent outcome, MFE/MAE, configured
costs/slippage, duplicate rate, stale rejections, provider outages, and
no-lookahead checks. B3 and crypto are independent pipelines and reports; they
never share one performance metric or readiness gate:

```text
B3: source B3 -> strategy B3 -> backtest B3 -> shadow B3
  -> evidence B3 -> readiness b3_signals -> alert B3

Crypto: source crypto -> strategy crypto -> backtest crypto -> shadow crypto
  -> evidence crypto -> readiness crypto_signals -> alert crypto
```

Only satisfactory evidence for the relevant market can make that capability
`paper_alerts`; existing Telegram outbound support alone is never evidence for
that state. A blocked B3 capability cannot prevent crypto from advancing, and
the inverse is equally true.

The readiness core is implemented before alerts and is independent of UI and
the final runbook. It projects global, fixed-income, B3, and crypto states;
enforces the `paper_alerts` ceiling; checks source/freshness, risk validation,
formatter, execution-disabled, and owner/recovery prerequisites; and reports a
fail-closed blocking reason. Market-specific evidence is then projected
separately, so each alert checks its own capability (`b3_signals` or
`crypto_signals`) instead of a global readiness claim. P10 only exposes and
validates this logic operationally; it does not create it.

The active-signal monitor is also a decision gate. Its spike can use shadow
evidence from either market, without waiting for both. It compares scheduled
Issues (appropriate for low frequency/load) with a deterministic Guardian-
supervised service (only when higher frequency requires it). It measures needed
frequency, maximum active signals, polling/WebSocket choice, provider cost,
gaps, crossings between checks, realtime-data need, restart/idempotency,
health, resources, and closed-market behavior. The resulting generic monitor
checks the readiness of each signal's market; it does not require B3 to monitor
crypto or crypto to monitor B3. Neither option may call an LLM continuously,
sleep inside an agent, execute orders, or change original signal numbers
retroactively.

## Data model

State remains migrated, file-backed, and inspectable:

- `ExternalConversationBinding`: connector, owner/chat lookup, Workspace,
  `resumeId`, generation, timestamps.
- `InboundMessageReceipt`: external update/message IDs, correlation, digest,
  state, attempts, run/Inbox result.
- `InvestConfig`: role models, universe, limits, freshness, kill switches,
  readiness; `execution_enabled` parses only false.
- `FixedIncomeQuote`: product, issuer, principal, index/rate, dates, liquidity,
  guarantee, fees, source, assumptions.
- `MarketObservation`: instrument, source/timestamps/capability and quote fields.
- `StrategyDefinition`, `SignalCandidate`, and `InvestmentSignal`: versioned
  rules, decimal values, provenance, validity, risk decision, status.
- `SignalEvent`: append-only lifecycle transition and observation evidence.
- `ReadinessEvidence`: criterion, result, timestamp, validation reference.

Current projections use atomic replace; occurrences use bounded append-only
JSONL. New shapes use core path helpers and idempotent migrations. Rotation may
not silently discard pending inbound work.

## Security and readiness

- Default deny: one linked owner, one private chat, text only.
- Authenticate Connector-to-Alice and bind both to loopback.
- Treat Telegram, data sources, and model output as untrusted.
- Seal credentials; never expose them in API/UI/logs/Workspace git.
- Pseudonymize external IDs and keep private journals bounded.
- Do not register trading tools in the Alice Invest profile.
- Kill switches cover inbound, scans, notifications, and monitor.
- `execution_enabled` is hard-disabled.
- States are `not_ready`, `research_only`, `paper_alerts`,
  `validated_alerts`, `read_only_broker`, and `live_execution`; this release
  cannot enable any state above `paper_alerts`.

Readiness is a capability projection, not one global claim. The intended shape
is equivalent to `{ global, fixed_income, crypto_signals, b3_signals }`, so a
validated fixed-income calculator does not imply a ready B3 alert system. B3
without a real-time source remains `research_only`; B3 and crypto may advance
independently. `validated_alerts`, `read_only_broker`, and `live_execution` are
future documentary states only: no current task may activate them.

`paper_alerts` requires evidence for owner authorization, dedupe/recovery,
structured router behavior when used, data freshness, fixed-income calculations
where that capability is enabled, backtests, no-lookahead, risk validation,
formatting, shadow mode, and disabled execution.

## Observability and audit

Correlation joins receipt, route, run, tools, sources, Inbox, and Connector
delivery. Existing Workspace logs, connector I/O journal, run records,
provenance, and tool-call log remain authoritative. Metrics cover accepted,
rejected, duplicate messages, end-to-end latency, model use/cost/failures,
scans/assets/candidates, risk reasons, notifications, stale data, signal
transitions, and provider health. Labels never contain user/chat IDs, content,
secrets, asset lists, or unbounded correlation IDs.

## Risks and decisions

| Risk | Mitigation |
| --- | --- |
| Lost/repeated Telegram updates | remove pending-drop; persist and dedupe before dispatch |
| Duplicate model turns | Alice receipt state machine and correlation-bound completion |
| Competing PTY controllers | headless continuation serialized by `resumeId` |
| Model/provider variance | capability probe, strict schema, explicit failure/fallback |
| Missing/misleading timestamps | normalized evidence; reject incomplete/stale signals |
| Delayed B3 source | explicit capability; research only when not real time |
| Fabricated math/prices | deterministic Decimal tools and observations |
| Cron on holidays | exchange calendar/state gate inside the Issue run |
| Strategy overfit/lookahead | versioned rules, walk-forward fixtures, no-lookahead tests |
| Scope becomes a parallel product | generic core contracts plus isolated template/domain |

Architectural decisions:

1. Extend Connector Service generically; do not build another Telegram bot.
2. Bind external conversation to the existing `resumeId` model.
3. Keep Inbox as the durable response and alert boundary.
4. Use Issues for scans/monitoring; do not add a scheduler.
5. Keep calculations, strategies, risk, state transitions, and formatting
   deterministic.
6. Keep Brazilian domain knowledge outside generic core.
7. Integrate OpenRouter through vault/native runtimes; amend this decision only
   after a measured structured-router spike.
8. Keep UTA optional and unchanged; execution is structurally absent.
9. Use migrated files, not a database.
10. Gate capability with evidence and cap readiness at `paper_alerts`.

## Fork governance, migration, and delivery

The fork policy is documented and refined by `AINV-T005`. `origin` is
`XSirch/OpenAlice`; `upstream` is `TraderAlice/OpenAlice` when configured for
reference. The intended maintenance loop is `git fetch upstream`, then an
intentional merge of `upstream/master` into the fork's stable `master` (or a
documented rebase alternative). Each Alice Invest task begins by recording the
upstream reference commit, runs on one branch, and lands through one focused PR
after its proportional validation. Conflicts are resolved periodically rather
than accumulated, secrets never enter Git, and no large change is committed
directly to `master`.

`AINV-T005` must be complete before Alice Invest functional code begins. That
rule preserves the fork's upstream compatibility discipline before new generic
Connector, Workspace, or market-data seams are introduced.

Deliver focused increments: governance/security; inbound schema and state
machine; transport recovery; Session binding; OpenRouter ADR and selected
integration; router; fixed income; freshness/source validation; signal
contracts/risk/strategies; independent B3/crypto backtests, shadow evidence,
and readiness projections; market-specific alerts; monitor ADR and
implementation; observability, documentation, and operational readiness.
Generic contracts stay backward-compatible with outbound-only installations.
Every persisted change has an idempotent migration and recovery test.

## Test strategy

Unit tests cover schemas/bounds, authorization, dedupe, binding rotation,
fast-path/router, Decimal tax/math boundaries, freshness/calendar, indicators,
strategies, no-lookahead, reward/risk, stops/targets/trailing, cooldown,
formatter, and readiness. Integration covers:

```text
recorded Telegram inbound -> Connector -> Alice -> resumed Workspace turn
  -> Inbox -> recorded Telegram outbound

scheduled Issue -> headless screening -> signal -> Inbox -> Connector
```

Recovery tests restart at each receipt transition and cover duplicates,
concurrency, invalid model JSON, provider/Telegram/Connector outages, stale
data, silent scans, duplicate signals, and stop/target crossing between polls.
Financial tests cover Decimal precision, rounding, boundary dates, timezone,
fees/slippage, and absence of lookahead.

Code tasks run `npx tsc --noEmit` and `pnpm test`, plus focused suites.
Connector work runs `pnpm test:connector-replay` and
`pnpm test:connector-service`; automation runs Workspace tests and
`pnpm test:e2e`; deployment runs `pnpm docker:smoke`. Live Telegram confirmation
is opt-in and otherwise reported skipped, never passed.

## Non-goals

- Buy, sell, cancel, transfer, withdraw, rebalance, or any broker write.
- Public groups/channels, multiple users, or unsolicited distribution.
- Derivatives, options, futures, shorts, margin, leverage, or crypto custody.
- Guaranteed returns, autonomous portfolio management, or suitability claims.
- New database, scheduler, Inbox, session manager, agent engine, or vault.
- Treating delayed/EOD data as real time or scanning every listed asset.
- Continuous LLM monitoring or free-text authorization of sensitive tools.
- PDF/image/CSV input in the first text-only increment.
- Readiness above `paper_alerts` in this implementation.
