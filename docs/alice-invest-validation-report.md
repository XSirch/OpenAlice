# Alice Invest validation report

## Audit baseline

- Audit date: 2026-07-16
- Audited commit before this change: `d56a7c7c9c7b6fc5755ed7ed62b45e5fcac4c661`
- Environment: local Windows workspace; no credentials were inspected,
  configured, reused, or logged.
- Readiness conclusion: `global=not_ready`; `fixed_income=research_only`;
  `b3_signals=research_only`; `crypto_signals=research_only`.
- Execution conclusion: structurally disabled; no order, Telegram, OpenRouter,
  B3, or crypto real integration was invoked.

## Local command record

| Command | Result | Duration / evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed via `corepack pnpm` | 268 ms; direct `pnpm` was unavailable in this shell. |
| `npx tsc --noEmit` | Passed | 7.79 s; emitted only an npm project-config warning. |
| `pnpm test` | Passed via `corepack pnpm` | Final run: 23.72 s; 345 files passed, 2 skipped; 3,175 tests passed, 22 skipped. An intermediate run exposed an outdated default-readiness expectation, which this change corrected before the final passing run. |
| `pnpm test:connector-replay` | Passed via `corepack pnpm` | 241 ms; 3 files and 11 tests passed. |
| `pnpm test:connector-service` | Failed via `corepack pnpm` | Missing `services/connector/dist/connector.cjs`; the smoke requires a built Connector artifact. |
| `pnpm test:e2e` | Failed via `corepack pnpm` | 21.10 s; Vite could not resolve `@traderalice/guardian-runtime`. |
| `cd ui && npx tsc -b` | Passed | Executed concurrently with the focused checks; the shell did not emit a separate duration. |
| `pnpm docker:smoke` | Failed via `corepack pnpm` | Image built, then Alice exited because the Connector inbound bridge found Workspace service unavailable. |

## External and temporal evidence

- B3 intraday source: blocked; requires an owner-configured read-only source
  and an observed capture with timestamps, delay, quote availability, and
  reconnect result.
- Crypto spot source: blocked; requires an owner-configured least-privilege
  read-only source with no withdrawal, margin, futures, or leverage.
- B3 and crypto shadow execution: blocked; no date-bounded real run or
  reproducible evidence report exists.
- Telegram inbound/outbound E2E: blocked; requires the owner's bot and linked
  private chat.
- OpenRouter probe: blocked; requires an owner-created sealed Custom
  experiment credential.

## Remaining gaps

Fixtures, source evaluators, a boolean readiness core, a configuration snapshot,
and isolated Connector tests prove implementation boundaries only. They do not
prove provider freshness, temporal lifecycle behavior, real delivery, or
operational readiness. See `tasks.json` for the blocked and pending graph.
