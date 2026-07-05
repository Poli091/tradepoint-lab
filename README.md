# TradePoint Dashboard

Modular React + Vite trading dashboard. Deploy to Cloudflare Pages in one command.

## Stack

- **React 18** + **Vite 5**
- **recharts** — price chart
- **lucide-react** — icons
- Plain CSS custom properties (no Tailwind, no CSS-in-JS)

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

## Build & deploy to Cloudflare Pages

```bash
npm run build        # outputs to /dist
```

**Cloudflare Pages settings:**
| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 18 |

Push to GitHub → connect repo in Cloudflare Pages → done.

---

## Project structure

```
src/
├── data/               ← Module 1: Raw constants (edit to update your portfolio)
│   ├── positions.js
│   ├── watchlist.js
│   └── earnings.js
│
├── utils/              ← Module 2: Pure functions, no side effects
│   ├── format.js       fUSD, fPct, fSignedUSD …
│   ├── finance.js      calcPnL, filterByAccount, calcPortfolioStats …
│   └── chartData.js    genPriceData, genSparklines
│
├── hooks/              ← Module 3: Shared app state
│   └── useTradepoint.js
│
├── components/
│   ├── ui/             ← Module 4: Stateless primitives
│   │   ├── Badge.jsx
│   │   ├── ConvictionRing.jsx
│   │   ├── Sparkline.jsx
│   │   └── StatCard.jsx
│   ├── layout/         ← Module 5: Shell components
│   │   ├── Sidebar.jsx
│   │   └── Header.jsx
│   └── widgets/        ← Module 6: Feature widgets
│       ├── PriceChart.jsx
│       ├── OrderPanel.jsx
│       ├── PositionsTable.jsx
│       └── WatchlistPanel.jsx
│
├── views/              ← Module 7: Full-page views
│   ├── DashboardView.jsx
│   ├── PositionsView.jsx
│   ├── WatchlistView.jsx
│   └── CalendarView.jsx
│
├── styles/globals.css  ← All design tokens (CSS variables)
├── App.jsx             ← View router
└── main.jsx            ← Entry point
```

## Adding a new view

1. Create `src/views/MyView.jsx`
2. Add a nav entry in `src/components/layout/Sidebar.jsx` → `NAV_ITEMS`
3. Register the view in `src/App.jsx` → `renderView()` switch

## Connecting a live price feed

Replace `genPriceData()` in `src/utils/chartData.js` with a real API call
(Alpaca, Polygon.io, Finnhub, etc.). The chart component only expects
`{ date: string, price: number }[]`.

## Changing the theme

All colors are CSS variables in `src/styles/globals.css` under `:root`.
Edit `--accent`, `--green`, `--red`, etc. to retheme the entire app instantly.
