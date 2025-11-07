import 'dotenv/config';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { scrapeAdvertisers } from './scraper.js';
import { writeCsvAndJson } from './output.js';

async function main() {
	const argv = yargs(hideBin(process.argv))
		.option('keywords', {
			type: 'string',
			demandOption: true,
			description: 'Comma-separated list of keywords to search (e.g., "home painter, Benjamin Moore")',
		})
		.option('country', {
			type: 'string',
			default: 'US',
			description: 'Country code for the Ads Library filter',
		})
		.option('minMonths', {
			type: 'number',
			default: 3,
			description: 'Minimum months the ad has been running',
		})
		.option('limit', {
			type: 'number',
			default: 100,
			description: 'Maximum number of ad cards to inspect per keyword',
		})
		.option('headless', {
			type: 'boolean',
			default: true,
			description: 'Run browser in headless mode',
		})
		.option('timeout', {
			type: 'number',
			default: 30000,
			description: 'Navigation and action timeout (ms)',
		})
		.option('out', {
			type: 'string',
			default: 'output',
			description: 'Output directory',
		})
		.strict()
		.help()
		.parse();

	const keywords = argv.keywords
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	const results = await scrapeAdvertisers({
		keywords,
		country: argv.country,
		minMonths: argv.minMonths,
		limitPerKeyword: argv.limit,
		headless: argv.headless,
		timeout: argv.timeout,
	});

	await writeCsvAndJson(results, { outDir: argv.out });

	console.log(`Finished. Found ${results.length} advertisers matching the criteria.`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});


