# Stock Analysis

How a US stock or ETF has behaved over up to 30 years, and how it relates to the economy:

- **Price & trend:** adjusted price history with 50- and 200-day moving averages, golden/death crosses, and the Fed funds rate overlaid. Returns over 1, 5 and 10 years, annual growth rate, worst drawdown and its recovery, and volatility.
- **Through Fed rate cycles:** annualized returns while the Fed was hiking, on hold, or cutting, plus a cycle-by-cycle table.
- **Sensitivity to the economy:** a regression of monthly returns on same-month changes in the Fed funds rate, inflation and unemployment, with plain-English results, significance, and a rolling 3-year correlation to show whether the link is stable.

Live at **https://ameyapurandare.com/projects/stock-analysis/app/**

## How it works

```
Browser (React + TypeScript)          Cloudflare Worker                     Providers
  all statistics computed here  ──▶   /api/stock/:ticker  ── 12h KV cache ──▶ Tiingo (daily prices)
                                      /api/macro          ── 24h KV cache ──▶ FRED (rates, CPI, unemployment)
```

The Worker keeps the API keys secret, validates tickers, caches responses so free-tier quotas go a long way, and rate-limits uncached lookups per visitor.

The statistics use **changes**, not levels: two series that both trend over decades (like a stock price and the Fed funds rate) always look correlated, which says nothing. The analysis code is in `src/lib/analysis.ts` and fully unit-tested.

## Development

```bash
npm install
npm test          # analysis, Worker and UI tests (no API keys needed)
npm run build
```

To run locally against real data, create `.dev.vars` (git-ignored):

```
TIINGO_API_KEY=...
FRED_API_KEY=...
```

then:

```bash
npm run build && npx wrangler dev
# open http://localhost:8787/projects/stock-analysis/app/
```

## Deploying

```bash
npx wrangler secret put TIINGO_API_KEY
npx wrangler secret put FRED_API_KEY
npm run deploy
```

The Worker has no public URL of its own; ameyapurandare.com forwards `/projects/stock-analysis/app/*` to it through a service binding.

## Data & disclaimer

Prices from [Tiingo](https://www.tiingo.com); economic data from [FRED](https://fred.stlouisfed.org), Federal Reserve Bank of St. Louis. This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis. For education only, not investment advice.
