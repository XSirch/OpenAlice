# Alice Invest fixed-income validation coverage

This is a capability matrix, not an investment recommendation or a claim of
market-data validation. `Implemented` means deterministic local code and unit
tests exist. `Validated` requires recorded technical evidence; no row below is
external-market validated by this document.

| Coverage | Current state | Limitation / evidence still required |
| --- | --- | --- |
| CDB indexed to CDI | Implemented | Product inputs and CDI reference remain user/source supplied. |
| Prefixado CDB | Implemented | No issuer offer, liquidity, or market-price validation. |
| LCI/LCA equivalence | Implemented | Tax exemption and product eligibility must be supplied explicitly. |
| Regressive IR | Implemented | Unit calculations only; no tax authority or product-statement reconciliation. |
| Daily IOF | Implemented | Unit calculations only; boundary-day and institution settlement behavior remain unproven. |
| Tesouro Selic / prefixado / IPCA+ | Limitation | The contracts can express assumptions; no official price, mark-to-market, or settlement integration exists. |
| Mark-to-market | Limitation | No yield curve, price source, duration engine, or historical validation exists. |
| FGC issuer and conglomerate exposure | Limitation | Existing fields record assumptions; no authoritative issuer/conglomerate aggregation source exists. |
| Funds and come-cotas | Limitation | Outside the implemented fixed-income calculator. |
| Early redemption and liquidity | Limitation | Product liquidity is represented as supplied data; no issuer-specific rules are integrated. |

No matrix row promotes Alice Invest above `research_only`. The next evidence
must be recorded under a validation run ID with source, timestamp, inputs,
expected result, observed result, and any applicable provider limitation.
