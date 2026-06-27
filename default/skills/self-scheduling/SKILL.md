---
name: self-scheduling
description: >
  Give THIS workspace recurring or future work it runs on its own, headless, by
  listing issues in `.alice/issue.json` at the workspace root — each issue
  declares how it wants to be called on a timer. The launcher scans that file
  and, when an issue is due, spawns a fresh headless run of this workspace with
  your prompt; the run reports back to the user's Inbox. Use for: "run this
  every 30 minutes", "every morning before the open do X", "check Y each hour
  and ping me only if Z", "do this once at 4pm", "self-schedule", "set up a
  recurring job". Scheduling IS just editing this file — there is no command and
  no API.
---

# Self-scheduling — `.alice/issue.json`

List the issues this workspace should work on a timer in a file at its own root,
`.alice/issue.json`. Each issue declares how it wants to be called on a timer; a
launcher scanner reads the file (it never interprets the work) and fires a
**headless run** of this workspace when an issue is due.

```json
{
  "issues": [
    {
      "id": "morning-scan",
      "issue": "Pre-market brief",
      "when": { "kind": "cron", "cron": "30 8 * * 1-5" },
      "what": "Pull pre-market movers and overnight news for my watchlist, write a short brief to research/premarket.md, then run: alice-workspace inbox push --doc research/premarket.md --comments \"Pre-market brief\"."
    },
    {
      "id": "thesis-watch",
      "issue": "Thesis invalidation watch",
      "when": { "kind": "every", "every": "1h" },
      "what": "Re-check the thesis in thesis.md against the latest quote. If price has broken the invalidation level, push an alert to the inbox. If not, do nothing and exit — no report."
    }
  ]
}
```

Those two show the two shapes: one always produces a deliverable; one is a watch
that reports only when it has something to say.

## Fields

- **`id`** — a stable slug, unique in this file. It keys the scanner's
  "last fired" memory, so don't rename a task you mean to keep (a new id looks
  like a brand-new task and fires right away).
- **`issue`** — a short, human-readable title of the matter this entry is about
  (e.g. `"Pre-market brief"`, `"Thesis invalidation watch"`). **Required** —
  every entry names the issue it serves; scheduling is an ability of an issue,
  not a standalone object. This is the label the dashboard and Inbox show, while
  `id` stays the stable machine key.
- **`when`** — one of:
  - `{ "kind": "every", "every": "30m" }` — repeat on an interval (`30m`, `2h`,
    `1h30m`). Runs on the next scan, then on the interval.
  - `{ "kind": "cron", "cron": "0 9 * * 1-5" }` — a 5-field cron expression
    (`min hour day-of-month month day-of-week`; supports `*`, ranges `9-17`,
    lists `1,15`, steps `*/15`). Wall-clock; waits for the next match.
  - `{ "kind": "at", "at": "2026-03-01T13:30:00Z" }` — run ONCE at an ISO
    timestamp, then never again.
- **`what`** — the prompt for the headless run (see below).
- **`agent`** *(optional)* — which CLI runs it; defaults to this workspace's
  default agent.
- **`enabled`** *(optional)* — `false` keeps a task declared but dormant.

## Write `what` for a headless run

The run is **headless — nobody is watching, and it cannot see this
conversation.** Write `what` as a **complete, standalone instruction**, as if
handing the job to a fresh teammate who has only this workspace's files. Say
exactly what to read, do, and produce.

**Decide what it outputs — and decide on purpose.** A headless run that does real
work and surfaces nothing has vanished. So:

- If the run produces something the user should see — a brief, a finding, a
  result — **push it to the Inbox**, the only channel a headless run has:
  `alice-workspace inbox push --comments "…"` (attach files with repeatable
  `--doc <path>`; run `alice-workspace --help` for the flags).
- If the run is a **check that didn't trigger** (condition not met, nothing
  changed), **exit silently — that is the correct outcome**, not a failure.
  Don't manufacture noise.

Put **conditions inside `what`**, not in the schedule — there is no condition
field. For "ping me only if X", write: "check X; if it holds, push an alert;
otherwise do nothing and exit."

> **Commit `.alice/issue.json`.** The scanner reads your working tree, so an
> uncommitted edit still takes effect — but commit it so the schedule travels
> with the workspace and survives. Treat it like any other source file.

> **Trades still need a human.** A scheduled run can research, prepare, and even
> *stage* trades — but staged trades execute only when you approve them in the
> Web UI (Trading-as-Git). A timer never moves money on its own.

## Notes

- The scanner ticks about once a minute; a sub-minute cadence runs at most once
  a minute.
- Runs are one-shot and independent — a run can overlap another run or your own
  interactive session in this same checkout. Treat it like ordinary concurrent
  edits; don't assume exclusive access.
- Remove a task by deleting its entry (and commit).
