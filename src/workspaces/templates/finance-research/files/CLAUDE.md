# Finance Research workspace

This workspace bundles **[himself65/finance-skills](https://github.com/himself65/finance-skills)** — a community plugin marketplace by [@himself65](https://github.com/himself65) (面包) covering market data, valuation, earnings analysis, options payoff, and social/research feeds.

## What's installed

Bootstrap clones the upstream finance-skills repo (latest `main`) into `./.finance-skills/` and installs three plugins at **project scope** (no user-global pollution):

- `finance-market-analysis` — yfinance market data, DCF/SOTP valuation, earnings preview/recap, ETF premium/discount, options payoff, SEPA/VCP, stock correlation & liquidity
- `finance-social-readers` — Twitter/X, Discord, LinkedIn, Telegram, Y Combinator readers; opencli fallback for 90+ research feeds
- `finance-data-providers` — Adanos sentiment, Funda AI fundamental research (MCP + REST), Hormuz Strait monitoring, TradingView desktop app reading

If the install missed any of those (network timeout, etc.), see the **Recovery** section at the bottom.

## Two data layers — when to use which

This workspace gives you **two market-data surfaces** that overlap. Use them deliberately:

1. **OpenAlice's own MCP tools** (`/mcp` → `openalice`) — quotes, fundamentals, indicators, news. These are the **Alice canonical layer** wired to FMP / typebb / OpenBB. **Use these when a number will inform a trading decision** (UTA, position sizing, order routing) so the data口径 stays consistent with what Alice's trading engine sees.
2. **finance-skills** — yfinance, Funda AI, opencli, social readers. **Use these to cover angles Alice doesn't ship** (Yahoo Finance historical depth, SaaS valuation compression, social sentiment, peer-screened correlation studies, etc.).

Don't cross the streams: don't quote yfinance to make a UTA order routing call. Don't quote Alice's MCP to do a Twitter sentiment scan.

## MCP wiring

`.mcp.json` points at OpenAlice's MCP server (`http://127.0.0.1:3001/mcp` by default, or `$OPENALICE_MCP_URL`). The full OpenAlice tool surface — trading, market data, news, brain, indicators — is available alongside the finance-skills plugins.

To verify on first attach:

1. Approve the MCP server when Claude Code prompts for trust
2. Run `/mcp` — you should see `openalice · ✓ connected`
3. Run `/plugin list` — you should see the three `finance-*` plugins enabled

## Upstream relationship

`himself65/finance-skills` is an independent open-source project. We clone fresh from upstream on each new workspace creation — that gives the author visible GitHub traffic and ensures you always get their latest. We do not fork, mirror, or modify upstream. If a skill behaves unexpectedly, file the issue at the upstream repo, not OpenAlice.

## Recovery (if bootstrap missed plugin install)

```bash
cd <this workspace>
claude plugin marketplace add ./.finance-skills --scope project
claude plugin install finance-market-analysis@finance-skills --scope project
claude plugin install finance-social-readers@finance-skills --scope project
claude plugin install finance-data-providers@finance-skills --scope project
```

Then restart your Claude Code session (the `--scope project` declarations are picked up at session start).
