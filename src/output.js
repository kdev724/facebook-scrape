import fs from 'node:fs/promises';
import path from 'node:path';
import { format } from '@fast-csv/format';

export async function writeCsvAndJson(rows, { outDir }) {
	await fs.mkdir(outDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

	const jsonPath = path.join(outDir, `results-${timestamp}.json`);
	await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2), 'utf8');

	const csvPath = path.join(outDir, `results-${timestamp}.csv`);
	await writeCsv(csvPath, rows);

	return { jsonPath, csvPath };
}

async function writeCsv(filePath, rows) {
	const ws = (await import('node:fs')).createWriteStream(filePath);
	const csvStream = format({ headers: true });
	csvStream.pipe(ws);
	for (const r of rows) {
		csvStream.write({
			CompanyName: r.companyName || '',
			Phone: r.contact?.phone || '',
			Email: r.contact?.email || '',
			Address: r.contact?.address || '',
			FacebookPageUrl: r.facebookPageUrl || '',
			MonthsRunning: r.monthsRunning ?? '',
			Followers: r.followers ?? '',
			KeywordsMatched: Array.isArray(r.keywordsMatched) ? r.keywordsMatched.join('; ') : '',
		});
	}
	csvStream.end();
}


