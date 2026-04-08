# SmartArch — Market Intelligence Plugin

A drop-in plugin for the SmartArch AI Architectural Design Platform.  
Adds a full real-time global real estate market explorer powered by an interactive Leaflet.js map, without touching any existing code.

---

## What it does

| Feature | Detail |
|---|---|
| Interactive map | Leaflet.js, dark-themed, pan/zoom anywhere on Earth |
| 3 map modes | Markers · Cluster · Heatmap (canvas-based, no extra libs) |
| Real-time listings | Pulls from RapidAPI Realty → OSM Overpass → simulation fallback |
| Smart filters | Price range, property type, value score, proximity factors |
| Proximity factors | City distance, electricity, public transport, schools, flood risk |
| Value Score | 0–100 composite score weighing all factors |
| Detail panel | Per-listing breakdown, vs-area chart, factor grid |
| 12-month trend | Sparkline chart per location |
| Design handoff | "Design on this Plot →" button passes plot to architect.html |
| Favourites | Save listings to localStorage |
| Auto-refresh | Data reloads every 5 minutes |
| No-key fallback | Realistic geo-aware simulation when all APIs are offline |

---

## File structure

```
smartarch-market-plugin/
│
├── frontend/
│   ├── market.html          ← New page (drop into frontend/)
│   ├── css/
│   │   └── market.css       ← Drop into frontend/css/
│   └── js/
│       ├── market-api.js    ← API client + simulation engine
│       ├── market-map.js    ← Leaflet controller
│       ├── market-filters.js← Filter UI + state
│       ├── market-charts.js ← Chart.js 4 wrappers
│       └── market.js        ← Main orchestrator
│
├── backend-market/          ← Drop alongside backend-main/ and backend-ai/
│   ├── server.js
│   ├── routes/
│   │   ├── listingRoutes.js
│   │   └── statsRoutes.js
│   ├── controllers/
│   │   ├── listingController.js
│   │   └── statsController.js
│   ├── services/
│   │   └── marketService.js ← Data source priority chain
│   ├── middleware/
│   │   ├── auth.js          ← Reuses your existing JWT_SECRET
│   │   ├── validators.js
│   │   └── errorHandler.js
│   ├── .env.example
│   └── package.json
│
├── INTEGRATION_SNIPPETS.html ← Copy-paste additions for existing files
└── README.md
```

---

## Installation — 5 steps

### 1. Copy files

```bash
# Frontend
cp -r smartarch-market-plugin/frontend/market.html   smartarch/frontend/
cp -r smartarch-market-plugin/frontend/css/market.css smartarch/frontend/css/
cp -r smartarch-market-plugin/frontend/js/market-*.js smartarch/frontend/js/

# Backend
cp -r smartarch-market-plugin/backend-market smartarch/backend-market
```

### 2. Install backend-market dependencies

```bash
cd smartarch/backend-market
npm install
cp .env.example .env
# Edit .env — set JWT_SECRET to match backend-main's JWT_SECRET
```

### 3. Add the dashboard card *(optional but recommended)*

Open `INTEGRATION_SNIPPETS.html` and copy **Snippet 1** into your `dashboard.html`  
where your existing tool/quick-action cards are.

### 4. Wire architect.html handoff *(optional)*

Copy **Snippet 3** from `INTEGRATION_SNIPPETS.html` into `architect.html`  
just before `</body>`. This shows a banner when a user arrives from a market listing.

### 5. Start backend-market

```bash
# From project root
cd backend-market && npm start
# Or add to root package.json scripts (see Snippet 5 in INTEGRATION_SNIPPETS.html)
```

Open `http://localhost:your-frontend-port/market.html` — done.

---

## Data sources

The service tries each source in order and falls back automatically:

```
1. RapidAPI Realty (real US/CA listings)   ← requires RAPIDAPI_KEY in .env
        ↓ if unavailable
2. OpenStreetMap Overpass API              ← free, no key, building outlines worldwide
        ↓ if unavailable or zoom too wide
3. Built-in simulation engine             ← always works, geographically accurate pricing
```

The simulation engine uses lat/lng heuristics to generate realistic price ranges for any location on Earth (N America, W Europe, E Asia, Australia, Africa, S Asia, etc.).

---

## Adding real API keys later

### RapidAPI Realty (US/Canada)
1. Sign up at https://rapidapi.com/apidojo/api/realty-in-us
2. Set `RAPIDAPI_KEY=your_key` in `backend-market/.env`
3. Restart backend-market — it will automatically use real data for US/Canada bounds

### Proxy through backend-main (single origin)
See **Snippet 4** in `INTEGRATION_SNIPPETS.html`.  
Install `http-proxy-middleware` in backend-main and add one `app.use()` line.  
Then change `BASE` in `market-api.js` from `http://localhost:4000/api/market` to `/api/market`.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MARKET_PORT` | No | `4000` | Port for backend-market |
| `JWT_SECRET` | Yes | — | Must match backend-main's secret |
| `CORS_ORIGIN` | No | `*` | Restrict to your frontend origin in production |
| `RAPIDAPI_KEY` | No | — | Enables real US/CA listing data |
| `NODE_ENV` | No | `development` | Set to `production` to suppress stack traces |

---

## Architecture overview

```
Browser
  └── market.html
        ├── market.js          (orchestrator)
        ├── market-api.js      (data client + offline simulation)
        ├── market-map.js      (Leaflet controller)
        ├── market-filters.js  (filter state + UI)
        └── market-charts.js   (Chart.js wrappers)
              │
              ▼ REST (localhost:4000 or proxied via backend-main)
        backend-market/server.js
              ├── GET /api/market/listings   (geo-filtered, paginated)
              ├── GET /api/market/listings/:id
              ├── GET /api/market/stats/area
              └── GET /api/market/stats/trend
                    │
                    ▼ marketService.js priority chain
                    ├── RapidAPI Realty    (real data, key required)
                    ├── OSM Overpass API   (free, small areas)
                    └── Simulation engine  (always-on fallback)
```

---

## Non-breaking guarantee

- **Zero changes** to `backend-main`, `backend-ai`, or any existing frontend file
- `backend-market` runs on its own port (4000) — completely isolated
- The only additions to existing files are *optional* nav links and the dashboard card
- Reuses `JWT_SECRET` so existing SmartArch sessions work transparently
- If `backend-market` is not running, `market-api.js` falls back to client-side simulation automatically — the page always works