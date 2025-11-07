## Facebook Ads Library Scraper (Node.js)

Extract advertisers from Facebook Ads Library by keyword, filter by how long ads have been running, and enrich with page contact info and follower counts.

### What it does

- Searches Ads Library for one or more keywords in a given country
- Parses each ad card to find the advertiser (Facebook Page) and the date the ad started
- Keeps advertisers with ads running for at least N months
- Visits the page to pull contact info (email/phone/address when visible) and follower count
- Saves CSV and JSON to the `output/` directory

### Requirements

- Node.js 18+
- Playwright will download a browser on first run

### Install

```bash
npm i
```

Optional: Install Playwright browsers explicitly (first run will auto-install):

```bash
npx playwright install
```

### Usage

```bash
npm run scrape -- \
  --keywords "home painter, Benjamin Moore" \
  --country US \
  --minMonths 3 \
  --limit 100 \
  --headless true
```

Options:

- `--keywords` (required): Comma-separated list of search queries
- `--country` (default: `US`): Ads Library country code
- `--minMonths` (default: `3`): Minimum months the ad has been running
- `--limit` (default: `100`): Max ad cards to inspect per keyword
- `--headless` (default: `true`)

Outputs are written to `output/results-<timestamp>.{json,csv}`.

### Notes and caveats

- Facebook UI and DOM change frequently; selectors rely on visible text like "Ad started running on" and may require adjustments over time.
- Some page details (email/phone/address) are only visible to logged-in users or may be hidden; the scraper extracts what is publicly visible.
- Use responsibly. Ensure your use complies with Facebook/Meta terms and any applicable laws.


