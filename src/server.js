import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeAdvertisers } from './scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.post('/api/scrape', async (req, res) => {
	const {
		keywords,
		country = 'US',
		minMonths = 3,
		limit = 100,
		headless = true,
		timeout = 30000,
		verbose = false,
	} = req.body || {};

	try {
		if (!keywords || (Array.isArray(keywords) && keywords.length === 0)) {
			return res.status(400).json({ error: 'Missing keywords' });
		}
		const keywordList = Array.isArray(keywords)
			? keywords
			: String(keywords).split(',').map((s) => s.trim()).filter(Boolean);

		console.log('Scraping advertisers...');
		const results = await scrapeAdvertisers({
			keywords: keywordList,
			country,
			minMonths: Number(minMonths),
			limitPerKeyword: Number(limit),
			headless: Boolean(headless),
			timeout: Number(timeout),
			logger: verbose ? (...args) => console.log('[api]', ...args) : undefined,
		});

		return res.json({ count: results.length, results });
	} catch (err) {
		console.error('Scrape error:', err);
		return res.status(500).json({ error: String(err && err.message ? err.message : err) });
	}
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
	console.log(`UI available at http://localhost:${PORT}`);
});


