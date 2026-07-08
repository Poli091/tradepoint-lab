# TradePoint Lab — Validation Results

## Version 1.0.0
**Date:** July 2026  
**Status:** Architecture frozen — collecting historical data  

---

## Universe

| Metric | Value |
|---|---|
| Total tickers analyzed | ~203 |
| Sectors covered | 20 |
| Analysis date | 2026-07-07 |
| Model version | v1.0.0 |

---

## Score Distribution

| Grade | Count | % |
|---|---|---|
| STRONG BUY (85+) | ~3 | ~1.5% |
| BUY (70–84) | ~12 | ~6% |
| HOLD (55–69) | ~55 | ~27% |
| SELL (40–54) | ~80 | ~39% |
| STRONG SELL (0–39) | ~53 | ~26% |

**Average score:** ~52.1/100  
**Distribution:** Skewed toward SELL/HOLD — consistent with a high-bar GARP model.  
A model that gives BUY to everything is useless. 7.5% BUY rate across 203 tickers represents real discrimination.

---

## Sector Averages

| Sector | Avg Score | Top Picks |
|---|---|---|
| Semiconductors | 65.8 | TSM 87, MU 88, NVDA 76, LRCX 77 |
| Communication Services | 55.9 | GOOGL 75, META 67, NFLX 65 |
| MedTech | 56.0 | LLY 77, DXCM 76, BSX 67 |
| Banks (large) | 53.2 | BAC 57, C 57, WFC 53 |
| Semis Equipment | 51.9 | LRCX 77, MRVL 73, AMAT 71 |
| Software Enterprise | 50.4 | INTU 66, ORCL 59 |
| Software SaaS | 51.4 | MSFT 66, VEEV 60 |
| Consumer Tech | 48.7 | SE 63, AAPL 61 |
| Health Care | 47.6 | LLY 77, GILD 63 |
| Materials | 46.5 | NEM 72, NUE 63 |
| Financials | 46.6 | BAC 57, SCHW 55 |
| Defense | 46.4 | GE 63, NOC 46 |
| AI / Data | 47.2 | APP 79, PLTR 62 |
| Real Estate | 45.5 | SPG 68, PSA 57 |
| Fintech | 44.9 | NU 56, MA 54 |
| Industrials | 41.2 | TT 50, CAT 49 |
| Utilities | 40.1 | CEG 61, NEE 58 |
| Consumer Disc. | 36.5 | AMZN 56, TJX 44 |
| Energy | 36.4 | EOG 58, COP 40 |
| Consumer Staples | 36.1 | KO 57, PG 42 |

---

## Component Efficiency (portfolio average)

| Component | Avg % of Max | Avg pts lost |
|---|---|---|
| Growth | 72% | 7.0 pts |
| Quality | 75% | 5.0 pts |
| Strength | 79% | 3.1 pts |
| Valuation | 59% | 6.1 pts |
| Technical | 36% | 9.7 pts |

**Key finding:** Technical is the biggest limiter (36% efficiency). This reflects genuine market underperformance of growth stocks vs SPY in mid-2026, not a model calibration issue.

---

## Model Philosophy Confirmed

The model exhibits a clear **GARP (Growth At a Reasonable Price)** personality:

```
High score: crecimiento fuerte + valuación razonable (TSM 87, MU 88, LLY 77)
Low score:  crecimiento bajo + valuación cara (DUK 33, SO 33, WOLF 14)
Penalized:  crecimiento alto + valuación muy cara (NOW 45, DDOG 46)
```

This is by design, not a bug. Whether GARP outperforms pure growth or pure value in this market cycle is the core question for backtesting.

---

## Known Outliers — Pending Investigation

| Ticker | Score | Expected | Hypothesis |
|---|---|---|---|
| UNH | 32.7 | ~50–60 | Health insurance D/E structure misinterpreted by DEFAULT profile |
| SPGI | 35 | ~55–65 | Rating agency pricing power not captured by current valuation model |
| BLK | 35 | ~50–60 | Asset manager AUM-based business model ≠ traditional revenue metrics |
| NOW | 45 | ~60–70 | SaaS with high PEG but best-in-class growth — valuation penalty may be too strict |
| AXON | 44 | ~55–65 | Operating margin near breakeven during heavy investment phase |

**Decision:** Do NOT modify the model for these outliers until backtesting provides evidence that adjustment improves predictive accuracy.

---

## Open Research Questions

| ID | Question | Status |
|---|---|---|
| RQ-001 | Do STRONG BUY signals outperform SPY over 12 months? | ⏳ Pending data |
| RQ-002 | Does Confidence >90% improve win rate? | ⏳ Pending data |
| RQ-003 | Does the Technical block add alpha? | ⏳ Pending data |
| RQ-004 | Does Valuation systematically penalize SaaS? | ⏳ Partial evidence |
| RQ-005 | Do sector profiles reduce false negatives? | ✅ Yes — VST improved from 17→31 after UTILITIES profile |
| RQ-006 | Do Gates improve risk-adjusted performance? | ⏳ Pending data |
| RQ-007 | Which component has the highest predictive power? | ⏳ Pending data |

---

## Bugs Fixed (v1.0.0)

| Bug | Impact | Fix |
|---|---|---|
| Quality scorer used first-non-null (ROI) instead of MAX(ROIC, ROI, ROE) | VST/CEG quality understated | Fixed — MAX of all available |
| Gate2 same bug | Gate2 triggered incorrectly for capital-intensive companies | Fixed — same MAX logic |
| Sector profiles used GICS sector name only | VST classified as Energy, not Utilities | Fixed — TICKER_OVERRIDES map |
| Risk D/E threshold was global (3.0) for all sectors | VST penalized despite passing Gate1 | Fixed — riskDebtMax per sector profile |

---

## Architecture Decisions (Frozen)

- **Weights:** Growth 25 / Quality 20 / Strength 15 / Valuation 15 / Technical 15 / Risk -10 max
- **Grades:** 85+ STRONG BUY · 70+ BUY · 55+ HOLD · 40+ SELL · 0+ STRONG SELL
- **Gates:** Gate1 cap=35 · Gate2 cap=58 · Gates run parallel to scoring
- **Null policy:** Proportional normalization — confidence decreases, score not penalized
- **Valuation cascade:** PEG → EV/FCF → EV/EBITDA → P/E (first available)
- **AI role:** Groq explains only, never affects the Conviction Score
- **Data grounding:** Groq prompts include actual fundamental data with explicit "do not contradict" instruction

---

## Next Milestone

**Target:** 12 weeks of weekly snapshots (Cron active since 2026-07-12)  
**Goal:** Answer RQ-001 through RQ-007 with statistical evidence  
**Rule:** No model changes until backtesting evidence justifies them

---

*"El algoritmo decide. La IA explica. Nunca al revés."*

---

## AI Integration Philosophy (added 2026-07-07)

> *"The quantitative engine is the only source of investment decisions.*
> *AI may explain, summarize or contextualize those decisions,*
> *but it must never create, override or modify them."*

### Architecture

```
Market Data (Finnhub + FMP + Alpaca)
          ↓
Conviction Engine (deterministic, reproducible)
          ↓
Score + Grade + Breakdown (authoritative)
          ↓
Groq LLM (explains the score, not the stock)
          ↓
Moat / Bear Case / Catalysts (interpretation only)
```

### Prompt Design Principles (v1.1)

1. **Authoritative Snapshot** — all score components passed as final outputs the LLM cannot modify
2. **Evidence → Conclusion** — every statement must be anchored in a supplied number
3. **No hallucination** — LLM may not reference acquisitions, lawsuits, or events not in the supplied context
4. **Interpreter, not analyst** — Groq explains WHY the engine produced the score, not its own thesis
5. **Scalability** — when the engine improves (v1.1, v1.2), Groq improves automatically without prompt changes

### Open Research Questions for Backtesting

| RQ | Question | Method |
|---|---|---|
| RQ-001 | Do STRONG BUY signals outperform SPY 12 months? | Compare score at signal date vs price 12M later |
| RQ-002 | Does Technical block add predictive alpha? | Compare model with/without Technical component |
| RQ-003 | Do Gates improve risk-adjusted returns? | Compare capped vs uncapped scores |
| RQ-004 | Does Confidence >90% improve win rate? | Segment returns by confidence level |
| RQ-005 | Does Valuation systematically penalize SaaS? | Compare SaaS returns vs model prediction |

*Rule: No model changes until backtesting evidence justifies them.*
