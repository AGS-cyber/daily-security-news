import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadSent } from './sent.js';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'sent-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a missing ledger starts empty — nothing has been mailed yet', async () => {
  await withDir(async (dir) => {
    const sent = await loadSent(join(dir, 'sent.json'));
    assert.equal(sent.size, 0);
    assert.equal(sent.sentOn('2026-08-06'), undefined);
  });
});

test('a recorded date survives the disk round-trip and blocks a second send', async () => {
  await withDir(async (dir) => {
    const path = join(dir, 'sent.json');

    const first = await loadSent(path);
    first.record('2026-08-06', { sentAt: '2026-08-06T12:05:00.000Z', emailId: 'abc-123' });
    await first.save();

    // A second run — a dispatch, a retry, a cron double-fire — must see it.
    const second = await loadSent(path);
    const record = second.sentOn('2026-08-06');
    assert.equal(record?.emailId, 'abc-123');
    assert.equal(record?.sentAt, '2026-08-06T12:05:00.000Z');
    assert.equal(second.sentOn('2026-08-07'), undefined, 'a different date is unaffected');
  });
});

test('entries are written sorted, so the ledger diffs cleanly', async () => {
  await withDir(async (dir) => {
    const path = join(dir, 'sent.json');
    const sent = await loadSent(path);
    sent.record('2026-08-07', { sentAt: 'x', emailId: 'b' });
    sent.record('2026-08-05', { sentAt: 'x', emailId: 'a' });
    await sent.save();

    const text = await readFile(path, 'utf8');
    assert.ok(
      text.indexOf('2026-08-05') < text.indexOf('2026-08-07'),
      `entries were not sorted: ${text}`,
    );
  });
});

test('nothing is pruned — an aged-out entry would re-mail an old edition', async () => {
  await withDir(async (dir) => {
    const path = join(dir, 'sent.json');
    await writeFile(
      path,
      JSON.stringify({ '2020-01-01': { sentAt: '2020-01-01T00:00:00.000Z', emailId: 'old' } }),
      'utf8',
    );

    const sent = await loadSent(path);
    sent.record('2026-08-07', { sentAt: 'now', emailId: 'new' });
    await sent.save();

    const reloaded = await loadSent(path);
    assert.equal(reloaded.sentOn('2020-01-01')?.emailId, 'old');
    assert.equal(reloaded.size, 2);
  });
});

test('a malformed ledger throws rather than resetting to empty', async () => {
  await withDir(async (dir) => {
    const path = join(dir, 'sent.json');

    await writeFile(path, '{ not json', 'utf8');
    await assert.rejects(() => loadSent(path), /not valid JSON/);

    await writeFile(path, '["2026-08-06"]', 'utf8');
    await assert.rejects(() => loadSent(path), /JSON object of dates/);

    await writeFile(path, JSON.stringify({ '2026-08-06': { sentAt: 1 } }), 'utf8');
    await assert.rejects(() => loadSent(path), /needs string "sentAt" and "emailId"/);
  });
});
