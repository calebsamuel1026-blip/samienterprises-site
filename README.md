# samienterprises.co

The static website for Sami Enterprises, a revenue consulting agency for owner-led home-service businesses (roofing, HVAC, plumbing, electrical).

Live: **https://samienterprises.co**

## Why

Home-service owners lose work in small, fixable places: missed calls, slow follow-up, estimate forms that ask too much, no way to text or pay online. The site explains those leaks by trade, publishes the research behind them, and lets an owner book a call without picking up the phone.

## How it works

- **Plain static HTML** served by GitHub Pages from this repo (custom domain in `CNAME`). Each page is a folder with an `index.html`: trade pages (`roofing/`, `hvac/`, `plumbing/`, `electrical/`), `services/`, `pricing/`, `results/`, `about/`, and legal pages.
- **Research** (`research/`). A public audit of home-service websites for revenue leaks, with the dataset published next to it as JSON (`research/290-site-audit.json`, CC BY 4.0).
- **Booking** (`sami-book.js`, `book/`). An on-site form that fills a day picker with the next 7 business days, captures time zone and attribution, validates, and inserts into a Supabase table with an insert-only public key. If the backend isn't configured it falls back to a pre-filled email, so no booking is lost.
- **First-party analytics** (`sami-events.js`). A closed allowlist of events (page views, scroll depth, section views, CTA clicks) plus friction signals computed in the browser (rage clicks, dead clicks, JS errors, quick-backs, active time), written to insert-only storage. No cookies and no IP stored; a random visitor id lives in `localStorage`. Without config it does nothing.
- **Per-business preview pages** (`p/`). Noindex pages generated for individual businesses.
- **Search and AI discoverability.** `sitemap.xml`, `robots.txt`, Open Graph images in `og/`, and an `llms.txt` summary for language-model crawlers.

## Tech stack

HTML, CSS and vanilla JavaScript, Supabase (Postgres, insert-only row-level security) for bookings and events, GitHub Pages with a custom domain.

## Run locally

```bash
python -m http.server 8000   # then open http://localhost:8000
```
