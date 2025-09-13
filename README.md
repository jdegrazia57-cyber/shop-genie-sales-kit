# Shop Genie Pro

Buyer-facing landing page + enhanced analytics dashboard (static HTML/CSS/JS).  
Features: CSV upload, KPIs, core charts, **Sales Funnel**, **3‑point MA Forecast**, and **Cohort Heatmap**.

## Structure
- `index.html` — marketing/landing page (links to dashboard)
- `dashboard.html` — full dashboard
- `assets/style.css` — shared black & teal theme
- `assets/app-pro.js` — dashboard logic
- `assets/logo.svg`, `assets/favicon.svg`
- `sample-data.csv` — quick demo dataset

## Run locally
Open `index.html` (or `dashboard.html`) in your browser.

## Deploy to Netlify
1. New site from folder → select the unzipped folder.
2. Build: none. Publish directory: root.
3. Share the live URL with buyers.

## CSV format
Required headers:
`date, channel, region, product, units, price, revenue, cost`
