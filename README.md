# Stock Analysis

How a US stock or ETF has behaved over up to 30 years, and how it relates to the economy:

- **Price & trend:** adjusted price history with 50- and 200-day moving averages, golden/death crosses, and the Fed funds rate overlaid. Returns over 1, 5 and 10 years, annual growth rate, worst drawdown and its recovery, and volatility.
- **Through Fed rate cycles:** annualized returns while the Fed was hiking, on hold, or cutting, plus a cycle-by-cycle table.
- **Sensitivity to the economy:** a regression of monthly returns on same-month changes in the Fed funds rate, inflation and unemployment, with plain-English results, significance, and a rolling 3-year correlation to show whether the link is stable.

Live at **https://ameyapurandare.com/projects/stock-analysis/app/**. It installs as an app on desktop and mobile (PWA), and stocks you've already looked up open offline.

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
  all statistics computed here                /api/ping  → D1 (anonymous usage counts)
```

Tiingo and FRED don't send CORS headers, so browsers can't call them directly. The Worker relays each request with the visitor's key in a header (`X-Tiingo-Key`, `X-Fred-Key`). Keys are used only for that upstream request, never stored or logged. Responses are marked `private, no-store`, and nothing is cached on the server, so one visitor's data is never served to another. The relay validates tickers and key formats, rate-limits per visitor, and turns provider errors (rejected key, usage limit, unknown ticker) into clear messages.

The statistics use **changes**, not levels: two series that both trend over decades (like a stock price and the Fed funds rate) always look correlated, which says nothing. The analysis code is in `src/lib/analysis.ts` and fully unit-tested.

## Usage counts

Same scheme as the Finance Tracker:

- **Installs and opens are always counted.** The app sends `install` (once per device) or `open_app` / `open_web` (once per session, installed app vs. browser tab) or `trial_ended` (once per device, when a browser uses up its 3 free sessions), the app version and a one-off random number that isn't stored, so a count can't be linked to anything else.
- **Everything else is opt-in.** On first visit, people are asked whether to share anonymous usage counts. If they opt in, the app sends a random ID kept in their browser, the app version and one of these events:
  - `opt_in`
  - `active`, at most once a day
  - `setup_complete`, when they've added working keys

It never sends keys, tickers or anything they look up.

```bash
npm run stats   # includes app opens per day (installed vs browser)     # opted-in devices, key setups, daily/weekly/monthly actives, retention
```

## Install sign-up

Installing the app requires a one-time sign-up on that device: **name, email and location only**, typed by the person. It appears on the install screen, or on the installed app's first launch if it was installed from the browser's own menu. In a browser tab, people get **3 free sessions** first: a session is one visit in a tab (reloads don't count), counted only in that browser and never sent anywhere. After the third, the sign-up is required to keep using the browser version. Signed-up devices are never counted.

- `POST api/register` validates the three fields, rate-limits per visitor, and ignores anything else. No IP address is stored.
- Rows live in the `registrations` table of this app's D1 database, one per email (signing up again updates name and location).
- The form states the purpose (understanding who uses the app, occasional emails about major updates) and that people can email support@ameyapurandare.com to see or delete their data.
- To view sign-ups from both apps, run `npm run signups` in the website repo, or open ameyapurandare.com/admin/signups (protected by Cloudflare Access).

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
