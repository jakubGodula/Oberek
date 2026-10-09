# TOKENOMICS.md — estimate per package and per role, mapped to licences (DRAFT on Q-AI defaults)

Assumptions: strong = TL's Claude Max (subscription, budget is time not money); mid = teammates' Claude 20 USD / Gemini
Pro / Codex subscriptions; cheap = Sonnet/Flash/DeepSeek. API spend: 0 USD by default (Q-AI-05 A). Tokens = total
in+out per package session incl. retries; "strong-tier" column = what lands on the TL's licence.

| package | tier | est. tokens | strong-tier share | person-days (human) | stop at |
|---------|------|-------------|-------------------|---------------------|---------|
| WP-01 | strong | 1.0 M | 1.0 M | 1.5 | 2.0 M |
| WP-02 | strong | 0.8 M | 0.8 M (Rust owner's licence if strong, else TL dispatch) | 4 | 1.6 M |
| WP-03 | strong/mid | 0.8 M | 0.4 M | 3 | 1.6 M |
| WP-04 | mid | 0.6 M | 0 | 3.5 | 1.2 M |
| WP-05 | strong | 1.0 M | 1.0 M | 5 | 2.0 M |
| WP-06 | mid | 0.7 M | 0 | 3 | 1.4 M |
| WP-07 | strong | 1.2 M | 1.2 M | 5 | 2.4 M |
| WP-08 | mid | 0.6 M | 0 | 4 | 1.2 M |
| WP-09 | mid | 0.8 M | 0 | 5 | 1.6 M |
| WP-10 | cheap/mid | 0.5 M | 0 | 5 (mostly human) | 1.0 M |
| WP-11 (opt) | mid | 0.4 M | 0 | 2 | 0.8 M |
| WP-12 (opt) | mid | 0.4 M | 0 | 2 | 0.8 M |
| Integration (10 merges) | strong | 1.0 M | 1.0 M | 3 (TL, spread) | — |
| Gate 1 single reviews (×10) | cheap/mid | 0.8 M | 0 | — | — |
| Gate 1 dual second reviews (×3) | strong | 0.4 M | 0.4 M | — | — |
| Gate 2 intent checks (×10) | mid | 0.3 M | 0 | — | — |
| Plan regeneration after answers | strong | 0.3 M | 0.3 M | 0.5 | — |
| **Total** | | **≈ 11.6 M** | **≈ 6.1 M** | ≈ 47 person-days of 60 available | |

Per licence: TL ≈ 6.1 M strong-tier tokens over 14 days (≈ 0.45 M/day, within a Max plan's practical daily use);
each teammate ≈ 1.2–2.0 M mid/cheap tokens over their packages.
Rules: pass file paths, not contents; reports 200–300 words; parallelise only disjoint packages; a package that exceeds
2× its estimate or fails its checks three times stops and reports in `STATUS.md`.
