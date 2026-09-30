import { readFile } from 'node:fs/promises';
import { assertFreshPublication, verifyDeployment } from './publication.js';
const date = new Date().toISOString().slice(0, 10);
const record = JSON.parse(await readFile(`site/editions/${date}.json`, 'utf8'));
assertFreshPublication(record, date, new Date());
if (process.argv[2]) await verifyDeployment(process.argv[2], record);
console.log(`Verified ${date} ${record.generatedAt}`);
