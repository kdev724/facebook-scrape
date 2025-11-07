import { normalizePageUrl } from './utils.js';

function candidateAboutUrls(pageUrl) {
	const u = normalizePageUrl(pageUrl);
	return [
		u,
		`${u}/about`,
		`${u}/about_contact_and_basic_info`,
		`${u}/about_profile_transparency`,
	];
}

async function tryExtractFollowers(page) {
	// Look for texts like "X followers"
	const texts = [
		page.locator('text=/\\d[\\d,.]*\\s+followers/i').first(),
		page.locator('span:has-text("followers")').first(),
	];
	for (const loc of texts) {
		if (await loc.isVisible().catch(() => false)) {
			const t = (await loc.textContent()) || '';
			const m = t.match(/([\d,.]+)\s+followers/i);
			if (m && m[1]) {
				const num = parseFollowerNumber(m[1]);
				if (!Number.isNaN(num)) return num;
			}
		}
	}
	return null;
}

function parseFollowerNumber(s) {
	const str = s.toLowerCase().replace(/,/g, '');
	if (str.endsWith('k')) return Math.round(parseFloat(str) * 1000);
	if (str.endsWith('m')) return Math.round(parseFloat(str) * 1_000_000);
	const n = parseInt(str, 10);
	return Number.isNaN(n) ? null : n;
}

async function tryExtractContact(page) {
	// Look for visible email, phone, and address on About pages
	const bodyText = await page.content();
	let email = null;
	let phone = null;
	let address = null;

	// Emails
	const emailMatch = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
	if (emailMatch) email = emailMatch[0];

	// Phone numbers (US-centric, heuristic)
	const phoneMatch = bodyText.match(/\+?1?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
	if (phoneMatch) phone = phoneMatch[0];

	// Addresses (very heuristic; attempt to find lines with street suffixes)
	const addressMatch = bodyText.match(/\d{2,6}[^\n<]{0,40}\b(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ct|Court)\b[^<\n]{0,80}/i);
	if (addressMatch) address = addressMatch[0].replace(/<[^>]*>/g, '').trim();

	return { email, phone, address };
}

export async function enrichPageDetails(page, pageUrl) {
	const urls = candidateAboutUrls(pageUrl);
	let followers = null;
	let contact = { email: null, phone: null, address: null };

	for (const url of urls) {
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

			// Dismiss potential login walls or cookie prompts
			const notNow = page.locator('text="Not Now"').first();
			if (await notNow.isVisible().catch(() => false)) await notNow.click().catch(() => {});
			const accept = page.locator('button:has-text("Allow all cookies"), button:has-text("Accept all")');
			if (await accept.first().isVisible().catch(() => false)) await accept.first().click().catch(() => {});

			if (followers == null) followers = await tryExtractFollowers(page);
			if (!contact.email || !contact.phone || !contact.address) {
				const c = await tryExtractContact(page);
				contact = {
					email: contact.email || c.email,
					phone: contact.phone || c.phone,
					address: contact.address || c.address,
				};
			}
			if (followers != null && (contact.email || contact.phone || contact.address)) break;
		} catch {
			// try next url
		}
	}

	return { followers, ...contact };
}


