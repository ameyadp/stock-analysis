# Stock Analysis

How a US stock or ETF has behaved over up to 30 years, and how it relates to the economy:

- **Price & trend:** adjusted price history with 50- and 200-day moving averages, golden/death crosses, and the Fed funds rate overlaid. Returns over 1, 5 and 10 years, annual growth rate, worst drawdown and its recovery, and volatility.
- **Through Fed rate cycles:** annualized returns while the Fed was hiking, on hold, or cutting, plus a cycle-by-cycle table.
- **Sensitivity to the economy:** a regression of monthly returns on same-month changes in the Fed funds rate, inflation and unemployment, with plain-English results, significance, and a rolling 3-year correlation to show whether the link is stable.

Live at **https://ameyapurandare.com/projects/stock-analysis/app/**

## Bring your own (free) keys

Each visitor uses their own free API keys:

- **Tiingo** for daily stock prices: sign up at [tiingo.com](https://www.tiingo.com/account/api/token)
- **FRED** for interest rates, inflation and unemployment: request a key at [fred.stlouisfed.org](https://fredaccount.stlouisfed.org/apikeys)

The app tests both keys before saving them, and keeps them only in the visitor's browser (localStorage).

## How it works

```
Browser (React + TypeScript)                Cloudflare Worker (relay)          Providers
  keys in localStorage                        /api/stock/:ticker  ───────────▶ Tiingo
  data cached 12–24 h in Cache Storage ──▶    /api/macro          ───────────▶ FRED
  all statistics computed here                /api/ping  → D1 (opt-in usage counts)
```

Tiingo and FRED don't send CORS headers, so browsers can't call them directly. The Worker relays each request with the visitor's key in a header (`X-Tiingo-Key`, `X-Fred-Key`). Keys are used only for that upstream request, never stored or logged. Responses are marked `private, no-store`, and nothing is cached on the server, so one visitor's data is never served to another. The relay validates tickers and key formats, rate-limits per visitor, and turns provider errors (rejected key, usage limit, unknown ticker) into clear messages.

The statistics use **changes**, not levels: two series that both trend over decades (like a stock price and the Fed funds rate) always look correlated, which says nothing. The analysis code is in `src/lib/analysis.ts` and fully unit-tested.

## Usage counts

Same scheme as the Finance Tracker. On first visit, people are asked whether to share anonymous usage counts. If they opt in, the app sends a random ID, the app version and one of these events:

- `opt_in`
- `active`, at most once a day
- `setup_complete`, when they've added working keys

It never sends keys, tickers or anything they look up.

```bash
npm run stats     # opted-in devices, key setups, daily/weekly/monthly actives, retention
```

## Development

```bash
npm install
npm test          # analysis, Worker and UI tests (no API keys needed)
npm run build
```

Run the built app and Worker locally:

```bash
npx wrangler d1 migrations apply stock-analysis-telemetry --local
npm run build && npx wrangler dev
# open http://localhost:8787/projects/stock-analysis/app/ and enter your keys
```

## Deploying

```bash
npm run db:migrate   # first time only
npm run deploy
```

The Worker has no public URL of its own; ameyapurandare.com forwards `/projects/stock-analysis/app/*` to it through a service binding.

## Data & disclaimer

Prices from [Tiingo](https://www.tiingo.com); economic data from [FRED](https://fred.stlouisfed.org), Federal Reserve Bank of St. Louis. This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis. For education only, not investment advice.
