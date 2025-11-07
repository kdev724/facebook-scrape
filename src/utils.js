export function computeMonthsBetween(startDate, endDate) {
	const start = new Date(startDate);
	const end = new Date(endDate);
	const years = end.getFullYear() - start.getFullYear();
	const months = end.getMonth() - start.getMonth();
	const total = years * 12 + months - (end.getDate() < start.getDate() ? 1 : 0);
	return Math.max(0, total);
}

export function getUniqueKey(pageUrl, pageName) {
	return `${normalizePageUrl(pageUrl)}::${pageName.trim().toLowerCase()}`;
}

export function normalizePageUrl(url) {
	try {
		const u = new URL(url, 'https://www.facebook.com');
		// strip query and trailing slashes
		u.search = '';
		u.hash = '';
		let s = u.toString();
		if (s.endsWith('/')) s = s.slice(0, -1);
		return s;
	} catch {
		return url;
	}
}

export async function parseAdvertiserFromAdCard(page, cardHandle) {
	// Within the card, find the page link and the start date text
	const pageUrl = await page.evaluate((el) => {
		const anchors = el.querySelectorAll('a');
		for (const a of anchors) {
			const href = a.getAttribute('href') || '';
			// Heuristic: page links often look like https://www.facebook.com/<slug> or /<slug>
			if (/facebook\.com\//.test(href) || /^\/[A-Za-z0-9_.-]+\/?$/.test(href)) {
				// Skip obvious non-page links
				if (/ads\/library/.test(href)) continue;
				return href.startsWith('http') ? href : `https://www.facebook.com${href}`;
			}
		}
		return null;
	}, cardHandle);

	const pageName = await page.evaluate((el) => {
		// Page name is usually a strong, span, or link near the top of the card
		const titleCandidate = el.querySelector('strong, h3, h4, a[role="link"] span');
		return titleCandidate ? titleCandidate.textContent?.trim() || null : null;
	}, cardHandle);

	const startedAtText = await page.evaluate((el) => {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let text = '';
		while (walker.nextNode()) {
			const t = walker.currentNode.nodeValue || '';
			if (t.includes('Ad started running on')) {
				text = t;
				break;
			}
		}
		return text;
	}, cardHandle);

	let startedAt = null;
	if (startedAtText) {
		// Expect formats like: "Ad started running on March 10, 2024"
		const m = startedAtText.match(/Ad started running on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
		if (m && m[1]) startedAt = new Date(m[1]).toISOString();
	}

	return { pageUrl, pageName, startedAt };
}


