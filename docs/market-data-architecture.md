# Market Data Architecture

This guide owns OpenAlice's market-data contracts and provider boundaries. New
features should extend TraderHub, the bar service, or a typed domain contract;
they should not expand the embedded OpenBB compatibility model by default.

Related guides: [[docs/project-structure.md]] and
[[docs/uta-live-testing.md]]. Broker implementation delivery is owned by
[[docs/broker-packs.md]].

## Supported Product Surfaces

OpenAlice has three market-data layers with different jobs:

| Layer | Primary consumers | Contract |
|---|---|---|
| TraderHub/reference data | Native agents, boards, low-frequency research | `traderhub` CLI and `/api/reference/*` |
| Bar service | Charts, quant tools, snapshots, simulations | `barId`-keyed K-line provider federation through `/api/bars` |
| Embedded provider compatibility | Remaining Alice fundamentals/search clients | Private `@traderalice/opentypebb` workspace package and `/api/market-data-v1` compatibility routes |

The first two layers are the product architecture. The compatibility package is
an implementation detail retained for provider adapters, legacy models, and
routes that have not yet moved to an OpenAlice-owned contract.

## Fixed-income research snapshots

The fixed-income advisor owns a separate, read-only snapshot seam under
`src/domain/alice-invest/fixed-income/providers/`. A provider implements
`FixedIncomeProvider.fetch()` and returns a validated snapshot rather than
exposing its transport payload directly to calculations or recommendations.

Every snapshot carries its source decision, canonical URL, access method and
parameters, reference and retrieval dates, terms review, raw-payload checksum,
parser version, original identifiers, freshness deadline, and quality evidence.
Blocked sources cannot produce snapshots. Critical stale or insufficient data
fails closed before recommendation use. Normalized payloads use strings for
numeric values so provider parsing cannot silently lose financial precision.

The dated source decision behind this contract is recorded in
[fixed-income source viability](reference/fixed-income-source-viability.md).
That research note may age; the typed contract and this guide define the durable
boundary. Fixed-income providers are research inputs only and must not import
UTA trading clients or expose order, transfer, withdrawal, or broker-write
operations.

The Tesouro Transparente adapter in `providers/tesouro-transparente.ts`
discovers the active daily CSV through the official CKAN package metadata and
preserves the package revision, resource identifier, raw checksum, reference
date, and original title identifiers. It rejects redirects, unexpected content
types, oversized or invalid UTF-8 responses, and unsupported schemas. Its
default validity window is intentionally conservative; callers must treat an
expired observation as unavailable rather than silently extending it.

Treasury pricing, cash-flow construction, and switch analysis remain separate
from transport. They expose calculation traces and source provenance through
the read-only `/api/alice-invest/fixed-income/*` simulation routes and the
`aliceInvestFixedIncomeOverview` / `aliceInvestSimulateFixedIncomeSwitch`
tools. These surfaces return `research_only` results and never confirm an offer
or create a financial execution path.

The BCB IFData adapter in `providers/bcb-ifdata.ts` reads only the official
OData cadastro and report 1 for an explicit reference period and institution
code. It preserves the lexical decimal representation of `Saldo`, joins rows
only inside the requested period, and exposes the BCB financial/prudential
conglomerate codes as evidence rather than inferring group membership from a
bank name. IFData supports deterministic, separately reported credit,
liquidity, regulatory, FGC-protection, and confidence scores; it is not a
rating or proof of FGC eligibility.

BTG/AUVP inventory enters through `opportunities.ts` only as a bounded,
strict-UTF-8, user-supplied JSON artifact. Public catalogs remain indicative.
Confirmed availability requires an export, an offer supplied by the user, or a
timestamped manual confirmation and expires no later than two hours after that
confirmation. Imports are private evidence, carry a checksum, and are not
persisted by the HTTP validation endpoint. Rankings apply reserve, maturity,
carência, IFData confidence, FGC/conglomerate, minimum-investment, and current
availability gates before comparing net risk-adjusted results. Validated
imports are persisted atomically in the private state root; replaying the same
checksum is idempotent and a conflicting replay is rejected.

Private-credit documents enter through `document-ingestion.ts`. CVM artifacts
may use the reviewed official-download policy, while public ANBIMA artifacts
remain manual-only under their reviewed terms. The boundary rejects archive
containers, traversal-like names, oversized files, malformed UTF-8, mismatched
PDF signatures, and active HTML; document text is always labeled untrusted and
prompt-like content is surfaced only as a security signal. PDFs use
`pdfjs-dist@6.2.108` with explicit byte, page, character, and time limits plus
page-offset locators. The package version was checked in the npm registry on
2026-08-20 and is compatible with the project's Node 22.19 minimum. Extracted
text remains untrusted and cannot alter deterministic fields.

The CVM private-credit provider reuses the official archive client and
preserves the SHA-256 of each raw ZIP. For a requested year it loads DFP from
the prior reference year and ITR/IPE from the requested year, normalizes padded
CVM codes only for equality, keeps the latest current-exercise revision, and
treats an empty IPE result as a valid absence rather than a provider gap.

The Guardian-owned fixed-income monitor reads only the bounded private
`fixed-income-monitor-input.json` handoff created by deterministic producers.
It applies the persisted cooldown and delivery journal, formats a bounded
research-only digest, and appends it to Inbox; the existing Connector bridge
may then project that durable entry to Telegram. Provider scans, credit scans,
and notifications have independent fail-closed policy switches. Repeated input
failures open an in-memory circuit breaker and are written to the retained
fixed-income operational audit. The monitor has no provider-network or UTA
dependency and never generates a recommendation itself.

`private-credit.ts` keeps issuer, instrument, and CRI/CRA securitization
structures distinct. It owns deterministic component scores, adjusted-premium
ranges, missing-document and critical-event gates, and the immutable
`research_only` result. Optional model prose is accepted only through a strict
explanation schema whose material claims reference known evidence IDs; it
cannot submit scores, decisions, readiness, or execution fields.

Fixed-income alert operations live in `operations.ts`. Delivery receipts,
manual outcomes, and bounded audit facts use an atomic private file under
`OPENALICE_HOME`; locks are shared by path so HTTP and tool writers cannot race
inside one Alice process. Alert planning deduplicates by the versioned decision
key, applies a 30-day-capable cooldown, and bypasses it only for critical or
materially changed facts. Telegram output is a bounded, redacted informational
digest with no execution affordance. The provider circuit breaker exposes
closed/open/half-open health and requires a successful half-open probe before
recovery.

Shadow validation is owned by `shadow-validation.ts`. Its private, atomic
observation store rejects conflicting replay IDs and produces a deterministic
report across distinct calendar days. The report measures official-reference
calculation differences, stale data, provider failures, duplicate alerts,
reviewed false positives, and threshold variants. Even a clean 30-day report
with a passed human walkthrough only becomes
`eligible_for_human_readiness_decision`; code cannot enable recommendation
generation, alter `research_only`, or enable financial execution.

The version-two state also keeps append-only human walkthrough records. The
latest dated review feeds the report after restart; a duplicate review is
idempotent and a conflicting replay is rejected. Operators use
`pnpm fixed-income:shadow collect <artifact.json>` for bounded trace-linked
artifacts, `pnpm fixed-income:shadow report --format markdown` for a portable
summary, and `pnpm fixed-income:shadow walkthrough --reviewer <name> --result
<passed|failed> --notes <text>` only after a real human review. The authenticated
web equivalent is `PUT /api/alice-invest/fixed-income/shadow-validation/walkthrough`.
None of these commands accepts readiness or execution switches.

`shadow-monitor-service.ts` is the Guardian-supervised collection boundary. It
polls a bounded private hand-off file and accepts only schema-valid observations
that already include an official reference ID, source checksum, and calculation
trace. Missing input is a no-op; malformed input is audited and records no
evidence. The collector never manufactures a daily observation, downloads a
reference, or enables alerts. Progress is exposed read-only at
`GET /api/alice-invest/fixed-income/shadow-validation`.

## Agent-facing Data Flow

Native coding agents use the injected CLI shims instead of importing packages
or constructing provider HTTP requests:

```text
low-frequency/reference research
  -> traderhub board/equity/etf/economy/...
  -> OpenAlice ToolCenter
  -> hosted TraderHub when available
  -> typed local fallback when supported

K-lines and quantitative work
  -> alice analysis search-bars/snapshot/quant/simulate
  -> BarService
  -> vendor source or UTA broker source selected by barId
```

`traderhub` is intentionally named after the hosted/reference domain. It owns
boards, fundamentals, macro series, calendars, ETFs, and related slow-moving
research data. `alice analysis` owns bar discovery and price-path analysis.

## TraderHub and Reference Data

`src/domain/market-data/reference/` defines OpenAlice-owned board contracts.
Each response carries an explicit `meta` envelope describing origin and as-of
time. The hosted hub is preferred when enabled; typed local providers are the
fallback where a board implements one.

Configuration lives in
`<OPENALICE_HOME>/data/config/market-data.json`:

```json
{
  "enabled": true,
  "providers": {
    "equity": "yfinance",
    "crypto": "yfinance",
    "currency": "yfinance",
    "commodity": "yfinance"
  },
  "extraVendors": [],
  "providerKeys": {},
  "hub": {
    "enabled": true,
    "baseUrl": "https://traderhub.openalice.ai"
  }
}
```

`brapi` is an opt-in Brazilian-market vendor. Add its token in **Settings →
Market Data → Advanced**, then enable `brapi` under Chart Vendors. Its B3
quotes and daily bars are explicitly delayed/research-only; they never satisfy
the realtime B3 signal gate and never connect to UTA or an order path.

Self-hosters may point `hub.baseUrl` at their own compatible TraderHub. A
`hub:<baseUrl>` credential sentinel routes supported keyed-provider requests
through the hub without copying the hub's upstream credential into OpenAlice.

## Bar and K-line Providers

`src/domain/market-data/bars/` is the canonical price-history layer. A bar
source is addressed by `barId`, so provider selection is explicit and stable
across search, charting, snapshots, and simulations.

BarService federates:

- vendor K-lines from the embedded provider adapters;
- broker/exchange K-lines exposed through UTA;
- source metadata such as capability and freshness.

UTA source discovery and Broker Pack installation are independent. `asVendor`
controls whether a configured UTA joins default K-line/contract discovery;
keyless public-data UTAs are explicit source choices. A Broker Pack merely
supplies the selected broker engine implementation. Missing support makes that
UTA source unavailable with an actionable error; it must not remove the UTA
provider kind, rewrite `asVendor`, or silently route the same `barId` through a
different vendor.

New K-line sources should implement the bar/provider contract and appear in bar
source discovery. They should not require a new OpenBB-style asset-class client
or a copied OpenBB route hierarchy.

## Embedded Compatibility Package

`packages/opentypebb/` is private to this monorepo. It still supplies useful
provider fetchers, standard-model types, query execution, and router adapters,
but it is not an independently supported SDK or server.

The package deliberately has:

- no standalone HTTP server entry;
- no package-local `dev`, `test`, or watch command;
- no npm or GitHub Packages publishing job;
- no external semantic-versioning promise.

Alice mounts the remaining compatibility routes at `/api/market-data-v1`
through `src/server/market-data-compat.ts`. Existing UI/domain clients may keep
using that mount while they are migrated. New agent-facing or product-level
contracts should not start there.

## Change Routing

| Change | Owner path |
|---|---|
| New low-frequency board or hosted dataset | `src/domain/market-data/reference/`, TraderHub tool/CLI mapping |
| New K-line vendor or broker source | `src/domain/market-data/bars/`, provider discovery, UTA when broker-owned |
| Existing fundamentals/search provider fix | `packages/opentypebb/src/providers/` plus the typed Alice client |
| New user credential name | market-data config schema and `src/domain/market-data/credential-map.ts` |
| Fixed-income catalog, price, macro, issuer, policy, or manual-offer evidence | `src/domain/alice-invest/fixed-income/providers/` and the dated source decision |
| Compatibility HTTP behavior | `src/server/market-data-compat.ts` and focused route tests |

Provider discovery is self-described. Optional vendors expose `vendorMeta`, and
the runtime joins that metadata with current configuration. Do not maintain a
copied provider inventory in prose.

## Verification

The compatibility package is tested from the monorepo root so it shares the
same aliases, setup, and runtime assumptions as Alice:

```bash
pnpm -F @traderalice/opentypebb typecheck
pnpm vitest run packages/opentypebb/src
npx tsc --noEmit
pnpm test
```

When changing bars or reference contracts, also run their focused suites and
exercise the corresponding `traderhub` or `alice analysis` CLI path. Keyed or
network tests require explicit test credentials and must not become a silent
prerequisite of the normal unit suite.
