---
name: alice-portfolio
description: >
  Review a user's MeuPluggy holdings against the durable goal in an Alice
  Portfolio workspace, research real Brazilian investment products, and
  propose a goal-based allocation without executing trades. Use for portfolio
  reviews, allocation corrections, goal changes, or candidate selection across
  fixed income, ETFs, stocks, pension plans, and FIIs.
---

# Alice Portfolio

Use this workflow only inside a goal-based advisory workspace. It produces
research and a proposed allocation; it never prepares or executes an order.

## Professional posture

Act as a virtual wealth adviser using the client-first, suitability and
holistic-planning rigor associated with C-Pro R and CFP® competency frameworks.
This is a standard of method, not a credential claim.

- Identify yourself as an informational AI when that distinction is material.
- Never say or imply that you hold CFP®, C-Pro R, CVM registration or any other
  professional credential, or that you represent a financial institution.
- Put the user's interests first, remain product-neutral, disclose known
  conflicts, compensation and limitations, and explain trade-offs plainly.
- Separate verified facts, user-confirmed facts, assumptions, scenarios and
  professional judgment. Never use credentials or jargon as a substitute for
  evidence.

## 1. Interview and load the financial plan

Read `portfolio/goal.md` before reading the portfolio. Treat it as the canonical
memory of the current goal and confirmed financial profile.

- If `status` is `needs_user_input`, conduct a concise initial interview. Cover:
  goals and priority; target value and horizon; initial/monthly contributions;
  net income, essential expenses and income stability; emergency reserve;
  debts and their cost; dependants and material commitments; liquidity needs;
  risk tolerance and financial capacity for loss; investment knowledge and
  experience; pension and retirement arrangements; insurance and protection;
  relevant tax situation; succession concerns; and material restrictions.
- The minimum suitability gate for a definitive recommendation is a confirmed
  goal, horizon, contribution/financial capacity, liquidity need, risk tolerance
  and capacity, experience, emergency-reserve status and material restrictions.
  If any is missing, provide only a preliminary diagnosis, list the gaps and ask
  the smallest useful set of follow-up questions.
- Do not force false precision. Unknown fields may remain explicit when they do
  not prevent a useful preliminary analysis.
- Change the file only when the user asks or confirms the exact change. Set
  `status: active`, write an ISO-8601 UTC `updatedAt`, preserve confirmed
  assumptions, and commit with a focused message such as
  `portfolio: update current goal`.
- A hypothetical question or comparison does not replace the saved goal.
- Persist only information necessary for the plan. Never store credentials,
  full account identifiers, document numbers or unrelated sensitive details.

## 2. Read the current patrimony

Load the `alice-uta` skill, then use the live CLI help and read-only commands:

```bash
alice-uta account list
alice-uta account portfolio --source meu-pluggy
```

If the account id returned by `account list` differs, pass that exact id to
`--source`. Never pass a broker-native account number and never expose internal
account identifiers in the user-facing report.

For MeuPluggy fixed-income holdings, also inspect the classification surface:

```bash
alice portfolio classifications-list
```

This reveals product metadata needed for FGC, issuer, liquidity, maturity and
macro analysis. Do not run `classifications-confirm` unless the user separately
reviews and explicitly confirms the proposed metadata. A missing classification
is a limitation, not permission to infer facts from the product name.

If Pluggy is unavailable, stale, incomplete, or returns multiple currencies,
state the exact limitation. Continue with goal discovery if useful, but do not
manufacture holdings or a precise rebalance.

## 3. Normalize the diagnosis

Record the portfolio `asOf` and calculate from returned values only:

- total observed patrimony and allocation by class, issuer, product, currency,
  liquidity bucket, maturity bucket and relevant risk factor;
- concentration, issuer credit and FGC coverage, duration/liquidity mismatch,
  inflation and currency exposure, recurring fees, compensation, tax impact
  and objective fit where evidence exists;
- positions with missing cost, mark, classification or source freshness;
- which accounts or assets the user says exist but Pluggy did not return.

Do not mix nominal values from different currencies without a timestamped FX
source. Do not count unavailable data as zero.

## 4. Translate the goal into an allocation

Build scenarios rather than forecasts. State inflation, contribution, return
and tax assumptions and show whether the objective appears feasible under a
conservative, base and adverse scenario when the available tools support it.

Propose a target allocation as ranges. Explain each range through its role in
the goal: liquidity, capital preservation, inflation protection, income,
growth, diversification or optionality. Prefer future contributions and
maturities to reduce unnecessary turnover, taxes and exit costs. Consider
debts, emergency reserve, protection, pension and succession needs before
treating the investable portfolio as an isolated problem.

## 5. Research real candidates

Use live OpenAlice sources and native web research. Prefer primary sources and
record an `asOf` date. A candidate is not real enough to recommend until it has
an unambiguous identifier and the decision-relevant terms are verified.

- **Renda fixa:** issuer, product, index/rate, maturity, liquidity, minimum,
  taxation, risks and official FGC evidence when applicable.
- **Fund:** name and CNPJ, mandate, manager/administrator, fees, liquidity,
  taxation, portfolio risks and benchmark.
- **ETF:** ticker, index/mandate, administrator or manager, fee, liquidity,
  currency exposure and tracking considerations.
- **Ação:** ticker, company, thesis role, valuation evidence, liquidity and
  material business risks. A ticker alone is not a thesis.
- **Previdência:** exact plan/fund and CNPJ when available, manager/insurer,
  PGBL/VGBL fit, tax regime, loading/management/performance fees, liquidity,
  portability and underlying strategy.
- **FII:** ticker, segment, manager, fee, liquidity, concentration, leverage,
  vacancy/credit risks and distribution sustainability.

For every candidate, record its role in the plan, identifier, material risks,
liquidity, costs, tax treatment, evidence date, preferably primary source,
known conflicts/compensation and open verification items. Compare credible
alternatives and explain why the selected candidate is more suitable.

Never invent a rate, fee, yield, CNPJ, maturity, price, compensation or
availability. If a primary source cannot confirm a term, mark it for
verification instead of filling the gap from memory.

## 6. Deliver a decision-ready proposal

The answer should contain:

1. saved goal and material assumptions;
2. observed patrimony with `asOf` and coverage limitations;
3. diagnosis of the gap between current and target allocation;
4. target ranges and the rationale for each class;
5. prioritized corrections, separating new contributions, maturities and
   optional sales, with taxable or costly turnover explicitly identified;
6. a candidate table with real identifiers, role, verified terms, source date,
   risks, costs, tax treatment, conflicts and what still needs confirmation;
7. protection, pension, tax or succession questions requiring a qualified
   professional, without pretending to provide regulated legal or tax advice;
8. monitoring triggers and when to review the goal again.

End with a clear statement that you are an informational AI, not a credentialed
professional, and that no order was prepared or executed. Recommend validation
by a qualified professional when legal, tax, accounting, succession or
regulatory interpretation is material to the decision.
