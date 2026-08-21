# Fixed-income advisor

Status: Active. Increments 0 through 5 implemented and locally verified on
2026-08-20; Increment 6 is next.

Product specification: [[docs/PRD_Renda_Fixa_OpenAlice.md]].

Owner guides: [[docs/project-structure.md]],
[[docs/development-workflow.md]], [[docs/market-data-architecture.md]],
[[docs/connector-service.md]], and [[docs/uta-live-testing.md]].

Related issues: none recorded at preparation time.

## Outcome

Deliver the read-only Alice Invest fixed-income advisor described by the PRD,
starting with public-data viability and then the smallest useful product slice:
Tesouro, reconciled MeuPluggy custody, and a deterministic hold/sell/reinvest
simulator. The capability remains `research_only`; this initiative never adds
an order, withdrawal, transfer, or other broker-write path.

## Repository baseline

- The implementation lane is `dev`, on feature branch
  `feat/renda-fixa-openalice`.
- The PRD was written against `master` commit `7675a943`; implementation began
  from `dev` commit `37cea61d`, where local and remote `dev`/`master` matched.
- Existing fixed-income contracts, projections, comparison, reconciliation,
  FGC, ladder, readiness, configuration, API, and MeuPluggy custody paths are
  starting points to evolve, not parallel systems to replace wholesale.
- Migration `0028` in the PRD is illustrative and already occupied. The next
  repository migration is `0049`; confirm it again immediately before adding
  the migration.
- GitHub Actions workflows were already removed and repository Actions disabled
  before this implementation began; this initiative does not recreate them.

## Decisions and boundaries

- Keep financial arithmetic deterministic and based on `decimal.js`; an LLM
  may extract or explain evidence but cannot calculate money or override a
  failed hard gate.
- Keep MeuPluggy as read-only custody owned by UTA. Alice may reconcile and
  classify returned positions, but fixed-income tools cannot reach a UTA write
  surface.
- Extend OpenAlice-owned Alice Invest and reference-data contracts. Do not add
  the module to the private OpenBB compatibility model by default.
- Persist state under `OPENALICE_HOME` with atomic writes, private permissions,
  explicit provenance, idempotent migrations, and append-only journals where
  the PRD requires history.
- Treat AUVP/BTG inventory as indicative or manually confirmed unless an
  official compatible interface is established. Do not automate private pages
  or imply that an offer can be executed.
- Version tax, FGC, calendar, and source-freshness rules by effective date and
  source. Missing, stale, or conflicting critical evidence fails closed.
- Deliver serial, reviewable increments to `dev`; do not hold the entire PRD in
  one implementation commit or one unverifiable release-sized change.

## Ordered implementation

### Increment 0 — source viability and contracts

- [x] Verify current official terms, download mechanisms, identifiers,
  coverage, freshness, and redistribution constraints for Tesouro, ANBIMA,
  BCB/SGS/Focus/IFData, CVM, FGC, and public AUVP material.
- [x] Record a dated source matrix and select official public endpoints or
  explicit manual import; exclude private scraping.
- [x] Obtain or create a redacted MeuPluggy fixture with the available lot,
  price, date, and institution fields documented as evidence or gaps.
- [x] Add the typed provider observation/snapshot contract with provenance,
  freshness, confidence, checksum, and fail-closed validation.
- [x] Freeze provider contract fixtures and no-execution architecture tests.

Exit: an approved, dated data matrix and provider contract; no production
recommendation and no claim of current offer availability.

Evidence: [dated source matrix](../docs/reference/fixed-income-source-viability.md),
`src/domain/alice-invest/fixed-income/providers/provider-contract.ts`, the
redacted custody fixture, and focused contract/no-execution specs. Tesouro,
BCB, and CVM are eligible for official automation; public ANBIMA and FGC inputs
remain manual; ANBIMA Feed and automatic BTG/AUVP offer discovery remain
blocked without compatible authorization. A user-supplied BTG/AUVP artifact is
manual, private evidence and never proves executable availability.

Verification on 2026-08-20: 10 focused tests passed, `npx tsc --noEmit`
passed, and `pnpm test` passed with 558 files/4 skipped and 4,160 tests/36
skipped. The first full-suite run had one unrelated `MarketBoardPage` timeout;
that spec passed in isolation and the complete rerun passed.

### Increment 1 — deterministic portfolio core

- [x] Expand instruments and indexers without breaking existing classified
  custody definitions.
- [x] Add lots, dated cash flows, calendars, versioned tax/IOF rules, fees,
  rounding, XIRR, real return, and tax-equivalent return.
- [x] Split the current `calculations.ts` responsibilities behind compatible
  public contracts instead of a flag-day rewrite.
- [x] Add migration `0049` if still available, register it, regenerate the
  migration index, and prove idempotence and preservation of generic records.
- [x] Keep defaults at a 20% liquidity reserve and `research_only`, without
  generating recommendations during migration.

Exit: reproducible net portfolio calculations with traces, gaps, provenance,
and no decision engine.

Evidence: expanded backward-compatible product/rate schemas; versioned lot,
cash-flow, calendar, tax, fee, XIRR, and equivalence modules; tax selection and
rule identity, source evidence, and deterministic `calculationTraceId` in the
compatible projection result; and migration
`0049_fixed_income_advisor`. The reviewed 2026 PF baseline points to Receita
Federal for IR and exemption evidence and the compiled Decreto 6.306 Annex for
the IOF schedule. Unconfirmed expanded exemptions are taxed conservatively and
marked non-actionable.

Verification on 2026-08-20: 18 focused files/66 tests passed,
`pnpm build:migration-index` regenerated 42 entries, `npx tsc --noEmit` passed,
and `pnpm test` passed with 567 files/4 skipped and 4,196 tests/36 skipped.

### Increment 2 — Tesouro and switch simulator

- [x] Implement official Tesouro catalog/price observations, VNA, settlement,
  coupons, amortization, duration, convexity, DV01, and scenario projections.
- [x] Implement hold, sell, partial-sell, reinvest, and break-even paths on the
  same target date after tax and costs.
- [x] Enforce materiality, uncertainty, data-quality, reserve, concentration,
  and false-arbitrage gates.
- [x] Validate against official golden fixtures and the synthetic PRD case.
- [x] Expose read-only API/tool contracts with calculation trace and provenance;
  prove that no execution endpoint or UTA write dependency exists.

Exit: the first useful slice—Tesouro + MeuPluggy portfolio + switch simulator—
still `research_only`.

Evidence: the official Tesouro Transparente adapter and frozen eight-family CSV
fixture, deterministic treasury pricing/cash-flow specs, the exact synthetic
switch case from the PRD, reserve/false-arbitrage/freshness/property tests, and
route/tool architecture tests. A live read-only smoke on 2026-08-20 discovered
the active CKAN resource, parsed 58 observations for reference date 2026-08-19,
and matched raw SHA-256
`74a1154241f554df86ef3964ddaea8bffbf22c4209f3ef640c9d436b69ce08b3`.

### Increment 3 — bank products and opportunities

- [x] Add CDB, RDB, LC, LCI, and LCA cash-flow/tax contracts.
- [x] Version FGC policy and confirmed conglomerate mapping; enforce reserve
  and per-conglomerate concentration before ranking.
- [x] Add dated IFData evidence and deterministic bank/liquidity scores.
- [x] Add manual, provenance-preserving BTG/AUVP offer import and short-lived
  availability confirmation.
- [x] Rank new contributions and switches by net return adjusted for risk and
  constraints, not advertised rate.

Exit: explainable bank-product ranking with no purchase path.

Evidence: explicit CDB/RDB/LC/LCI/LCA tax and grace-period specs, versioned FGC
capacity with the PRD partial-allocation case, separate deterministic IFData
scores, strict private offer import, and an explainable new-contribution
ranking that returns eligible, lower-risk, maintenance, and rejected paths. A
live read-only IFData smoke on 2026-08-20 joined cadastro and report 1 for
reference period `202603`, returned all five required fields at quality 100 and
confidence 95, and preserved raw checksum
`02d8651eb1d4379cb1a43831b613da096a189a1b18cc0f727b2600969d7452dc`.
The focused increment gate passed 11 files and 27 tests.

### Increment 4 — private credit

- [x] Add document-ingestion boundaries with size, type, traversal, HTML, and
  prompt-injection defenses.
- [x] Connect the official CVM document source and implement validated PDF/data
  extraction. Keep ANBIMA automatic ingestion blocked until authorized.
- [x] Separate issuer, instrument, and securitization structures for
  debentures, CRI, and CRA.
- [x] Add deterministic scores, source-linked qualitative extraction, critical
  events, and `insufficient_data` fail-safe outcomes.
- [x] Prove that model output cannot alter calculations, gates, or readiness.

Exit: source-backed initial and continuous credit analysis.

Evidence: bounded document ingestion policies for official CVM, manual ANBIMA,
and private user artifacts; traversal/archive/active-HTML/invalid-UTF-8 and
prompt-like-content tests; separate debenture and CRI/CRA structures; and
deterministic source-linked credit analysis. The PRD high-yield/weak-credit
case resolves to `avoid`, missing documentation fails closed, and strict model
explanations cannot override scores. The focused increment gate passed 5 files
and 13 tests, including API/tool no-execution coverage.

Completion evidence added on 2026-08-20: the official CVM provider preserves
raw DFP/ITR/IPE ZIP checksums, uses DFP from the prior reference year, handles
the current `GRUPO_DFP` header and padded codes, and selects current/latest
statement rows. A live read-only smoke for CVM code `001023` returned 1,093
latest statement rows and 92 IPE events at quality 100/confidence 95, with
DFP/ITR/IPE data bases `2025-12-31`, `2026-06-30`, and `2026-08-13`. Bounded
PDF extraction uses the registry-checked current package `pdfjs-dist@6.2.108`,
which supports the project's Node 22.19 minimum. API, tools, and UI expose inspection
without persistence or scoring. Seven focused files and 44 tests passed; the
real mobile demo completed CVM lookup and CSV inspection with no horizontal
overflow and zero scoped axe violations.

### Increment 5 — product surfaces and operation

- [x] Add responsive Renda Fixa navigation, overview, custody positions,
  persisted opportunities, simulator, limits, history, source states, and
  shadow-validation progress.
- [x] Complete the position-detail calculation view and interactive private
  credit document workflow. The detail now preserves explicit gaps while
  showing lots, cash flows, risk scores, documents, market/redemption values,
  and durable position-linked calculation traces; the guided credit workflow
  keeps document inspection and deterministic scoring separate.
- [x] Keep demo `/api/*` handlers aligned and exercise the real demo and
  development routes with `agent-browser`.
- [x] Wire Telegram commands and delivery to the existing formatter, dedupe,
  redaction, cooldown, and manual-outcome primitives without execution
  affordances.
- [x] Wire a supervised fixed-income monitor to the existing persistence,
  health, retention, audit, and circuit-breaker primitives.

Exit: complete read-only web and Telegram experience at `research_only`.

Evidence: the Alice Invest page now owns nine fixed-income sections, a live
research-only switch simulation, custody/FGC views, source states, limits, and
persisted operational history. Matching demo handlers use redacted fixtures.
`agent-browser` exercised overview, simulation, history, desktop, and a
390×844 viewport with no horizontal body overflow; the fixed-income content
region passed a scoped axe audit with zero violations. The operational store
proved restart recovery, shared-path idempotency, retention, audit, cooldown,
manual outcomes, bounded Telegram formatting, and circuit-breaker recovery.
The focused gate passed 19 files and 52 tests plus root and UI TypeScript.
The completion audit on 2026-08-20 corrected the earlier broad status: nine
sections and operational primitives exist, but placeholder UI and unwired
Telegram/monitor code do not satisfy the complete PRD experience. The API now
implements the full named route surface fail-closed: portfolio queries use
redacted public IDs, imported offers persist atomically, policy writes cannot
enable execution or recommendation generation, refresh remains disabled, and
recommendation queries truthfully return empty/not-found. Agent tools now cover
position detail and recommendation explanation, while custody tools expose the
required unclassified/propose/confirm workflow. Five focused files and 15 tests
plus root/UI TypeScript passed for this correction. The next UI increment added
redacted classified-position drill-down and a guided credit analysis that uses
only explicit human scores and document hash/locator evidence. A browser walk
covered both flows at 390x844 with no horizontal overflow and zero scoped axe
violations; the page test now covers the drill-down and fail-closed
`dados_insuficientes` result.

The Guardian now starts a dedicated fixed-income monitor whose bounded private
handoff accepts only deterministic `research_only` alerts. It applies durable
cooldown/deduplication receipts, retained audit state, independent scan and
notification switches, and a three-failure circuit breaker before appending a
single Inbox digest. Inbox remains the only outbound boundary, so the existing
Connector projection owns Telegram delivery. The linked Telegram owner can run
`/renda_fixa`; an HMAC-authenticated, allowlisted loopback read returns a
redacted summary without arbitrary paths, identifiers, refreshes, or execution
actions. Six focused files and 26 tests plus root and Connector package
TypeScript passed for the initial wiring; live Telegram credential acceptance
remains an operational verification, not a claim made by this run. The
Operations section now exposes the persisted monitor state; the real demo at
390x844 had no horizontal overflow and its scoped axe audit reported zero
violations.

The final position-detail increment added a private, versioned position-state
file through idempotent migration `0050`. Manual evidence is strictly validated,
raw custody identifiers remain below the HTTP boundary, and simulations may
associate their deterministic trace only with an existing reconciled position.
The responsive detail renders documented lots, projected cash flows, risk,
source hashes, explicit gaps, and calculation history without order actions.
Focused route/UI/state/migration tests and root/UI TypeScript passed. A real
demo walk rendered the complete detail and an associated simulation at 390x844;
the document width matched the viewport and the scoped Axe audit reported zero
violations and zero incomplete checks.

Final repository gate on 2026-08-20: root, UI, Connector Service, and Connector
Protocol TypeScript passed; `pnpm test` passed with 590 files/4 skipped and
4,276 tests/36 skipped. An earlier loaded run timed out in unrelated UTA and
Market Board specs; all affected specs passed in isolation before the complete
green rerun.

### Increment 6 — shadow validation

Collection state: framework implemented and locally verified on 2026-08-20;
the required 30 distinct real observation days and human walkthrough have not
elapsed and therefore remain open.

- [ ] Run at least 30 days of read-only observations and compare calculations
  with official references.
- [ ] Measure stale data, provider failures, duplicate alerts, false positives,
  and threshold sensitivity.
- [ ] Produce the evidence report and complete a human walkthrough.
- [ ] Consider `paper_alerts` only from formal readiness evidence; never enable
  financial execution.

Exit: evidence-backed alert-readiness decision with the structural no-execution
invariant intact.

Implementation evidence: `shadow-validation.ts` persists observations
idempotently, rejects conflicting replays, compares outputs with explicit
reference values, measures stale/provider/duplicate/false-positive metrics and
threshold variants, and requires 30 distinct dates plus a passed human
walkthrough. A synthetic 30-day fixture proves only the report mechanics. Even
an eligible report returns `canEnableRecommendations = false`; the actual
readiness decision remains human-owned. Four focused tests passed. No claim of
30 days of operational evidence is made by this implementation run.

The Guardian-supervised `shadow-monitor-service.ts` now polls a bounded private
handoff and appends only schema-valid, source-checksummed, trace-linked official
comparisons. Missing input creates no observation, replays are idempotent, and
malformed input fails closed with an audit event. The web surface reports the
actual stored progress; it currently remains below 30 real days. Three focused
monitor tests and the existing report tests passed. The post-audit repository
gate passed root and UI TypeScript, 584 test files/4 skipped and 4,252 tests/36
skipped. The real demo route showed `0/30`, no mobile horizontal overflow at
390×844, and zero scoped axe violations.

Repository gate on 2026-08-20 after Increments 0–5 and the Increment 6
framework: `npx tsc --noEmit`, `cd ui && npx tsc -b`, and `pnpm test` passed;
the full suite reported 582 passed files/4 skipped and 4,246 passed tests/36
skipped. Strict UTF-8 validation covered all 75 changed text files, and the
repository still contains zero `.github/workflows` files.

Operational follow-up on 2026-08-21 found and fixed a completion blocker: the
human walkthrough existed only as an in-memory report argument while every
production route supplied `null`. Migration `0051` upgrades the shadow state to
version two and preserves append-only walkthroughs; the API and
`pnpm fixed-income:shadow` CLI now collect bounded artifacts, persist a review,
and render JSON or Markdown evidence without accepting readiness or execution
switches. The real user state still has 0/30 observations, so no synthetic day
was recorded. A live Tesouro comparison also confirmed that a Monday-Friday
calendar is not sufficient for official PU validation; the ANBIMA banking
holiday source remains a provenance-preserving manual import until compatible
automation is authorized.

The explicit Docker definition-of-done gate also passed on 2026-08-21 with
`pnpm docker:smoke`: the image built from the working tree, the version route
became healthy, all four Coding Agent runtimes were detected, and the isolated
Workspace creation, shell PTY/manifest round-trip, and offboarding checks
completed successfully.

## Verification contract

Every code increment runs:

```bash
npx tsc --noEmit
pnpm test
```

Add the following according to the touched surface:

- focused Vitest suites and branch coverage for financial modules;
- property and golden tests for calculations and provider fixtures;
- `pnpm build:migration-index` plus migration idempotence tests for persisted
  shape changes;
- `cd ui && npx tsc -b`, focused UI tests, updated demo handlers, and a real
  route walkthrough with `agent-browser` for UI work;
- `pnpm test:e2e` for non-trading UTA/MeuPluggy lifecycle changes;
- `pnpm docker:smoke` when the server/Docker surface changes;
- explicit security tests proving no execution endpoint, UTA write reference,
  prompt-controlled calculation, path traversal, unsafe archive, secret leak,
  or unredacted external identifier;
- UTF-8 validation of every changed text file before handoff.

The live-paper lane is not part of routine validation because the advisor is
read-only. If a future change genuinely touches a broker adapter, follow
[[docs/uta-live-testing.md]], confirm a demo/paper account first, and leave it
flat.

## Completion criteria

- The PRD's functional acceptance cases and definition of done are represented
  by executable tests or dated shadow-validation evidence.
- Money, taxes, prices, constraints, and recommendations are reproducible from
  stored inputs and `calculationTraceId`.
- Stale or insufficient critical evidence cannot produce an actionable
  recommendation.
- Web, Telegram, tools, storage, logs, and migrations preserve provenance and
  redact sensitive identifiers.
- Search over the shipped API, tools, UI, and UTA boundaries finds no financial
  execution path introduced by this initiative.
- The capability remains `research_only` until a separately evidenced,
  human-approved alert-readiness decision; execution remains permanently off.
