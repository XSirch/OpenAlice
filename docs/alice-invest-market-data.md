# Alice Invest market-data evidence

## B3 intraday source — AINV-T610

Status: blocked on an owner-configured, read-only B3 source. No configured
credential was inspected or repurposed for this work. Therefore B3 remains
`research_only` and intraday signals are disabled.

The reusable evidence evaluator requires fresh, timestamped OHLCV observations
for PETR4, VALE3 and BOVA11/IBOV, plus successful reconnection evidence. It
classifies the result from observed capability and freshness; missing proof,
delayed data or EOD data never become realtime. Bid, ask and spread are
retained whenever the provider supplies them.

Before promotion, run a read-only configured-source capture and attach the
source/timestamps, measured delay, quote availability, reconnect result and
provider limitations here. No live or order-capable credential is permitted.
