import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalize } from './normalize.js';

test('strips tracking params but keeps meaningful ones', () => {
  assert.equal(
    canonicalize('https://example.com/post?id=7&utm_source=x&utm_medium=y&fbclid=z'),
    'https://example.com/post?id=7',
  );
});

test('strips the fragment', () => {
  assert.equal(canonicalize('https://example.com/post#section-2'), 'https://example.com/post');
});

test('lowercases the host and drops www.', () => {
  assert.equal(canonicalize('https://WWW.Example.COM/post'), 'https://example.com/post');
});

test('upgrades http: to https:', () => {
  assert.equal(canonicalize('http://example.com/post'), 'https://example.com/post');
});

test('strips a trailing slash but leaves the root path alone', () => {
  assert.equal(canonicalize('https://example.com/post/'), 'https://example.com/post');
  assert.equal(canonicalize('https://example.com/'), 'https://example.com/');
});

test('strips a trailing /amp/', () => {
  assert.equal(canonicalize('https://example.com/post/amp/'), 'https://example.com/post');
  assert.equal(canonicalize('https://example.com/post/amp'), 'https://example.com/post');
});

test('two URLs differing only in tracking params canonicalize equal', () => {
  assert.equal(
    canonicalize('https://example.com/post?utm_campaign=a&ref=twitter'),
    canonicalize('https://example.com/post?gclid=b'),
  );
});

test('throws on unparseable input', () => {
  assert.throws(() => canonicalize('not a url'));
});
