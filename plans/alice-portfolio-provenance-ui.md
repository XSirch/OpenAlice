# Alice Portfolio provenance and UI

Status: Completed on 2026-08-06.

Follow-up on 2026-08-06: fixed the agent-facing portfolio projection, which
was dropping `custodian` after the UTA response, preserved it in snapshots,
resolved institution names through the documented Pluggy Item/Connector
relationship, added a MeuPluggy account overview for bank accounts, cards and
investments grouped by institution, and added a direct `portfolio/goal.md`
shortcut to the Alice Portfolio sidebar.

MeuPluggy proxy follow-up on 2026-08-06: the official MeuPluggy flow exposes
one proxy Item per authorized bank while retaining `MeuPluggy` as the Connector
name. Added an explicit, user-confirmed Item-to-institution mapping; the proxy
connector name is never emitted as custodian and unlabeled legacy Items remain
unknown rather than being inferred from asset or issuer names.

Owner guides: [[docs/workspace-agent-guidance.md]], [[docs/managed-workspace-runtime.md]].

## Decisions

- Preserve MeuPluggy custody institution as optional `Position.custodian`.
- Keep Pluggy as the contract exchange and represent the bank separately.
- Give Alice Portfolio its own navigation area and stable URL.
- Edit only existing Markdown files with optimistic revision checks and focused Git commits.

## Checklist

- [x] Carry custodian provenance through UTA and agent guidance.
- [x] Add Alice Portfolio navigation, routes, workspace list, and demo data.
- [x] Add Markdown editing, conflict detection, atomic writes, and focused commits.
- [x] Complete typechecks, focused tests, browser acceptance, and UTF-8 validation.

## Verification

- `npx tsc --noEmit`
- `pnpm test`
- `cd ui && npx tsc -b`
- Focused Pluggy, Markdown editor, UI route, and demo tests.

Acceptance passed in the real demo route, including sidebar placement, automatic
single-workspace opening, `portfolio/goal.md` discovery, editing, and saving.
The monorepo suite passed 4,145 tests; isolated reruns passed the two unrelated
tests that timed out under full-suite load. The packaged Electron smoke could
not start because its nested script invokes a globally available `pnpm`, which
is absent on this host; desktop and UI typechecks passed.
