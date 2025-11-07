import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseAdvertiserFromAdCard, computeMonthsBetween, getUniqueKey } from './utils.js';
import { enrichPageDetails } from './facebookPageParser.js';

const ADS_LIBRARY_BASE = 'https://www.facebook.com/ads/library/';

function searchUrlFor({ keyword, country }) {
	const params = new URLSearchParams();
	params.set('active_status', 'active');
	params.set('ad_type', 'all');
	params.set('country', country);
	params.set('q', keyword);
	// sort by relevancy as default; FB may ignore
	params.set('sort_data[mode]', 'relevancy_monthly_grouped');
	params.set('sort_data[direction]', 'desc');
	return `${ADS_LIBRARY_BASE}?${params.toString()}`;
}

async function autoScroll(page, { maxScrolls = 30, scrollDelayMs = 800 }) {
	let previousHeight = 0;
	for (let i = 0; i < maxScrolls; i += 1) {
		await page.evaluate(() => {
			window.scrollBy(0, window.innerHeight * 0.9);
		});
		await page.waitForTimeout(scrollDelayMs);
		const currentHeight = await page.evaluate(() => document.body.scrollHeight);
		if (currentHeight === previousHeight) break;
		previousHeight = currentHeight;
	}
}

async function locateAdCards(page) {
	// Heuristics: find elements containing the phrase that typically appears on ads
	// Use case-insensitive partial text to be resilient to minor wording changes.
	const adTextLocator = page.locator('text=/Ad\s+started\s+running\s+on/i');
	const count = await adTextLocator.count();
	const cardHandles = [];
	for (let i = 0; i < count; i += 1) {
		const textEl = adTextLocator.nth(i);
		// ascend to a larger container
		const card = await textEl.evaluateHandle((el) => {
			let node = el;
			for (let j = 0; j < 6; j += 1) {
				if (!node || !node.parentElement) break;
				node = node.parentElement;
			}
			return node;
		});
		cardHandles.push(card);
	}
	return cardHandles;
}

async function dismissOverlays(page) {
    const selectors = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Accept All Cookies")',
        'button:has-text("Accept all")',
        'button:has-text("Accept")',
        'button:has-text("Only allow essential cookies")',
        'button:has-text("Essential cookies only")',
        'button:has-text("Continue")',
        'button:has-text("Not Now")',
        'div[role="dialog"] button:has-text("OK")',
    ];
    for (const sel of selectors) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible().catch(() => false)) {
                console.log(`Dismissing overlay via selector: ${sel}`);
                await btn.click({ timeout: 2000 }).catch(() => {});
            }
        } catch {}
    }
}

export async function scrapeAdvertisers({ keywords, country, minMonths, limitPerKeyword, headless, timeout }) {
    console.log(`Launching browser (headless=${headless})...`);
    const browser = await chromium.launch({ headless });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		// lower fingerprinting. Disable geolocation prompts, etc.
		permissions: [],
	});
	const page = await context.newPage();
	page.setDefaultTimeout(timeout);

	const advertiserMap = new Map();

    for (const keyword of keywords) {
        const url = searchUrlFor({ keyword, country });
        console.log(`Keyword: "${keyword}" → ${url}`);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        } catch (err) {
            console.log(`Navigation error (continuing): ${String(err && err.message ? err.message : err)}`);
        }
		console.log('Waiting for 1500ms...');
        await page.waitForTimeout(1500);
        console.log('Dismissing overlays...');
        await dismissOverlays(page).catch(() => {});
        console.log('Waiting for load state...');
        await page.waitForLoadState('networkidle', { timeout: Math.max(2000, Math.floor(timeout / 3)) }).catch(() => {});
		console.log('Loading state done');
		// Accept cookies if prompted
        const acceptVariants = [
            'button:has-text("Allow all cookies")',
            'button:has-text("Accept All Cookies")',
            'button:has-text("Accept all")',
            'button:has-text("Accept")'
        ];
        for (const sel of acceptVariants) {
            const btn = page.locator(sel).first();
			console.log(btn)
            if (await btn.isVisible().catch(() => false)) {
                console.log('Accepting cookies...');
                await btn.click().catch(() => {});
                break;
            }
        }

        console.log('Scrolling results...');
        await autoScroll(page, { maxScrolls: Math.max(10, Math.ceil(limitPerKeyword / 10)) });
		let cards = await locateAdCards(page);
        console.log(`Found ~${cards.length} ad cards, will inspect up to ${Math.min(cards.length, limitPerKeyword)}.`);
        if (!cards.length) {
            console.log('No cards detected by text. Trying a brief additional scroll and overlay dismiss...');
            await dismissOverlays(page).catch(() => {});
            await autoScroll(page, { maxScrolls: 8, scrollDelayMs: 700 });
			cards = await locateAdCards(page);
			console.log(`After fallback, cards detected: ${cards.length}`);
			if (!cards.length) {
				const outDir = path.join(process.cwd(), 'output');
				await fs.mkdir(outDir, { recursive: true }).catch(() => {});
				const ts = new Date().toISOString().replace(/[:.]/g, '-');
				const safeKw = String(keyword).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'kw';
				const htmlPath = path.join(outDir, `debug-${safeKw}-${ts}.html`);
				const pngPath = path.join(outDir, `debug-${safeKw}-${ts}.png`);
				await fs.writeFile(htmlPath, await page.content()).catch(() => {});
				await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
				console.log(`Saved debug snapshot: ${htmlPath} and ${pngPath}`);
			}
        }

		for (let i = 0; i < cards.length && i < limitPerKeyword; i += 1) {
			const handle = cards[i];
			try {
                const ad = await parseAdvertiserFromAdCard(page, handle);
				if (!ad || !ad.pageUrl || !ad.pageName || !ad.startedAt) continue;

				const months = computeMonthsBetween(new Date(ad.startedAt), new Date());
				if (months < minMonths) continue;

				const key = getUniqueKey(ad.pageUrl, ad.pageName);
				if (!advertiserMap.has(key)) {
					advertiserMap.set(key, {
						companyName: ad.pageName,
						facebookPageUrl: ad.pageUrl,
						monthsRunning: months,
						followers: null,
						contact: { phone: null, email: null, address: null },
						keywordsMatched: [keyword],
					});
                    console.log(`[${i + 1}/${Math.min(cards.length, limitPerKeyword)}] Added advertiser: ${ad.pageName} (${months} months)`);
				} else {
					const existing = advertiserMap.get(key);
					existing.monthsRunning = Math.max(existing.monthsRunning, months);
					if (!existing.keywordsMatched.includes(keyword)) existing.keywordsMatched.push(keyword);
                    console.log(`[${i + 1}/${Math.min(cards.length, limitPerKeyword)}] Updated advertiser: ${ad.pageName} (months=${existing.monthsRunning})`);
				}
			} catch (err) {
				// non-fatal; continue
                console.log(`Card ${i + 1} error: ${String(err && err.message ? err.message : err)}`);
			}
		}
	}

	// Enrich each unique page with follower/contact details
	const advertisers = Array.from(advertiserMap.values());
    console.log(`Unique advertisers to enrich: ${advertisers.length}`);
	for (let i = 0; i < advertisers.length; i += 1) {
		const adv = advertisers[i];
		try {
            console.log(`[Enrich ${i + 1}/${advertisers.length}] Visiting page: ${adv.facebookPageUrl}`);
			const details = await enrichPageDetails(page, adv.facebookPageUrl);
			adv.followers = details.followers ?? adv.followers;
			adv.contact = {
				phone: details.phone ?? adv.contact.phone,
				email: details.email ?? adv.contact.email,
				address: details.address ?? adv.contact.address,
			};
            console.log(`[Enrich ${i + 1}/${advertisers.length}] Done: followers=${adv.followers ?? 'n/a'}`);
		} catch (err) {
			// continue
            console.log(`[Enrich ${i + 1}/${advertisers.length}] Error: ${String(err && err.message ? err.message : err)}`);
		}
	}

    console.log('Closing browser...');
	await browser.close();
    console.log(`Completed. Returning ${advertisers.length} advertisers.`);
	return advertisers;
}


