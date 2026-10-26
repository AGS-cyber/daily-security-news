import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { layout } from './render/html.js';

test('deployment CSP permits exactly the shipped script and retains all other restrictions', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const header = config.headers.find((entry: { source: string }) => entry.source === '/(.*)')
    ?.headers.find((entry: { key: string }) => entry.key === 'Content-Security-Policy')?.value;
  const html = layout({ title: 'Policy check', bodyHtml: '<p>Stored content</p>', generatedAt: '2026-10-25T12:00:00Z' });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const hash = `sha256-${createHash('sha256').update(scripts[0]![1]!).digest('base64')}`;
  const policy = `default-src 'none'; script-src '${hash}'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'`;
  assert.equal(header, `${policy}; frame-ancestors 'none'`, 'HTTP CSP must allow only the exact rendered script bytes');
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${policy}">`));
});
