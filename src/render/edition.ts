import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Edition } from '../types.js';

export async function writeEdition(edition: Edition, editionsDir: string): Promise<string> {
  await mkdir(editionsDir, { recursive: true });
  const path = join(editionsDir, `${edition.date}.json`);
  await writeFile(path, JSON.stringify(edition, null, 2) + '\n', 'utf8');
  return path;
}
